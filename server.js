const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const { assertSafeUatEnvironment, isUatReadOnlyApiRequest } = require('./uat-backend-guard.js');
const { HANDOFF_TTL_MS, TOKEN_PATTERN: HANDOFF_TOKEN_PATTERN, createHandoffToken, normalizeHandoffPayload } = require('./line-auth-handoff.js');
const {
  DEFERRED_LOGIN_QA_TTL_MS,
  DEFERRED_LOGIN_QA_TOKEN_PATTERN,
  createDeferredLoginQaToken,
  isDeferredLoginQaSessionActive
} = require('./deferred-login-qa-session.js');

const workspaceDir = __dirname;
const bundledDataDir = path.join(workspaceDir, "data");
const isFixtureOnlyUatBackend = true;
const uatAllowedOrigin = 'https://uat.customize.luckycolorstone.com';

// This branch is deployable only as the isolated fixture-backed UAT service.
// Refuse startup unless the host declares that identity and carries no service credentials.
assertSafeUatEnvironment();

function resolveMutableDataDir() {
  const configuredDataDir = process.env.DATA_DIR || process.env.RENDER_PERSISTENT_DATA_DIR || "";
  const trimmedDataDir = String(configuredDataDir).trim();
  if (!trimmedDataDir) return bundledDataDir;
  return path.resolve(workspaceDir, trimmedDataDir);
}

const dataDir = resolveMutableDataDir();
const dataFileNames = {
  stones: "stones.json",
  charms: "charms.json",
  spacers: "spacers.json",
  orders: "orders.json",
  settings: "settings.json",
  analyticsSessions: "analytics_sessions.json",
  analyticsEvents: "analytics_events.json",
  analyticsErrors: "analytics_errors.json"
};
const dataFiles = Object.fromEntries(
  Object.entries(dataFileNames).map(([key, fileName]) => [key, path.join(dataDir, fileName)])
);
const bundledDataFiles = Object.fromEntries(
  Object.entries(dataFileNames).map(([key, fileName]) => [key, path.join(bundledDataDir, fileName)])
);

const defaultFileText = {
  stones: "[]",
  charms: "[]",
  spacers: "[]",
  orders: "[]",
  settings: "{\"globalDiscountPercent\":20,\"discountEnabled\":true,\"showDiscountBanner\":true}",
  analyticsSessions: "[]",
  analyticsEvents: "[]",
  analyticsErrors: "[]"
};

const resetSnapshots = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function stripBom(text = "") {
  return String(text).replace(/^\uFEFF+/, "");
}

function normalizeJsonText(text, fallback) {
  const normalized = stripBom(text).trim();
  return normalized || fallback;
}

function ensureDataDirectory() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function ensureDataFile(filePath, fallbackText, sourceFilePath = "") {
  if (!fs.existsSync(filePath)) {
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
      fs.copyFileSync(sourceFilePath, filePath);
    } else {
      fs.writeFileSync(filePath, fallbackText, "utf8");
    }
  }

  const raw = fs.readFileSync(filePath);
  if (!raw.length || !normalizeJsonText(raw.toString("utf8"), "")) {
    fs.writeFileSync(filePath, fallbackText, "utf8");
  }
}

function readJsonFileText(filePath, fallback = "[]") {
  if (!fs.existsSync(filePath)) return fallback;

  const raw = fs.readFileSync(filePath);
  if (!raw.length) return fallback;

  let bytes = raw;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }

  return normalizeJsonText(bytes.toString("utf8"), fallback);
}

function readJsonFile(filePath, fallbackText = "[]") {
  const text = readJsonFileText(filePath, fallbackText);
  return JSON.parse(text);
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function seedDatabase() {
  ensureDataDirectory();
  ensureDataFile(dataFiles.stones, defaultFileText.stones, bundledDataFiles.stones);
  ensureDataFile(dataFiles.charms, defaultFileText.charms, bundledDataFiles.charms);
  ensureDataFile(dataFiles.spacers, defaultFileText.spacers, bundledDataFiles.spacers);
  ensureDataFile(dataFiles.orders, defaultFileText.orders, bundledDataFiles.orders);
  ensureDataFile(dataFiles.settings, defaultFileText.settings, bundledDataFiles.settings);
  ensureDataFile(dataFiles.analyticsSessions, defaultFileText.analyticsSessions, bundledDataFiles.analyticsSessions);
  ensureDataFile(dataFiles.analyticsEvents, defaultFileText.analyticsEvents, bundledDataFiles.analyticsEvents);
  ensureDataFile(dataFiles.analyticsErrors, defaultFileText.analyticsErrors, bundledDataFiles.analyticsErrors);

  Object.entries(dataFiles).forEach(([key, filePath]) => {
    const fallback = defaultFileText[key];
    resetSnapshots.set(filePath, readJsonFileText(filePath, fallback));
  });
}

function restoreSeedData() {
  Object.entries(dataFiles).forEach(([key, filePath]) => {
    const fallback = defaultFileText[key];
    const snapshot = resetSnapshots.get(filePath) || fallback;
    fs.writeFileSync(filePath, snapshot, "utf8");
  });
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", isFixtureOnlyUatBackend ? uatAllowedOrigin : "*");
  res.setHeader("Access-Control-Allow-Methods", isFixtureOnlyUatBackend ? "GET, OPTIONS" : "GET, POST, PUT, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  setCorsHeaders(res);
  res.end(payload);
}

function sendJsonString(res, statusCode, jsonString) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  setCorsHeaders(res);
  res.end(jsonString);
}

function sendText(res, statusCode, text) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  setCorsHeaders(res);
  res.end(text);
}

const DEFERRED_LOGIN_QA_COOKIE = '__Host-lucky-deferred-login-qa';
const DEFERRED_LOGIN_QA_PROBE_COOKIE = 'lucky_deferred_login_qa_probe';

function getRequestCookie(req, name) {
  const target = `${name}=`;
  const part = String(req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(target));
  return part ? part.slice(target.length) : '';
}

function setDeferredLoginQaCookies(res, token = '', maxAgeSeconds = 0) {
  const suffix = `Path=/; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`;
  const sessionCookie = token
    ? `${DEFERRED_LOGIN_QA_COOKIE}=${token}; HttpOnly; ${suffix}`
    : `${DEFERRED_LOGIN_QA_COOKIE}=; HttpOnly; ${suffix}`;
  const probeCookie = token
    ? `${DEFERRED_LOGIN_QA_PROBE_COOKIE}=1; ${suffix}`
    : `${DEFERRED_LOGIN_QA_PROBE_COOKIE}=; ${suffix}`;
  res.setHeader('Set-Cookie', [sessionCookie, probeCookie]);
}

function hasDeferredLoginQaAdminAccess(req) {
  const secret = getEnvValue('DEFERRED_LOGIN_QA_ADMIN_SECRET');
  const provided = String(req.headers.authorization || '');
  const expected = secret ? `Bearer ${secret}` : '';
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function hasCorruptedThaiText(value) {
  const text = String(value || '').trim();
  return text.includes('\uFFFD') || /\?{3,}/.test(text);
}

function hasCorruptedThaiCatalogText(record = {}) {
  return [record.nameTh, record.meaningTh, record.descriptionTh, record.meaning?.th, record.description?.th]
    .some(hasCorruptedThaiText);
}

function validateManualStoneCosts(record = {}) {
  for (const field of ['manualCost4mm', 'manualCost6mm', 'manualCost10mm']) {
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Manual stone cost must be a non-negative number.');
  }
}

function validateManualSpacerCost(record = {}) {
  const value = record.manualCost;
  if (value === undefined || value === null || value === '') return;
  if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Manual spacer cost must be a non-negative number.');
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

async function readRequestBodyBuffer(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const rawBody = await readRequestBody(req);
  const trimmedBody = normalizeJsonText(rawBody, "");
  if (!trimmedBody) return null;
  return JSON.parse(trimmedBody);
}

function nextRandomOrderId() {
  return `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
}

function getEnvValue(name, defaultValue = "") {
  const value = process.env[name];
  return value && String(value).trim() ? String(value) : defaultValue;
}

function getNestedJsonValue(target, pathValue) {
  if (!target || !pathValue) return null;
  return String(pathValue)
    .split(".")
    .reduce((current, segment) => {
      if (current == null || typeof current !== "object") return null;
      return Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : null;
    }, target);
}

function getStripeSecretKey() {
  return getEnvValue("STRIPE_SECRET_KEY");
}

function getMetaConversionsApiConfig() {
  const pixelId = getEnvValue("META_PIXEL_ID");
  const accessToken = getEnvValue("META_CONVERSIONS_API_ACCESS_TOKEN");
  return pixelId && accessToken ? { pixelId, accessToken } : null;
}

async function sendMetaPurchaseEvent(order) {
  const config = getMetaConversionsApiConfig();
  const checkoutSessionId = String(order?.stripeCheckoutSessionId || "").trim();
  const totalPrice = getOrderTotalPrice(order);
  if (!config || !checkoutSessionId || !Number.isFinite(Number(totalPrice))) {
    return { sent: false, skipped: "not_configured_or_incomplete" };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(config.pixelId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: config.accessToken,
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: "https://customize.luckycolorstone.com/",
        event_id: `stripe_checkout_${checkoutSessionId}`,
        custom_data: {
          currency: "THB",
          value: Number(totalPrice)
        }
      }]
    })
  });

  if (!response.ok) throw new Error(`Meta Conversions API returned HTTP ${response.status}.`);
  return { sent: true };
}

function getLineChannelAccessToken() {
  return getEnvValue("LINE_CHANNEL_ACCESS_TOKEN");
}

function getLineChannelSecret() {
  return getEnvValue("LINE_CHANNEL_SECRET");
}

let lineOaAddFriendUrlCache = { value: "", expiresAt: 0 };

async function getConfiguredLineOaAddFriendUrl() {
  if (lineOaAddFriendUrlCache.expiresAt > Date.now()) {
    return lineOaAddFriendUrlCache.value || null;
  }

  const accessToken = getLineChannelAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000)
    });
    const payload = response.ok ? await response.json() : null;
    const basicId = String(payload?.basicId || "").trim();
    const value = /^@[A-Za-z0-9._-]+$/.test(basicId)
      ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`
      : "";
    lineOaAddFriendUrlCache = { value, expiresAt: Date.now() + (10 * 60 * 1000) };
    return value || null;
  } catch {
    return null;
  }
}

function getSafeOrigin(origin) {
  const fallbackOrigin = "https://customize.luckycolorstone.com";
  if (!origin) return fallbackOrigin;

  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return fallbackOrigin;
  }

  return fallbackOrigin;
}

function normalizeCurrencyAmount(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Order total must be greater than zero.");
  }

  return Math.round(numericAmount * 100);
}

function parseStripeApiResponse(text) {
  const parsed = JSON.parse(normalizeJsonText(text, "{}"));
  if (parsed?.error?.message) {
    throw new Error(parsed.error.message);
  }
  return parsed;
}

function parseJsonText(text) {
  const trimmedText = normalizeJsonText(text, "");
  if (!trimmedText) return null;
  return JSON.parse(trimmedText);
}

function createLineSignature(rawBodyBuffer) {
  const lineChannelSecret = getLineChannelSecret();
  if (!lineChannelSecret) {
    throw new Error("LINE_CHANNEL_SECRET is not configured.");
  }

  return crypto
    .createHmac("sha256", lineChannelSecret)
    .update(rawBodyBuffer)
    .digest("base64");
}

function verifyLineSignature(rawBodyBuffer, signatureHeader) {
  const providedSignature = String(signatureHeader || "").trim();
  if (!providedSignature) {
    return false;
  }

  const expectedSignature = createLineSignature(rawBodyBuffer);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function sendLinePushMessages({ userId, messages }) {
  const lineChannelAccessToken = getLineChannelAccessToken();
  if (!lineChannelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("LINE push message requires a userId.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("LINE push message requires at least one message.");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineChannelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: normalizedUserId,
      messages
    })
  });

  if (response.ok) {
    return {
      success: true
    };
  }

  const responseText = await response.text();
  throw new Error(`LINE push API returned HTTP ${response.status}: ${responseText}`);
}

async function sendLinePushMessage(to, messages) {
  return await sendLinePushMessages({
    userId: to,
    messages
  });
}

async function sendLinePushTextMessage({ userId, text }) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    throw new Error("LINE push message requires text.");
  }

  return await sendLinePushMessages({
    userId,
    messages: [
      {
        type: "text",
        text: normalizedText
      }
    ]
  });
}

function getOrderLineUserId(order) {
  return String(order?.lineUserId || "").trim();
}

function getOrderId(order) {
  return String(order?.id || order?.orderId || "").trim();
}

function getAdminLineTargets() {
  const targets = [];
  const seenTargets = new Set();
  const addTarget = (type, rawValue) => {
    const to = String(rawValue || "").trim();
    if (!to || seenTargets.has(to)) return;
    seenTargets.add(to);
    targets.push({ type, to });
  };

  String(process.env.ADMIN_LINE_USER_IDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((userId) => addTarget("user", userId));

  addTarget("group", process.env.ADMIN_LINE_GROUP_ID);
  return targets;
}

function parseMoneyValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function getOrderCheckoutSummary(order) {
  const summary = order?.checkoutSummary;
  if (!summary || typeof summary !== "object") return null;
  return summary;
}

function getOrderItemizedBilling(order) {
  return Array.isArray(order?.itemizedBilling) ? order.itemizedBilling : [];
}

function sumOrderItemizedBilling(order) {
  const itemizedBilling = getOrderItemizedBilling(order);
  if (itemizedBilling.length === 0) return null;

  const subtotal = itemizedBilling.reduce((sum, item) => {
    const itemTotal = parseMoneyValue(item?.totalPrice);
    if (itemTotal != null) {
      return sum + itemTotal;
    }

    const unitPrice = parseMoneyValue(item?.unitPrice ?? item?.price ?? item?.priceUnit);
    const quantity = parseMoneyValue(item?.quantity ?? item?.count) ?? 1;
    if (unitPrice != null) {
      return sum + (unitPrice * quantity);
    }

    return sum;
  }, 0);

  return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null;
}

function normalizeCanonicalOrderPricing(order) {
  if (!order || typeof order !== "object") return order;

  const nextOrder = { ...order };
  const summary = getOrderCheckoutSummary(order);
  const itemizedSubtotal = sumOrderItemizedBilling(order);
  const canonicalSubtotal = parseMoneyValue(summary?.subtotal) ?? parseMoneyValue(order.subtotal) ?? itemizedSubtotal;
  const canonicalDiscountPercent = parseMoneyValue(summary?.discountPercent) ?? parseMoneyValue(order.discountPercent) ?? 20;
  const canonicalDiscountAmount = parseMoneyValue(summary?.discountAmount) ?? parseMoneyValue(order.discountAmount);
  const canonicalFinalPrice =
    parseMoneyValue(summary?.finalPrice) ??
    parseMoneyValue(summary?.totalPrice) ??
    parseMoneyValue(order.finalPrice) ??
    parseMoneyValue(order.totalPrice) ??
    parseMoneyValue(order.netPrice);

  if (canonicalSubtotal != null) {
    nextOrder.subtotal = canonicalSubtotal;
  }

  if (canonicalDiscountPercent != null) {
    nextOrder.discountPercent = canonicalDiscountPercent;
  }

  if (canonicalDiscountAmount != null) {
    nextOrder.discountAmount = canonicalDiscountAmount;
  } else if (canonicalSubtotal != null && canonicalDiscountPercent != null) {
    nextOrder.discountAmount = Math.round(canonicalSubtotal * (canonicalDiscountPercent / 100));
  }

  if (canonicalFinalPrice != null) {
    nextOrder.finalPrice = canonicalFinalPrice;
    nextOrder.totalPrice = canonicalFinalPrice;
    nextOrder.netPrice = canonicalFinalPrice;
  }

  if (summary && typeof summary === "object") {
    nextOrder.checkoutSummary = {
      subtotal: parseMoneyValue(summary.subtotal) ?? nextOrder.subtotal ?? null,
      discountPercent: parseMoneyValue(summary.discountPercent) ?? nextOrder.discountPercent ?? 20,
      discountAmount: parseMoneyValue(summary.discountAmount) ?? nextOrder.discountAmount ?? null,
      finalPrice: parseMoneyValue(summary.finalPrice) ??
        parseMoneyValue(summary.totalPrice) ??
        nextOrder.finalPrice ??
        nextOrder.totalPrice ??
        nextOrder.netPrice ??
        null
    };
  } else if (canonicalFinalPrice != null || canonicalSubtotal != null) {
    nextOrder.checkoutSummary = {
      subtotal: nextOrder.subtotal ?? null,
      discountPercent: nextOrder.discountPercent ?? 20,
      discountAmount: nextOrder.discountAmount ?? null,
      finalPrice: nextOrder.finalPrice ?? nextOrder.totalPrice ?? nextOrder.netPrice ?? null
    };
  }

  return nextOrder;
}

function getOrderTrackingNumber(order) {
  const candidateFields = [
    "trackingNumber",
    "trackingCode",
    "trackingNo",
    "shippingTrackingNumber",
    "shippingTrackingCode",
    "shippingTrackingNo",
    "shipmentTrackingNumber",
    "shipmentTrackingCode",
    "shipmentTrackingNo",
    "parcelTrackingNumber",
    "waybillNumber"
  ];

  for (const fieldName of candidateFields) {
    const value = String(order?.[fieldName] || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getOrderShippingCarrierDisplay(order) {
  const shippingCarrier = String(
    order?.carrierName ||
    order?.shippingCarrierName ||
    order?.shipmentCarrierName ||
    order?.carrier ||
    order?.shippingCarrier ||
    order?.shipmentCarrier ||
    ""
  ).trim();
  const shippingCarrierCustom = String(
    order?.shippingCarrierCustom ||
    order?.carrierCustom ||
    order?.customCarrier ||
    ""
  ).trim();

  if (shippingCarrier === "Other" || shippingCarrier === "\u0E2D\u0E37\u0E48\u0E19\u0E46") {
    return shippingCarrierCustom || "";
  }

  return shippingCarrier;
}

function formatLineCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `฿${Math.round(amount).toLocaleString("th-TH")}`;
}

function getOrderTotalPrice(order) {
  const candidates = [
    order?.checkoutSummary?.finalPrice,
    order?.checkoutSummary?.totalPrice,
    order?.finalPrice,
    order?.totalPrice,
    order?.netPrice,
    order?.total,
    order?.amountTotal
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value == null ? null : Number(value);
}

function normalizeLineUri(value, fallback = "https://customize.luckycolorstone.com/") {
  const rawValue = String(value || "").trim();
  const candidate = rawValue || fallback;

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through to the normalized fallback below.
  }

  if (!fallback) {
    return null;
  }

  try {
    const parsedFallback = new URL(fallback);
    return parsedFallback.protocol === "http:" || parsedFallback.protocol === "https:"
      ? parsedFallback.toString()
      : null;
  } catch {
    return null;
  }
}

function getPublicCustomerOrigin() {
  const configuredOrigin = normalizeLineUri(
    process.env.PUBLIC_CUSTOMER_ORIGIN || process.env.CUSTOMER_APP_URL,
    null
  );
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  return "https://customize.luckycolorstone.com";
}

function buildOrderDetailUrl(order) {
  const providedUrl = normalizeLineUri(
    order?.orderDetailUrl || order?.detailUrl || order?.orderUrl,
    null
  );
  if (providedUrl) return providedUrl;

  const orderId = getOrderId(order);
  const url = new URL(getPublicCustomerOrigin());
  if (orderId) {
    url.searchParams.set("orderId", orderId);
  }
  return url.toString();
}

function getOrderDetailUrl(order) {
  return buildOrderDetailUrl(order);
}

function normalizeCarrierKey(carrierName) {
  return String(carrierName || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.\-_\s]+/g, "");
}

function buildCarrierTrackingUrl(carrierName, trackingNumber) {
  const normalizedCarrier = normalizeCarrierKey(carrierName);
  const encodedTrackingNumber = encodeURIComponent(String(trackingNumber || "").trim());
  if (!encodedTrackingNumber) return null;

  if (
    normalizedCarrier.includes("shopeeexpress") ||
    normalizedCarrier.includes("shopeexpress") ||
    normalizedCarrier.includes("shopeex") ||
    normalizedCarrier.includes("spx")
  ) {
    return `https://spx.co.th/m/track?tracking_number=${encodedTrackingNumber}`;
  }

  if (normalizedCarrier.includes("kerry")) {
    return `https://th.kerryexpress.com/th/track/?track=${encodedTrackingNumber}`;
  }

  if (normalizedCarrier.includes("flash")) {
    return `https://www.flashexpress.co.th/fle/tracking?se=${encodedTrackingNumber}`;
  }

  if (
    normalizedCarrier.includes("jandt") ||
    normalizedCarrier.includes("jtexpress") ||
    normalizedCarrier.includes("jnt")
  ) {
    return `https://www.jtexpress.co.th/index/query/gzquery.html?bills=${encodedTrackingNumber}`;
  }

  if (
    normalizedCarrier.includes("thailandpost") ||
    normalizedCarrier.includes("thaipost") ||
    normalizedCarrier.includes("\u0E44\u0E1B\u0E23\u0E29\u0E13\u0E35\u0E22\u0E4C\u0E44\u0E17\u0E22")
  ) {
    return `https://track.thailandpost.co.th/?trackNumber=${encodedTrackingNumber}`;
  }

  if (normalizedCarrier.includes("dhl")) {
    return `https://www.dhl.com/th-en/home/tracking.html?tracking-id=${encodedTrackingNumber}`;
  }

  if (normalizedCarrier.includes("ninjavan") || normalizedCarrier.includes("ninja")) {
    return `https://www.ninjavan.co/th-th/tracking?id=${encodedTrackingNumber}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(`${carrierName || "tracking"} ${trackingNumber}`)}`;
}

function buildTrackingUrl(order) {
  const providedUrl = normalizeLineUri(
    order?.trackingUrl || order?.shipmentTrackingUrl || order?.shippingTrackingUrl,
    null
  );
  if (providedUrl) return providedUrl;

  const trackingNumber = getOrderTrackingNumber(order);
  if (!trackingNumber) return null;

  return buildCarrierTrackingUrl(getOrderShippingCarrierDisplay(order), trackingNumber);
}

function getOrderTrackingUrl(order) {
  return buildTrackingUrl(order);
}

function buildFlexField(label, value) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: String(label || ""),
        size: "xs",
        color: "#7E6C90",
        flex: 4,
        wrap: true
      },
      {
        type: "text",
        text: String(value || "-"),
        size: "xs",
        color: "#40304D",
        weight: "bold",
        flex: 5,
        align: "end",
        wrap: true
      }
    ]
  };
}

