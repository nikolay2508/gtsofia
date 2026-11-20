const routesData = require('../data/routes.json');
const directionsData = require('../data/directions.json');
const schedulesData = require('../data/schedules.json');
const stopsData = require('../data/stops.json');
const calendarData = require('../data/calendar.json');
const { getRouteMetadata } = require('../assets/js/route-metadata');
const { buildStopIndexes, findPreferredStop } = require('../assets/js/stop-utils');

const SOFIA_TIME_ZONE = 'Europe/Sofia';
const MAX_ARRIVALS_PER_LINE = 3;
const MAX_STATIC_LOOKAHEAD_SECONDS = 2 * 60 * 60;
const MAX_REALTIME_LOOKAHEAD_SECONDS = 4 * 60 * 60;

// Values are the line-type IDs returned by ЦГМ's virtual-table endpoint.
// Match them against GTSofia's already-normalized public transport types, not
// the raw GTFS route_type: some GTFS trolleybus records (e.g. 60, 73, 74,
// 123, 186, 288 and 801) are intentionally displayed as replacement buses.
// The Android client maps 1 -> bus, 2 -> tram and 4 -> trolleybus.
const API_TYPE_TO_DISPLAY_TYPES = Object.freeze({
  '1': 'bus',
  '2': 'tram',
  '4': 'trolley',
  // Retain compatibility with night-bus rows if ЦГМ supplies this type.
  '5': 'bus'
});

function normalizeStopKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const withoutMetroPrefix = raw.replace(/^M/i, '');
  const digits = withoutMetroPrefix.replace(/\D/g, '');
  return digits ? String(Number(digits)) : withoutMetroPrefix.toLowerCase();
}

function stopIdsMatch(left, right) {
  const a = normalizeStopKey(left);
  return !!a && a === normalizeStopKey(right);
}

function normalizeDirectionText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('bg-BG')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[.]/g, '')
    .trim();
}

// Match the equivalence rules used by the Android app's Line.equals():
// hyphens are ignored, Latin TM is equivalent to Cyrillic ТМ, and Latin E is
// equivalent to Cyrillic Е. A terminal Т is deliberately NOT expanded to ТМ.
function normalizeApiLineName(value) {
  // Match the Android Line.equals() rules: ignore hyphens, unify Latin TM/E
  // with Cyrillic spellings, but keep a terminal T distinct from TM. The
  // leading E in refs such as E186 is a legacy display prefix and is omitted
  // from the public number returned by the virtual-table API.
  return String(value ?? '')
    .trim()
    .toLocaleUpperCase('bg-BG')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/^[ЕE](?=\d)/, '')
    .replace(/TM/g, 'ТМ')
    .replace(/E/g, 'Е');
}

function getRouteNamePairs(routeName) {
  const value = String(routeName ?? '').trim();
  if (!value) return [];

  // Try each spaced dash as the origin/destination separator. This preserves
  // terminal names that themselves contain a spaced dash, such as
  // "кв. Манастирски ливади - запад".
  const pairs = [];
  const separator = /\s+[-–—]\s+/g;
  let match;
  while ((match = separator.exec(value)) !== null) {
    const origin = value.slice(0, match.index).trim();
    const destination = value.slice(match.index + match[0].length).trim();
    if (origin && destination) pairs.push({ origin, destination });
  }

  return pairs.length ? pairs : [{ origin: '', destination: value }];
}

function extractRouteOrigin(routeName) {
  return getRouteNamePairs(routeName)[0]?.origin || '';
}

function extractRouteDestination(routeName) {
  return getRouteNamePairs(routeName)[0]?.destination || '';
}

function parseGtfsTime(value) {
  const match = String(value ?? '').trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [hour, minute, second] = match.slice(1).map(Number);
  if (minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}

function getSofiaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SOFIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day'))
  };
}

function getSofiaDateKey(date) {
  const { year, month, day } = getSofiaDateParts(date);
  if (![year, month, day].every(Number.isFinite)) return '';

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getSofiaOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SOFIA_TIME_ZONE,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const raw = parts.find(part => part.type === 'timeZoneName')?.value || 'GMT+0';
  const match = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0)) * 60 * 1000;
}

