const crypto = require('crypto');

function bangkokDateKey(now = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeLuckyBirthDate(value, { today = bangkokDateKey() } = {}) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > today) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { date, weekday: parsed.getUTCDay() };
}

function createLuckyBirthdayCollectionKey(secret, { sessionId, consentVersion }) {
  const key = String(secret || '');
  if (!key) return null;
  return crypto.createHmac('sha256', key)
    .update(`lucky-birthday-v1\u0000${sessionId}\u0000${consentVersion}`)
    .digest('hex');
}

function buildLuckyBirthdayInsert(secret, input, { today = bangkokDateKey() } = {}) {
  const sessionId = String(input?.sessionId || '').trim();
  const consentVersion = String(input?.consentVersion || '').trim();
  const birth = normalizeLuckyBirthDate(input?.birthDate, { today });
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(sessionId) || !birth || !consentVersion) return null;
  const collectionKey = createLuckyBirthdayCollectionKey(secret, { sessionId, consentVersion });
  if (!collectionKey) return null;
  return {
    collectionKey,
    row: {
      collection_key: collectionKey,
      analytics_session_id: sessionId,
      birth_date: birth.date,
      birth_weekday: birth.weekday,
      consent_version: consentVersion,
      source: 'lucky'
    }
  };
}

module.exports = { bangkokDateKey, normalizeLuckyBirthDate, createLuckyBirthdayCollectionKey, buildLuckyBirthdayInsert };