function buildLuckyColorstoneStatusFlexMessage({
  altText,
  label,
  title,
  bodyLines,
  fields,
  buttonLabel,
  buttonUrl
}) {
  const footerUri = normalizeLineUri(buttonUrl, null);
  const bubble = {
    type: "flex",
    altText: String(altText || "LUCKY.COLORSTONE order update").slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        backgroundColor: "#FFFDF9",
        contents: [
          {
            type: "text",
            text: "LUCKY.COLORSTONE",
            size: "xs",
            weight: "bold",
            color: "#6B1D2F"
          },
          {
            type: "text",
            text: String(label || ""),
            size: "xxs",
            weight: "bold",
            color: "#9E8DAE"
          },
          {
            type: "text",
            text: String(title || ""),
            size: "lg",
            weight: "bold",
            color: "#40304D",
            wrap: true,
            margin: "sm"
          },
          {
            type: "text",
            text: Array.isArray(bodyLines) ? bodyLines.join("\n") : String(bodyLines || ""),
            size: "sm",
            color: "#554466",
            wrap: true,
            margin: "md",
            lineSpacing: "4px"
          },
          {
            type: "separator",
            margin: "lg",
            color: "#E8E1D5"
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "lg",
            contents: fields
          }
        ]
      }
    }
  };

  if (footerUri) {
    bubble.contents.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      backgroundColor: "#FFFDF9",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#6B1D2F",
          action: {
            type: "uri",
            label: String(buttonLabel || "View"),
            uri: footerUri
          }
        }
      ]
    };
  }

  return bubble;
}

function buildPaymentSuccessFlexMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const totalPrice = getOrderTotalPrice(order);

  return buildLuckyColorstoneStatusFlexMessage({
    altText: `LUCKY.COLORSTONE Order Confirmed ${orderId}`,
    label: "Order Confirmed",
    title: "ชำระเงินเรียบร้อยแล้ว",
    bodyLines: [
      "ขอบคุณสำหรับคำสั่งซื้อค่ะ",
      "เราได้รับยอดชำระเรียบร้อยแล้ว และกำไลของคุณกำลังเข้าสู่ขั้นตอนการจัดทำอย่างพิถีพิถัน"
    ],
    fields: [
      buildFlexField("เลขออเดอร์", orderId),
      buildFlexField("ยอดชำระ", totalPrice == null ? "-" : formatLineCurrency(totalPrice)),
      buildFlexField("สถานะ", "กำลังจัดทำ")
    ],
    buttonLabel: "ดูรายละเอียดคำสั่งซื้อ",
    buttonUrl: getOrderDetailUrl(order)
  });
}

function buildShippedFlexMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const shippingCarrier = getOrderShippingCarrierDisplay(order) || "-";
  const trackingNumber = getOrderTrackingNumber(order) || "-";

  return buildLuckyColorstoneStatusFlexMessage({
    altText: `LUCKY.COLORSTONE Shipment Notice ${orderId}`,
    label: "Shipment Notice",
    title: "จัดส่งกำไลเรียบร้อยแล้ว",
    bodyLines: [
      "กำไลของคุณถูกส่งออกจากร้านแล้วค่ะ",
      "สามารถติดตามสถานะพัสดุได้จากข้อมูลด้านล่าง"
    ],
    fields: [
      buildFlexField("เลขออเดอร์", orderId),
      buildFlexField("ขนส่ง", shippingCarrier),
      buildFlexField("เลขพัสดุ", trackingNumber)
    ],
    buttonLabel: "ติดตามพัสดุ",
    buttonUrl: getOrderTrackingUrl(order)
  });
}

function buildPaymentSuccessFallbackLineMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const totalPrice = getOrderTotalPrice(order);
  return [
    "ชำระเงินเรียบร้อยแล้ว",
    "ขอบคุณสำหรับคำสั่งซื้อค่ะ",
    "เราได้รับยอดชำระเรียบร้อยแล้ว และกำไลของคุณกำลังเข้าสู่ขั้นตอนการจัดทำอย่างพิถีพิถัน",
    `เลขออเดอร์: ${orderId}`,
    `ยอดชำระ: ${totalPrice == null ? "-" : formatLineCurrency(totalPrice)}`,
    "สถานะ: กำลังจัดทำ"
  ].join("\n");
}

function buildShippedFallbackLineMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const shippingCarrier = getOrderShippingCarrierDisplay(order);
  const trackingNumber = getOrderTrackingNumber(order);
  const lines = [
    "จัดส่งกำไลเรียบร้อยแล้ว",
    "กำไลของคุณถูกส่งออกจากร้านแล้วค่ะ",
    "สามารถติดตามสถานะพัสดุได้จากข้อมูลด้านล่าง",
    `เลขออเดอร์: ${orderId}`
  ];

  if (shippingCarrier) {
    lines.push(`ขนส่ง: ${shippingCarrier}`);
  }

  if (trackingNumber) {
    lines.push(`เลขพัสดุ: ${trackingNumber}`);
  }

  return lines.join("\n");
}

async function sendLineFlexMessageWithTextFallback({ userId, flexMessage, fallbackText }) {
  try {
    return await sendLinePushMessages({
      userId,
      messages: [flexMessage]
    });
  } catch (error) {
    console.error("LINE Flex message failed; sending plain text fallback.", error);
    return await sendLinePushTextMessage({
      userId,
      text: fallbackText
    });
  }
}

function getStripeWebhookSecret() {
  return getEnvValue("STRIPE_WEBHOOK_SECRET");
}