function gtfsSecondsToTodayTimestamp(seconds, date) {
  const { year, month, day } = getSofiaDateParts(date);
  const baseUtc = Date.UTC(year, month - 1, day);
  return (baseUtc + Number(seconds) * 1000 - getSofiaOffsetMs(new Date(baseUtc))) / 1000;
}

function getScheduleDayType(date, calendar = calendarData) {
  const dateKey = getSofiaDateKey(date);
  const configured = calendar?.dateTypes?.[dateKey]
    || calendar?.config?.dateOverrides?.[dateKey];
  if (configured === 'weekday' || configured === 'weekend') return configured;

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: SOFIA_TIME_ZONE,
    weekday: 'short'
  }).format(date);
  return weekday === 'Sat' || weekday === 'Sun' ? 'weekend' : 'weekday';
}

function isServiceActive(serviceId, date, calendar = calendarData) {
  const id = String(serviceId ?? '').trim();
  if (!id) return true;

  const dateKey = getSofiaDateKey(date);
  const byDate = calendar?.serviceIdsByDate;
  if (byDate && typeof byDate === 'object') {
    const ids = byDate[dateKey];
    return Array.isArray(ids) && ids.some(value => String(value).trim() === id);
  }

  const compactDate = dateKey.replaceAll('-', '');
  const weekdayField = new Intl.DateTimeFormat('en-US', {
    timeZone: SOFIA_TIME_ZONE,
    weekday: 'long'
  }).format(date).toLowerCase();
  const pattern = (calendar?.servicePatterns || []).find(row => String(row?.service_id || '').trim() === id);
  let active = false;

  if (pattern) {
    active = compactDate >= String(pattern.start_date || '')
      && compactDate <= String(pattern.end_date || '')
      && String(pattern[weekdayField] || '') === '1';
  }

  for (const exception of calendar?.exceptions || []) {
    if (
      String(exception?.service_id || '').trim() === id
      && String(exception?.date || '').trim() === compactDate
    ) {
      if (String(exception.exception_type) === '1') active = true;
      if (String(exception.exception_type) === '2') active = false;
    }
  }

  return active;
}

function createRouteMetadata(route) {
  return getRouteMetadata(route);
}

