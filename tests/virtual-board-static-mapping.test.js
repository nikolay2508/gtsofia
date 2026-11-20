const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// The uploaded project archive does not include generated data/*.json files.
// Stub only the module-level defaults; each test below supplies its own data.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === path.join(__dirname, '..', 'api', 'virtual-board-service.js')) {
    if (request === '../data/routes.json') return [];
    if (request === '../data/directions.json') return {};
    if (request === '../data/schedules.json') return {};
    if (request === '../data/stops.json') return [];
    if (request === '../data/calendar.json') return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { createDataContext } = require('../api/virtual-board-service');
Module._load = originalLoad;

const now = new Date('2026-10-30T12:00:00+02:00');
const epoch = value => Date.parse(`2026-10-30T${value}+02:00`) / 1000;

const fixture = {
  routes: [
    { route_id: 'TRAM22', route_short_name: '22', route_type: '0', route_color: 'BE1E2D', route_text_color: 'FFFFFF' },
    { route_id: 'TRAM1', route_short_name: '1', route_type: '0', route_color: 'BE1E2D', route_text_color: 'FFFFFF' }
  ],
  directions: {
    TRAM22: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Автостанция Изток', destination: 'Автостанция Изток',
        pattern: ['0633', '2086', '0470', '0472', '2023'],
        stops: [
          { stop_id: '0633', osm_name: 'Спирка 0633' },
          { stop_id: '2086', osm_name: 'Спирка 2086' },
          { stop_id: '0470', osm_name: 'Спирка 0470' },
          { stop_id: '0472', osm_name: 'Спирка 0472' },
          { stop_id: '2023', osm_name: 'Автостанция Изток' }
        ]
      },
      D2: {
        key: 'D2', direction_id: '1', headsign: 'Обратна посока', destination: 'Обратна посока',
        pattern: ['9001', '9002'],
        stops: [
          { stop_id: '9001', osm_name: 'Друга начална' },
          { stop_id: '9002', osm_name: 'Друга крайна' }
        ]
      }
    },
    TRAM1: {
      D1: {
        key: 'D1', direction_id: '0', headsign: 'Пълна крайна', destination: 'Пълна крайна',
        pattern: ['1001', '1002', '1003'],
        stops: [
          { stop_id: '1001', osm_name: 'Начална спирка' },
          { stop_id: '1002', osm_name: 'пл. Македония' },
          { stop_id: '1003', osm_name: 'Пълна крайна' }
        ]
      }
    }
  },
  schedules: {
    TRAM22: {
      D1: {
        weekday: [
          {
            original_trip_id: 'STATIC-22-FULL', service_id: 'SERVICE', start_time: '12:15:00',
            stop_sequences: [10, 20, 30, 40, 50],
            times: ['12:15:00', '12:25:00', '12:35:00', '12:40:00', '12:50:00']
          },
          {
            original_trip_id: 'STATIC-22-SHORT', service_id: 'SERVICE', start_time: '12:25:00',
            stop_sequences: [10, 20, 30, 40, 50],
            times: ['12:25:00', '12:35:00', '12:45:00', null, null]
          }
        ],
        weekend: []
      },
      D2: {
        weekday: [{
          original_trip_id: 'STATIC-22-OPPOSITE', service_id: 'SERVICE', start_time: '12:15:00',
          stop_sequences: [1, 2], times: ['12:15:00', '12:40:00']
        }],
        weekend: []
      }
    },
    TRAM1: {
      D1: {
        weekday: [{
          original_trip_id: 'STATIC-1-SHORT', service_id: 'SERVICE', start_time: '12:50:00',
          stop_sequences: [1, 2, 3], times: ['12:50:00', '13:05:00', null]
        }],
        weekend: []
      }
    }
  },
  stops: [
    ...['0633', '2086', '0470', '0472', '2023', '9001', '9002', '1001', '1002', '1003'].map(stopId => ({
      stop_id: stopId,
      stop_code: stopId,
      stop_name: `Stop ${stopId}`,
      osm_stop_name: ({ '2023': 'Автостанция Изток', '1002': 'пл. Македония' })[stopId] || `Спирка ${stopId}`,
      stop_name_source: 'osm'
    }))
  ],
  calendar: {
    dateTypes: { '2026-10-30': 'weekday' },
    serviceIdsByDate: { '2026-10-30': ['SERVICE'] }
  }
};

const service = createDataContext(fixture);