function getStoneSellingPrice(stone, size) {
  const price = Number(stone?.[`p${Number(size)}`]);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function getCatalogSellingPrice(item) {
  const price = Number(item?.pricing?.base ?? item?.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

async function buildAuthoritativeStripeOrder(clientOrder = {}) {
  const sequence = Array.isArray(clientOrder.braceletSequence) ? clientOrder.braceletSequence : [];
  if (!sequence.length) throw new Error("Bracelet configuration is required.");
  const [catalogs, settings] = await Promise.all([readStockCatalogMapsForOrder(), readSettingsForApi()]);
  const billing = [];
  for (const component of sequence) {
    const type = String(component?.type || component?.componentType || "").toLowerCase();
    if (type === "empty") continue;
    if (!['stone', 'charm', 'spacer'].includes(type)) throw new Error("Unsupported bracelet component.");
    const id = String(type === 'stone' ? (component.stoneId || component.id) : type === 'charm' ? (component.charmId || component.id) : (component.spacerId || component.id)).trim();
    const item = catalogs[type].get(id);
    if (!id || !item || !isCatalogItemAvailable(item)) throw new Error("A selected catalog item is unavailable. Please refresh and try again.");
    let unitPrice;
    let size = null;
    if (type === 'stone') {
      size = Number(component.size || component.sizeMm || clientOrder.beadSize);
      if (!Array.isArray(item.sizes) || !item.sizes.map(Number).includes(size)) throw new Error("The selected stone size is unavailable.");
      unitPrice = getStoneSellingPrice(item, size);
    } else {
      unitPrice = getCatalogSellingPrice(item);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("A selected catalog item has invalid pricing.");
    billing.push({ type, id, stoneId: type === 'stone' ? id : undefined, charmId: type === 'charm' ? id : undefined, spacerId: type === 'spacer' ? id : undefined, size, quantity: 1, unitPrice, totalPrice: unitPrice });
  }
  if (!billing.length) throw new Error("Bracelet configuration is empty.");
  const subtotal = billing.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountPercent = settings?.discountEnabled === false ? 0 : Math.max(0, Number(settings?.globalDiscountPercent ?? 20));
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const finalPrice = subtotal - discountAmount;
  const clientTotal = parseMoneyValue(clientOrder?.checkoutSummary?.finalPrice ?? clientOrder.finalPrice ?? clientOrder.totalPrice);
  if (clientTotal != null && Math.abs(clientTotal - finalPrice) > 0.01) {
    const error = new Error("Price changed. Please refresh before checkout.");
    error.statusCode = 409;
    throw error;
  }
  return {
    ...clientOrder,
    id: String(clientOrder.id || nextRandomOrderId()),
    itemizedBilling: billing,
    subtotal, discountPercent, discountAmount, shippingAmount: 0,
    finalPrice, totalPrice: finalPrice, netPrice: finalPrice,
    checkoutSummary: { subtotal, discountPercent, discountAmount, shippingAmount: 0, finalPrice, totalPrice: finalPrice, netPrice: finalPrice },
    paymentMethod: 'stripe_checkout', stripePaymentStatus: 'pending_payment', status: 'Pending Payment'
  };
}

function verifyStripeWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const fields = Object.fromEntries(String(signatureHeader).split(',').map((part) => part.split('=').map((value) => value.trim())));
  const timestamp = fields.t;
  const signatures = String(signatureHeader).split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  return signatures.some((signature) => signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
}

function getPublicCrmOrigin() {
  const configuredOrigin = normalizeLineUri(
    process.env.PUBLIC_CRM_ORIGIN || process.env.CRM_URL,
    null
  );
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  return "https://crm.luckycolorstone.com";
}

function buildCrmOrderUrl(order) {
  const providedUrl = normalizeLineUri(order?.crmOrderUrl || order?.adminOrderUrl, null);
  return providedUrl || getPublicCrmOrigin();
}

function getOrderCustomerPhone(order) {
  const shippingInfo = order?.shippingInfo && typeof order.shippingInfo === "object"
    ? order.shippingInfo
    : {};
  return String(
    order?.phoneNumber ||
    order?.customerPhone ||
    shippingInfo.phoneNumber ||
    ""
  ).trim();
}

function getOrderPaymentStatusText(order) {
  const status = String(order?.status || "").trim();
  const stripePaymentStatus = String(order?.stripePaymentStatus || order?.paymentStatus || "").trim();
  if (status && stripePaymentStatus) return `${status} / ${stripePaymentStatus}`;
  return status || stripePaymentStatus || "-";
}

function getOrderBraceletLengthCm(order) {
  const candidates = [
    order?.braceletLengthCm,
    order?.checkoutSummary?.braceletLengthCm,
    order?.lengthCm
  ];
  const directLength = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  if (directLength != null) return Number(directLength);

  const wristSize = Number(order?.wristSize ?? order?.checkoutSummary?.wristSize);
  return Number.isFinite(wristSize) && wristSize > 0 ? wristSize + 1.5 : null;
}

function getAdminOrderItemName(item) {
  return String(
    item?.nameTh ||
    item?.name ||
    item?.nameEn ||
    item?.itemName ||
    item?.stoneName ||
    item?.charmName ||
    item?.spacerName ||
    item?.stoneId ||
    item?.charmId ||
    item?.spacerId ||
    item?.id ||
    "item"
  ).trim();
}

function buildAdminOrderItemSummary(order) {
  const itemizedBilling = Array.isArray(order?.itemizedBilling)
    ? order.itemizedBilling
    : Array.isArray(order?.checkoutSummary?.itemizedBilling)
      ? order.checkoutSummary.itemizedBilling
      : [];

  const counts = new Map();
  itemizedBilling.forEach((item) => {
    const name = getAdminOrderItemName(item);
    if (!name) return;
    const quantity = Number(item?.quantity ?? item?.count ?? item?.qty ?? 1);
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    counts.set(name, (counts.get(name) || 0) + safeQuantity);
  });

  if (counts.size === 0 && Array.isArray(order?.braceletSequence)) {
    order.braceletSequence.forEach((item) => {
      if (item?.isEmpty || item?.empty) return;
      const name = getAdminOrderItemName(item);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  }

  if (counts.size === 0 && Array.isArray(order?.beads)) {
    order.beads.forEach((item) => {
      const name = getAdminOrderItemName(item);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  }

  const parts = Array.from(counts.entries()).map(([name, count]) => `${name} x ${count}`);
  if (parts.length === 0) return "-";
  const visibleParts = parts.slice(0, 8);
  const remainder = parts.length - visibleParts.length;
  return remainder > 0 ? `${visibleParts.join(", ")} +${remainder} more` : visibleParts.join(", ");
}

function buildAdminOrderNotification(order) {
  const orderId = getOrderId(order) || "-";
  const totalPrice = getOrderTotalPrice(order);
  const customerName = String(order?.customerName || order?.recipientName || "").trim() || "-";
  const customerPhone = getOrderCustomerPhone(order) || "-";
  const wristSize = Number(order?.wristSize ?? order?.checkoutSummary?.wristSize);
  const braceletLengthCm = getOrderBraceletLengthCm(order);
  const beadSize = String(order?.beadSize || order?.checkoutSummary?.beadSize || "").trim() || "-";
  const createdTime = String(order?.paidAt || order?.paymentReceivedAt || order?.date || new Date().toISOString());

  const text = [
    "มีออเดอร์ใหม่ 🎉",
    `เลขออเดอร์: ${orderId}`,
    `ยอดชำระ: ${totalPrice == null ? "-" : formatLineCurrency(totalPrice)}`,
    `สถานะ: ${getOrderPaymentStatusText(order)}`,
    `ลูกค้า: ${customerName}`,
    `เบอร์: ${customerPhone}`,
    `ข้อมือ: ${Number.isFinite(wristSize) ? `${wristSize.toFixed(1)} cm` : "-"}`,
    `ความยาวกำไล: ${braceletLengthCm == null ? "-" : `${braceletLengthCm.toFixed(1)} cm`}`,
    `ขนาดเม็ด: ${beadSize === "mixed" ? "mixed" : `${beadSize} mm`}`,
    `รายการ: ${buildAdminOrderItemSummary(order)}`,
    `เวลา: ${createdTime}`,
    "",
    `CRM: ${buildCrmOrderUrl(order)}`,
    `รายละเอียดลูกค้า: ${getOrderDetailUrl(order)}`
  ].join("\n");

  return [
    {
      type: "text",
      text: text.slice(0, 4900)
    }
  ];
}

function isAdminOrderNotificationEligible(order) {
  const notifications = getOrderNotifications(order);
  if (notifications.adminOrderCreatedSentAt) {
    return false;
  }

  const status = String(order?.status || "").trim().toLowerCase();
  const stripePaymentStatus = String(order?.stripePaymentStatus || order?.paymentStatus || "").trim().toLowerCase();
  return status === "payment received" || status === "paid" || stripePaymentStatus === "paid";
}

async function notifyAdminOrderCreated(order) {
  if (!isAdminOrderNotificationEligible(order)) {
    return { sent: false, skipped: "not-paid" };
  }

  const targets = getAdminLineTargets();
  if (targets.length === 0) {
    console.info("[admin-notify] skipped: no admin target configured");
    return { sent: false, skipped: "no-target" };
  }

  const messages = buildAdminOrderNotification(order);
  const results = [];
  for (const target of targets) {
    try {
      await sendLinePushMessage(target.to, messages);
      console.info(`[admin-notify] sent ${getOrderId(order)} to ${target.type}:${target.to}`);
      results.push({ ...target, sent: true });
    } catch (error) {
      console.warn(`[admin-notify] failed ${getOrderId(order)} to ${target.type}:${target.to}:`, error?.message || error);
      results.push({ ...target, sent: false, error: error?.message || String(error) });
    }
  }

  return {
    sent: results.some((result) => result.sent),
    results
  };
}

function getOrderNotifications(order) {
  if (!order?.notifications || typeof order.notifications !== "object") {
    return {};
  }
  return order.notifications;
}

function buildPaidOrderLineMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  return [
    "ขอบคุณสำหรับคำสั่งซื้อค่ะ",
    "ออเดอร์ของคุณชำระเงินเรียบร้อยแล้ว",
    "ตอนนี้กำลังอยู่ในขั้นตอนการจัดทำกำไล",
    `เลขออเดอร์: ${orderId}`
  ].join("\n");
}

function buildShippedOrderLineMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const trackingNumber = getOrderTrackingNumber(order);
  const lines = [
    "กำไลของคุณจัดส่งแล้ว",
    `เลขออเดอร์: ${orderId}`
  ];

  if (trackingNumber) {
    lines.push(`เลขพัสดุ: ${trackingNumber}`);
  }

  return lines.join("\n");
}

function isPaidOrderLineNotificationEligible(order) {
  if (!getOrderLineUserId(order)) {
    return false;
  }

  const notifications = getOrderNotifications(order);
  if (notifications.paymentReceivedSentAt) {
    return false;
  }

  const status = String(order?.status || "").trim();
  const stripePaymentStatus = String(order?.stripePaymentStatus || "").trim().toLowerCase();
  return status === "Payment Received" && stripePaymentStatus === "paid";
}

function shouldSendShippedLineNotification(previousOrder, nextOrder) {
  if (!getOrderLineUserId(nextOrder)) {
    return false;
  }

  const notifications = getOrderNotifications(nextOrder);
  if (notifications.shippedSentAt) {
    return false;
  }

  const previousStatus = String(previousOrder?.status || "").trim();
  const nextStatus = String(nextOrder?.status || "").trim();
  return previousStatus !== "Shipped" && nextStatus === "Shipped";
}

function markOrderNotificationSent(order, notificationKey) {
  return {
    ...order,
    notifications: {
      ...getOrderNotifications(order),
      [notificationKey]: new Date().toISOString()
    }
  };
}

function buildCarrierAwareShippedOrderLineMessage(order) {
  const orderId = String(order?.id || "-").trim() || "-";
  const shippingCarrier = getOrderShippingCarrierDisplay(order);
  const trackingNumber = getOrderTrackingNumber(order);
  const lines = [
    "กำไลของคุณจัดส่งแล้ว",
    `เลขออเดอร์: ${orderId}`
  ];

  if (shippingCarrier) {
    lines.push(`ผู้ให้บริการ: ${shippingCarrier}`);
  }

  if (trackingNumber) {
    lines.push(`เลขพัสดุ: ${trackingNumber}`);
  }

  return lines.join("\n");
}

function applyOrderWorkflowUpdates(baseOrder, updates) {
  const nextOrder = { ...baseOrder };
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(updates, key);

  if (hasOwn("status")) {
    nextOrder.status = updates.status;
  }

  if (hasOwn("trackingNumber")) {
    nextOrder.trackingNumber = String(updates.trackingNumber || "").trim();
  }

  if (hasOwn("orderDetailUrl")) {
    nextOrder.orderDetailUrl = String(updates.orderDetailUrl || "").trim();
  }

  if (hasOwn("trackingUrl")) {
    nextOrder.trackingUrl = String(updates.trackingUrl || "").trim();
  }

  if (hasOwn("shippingCarrier")) {
    const rawCarrier = String(updates.shippingCarrier || "").trim();
    nextOrder.shippingCarrier = rawCarrier === "อื่นๆ" ? "Other" : rawCarrier;
    if (nextOrder.shippingCarrier !== "Other") {
      nextOrder.shippingCarrierCustom = "";
    }
  }

  if (hasOwn("shippingCarrierCustom")) {
    nextOrder.shippingCarrierCustom = String(updates.shippingCarrierCustom || "").trim();
  }

  if (String(nextOrder.shippingCarrier || "").trim() !== "Other") {
    nextOrder.shippingCarrierCustom = "";
  }

  if (!nextOrder.trackingNumber) {
    delete nextOrder.trackingNo;
    delete nextOrder.shippingTrackingNumber;
    delete nextOrder.shipmentTrackingNumber;
  }

  return nextOrder;
}

async function trySendPaidOrderLineNotification(order) {
  if (!isPaidOrderLineNotificationEligible(order)) {
    console.info(`[buyer-line-notify] skipped order=${getOrderId(order)} reason=ineligible`);
    return { sent: false, order };
  }

  const orderId = getOrderId(order);
  console.info(`[buyer-line-notify] attempted order=${orderId}`);
  try {
    await sendLineFlexMessageWithTextFallback({
      userId: getOrderLineUserId(order),
      flexMessage: buildPaymentSuccessFlexMessage(order),
      fallbackText: buildPaymentSuccessFallbackLineMessage(order)
    });
    console.info(`[buyer-line-notify] success order=${orderId}`);
  } catch (error) {
    const statusMatch = String(error?.message || '').match(/HTTP\s+(\d{3})/);
    console.warn(`[buyer-line-notify] failure order=${orderId} category=${statusMatch ? `http_${statusMatch[1]}` : 'delivery_error'}`);
    throw error;
  }

  return {
    sent: true,
    order: markOrderNotificationSent(order, "paymentReceivedSentAt")
  };
}

async function trySendShippedLineNotification(previousOrder, nextOrder) {
  if (!shouldSendShippedLineNotification(previousOrder, nextOrder)) {
    return { sent: false, order: nextOrder };
  }

  await sendLineFlexMessageWithTextFallback({
    userId: getOrderLineUserId(nextOrder),
    flexMessage: buildShippedFlexMessage(nextOrder),
    fallbackText: buildShippedFallbackLineMessage(nextOrder)
  });

  return {
    sent: true,
    order: markOrderNotificationSent(nextOrder, "shippedSentAt")
  };
}

function normalizeStripeAddress(address) {
  if (!address || typeof address !== "object") {
    return null;
  }

  const normalizedAddress = {
    line1: String(address.line1 || "").trim(),
    line2: String(address.line2 || "").trim(),
    city: String(address.city || "").trim(),
    state: String(address.state || "").trim(),
    postalCode: String(address.postal_code || "").trim(),
    country: String(address.country || "").trim()
  };

  const hasValue = Object.values(normalizedAddress).some((value) => value);
  return hasValue ? normalizedAddress : null;
}

function getStripeSessionShippingDetails(session) {
  const shippingSource = session?.collected_information?.shipping_details || session?.shipping_details || null;
  if (!shippingSource || typeof shippingSource !== "object") {
    return null;
  }

  const shippingDetails = {
    name: String(shippingSource.name || "").trim(),
    address: normalizeStripeAddress(shippingSource.address)
  };

  return shippingDetails.name || shippingDetails.address ? shippingDetails : null;
}

async function createStripeCheckoutSession({ order, origin }) {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!order || typeof order !== "object") {
    throw new Error("Missing order payload.");
  }

  const canonicalOrder = order;
  const safeOrigin = getSafeOrigin(origin);
  const amountTotal = normalizeCurrencyAmount(getOrderTotalPrice(canonicalOrder));
  const customerName = String(canonicalOrder.customerName || "Khun Guest").trim() || "Khun Guest";
  const beadSize = String(canonicalOrder.beadSize || "").trim() || "6";
  const totalBeads = Number.parseInt(canonicalOrder.totalBeads || 0, 10) || 0;
  const configurationCode = String(canonicalOrder.configurationCode || "").trim();
  const shippingSource = canonicalOrder.shippingInfo && typeof canonicalOrder.shippingInfo === "object" ? canonicalOrder.shippingInfo : canonicalOrder;
  const recipientName = String(shippingSource.recipientName || "").trim();
  const phoneNumber = String(shippingSource.phoneNumber || "").trim();
  const addressLine = String(shippingSource.addressLine || "").trim();
  const province = String(shippingSource.province || "").trim();
  const postalCode = String(shippingSource.postalCode || "").trim();

  const form = new URLSearchParams();
  form.append("mode", "payment");
  form.append("success_url", `${safeOrigin}/?step=4&stripe=success&session_id={CHECKOUT_SESSION_ID}`);
  form.append("cancel_url", `${safeOrigin}/?step=4&stripe=cancel`);
  form.append("locale", "auto");
  form.append("payment_method_types[0]", "card");
  form.append("payment_method_types[1]", "promptpay");
  form.append("line_items[0][quantity]", "1");
  form.append("line_items[0][price_data][currency]", "thb");
  form.append("line_items[0][price_data][unit_amount]", String(amountTotal));
  form.append("line_items[0][price_data][product_data][name]", "Lucky Colorstone Custom Bracelet");
  form.append("line_items[0][price_data][product_data][description]", `${customerName} • ${beadSize}mm • ${totalBeads} beads`);

  if (configurationCode) {
    form.append("client_reference_id", configurationCode.slice(0, 200));
    form.append("metadata[configurationCode]", configurationCode.slice(0, 500));
  }
  form.append("metadata[customerName]", customerName.slice(0, 500));
  form.append("metadata[wristSize]", String(canonicalOrder.wristSize ?? ""));
  form.append("metadata[beadSize]", beadSize.slice(0, 500));
  form.append("metadata[totalBeads]", String(totalBeads));
  form.append("metadata[netPrice]", String(getOrderTotalPrice(canonicalOrder) ?? ""));
  form.append("metadata[orderId]", String(canonicalOrder.id || "").slice(0, 500));
  if (recipientName) {
    form.append("metadata[recipientName]", recipientName.slice(0, 500));
  }
  if (phoneNumber) {
    form.append("metadata[phoneNumber]", phoneNumber.slice(0, 500));
  }
  if (addressLine) {
    form.append("metadata[addressLine]", addressLine.slice(0, 500));
  }
  if (province) {
    form.append("metadata[province]", province.slice(0, 500));
  }
  if (postalCode) {
    form.append("metadata[postalCode]", postalCode.slice(0, 500));
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  const responseText = await response.text();
  const payload = parseStripeApiResponse(responseText);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe Checkout returned HTTP ${response.status}.`);
  }

  return payload;
}

async function getStripeCheckoutSession(sessionId) {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!sessionId) {
    throw new Error("Missing checkout session ID.");
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`
    }
  });

  const responseText = await response.text();
  const payload = parseStripeApiResponse(responseText);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe session lookup returned HTTP ${response.status}.`);
  }

  return payload;
}

function getImageUploadConfig() {
  const endpoint = getEnvValue("IMAGE_UPLOAD_ENDPOINT");
  if (!endpoint) {
    return null;
  }

  let extraFields = {};
  const extraFieldsJson = getEnvValue("IMAGE_UPLOAD_EXTRA_FIELDS_JSON");
  if (extraFieldsJson) {
    extraFields = JSON.parse(extraFieldsJson);
  }

  return {
    providerName: getEnvValue("IMAGE_UPLOAD_PROVIDER_NAME", "external-storage"),
    endpoint,
    method: getEnvValue("IMAGE_UPLOAD_METHOD", "POST").toUpperCase(),
    fileField: getEnvValue("IMAGE_UPLOAD_FILE_FIELD", "file"),
    responseUrlField: getEnvValue("IMAGE_UPLOAD_RESPONSE_URL_FIELD", "secure_url"),
    authHeader: getEnvValue("IMAGE_UPLOAD_AUTH_HEADER"),
    authValue: getEnvValue("IMAGE_UPLOAD_AUTH_VALUE"),
    maxBytes: Number.parseInt(getEnvValue("IMAGE_UPLOAD_MAX_BYTES", "6291456"), 10),
    extraFields
  };
}

function convertDataUrlToUploadPayload(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(?<mime>[^;]+);base64,(?<payload>.+)$/);
  if (!match || !match.groups) {
    throw new Error("Image payload must be provided as a data URL.");
  }

  return {
    mimeType: match.groups.mime,
    bytes: Buffer.from(match.groups.payload, "base64")
  };
}

async function uploadImageToExternalService({ fileName, mimeType, dataUrl }) {
  const config = getImageUploadConfig();
  if (!config) {
    return {
      configured: false,
      error: "Image upload is not configured.",
      requiredConfig: [
        "IMAGE_UPLOAD_ENDPOINT",
        "IMAGE_UPLOAD_METHOD (optional, default POST)",
        "IMAGE_UPLOAD_FILE_FIELD (optional, default file)",
        "IMAGE_UPLOAD_RESPONSE_URL_FIELD (optional, default secure_url)",
        "IMAGE_UPLOAD_EXTRA_FIELDS_JSON (optional)",
        "IMAGE_UPLOAD_AUTH_HEADER / IMAGE_UPLOAD_AUTH_VALUE (optional)"
      ]
    };
  }

  const payload = convertDataUrlToUploadPayload(dataUrl);
  const effectiveMimeType = mimeType || payload.mimeType;
  if (!effectiveMimeType || !String(effectiveMimeType).startsWith("image/")) {
    throw new Error("Only image/* uploads are supported.");
  }

  if (Number.isFinite(config.maxBytes) && config.maxBytes > 0 && payload.bytes.length > config.maxBytes) {
    throw new Error(`Image is too large. Maximum allowed size is ${config.maxBytes} bytes.`);
  }

  const form = new FormData();
  const safeFileName = fileName ? path.basename(fileName) : "upload-image";
  form.append(config.fileField, new Blob([payload.bytes], { type: effectiveMimeType }), safeFileName);

  Object.entries(config.extraFields || {}).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  const headers = {};
  if (config.authHeader && config.authValue) {
    headers[config.authHeader] = config.authValue;
  }

  const response = await fetch(config.endpoint, {
    method: config.method === "PUT" ? "PUT" : "POST",
    headers,
    body: form
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Upload service returned ${response.status}: ${responseText}`);
  }

  const decoded = JSON.parse(normalizeJsonText(responseText, "{}"));
  const uploadedUrl = getNestedJsonValue(decoded, config.responseUrlField);
  if (!uploadedUrl) {
    throw new Error(`Upload service response did not include '${config.responseUrlField}'.`);
  }

  return {
    configured: true,
    success: true,
    provider: config.providerName,
    url: String(uploadedUrl),
    fileName: safeFileName,
    mimeType: effectiveMimeType
  };
}

function upsertById(records, record) {
  const index = records.findIndex((entry) => entry && entry.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  return records;
}

function deleteById(records, targetId) {
  let deleted = false;
  const nextRecords = records.filter((entry) => {
    if (!deleted && entry && entry.id === targetId) {
      deleted = true;
      return false;
    }
    return true;
  });

  return { deleted, nextRecords };
}

function getSupabaseConfig() {
  const url = getEnvValue("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");
  return { url, serviceRoleKey, configured: Boolean(url && serviceRoleKey) };
}

function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}

function getStorageMode() {
  return isSupabaseConfigured() ? "supabase" : "json";
}

function createSupabaseRestUrl(tableName, params = {}) {
  const { url } = getSupabaseConfig();
  const endpoint = new URL(`/rest/v1/${tableName}`, url);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      endpoint.searchParams.set(key, String(value));
    }
  });
  return endpoint;
}

async function supabaseRequest(tableName, { method = "GET", params = {}, body = null, prefer = "" } = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }
  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(createSupabaseRestUrl(tableName, params), {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(normalizeJsonText(text, "null"));
    } catch (error) {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error || text || `HTTP ${response.status}`;
    throw new Error(`${tableName} ${method} failed: ${detail}`);
  }

  return payload;
}

function warnSupabaseReadFallback(label, error) {
  console.warn(`Supabase read failed for ${label}; falling back to JSON data.`, error?.message || error);
}

