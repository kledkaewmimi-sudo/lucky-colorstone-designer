const TIKTOK_IDENTIFIER_PATTERN = /^[^\s]{1,512}$/;

function nullable(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function validTikTokIdentifier(value) {
  const normalized = nullable(value);
  return normalized && TIKTOK_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

function readCookie(cookieString, name) {
  const prefix = `${name}=`;
  const value = String(cookieString || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizeTouch(touch) {
  if (!touch || typeof touch !== 'object') return null;
  return {
    utm: {
      source: nullable(touch.utm?.source), medium: nullable(touch.utm?.medium), campaign: nullable(touch.utm?.campaign),
      content: nullable(touch.utm?.content), term: nullable(touch.utm?.term)
    },
    tiktok: { ttclid: validTikTokIdentifier(touch.tiktok?.ttclid), ttp: validTikTokIdentifier(touch.tiktok?.ttp) },
    referrer: nullable(touch.referrer), landingUrl: nullable(touch.landingUrl), landedAt: nullable(touch.landedAt)
  };
}

export function captureTikTokAttribution({ href, referrer = '', cookieString = '', now = Date.now() } = {}) {
  const url = new URL(href);
  const touch = normalizeTouch({
    utm: {
      source: url.searchParams.get('utm_source'), medium: url.searchParams.get('utm_medium'), campaign: url.searchParams.get('utm_campaign'),
      content: url.searchParams.get('utm_content'), term: url.searchParams.get('utm_term')
    },
    tiktok: { ttclid: url.searchParams.get('ttclid'), ttp: readCookie(cookieString, '_ttp') },
    referrer, landingUrl: url.href, landedAt: new Date(now).toISOString()
  });
  let referrerIsExternal = false;
  try { referrerIsExternal = Boolean(touch.referrer) && new URL(touch.referrer).origin !== url.origin; } catch { referrerIsExternal = Boolean(touch.referrer); }
  return {
    ...touch,
    isExternalTouch: Boolean(touch.utm.source || touch.utm.medium || touch.utm.campaign || touch.utm.content || touch.utm.term || touch.tiktok.ttclid || referrerIsExternal)
  };
}

function hydrateTikTok(targetTouch, incomingTouch) {
  if (!targetTouch) return incomingTouch;
  return {
    ...targetTouch,
    tiktok: { ttclid: targetTouch.tiktok.ttclid || incomingTouch.tiktok.ttclid, ttp: targetTouch.tiktok.ttp || incomingTouch.tiktok.ttp }
  };
}

export function normalizeTikTokAttribution(value) {
  if (!value || typeof value !== 'object') return null;
  const firstTouch = normalizeTouch(value.firstTouch);
  const lastTouch = normalizeTouch(value.lastTouch);
  return firstTouch || lastTouch ? { firstTouch, lastTouch } : null;
}

export function updateTikTokAttribution(existing, incoming, { updateLastTouch = true } = {}) {
  const state = normalizeTikTokAttribution(existing) || { firstTouch: null, lastTouch: null };
  const capture = normalizeTouch(incoming);
  if (!capture) return state;
  return {
    firstTouch: hydrateTikTok(state.firstTouch, capture),
    lastTouch: !state.firstTouch || (updateLastTouch && incoming.isExternalTouch) ? capture : hydrateTikTok(state.lastTouch, capture)
  };
}

export { validTikTokIdentifier };
