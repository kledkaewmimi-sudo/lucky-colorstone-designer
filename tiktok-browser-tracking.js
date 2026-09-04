export const TIKTOK_PRODUCT_CONTENT_ID = 'lucky_colorstone_custom_bracelet';
export const TIKTOK_PRODUCT_CONTENT_NAME = 'Lucky Colorstone Custom Bracelet';
export const TIKTOK_PRODUCT_CONTENT_TYPE = 'product';

let initializationPromise = null;
let initializedPixelId = '';

function getBrowserWindow() { return typeof window === 'undefined' ? null : window; }
function getBrowserDocument() { return typeof document === 'undefined' ? null : document; }
function isValidPixelId(value) { return /^[A-Za-z0-9_-]{5,100}$/.test(String(value || '').trim()); }

function installTikTokQueue(windowRef, documentRef) {
  const objectName = 'ttq';
  windowRef.TiktokAnalyticsObject = objectName;
  const ttq = windowRef[objectName] = windowRef[objectName] || [];
  if (typeof ttq.load === 'function') return ttq;
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
  ttq.setAndDefer = (target, method) => { target[method] = function () { target.push([method].concat(Array.from(arguments))); }; };
  ttq.methods.forEach((method) => ttq.setAndDefer(ttq, method));
  ttq.load = (pixelId) => {
    const script = documentRef.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=${objectName}`;
    const firstScript = documentRef.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
    else documentRef.head?.appendChild(script);
  };
  return ttq;
}

export function getTikTokPageUrl(href) {
  try { const url = new URL(href); return `${url.origin}${url.pathname}`; } catch { return ''; }
}

export function initializeTikTokPixel({ windowRef = getBrowserWindow(), documentRef = getBrowserDocument(), fetchImpl = null } = {}) {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    if (!windowRef || !documentRef) return false;
    const request = fetchImpl || windowRef.fetch?.bind(windowRef);
    if (typeof request !== 'function') return false;
    try {
      const response = await request('/api/tracking/config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = response?.ok ? await response.json().catch(() => ({})) : {};
      const pixelId = String(payload?.tiktokPixelId || '').trim();
      if (!isValidPixelId(pixelId)) return false;
      const ttq = installTikTokQueue(windowRef, documentRef);
      if (!initializedPixelId) {
        ttq.load(pixelId);
        ttq.page();
        initializedPixelId = pixelId;
      }
      return initializedPixelId === pixelId;
    } catch {
      return false;
    }
  })();
  return initializationPromise;
}

export async function trackTikTokEvent(eventName, parameters = {}, eventId = '', dependencies = {}) {
  const windowRef = dependencies.windowRef || getBrowserWindow();
  if (!windowRef || !await initializeTikTokPixel({ ...dependencies, windowRef })) return false;
  try {
    if (typeof windowRef.ttq?.track !== 'function') return false;
    if (eventId) windowRef.ttq.track(eventName, parameters, { event_id: eventId });
    else windowRef.ttq.track(eventName, parameters);
    return true;
  } catch {
    return false;
  }
}

export function normalizeTikTokCompletePayment(payload) {
  const eventId = String(payload?.event_id || '').trim();
  const value = Number(payload?.value);
  const currency = String(payload?.currency || '').trim().toUpperCase();
  if (payload?.paid !== true || !eventId || !Number.isFinite(value) || value < 0 || currency !== 'THB') return null;
  return { eventId, value, currency };
}

export function getTikTokCompletePaymentStorageKey(eventId) {
  return `lucky_tiktok_complete_payment_sent_${encodeURIComponent(String(eventId || ''))}`;
}

export function getTikTokInitiateCheckoutEventId(checkoutSessionId) {
  const sessionId = String(checkoutSessionId || '').trim();
  return sessionId ? `stripe_checkout_${sessionId}_initiate_checkout` : '';
}

export function resetTikTokBrowserTrackingForTests() {
  initializationPromise = null;
  initializedPixelId = '';
}