async function readSupabasePayloadTable(tableName, fallbackLabel, fallbackFn, params = {}) {
  if (!isSupabaseConfigured()) {
    return fallbackFn();
  }

  try {
    const rows = await supabaseRequest(tableName, {
      params: {
        select: "payload,display_order,in_stock,is_active,created_at",
        ...params
      }
    });
    return Array.isArray(rows) ? rows.map((row) => mergeCatalogRowAvailability(row)).filter(Boolean) : [];
  } catch (error) {
    warnSupabaseReadFallback(fallbackLabel, error);
    return fallbackFn();
  }
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function toNumericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function supabaseRpc(functionName, body = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(new URL(`/rest/v1/rpc/${functionName}`, url), {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${functionName} failed: ${text || `HTTP ${response.status}`}`);
  return text ? JSON.parse(text) : null;
}

async function createLineAuthHandoff(input) {
  if (!isSupabaseConfigured()) return null;
  const payload = normalizeHandoffPayload(input);
  if (!payload) return null;
  const token = createHandoffToken();
  await supabaseRequest('line_auth_handoffs', {
    method: 'POST',
    body: { token, payload, expires_at: new Date(payload.expiresAt).toISOString() },
    prefer: 'return=minimal'
  });
  return { token, expiresAt: payload.expiresAt };
}

async function consumeLineAuthHandoff(token) {
  if (!isSupabaseConfigured() || !HANDOFF_TOKEN_PATTERN.test(String(token || ''))) return null;
  const rows = await supabaseRpc('consume_line_auth_handoff', { p_token: token });
  return Array.isArray(rows) && rows[0]?.payload ? rows[0].payload : null;
}

async function createDeferredLoginQaSession() {
  if (!isSupabaseConfigured() || !getEnvValue('DEFERRED_LOGIN_QA_ADMIN_SECRET')) return null;
  const token = createDeferredLoginQaToken();
  const expiresAt = Date.now() + DEFERRED_LOGIN_QA_TTL_MS;
  await supabaseRequest('deferred_login_qa_sessions', {
    method: 'POST',
    body: { token, expires_at: new Date(expiresAt).toISOString() },
    prefer: 'return=minimal'
  });
  return { token, expiresAt };
}

async function findActiveDeferredLoginQaSession(token) {
  if (!isSupabaseConfigured() || !DEFERRED_LOGIN_QA_TOKEN_PATTERN.test(String(token || ''))) return null;
  const rows = await supabaseRequest('deferred_login_qa_sessions', {
    params: { select: 'expires_at,revoked_at', token: `eq.${token}`, limit: '1' }
  });
  return isDeferredLoginQaSessionActive(Array.isArray(rows) ? rows[0] : null)
    ? { expiresAt: Date.parse(rows[0].expires_at) }
    : null;
}

async function revokeDeferredLoginQaSession(token) {
  if (!isSupabaseConfigured() || !DEFERRED_LOGIN_QA_TOKEN_PATTERN.test(String(token || ''))) return false;
  const rows = await supabaseRequest('deferred_login_qa_sessions', {
    method: 'PATCH',
    params: { token: `eq.${token}`, revoked_at: 'is.null' },
    body: { revoked_at: new Date().toISOString() },
    prefer: 'return=representation'
  });
  return Array.isArray(rows) && rows.length === 1;
}

async function notifyPaidOrderLineRecipients(order) {
  let nextOrder = order;

  try {
    const adminResult = await notifyAdminOrderCreated(nextOrder);
    if (adminResult.sent) {
      nextOrder = markOrderNotificationSent(nextOrder, "adminOrderCreatedSentAt");
    }
  } catch (error) {
    console.error(`[stripe-webhook] admin LINE notification failed for ${getOrderId(order)}:`, error?.message || error);
  }

  try {
    const buyerResult = await trySendPaidOrderLineNotification(nextOrder);
    nextOrder = buyerResult.order;
  } catch (error) {
    console.error(`[stripe-webhook] buyer LINE notification failed for ${getOrderId(order)}:`, error?.message || error);
  }

  if (nextOrder !== order) {
    await saveOrderForApi(nextOrder);
  }
  return nextOrder;
}

function normalizeStockQty(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function getCatalogPayloadStockQty(item) {
  return normalizeStockQty(item?.stockQty ?? item?.stock_qty ?? item?.availability?.stockQty ?? item?.availability?.stock_qty, null);
}

function isCatalogItemAvailable(item) {
  if (!item || item.isActive === false || item.inStock === false) return false;
  if (item.availability?.isActive === false || item.availability?.inStock === false) return false;
  const stockQty = getCatalogPayloadStockQty(item);
  return stockQty === null || stockQty > 0;
}

function mergeCatalogRowAvailability(row) {
  if (!row?.payload || typeof row.payload !== "object") return null;
  const payload = { ...row.payload };
  if (row.in_stock === false) payload.inStock = false;
  if (row.is_active === false) payload.isActive = false;
  return payload;
}

function normalizeCatalogAvailabilityPayload(item) {
  const stockQty = getCatalogPayloadStockQty(item);
  const inStock = item?.availability?.inStock !== false && item?.inStock !== false && (stockQty === null || stockQty > 0);
  const isActive = item?.availability?.isActive !== false && item?.isActive !== false;
  const next = { ...item, stockQty, stock_qty: stockQty, inStock, isActive };
  if (item?.availability && typeof item.availability === "object") {
    next.availability = {
      ...item.availability,
      stockQty,
      stock_qty: stockQty,
      inStock,
      isActive
    };
  }
  return next;
}

function buildStoneRow(stone, index = 0) {
  const payload = normalizeCatalogAvailabilityPayload(stone || {});
  return {
    id: String(payload?.id || "").trim(),
    payload,
    category_id: String(payload?.categoryId || payload?.category || "").trim() || null,
    display_order: toInteger(payload?.displayOrder, (index + 1) * 10),
    in_stock: payload.inStock !== false,
    is_active: payload.isActive !== false
  };
}

function buildCharmRow(charm, index = 0) {
  const payload = normalizeCatalogAvailabilityPayload(charm || {});
  return {
    id: String(payload?.id || "").trim(),
    payload,
    category_id: String(payload?.categoryId || payload?.collection || "").trim() || null,
    display_order: toInteger(payload?.displayOrder, (index + 1) * 10),
    in_stock: payload.inStock !== false,
    is_active: payload.isActive !== false
  };
}

function buildSpacerRow(spacer, index = 0) {
  const payload = normalizeCatalogAvailabilityPayload(spacer || {});
  return {
    id: String(payload?.id || "").trim(),
    payload,
    display_order: toInteger(payload?.displayOrder, (index + 1) * 10),
    in_stock: payload.inStock !== false,
    is_active: payload.isActive !== false
  };
}

function buildCategoryRow(category, index = 0) {
  const id = String(category?.id || category?.slug || "").trim();
  return {
    id,
    entity_type: String(category?.entityType || category?.scope || category?.kind || "stone").trim().toLowerCase(),
    slug: String(category?.slug || id).trim() || null,
    name_en: String(category?.nameEn || category?.name?.en || "").trim() || null,
    name_th: String(category?.nameTh || category?.name?.th || "").trim() || null,
    display_order: toInteger(category?.displayOrder, (index + 1) * 10),
    is_active: category?.isActive !== false,
    payload: category
  };
}

function buildOrderRow(order) {
  return {
    id: String(order?.id || order?.orderId || "").trim(),
    status: order?.status ? String(order.status) : null,
    customer_name: order?.customerName ? String(order.customerName) : null,
    line_user_id: order?.lineUserId ? String(order.lineUserId) : null,
    stripe_checkout_session_id: order?.stripeCheckoutSessionId ? String(order.stripeCheckoutSessionId) : null,
    stripe_payment_status: order?.stripePaymentStatus ? String(order.stripePaymentStatus) : null,
    net_price: toNumericOrNull(order?.netPrice),
    final_price: toNumericOrNull(order?.finalPrice),
    total_price: toNumericOrNull(order?.totalPrice),
    payload: order,
    date: order?.date || null
  };
}

function truncateText(value, maxLength = 500) {
  return String(value || "").slice(0, maxLength);
}

function sanitizeAnalyticsProperties(value, maxBytes = 12000) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const redactedKeys = new Set(["password", "token", "secret", "authorization", "card", "cookie"]);
  const clean = {};
  Object.entries(value).slice(0, 80).forEach(([key, entryValue]) => {
    const normalizedKey = String(key || "").trim().slice(0, 80);
    if (!normalizedKey || redactedKeys.has(normalizedKey.toLowerCase())) return;
    if (entryValue == null) {
      clean[normalizedKey] = entryValue;
    } else if (typeof entryValue === "string") {
      clean[normalizedKey] = truncateText(entryValue, 1000);
    } else if (typeof entryValue === "number" || typeof entryValue === "boolean") {
      clean[normalizedKey] = entryValue;
    } else {
      clean[normalizedKey] = JSON.parse(JSON.stringify(entryValue));
    }
  });

  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, "utf8") <= maxBytes) return clean;
  return { truncated: true };
}

function normalizeAnalyticsSource(source = {}) {
  const safeSource = source && typeof source === "object" ? source : {};
  return {
    utm_source: truncateText(safeSource.utm_source, 120),
    utm_medium: truncateText(safeSource.utm_medium, 120),
    utm_campaign: truncateText(safeSource.utm_campaign, 160),
    utm_content: truncateText(safeSource.utm_content, 160),
    utm_term: truncateText(safeSource.utm_term, 160),
    referrer: truncateText(safeSource.referrer, 1000),
    landing_url: truncateText(safeSource.landing_url, 1200),
    platform_guess: truncateText(safeSource.platform_guess, 80) || "unknown"
  };
}

const ANALYTICS_SCHEMA_VERSION = 2;
const ANALYTICS_FUNNEL_VERSION = 2;
const ANALYTICS_V2_FUNNEL_STAGES = new Set([
  'landing_view', 'start_design', 'step_1_view', 'step_2_view', 'step_3_view',
  'line_connected', 'step_4_view', 'checkout_started', 'payment_success'
]);

function normalizeAnalyticsEventPayload(payload = {}, req = null) {
  const source = normalizeAnalyticsSource(payload.source || {});
  const eventName = truncateText(payload.eventName || payload.event_name || "", 120);
  const sessionId = truncateText(payload.sessionId || payload.session_id || "", 120);
  const rawVisitorId = truncateText(payload.visitorId || payload.visitor_id || "", 80);
  const visitorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawVisitorId) ? rawVisitorId.toLowerCase() : "";
  const stepValue = Number(payload.step);
  return {
    sessionId,
    visitorId,
    eventName,
    step: Number.isFinite(stepValue) ? stepValue : null,
    source,
    properties: sanitizeAnalyticsProperties(payload.properties || {}),
    timestamp: payload.timestamp ? truncateText(payload.timestamp, 80) : new Date().toISOString(),
    url: truncateText(payload.url, 1200),
    orderId: truncateText(payload.orderId || payload.order_id || "", 120),
    lineUserId: truncateText(payload.lineUserId || payload.line_user_id || "", 180),
    userAgent: truncateText(payload.userAgent || payload.user_agent || req?.headers?.["user-agent"] || "", 800)
  };
}

async function upsertAnalyticsSession(payload) {
  const nowIso = new Date().toISOString();
  const source = payload.source || normalizeAnalyticsSource();
  const sessionRow = {
    session_id: payload.sessionId,
    visitor_id: payload.visitorId || null,
    line_user_id: payload.lineUserId || null,
    first_source: source.utm_source || source.platform_guess || "unknown",
    first_medium: source.utm_medium || null,
    first_campaign: source.utm_campaign || null,
    referrer: source.referrer || null,
    landing_url: source.landing_url || null,
    platform_guess: source.platform_guess || "unknown",
    started_at: payload.properties?.started_at || payload.timestamp || nowIso,
    last_seen_at: nowIso,
    current_step: payload.step,
    order_id: payload.orderId || null,
    converted: Boolean(payload.properties?.converted || payload.eventName === "order_created" || payload.eventName === "payment_success"),
    revenue: toNumericOrNull(payload.properties?.revenue ?? payload.properties?.finalPrice ?? payload.properties?.totalPrice),
    user_agent: payload.userAgent || null
  };

  if (isSupabaseConfigured()) {
    const existingRows = await supabaseRequest("analytics_sessions", {
      params: {
        select: "*",
        session_id: `eq.${payload.sessionId}`,
        limit: "1"
      }
    });
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing) {
      sessionRow.line_user_id = sessionRow.line_user_id || existing.line_user_id || null;
      sessionRow.visitor_id = sessionRow.visitor_id || existing.visitor_id || null;
      sessionRow.first_source = existing.first_source || sessionRow.first_source;
      sessionRow.first_medium = existing.first_medium || sessionRow.first_medium;
      sessionRow.first_campaign = existing.first_campaign || sessionRow.first_campaign;
      sessionRow.referrer = existing.referrer || sessionRow.referrer;
      sessionRow.landing_url = existing.landing_url || sessionRow.landing_url;
      sessionRow.platform_guess = existing.platform_guess || sessionRow.platform_guess;
      sessionRow.started_at = existing.started_at || sessionRow.started_at;
      sessionRow.order_id = sessionRow.order_id || existing.order_id || null;
      sessionRow.converted = Boolean(existing.converted || sessionRow.converted);
      sessionRow.revenue = sessionRow.revenue ?? existing.revenue ?? null;
      sessionRow.user_agent = sessionRow.user_agent || existing.user_agent || null;
    }
    await supabaseRequest("analytics_sessions", {
      method: "POST",
      body: sessionRow,
      prefer: "resolution=merge-duplicates,return=minimal",
      params: { on_conflict: "session_id" }
    });
    return;
  }

  const sessions = readJsonArray("analyticsSessions");
  const existingIndex = sessions.findIndex((entry) => entry.session_id === payload.sessionId);
  if (existingIndex >= 0) {
    sessions[existingIndex] = {
      ...sessions[existingIndex],
      visitor_id: sessionRow.visitor_id || sessions[existingIndex].visitor_id || null,
      line_user_id: sessionRow.line_user_id || sessions[existingIndex].line_user_id || null,
      last_seen_at: sessionRow.last_seen_at,
      current_step: sessionRow.current_step ?? sessions[existingIndex].current_step ?? null,
      order_id: sessionRow.order_id || sessions[existingIndex].order_id || null,
      converted: sessions[existingIndex].converted || sessionRow.converted,
      revenue: sessionRow.revenue ?? sessions[existingIndex].revenue ?? null
    };
  } else {
    sessions.push(sessionRow);
  }
  writeJsonFile(dataFiles.analyticsSessions, sessions);
}

async function saveAnalyticsEvent(payload) {
  const eventRow = {
    session_id: payload.sessionId,
    event_name: payload.eventName,
    step: payload.step,
    properties: payload.properties || {},
    url: payload.url || null,
    created_at: payload.timestamp || new Date().toISOString()
  };

  if (await hasSavedV2FunnelStage(eventRow)) return false;

  if (isSupabaseConfigured()) {
    await supabaseRequest("analytics_events", {
      method: "POST",
      body: eventRow,
      prefer: "return=minimal"
    });
    return true;
  }

  const events = readJsonArray("analyticsEvents");
  events.push({ id: crypto.randomUUID(), ...eventRow });
  writeJsonFile(dataFiles.analyticsEvents, events.slice(-5000));
  return true;
}

function isV2FunnelStageEvent(eventRow = {}) {
  const properties = parseAnalyticsProperties(eventRow.properties);
  return Number(properties.funnel_version) === ANALYTICS_FUNNEL_VERSION
    && Number(properties.schema_version) === ANALYTICS_SCHEMA_VERSION
    && properties.funnel_stage === eventRow.event_name
    && ANALYTICS_V2_FUNNEL_STAGES.has(eventRow.event_name)
    && typeof properties.funnel_stage_key === 'string'
    && properties.funnel_stage_key.length <= 180;
}

async function hasSavedV2FunnelStage(eventRow = {}) {
  if (!isV2FunnelStageEvent(eventRow)) return false;
  const isSameStage = (row) => {
    const properties = parseAnalyticsProperties(row?.properties);
    return row?.session_id === eventRow.session_id
      && row?.event_name === eventRow.event_name
      && properties.funnel_stage_key === parseAnalyticsProperties(eventRow.properties).funnel_stage_key;
  };
  if (isSupabaseConfigured()) {
    const rows = await supabaseRequest('analytics_events', {
      params: {
        select: 'session_id,event_name,properties',
        session_id: `eq.${eventRow.session_id}`,
        event_name: `eq.${eventRow.event_name}`,
        limit: '20'
      }
    });
    return Array.isArray(rows) && rows.some(isSameStage);
  }
  return readJsonArray('analyticsEvents').some(isSameStage);
}

async function saveAnalyticsError(payload) {
  const errorRow = {
    session_id: payload.sessionId,
    error_type: truncateText(payload.properties?.error_type || payload.eventName, 120),
    message: truncateText(payload.properties?.message, 1000),
    stack: truncateText(payload.properties?.stack, 4000),
    source: truncateText(payload.properties?.source, 500),
    step: payload.step,
    url: payload.url || null,
    properties: payload.properties || {},
    created_at: payload.timestamp || new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    await supabaseRequest("analytics_errors", {
      method: "POST",
      body: errorRow,
      prefer: "return=minimal"
    });
    return;
  }

  const errors = readJsonArray("analyticsErrors");
  errors.push({ id: crypto.randomUUID(), ...errorRow });
  writeJsonFile(dataFiles.analyticsErrors, errors.slice(-1000));
}

async function saveAnalyticsPayload(payload) {
  if (!payload.sessionId || !payload.eventName) {
    throw new Error("Missing sessionId or eventName.");
  }
  await upsertAnalyticsSession(payload);
  if (payload.eventName === "javascript_error" || payload.eventName === "unhandled_promise_rejection" || payload.eventName === "api_error" || payload.eventName === "image_load_error" || payload.eventName.includes("error")) {
    await saveAnalyticsError(payload);
  } else {
    await saveAnalyticsEvent(payload);
  }
}

async function linkAnalyticsOrderConversion(order = {}) {
  const sessionId = truncateText(order.analyticsSessionId || order.analytics_session_id || "", 120);
  if (!sessionId) return;

  const source = normalizeAnalyticsSource(order.analyticsSource || {});
  const revenue = toNumericOrNull(order.finalPrice ?? order.totalPrice ?? order.netPrice ?? order.checkoutSummary?.finalPrice) || 0;
  const funnelVersion = Number(order.analyticsFunnelVersion || order.analytics_funnel_version) === ANALYTICS_FUNNEL_VERSION
    ? ANALYTICS_FUNNEL_VERSION
    : 1;
  const payload = normalizeAnalyticsEventPayload({
    sessionId,
    eventName: funnelVersion === ANALYTICS_FUNNEL_VERSION ? 'payment_success' : 'order_created',
    step: 4,
    source,
    properties: {
      converted: true,
      revenue,
      paymentMethod: order.paymentMethod || "",
      ...(funnelVersion === ANALYTICS_FUNNEL_VERSION ? {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        funnel_version: ANALYTICS_FUNNEL_VERSION,
        funnel_stage: 'payment_success',
        funnel_stage_key: `v${ANALYTICS_FUNNEL_VERSION}:${sessionId}:payment_success`,
        current_stage: 'payment_success'
      } : {})
    },
    timestamp: new Date().toISOString(),
    url: "",
    orderId: getOrderId(order),
    lineUserId: order.lineUserId || "",
    userAgent: order.analyticsSource?.user_agent || ""
  });

  await upsertAnalyticsSession(payload);
  if (funnelVersion === ANALYTICS_FUNNEL_VERSION) await saveAnalyticsEvent(payload);
}

const ANALYTICS_RANGE_PRESETS = Object.freeze(["today", "yesterday", "7d", "30d", "month", "all"]);
const ANALYTICS_FUNNEL_STAGES = Object.freeze([
  ["landing_view", "\u0E40\u0E02\u0E49\u0E32\u0E40\u0E27\u0E47\u0E1A\u0E44\u0E0B\u0E15\u0E4C"],
  ["start_design", "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E2D\u0E2D\u0E01\u0E41\u0E1A\u0E1A"],
  ["step_1_view", "Step 1"],
  ["step_2_view", "Step 2"],
  ["step_3_view", "Step 3"],
  ["line_connected", "\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D LINE"],
  ["step_4_view", "Step 4"],
  ["checkout_started", "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19"],
  ["payment_success", "\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08"]
]);

const ANALYTICS_FUNNEL_EVENT_ALIASES = Object.freeze({
  start_customize_click: "start_design",
  start_designer: "start_design",
  payment_click: "checkout_started",
  order_created: "payment_success"
});

function getCanonicalAnalyticsFunnelEvent(eventName) {
  return ANALYTICS_FUNNEL_EVENT_ALIASES[eventName] || eventName;
}

function getBangkokCalendarDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeAnalyticsRangeParams(searchParams = new URLSearchParams()) {
  const requestedRange = String(searchParams.get("range") || "7d").trim().toLowerCase();
  const range = ANALYTICS_RANGE_PRESETS.includes(requestedRange) ? requestedRange : "7d";
  const now = new Date();
  const bangkokDate = getBangkokCalendarDate(now);
  const bangkokStart = (date) => new Date(`${date}T00:00:00.000+07:00`);
  const shiftBangkokDate = (days) => {
    const date = new Date(`${bangkokDate}T12:00:00.000+07:00`);
    date.setUTCDate(date.getUTCDate() + days);
    return getBangkokCalendarDate(date);
  };
  let startDate = null;
  let endDate = null;

  if (range === "today") {
    startDate = bangkokStart(bangkokDate);
    endDate = new Date(now);
  } else if (range === "yesterday") {
    startDate = bangkokStart(shiftBangkokDate(-1));
    endDate = new Date(`${shiftBangkokDate(-1)}T23:59:59.999+07:00`);
  } else if (range === "7d") {
    startDate = bangkokStart(shiftBangkokDate(-6));
    endDate = new Date(now);
  } else if (range === "30d") {
    startDate = bangkokStart(shiftBangkokDate(-29));
    endDate = new Date(now);
  } else if (range === "month") {
    startDate = bangkokStart(`${bangkokDate.slice(0, 7)}-01`);
    endDate = new Date(now);
  }

  const customStart = parseDateBoundary(searchParams.get("start"), false);
  const customEnd = parseDateBoundary(searchParams.get("end"), true);
  if (customStart) startDate = customStart;
  if (customEnd) endDate = customEnd;

  return {
    range,
    startIso: startDate ? startDate.toISOString() : null,
    endIso: endDate ? endDate.toISOString() : null
  };
}

function parseDateBoundary(value, endOfDay = false) {
  const rawValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return null;
  const parsed = new Date(`${rawValue}T00:00:00.000+07:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) return new Date(`${rawValue}T23:59:59.999+07:00`);
  return parsed;
}

function addDateRangeFilters(params, columnName, rangeInfo) {
  const nextParams = { ...params };
  if (rangeInfo.startIso) nextParams[columnName] = `gte.${rangeInfo.startIso}`;
  if (rangeInfo.endIso) nextParams.and = `(${columnName}.lte.${rangeInfo.endIso})`;
  return nextParams;
}

function getAnalyticsRowTime(row = {}, fallbackKeys = []) {
  const candidates = [
    ...fallbackKeys.map((key) => row?.[key]),
    row.created_at,
    row.started_at,
    row.last_seen_at,
    row.timestamp
  ];
  const value = candidates.find((candidate) => candidate);
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function isAnalyticsRowInRange(row = {}, rangeInfo, fallbackKeys = []) {
  if (!rangeInfo.startIso && !rangeInfo.endIso) return true;
  const time = getAnalyticsRowTime(row, fallbackKeys);
  if (!time) return false;
  if (rangeInfo.startIso && time < new Date(rangeInfo.startIso).getTime()) return false;
  if (rangeInfo.endIso && time > new Date(rangeInfo.endIso).getTime()) return false;
  return true;
}

function parseAnalyticsProperties(properties) {
  if (!properties) return {};
  if (typeof properties === "object" && !Array.isArray(properties)) return properties;
  if (typeof properties === "string") {
    try {
      const parsed = JSON.parse(properties);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeAnalyticsDimension(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function getAnalyticsSessionId(row = {}) {
  return normalizeAnalyticsDimension(row.session_id || row.sessionId, "");
}

function getAnalyticsVisitorId(row = {}) {
  const visitorId = String(row.visitor_id || row.visitorId || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId) ? visitorId : "";
}

function getAnalyticsEventName(row = {}) {
  return normalizeAnalyticsDimension(row.event_name || row.eventName, "");
}

function normalizeAnalyticsChannel(source, platformGuess) {
  const raw = String(source ?? "").trim() || String(platformGuess ?? "").trim();
  const value = raw.toLowerCase();
  if (!value || value === "null" || value === "undefined" || value === "direct" || value === "unknown" || value === "direct/unknown") {
    return { channel: "Direct / Unknown", source: "direct/unknown" };
  }
  if (["line", "liff", "line_oa", "line-oa", "oa"].includes(value) || value.includes("line")) {
    return { channel: "LINE", source: raw };
  }
  if (["facebook", "fb", "meta"].includes(value) || value.includes("facebook")) {
    return { channel: "Facebook", source: raw };
  }
  if (["instagram", "ig"].includes(value) || value.includes("instagram")) {
    return { channel: "Instagram", source: raw };
  }
  if (value.includes("tiktok")) {
    return { channel: "TikTok", source: raw };
  }
  if (["google", "search"].includes(value) || value.includes("google")) {
    return { channel: "Google", source: raw };
  }
  return { channel: "Other / Unknown", source: raw || "other" };
}

const OWNER_ANALYTICS_CHANNELS = Object.freeze([
  { key: "instagram", label: "Instagram" },
  { key: "line", label: "LINE" },
  { key: "google", label: "Google" },
  { key: "tiktok", label: "TikTok" },
  { key: "direct", label: "Direct / Unknown" },
  { key: "others", label: "Others" }
]);

function getOwnerAnalyticsChannel(source, platformGuess) {
  const channel = normalizeAnalyticsChannel(source, platformGuess).channel;
  if (channel === "Instagram") return OWNER_ANALYTICS_CHANNELS[0];
  if (channel === "LINE") return OWNER_ANALYTICS_CHANNELS[1];
  if (channel === "Google") return OWNER_ANALYTICS_CHANNELS[2];
  if (channel === "TikTok") return OWNER_ANALYTICS_CHANNELS[3];
  if (channel === "Direct / Unknown") return OWNER_ANALYTICS_CHANNELS[4];
  return OWNER_ANALYTICS_CHANNELS[5];
}

function getOwnerAnalyticsBreakdownLabel(ownerChannel, session = {}) {
  const medium = String(session.first_medium || session.firstMedium || "").trim().toLowerCase();
  if (ownerChannel.key === "instagram" || ownerChannel.key === "facebook") {
    if (medium === "organic") return "Organic";
    if (medium === "paid") return "Paid";
    return "Other";
  }
  if (ownerChannel.key === "line") {
    if (medium === "oa") return "OA";
    if (medium === "organic") return "Organic";
    return "Other";
  }
  return normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).channel;
}

function createOwnerAnalyticsChannelRow(definition) {
  return {
    key: definition.key,
    channel: definition.label,
    sessions: 0,
    checkoutStarted: 0,
    orders: 0,
    paid: 0,
    revenue: 0,
    conversionRate: 0,
    aov: 0,
    visitorIds: new Set(),
    breakdownMap: new Map()
  };
}

function getOwnerAnalyticsBreakdownRow(ownerRow, session = {}) {
  const label = getOwnerAnalyticsBreakdownLabel(ownerRow, session);
  const key = label.toLowerCase();
  if (!ownerRow.breakdownMap.has(key)) {
    ownerRow.breakdownMap.set(key, { label, sessions: 0, checkoutStarted: 0, orders: 0, paid: 0, revenue: 0, visitorIds: new Set() });
  }
  return ownerRow.breakdownMap.get(key);
}

function getAnalyticsDateKey(value) {
  const time = value ? new Date(value) : null;
  if (!time || Number.isNaN(time.getTime())) return "";
  return getBangkokCalendarDate(time);
}

function isAnalyticsSessionConverted(session = {}) {
  return Boolean(session.converted || session.order_id || session.orderId);
}

function isAnalyticsV2Event(event = {}) {
  const properties = parseAnalyticsProperties(event.properties);
  return Number(properties.schema_version) === ANALYTICS_SCHEMA_VERSION
    && Number(properties.funnel_version) === ANALYTICS_FUNNEL_VERSION;
}

function getAnalyticsSessionRevenue(session = {}) {
  const value = Number(session.revenue || session.total_revenue || session.totalRevenue || 0);
  return Number.isFinite(value) ? value : 0;
}

async function readAnalyticsRowsForSummary(rangeInfo = normalizeAnalyticsRangeParams()) {
  if (isSupabaseConfigured()) {
    try {
      const [sessions, events, errors] = await Promise.all([
        supabaseRequest("analytics_sessions", {
          // Keep session attribution available for in-range events that belong to an older session.
          // The summary applies its own selected-period filter to session-start KPIs below.
          params: { select: "*", order: "last_seen_at.desc", limit: "5000" }
        }),
        supabaseRequest("analytics_events", {
          params: addDateRangeFilters({ select: "*", order: "created_at.desc", limit: "10000" }, "created_at", rangeInfo)
        }),
        supabaseRequest("analytics_errors", {
          params: addDateRangeFilters({ select: "*", order: "created_at.desc", limit: "500" }, "created_at", rangeInfo)
        })
      ]);
      return {
        sessions: Array.isArray(sessions) ? sessions : [],
        events: Array.isArray(events) ? events : [],
        errors: Array.isArray(errors) ? errors : []
      };
    } catch (error) {
      warnSupabaseReadFallback("/api/analytics/summary", error);
    }
  }

  return {
    sessions: readJsonArray("analyticsSessions"),
    events: readJsonArray("analyticsEvents").filter((row) => isAnalyticsRowInRange(row, rangeInfo, ["created_at", "timestamp"])),
    errors: readJsonArray("analyticsErrors").filter((row) => isAnalyticsRowInRange(row, rangeInfo, ["created_at", "timestamp"]))
  };
}

function incrementCount(map, key, amount = 1) {
  const safeKey = String(key || "unknown").trim() || "unknown";
  map[safeKey] = (map[safeKey] || 0) + amount;
}

function addAnalyticsCount(map, key, labelKey = "label") {
  const safeKey = normalizeAnalyticsDimension(key, "unknown");
  if (!map[safeKey]) {
    map[safeKey] = { [labelKey]: safeKey, count: 0 };
  }
  map[safeKey].count += 1;
}

async function buildAnalyticsSummary(searchParams = new URLSearchParams()) {
  const rangeInfo = normalizeAnalyticsRangeParams(searchParams);
  const analyticsRows = await readAnalyticsRowsForSummary(rangeInfo);
  const includeTest = searchParams.get("include_test") === "1";
  const testSessionIds = new Set((analyticsRows.sessions || [])
    .filter((session) => String(session.first_campaign || session.firstCampaign || "").trim().toLowerCase() === "prelaunch_test")
    .map(getAnalyticsSessionId));
  const allSessions = (includeTest ? analyticsRows.sessions : analyticsRows.sessions.filter((row) => !testSessionIds.has(getAnalyticsSessionId(row)))) || [];
  const allEvents = (includeTest ? analyticsRows.events : analyticsRows.events.filter((row) => !testSessionIds.has(getAnalyticsSessionId(row)))) || [];
  const events = allEvents.filter(isAnalyticsV2Event);
  const errors = (includeTest ? analyticsRows.errors : analyticsRows.errors.filter((row) => !testSessionIds.has(getAnalyticsSessionId(row)))) || [];
  const sessionById = new Map(allSessions.map((session) => [getAnalyticsSessionId(session), session]).filter(([id]) => id));
  const stageSets = new Map(ANALYTICS_FUNNEL_STAGES.map(([key]) => [key, new Set()]));
  const eventBySession = new Map();
  const stageRank = new Map(ANALYTICS_FUNNEL_STAGES.map(([key], index) => [key, index + 1]));
  const linePendingEvents = new Set(["line_auth_started", "line_auth_success", "oa_friend_required", "oa_friend_cancelled", "line_callback_resume"]);

  events.forEach((event) => {
    const sessionId = getAnalyticsSessionId(event);
    const eventName = getCanonicalAnalyticsFunnelEvent(getAnalyticsEventName(event));
    if (!sessionId) return;
    if (stageSets.has(eventName)) stageSets.get(eventName).add(sessionId);
    if (!eventBySession.has(sessionId)) eventBySession.set(sessionId, []);
    eventBySession.get(sessionId).push({ eventName, time: getAnalyticsRowTime(event, ["created_at", "timestamp"]) });
  });

  const timeStepTotals = {};
  const timeStepCounts = {};
  const beadSizeCounts = {};
  const itemCounts = {};
  const categoryCounts = {};
  events.forEach((event) => {
    const eventName = getAnalyticsEventName(event);
    const properties = parseAnalyticsProperties(event.properties);
    if (eventName === "step_duration") {
      const step = properties.from_step || properties.fromStep || event.step || "unknown";
      const duration = Number(properties.duration_ms || properties.durationMs || 0);
      if (Number.isFinite(duration) && duration > 0) { incrementCount(timeStepTotals, step, duration); incrementCount(timeStepCounts, step); }
    }
    if (eventName === "bead_size_selected" && (properties.bead_size || properties.beadSize)) addAnalyticsCount(beadSizeCounts, `${properties.bead_size || properties.beadSize}mm`, "beadSize");
    if (eventName === "item_added") {
      if (properties.size_mm || properties.sizeMm) addAnalyticsCount(beadSizeCounts, `${properties.size_mm || properties.sizeMm}mm`, "beadSize");
      if (properties.item_id || properties.itemId) addAnalyticsCount(itemCounts, properties.item_id || properties.itemId, "item");
      if (properties.category || properties.item_type || properties.itemType) addAnalyticsCount(categoryCounts, properties.category || properties.item_type || properties.itemType, "category");
    }
    if (eventName === "category_changed" && (properties.category || properties.section)) addAnalyticsCount(categoryCounts, properties.category || properties.section, "category");
  });

  const landingSessionIds = stageSets.get("landing_view");
  const sessions = Array.from(landingSessionIds).map((id) => sessionById.get(id)).filter(Boolean);
  const visitorIds = new Set(sessions.map(getAnalyticsVisitorId).filter(Boolean));
  const ownerChannels = new Map(OWNER_ANALYTICS_CHANNELS.map((definition) => [definition.key, createOwnerAnalyticsChannelRow(definition)]));
  const sourceDetails = new Map();
  const dailyStats = new Map();
  const channelByDay = new Map();
  const getSourceRow = (session = {}) => {
    const channelInfo = normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess);
    const source = normalizeAnalyticsDimension(channelInfo.source, "direct/unknown");
    const medium = normalizeAnalyticsDimension(session.first_medium || session.firstMedium);
    const campaign = normalizeAnalyticsDimension(session.first_campaign || session.firstCampaign);
    const key = `${source}\u0000${medium}\u0000${campaign}`;
    if (!sourceDetails.has(key)) sourceDetails.set(key, { channel: channelInfo.channel, source, medium, campaign, sessions: 0, checkoutStarted: 0, orders: 0, revenue: 0 });
    return sourceDetails.get(key);
  };
  const getOwnerRow = (session = {}) => ownerChannels.get(getOwnerAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).key);
  const ensureDaily = (date) => {
    if (!dailyStats.has(date)) dailyStats.set(date, { date, visitors: new Set(), sessions: new Set(), checkoutStarted: new Set(), paid: new Set(), revenue: 0 });
    return dailyStats.get(date);
  };
  const ensureChannelDay = (date, channel) => {
    const key = `${date}\u0000${channel}`;
    if (!channelByDay.has(key)) channelByDay.set(key, { date, channel, sessions: new Set(), checkoutStarted: new Set(), paid: new Set(), revenue: 0 });
    return channelByDay.get(key);
  };

  sessions.forEach((session) => {
    const sessionId = getAnalyticsSessionId(session);
    const owner = getOwnerRow(session);
    const breakdown = getOwnerAnalyticsBreakdownRow(owner, session);
    const source = getSourceRow(session);
    owner.sessions += 1;
    breakdown.sessions += 1;
    source.sessions += 1;
    const visitorId = getAnalyticsVisitorId(session);
    if (visitorId) { owner.visitorIds.add(visitorId); breakdown.visitorIds.add(visitorId); }
    const landingEvent = events.find((event) => getAnalyticsSessionId(event) === sessionId && getCanonicalAnalyticsFunnelEvent(getAnalyticsEventName(event)) === "landing_view");
    const date = getAnalyticsDateKey(landingEvent?.created_at || landingEvent?.timestamp || session.started_at);
    if (date) {
      const day = ensureDaily(date);
      day.sessions.add(sessionId);
      if (visitorId) day.visitors.add(visitorId);
      ensureChannelDay(date, normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).channel).sessions.add(sessionId);
    }
  });

  const checkoutIds = stageSets.get("checkout_started");
  checkoutIds.forEach((sessionId) => {
    const session = sessionById.get(sessionId);
    if (!session) return;
    const owner = getOwnerRow(session);
    const breakdown = getOwnerAnalyticsBreakdownRow(owner, session);
    getSourceRow(session).checkoutStarted += 1;
    owner.checkoutStarted += 1;
    breakdown.checkoutStarted += 1;
    const event = events.find((row) => getAnalyticsSessionId(row) === sessionId && getCanonicalAnalyticsFunnelEvent(getAnalyticsEventName(row)) === "checkout_started");
    const date = getAnalyticsDateKey(event?.created_at || event?.timestamp);
    if (date) {
      ensureDaily(date).checkoutStarted.add(sessionId);
      ensureChannelDay(date, normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).channel).checkoutStarted.add(sessionId);
    }
  });

  const paidIds = new Set(Array.from(stageSets.get("payment_success")).filter((id) => isAnalyticsSessionConverted(sessionById.get(id))));
  const paidSessions = Array.from(paidIds).map((id) => sessionById.get(id)).filter(Boolean);
  paidSessions.forEach((session) => {
    const sessionId = getAnalyticsSessionId(session);
    const revenue = getAnalyticsSessionRevenue(session);
    const owner = getOwnerRow(session);
    const breakdown = getOwnerAnalyticsBreakdownRow(owner, session);
    const source = getSourceRow(session);
    owner.orders += 1; owner.paid += 1; owner.revenue += revenue;
    breakdown.orders += 1; breakdown.paid += 1; breakdown.revenue += revenue;
    source.orders += 1; source.revenue += revenue;
    const event = events.find((row) => getAnalyticsSessionId(row) === sessionId && getCanonicalAnalyticsFunnelEvent(getAnalyticsEventName(row)) === "payment_success");
    const date = getAnalyticsDateKey(event?.created_at || event?.timestamp || session.last_seen_at);
    if (date) {
      const day = ensureDaily(date); day.paid.add(sessionId); day.revenue += revenue;
      const channelDay = ensureChannelDay(date, normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).channel); channelDay.paid.add(sessionId); channelDay.revenue += revenue;
    }
  });

  const activeCutoff = Date.now() - (30 * 60 * 1000);
  const currentCounts = new Map([["landing_view", 0], ["start_design", 0], ["step_1_view", 0], ["step_2_view", 0], ["step_3_view", 0], ["line_oa", 0], ["step_4_view", 0], ["checkout_started", 0]]);
  allSessions.forEach((session) => {
    const sessionId = getAnalyticsSessionId(session);
    if (!sessionId || isAnalyticsSessionConverted(session) || getAnalyticsRowTime(session, ["last_seen_at"]) < activeCutoff) return;
    const history = eventBySession.get(sessionId) || [];
    let latest = null;
    history.forEach(({ eventName, time }) => {
      const stage = stageRank.has(eventName) ? eventName : (linePendingEvents.has(eventName) ? "line_oa" : null);
      const rank = stage === "line_oa" ? stageRank.get("line_connected") : stageRank.get(stage);
      if (stage && (!latest || rank > latest.rank || (rank === latest.rank && time > latest.time))) latest = { stage, rank, time };
    });
    if (latest?.stage && currentCounts.has(latest.stage)) currentCounts.set(latest.stage, currentCounts.get(latest.stage) + 1);
  });

  const landingCount = stageSets.get("landing_view").size;
  let previous = null;
  const funnel = ANALYTICS_FUNNEL_STAGES.map(([key, label]) => {
    const count = stageSets.get(key).size;
    const dropoff = previous == null || previous <= 0 ? 0 : ((previous - count) / previous) * 100;
    previous = count;
    return { key, eventName: key, label, sessions: count, dropoffFromPrevious: dropoff, dropoffRate: dropoff, percentFromLanding: landingCount ? (count / landingCount) * 100 : 0, landingConversionRate: landingCount ? (count / landingCount) * 100 : 0 };
  });
  const totalOrders = paidSessions.length;
  const revenue = paidSessions.reduce((total, session) => total + getAnalyticsSessionRevenue(session), 0);
  const serializeOwner = (row) => ({
    key: row.key, channel: row.channel, uniqueVisitors: row.visitorIds.size, sessions: row.sessions, checkoutStarted: row.checkoutStarted, orders: row.orders, paid: row.paid, revenue: row.revenue,
    conversionRate: row.sessions ? (row.orders / row.sessions) * 100 : 0, aov: row.orders ? row.revenue / row.orders : 0,
    breakdown: Array.from(row.breakdownMap.values()).map((item) => ({ ...item, uniqueVisitors: item.visitorIds.size, conversionRate: item.sessions ? (item.orders / item.sessions) * 100 : 0 })).sort((a, b) => b.sessions - a.sessions)
  });
  const dailyTrend = Array.from(dailyStats.values()).map((row) => ({ date: row.date, visitors: row.visitors.size, sessions: row.sessions.size, checkoutStarted: row.checkoutStarted.size, orders: row.paid.size, revenue: row.revenue, conversionRate: row.sessions.size ? (row.paid.size / row.sessions.size) * 100 : 0 })).sort((a, b) => a.date.localeCompare(b.date));
  const channelDays = Array.from(channelByDay.values()).map((row) => ({ date: row.date, channel: row.channel, sessions: row.sessions.size, checkoutStarted: row.checkoutStarted.size, orders: row.paid.size, revenue: row.revenue })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  const currentStage = [
    ["landing_view", "Landing"], ["start_design", "Start Design"], ["step_1_view", "Step 1"], ["step_2_view", "Step 2"], ["step_3_view", "Step 3"], ["line_oa", "LINE/OA"], ["step_4_view", "Step 4"], ["checkout_started", "Checkout"]
  ].map(([key, label]) => ({ step: key, label, sessions: currentCounts.get(key) || 0 }));
  const sortCountRows = (rows) => Object.values(rows).sort((a, b) => b.count - a.count).slice(0, 10);
  const stepDurations = Object.entries(timeStepTotals).map(([step, total]) => ({ step, averageMs: Math.round(total / Math.max(1, timeStepCounts[step] || 1)), samples: timeStepCounts[step] || 0 }));
  const recentErrors = errors.slice().sort((a, b) => getAnalyticsRowTime(b, ["created_at"]) - getAnalyticsRowTime(a, ["created_at"])).slice(0, 20).map((error) => ({
    time: error.created_at || error.timestamp || null, sessionId: getAnalyticsSessionId(error), errorType: error.error_type || error.errorType || error.event_name || "error", step: error.step ?? null, message: error.message || parseAnalyticsProperties(error.properties).message || "", url: error.url || ""
  }));
  const recentSessions = sessions.slice().sort((a, b) => getAnalyticsRowTime(b, ["last_seen_at", "started_at"]) - getAnalyticsRowTime(a, ["last_seen_at", "started_at"])).slice(0, 20).map((session) => ({
    time: session.last_seen_at || session.started_at || null, source: normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess).channel, campaign: normalizeAnalyticsDimension(session.first_campaign || session.firstCampaign), orderId: session.order_id || session.orderId || "", revenue: getAnalyticsSessionRevenue(session), currentStep: session.current_step ?? session.currentStep ?? null
  }));

  return {
    success: true, modelVersion: ANALYTICS_FUNNEL_VERSION, legacyExcluded: true, range: rangeInfo.range, start: rangeInfo.startIso, end: rangeInfo.endIso, generatedAt: new Date().toISOString(),
    totals: { sessions: sessions.length, uniqueVisitors: visitorIds.size, visitorTrackedSessions: sessions.filter((session) => getAnalyticsVisitorId(session)).length, legacySessionsWithoutVisitorId: sessions.filter((session) => !getAnalyticsVisitorId(session)).length, orders: totalOrders, conversionRate: landingCount ? (totalOrders / landingCount) * 100 : 0, revenue, aov: totalOrders ? revenue / totalOrders : 0, errors: errors.length },
    ownerChannels: OWNER_ANALYTICS_CHANNELS.map((definition) => serializeOwner(ownerChannels.get(definition.key))),
    sourceDetails: Array.from(sourceDetails.values()).map((row) => ({ ...row, conversionRate: row.sessions ? (row.orders / row.sessions) * 100 : 0, aov: row.orders ? row.revenue / row.orders : 0 })).sort((a, b) => b.sessions - a.sessions || b.revenue - a.revenue),
    funnel, stepDistribution: currentStage, dailyTrend, channelByDay: channelDays,
    insights: { completedNoPayment: Math.max(0, checkoutIds.size - totalOrders), activeWindowMinutes: 30 },
    channels: [], sources: [], bySource: [], stepDurations, averageTimePerStep: stepDurations.map((row) => ({ step: row.step, average_ms: row.averageMs, samples: row.samples })), popularBeadSizes: sortCountRows(beadSizeCounts), popularItems: sortCountRows(itemCounts), popularCategories: sortCountRows(categoryCounts), recentErrors, recentOrders: [], recentSessions, testCampaignExcluded: true, paymentSuccessAuthority: "stripe_webhook_authoritative"
  };
}

async function getSupabaseRecordById(tableName, id) {
  const rows = await supabaseRequest(tableName, {
    params: {
      select: "payload",
      id: `eq.${id}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
}

async function getSupabaseDisplayOrderById(tableName, id) {
  const rows = await supabaseRequest(tableName, {
    params: {
      select: "display_order",
      id: `eq.${id}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) && rows[0] ? toInteger(rows[0].display_order, null) : null;
}

async function upsertSupabaseRow(tableName, row, conflictKey = "id") {
  if (!row?.[conflictKey]) {
    throw new Error(`Missing ${conflictKey} for ${tableName} upsert.`);
  }
  const rows = await supabaseRequest(tableName, {
    method: "POST",
    body: row,
    prefer: `resolution=merge-duplicates,return=representation`,
    params: { on_conflict: conflictKey }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : row;
}

async function deleteSupabaseRowById(tableName, id) {
  const rows = await supabaseRequest(tableName, {
    method: "DELETE",
    params: {
      id: `eq.${id}`,
      select: "id"
    },
    prefer: "return=representation"
  });
  return Array.isArray(rows) && rows.length > 0;
}

function readJsonArray(key) {
  const records = readJsonFile(dataFiles[key], defaultFileText[key]);
  return Array.isArray(records) ? records : [];
}

function readJsonSettings() {
  return readJsonFile(dataFiles.settings, defaultFileText.settings) || { globalDiscountPercent: 20, discountEnabled: true, showDiscountBanner: true };
}

async function readStonesForApi() {
  return readSupabasePayloadTable(
    "catalog_stones",
    "/api/stones",
    () => readJsonArray("stones"),
    { order: "display_order.asc,id.asc" }
  );
}

async function readCharmsForApi() {
  return readSupabasePayloadTable(
    "catalog_charms",
    "/api/charms",
    () => readJsonArray("charms"),
    { order: "display_order.asc,id.asc" }
  );
}

function normalizePurchaseEntry(input, catalogs) {
  const itemType = String(input?.itemType || input?.category || 'stone').trim().toLowerCase();
  const catalogItemId = String(input?.catalogItemId ?? input?.stoneId ?? '').trim() || null;
  const catalogByType = { stone: catalogs.stones, charm: catalogs.charms, spacer: catalogs.spacers };
  const catalogItem = (catalogByType[itemType] || []).find((entry) => entry.id === catalogItemId);
  const itemName = String(input?.itemNameSnapshot ?? input?.itemName ?? '').trim();
  const sizeMm = input?.sizeMm == null || input?.sizeMm === '' ? null : Number(input.sizeMm);
  const quantity = Number(input?.quantity);
  const totalCost = Number(input?.totalCost);
  const purchasedAt = String(input?.purchasedAt || new Date().toISOString().slice(0, 10));
  if (!['stone', 'charm', 'spacer', 'other'].includes(itemType)) throw new Error('Invalid purchase type.');
  if (itemType === 'stone') {
    if (catalogItemId ? !catalogItem : !itemName) throw new Error('Please select or enter a stone.');
    if (!([4, 6, 10].includes(sizeMm)) || (catalogItem && (!Array.isArray(catalogItem.sizes) || !catalogItem.sizes.map(Number).includes(sizeMm)))) throw new Error('Invalid stone or size.');
  } else if (itemType === 'other') {
    if (catalogItemId || !itemName) throw new Error('Please enter a purchase item.');
  } else if (!catalogItem) {
    throw new Error('Please select a purchase item.');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantity must be a positive integer.');
  if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error('Total cost must be zero or greater.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedAt)) throw new Error('Invalid purchase date.');
  const nameSnapshot = catalogItem ? (catalogItem.name?.th || catalogItem.nameTh || catalogItem.name?.en || catalogItem.nameEn || catalogItem.name || catalogItemId) : itemName;
  return { item_type: itemType, catalog_item_id: itemType === 'other' ? null : catalogItemId, item_name_snapshot: nameSnapshot, purchased_at: purchasedAt, stone_id: itemType === 'stone' ? catalogItemId : null, stone_name_snapshot: itemType === 'stone' ? nameSnapshot : null, size_mm: itemType === 'stone' ? sizeMm : null, quantity, total_cost: totalCost, unit_cost: totalCost / quantity, supplier: String(input?.supplier || '').trim() || null, note: String(input?.note || '').trim() || null };
}

async function readSpacersForApi() {
  return readSupabasePayloadTable(
    "catalog_spacers",
    "/api/spacers",
    () => readJsonArray("spacers"),
    { order: "display_order.asc,id.asc" }
  );
}

function sortOrdersForApi(orders) {
  return orders.slice().sort((a, b) => {
    const dateA = Date.parse(a?.date || a?.created_at || "") || 0;
    const dateB = Date.parse(b?.date || b?.created_at || "") || 0;
    return dateB - dateA;
  });
}

async function readOrdersForApi() {
  if (!isSupabaseConfigured()) {
    const jsonOrders = sortOrdersForApi(readJsonArray("orders"));
    console.info(`[orders] GET /api/orders returned ${jsonOrders.length} records from json`);
    return jsonOrders;
  }

  try {
    const rows = await supabaseRequest("orders", {
      params: {
        select: "payload,created_at,date",
        order: "date.desc.nullslast,created_at.desc"
      }
    });
    const orders = sortOrdersForApi(Array.isArray(rows) ? rows.map((row) => row.payload).filter(Boolean) : []);
    console.info(`[orders] GET /api/orders returned ${orders.length} records from supabase`);
    return orders;
  } catch (error) {
    warnSupabaseReadFallback("/api/orders", error);
    const fallbackOrders = sortOrdersForApi(readJsonArray("orders"));
    console.warn(`[orders] GET /api/orders fallback returned ${fallbackOrders.length} records from json`);
    return fallbackOrders;
  }
}

async function saveOrderForApi(order) {
  const orderId = getOrderId(order);
  if (isSupabaseConfigured()) {
    await upsertSupabaseRow("orders", buildOrderRow(order));
    console.info(`[orders] saved ${orderId} to supabase`);
    return;
  }

  const orders = readJsonArray("orders");
  const existingIndex = orders.findIndex((entry) => getOrderId(entry) === orderId);
  if (existingIndex >= 0) {
    orders[existingIndex] = order;
  } else {
    orders.unshift(order);
  }
  writeJsonFile(dataFiles.orders, orders);
  console.info(`[orders] saved ${orderId} to json`);
}

async function findOrderByStripeCheckoutSessionId(sessionId) {
  if (!sessionId) return null;
  if (isSupabaseConfigured()) {
    const rows = await supabaseRequest('orders', { params: { select: 'payload', stripe_checkout_session_id: `eq.${sessionId}`, limit: '1' } });
    return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  }
  return readJsonArray('orders').find((order) => order?.stripeCheckoutSessionId === sessionId) || null;
}

async function applyStripeCheckoutPaymentEvent(session, eventId) {
  const sessionId = String(session?.id || '').trim();
  const orderReference = String(session?.metadata?.orderId || '').trim();
  if (!orderReference) {
    console.info(`[stripe-webhook] ignored unrelated session event=${eventId || '-'} session=${sessionId || '-'}`);
    return { ignored: true, reason: 'missing_order_reference' };
  }

  const order = await findOrderByStripeCheckoutSessionId(sessionId);
  if (!order) throw new Error(`Application Checkout Session has no pending order (order=${orderReference}).`);
  if (getOrderId(order) !== orderReference) throw new Error(`Application Checkout Session order reference mismatch (order=${orderReference}).`);
  const expectedAmount = normalizeCurrencyAmount(getOrderTotalPrice(order));
  if (String(session?.currency || '').toLowerCase() !== 'thb' || Number(session?.amount_total) !== expectedAmount) {
    throw new Error(`Application Checkout Session amount or currency mismatch (order=${orderReference}).`);
  }
  const processed = Array.isArray(order.stripeWebhookEventIds) ? order.stripeWebhookEventIds : [];
  if (processed.includes(eventId) || String(order.stripePaymentStatus).toLowerCase() === 'paid') {
    return { order: await notifyPaidOrderLineRecipients(order), duplicate: true };
  }
  const paidOrder = await deductStockForOrder({
    ...order,
    status: 'Payment Received',
    stripePaymentStatus: 'paid',
    stripeCheckoutStatus: session.status || 'complete',
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
    paidAt: new Date().toISOString(),
    stripeWebhookEventIds: [...processed, eventId].slice(-20)
  });
  await saveOrderForApi(paidOrder);
  await linkAnalyticsOrderConversion(paidOrder);
  sendMetaPurchaseEvent(paidOrder).catch((error) => {
    console.warn(`[meta-capi] Purchase delivery failed for order=${orderReference}:`, error?.message || error);
  });
  console.info(`[stripe-webhook] paid order=${orderReference} session=${sessionId} event=${eventId || '-'}`);
  return { order: await notifyPaidOrderLineRecipients(paidOrder) };
}

function getCatalogItemDisplayName(item, fallbackId) {
  return String(
    item?.nameTh ||
    item?.name?.th ||
    item?.name ||
    item?.nameEn ||
    item?.name?.en ||
    fallbackId ||
    "item"
  ).trim();
}

function incrementRequiredCount(counts, type, id, quantity = 1) {
  const normalizedType = String(type || "").trim().toLowerCase();
  const normalizedId = String(id || "").trim();
  const amount = Math.max(1, toInteger(quantity, 1));
  if (!normalizedId || !["stone", "charm", "spacer"].includes(normalizedType)) return;
  counts[normalizedType].set(normalizedId, (counts[normalizedType].get(normalizedId) || 0) + amount);
}

function buildOrderStockRequirements(order) {
  const counts = { stone: new Map(), charm: new Map(), spacer: new Map() };
  const itemized = Array.isArray(order?.itemizedBilling) ? order.itemizedBilling : [];
  if (itemized.length > 0) {
    itemized.forEach((item) => {
      const type = String(item?.type || item?.componentType || "").trim().toLowerCase();
      const id = type === "stone"
        ? item?.stoneId || item?.id
        : type === "charm"
          ? item?.charmId || item?.id
          : item?.spacerId || item?.id;
      incrementRequiredCount(counts, type, id, item?.quantity ?? item?.count ?? 1);
    });
    return counts;
  }

  (Array.isArray(order?.braceletSequence) ? order.braceletSequence : []).forEach((item) => {
    const type = String(item?.type || item?.componentType || "").trim().toLowerCase();
    const id = type === "stone"
      ? item?.stoneId || item?.id
      : type === "charm"
        ? item?.charmId || item?.id
        : item?.spacerId || item?.id;
    incrementRequiredCount(counts, type, id, item?.quantity ?? item?.count ?? 1);
  });

  (Array.isArray(order?.beads) ? order.beads : []).forEach((bead) => {
    incrementRequiredCount(counts, "stone", bead?.stoneId || bead?.id, 1);
  });
  (Array.isArray(order?.charms) ? order.charms : []).forEach((charm) => {
    incrementRequiredCount(counts, "charm", charm?.id || charm?.charmId, 1);
  });
  (Array.isArray(order?.spacers) ? order.spacers : []).forEach((spacer) => {
    incrementRequiredCount(counts, "spacer", spacer?.spacerId || spacer?.id, 1);
  });
  return counts;
}

async function readStockCatalogMapsForOrder() {
  const [stones, charms, spacers] = await Promise.all([
    readStonesForApi(),
    readCharmsForApi(),
    readSpacersForApi()
  ]);
  return {
    stone: new Map(stones.map((item) => [String(item.id), item])),
    charm: new Map(charms.map((item) => [String(item.id), item])),
    spacer: new Map(spacers.map((item) => [String(item.id), item]))
  };
}

async function validateOrderStockOrThrow(order) {
  const requirements = buildOrderStockRequirements(order);
  const catalogs = await readStockCatalogMapsForOrder();
  const issues = [];

  Object.entries(requirements).forEach(([type, counts]) => {
    if (counts.size > 0 && catalogs[type].size === 0) {
      console.warn(`[stock] ${type} catalog is empty; skipping ${type} stock validation.`);
      return;
    }

    counts.forEach((requiredQty, id) => {
      const item = catalogs[type].get(id);
      const stockQty = getCatalogPayloadStockQty(item);
      if (!item || !isCatalogItemAvailable(item)) {
        issues.push({
          type,
          id,
          requiredQty,
          stockQty: stockQty ?? 0,
          name: getCatalogItemDisplayName(item, id),
          reason: "unavailable"
        });
        return;
      }
      if (stockQty !== null && requiredQty > stockQty) {
        issues.push({
          type,
          id,
          requiredQty,
          stockQty,
          name: getCatalogItemDisplayName(item, id),
          reason: "insufficient"
        });
      }
    });
  });

  if (issues.length > 0) {
    const error = new Error("Stock is unavailable or insufficient.");
    error.statusCode = 409;
    error.stockIssues = issues;
    throw error;
  }
}

function shouldDeductStockForOrder(order) {
  if (order?.stockDeductedAt) return false;
  const paymentMethod = String(order?.paymentMethod || "").trim().toLowerCase();
  const stripePaymentStatus = String(order?.stripePaymentStatus || "").trim().toLowerCase();
  if (paymentMethod === "stripe_checkout" && stripePaymentStatus !== "paid") return false;
  return true;
}

function isUnpaidStripeCheckoutOrder(order) {
  const paymentMethod = String(order?.paymentMethod || "").trim().toLowerCase();
  const checkoutSessionId = String(order?.stripeCheckoutSessionId || "").trim();
  const stripePaymentStatus = String(order?.stripePaymentStatus || "").trim().toLowerCase();
  return (paymentMethod === "stripe_checkout" || checkoutSessionId.startsWith("cs_")) && stripePaymentStatus !== "paid";
}

async function deductStockForOrder(order) {
  if (!shouldDeductStockForOrder(order)) return order;
  const requirements = buildOrderStockRequirements(order);
  const tableByType = {
    stone: { table: "catalog_stones", buildRow: buildStoneRow },
    charm: { table: "catalog_charms", buildRow: buildCharmRow },
    spacer: { table: "catalog_spacers", buildRow: buildSpacerRow }
  };

  if (!isSupabaseConfigured()) {
    console.warn(`[stock] Skipping stock deduction for ${getOrderId(order)} because Supabase is not configured.`);
    return order;
  }

  for (const [type, counts] of Object.entries(requirements)) {
    const config = tableByType[type];
    if (!config || counts.size === 0) continue;
    for (const [id, requiredQty] of counts) {
      const currentPayload = await getSupabaseRecordById(config.table, id);
      if (!currentPayload) {
        console.warn(`[stock] ${type} ${id} missing during deduction for ${getOrderId(order)}.`);
        continue;
      }
      const currentQty = getCatalogPayloadStockQty(currentPayload);
      if (currentQty === null) continue;
      const nextQty = Math.max(0, currentQty - requiredQty);
      const nextPayload = normalizeCatalogAvailabilityPayload({
        ...currentPayload,
        stockQty: nextQty,
        inStock: nextQty > 0
      });
      await upsertSupabaseRow(config.table, config.buildRow(nextPayload));
    }
  }

  return {
    ...order,
    stockDeductedAt: new Date().toISOString()
  };
}

async function readSupabaseSettingsForApi() {
  const settingRows = await supabaseRequest("app_settings", {
    params: { select: "key,value" }
  });
  const settings = {};
  (Array.isArray(settingRows) ? settingRows : []).forEach((row) => {
    if (row?.key) {
      settings[row.key] = row.value;
    }
  });

  const categoryRows = await supabaseRequest("catalog_categories", {
    params: {
      select: "payload,entity_type,display_order",
      order: "entity_type.asc,display_order.asc,id.asc"
    }
  });
  const categories = Array.isArray(categoryRows) ? categoryRows.map((row) => row.payload).filter(Boolean) : [];
  if (categories.length > 0) {
    settings.catalogCategories = categories;
  }

  const layoutRows = await supabaseRequest("catalog_layout_order", {
    params: {
      select: "value",
      key: "eq.default",
      limit: "1"
    }
  });
  const layout = Array.isArray(layoutRows) && layoutRows[0] ? layoutRows[0].value : null;
  if (layout) {
    settings.catalogLayoutOrder = layout;
  }

  return Object.keys(settings).length > 0 ? settings : { globalDiscountPercent: 20, discountEnabled: true, showDiscountBanner: true };
}

async function readSettingsForApi() {
  if (!isSupabaseConfigured()) {
    return readJsonSettings();
  }

  try {
    return await readSupabaseSettingsForApi();
  } catch (error) {
    warnSupabaseReadFallback("/api/settings", error);
    return readJsonSettings();
  }
}

async function saveSupabaseSettings(settings) {
  const entries = Object.entries(settings || {})
    .filter(([key]) => key !== "catalogCategories" && key !== "catalogLayoutOrder")
    .map(([key, value]) => ({ key, value }));

  if (entries.length > 0) {
    await supabaseRequest("app_settings", {
      method: "POST",
      body: entries,
      prefer: "resolution=merge-duplicates,return=minimal",
      params: { on_conflict: "key" }
    });
  }

  if (Array.isArray(settings?.catalogCategories)) {
    const categoryRows = settings.catalogCategories.map((category, index) => buildCategoryRow(category, index));
    if (categoryRows.length > 0) {
      await supabaseRequest("catalog_categories", {
        method: "POST",
        body: categoryRows,
        prefer: "resolution=merge-duplicates,return=minimal",
        params: { on_conflict: "id" }
      });
    }

    const existingRows = await supabaseRequest("catalog_categories", {
      params: { select: "id" }
    });
    const nextIds = new Set(categoryRows.map((row) => row.id));
    const idsToDelete = (Array.isArray(existingRows) ? existingRows : [])
      .map((row) => row.id)
      .filter((id) => id && !nextIds.has(id));
    await Promise.all(idsToDelete.map((id) => deleteSupabaseRowById("catalog_categories", id)));
  }

  if (settings?.catalogLayoutOrder && typeof settings.catalogLayoutOrder === "object") {
    await supabaseRequest("catalog_layout_order", {
      method: "POST",
      body: {
        key: "default",
        value: settings.catalogLayoutOrder
      },
      prefer: "resolution=merge-duplicates,return=minimal",
      params: { on_conflict: "key" }
    });
  }

  return readSupabaseSettingsForApi();
}

async function handleApiRequest(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method;

  if (isFixtureOnlyUatBackend && !isUatReadOnlyApiRequest(method, pathname)) {
    sendJson(res, 403, {
      error: 'UAT fixture backend allows only read-only catalog and settings endpoints.'
    });
    return true;
  }

  if (pathname === "/api/line/webhook" && method === "POST") {
    const rawBodyBuffer = await readRequestBodyBuffer(req);
    const lineChannelSecret = getLineChannelSecret();
    if (!lineChannelSecret) {
      sendJson(res, 503, { error: "LINE webhook is not configured." });
      return true;
    }

    if (!verifyLineSignature(rawBodyBuffer, req.headers["x-line-signature"])) {
      sendJson(res, 401, { error: "Invalid LINE signature." });
      return true;
    }

    const payload = parseJsonText(rawBodyBuffer.toString("utf8")) || {};
    const eventsReceived = Array.isArray(payload.events) ? payload.events.length : 0;
    (Array.isArray(payload.events) ? payload.events : []).forEach((event) => {
      const messageText = String(event?.message?.text || "").trim().toLowerCase();
      if (messageText !== "admin-id") return;

      const source = event?.source || {};
      const userId = source.userId ? String(source.userId) : "";
      const groupId = source.groupId ? String(source.groupId) : "";
      console.info(`[line-admin-id] userId=${userId || "-"} groupId=${groupId || "-"}`);
    });

    sendJson(res, 200, {
      ok: true,
      eventsReceived
    });
    return true;
  }

  if (pathname === "/api/stripe/webhook" && method === "POST") {
    const rawBody = await readRequestBodyBuffer(req);
    if (!verifyStripeWebhookSignature(rawBody, req.headers['stripe-signature'], getStripeWebhookSecret())) {
      sendJson(res, 400, { error: 'Invalid Stripe signature.' });
      return true;
    }
    const event = parseJsonText(rawBody.toString('utf8')) || {};
    try {
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && event.data?.object?.payment_status === 'paid') {
        await applyStripeCheckoutPaymentEvent(event.data.object, String(event.id || ''));
      }
      sendJson(res, 200, { received: true });
    } catch (error) {
      console.error('[stripe-webhook] processing failed:', error?.message || error);
      sendJson(res, 500, { error: 'Webhook processing failed.' });
    }
    return true;
  }

  const bodyObj = req.headers["content-length"] || req.headers["transfer-encoding"]
    ? await parseJsonBody(req)
    : null;

  if (pathname === '/api/internal/deferred-login-qa-sessions' && method === 'POST') {
    if (!hasDeferredLoginQaAdminAccess(req)) {
      sendJson(res, 404, { error: 'Not found.' });
      return true;
    }
    try {
      const session = await createDeferredLoginQaSession();
      if (!session) {
        sendJson(res, 503, { error: 'QA session storage unavailable.' });
        return true;
      }
      sendJson(res, 201, session);
    } catch {
      sendJson(res, 503, { error: 'QA session storage unavailable.' });
    }
    return true;
  }

  if (pathname === '/api/internal/deferred-login-qa-sessions/revoke' && method === 'POST') {
    if (!hasDeferredLoginQaAdminAccess(req) || !DEFERRED_LOGIN_QA_TOKEN_PATTERN.test(String(bodyObj?.token || ''))) {
      sendJson(res, 404, { error: 'Not found.' });
      return true;
    }
    try {
      sendJson(res, (await revokeDeferredLoginQaSession(bodyObj.token)) ? 200 : 404, { ok: true });
    } catch {
      sendJson(res, 503, { error: 'QA session storage unavailable.' });
    }
    return true;
  }

  if (pathname === '/api/deferred-login-qa-sessions/activate' && method === 'POST') {
    try {
      const session = await findActiveDeferredLoginQaSession(bodyObj?.token);
      if (!session) {
        setDeferredLoginQaCookies(res);
        sendJson(res, 404, { enabled: false });
        return true;
      }
      setDeferredLoginQaCookies(res, bodyObj.token, Math.ceil((session.expiresAt - Date.now()) / 1000));
      sendJson(res, 200, { enabled: true, expiresAt: session.expiresAt });
    } catch {
      setDeferredLoginQaCookies(res);
      sendJson(res, 503, { enabled: false });
    }
    return true;
  }

  if (pathname === '/api/deferred-login-qa-sessions/current' && method === 'GET') {
    try {
      const session = await findActiveDeferredLoginQaSession(getRequestCookie(req, DEFERRED_LOGIN_QA_COOKIE));
      if (!session) setDeferredLoginQaCookies(res);
      sendJson(res, 200, session ? { enabled: true, expiresAt: session.expiresAt } : { enabled: false });
    } catch {
      setDeferredLoginQaCookies(res);
      sendJson(res, 503, { enabled: false });
    }
    return true;
  }

  if (pathname === '/api/deferred-login-qa-sessions/deactivate' && method === 'POST') {
    setDeferredLoginQaCookies(res);
    sendJson(res, 200, { enabled: false });
    return true;
  }

  if (pathname === '/api/line-oa-add-friend' && method === 'GET') {
    const url = await getConfiguredLineOaAddFriendUrl();
    sendJson(res, url ? 200 : 503, url ? { url } : { error: 'LINE OA add-friend destination unavailable.' });
    return true;
  }

  if (pathname === '/api/auth-handoffs' && method === 'POST') {
    if (!bodyObj) {
      sendJson(res, 400, { error: 'Invalid handoff request.' });
      return true;
    }
    if (Buffer.byteLength(JSON.stringify(bodyObj), 'utf8') > 16 * 1024) {
      sendJson(res, 413, { error: 'Handoff request too large.' });
      return true;
    }
    try {
      const handoff = await createLineAuthHandoff(bodyObj);
      if (!handoff) {
        sendJson(res, 503, { error: 'Handoff storage unavailable.' });
        return true;
      }
      sendJson(res, 201, handoff);
    } catch {
      sendJson(res, 503, { error: 'Handoff storage unavailable.' });
    }
    return true;
  }

  const consumeHandoffMatch = pathname.match(/^\/api\/auth-handoffs\/([A-Za-z0-9_-]{43})\/consume$/);
  if (consumeHandoffMatch && method === 'POST') {
    try {
      const payload = await consumeLineAuthHandoff(consumeHandoffMatch[1]);
      if (!payload) {
        sendJson(res, 404, { error: 'Handoff unavailable or expired.' });
        return true;
      }
      sendJson(res, 200, { ok: true, payload });
    } catch {
      sendJson(res, 503, { error: 'Handoff storage unavailable.' });
    }
    return true;
  }

  if (pathname === "/api/uploads/image" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    try {
      const uploadResult = await uploadImageToExternalService(bodyObj);
      sendJson(res, uploadResult.configured ? 201 : 503, uploadResult);
    } catch (error) {
      sendJson(res, 500, {
        error: error.message,
        configured: false
      });
    }
    return true;
  }

  if (pathname === "/api/stripe/checkout-session" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    let authoritativeOrder;
    try {
      authoritativeOrder = await buildAuthoritativeStripeOrder(bodyObj.order);
      await validateOrderStockOrThrow(authoritativeOrder);
    } catch (error) {
      sendJson(res, error.statusCode || 409, {
        error: error.message || "Stock validation failed.",
        stockIssues: error.stockIssues || []
      });
      return true;
    }

    const session = await createStripeCheckoutSession({
      order: authoritativeOrder,
      origin: bodyObj.origin
    });

    const pendingOrder = {
      ...authoritativeOrder,
      stripeCheckoutSessionId: session.id,
      stripeCheckoutStatus: session.status || 'open',
      stripePaymentStatus: 'pending_payment',
      date: new Date().toISOString()
    };
    await saveOrderForApi(pendingOrder);

    sendJson(res, 200, {
      id: session.id,
      url: session.url,
      amountTotal: session.amount_total,
      currency: session.currency,
      orderId: pendingOrder.id
    });
    return true;
  }

  if (pathname === "/api/stripe/checkout-session" && method === "GET") {
    const sessionId = urlObj.searchParams.get("session_id");
    const session = await getStripeCheckoutSession(sessionId);
    const shippingDetails = getStripeSessionShippingDetails(session);
    const phoneNumber = String(session.customer_details?.phone || "").trim();
    const order = await findOrderByStripeCheckoutSessionId(sessionId);

    sendJson(res, 200, {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || "",
      phoneNumber,
      shippingDetails,
      shippingAddress: shippingDetails?.address || null,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata || {},
      order
    });
    return true;
  }

  if (pathname === "/api/storage/status" && method === "GET") {
    sendJson(res, 200, {
      mode: getStorageMode(),
      supabaseConfigured: isSupabaseConfigured(),
      jsonDataDir: dataDir
    });
    return true;
  }

  if (pathname === "/api/analytics/event" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { success: false, error: "Empty body" });
      return true;
    }

    const bodySize = Buffer.byteLength(JSON.stringify(bodyObj), "utf8");
    if (bodySize > 64 * 1024) {
      sendJson(res, 413, { success: false, error: "Analytics payload too large" });
      return true;
    }

    try {
      await saveAnalyticsPayload(normalizeAnalyticsEventPayload(bodyObj, req));
      sendJson(res, 202, { success: true });
    } catch (error) {
      console.warn("[analytics] event rejected:", error?.message || error);
      sendJson(res, 202, { success: false });
    }
    return true;
  }

  if ((pathname === "/api/analytics/summary" || pathname === "/api/crm/analytics/summary") && method === "GET") {
    try {
      sendJson(res, 200, await buildAnalyticsSummary(urlObj.searchParams));
    } catch (error) {
      console.warn("[analytics] summary failed:", error?.message || error);
      sendJson(res, 200, {
        success: false,
        range: urlObj.searchParams.get("range") || "7d",
        generatedAt: new Date().toISOString(),
        totals: { sessions: 0, orders: 0, conversionRate: 0, revenue: 0, aov: 0, errors: 0 },
        channels: [],
        sources: [],
        bySource: [],
        funnel: [],
        stepDistribution: [],
        dailyTrend: [],
        channelByDay: [],
        stepDurations: [],
        averageTimePerStep: [],
        popularBeadSizes: [],
        popularItems: [],
        popularCategories: [],
        recentErrors: [],
        recentOrders: []
      });
    }
    return true;
  }

  if (pathname === "/api/purchases" && method === "GET") {
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const entries = await supabaseRequest('stone_purchase_entries', { params: { select: '*', order: 'purchased_at.desc,created_at.desc' } });
    sendJson(res, 200, Array.isArray(entries) ? entries : []);
    return true;
  }

  if (pathname === "/api/purchase-costs/stones" && method === "GET") {
    if (!isSupabaseConfigured()) throw new Error('Stone purchase costs require Supabase.');
    const entries = await supabaseRequest('stone_purchase_entries', { params: { select: 'catalog_item_id,size_mm,quantity,total_cost', item_type: 'eq.stone', catalog_item_id: 'not.is.null' } });
    const summaries = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const catalogItemId = String(entry.catalog_item_id || '').trim();
      const sizeMm = Number(entry.size_mm), quantity = Number(entry.quantity), totalCost = Number(entry.total_cost);
      if (!catalogItemId || ![4, 6, 10].includes(sizeMm) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCost)) return;
      const key = `${catalogItemId}|${sizeMm}`, summary = summaries.get(key) || { catalogItemId, sizeMm, totalQuantity: 0, totalCost: 0 };
      summary.totalQuantity += quantity;
      summary.totalCost += totalCost;
      summaries.set(key, summary);
    });
    sendJson(res, 200, Array.from(summaries.values()).map((summary) => ({ ...summary, weightedUnitCost: summary.totalCost / summary.totalQuantity })));
    return true;
  }

  if (pathname === "/api/purchase-costs" && method === "GET") {
    if (!isSupabaseConfigured()) throw new Error('Purchase costs require Supabase.');
    const entries = await supabaseRequest('stone_purchase_entries', { params: { select: 'item_type,catalog_item_id,size_mm,quantity,total_cost', item_type: 'in.(stone,charm,spacer)', catalog_item_id: 'not.is.null' } });
    const summaries = { stones: new Map(), charms: new Map(), spacers: new Map() };
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const itemType = String(entry.item_type || '').trim();
      const catalogItemId = String(entry.catalog_item_id || '').trim();
      const quantity = Number(entry.quantity), totalCost = Number(entry.total_cost);
      if (!catalogItemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCost) || totalCost < 0) return;

      if (itemType === 'stone') {
        const sizeMm = Number(entry.size_mm);
        if (![4, 6, 10].includes(sizeMm)) return;
        const key = `${catalogItemId}|${sizeMm}`;
        const summary = summaries.stones.get(key) || { catalogItemId, sizeMm, totalQuantity: 0, totalCost: 0 };
        summary.totalQuantity += quantity;
        summary.totalCost += totalCost;
        summaries.stones.set(key, summary);
        return;
      }

      const group = itemType === 'charm' ? summaries.charms : itemType === 'spacer' ? summaries.spacers : null;
      if (!group) return;
      const summary = group.get(catalogItemId) || { catalogItemId, totalQuantity: 0, totalCost: 0 };
      summary.totalQuantity += quantity;
      summary.totalCost += totalCost;
      group.set(catalogItemId, summary);
    });
    const toResponse = (group) => Array.from(group.values()).map((summary) => ({ ...summary, weightedUnitCost: summary.totalCost / summary.totalQuantity }));
    sendJson(res, 200, { stones: toResponse(summaries.stones), charms: toResponse(summaries.charms), spacers: toResponse(summaries.spacers) });
    return true;
  }

  if (pathname === "/api/purchases" && method === "POST") {
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const [stones, charms, spacers] = await Promise.all([readStonesForApi(), readCharmsForApi(), readSpacersForApi()]);
    const entry = normalizePurchaseEntry(bodyObj, { stones, charms, spacers });
    const rows = await supabaseRequest('stone_purchase_entries', { method: 'POST', body: entry, prefer: 'return=representation' });
    sendJson(res, 201, Array.isArray(rows) ? rows[0] : entry);
    return true;
  }

  if (pathname.startsWith('/api/purchases/') && pathname.endsWith('/catalog-link') && method === 'PATCH') {
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const id = decodeURIComponent(pathname.slice('/api/purchases/'.length, -'/catalog-link'.length));
    const catalogItemId = String(bodyObj?.catalogItemId || '').trim();
    if (!id || !catalogItemId) {
      sendJson(res, 400, { error: 'Purchase ID and catalog item ID are required.' });
      return true;
    }

    const [existingRows, stones] = await Promise.all([
      supabaseRequest('stone_purchase_entries', { params: { select: '*', id: `eq.${id}`, limit: '1' } }),
      readStonesForApi()
    ]);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const stone = stones.find((entry) => entry.id === catalogItemId);
    if (!existing) {
      sendJson(res, 404, { error: 'Purchase entry not found.' });
      return true;
    }
    if (existing.item_type !== 'stone' || !stone || !Array.isArray(stone.sizes) || !stone.sizes.map(Number).includes(Number(existing.size_mm))) {
      sendJson(res, 400, { error: 'Purchase entry cannot be linked to this catalog stone.' });
      return true;
    }

    const rows = await supabaseRequest('stone_purchase_entries', {
      method: 'PATCH',
      params: { id: `eq.${id}` },
      body: { catalog_item_id: catalogItemId, stone_id: catalogItemId },
      prefer: 'return=representation'
    });
    if (!Array.isArray(rows) || !rows[0]) {
      sendJson(res, 404, { error: 'Purchase entry not found.' });
      return true;
    }
    sendJson(res, 200, rows[0]);
    return true;
  }

  if (pathname.startsWith('/api/purchases/') && method === 'PUT') {
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const id = decodeURIComponent(pathname.slice('/api/purchases/'.length));
    const [stones, charms, spacers] = await Promise.all([readStonesForApi(), readCharmsForApi(), readSpacersForApi()]);
    const entry = normalizePurchaseEntry(bodyObj, { stones, charms, spacers });
    const rows = await supabaseRequest('stone_purchase_entries', { method: 'PATCH', params: { id: `eq.${id}` }, body: entry, prefer: 'return=representation' });
    if (!Array.isArray(rows) || !rows[0]) { sendJson(res, 404, { error: 'Purchase entry not found.' }); return true; }
    sendJson(res, 200, rows[0]);
    return true;
  }

  if (pathname.startsWith('/api/purchases/') && method === 'DELETE') {
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const id = decodeURIComponent(pathname.slice('/api/purchases/'.length));
    const rows = await supabaseRequest('stone_purchase_entries', { method: 'DELETE', params: { id: `eq.${id}` }, prefer: 'return=representation' });
    if (!Array.isArray(rows) || !rows[0]) { sendJson(res, 404, { error: 'Purchase entry not found.' }); return true; }
    sendJson(res, 200, { success: true });
    return true;
  }

  if (pathname === "/api/stones" && method === "GET") {
    sendJson(res, 200, await readStonesForApi());
    return true;
  }

  if (pathname === "/api/stones/save" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }
    if (hasCorruptedThaiCatalogText(bodyObj)) {
      sendJson(res, 400, { error: 'Invalid Thai catalog text encoding.' });
      return true;
    }
    try {
      validateManualStoneCosts(bodyObj);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }

    if (isSupabaseConfigured()) {
      const stoneToSave = { ...bodyObj };
      if (stoneToSave.displayOrder === undefined || stoneToSave.displayOrder === null) {
        const existingDisplayOrder = await getSupabaseDisplayOrderById("catalog_stones", stoneToSave.id);
        if (existingDisplayOrder !== null) {
          stoneToSave.displayOrder = existingDisplayOrder;
        }
      }
      await upsertSupabaseRow("catalog_stones", buildStoneRow(stoneToSave));
    } else {
      const stones = readJsonArray("stones");
      writeJsonFile(dataFiles.stones, upsertById(stones, bodyObj));
    }
    sendJson(res, 200, bodyObj);
    return true;
  }

  if (pathname === "/api/stones/delete" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { success: false, error: "Missing ID" });
      return true;
    }

    if (isSupabaseConfigured()) {
      const deleted = await deleteSupabaseRowById("catalog_stones", bodyObj.id);
      if (!deleted) {
        sendJson(res, 404, { success: false, error: "Stone not found", id: bodyObj.id });
        return true;
      }

      sendJson(res, 200, { success: true, id: bodyObj.id });
      return true;
    }

    const stones = readJsonArray("stones");
    const { deleted, nextRecords } = deleteById(stones, bodyObj.id);
    if (!deleted) {
      sendJson(res, 404, { success: false, error: "Stone not found", id: bodyObj.id });
      return true;
    }

    writeJsonFile(dataFiles.stones, nextRecords);
    sendJson(res, 200, { success: true, id: bodyObj.id });
    return true;
  }

  if (pathname.startsWith("/api/stones/") && method === "DELETE") {
    const stoneId = decodeURIComponent(pathname.slice("/api/stones/".length));
    if (!stoneId) {
      sendJson(res, 400, { error: "Missing stone ID" });
      return true;
    }

    if (isSupabaseConfigured()) {
      const deleted = await deleteSupabaseRowById("catalog_stones", stoneId);
      if (!deleted) {
        sendJson(res, 404, { error: "Stone not found" });
        return true;
      }

      sendJson(res, 200, { success: true, id: stoneId });
      return true;
    }

    const stones = readJsonArray("stones");
    const { deleted, nextRecords } = deleteById(stones, stoneId);
    if (!deleted) {
      sendJson(res, 404, { error: "Stone not found" });
      return true;
    }

    writeJsonFile(dataFiles.stones, nextRecords);
    sendJson(res, 200, { success: true, id: stoneId });
    return true;
  }

  if (pathname === "/api/charms" && method === "GET") {
    sendJson(res, 200, await readCharmsForApi());
    return true;
  }

  if (pathname === "/api/spacers" && method === "GET") {
    sendJson(res, 200, await readSpacersForApi());
    return true;
  }

  if (pathname === "/api/charms" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { error: "Missing charm ID" });
      return true;
    }
    if (hasCorruptedThaiCatalogText(bodyObj)) {
      sendJson(res, 400, { error: 'Invalid Thai catalog text encoding.' });
      return true;
    }

    if (isSupabaseConfigured()) {
      const existingCharm = await getSupabaseRecordById("catalog_charms", bodyObj.id);
      if (existingCharm) {
        sendJson(res, 409, { error: "Charm already exists" });
        return true;
      }
      await upsertSupabaseRow("catalog_charms", buildCharmRow(bodyObj));
    } else {
      const charms = readJsonArray("charms");
      if (charms.some((entry) => entry && entry.id === bodyObj.id)) {
        sendJson(res, 409, { error: "Charm already exists" });
        return true;
      }
      writeJsonFile(dataFiles.charms, [...charms, bodyObj]);
    }

    sendJson(res, 201, bodyObj);
    return true;
  }

  if (pathname === "/api/charms/delete" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { error: "Missing charm ID" });
      return true;
    }

    if (isSupabaseConfigured()) {
      const deleted = await deleteSupabaseRowById("catalog_charms", bodyObj.id);
      if (!deleted) {
        sendJson(res, 404, { error: "Charm not found" });
        return true;
      }

      sendJson(res, 200, { success: true, id: bodyObj.id });
      return true;
    }

    const charms = readJsonArray("charms");
    const { deleted, nextRecords } = deleteById(charms, bodyObj.id);
    if (!deleted) {
      sendJson(res, 404, { error: "Charm not found" });
      return true;
    }

    writeJsonFile(dataFiles.charms, nextRecords);
    sendJson(res, 200, { success: true, id: bodyObj.id });
    return true;
  }

  if (pathname.startsWith("/api/charms/")) {
    const charmId = decodeURIComponent(pathname.slice("/api/charms/".length));
    if (!charmId) {
      sendJson(res, 400, { error: "Missing charm ID" });
      return true;
    }

    if (method === "PUT") {
      if (!bodyObj || !bodyObj.id) {
        sendJson(res, 400, { error: "Missing charm payload" });
        return true;
      }

      const nextRecord = { ...bodyObj, id: charmId };
      if (hasCorruptedThaiCatalogText(nextRecord)) {
        sendJson(res, 400, { error: 'Invalid Thai catalog text encoding.' });
        return true;
      }
      if (isSupabaseConfigured()) {
        const existingCharm = await getSupabaseRecordById("catalog_charms", charmId);
        if (!existingCharm) {
          sendJson(res, 404, { error: "Charm not found" });
          return true;
        }
        await upsertSupabaseRow("catalog_charms", buildCharmRow(nextRecord));
      } else {
        const charms = readJsonArray("charms");
        const existingIndex = charms.findIndex((entry) => entry && entry.id === charmId);
        if (existingIndex < 0) {
          sendJson(res, 404, { error: "Charm not found" });
          return true;
        }
        charms[existingIndex] = nextRecord;
        writeJsonFile(dataFiles.charms, charms);
      }

      sendJson(res, 200, nextRecord);
      return true;
    }

    if (method === "DELETE") {
      if (isSupabaseConfigured()) {
        const deleted = await deleteSupabaseRowById("catalog_charms", charmId);
        if (!deleted) {
          sendJson(res, 404, { error: "Charm not found" });
          return true;
        }

        sendJson(res, 200, { success: true, id: charmId });
        return true;
      }

      const charms = readJsonArray("charms");
      const { deleted, nextRecords } = deleteById(charms, charmId);
      if (!deleted) {
        sendJson(res, 404, { error: "Charm not found" });
        return true;
      }

      writeJsonFile(dataFiles.charms, nextRecords);
      sendJson(res, 200, { success: true, id: charmId });
      return true;
    }
  }

  if (pathname.startsWith("/api/spacers/")) {
    const spacerId = decodeURIComponent(pathname.slice("/api/spacers/".length));
    if (!spacerId) {
      sendJson(res, 400, { error: "Missing spacer ID" });
      return true;
    }
    if (method === "PUT") {
      if (!bodyObj || !bodyObj.id) {
        sendJson(res, 400, { error: "Missing spacer payload" });
        return true;
      }

      const nextRecord = { ...bodyObj, id: spacerId };
      validateManualSpacerCost(nextRecord);
      if (hasCorruptedThaiCatalogText(nextRecord)) {
        sendJson(res, 400, { error: 'Invalid Thai catalog text encoding.' });
        return true;
      }
      if (isSupabaseConfigured()) {
        await upsertSupabaseRow("catalog_spacers", buildSpacerRow(nextRecord));
        sendJson(res, 200, nextRecord);
        return true;
      }

      sendJson(res, 501, { error: "Spacer persistence requires Supabase." });
      return true;
    }
  }

  if (pathname === "/api/orders" && method === "GET") {
    sendJson(res, 200, await readOrdersForApi());
    return true;
  }

  if (pathname === "/api/orders" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    const nextOrder = normalizeCanonicalOrderPricing({ ...bodyObj });
    if (!nextOrder.id) {
      nextOrder.id = nextRandomOrderId();
    }
    if (!nextOrder.date) {
      nextOrder.date = new Date().toISOString();
    }
    if (!nextOrder.status) {
      nextOrder.status = "New Order";
    }

    if (String(bodyObj.paymentMethod || '').toLowerCase() === 'stripe_checkout') {
      sendJson(res, 403, { error: 'Stripe orders are created and confirmed server-side.' });
      return true;
    }

    let existingOrder = null;
    if (isSupabaseConfigured()) {
      const existingParams = nextOrder.stripeCheckoutSessionId
        ? { stripe_checkout_session_id: `eq.${nextOrder.stripeCheckoutSessionId}` }
        : { id: `eq.${getOrderId(nextOrder)}` };
      const existingRows = await supabaseRequest("orders", {
        params: {
          select: "payload",
          ...existingParams,
          limit: "1"
        }
      });
      existingOrder = Array.isArray(existingRows) && existingRows[0] ? existingRows[0].payload : null;
    } else {
      const existingOrders = readJsonArray("orders");
      existingOrder = existingOrders.find((entry) => (
        (nextOrder.stripeCheckoutSessionId && entry?.stripeCheckoutSessionId === nextOrder.stripeCheckoutSessionId) ||
        getOrderId(entry) === getOrderId(nextOrder)
      )) || null;
    }

    if (existingOrder) {
      sendJson(res, 200, existingOrder);
      return true;
    }

    try {
      await validateOrderStockOrThrow(nextOrder);
    } catch (error) {
      sendJson(res, error.statusCode || 409, {
        error: error.message || "Stock validation failed.",
        stockIssues: error.stockIssues || []
      });
      return true;
    }

    const savedStockOrder = await deductStockForOrder(nextOrder);
    await saveOrderForApi(savedStockOrder);
    linkAnalyticsOrderConversion(savedStockOrder).catch((error) => {
      console.warn(`[analytics] order conversion link failed for ${savedStockOrder.id}:`, error?.message || error);
    });

    let responseOrder = savedStockOrder;
    try {
      await notifyAdminOrderCreated(savedStockOrder);
    } catch (error) {
      console.warn(`[admin-notify] unexpected failure for ${savedStockOrder.id}:`, error?.message || error);
    }

    try {
      const notificationResult = await trySendPaidOrderLineNotification(savedStockOrder);
      if (notificationResult.sent) {
        responseOrder = notificationResult.order;
        await saveOrderForApi(responseOrder);
      }
    } catch (error) {
      console.error(`Failed to send paid-order LINE notification for ${savedStockOrder.id}:`, error);
    }

    sendJson(res, 200, responseOrder);
    return true;
  }

  if (pathname === "/api/orders/update-status" && method === "POST") {
    if (!bodyObj || !bodyObj.id || bodyObj.status == null) {
      sendJson(res, 400, { error: "Missing parameters" });
      return true;
    }

    if (isSupabaseConfigured()) {
      const previousOrder = await getSupabaseRecordById("orders", bodyObj.id);
      if (previousOrder) {
        if (isUnpaidStripeCheckoutOrder(previousOrder)) {
          sendJson(res, 409, { error: "Unpaid Stripe Checkout orders cannot enter the fulfillment workflow." });
          return true;
        }
        let nextOrder = applyOrderWorkflowUpdates(previousOrder, bodyObj);

        try {
          const notificationResult = await trySendShippedLineNotification(previousOrder, nextOrder);
          if (notificationResult.sent) {
            nextOrder = notificationResult.order;
          }
        } catch (error) {
          console.error(`Failed to send shipped LINE notification for ${bodyObj.id}:`, error);
        }

        await upsertSupabaseRow("orders", buildOrderRow(nextOrder));
      }

      sendJson(res, 200, { success: true, id: bodyObj.id, status: bodyObj.status });
      return true;
    }

    const orders = readJsonArray("orders");
    const orderIndex = orders.findIndex((entry) => entry && entry.id === bodyObj.id);
    if (orderIndex >= 0) {
      const previousOrder = orders[orderIndex];
      if (isUnpaidStripeCheckoutOrder(previousOrder)) {
        sendJson(res, 409, { error: "Unpaid Stripe Checkout orders cannot enter the fulfillment workflow." });
        return true;
      }
      let nextOrder = applyOrderWorkflowUpdates(previousOrder, bodyObj);
      orders[orderIndex] = nextOrder;
      writeJsonFile(dataFiles.orders, orders);

      try {
        const notificationResult = await trySendShippedLineNotification(previousOrder, nextOrder);
        if (notificationResult.sent) {
          nextOrder = notificationResult.order;
          orders[orderIndex] = nextOrder;
          writeJsonFile(dataFiles.orders, orders);
        }
      } catch (error) {
        console.error(`Failed to send shipped LINE notification for ${bodyObj.id}:`, error);
      }

      sendJson(res, 200, { success: true, id: bodyObj.id, status: bodyObj.status });
      return true;
    }

    sendJson(res, 200, { success: true, id: bodyObj.id, status: bodyObj.status });
    return true;
  }

  if (pathname === "/api/settings" && method === "GET") {
    sendJson(res, 200, await readSettingsForApi());
    return true;
  }

  if (pathname === "/api/settings/save" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    if (isSupabaseConfigured()) {
      sendJson(res, 200, await saveSupabaseSettings(bodyObj));
    } else {
      writeJsonFile(dataFiles.settings, bodyObj);
      sendJson(res, 200, bodyObj);
    }
    return true;
  }

  if (pathname === "/api/reset" && method === "POST") {
    restoreSeedData();
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}

