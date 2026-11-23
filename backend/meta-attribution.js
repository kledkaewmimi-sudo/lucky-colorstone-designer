const FBP_PATTERN = /^fb\.1\.\d{10,16}\.\d+$/;
const FBC_PATTERN = /^fb\.1\.\d{10,16}\.[^\s]+$/;

function nullable(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function readCookie(cookieString, name) {
  const prefix = `${name}=`;
  return String(cookieString || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || null;
}

export function isValidFbp(value) {
  return FBP_PATTERN.test(String(value || ''));
}

export function isValidFbc(value) {
  return FBC_PATTERN.test(String(value || ''));
}

export function deriveFbcFromFbclid(fbclid, now) {
  const clickId = nullable(fbclid);
  const timestamp = Number(now);
  if (!clickId || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return `fb.1.${Math.floor(timestamp)}.${clickId}`;
}

function normalizeTouch(touch) {
  if (!touch || typeof touch !== 'object') return null;
  return {
    utm: {
      source: nullable(touch.utm?.source), medium: nullable(touch.utm?.medium), campaign: nullable(touch.utm?.campaign), content: nullable(touch.utm?.content), term: nullable(touch.utm?.term)
    },
    meta: {
      fbclid: nullable(touch.meta?.fbclid), fbp: isValidFbp(touch.meta?.fbp) ? touch.meta.fbp : null, fbc: isValidFbc(touch.meta?.fbc) ? touch.meta.fbc : null
    },
    referrer: nullable(touch.referrer), landingUrl: nullable(touch.landingUrl), landedAt: nullable(touch.landedAt)
  };
}

export function captureMetaAttribution({ href, referrer = '', cookieString = '', now = Date.now() } = {}) {
  const url = new URL(href);
  const fbclid = nullable(url.searchParams.get('fbclid'));
  const existingFbc = readCookie(cookieString, '_fbc');
  const touch = normalizeTouch({
    utm: { source: url.searchParams.get('utm_source'), medium: url.searchParams.get('utm_medium'), campaign: url.searchParams.get('utm_campaign'), content: url.searchParams.get('utm_content'), term: url.searchParams.get('utm_term') },
    meta: { fbclid, fbp: readCookie(cookieString, '_fbp'), fbc: isValidFbc(existingFbc) ? existingFbc : deriveFbcFromFbclid(fbclid, now) },
    referrer, landingUrl: url.href, landedAt: new Date(now).toISOString()
  });
  let referrerIsExternal = false;
  try { referrerIsExternal = Boolean(touch.referrer) && new URL(touch.referrer).origin !== url.origin; } catch { referrerIsExternal = Boolean(touch.referrer); }
  return { ...touch, isExternalTouch: Boolean(touch.utm.source || touch.utm.medium || touch.utm.campaign || touch.utm.content || touch.utm.term || touch.meta.fbclid || referrerIsExternal) };
}

function hydrateMeta(targetTouch, incomingTouch) {
  if (!targetTouch) return incomingTouch;
  return { ...targetTouch, meta: { fbclid: targetTouch.meta.fbclid || incomingTouch.meta.fbclid, fbp: targetTouch.meta.fbp || incomingTouch.meta.fbp, fbc: targetTouch.meta.fbc || incomingTouch.meta.fbc } };
}

export function normalizeMetaAttribution(value) {
  if (!value || typeof value !== 'object') return null;
  const firstTouch = normalizeTouch(value.firstTouch);
  const lastTouch = normalizeTouch(value.lastTouch);
  return firstTouch || lastTouch ? { firstTouch, lastTouch } : null;
}

export function updateMetaAttribution(existing, incoming, { updateLastTouch = true } = {}) {
  const state = normalizeMetaAttribution(existing) || { firstTouch: null, lastTouch: null };
  const capture = normalizeTouch(incoming);
  if (!capture) return state;
  return {
    firstTouch: hydrateMeta(state.firstTouch, capture),
    lastTouch: !state.firstTouch || (updateLastTouch && incoming.isExternalTouch) ? capture : hydrateMeta(state.lastTouch, capture)
  };
}