// Unknown producer Trip ID + exact start time + selected stop uniquely map to
// the full static course, even though the raw realtime terminal is 0470.
const mappedFullTrip = service.buildBoard({
  routes: [{
    route_id: 'TRAM22',
    trip_id: 'PRODUCER-TRIP-ID-22',
    trip_start_date: '20261030',
    trip_start_time: '12:15:00',
    schedule_relationship: 0,
    schedule_relationship_name: 'SCHEDULED',
    destination_stop_id: '0470',
    times: [{ timestamp: epoch('12:27:00'), scheduled_time: epoch('12:25:00'), delay: 120 }]
  }],
  realtime_trips: [],
  skipped_trips: []
}, '2086', now);
const fullTrip = mappedFullTrip.routes.find(route => route.route_id === 'TRAM22' && route.realtime);
assert.ok(fullTrip, 'the realtime course should be retained');
assert.equal(fullTrip.terminal_stop_id, '2023', 'an incomplete RT stop list must not replace the known GTFS terminal');
assert.equal(fullTrip.destination, 'Автостанция Изток');
assert.ok(fullTrip.matched_static_trip_id === 'STATIC-22-FULL');
assert.ok(
  !mappedFullTrip.routes.flatMap(route => route.times).some(time => time.scheduled && time.timestamp === epoch('12:25:00')),
  'the matched static fallback course must not be duplicated beside its realtime prediction'
);

// The same route/start-time is present in the opposite direction. Stop 2086
// makes the direction unambiguous; without stop-aware matching this lookup
// would be rejected as ambiguous.
const inferredAtIntermediateStop = service.buildBoard({
  routes: [],
  realtime_trips: [{
    trip_id: 'PRODUCER-TRIP-ID-22',
    route_id: 'TRAM22',
    trip_start_date: '20261030',
    trip_start_time: '12:15:00',
    schedule_relationship: 0,
    stop_time_updates: [{
      stop_sequence: 10,
      schedule_relationship: 0,
      departure: {
        timestamp: epoch('12:17:00'),
        scheduled_time: epoch('12:15:00'),
        delay: 120
      }
    }]
  }],
  skipped_trips: []
}, '2086', now);
const inferredFullTrip = inferredAtIntermediateStop.routes.find(route =>
  route.route_id === 'TRAM22' && route.realtime && route.trip_id === 'PRODUCER-TRIP-ID-22'
);
assert.ok(inferredFullTrip, 'a prior StopTimeUpdate should provide an inferred prediction at a downstream stop');
assert.equal(inferredFullTrip.terminal_stop_id, '2023');
assert.ok(inferredFullTrip.times.some(time => Math.round(time.timestamp) === epoch('12:27:00')));

// A partial update may identify its stop by stop_id alone. The downstream
// prediction should still be inferred from the scheduled travel time.
const inferredByStopId = service.buildBoard({
  routes: [],
  realtime_trips: [{
    trip_id: 'PRODUCER-TRIP-ID-22',
    route_id: 'TRAM22',
    trip_start_date: '20261030',
    trip_start_time: '12:15:00',
    schedule_relationship: 0,
    stop_time_updates: [{
      stop_id: '0633',
      departure: { timestamp: epoch('12:17:00') }
    }]
  }],
  skipped_trips: []
}, '2086', now);
const stopIdOnlyTrip = inferredByStopId.routes.find(route =>
  route.route_id === 'TRAM22' && route.realtime && route.trip_id === 'PRODUCER-TRIP-ID-22'
);
assert.ok(stopIdOnlyTrip, 'a stop_id-only partial update should be recognized');
assert.ok(stopIdOnlyTrip.times.some(time => Math.round(time.timestamp) === epoch('12:27:00')));

// When a producer includes both identifiers but its stop_sequence disagrees
// with the unique stop_id, the explicit stop_id is the safer mapping. This
// prevents a shifted sequence from attaching the delay to the wrong stop.
const inferredDespiteSequenceMismatch = service.buildBoard({
  routes: [],
  realtime_trips: [{
    trip_id: 'PRODUCER-TRIP-ID-22',
    route_id: 'TRAM22',
    trip_start_date: '20261030',
    trip_start_time: '12:15:00',
    schedule_relationship: 0,
    stop_time_updates: [{
      stop_id: '0633',
      stop_sequence: 20,
      departure: { timestamp: epoch('12:17:00') }
    }]
  }],
  skipped_trips: []
}, '2086', now);
const sequenceMismatchTrip = inferredDespiteSequenceMismatch.routes.find(route =>
  route.route_id === 'TRAM22' && route.realtime && route.trip_id === 'PRODUCER-TRIP-ID-22'
);
assert.ok(sequenceMismatchTrip, 'a unique stop_id should recover a mismatched stop_sequence');
assert.ok(sequenceMismatchTrip.times.some(time => Math.round(time.timestamp) === epoch('12:27:00')));

