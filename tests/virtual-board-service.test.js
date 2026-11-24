const assert = require('node:assert/strict');
const { createDataContext, normalizeApiLineName } = require('../api/virtual-board-service');
const { getRouteMetadata } = require('../assets/js/route-metadata');
const routesData = require('../data/routes.json');
const directionsData = require('../data/directions.json');

const now = new Date('2026-11-20T08:00:00+02:00');
const epoch = value => Date.parse(`2026-11-20T${value}+02:00`) / 1000;


// CGM returns X-series line names with a Cyrillic Х, while GTFS stores the
// public route_short_name with a Latin X. They must normalize identically.
for (const lineNumber of ['9', '10', '43']) {
  assert.equal(
    normalizeApiLineName(`X${lineNumber}`),
    normalizeApiLineName(`Х${lineNumber}`),
    `Latin X and Cyrillic Х should match for line X${lineNumber}`
  );
}

// CGM returns the University lines with Latin Y, while GTFS uses Cyrillic У.
for (const lineNumber of ['1', '2']) {
  assert.equal(
    normalizeApiLineName(`Y${lineNumber}`),
    normalizeApiLineName(`У${lineNumber}`),
    `Latin Y and Cyrillic У should match for line У${lineNumber}`
  );
}

const fixture = {
  routes: [
    { route_id: 'BUS11', route_short_name: '11', route_type: '3', route_color: 'BE1E2D', route_text_color: 'FFFFFF' },
    { route_id: 'TRAM1', route_short_name: '1', route_type: '0', route_color: 'F7941D', route_text_color: 'FFFFFF' },
    { route_id: 'TROLLEY6', route_short_name: '6', route_type: '11', route_color: '27AAE1', route_text_color: 'FFFFFF' },
    { route_id: 'BUS60', route_short_name: '60', route_type: '11', route_color: '27AAE1', route_text_color: 'FFFFFF' },
    { route_id: 'E186', route_short_name: 'E186', route_type: '11', route_color: '27AAE1', route_text_color: 'FFFFFF' },
    { route_id: 'METRO1', route_short_name: 'M1', route_type: '1', route_color: '1C75BC', route_text_color: 'FFFFFF' }
  ],
  directions: {
    BUS11: {
      D1: {
        key: 'D1', direction_id: '0', shape_id: 'BUS11-SHAPE-D1', headsign: 'Крайна точка', destination: 'Крайна точка',
        pattern: ['0100', '0101', '0102'],
        stops: [
          { stop_id: '0100', osm_name: 'Начална спирка' },
          { stop_id: '0101', osm_name: 'Междинна спирка' },
          { stop_id: '0102', osm_name: 'OSM край' }
        ]
      },
      D2: {
        key: 'D2', direction_id: '1', shape_id: 'BUS11-SHAPE-D2', headsign: 'Обратна крайна', destination: 'Обратна крайна',
        pattern: ['0100', '0103', '0104'],
        stops: [
          { stop_id: '0100', osm_name: 'Начална спирка' },
          { stop_id: '0103', osm_name: 'Друга междинна' },
          { stop_id: '0104', osm_name: 'OSM обратен край' }
        ]
      },
      D3: {
        key: 'D3', direction_id: '2', shape_id: 'BUS11-SHAPE-D3', headsign: 'Крайна точка', destination: 'Крайна точка',
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
    BUS60: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Пълна крайна спирка 60', destination: 'Пълна крайна спирка 60',
        pattern: ['0400', '0401', '0402', '0403'],
        stops: [
          { stop_id: '0400', osm_name: 'Начална спирка 60' },
          { stop_id: '0401', osm_name: 'Междинна спирка 60' },
          { stop_id: '0402', osm_name: 'Частична крайна спирка 60' },
          { stop_id: '0403', osm_name: 'Пълна крайна спирка 60' }
        ]
      }
    },
    E186: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Крайна спирка 186', destination: 'Крайна спирка 186',
        pattern: ['0500', '0501'],
        stops: [
          { stop_id: '0500', osm_name: 'Начална спирка 186' },
          { stop_id: '0501', osm_name: 'Крайна спирка 186' }
        ]
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
    BUS60: { D1: { weekday: [], weekend: [] } },
    E186: { D1: { weekday: [], weekend: [] } },
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
    { stop_id: '0400', stop_code: '0400', stop_name: 'Начална спирка 60', osm_stop_name: 'Начална спирка 60', stop_name_source: 'osm' },
    { stop_id: '0401', stop_code: '0401', stop_name: 'Междинна спирка 60', osm_stop_name: 'Междинна спирка 60', stop_name_source: 'osm' },
    { stop_id: '0402', stop_code: '0402', stop_name: 'Частична крайна спирка 60', osm_stop_name: 'Частична крайна спирка 60', stop_name_source: 'osm' },
    { stop_id: '0403', stop_code: '0403', stop_name: 'Пълна крайна спирка 60', osm_stop_name: 'Пълна крайна спирка 60', stop_name_source: 'osm' },
    { stop_id: '0500', stop_code: '0500', stop_name: 'Начална спирка 186', osm_stop_name: 'Начална спирка 186', stop_name_source: 'osm' },
    { stop_id: '0501', stop_code: '0501', stop_name: 'Крайна спирка 186', osm_stop_name: 'Крайна спирка 186', stop_name_source: 'osm' },
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

// Exact CGM identifiers take priority over ambiguous route_name text. This
// fixture deliberately makes D1 and D2 share the same route-name destination;
// route_ext_id -> shape_id plus last_stop must still select only D2.
const identifiedDirectionBoard = service.buildBoard([{
  type: 1,
  name: '11',
  route_name: 'Начало - Крайна точка',
  route_ext_id: 'BUS11-SHAPE-D2',
  last_stop: '0104',
  details: [{ t: 9 }]
}], '0100', now);
const identifiedDirection = identifiedDirectionBoard.routes.find(route => route.route_id === 'BUS11' && route.realtime);
assert.ok(identifiedDirection, 'route_ext_id and last_stop should resolve a direction even when route_name is ambiguous');
assert.equal(identifiedDirection.direction_key, 'D2', 'route_ext_id should select the matching GTFS shape');
assert.equal(identifiedDirection.terminal_stop_id, '0104', 'last_stop should identify the actual terminal stop');
assert.ok(
  identifiedDirectionBoard.routes.some(route => route.route_id === 'BUS11' && route.direction_key === 'D1' && route.scheduled),
  'a different direction with the same public destination must retain its own fallback when not identified by the API row'
);
assert.ok(
  !identifiedDirectionBoard.routes.some(route => route.route_id === 'BUS11' && route.direction_key === 'D2' && route.scheduled),
  'fallback must be suppressed only for the exact direction identified by route_ext_id'
);

// No realtime data: preserve the old timetable fallback, including the
// short-turn terminal inferred from the last populated stop time.
const fallbackBoard = service.buildBoard([], '0100', now);
const fallbackBusRows = fallbackBoard.routes.filter(route => route.route_id === 'BUS11' && route.direction_key === 'D1');
assert.equal(fallbackBusRows.length, 2, 'full and scheduled short-turn journeys should remain separate even when a second full-pattern variant shares the terminal');
assert.ok(fallbackBusRows.some(route => route.terminal_stop_id === '0102' && route.destination === 'OSM край'));
assert.ok(fallbackBusRows.some(route => route.terminal_stop_id === '0101' && route.destination === 'Междинна спирка'));
assert.ok(fallbackBusRows.every(route => route.times[0].scheduled === true));

// A timetable course must not be listed at its own actual terminal. This
// includes short-turn courses whose final populated stop_time is intermediate
// in the full route pattern.
const fallbackAtShortTurnTerminal = service.buildBoard([], '0101', now);
assert.ok(
  !fallbackAtShortTurnTerminal.routes.some(route => route.route_id === 'BUS11' && route.terminal_stop_id === '0101'),
  'the short-turn fallback course should be hidden at its own terminal stop'
);
assert.ok(
  fallbackAtShortTurnTerminal.routes.some(route => route.route_id === 'BUS11' && route.terminal_stop_id === '0102'),
  'the full course should remain visible at the same stop when it continues beyond it'
);

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

// GTFS route_type=11 can still be displayed as a bus by GTSofia's shared
// route-metadata rules. The ЦГМ API reports these rows as type=1 (bus), so
// realtime matching must use the normalized public type rather than raw GTFS.
const replacementBusRealtime = service.buildBoard([{
  type: 1,
  name: '60',
  route_name: 'Начална спирка 60 - Частична крайна спирка 60',
  details: [{ t: 6 }]
}], '0400', now);
const replacementBusRow = replacementBusRealtime.routes.find(route => route.route_id === 'BUS60' && route.realtime);
assert.ok(replacementBusRow, 'a GTFS trolleybus record classified as a bus must match a ЦГМ bus realtime row');
assert.equal(replacementBusRow.terminal_stop_id, '0402', 'realtime should resolve the actual partial-course terminal, not the full route terminal');
assert.equal(replacementBusRow.destination, 'Частична крайна спирка 60', 'partial-course destination should use its OSM stop name');

const realtimeAtPartialTerminal = service.buildBoard([{
  type: 1,
  name: '60',
  route_name: 'Начална спирка 60 - Частична крайна спирка 60',
  details: [{ t: 6 }]
}], '0402', now);
assert.ok(
  !realtimeAtPartialTerminal.routes.some(route => route.route_id === 'BUS60' && route.realtime),
  'a realtime partial-course arrival must be hidden when the selected stop is that course terminal'
);

// The E-prefix normalization used for display (E186 -> 186) must also be used
// for realtime line matching.
const e186Realtime = service.buildBoard([{
  type: 1,
  name: '186',
  route_name: 'Начална спирка 186 - Крайна спирка 186',
  details: [{ t: 7 }]
}], '0500', now);
assert.ok(e186Realtime.routes.some(route => route.route_id === 'E186' && route.realtime), 'ЦГМ line 186 must match the GTFS route ref E186');

// Regression coverage against the current GTFS snapshot: these routes are
// raw GTFS trolleybus types but are public/display bus services in GTSofia.
const liveService = createDataContext();
for (const routeId of ['TB35', 'TB39', 'TB36', 'TB24', 'TB46', 'TB43', 'TB41']) {
  const route = routesData.find(item => item.route_id === routeId);
  assert.ok(route, `expected GTFS route ${routeId} to exist`);
  const metadata = getRouteMetadata(route);
  const directionEntry = Object.entries(directionsData[routeId] || {})[0];
  assert.ok(directionEntry, `expected GTFS direction for ${routeId}`);
  const [directionKey, direction] = directionEntry;
  const pattern = direction.pattern || [];
  const originStopId = String(pattern[0] || '');
  const terminalStopId = String(pattern[pattern.length - 1] || '');
  const origin = direction.stops?.find(stop => String(stop.stop_id) === originStopId);
  const terminal = direction.stops?.find(stop => String(stop.stop_id) === terminalStopId);
  assert.ok(origin?.osm_name && terminal?.osm_name, `expected OSM origin and terminal aliases for ${routeId}`);

  const board = liveService.buildBoard([{
    type: 1,
    name: metadata.number,
    route_name: `${origin.osm_name} - ${terminal.osm_name}`,
    details: [{ t: 5 }]
  }], originStopId, now);
  assert.ok(
    board.routes.some(item => item.route_id === routeId && item.direction_key === directionKey && item.realtime),
    `${metadata.number} should resolve realtime as a bus even though its raw GTFS route_type is 11`
  );
}

// Real GTFS regression for route 59: CGM's route_ext_id A3461 maps to
// direction D3 (regular course, terminal 0361), while A4086 maps to D2
// (depot-bound course, terminal 0813). The shared route_name must not merge
// these directions or cause the realtime row to be dropped.
const bus59RealtimeRow = {
  type: 1,
  name: '59',
  route_name: 'С. МЪРЧАЕВО-ТОЛУМСКА МАХАЛА - МЕТРОСТАНЦИЯ МИЗИЯ',
  route_ext_id: 'A3461',
  last_stop: 'A0361',
  details: [{ t: 11 }]
};
const bus59Board = liveService.buildBoard([bus59RealtimeRow], '1566', now);
const bus59Realtime = bus59Board.routes.find(route => route.route_id === 'A105' && route.realtime);
assert.ok(bus59Realtime, 'bus 59 regular course should resolve from the CGM route identifiers');
assert.equal(bus59Realtime.direction_key, 'D3', 'A3461 must resolve to the regular-course GTFS direction D3');
assert.equal(bus59Realtime.terminal_stop_id, '0361', 'A0361 must resolve to the physical regular-course terminal');
assert.equal(bus59Realtime.destination, 'пл. Мизия', 'bus 59 destination must retain the OSM terminal name');
assert.ok(
  !bus59Board.routes.some(route => route.route_id === 'A105' && route.direction_key === 'D3' && route.scheduled),
  'the exact D3 fallback must be suppressed once CGM realtime has matched it'
);

const bus59DepotBoard = liveService.buildBoard([{
  ...bus59RealtimeRow,
  route_ext_id: 'A4086',
  last_stop: 'A0813'
}], '1566', now);
const bus59DepotRealtime = bus59DepotBoard.routes.find(route => route.route_id === 'A105' && route.realtime);
assert.ok(bus59DepotRealtime, 'bus 59 depot-bound course should also resolve from its own CGM identifiers');
assert.equal(bus59DepotRealtime.direction_key, 'D2', 'A4086 must resolve to the depot-bound GTFS direction D2');
assert.equal(bus59DepotRealtime.terminal_stop_id, '0813', 'A0813 must resolve to the depot-side terminal');
assert.ok(
  bus59DepotBoard.routes.some(route => route.route_id === 'A105' && route.direction_key === 'D3' && route.scheduled),
  'the regular-course fallback must remain when only the depot-bound course has realtime'
);
assert.ok(
  !bus59DepotBoard.routes.some(route => route.route_id === 'A105' && route.direction_key === 'D2' && route.scheduled),
  'the depot-bound fallback must be suppressed only when its exact shape has realtime'
);

const bus59AtRegularTerminal = liveService.buildBoard([bus59RealtimeRow], '0361', now);
assert.ok(
  !bus59AtRegularTerminal.routes.some(route => route.route_id === 'A105' && route.realtime),
  'bus 59 must not be shown as arriving at the regular-course terminal itself'
);

// Real GTFS regression for X9: GTFS stores the line as Latin X9, while
// the CGM virtual-table API returns the Cyrillic spelling Х9. Exact route_ext_id
// and last_stop values must still resolve both GTFS directions.
const x9DirectionTowardBalan = liveService.buildBoard([{
  type: 1,
  name: 'Х9',
  route_name: 'Ж.К. ЛОЗЕНЕЦ - МЕТРОСТАНЦИЯ АКАД. А. Т.- БАЛАН',
  route_ext_id: 'A3660',
  last_stop: 'A2752',
  details: [{ t: 8 }]
}], '1345', now);
const x9BalanRealtime = x9DirectionTowardBalan.routes.find(route => route.route_id === 'A252' && route.realtime);
assert.ok(x9BalanRealtime, 'CGM line name Х9 must match GTFS route X9 toward metro station Balan');
assert.equal(x9BalanRealtime.direction_key, 'D2', 'route_ext_id A3660 must resolve X9 direction D2');
assert.equal(x9BalanRealtime.terminal_stop_id, '2752', 'last_stop A2752 must resolve the Balan terminal');

const x9DirectionTowardLozenets = liveService.buildBoard([{
  type: 1,
  name: 'Х9',
  route_name: 'МЕТРОСТАНЦИЯ АКАД. А. Т.- БАЛАН - Ж.К. ЛОЗЕНЕЦ',
  route_ext_id: 'A3647',
  last_stop: 'A0648',
  details: [{ t: 8 }]
}], '2752', now);
const x9LozenetsRealtime = x9DirectionTowardLozenets.routes.find(route => route.route_id === 'A252' && route.realtime);
assert.ok(x9LozenetsRealtime, 'CGM line name Х9 must match GTFS route X9 toward Lozenets');
assert.equal(x9LozenetsRealtime.direction_key, 'D1', 'route_ext_id A3647 must resolve X9 direction D1');
assert.equal(x9LozenetsRealtime.terminal_stop_id, '0648', 'last_stop A0648 must resolve the Lozenets terminal');

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
