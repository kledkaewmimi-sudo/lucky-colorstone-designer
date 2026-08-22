const crypto = require('crypto');

const HANDOFF_VERSION = 1;
const HANDOFF_TTL_MS = 20 * 60 * 1000;
const MAX_HANDOFF_BYTES = 16 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ATTRIBUTION_FIELDS = ['source', 'medium', 'campaign', 'content', 'term'];

function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 120 ? id : '';
}

function normalizeDesignSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
  const design = value.design;
  if (!design || typeof design !== 'object' || Array.isArray(design)) return null;
  const wristSize = Number(design.wristSize);
  const beadSize = String(design.beadSize || '');
  const components = Array.isArray(design.components) ? design.components : null;
  const selectedCharmIds = Array.isArray(design.selectedCharmIds) ? design.selectedCharmIds : null;
  if (!Number.isFinite(wristSize) || wristSize < 14 || wristSize > 20 || Math.round(wristSize * 2) !== wristSize * 2) return null;
  if (!['4', '6', '10'].includes(beadSize) || !components || components.length > 240 || !selectedCharmIds || selectedCharmIds.length > 2) return null;
  const normalizedComponents = components.map((component) => {
    const type = String(component?.type || '').trim().toLowerCase();
    if (type === 'empty') return { type };
    if (!['stone', 'charm', 'spacer'].includes(type)) return null;
    const id = normalizeId(component?.id);
    return id ? { type, id } : null;
  });
  const charms = selectedCharmIds.map(normalizeId);
  if (normalizedComponents.some((component) => !component) || charms.some((id) => !id)) return null;
  const savedAt = Number(value.savedAt);
  const expiresAt = Number(value.expiresAt);
  const step = Number(value.step);
  if (!Number.isFinite(savedAt) || !Number.isFinite(expiresAt) || expiresAt <= savedAt || ![1, 2, 3].includes(step)) return null;
  return { version: 1, savedAt, expiresAt, step, design: { wristSize, beadSize, selectedCharmIds: charms, components: normalizedComponents } };
}

function normalizeContinuity(value = {}) {
  const visitorId = ID_PATTERN.test(String(value.visitorId || '')) ? String(value.visitorId) : '';
  const sessionId = ID_PATTERN.test(String(value.sessionId || '')) ? String(value.sessionId) : '';
  const attribution = {};
  ATTRIBUTION_FIELDS.forEach((key) => {
    const text = typeof value?.attribution?.[key] === 'string' ? value.attribution[key].trim() : '';
    if (text && text.length <= 160) attribution[key] = text;
  });
  return {
    ...(visitorId ? { visitorId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(Object.keys(attribution).length ? { attribution } : {})
  };
}

function normalizeHandoffPayload(input = {}, now = Date.now()) {
  const targetStep = Number(input.targetStep);
  const designSnapshot = normalizeDesignSnapshot(input.designSnapshot);
  if (!designSnapshot || ![1, 2, 3, 4].includes(targetStep)) return null;
  const createdAt = Number(now);
  const payload = {
    version: HANDOFF_VERSION,
    createdAt,
    expiresAt: createdAt + HANDOFF_TTL_MS,
    targetStep,
    designSnapshot,
    analyticsContinuity: normalizeContinuity(input.analyticsContinuity)
  };
  return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= MAX_HANDOFF_BYTES ? payload : null;
}

function createHandoffToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  HANDOFF_TTL_MS,
  TOKEN_PATTERN,
  createHandoffToken,
  normalizeHandoffPayload
};
