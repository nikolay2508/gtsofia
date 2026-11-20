const assert = require('node:assert/strict');
const { createDataContext } = require('../api/virtual-board-service');

const now = new Date('2026-11-20T08:00:00+02:00');
const epoch = value => Date.parse(`2026-11-20T${value}+02:00`) / 1000;

const fixture = {
  routes: [
    { route_id: 'BUS11', route_short_name: '11', route_type: '3', route_color: 'BE1E2D', route_text_color: 'FFFFFF' },
    { route_id: 'TRAM1', route_short_name: '1', route_type: '0', route_color: 'F7941D', route_text_color: 'FFFFFF' },
    { route_id: 'TROLLEY6', route_short_name: '6', route_type: '11', route_color: '27AAE1', route_text_color: 'FFFFFF' },
    { route_id: 'METRO1', route_short_name: 'M1', route_type: '1', route_color: '1C75BC', route_text_color: 'FFFFFF' }
  ],
  directions: {
    BUS11: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Крайна точка', destination: 'Крайна точка',
        pattern: ['0100', '0101', '0102'],
        stops: [
          { stop_id: '0100', osm_name: 'Начална спирка' },
          { stop_id: '0101', osm_name: 'Междинна спирка' },
          { stop_id: '0102', osm_name: 'OSM край' }
        ]
      },
      D2: {
        key: 'D2', direction_id: '1', headsign: 'Обратна крайна', destination: 'Обратна крайна',
        pattern: ['0100', '0103', '0104'],
        stops: [
          { stop_id: '0100', osm_name: 'Начална спирка' },
          { stop_id: '0103', osm_name: 'Друга междинна' },
          { stop_id: '0104', osm_name: 'OSM обратен край' }
        ]
      },
      D3: {
        key: 'D3', direction_id: '2', headsign: 'Крайна точка', destination: 'Крайна точка',
        pattern: ['0105', '0100', '0102'],
        stops: [
          { stop_id: '0105', osm_name: 'Алтернативно начало' },
          { stop_id: '0100', osm_name: 'Начална спирка' },
          { stop_id: '0102', osm_name: 'OSM край' }
        ]
      }
    },
    TRAM1: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Трамваен край', destination: 'Трамваен край',
        pattern: ['0200', '0201'],
        stops: [{ stop_id: '0200', osm_name: 'Трамвайна начална' }, { stop_id: '0201', osm_name: 'Трамваен OSM край' }]
      }
    },
    TROLLEY6: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Тролейбусен край', destination: 'Тролейбусен край',
        pattern: ['0300', '0301'],
        stops: [{ stop_id: '0300', osm_name: 'Тролейбусна начална' }, { stop_id: '0301', osm_name: 'Тролейбусен OSM край' }]
      }
    },
    METRO1: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Метростанция Б', destination: 'Метростанция Б',
        pattern: ['M1', 'M2'],
        stops: [{ stop_id: 'M1', osm_name: 'Метростанция А' }, { stop_id: 'M2', osm_name: 'Метростанция Б OSM' }]
      }
    }
  },
  schedules: {
    BUS11: {
      D1: { weekday: [
        {
          original_trip_id: 'BUS11-FULL', service_id: 'SERVICE', start_time: '08:10:00',
          times: ['08:10:00', '08:15:00', '08:20:00']
        },
        {
          original_trip_id: 'BUS11-SHORT', service_id: 'SERVICE', start_time: '08:12:00',
          times: ['08:12:00', '08:17:00', null]
        }
      ], weekend: [] },
      D2: { weekday: [{
        original_trip_id: 'BUS11-REVERSE', service_id: 'SERVICE', start_time: '08:11:00',
        times: ['08:11:00', '08:16:00', '08:21:00']
      }], weekend: [] },
      D3: { weekday: [{
        original_trip_id: 'BUS11-ALT-ORIGIN', service_id: 'SERVICE', start_time: '08:09:00',
        times: ['08:09:00', '08:10:00', '08:19:00']
      }], weekend: [] }
    },
    TRAM1: { D1: { weekday: [{
      original_trip_id: 'TRAM1-TRIP', service_id: 'SERVICE', start_time: '08:10:00',
      times: ['08:10:00', '08:18:00']
    }], weekend: [] } },
    TROLLEY6: { D1: { weekday: [{
      original_trip_id: 'TROLLEY6-TRIP', service_id: 'SERVICE', start_time: '08:10:00',
      times: ['08:10:00', '08:18:00']
    }], weekend: [] } },
    METRO1: { D1: { weekday: [{
      original_trip_id: 'METRO1-TRIP', service_id: 'SERVICE', start_time: '08:10:00',
      times: ['08:10:00', '08:18:00']
    }], weekend: [] } }
  },
  stops: [
    { stop_id: '0100', stop_code: '0100', stop_name: 'Начална', osm_stop_name: 'Начална спирка', stop_name_source: 'osm' },
    { stop_id: '0101', stop_code: '0101', stop_name: 'Междинна', osm_stop_name: 'Междинна спирка', stop_name_source: 'osm' },
    { stop_id: '0102', stop_code: '0102', stop_name: 'Крайна', osm_stop_name: 'OSM край', stop_name_source: 'osm' },
    { stop_id: '0103', stop_code: '0103', stop_name: 'Друга междинна', osm_stop_name: 'Друга междинна', stop_name_source: 'osm' },
    { stop_id: '0104', stop_code: '0104', stop_name: 'Обратен край', osm_stop_name: 'OSM обратен край', stop_name_source: 'osm' },
    { stop_id: '0105', stop_code: '0105', stop_name: 'Алтернативно начало', osm_stop_name: 'Алтернативно начало', stop_name_source: 'osm' },
    { stop_id: '0200', stop_code: '0200', stop_name: 'Трамвайна начална', osm_stop_name: 'Трамвайна начална', stop_name_source: 'osm' },
    { stop_id: '0201', stop_code: '0201', stop_name: 'Трамваен край', osm_stop_name: 'Трамваен OSM край', stop_name_source: 'osm' },
    { stop_id: '0300', stop_code: '0300', stop_name: 'Тролейбусна начална', osm_stop_name: 'Тролейбусна начална', stop_name_source: 'osm' },
    { stop_id: '0301', stop_code: '0301', stop_name: 'Тролейбусен край', osm_stop_name: 'Тролейбусен OSM край', stop_name_source: 'osm' },
    { stop_id: 'M1', stop_code: '1', stop_name: 'Метростанция А', osm_stop_name: 'Метростанция А', stop_name_source: 'osm' },
    { stop_id: 'M2', stop_code: '2', stop_name: 'Метростанция Б', osm_stop_name: 'Метростанция Б OSM', stop_name_source: 'osm' }
  ],
  calendar: {
    dateTypes: { '2026-11-20': 'weekday' },
    serviceIdsByDate: { '2026-11-20': ['SERVICE'] }
  }
};