function resolveRootDocument(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (host.includes("crm.luckycolorstone.com")) {
    return "crm.html";
  }
  return "index.html";
}

function sanitizeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname || "/");
  if (decoded === "/") {
    return resolveRootDocument({ headers: { host: "" } });
  }

  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/^[/\\]+/, "");
}

async function serveStaticFile(req, res, urlObj) {
  const relativePath = urlObj.pathname === "/"
    ? resolveRootDocument(req)
    : sanitizeStaticPath(urlObj.pathname);
  const localFile = path.join(workspaceDir, relativePath);

  if (!localFile.startsWith(workspaceDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(localFile);
    if (!stat.isFile()) {
      sendText(res, 404, `File Not Found: ${urlObj.pathname}`);
      return;
    }

    const content = await fsp.readFile(localFile);
    const ext = path.extname(localFile).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    setCorsHeaders(res);
    res.end(content);
  } catch {
    sendText(res, 404, `File Not Found: ${urlObj.pathname}`);
  }
}

if (isFixtureOnlyUatBackend) {
  const requiredFixtureFiles = ['stones', 'charms', 'spacers', 'settings'];
  const missingFixtureFiles = requiredFixtureFiles.filter((key) => !fs.existsSync(bundledDataFiles[key]));
  if (missingFixtureFiles.length > 0) {
    throw new Error(`Missing required UAT fixture files: ${missingFixtureFiles.join(', ')}`);
  }
} else {
  seedDatabase();
}

const port = Number.parseInt(process.env.PORT || "8000", 10);

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (urlObj.pathname.startsWith("/api/")) {
      try {
        const handled = await handleApiRequest(req, res, urlObj);
        if (!handled) {
          sendJson(res, 404, { error: "API Route Not Found" });
        }
      } catch (error) {
        if (urlObj.pathname === "/api/stones/delete" && req.method === "POST") {
          sendJson(res, 500, { success: false, error: error.message });
        } else {
          sendJson(res, 500, { error: error.message });
        }
      }
      return;
    }

    await serveStaticFile(req, res, urlObj);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});

server.listen(port, () => {
  console.log(`Server started at http://localhost:${port}/`);
});
