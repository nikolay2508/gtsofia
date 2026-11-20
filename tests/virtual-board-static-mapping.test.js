const assert = require('node:assert/strict');
const { normalizeApiLineName, extractRouteOrigin, extractRouteDestination } = require('../api/virtual-board-service');

assert.equal(
  extractRouteDestination('Автостанция Гео Милев - пл. Орлов мост'),
  'пл. Орлов мост',
  'the final route_name segment should be the destination'
);
assert.equal(
  extractRouteDestination('ж.к. Дружба-2 - пл. Орлов мост'),
  'пл. Орлов мост',
  'hyphens inside compact stop names should not be treated as direction separators'
);
assert.equal(
  extractRouteDestination('кв. Орландовци - кв. Манастирски ливади - запад'),
  'кв. Манастирски ливади - запад',
  'a spaced hyphen that belongs to the terminal name should be preserved'
);
assert.equal(
  extractRouteOrigin('кв. Орландовци - кв. Манастирски ливади - запад'),
  'кв. Орландовци',
  'the full route label should retain its origin as a matching hint'
);
assert.equal(
  normalizeApiLineName('20-TM'),
  normalizeApiLineName('20ТМ'),
  'Latin TM and Cyrillic ТМ should be treated as equivalent, as in the Android client'
);
assert.notEqual(
  normalizeApiLineName('12T'),
  normalizeApiLineName('12ТМ'),
  'a terminal T must not be confused with TM'
);

console.log('virtual-board-static-mapping: route labels and line matching tests passed');