function createDataContext(data = {}) {
  const routes = data.routes || routesData;
  const directions = data.directions || directionsData;
  const schedules = data.schedules || schedulesData;
  const stops = data.stops || stopsData;
  const calendar = data.calendar || calendarData;

  const { byId: stopById, byCode: stopByCode } = buildStopIndexes(stops);

  // Index route directions by the stops they serve. The same index supports
  // realtime direction matching and the unchanged GTFS timetable fallback.
  const directionsByStop = new Map();
  for (const route of routes) {
    const routeId = String(route?.route_id || '').trim();
    if (!routeId) continue;

    const routeDirections = directions?.[routeId] || {};
    for (const [directionKey, direction] of Object.entries(routeDirections)) {
      const pattern = Array.isArray(direction?.pattern) ? direction.pattern.map(String) : [];
      if (!pattern.length) continue;

      const indexedStopKeys = new Set();
      for (let stopIndex = 0; stopIndex < pattern.length; stopIndex++) {
        const stopKey = normalizeStopKey(pattern[stopIndex]);
        if (!stopKey || indexedStopKeys.has(stopKey)) continue;
        indexedStopKeys.add(stopKey);

        if (!directionsByStop.has(stopKey)) directionsByStop.set(stopKey, []);
        directionsByStop.get(stopKey).push({
          route,
          routeId,
          routeIsMetro: String(route.route_type) === '1',
          directionKey,
          direction,
          pattern,
          stopIndex,
          daySchedules: schedules?.[routeId]?.[directionKey] || {},
          meta: createRouteMetadata(route)
        });
      }
    }
  }

  // Index routes by the same normalized type and public number shown by the
  // website. Do not key this index by raw GTFS route_type: route-metadata.js
  // intentionally reclassifies several GTFS trolleybus records as buses.
  const routesByApiLine = new Map();
  for (const route of routes) {
    const meta = createRouteMetadata(route);
    const apiLineName = normalizeApiLineName(route?.route_short_name);
    const displayType = String(meta?.type || '').trim();
    if (!apiLineName || !displayType || displayType === 'other') continue;

    const key = `${displayType}|${apiLineName}`;
    if (!routesByApiLine.has(key)) routesByApiLine.set(key, []);
    routesByApiLine.get(key).push(route);
  }

  function getStop(stopId) {
    const raw = String(stopId ?? '').trim();
    return stopById.get(raw)
      || stopByCode.get(raw)
      || findPreferredStop(
        stops,
        stop => stopIdsMatch(stop?.stop_id, raw) || stopIdsMatch(stop?.stop_code, raw)
      )
      || null;
  }

  function getDestinationName(stopId, direction, fallback = '') {
    const stop = getStop(stopId);
    const directionStops = Array.isArray(direction?.stops) ? direction.stops : [];
    const directionStop = stopId
      ? directionStops.find(item => stopIdsMatch(item?.stop_id, stopId))
      : directionStops[directionStops.length - 1];

    const osmName = String(
      stop?.osm_stop_name
      || directionStop?.osm_name
      || (stop?.stop_name_source === 'osm' ? stop?.stop_name : '')
      || ''
    ).trim();
    if (osmName) return osmName;

    const stopName = String(
      stop?.stop_name
      || directionStop?.name
      || directionStop?.gtfs_name
      || ''
    ).trim();
    if (stopName) return stopName;

    return String(
      direction?.destination
      || direction?.headsign
      || fallback
      || ''
    ).trim();
  }

  function getStopNameAliases(
    stopId,
    direction,
    { includeOriginLabels = false, includeDestinationLabels = false } = {}
  ) {
    const stop = getStop(stopId);
    const directionStops = Array.isArray(direction?.stops) ? direction.stops : [];
    const directionStop = directionStops.find(item => stopIdsMatch(item?.stop_id, stopId));
    const aliases = [
      stop?.osm_stop_name,
      stop?.osm_name,
      stop?.stop_name,
      stop?.gtfs_stop_name,
      directionStop?.osm_name,
      directionStop?.name,
      directionStop?.gtfs_name
    ];

    // Route labels describe only the relevant full-route endpoint. Do not
    // treat them as aliases for every intermediate stop: that could make a
    // partial-course route_name resolve to the wrong physical terminal.
    if (includeOriginLabels) {
      aliases.push(direction?.origin, direction?.origin_name, direction?.start, direction?.from);
    }
    if (includeDestinationLabels) {
      aliases.push(direction?.headsign, direction?.destination);
    }

    return new Set(aliases.map(normalizeDirectionText).filter(Boolean));
  }

  function resolveRealtimeDirections(apiRow, selectedStopId) {
    const apiType = String(apiRow?.type ?? '').trim();
    const displayType = API_TYPE_TO_DISPLAY_TYPES[apiType];
    const lineName = normalizeApiLineName(apiRow?.name);
    const routeNamePairs = getRouteNamePairs(apiRow?.route_name);
    if (!displayType || !lineName) return [];

    const routeCandidates = routesByApiLine.get(`${displayType}|${lineName}`) || [];
    const possibleDirections = [];
    const destinationMatches = [];

    for (const route of routeCandidates) {
      const routeId = String(route?.route_id || '').trim();
      if (!routeId) continue;

      for (const [directionKey, direction] of Object.entries(directions?.[routeId] || {})) {
        const pattern = Array.isArray(direction?.pattern) ? direction.pattern.map(String) : [];
        const selectedIndexes = [];
        for (let index = 0; index < pattern.length; index++) {
          if (stopIdsMatch(pattern[index], selectedStopId)) selectedIndexes.push(index);
        }
        if (!selectedIndexes.length) continue;

        const routeCandidate = {
          route,
          routeId,
          directionKey,
          direction: { key: directionKey, ...direction },
          pattern,
          meta: createRouteMetadata(route)
        };
        possibleDirections.push(routeCandidate);

        // A ЦГМ route_name can describe a partial course. Its destination may
        // therefore be any stop at or after the selected stop in the GTFS
        // direction, not only the last stop of the full route pattern.
        for (const selectedIndex of selectedIndexes) {
          for (const pair of routeNamePairs) {
            const destinationName = normalizeDirectionText(pair.destination);
            if (!destinationName) continue;

            let originMatch = false;
            const originName = normalizeDirectionText(pair.origin);
            if (originName) {
              for (let originIndex = 0; originIndex <= selectedIndex; originIndex++) {
                const originAliases = getStopNameAliases(
                  pattern[originIndex],
                  direction,
                  { includeOriginLabels: originIndex === 0 }
                );
                if (originAliases.has(originName)) {
                  originMatch = true;
                  break;
                }
              }
            }

            for (let terminalIndex = selectedIndex; terminalIndex < pattern.length; terminalIndex++) {
              const terminalStopId = String(pattern[terminalIndex] || '').trim();
              if (!terminalStopId) continue;

              const destinationAliases = getStopNameAliases(
                terminalStopId,
                direction,
                { includeDestinationLabels: terminalIndex === pattern.length - 1 }
              );
              if (!destinationAliases.has(destinationName)) continue;

              destinationMatches.push({
                ...routeCandidate,
                terminalStopId,
                terminalIndex,
                fullTerminalMatch: terminalIndex === pattern.length - 1,
                destinationMatch: true,
                originMatch
              });
            }
          }
        }
      }
    }

    if (!possibleDirections.length) return [];

    // If ЦГМ's destination label is absent or differs from every GTFS/OSM stop
    // alias, keep the former conservative fallback only when the stop + line
    // + transport type identify a single GTFS direction unambiguously.
    if (!destinationMatches.length) {
      if (possibleDirections.length !== 1) return [];
      const only = possibleDirections[0];
      const terminalStopId = String(only.pattern[only.pattern.length - 1] || '').trim();
      return terminalStopId ? [{ ...only, terminalStopId }] : [];
    }

    // Several route patterns can share the same real destination. Keep them
    // together so realtime suppresses timetable fallback for each matching
    // line/direction while mergeRoutes combines equivalent visible rows.
    // Prefer a true GTFS direction terminal when the same stop name also
    // occurs mid-route in another pattern (a common case with parallel or
    // looping directions). Only fall back to intermediate-stop terminals
    // when no full-pattern terminal matches ЦГМ's destination label.
    const fullTerminalMatches = destinationMatches.filter(candidate => candidate.fullTerminalMatch);
    const terminalCandidates = fullTerminalMatches.length ? fullTerminalMatches : destinationMatches;

    const uniqueMatches = new Map();
    for (const candidate of terminalCandidates) {
      const key = `${candidate.routeId}|${candidate.directionKey}|${normalizeStopKey(candidate.terminalStopId)}`;
      const existing = uniqueMatches.get(key);
      if (!existing || (!existing.originMatch && candidate.originMatch)) {
        uniqueMatches.set(key, candidate);
      }
    }
    const matches = [...uniqueMatches.values()];
    const terminalIds = new Set(matches.map(candidate => normalizeStopKey(candidate.terminalStopId)));
    if (terminalIds.size === 1) return matches;

    // If the same destination text occurs at multiple physical stops, use the
    // source route_name origin to disambiguate the partial/full course.
    const originMatches = matches.filter(candidate => candidate.originMatch);
    const originTerminalIds = new Set(originMatches.map(candidate => normalizeStopKey(candidate.terminalStopId)));
    if (originMatches.length && originTerminalIds.size === 1) return originMatches;

    // Do not guess between different terminal stops if the source label is
    // insufficient to identify one unambiguously.
    return matches.length === 1 ? matches : [];
  }

  function makeRealtimeArrivals(apiRows, selectedStopId, now) {
    if (!Array.isArray(apiRows)) return [];

    const nowTimestamp = now.getTime() / 1000;
    const result = [];

    for (const apiRow of apiRows) {
      if (!apiRow || typeof apiRow !== 'object') continue;
      const details = Array.isArray(apiRow.details) ? apiRow.details : [];
      if (!details.length) continue;

      const apiTimes = details.map(item => {
        const minutes = Number(item?.t);
        if (!Number.isFinite(minutes) || minutes < 0) return null;

        const timestamp = nowTimestamp + minutes * 60;
        if (timestamp < nowTimestamp || timestamp > nowTimestamp + MAX_REALTIME_LOOKAHEAD_SECONDS) return null;

        return {
          timestamp,
          delay: null,
          scheduled: false,
          source: 'realtime'
        };
      }).filter(Boolean);
      if (!apiTimes.length) continue;

      const resolvedDirections = resolveRealtimeDirections(apiRow, selectedStopId);
      if (!resolvedDirections.length) continue;

      for (const resolved of resolvedDirections) {
        // Do not show a course at the stop where that exact full or partial
        // course terminates. Keep this rule consistent with GTFS fallback.
        if (stopIdsMatch(resolved.terminalStopId, selectedStopId)) continue;

        const destination = getDestinationName(
          resolved.terminalStopId,
          resolved.direction,
          extractRouteDestination(apiRow.route_name)
        );
        if (!destination) continue;

        result.push({
          route_id: resolved.routeId,
          direction_key: resolved.directionKey,
          direction_id: String(resolved.direction?.direction_id ?? '').trim(),
          terminal_stop_id: resolved.terminalStopId,
          destination,
          route_ref: resolved.meta?.number || String(apiRow.name || '—'),
          meta: resolved.meta,
          realtime: true,
          scheduled: false,
          source: 'realtime',
          times: apiTimes
        });
      }
    }

    return result;
  }

  // This GTFS fallback intentionally keeps its current short-turn behavior:
  // the last populated stop_time in each scheduled trip is its actual terminal.
  function getStaticArrivals(stopId, isMetro, now) {
    const dayType = getScheduleDayType(now, calendar);
    const nowTimestamp = now.getTime() / 1000;
    const result = [];
    const serviceStatus = new Map();
    const candidates = directionsByStop.get(normalizeStopKey(stopId)) || [];

    function serviceIsActive(serviceId) {
      const id = String(serviceId || '').trim();
      if (!id) return true;
      if (!serviceStatus.has(id)) {
        serviceStatus.set(id, isServiceActive(id, now, calendar));
      }
      return serviceStatus.get(id);
    }

    for (const candidate of candidates) {
      if (candidate.routeIsMetro !== isMetro) continue;

      const {
        routeId,
        directionKey,
        direction,
        pattern,
        stopIndex,
        daySchedules,
        meta
      } = candidate;
      const dayRows = daySchedules?.[dayType];
      if (!Array.isArray(dayRows)) continue;

      for (const schedule of dayRows) {
        const serviceId = String(schedule?.service_id || direction?.service_id || '').trim();
        if (!serviceIsActive(serviceId)) continue;

        const seconds = parseGtfsTime(schedule?.times?.[stopIndex]);
        if (seconds == null) continue;

        const times = Array.isArray(schedule?.times) ? schedule.times : [];
        let terminalIndex = -1;
        for (let index = Math.min(times.length, pattern.length) - 1; index >= 0; index--) {
          if (parseGtfsTime(times[index]) != null) {
            terminalIndex = index;
            break;
          }
        }
        if (terminalIndex < stopIndex) continue;

        const terminalStopId = String(pattern[terminalIndex] || '').trim();
        if (!terminalStopId) continue;

        // A timetable trip is not an arrival at the stop where that trip ends.
        // This also correctly handles real scheduled short-turn courses.
        if (stopIdsMatch(terminalStopId, stopId)) continue;

        const timestamp = gtfsSecondsToTodayTimestamp(seconds, now);
        if (timestamp < nowTimestamp) continue;
        if (timestamp > nowTimestamp + MAX_STATIC_LOOKAHEAD_SECONDS) continue;

        result.push({
          route_id: routeId,
          direction_key: directionKey,
          direction_id: String(direction?.direction_id ?? '').trim(),
          terminal_stop_id: terminalStopId,
          destination: getDestinationName(
            terminalStopId,
            direction,
            direction?.destination || direction?.headsign || terminalStopId
          ),
          route_ref: meta?.number || candidate.route.route_short_name || '—',
          meta,
          times: [{ timestamp, delay: null, scheduled: true, source: 'static' }],
          scheduled: true,
          source: 'static'
        });
      }
    }

    return result;
  }

  function mergeRoutes(inputRoutes) {
    const grouped = new Map();

    for (const route of inputRoutes) {
      const routeId = String(route?.route_id || '').trim();
      const terminalStopId = String(route?.terminal_stop_id || route?.destination_stop_id || '').trim();
      const destinationKey = terminalStopId
        ? `stop:${normalizeStopKey(terminalStopId)}`
        : `name:${normalizeDirectionText(route?.destination || route?.headsign || '')}`;
      const key = `${routeId}|${destinationKey}`;
      const times = Array.isArray(route?.times) ? route.times : [];
      if (!grouped.has(key)) {
        grouped.set(key, { ...route, times: [...times] });
        continue;
      }

      const existing = grouped.get(key);
      existing.times.push(...times);
      if ((!existing.route_ref || existing.route_ref === '—') && route?.route_ref && route.route_ref !== '—') {
        existing.route_ref = route.route_ref;
      }
      if (!existing.meta && route?.meta) existing.meta = route.meta;
      if (route?.realtime && !existing.realtime) {
        grouped.set(key, { ...route, route_ref: existing.route_ref || route.route_ref, meta: route.meta || existing.meta, times: existing.times });
      }
    }

    return [...grouped.values()]
      .map(route => {
        const seen = new Set();
        const times = (route.times || [])
          .filter(time => time?.timestamp !== null && time?.timestamp !== undefined && Number.isFinite(Number(time.timestamp)))
          .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
          .filter(time => {
            const timestamp = Number(time.timestamp);
            if (seen.has(timestamp)) return false;
            seen.add(timestamp);
            return true;
          })
          .slice(0, MAX_ARRIVALS_PER_LINE);
        return { ...route, times };
      })
      .filter(route => route.times.length)
      .sort((a, b) => Number(a.times[0].timestamp) - Number(b.times[0].timestamp));
  }

  function findSelectedStop(stopCode) {
    const raw = String(stopCode ?? '').trim();
    return stopById.get(raw) || stopByCode.get(raw) || getStop(raw) || null;
  }

  function isMetroStop(stopCode) {
    const selectedStop = findSelectedStop(stopCode);
    const selectedStopId = String(selectedStop?.stop_id || stopCode || '').trim();
    return /^M/i.test(selectedStopId) || /^M/i.test(String(selectedStop?.stop_code || ''));
  }

  function buildBoard(apiRows, stopCode, now = new Date()) {
    const rawCode = String(stopCode ?? '').trim();
    const selectedStop = findSelectedStop(rawCode);
    const selectedStopId = String(selectedStop?.stop_id || rawCode).trim();
    if (!selectedStopId) {
      return { status: 'empty', stop_code: rawCode, generated_at: Math.floor(now.getTime() / 1000), routes: [] };
    }

    const metro = isMetroStop(rawCode);
    const realtimeRoutes = metro ? [] : makeRealtimeArrivals(apiRows, selectedStopId, now);

    // The timetable is a fallback per line + direction, not per individual
    // course. As soon as the ЦГМ virtual table has any arrivals for that
    // direction at this stop, do not mix scheduled times into that direction.
    const realtimeDirectionKeys = new Set(
      realtimeRoutes.map(route => `${route.route_id}|${route.direction_key}`)
    );
    const staticArrivals = getStaticArrivals(selectedStopId, metro, now).filter(route =>
      !realtimeDirectionKeys.has(`${route.route_id}|${route.direction_key}`)
    );

    const routes = mergeRoutes([...realtimeRoutes, ...staticArrivals]);
    return {
      status: routes.length ? 'ok' : 'empty',
      stop_code: rawCode,
      generated_at: Math.floor(now.getTime() / 1000),
      realtime_status: metro ? 'not_applicable' : (Array.isArray(apiRows) && apiRows.length ? 'ok' : 'empty'),
      routes
    };
  }

  return { buildBoard, isMetroStop };
}

const defaultService = createDataContext();

function buildVirtualBoard(apiRows, stopCode, now = new Date()) {
  return defaultService.buildBoard(apiRows, stopCode, now);
}

function isMetroStop(stopCode) {
  return defaultService.isMetroStop(stopCode);
}

module.exports = {
  buildVirtualBoard,
  createDataContext,
  isMetroStop,
  normalizeApiLineName,
  extractRouteOrigin,
  extractRouteDestination
};