const service = createDataContext(fixture);

// ЦГМ realtime has a ready-made route name. The service uses its final
// destination to identify the existing GTFS direction, then renders the OSM
// terminal label rather than the raw CGM text.
const realtimeBoard = service.buildBoard([{
  type: 1,
  name: '11',
  route_name: 'Начало - OSM край',
  details: [{ t: 8 }, { t: 3 }, { t: 12 }]
}], '0100', now);

const realtimeRoute = realtimeBoard.routes.find(route => route.route_id === 'BUS11' && route.realtime);
assert.ok(realtimeRoute, 'the ЦГМ bus realtime row should map to the matching GTFS direction');
assert.equal(realtimeRoute.destination, 'OSM край', 'OSM terminal names should take precedence over CGM/GTFS text');
assert.deepEqual(
  realtimeRoute.times.map(time => Math.round(time.timestamp)),
  [epoch('08:03:00'), epoch('08:08:00'), epoch('08:12:00')],
  'minutes from details[].t should become absolute arrival timestamps and be sorted'
);
assert.ok(realtimeRoute.times.every(time => time.scheduled === false && time.source === 'realtime'));
assert.ok(
  !realtimeBoard.routes.some(route => route.route_id === 'BUS11' && ['D1', 'D3'].includes(route.direction_key) && route.scheduled),
  'when a destination is shared by multiple GTFS patterns, realtime must suppress timetable fallback for all of them'
);
assert.ok(
  realtimeBoard.routes.some(route => route.route_id === 'BUS11' && route.direction_key === 'D2' && route.scheduled),
  'the opposite direction should still receive timetable fallback when it has no realtime data'
);

// No realtime data: preserve the old timetable fallback, including the
// short-turn terminal inferred from the last populated stop time.
const fallbackBoard = service.buildBoard([], '0100', now);
const fallbackBusRows = fallbackBoard.routes.filter(route => route.route_id === 'BUS11' && route.direction_key === 'D1');
assert.equal(fallbackBusRows.length, 2, 'full and scheduled short-turn journeys should remain separate even when a second full-pattern variant shares the terminal');
assert.ok(fallbackBusRows.some(route => route.terminal_stop_id === '0102' && route.destination === 'OSM край'));
assert.ok(fallbackBusRows.some(route => route.terminal_stop_id === '0101' && route.destination === 'Междинна спирка'));
assert.ok(fallbackBusRows.every(route => route.times[0].scheduled === true));

// API transport type mapping is based on the source's IDs: 2=tram, 4=trolley.
const tramRealtime = service.buildBoard([{
  type: 2,
  name: '1',
  route_name: 'Трамвайна начална - Трамваен OSM край',
  details: [{ t: 4 }]
}], '0200', now);
assert.ok(tramRealtime.routes.some(route => route.route_id === 'TRAM1' && route.realtime));

const trolleyRealtime = service.buildBoard([{
  type: 4,
  name: '6',
  route_name: 'Тролейбусна начална - Тролейбусен OSM край',
  details: [{ t: 5 }]
}], '0300', now);
assert.ok(trolleyRealtime.routes.some(route => route.route_id === 'TROLLEY6' && route.realtime));

// Metro never consumes the surface realtime source, even if a row is passed in.
const metroBoard = service.buildBoard([{
  type: 1,
  name: '11',
  route_name: 'Начало - OSM край',
  details: [{ t: 2 }]
}], '1', now);
assert.ok(metroBoard.routes.some(route => route.route_id === 'METRO1' && route.scheduled));
assert.ok(metroBoard.routes.every(route => !route.realtime));
assert.equal(metroBoard.realtime_status, 'not_applicable');

console.log('virtual-board-service: CGM realtime + GTFS fallback tests passed');
