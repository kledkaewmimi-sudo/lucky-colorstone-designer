const crypto = require('crypto');

const FBP_PATTERN = /^fb\.1\.\d{10,16}\.\d+$/;
const FBC_PATTERN = /^fb\.1\.\d{10,16}\.[^\s]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value) {
  return String(value || '').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashEmail(value) {
  const email = text(value).toLowerCase();
  return EMAIL_PATTERN.test(email) ? sha256(email) : null;
}

function hashE164Phone(value) {
  const raw = text(value);
  if (!raw.startsWith('+')) return null;
  const normalized = `+${raw.slice(1).replace(/[\s().-]/g, '')}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? sha256(normalized) : null;
}

function hashExternalId(value) {
  const id = text(value);
  return id ? sha256(id) : null;
}

function getOrderId(order) {
  return text(order?.id || order?.orderId);
}

function getOrderPhone(order) {
  const shippingInfo = order?.shippingInfo && typeof order.shippingInfo === 'object' ? order.shippingInfo : {};
  return text(order?.phoneNumber || order?.customerPhone || shippingInfo.phoneNumber);
}

function validMetaCookie(value, pattern) {
  const candidate = text(value);
  return pattern.test(candidate) ? candidate : null;
}

function getAttributionMeta(order) {
  const attribution = order?.metaAttribution && typeof order.metaAttribution === 'object' ? order.metaAttribution : {};
  const first = attribution.firstTouch?.meta || {};
  const last = attribution.lastTouch?.meta || {};
  return {
    fbp: validMetaCookie(first.fbp, FBP_PATTERN) || validMetaCookie(last.fbp, FBP_PATTERN),
    fbc: validMetaCookie(first.fbc, FBC_PATTERN) || validMetaCookie(last.fbc, FBC_PATTERN)
  };
}

function getEventSourceUrl(order, fallbackUrl) {
  const attribution = order?.metaAttribution && typeof order.metaAttribution === 'object' ? order.metaAttribution : {};
  const candidate = text(attribution.firstTouch?.landingUrl || attribution.lastTouch?.landingUrl);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'customize.luckycolorstone.com' || parsed.hostname === 'uat.customize.luckycolorstone.com')) {
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    // Use the established website fallback when there is no valid persisted customer URL.
  }
  return fallbackUrl;
}

function getCustomerEmail(stripeSession) {
  return text(stripeSession?.customer_details?.email || stripeSession?.customer_email);
}

function getCustomerPhone(order, stripeSession) {
  return text(stripeSession?.customer_details?.phone || getOrderPhone(order));
}

function getCustomerUserAgent(order) {
  return text(order?.analyticsSource?.user_agent).slice(0, 800);
}

function buildMetaPurchaseUserData({ order, stripeSession }) {
  const userData = {};
  const email = hashEmail(getCustomerEmail(stripeSession));
  const phone = hashE164Phone(getCustomerPhone(order, stripeSession));
  const externalId = hashExternalId(getOrderId(order));
  const meta = getAttributionMeta(order);
  const userAgent = getCustomerUserAgent(order);

  if (email) userData.em = [email];
  if (phone) userData.ph = [phone];
  if (externalId) userData.external_id = [externalId];
  if (meta.fbp) userData.fbp = meta.fbp;
  if (meta.fbc) userData.fbc = meta.fbc;
  if (userAgent) userData.client_user_agent = userAgent;
  return userData;
}

function getMetaPurchaseEventId(order) {
  const checkoutSessionId = text(order?.stripeCheckoutSessionId);
  return checkoutSessionId ? `stripe_checkout_${checkoutSessionId}` : null;
}

function buildMetaPurchaseEvent({ order, stripeSession, totalPrice, currency = 'THB', eventTime, fallbackEventSourceUrl }) {
  const eventId = getMetaPurchaseEventId(order);
  if (!eventId || !Number.isFinite(Number(totalPrice))) return null;
  return {
    event_name: 'Purchase',
    event_time: Math.floor(Number(eventTime) / 1000),
    action_source: 'website',
    event_source_url: getEventSourceUrl(order, fallbackEventSourceUrl),
    event_id: eventId,
    user_data: buildMetaPurchaseUserData({ order, stripeSession }),
    custom_data: {
      currency,
      value: Number(totalPrice)
    }
  };
}

module.exports = {
  buildMetaPurchaseEvent,
  buildMetaPurchaseUserData,
  getMetaPurchaseEventId,
  hashE164Phone,
  hashEmail
};