// NO_DATA is an explicit boundary: an earlier prediction must not be carried
// through the following stops until another timed update appears.
const noDataBoundary = service.buildBoard({
  routes: [],
  realtime_trips: [{
    trip_id: 'PRODUCER-TRIP-ID-22',
    route_id: 'TRAM22',
    trip_start_date: '20261030',
    trip_start_time: '12:15:00',
    schedule_relationship: 0,
    stop_time_updates: [
      { stop_id: '0633', departure: { timestamp: epoch('12:17:00') } },
      { stop_id: '2086', schedule_relationship: 2 }
    ]
  }],
  skipped_trips: []
}, '2086', now);
const noDataRows = noDataBoundary.routes.filter(route => route.route_id === 'TRAM22');
assert.ok(noDataRows.some(route => route.times.some(time => time.scheduled && Math.round(time.timestamp) === epoch('12:25:00'))));
assert.ok(!noDataRows.some(route => route.realtime && route.times.some(time => Math.round(time.timestamp) === epoch('12:27:00'))));

// If a SCHEDULED descriptor cannot be mapped to a static trip by its ID/time,
// the last StopTimeUpdate is still not a valid terminal. Use the complete
// direction pattern instead of exposing a phantom short-turn to 0470.
const unmatchedScheduledTrip = service.buildBoard({
  routes: [{
    route_id: 'TRAM22',
    trip_id: 'UNMATCHED-PRODUCER-TRIP',
    trip_start_date: '20261030',
    trip_start_time: '12:18:00',
    direction_id: '0',
    schedule_relationship: 0,
    schedule_relationship_name: 'SCHEDULED',
    destination_stop_id: '0470',
    times: [{ timestamp: epoch('12:30:00') }]
  }],
  realtime_trips: [],
  skipped_trips: []
}, '2086', now);
const unmatchedTrip = unmatchedScheduledTrip.routes.find(route => route.route_id === 'TRAM22' && route.realtime);
assert.ok(unmatchedTrip, 'a direct realtime prediction should remain visible even when its trip ID cannot be mapped');
assert.equal(unmatchedTrip.terminal_stop_id, '2023', 'a sparse scheduled update must not redefine the course terminal');

// A genuine short-turn remains short: the mapped static course itself ends at
// the intermediate stop 0470, so the improved matching must preserve that.
const mappedShortTrip = service.buildBoard({
  routes: [{
    route_id: 'TRAM22',
    trip_id: 'PRODUCER-SHORT-22',
    trip_start_date: '20261030',
    trip_start_time: '12:25:00',
    schedule_relationship: 0,
    schedule_relationship_name: 'SCHEDULED',
    destination_stop_id: '2023',
    times: [{ timestamp: epoch('12:37:00'), scheduled_time: epoch('12:35:00'), delay: 120 }]
  }],
  realtime_trips: [],
  skipped_trips: []
}, '2086', now);
const shortTrip = mappedShortTrip.routes.find(route => route.route_id === 'TRAM22' && route.realtime);
assert.ok(shortTrip, 'the genuine short-turn realtime course should be retained');
assert.equal(shortTrip.terminal_stop_id, '0470');
assert.equal(shortTrip.destination, 'Спирка 0470');

// Tram 1's legitimate short-turn to pl. Macedonia must also stay a short turn.
const tramOneShortTurn = service.buildBoard({
  routes: [{
    route_id: 'TRAM1',
    trip_id: 'PRODUCER-TRIP-ID-1',
    trip_start_date: '20261030',
    trip_start_time: '12:50:00',
    schedule_relationship: 0,
    schedule_relationship_name: 'SCHEDULED',
    destination_stop_id: '1003',
    times: [{ timestamp: epoch('13:02:00'), scheduled_time: epoch('13:00:00'), delay: 120 }]
  }],
  realtime_trips: [],
  skipped_trips: []
}, '1001', now);
const tramOne = tramOneShortTurn.routes.find(route => route.route_id === 'TRAM1' && route.realtime);
assert.ok(tramOne, 'tram 1 short-turn realtime should be retained');
assert.equal(tramOne.terminal_stop_id, '1002');
assert.equal(tramOne.destination, 'пл. Македония');

console.log('virtual-board-static-mapping: all tests passed');
