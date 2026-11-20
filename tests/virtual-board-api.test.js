const assert = require('node:assert/strict');
const handler = require('../api/virtual-board.js');

const originalFetch = global.fetch;
const originalConsoleError = console.error;

function makeResponse({ ok = true, status = 200, headers = {}, json = null } = {}) {
  return {
    ok,
    status,
    headers,
    async json() { return json; }
  };
}

(async () => {
  try {
    handler.__test.resetCaches();
    const calls = [];

    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url) === 'https://www.sofiatraffic.bg/bg/') {
        return makeResponse({
          headers: {
            getSetCookie() {
              return [
                'sofia_traffic_session=session-abc; Path=/; HttpOnly; Secure',
                'XSRF-TOKEN=xsrf%20token%2Bvalue; Path=/; SameSite=Lax'
              ];
            }
          }
        });
      }

      if (String(url) === 'https://www.sofiatraffic.bg/bg/trip/getVirtualTable') {
        return makeResponse({
          json: {
            'row-1': {
              type: 1,
              name: '11',
              route_name: 'Автостанция Гео Милев - пл. Орлов мост',
              details: [{ t: 3 }, { t: 7 }]
            }
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const rows = await handler.__test.requestVirtualTable('60');
    assert.equal(calls.length, 2, 'the client should first open the site and then POST the virtual table request');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.body, JSON.stringify({ stop: '0060' }), 'numeric stop codes shorter than four characters should be padded');
    assert.equal(calls[1].options.headers.Cookie, 'sofia_traffic_session=session-abc; XSRF-TOKEN=xsrf%20token%2Bvalue');
    assert.equal(calls[1].options.headers['X-XSRF-TOKEN'], 'xsrf token+value', 'the XSRF header must use the URL-decoded token, matching Android URLDecoder behavior');
    assert.equal(rows.length, 1, 'the JSON object response should be converted to a list of rows');
    assert.equal(rows[0].route_name, 'Автостанция Гео Милев - пл. Орлов мост');

    // The same cached session should be reused for a subsequent stop query.
    await handler.__test.requestVirtualTable('0061');
    assert.equal(calls.length, 3, 'a valid session should avoid another landing-page request');
    assert.equal(calls[2].options.body, JSON.stringify({ stop: '0061' }));

    // When ЦГМ is unavailable, the API must still return the GTFS timetable
    // fallback rather than turning the entire virtual board into HTTP 502.
    handler.__test.resetCaches();
    global.fetch = async () => { throw new Error('simulated upstream outage'); };
    console.error = () => {};

    const req = { method: 'GET', query: { stop_code: '0605' } };
    let payload = null;
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { payload = value; return this; }
    };

    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.realtime_status, 'unavailable');
    assert.ok(Array.isArray(payload.routes), 'the board response should still contain a routes array for timetable fallback');
    assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');

    // Validate method and parameter errors remain explicit.
    const methodRes = {
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.payload = value; return this; }
    };
    await handler({ method: 'POST', query: {} }, methodRes);
    assert.equal(methodRes.statusCode, 405);

    const missingRes = {
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.payload = value; return this; }
    };
    await handler({ method: 'GET', query: {} }, missingRes);
    assert.equal(missingRes.statusCode, 400);

    console.log('virtual-board-api: ЦГМ JSON/session integration tests passed');
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    handler.__test.resetCaches();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
