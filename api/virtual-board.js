const { buildVirtualBoard, isMetroStop } = require('./virtual-board-service');

const SOFIA_TRAFFIC_BASE_URL = 'https://www.sofiatraffic.bg/bg/';
const VIRTUAL_TABLE_URL = `${SOFIA_TRAFFIC_BASE_URL}trip/getVirtualTable`;
const SESSION_CACHE_TTL_MS = 110 * 60 * 1000;
const STOP_CACHE_TTL_MS = 12000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_STOP_CACHE_ENTRIES = 128;

let sessionCache = null;
let sessionFetchPromise = null;
const stopCache = new Map();
const stopFetchPromises = new Map();

function getSetCookieHeaders(headers) {
  if (!headers) return [];

  if (typeof headers.getSetCookie === 'function') {
    const values = headers.getSetCookie();
    if (Array.isArray(values) && values.length) return values;
  }

  const combined = typeof headers.get === 'function'
    ? headers.get('set-cookie')
    : null;
  if (!combined) return [];

  // A combined Set-Cookie header can contain a comma in Expires. Split only
  // when the comma is followed by another cookie-name=value pair.
  return String(combined)
    .split(/,(?=\s*[^;,=\s]+\s*=)/g)
    .map(value => value.trim())
    .filter(Boolean);
}

function parseCookiePair(setCookieHeader) {
  const firstPart = String(setCookieHeader ?? '').split(';', 1)[0].trim();
  const separator = firstPart.indexOf('=');
  if (separator <= 0) return null;

  return {
    name: firstPart.slice(0, separator).trim(),
    value: firstPart.slice(separator + 1).trim(),
    pair: firstPart
  };
}

function decodeCookieValue(value) {
  try {
    // Match java.net.URLDecoder.decode() used by the Android interceptor.
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch (_) {
    return value;
  }
}

function buildSessionFromHeaders(headers) {
  const cookies = getSetCookieHeaders(headers)
    .map(parseCookiePair)
    .filter(Boolean);
  const sessionCookie = cookies.find(cookie => cookie.name.toLowerCase() === 'sofia_traffic_session');
  const xsrfCookie = cookies.find(cookie => cookie.name.toLowerCase() === 'xsrf-token');

  if (!sessionCookie || !xsrfCookie) {
    throw new Error('ЦГМ не върна необходимите session/XSRF cookies.');
  }

  return {
    cookieHeader: `${sessionCookie.pair}; ${xsrfCookie.pair}`,
    xsrfToken: decodeCookieValue(xsrfCookie.value),
    cachedAt: Date.now()
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'follow'
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSession() {
  const response = await fetchWithTimeout(
    SOFIA_TRAFFIC_BASE_URL,
    {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; GTSofiaVirtualBoards/1.0)'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`ЦГМ не успя да създаде сесия (HTTP ${response.status}).`);
  }

  return buildSessionFromHeaders(response.headers);
}

async function getSession(forceRefresh = false) {
  if (forceRefresh) sessionCache = null;

  if (sessionCache && Date.now() - sessionCache.cachedAt < SESSION_CACHE_TTL_MS) {
    return sessionCache;
  }

  if (sessionFetchPromise) return sessionFetchPromise;

  sessionFetchPromise = fetchSession()
    .then(session => {
      sessionCache = session;
      return session;
    })
    .finally(() => {
      sessionFetchPromise = null;
    });

  return sessionFetchPromise;
}

function normalizeStopCode(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw) && raw.length < 4) return raw.padStart(4, '0');
  return raw;
}

function normalizeVirtualTablePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(row => row && typeof row === 'object' && !Array.isArray(row));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('ЦГМ върна невалиден JSON отговор за виртуалното табло.');
  }

  // The Android client deserializes the endpoint as HashMap<String,
  // VirtualTableForStop>, so the normal response is an object keyed by ID.
  return Object.values(payload)
    .filter(row => row && typeof row === 'object' && !Array.isArray(row));
}

async function requestVirtualTable(stopCode) {
  const normalizedStopCode = normalizeStopCode(stopCode);

  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getSession(attempt > 0);
    const response = await fetchWithTimeout(
      VIRTUAL_TABLE_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': session.xsrfToken,
          Cookie: session.cookieHeader,
          Origin: 'https://www.sofiatraffic.bg',
          Referer: SOFIA_TRAFFIC_BASE_URL,
          'User-Agent': 'Mozilla/5.0 (compatible; GTSofiaVirtualBoards/1.0)'
        },
        body: JSON.stringify({ stop: normalizedStopCode })
      }
    );

    if ([401, 403, 419].includes(response.status) && attempt === 0) {
      sessionCache = null;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Виртуалното табло на ЦГМ върна HTTP ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error('ЦГМ върна отговор, който не е валиден JSON.');
    }

    return normalizeVirtualTablePayload(payload);
  }

  throw new Error('Сесията с ЦГМ изтече и не можа да бъде подновена.');
}

async function getVirtualTable(stopCode) {
  const normalizedStopCode = normalizeStopCode(stopCode);
  const now = Date.now();
  const cached = stopCache.get(normalizedStopCode);

  if (cached && now - cached.cachedAt < STOP_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (stopFetchPromises.has(normalizedStopCode)) {
    return stopFetchPromises.get(normalizedStopCode);
  }

  const request = requestVirtualTable(normalizedStopCode)
    .then(rows => {
      stopCache.set(normalizedStopCode, { rows, cachedAt: Date.now() });
      if (stopCache.size > MAX_STOP_CACHE_ENTRIES) {
        const oldestKey = stopCache.keys().next().value;
        stopCache.delete(oldestKey);
      }
      return rows;
    })
    .finally(() => {
      stopFetchPromises.delete(normalizedStopCode);
    });

  stopFetchPromises.set(normalizedStopCode, request);
  return request;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const stopCode = String(req.query?.stop_code || '').trim();
  if (!stopCode) {
    return res.status(400).json({ error: 'Missing stop_code.' });
  }

  let apiRows = [];
  let realtimeStatus = 'ok';

  if (isMetroStop(stopCode)) {
    realtimeStatus = 'not_applicable';
  } else {
    try {
      apiRows = await getVirtualTable(stopCode);
      realtimeStatus = apiRows.length ? 'ok' : 'empty';
    } catch (error) {
      // A temporary upstream/session failure must not take the board offline.
      // The service will return the static GTFS timetable for affected directions.
      realtimeStatus = 'unavailable';
      console.error('GTSofia virtual-table upstream request failed:', error?.message || error);
    }
  }

  const board = buildVirtualBoard(apiRows, stopCode);
  board.realtime_status = realtimeStatus;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json(board);
};

module.exports.__test = {
  getSetCookieHeaders,
  buildSessionFromHeaders,
  normalizeStopCode,
  normalizeVirtualTablePayload,
  requestVirtualTable,
  getVirtualTable,
  resetCaches() {
    sessionCache = null;
    sessionFetchPromise = null;
    stopCache.clear();
    stopFetchPromises.clear();
  }
};
