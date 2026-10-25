const assert = require('node:assert/strict');
const test = require('node:test');
const { bangkokDateKey, normalizeLuckyBirthDate, createLuckyBirthdayCollectionKey, buildLuckyBirthdayInsert } = require('../lucky-birthday-collection.js');

test('uses Asia/Bangkok date semantics for future-date validation', () => {
  const now = new Date('2026-10-24T18:00:00.000Z');
  assert.equal(bangkokDateKey(now), '2026-10-25');
  assert.deepEqual(normalizeLuckyBirthDate('2000-02-29', { today: '2026-10-25' }), { date: '2000-02-29', weekday: 2 });
  assert.equal(normalizeLuckyBirthDate('2026-10-26', { today: '2026-10-25' }), null);
  assert.equal(normalizeLuckyBirthDate('2026-02-30', { today: '2026-10-25' }), null);
});

test('server-generated keys are stable per analytics session and consent version', () => {
  const first = createLuckyBirthdayCollectionKey('server-secret', { sessionId: 'session_123456789012', consentVersion: 'lucky-birthday-consent-th-v1' });
  const retry = createLuckyBirthdayCollectionKey('server-secret', { sessionId: 'session_123456789012', consentVersion: 'lucky-birthday-consent-th-v1' });
  const otherSession = createLuckyBirthdayCollectionKey('server-secret', { sessionId: 'session_987654321098', consentVersion: 'lucky-birthday-consent-th-v1' });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, retry);
  assert.notEqual(first, otherSession);
  assert.equal(createLuckyBirthdayCollectionKey('', { sessionId: 'x', consentVersion: 'v' }), null);
});

test('builds an idempotent insert without accepting a browser collection key', () => {
  const input = { sessionId: 'session_123456789012', birthDate: '2000-02-29', consentVersion: 'lucky-birthday-consent-th-v1', collection_key: 'browser-supplied-value' };
  const first = buildLuckyBirthdayInsert('server-secret', input, { today: '2026-10-25' });
  const changedDateRetry = buildLuckyBirthdayInsert('server-secret', { ...input, birthDate: '2001-02-28' }, { today: '2026-10-25' });
  assert.equal(first.row.collection_key, changedDateRetry.row.collection_key);
  assert.equal(first.row.collection_key === input.collection_key, false);
  assert.deepEqual(Object.keys(first.row).sort(), ['analytics_session_id', 'birth_date', 'birth_weekday', 'collection_key', 'consent_version', 'source']);
  assert.equal(buildLuckyBirthdayInsert('server-secret', { ...input, birthDate: '2026-10-26' }, { today: '2026-10-25' }), null);
});
