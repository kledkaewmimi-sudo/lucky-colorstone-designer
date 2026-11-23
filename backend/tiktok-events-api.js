const crypto = require('crypto');

const TIKTOK_EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const TIKTOK_PRODUCT_CONTENT_ID = 'lucky_colorstone_custom_bracelet';
const TIKTOK_PRODUCT_CONTENT_NAME = 'Lucky Colorstone Custom Bracelet';
const TIKTOK_PRODUCT_CONTENT_TYPE = 'product';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDENTIFIER_PATTERN = /^[^\s]{1,512}$/;
const text = (value) => String(value || '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function hashEmail(value) { const email = text(value).toLowerCase(); return EMAIL_PATTERN.test(email) ? sha256(email) : null; }
function hashE164Phone(value) { const raw = text(value); if (!raw.startsWith('+')) return null; const normalized = `+${raw.slice(1).replace(/[\s().-]/g, '')}`; return /^\+[1-9]\d{7,14}$/.test(normalized) ? sha256(normalized) : null; }
function validIdentifier(value) { const normalized = text(value); return IDENTIFIER_PATTERN.test(normalized) ? normalized : null; }
function getOrderPhone(order) { const shipping = order?.shippingInfo && typeof order.shippingInfo === 'object' ? order.shippingInfo : {}; return text(order?.phoneNumber || order?.customerPhone || shipping.phoneNumber); }

function getTikTokAttributionIdentifiers(order) {
  const attribution = order?.tiktokAttribution && typeof order.tiktokAttribution === 'object' ? order.tiktokAttribution : {};
  const first = attribution.firstTouch?.tiktok || {};
  const last = attribution.lastTouch?.tiktok || {};
  return { ttclid: validIdentifier(first.ttclid) || validIdentifier(last.ttclid), ttp: validIdentifier(first.ttp) || validIdentifier(last.ttp) };
}

function getEventSourceUrl(order, fallbackUrl) {
  const attribution = order?.tiktokAttribution && typeof order.tiktokAttribution === 'object' ? order.tiktokAttribution : {};
  try {
    const parsed = new URL(text(attribution.firstTouch?.landingUrl || attribution.lastTouch?.landingUrl));
    if (parsed.protocol === 'https:' && parsed.hostname === 'customize.luckycolorstone.com') return `${parsed.origin}${parsed.pathname}`;
  } catch {}
  return fallbackUrl;
}

function getTikTokCompletePaymentEventId(order) {
  const sessionId = text(order?.stripeCheckoutSessionId);
  return sessionId ? `stripe_checkout_${sessionId}` : null;
}

function buildTikTokUserData({ order, stripeSession }) {
  const data = {};
  const email = hashEmail(stripeSession?.customer_details?.email || stripeSession?.customer_email);
  const phone = hashE164Phone(stripeSession?.customer_details?.phone || getOrderPhone(order));
  const externalId = validIdentifier(order?.analyticsVisitorId);
  const attribution = getTikTokAttributionIdentifiers(order);
  const userAgent = text(order?.analyticsSource?.user_agent).slice(0, 800);
  if (email) data.email = [email];
  if (phone) data.phone = [phone];
  if (externalId) data.external_id = [sha256(externalId)];
  if (attribution.ttclid) data.ttclid = attribution.ttclid;
  if (attribution.ttp) data.ttp = attribution.ttp;
  if (userAgent) data.user_agent = userAgent;
  return data;
}

function buildTikTokCompletePaymentEvent({ order, stripeSession, totalPrice, currency = 'THB', eventTime, fallbackEventSourceUrl }) {
  const eventId = getTikTokCompletePaymentEventId(order);
  const value = Number(totalPrice);
  const normalizedCurrency = text(currency).toUpperCase();
  if (!eventId || !Number.isFinite(value) || value < 0 || normalizedCurrency !== 'THB') return null;
  return {
    event: 'CompletePayment',
    event_time: Math.floor(Number(eventTime) / 1000),
    event_id: eventId,
    user: buildTikTokUserData({ order, stripeSession }),
    properties: {
      content_id: TIKTOK_PRODUCT_CONTENT_ID,
      content_name: TIKTOK_PRODUCT_CONTENT_NAME,
      content_type: TIKTOK_PRODUCT_CONTENT_TYPE,
      contents: [{ content_id: TIKTOK_PRODUCT_CONTENT_ID, content_name: TIKTOK_PRODUCT_CONTENT_NAME, content_type: TIKTOK_PRODUCT_CONTENT_TYPE }],
      value,
      currency: normalizedCurrency
    },
    page: { url: getEventSourceUrl(order, fallbackEventSourceUrl) }
  };
}

function buildTikTokEventsRequest({ pixelId, event, testEventCode = '' }) {
  if (!text(pixelId) || !event) return null;
  const payload = { event_source: 'web', event_source_id: text(pixelId), data: [event] };
  if (text(testEventCode)) payload.test_event_code = text(testEventCode);
  return payload;
}

function summarizeTikTokEventsApiResponse(bodyText) {
  try {
    const payload = JSON.parse(text(bodyText));
    const code = Number(payload?.code);
    return { code: Number.isFinite(code) ? code : null, requestIdPresent: Boolean(text(payload?.request_id)) };
  } catch {
    return { code: null, requestIdPresent: false };
  }
}

module.exports = {
  TIKTOK_EVENTS_API_URL,
  buildTikTokCompletePaymentEvent,
  buildTikTokEventsRequest,
  buildTikTokUserData,
  getTikTokCompletePaymentEventId,
  hashE164Phone,
  hashEmail,
  summarizeTikTokEventsApiResponse
};
