const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const workspaceDir = __dirname;
const bundledDataDir = path.join(workspaceDir, "data");

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE");
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

function getLineChannelAccessToken() {
  return getEnvValue("LINE_CHANNEL_ACCESS_TOKEN");
}

function getLineChannelSecret() {
  return getEnvValue("LINE_CHANNEL_SECRET");
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
    return { sent: false, order };
  }

  console.info(`[orders] sending paid LINE detail link for ${getOrderId(order)}: ${getOrderDetailUrl(order)}`);
  await sendLineFlexMessageWithTextFallback({
    userId: getOrderLineUserId(order),
    flexMessage: buildPaymentSuccessFlexMessage(order),
    fallbackText: buildPaymentSuccessFallbackLineMessage(order)
  });

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

  const canonicalOrder = normalizeCanonicalOrderPricing(order);
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
        select: "payload,display_order,created_at",
        ...params
      }
    });
    return Array.isArray(rows) ? rows.map((row) => row.payload).filter(Boolean) : [];
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

function buildStoneRow(stone, index = 0) {
  return {
    id: String(stone?.id || "").trim(),
    payload: stone,
    category_id: String(stone?.categoryId || stone?.category || "").trim() || null,
    display_order: toInteger(stone?.displayOrder, (index + 1) * 10),
    in_stock: stone?.inStock !== false,
    is_active: stone?.isActive !== false
  };
}

function buildCharmRow(charm, index = 0) {
  return {
    id: String(charm?.id || "").trim(),
    payload: charm,
    category_id: String(charm?.categoryId || charm?.collection || "").trim() || null,
    display_order: toInteger(charm?.displayOrder, (index + 1) * 10),
    in_stock: charm?.availability?.inStock !== false && charm?.inStock !== false,
    is_active: charm?.availability?.isActive !== false && charm?.isActive !== false
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

function normalizeAnalyticsEventPayload(payload = {}, req = null) {
  const source = normalizeAnalyticsSource(payload.source || {});
  const eventName = truncateText(payload.eventName || payload.event_name || "", 120);
  const sessionId = truncateText(payload.sessionId || payload.session_id || "", 120);
  const stepValue = Number(payload.step);
  return {
    sessionId,
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
    converted: Boolean(payload.properties?.converted || payload.eventName === "order_created"),
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

  if (isSupabaseConfigured()) {
    await supabaseRequest("analytics_events", {
      method: "POST",
      body: eventRow,
      prefer: "return=minimal"
    });
    return;
  }

  const events = readJsonArray("analyticsEvents");
  events.push({ id: crypto.randomUUID(), ...eventRow });
  writeJsonFile(dataFiles.analyticsEvents, events.slice(-5000));
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
  const payload = normalizeAnalyticsEventPayload({
    sessionId,
    eventName: "order_created",
    step: 4,
    source,
    properties: {
      converted: true,
      revenue,
      paymentMethod: order.paymentMethod || ""
    },
    timestamp: new Date().toISOString(),
    url: "",
    orderId: getOrderId(order),
    lineUserId: order.lineUserId || "",
    userAgent: order.analyticsSource?.user_agent || ""
  });

  await upsertAnalyticsSession(payload);
}

const ANALYTICS_RANGE_PRESETS = Object.freeze(["today", "yesterday", "7d", "30d", "month", "all"]);
const ANALYTICS_FUNNEL_STAGES = Object.freeze([
  ["landing_view", "\u0E40\u0E02\u0E49\u0E32\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01"],
  ["start_customize_click", "\u0E01\u0E14\u0E40\u0E23\u0E34\u0E48\u0E21\u0E2D\u0E2D\u0E01\u0E41\u0E1A\u0E1A"],
  ["step_1_view", "\u0E16\u0E36\u0E07 Step 1"],
  ["step_2_view", "\u0E16\u0E36\u0E07 Step 2"],
  ["step_3_view", "\u0E16\u0E36\u0E07 Step 3"],
  ["bracelet_completed", "\u0E2D\u0E2D\u0E01\u0E41\u0E1A\u0E1A\u0E04\u0E23\u0E1A\u0E27\u0E07"],
  ["step_4_view", "\u0E16\u0E36\u0E07 Step 4"],
  ["payment_click", "\u0E01\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19"],
  ["order_created", "\u0E2A\u0E31\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08"]
]);

function normalizeAnalyticsRangeParams(searchParams = new URLSearchParams()) {
  const requestedRange = String(searchParams.get("range") || "7d").trim().toLowerCase();
  const range = ANALYTICS_RANGE_PRESETS.includes(requestedRange) ? requestedRange : "7d";
  const now = new Date();
  let startDate = null;
  let endDate = null;

  if (range === "today") {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
  } else if (range === "yesterday") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
  } else if (range === "7d") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
  } else if (range === "30d") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 29);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
  } else if (range === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
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
  const parsed = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) parsed.setUTCHours(23, 59, 59, 999);
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

function getAnalyticsDateKey(value) {
  const time = value ? new Date(value) : null;
  if (!time || Number.isNaN(time.getTime())) return "";
  return time.toISOString().slice(0, 10);
}

function isAnalyticsSessionConverted(session = {}) {
  return Boolean(session.converted || session.order_id || session.orderId);
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
          params: addDateRangeFilters({ select: "*", order: "last_seen_at.desc", limit: "5000" }, "started_at", rangeInfo)
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
    sessions: readJsonArray("analyticsSessions").filter((row) => isAnalyticsRowInRange(row, rangeInfo, ["started_at", "last_seen_at"])),
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
  const { sessions, events, errors } = await readAnalyticsRowsForSummary(rangeInfo);
  const sessionById = new Map();
  const channelStats = new Map();
  const dailyStats = new Map();
  const channelDayStats = new Map();
  const funnelSessionSets = new Map(ANALYTICS_FUNNEL_STAGES.map(([eventName]) => [eventName, new Set()]));
  const timeStepTotals = {};
  const timeStepCounts = {};
  const beadSizeCounts = {};
  const itemCounts = {};
  const categoryCounts = {};
  const stepDistributionCounts = { 1: 0, 2: 0, 3: 0, 4: 0, converted: 0 };

  sessions.forEach((session) => {
    const sessionId = getAnalyticsSessionId(session);
    if (sessionId) sessionById.set(sessionId, session);
    const channelInfo = normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess);
    const channel = channelInfo.channel;
    const source = normalizeAnalyticsDimension(channelInfo.source, "direct/unknown");
    const medium = normalizeAnalyticsDimension(session.first_medium || session.firstMedium);
    const campaign = normalizeAnalyticsDimension(session.first_campaign || session.firstCampaign);
    if (!channelStats.has(channel)) {
      channelStats.set(channel, {
        channel,
        source,
        medium,
        campaign,
        sessions: 0,
        step3Sessions: 0,
        braceletCompleted: 0,
        orders: 0,
        revenue: 0,
        conversionRate: 0,
        aov: 0
      });
    }
    const channelRow = channelStats.get(channel);
    channelRow.sessions += 1;
    if (channelRow.source === "direct/unknown" && source !== "direct/unknown") channelRow.source = source;
    if (channelRow.medium === "-" && medium !== "-") channelRow.medium = medium;
    if (channelRow.campaign === "-" && campaign !== "-") channelRow.campaign = campaign;

    const converted = isAnalyticsSessionConverted(session);
    const revenue = converted ? getAnalyticsSessionRevenue(session) : 0;
    if (converted) {
      channelRow.orders += 1;
      channelRow.revenue += revenue;
      stepDistributionCounts.converted += 1;
      if (sessionId) funnelSessionSets.get("order_created")?.add(sessionId);
    } else {
      const currentStep = Number(session.current_step ?? session.currentStep);
      if ([1, 2, 3, 4].includes(currentStep)) {
        stepDistributionCounts[currentStep] += 1;
      }
    }

    const dateKey = getAnalyticsDateKey(session.started_at || session.startedAt || session.last_seen_at || session.lastSeenAt);
    if (dateKey) {
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, { date: dateKey, sessions: 0, orders: 0, revenue: 0, conversionRate: 0 });
      }
      const dayRow = dailyStats.get(dateKey);
      dayRow.sessions += 1;
      if (converted) {
        dayRow.orders += 1;
        dayRow.revenue += revenue;
      }

      const channelDayKey = `${dateKey}\u0000${channel}`;
      if (!channelDayStats.has(channelDayKey)) {
        channelDayStats.set(channelDayKey, { date: dateKey, channel, sessions: 0, orders: 0, revenue: 0 });
      }
      const channelDayRow = channelDayStats.get(channelDayKey);
      channelDayRow.sessions += 1;
      if (converted) {
        channelDayRow.orders += 1;
        channelDayRow.revenue += revenue;
      }
    }
  });

  events.forEach((event) => {
    const eventName = getAnalyticsEventName(event);
    const sessionId = getAnalyticsSessionId(event);
    const properties = parseAnalyticsProperties(event.properties);
    if (funnelSessionSets.has(eventName) && sessionId) {
      funnelSessionSets.get(eventName).add(sessionId);
    }

    if (eventName === "step_duration") {
      const fromStep = properties.from_step || properties.fromStep || event.step || "unknown";
      const durationMs = Number(properties.duration_ms || properties.durationMs || 0);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        incrementCount(timeStepTotals, fromStep, durationMs);
        incrementCount(timeStepCounts, fromStep, 1);
      }
    }

    if (eventName === "bead_size_selected" && (properties.bead_size || properties.beadSize)) {
      addAnalyticsCount(beadSizeCounts, `${properties.bead_size || properties.beadSize}mm`, "beadSize");
    }
    if (eventName === "item_added") {
      if (properties.size_mm || properties.sizeMm) addAnalyticsCount(beadSizeCounts, `${properties.size_mm || properties.sizeMm}mm`, "beadSize");
      if (properties.item_id || properties.itemId) addAnalyticsCount(itemCounts, properties.item_id || properties.itemId, "item");
      if (properties.category || properties.item_type || properties.itemType) {
        addAnalyticsCount(categoryCounts, properties.category || properties.item_type || properties.itemType, "category");
      }
    }
    if (eventName === "category_changed" && (properties.category || properties.section)) {
      addAnalyticsCount(categoryCounts, properties.category || properties.section, "category");
    }
  });

  const step3SessionIds = funnelSessionSets.get("step_3_view") || new Set();
  const completedSessionIds = funnelSessionSets.get("bracelet_completed") || new Set();
  channelStats.forEach((row) => {
    let step3Count = 0;
    let completedCount = 0;
    step3SessionIds.forEach((sessionId) => {
      const session = sessionById.get(sessionId);
      const sessionChannel = normalizeAnalyticsChannel(session?.first_source || session?.firstSource, session?.platform_guess || session?.platformGuess).channel;
      if (sessionChannel === row.channel) step3Count += 1;
    });
    completedSessionIds.forEach((sessionId) => {
      const session = sessionById.get(sessionId);
      const sessionChannel = normalizeAnalyticsChannel(session?.first_source || session?.firstSource, session?.platform_guess || session?.platformGuess).channel;
      if (sessionChannel === row.channel) completedCount += 1;
    });
    row.step3Sessions = step3Count;
    row.braceletCompleted = completedCount;
  });

  const stepDurations = Object.entries(timeStepTotals).map(([step, totalMs]) => ({
    step,
    averageMs: Math.round(totalMs / Math.max(1, timeStepCounts[step] || 1)),
    samples: timeStepCounts[step] || 0
  })).sort((a, b) => String(a.step).localeCompare(String(b.step), undefined, { numeric: true }));

  const totalOrders = sessions.filter((session) => session.converted || session.order_id || session.orderId).length;
  const totalSessions = sessions.length;
  const revenue = sessions.reduce((sum, session) => sum + (isAnalyticsSessionConverted(session) ? getAnalyticsSessionRevenue(session) : 0), 0);
  const channels = Array.from(channelStats.values())
    .map((row) => ({
      ...row,
      conversionRate: row.sessions ? (row.orders / row.sessions) * 100 : 0,
      aov: row.orders ? row.revenue / row.orders : 0
    }))
    .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
  const landingSessions = funnelSessionSets.get("landing_view")?.size || 0;
  let previousCount = null;
  const funnel = ANALYTICS_FUNNEL_STAGES.map(([eventName, label]) => {
    const count = funnelSessionSets.get(eventName)?.size || 0;
    const dropoffRate = previousCount == null || previousCount <= 0 ? 0 : Math.max(0, ((previousCount - count) / previousCount) * 100);
    previousCount = count;
    return {
      key: eventName,
      eventName,
      label,
      sessions: count,
      dropoffRate,
      dropoffFromPrevious: dropoffRate,
      landingConversionRate: landingSessions ? (count / landingSessions) * 100 : 0,
      percentFromLanding: landingSessions ? (count / landingSessions) * 100 : 0
    };
  });
  const stepDistribution = [
    { step: 1, label: "Step 1", sessions: stepDistributionCounts[1] },
    { step: 2, label: "Step 2", sessions: stepDistributionCounts[2] },
    { step: 3, label: "Step 3", sessions: stepDistributionCounts[3] },
    { step: 4, label: "Step 4", sessions: stepDistributionCounts[4] },
    { step: "converted", label: "\u0E2A\u0E31\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08", sessions: stepDistributionCounts.converted }
  ];
  const dailyTrend = Array.from(dailyStats.values())
    .map((row) => ({ ...row, conversionRate: row.sessions ? (row.orders / row.sessions) * 100 : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const channelByDay = Array.from(channelDayStats.values())
    .sort((a, b) => b.date.localeCompare(a.date) || b.revenue - a.revenue || b.sessions - a.sessions)
    .slice(0, 200);
  const recentErrors = errors
    .slice()
    .sort((a, b) => getAnalyticsRowTime(b, ["created_at"]) - getAnalyticsRowTime(a, ["created_at"]))
    .slice(0, 20)
    .map((error) => {
      const session = sessionById.get(getAnalyticsSessionId(error));
      const channelInfo = normalizeAnalyticsChannel(session?.first_source || session?.firstSource, session?.platform_guess || session?.platformGuess);
      return {
        time: error.created_at || error.timestamp || null,
        sessionId: getAnalyticsSessionId(error),
        source: channelInfo.channel,
        errorType: error.error_type || error.errorType || error.event_name || "error",
        step: error.step ?? null,
        message: error.message || parseAnalyticsProperties(error.properties).message || "",
        url: error.url || ""
      };
    });
  const recentOrders = sessions
    .filter((session) => session.converted || session.order_id || session.orderId)
    .sort((a, b) => getAnalyticsRowTime(b, ["last_seen_at", "started_at"]) - getAnalyticsRowTime(a, ["last_seen_at", "started_at"]))
    .slice(0, 20)
    .map((session) => {
      const channelInfo = normalizeAnalyticsChannel(session.first_source || session.firstSource, session.platform_guess || session.platformGuess);
      return {
        time: session.last_seen_at || session.started_at || null,
        source: channelInfo.channel,
        rawSource: normalizeAnalyticsDimension(channelInfo.source, "direct/unknown"),
        medium: normalizeAnalyticsDimension(session.first_medium || session.firstMedium),
        campaign: normalizeAnalyticsDimension(session.first_campaign || session.firstCampaign),
        orderId: session.order_id || session.orderId || "",
        revenue: getAnalyticsSessionRevenue(session),
        currentStep: session.current_step ?? session.currentStep ?? null
      };
    });
  const sortCountRows = (rows) => Object.values(rows)
    .sort((a, b) => b.count - a.count || String(a.item || a.beadSize || a.category).localeCompare(String(b.item || b.beadSize || b.category)))
    .slice(0, 10);

  return {
    success: true,
    range: rangeInfo.range,
    start: rangeInfo.startIso,
    end: rangeInfo.endIso,
    generatedAt: new Date().toISOString(),
    totals: {
      sessions: totalSessions,
      orders: totalOrders,
      conversionRate: totalSessions ? (totalOrders / totalSessions) * 100 : 0,
      revenue,
      aov: totalOrders ? revenue / totalOrders : 0,
      errors: errors.length
    },
    channels,
    sources: channels,
    bySource: channels,
    funnel,
    stepDistribution,
    dailyTrend,
    channelByDay,
    insights: {
      completedNoPayment: Math.max(0, (funnelSessionSets.get("bracelet_completed")?.size || 0) - totalOrders)
    },
    stepDurations,
    averageTimePerStep: stepDurations.map((row) => ({ step: row.step, average_ms: row.averageMs, samples: row.samples })),
    popularBeadSizes: sortCountRows(beadSizeCounts),
    popularItems: sortCountRows(itemCounts),
    popularCategories: sortCountRows(categoryCounts),
    recentErrors,
    recentOrders
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

  const bodyObj = req.headers["content-length"] || req.headers["transfer-encoding"]
    ? await parseJsonBody(req)
    : null;

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

    const session = await createStripeCheckoutSession({
      order: bodyObj.order,
      origin: bodyObj.origin
    });

    sendJson(res, 200, {
      id: session.id,
      url: session.url,
      amountTotal: session.amount_total,
      currency: session.currency
    });
    return true;
  }

  if (pathname === "/api/stripe/checkout-session" && method === "GET") {
    const sessionId = urlObj.searchParams.get("session_id");
    const session = await getStripeCheckoutSession(sessionId);
    const shippingDetails = getStripeSessionShippingDetails(session);
    const phoneNumber = String(session.customer_details?.phone || "").trim();

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
      metadata: session.metadata || {}
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

  if (pathname === "/api/stones" && method === "GET") {
    sendJson(res, 200, await readStonesForApi());
    return true;
  }

  if (pathname === "/api/stones/save" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    if (isSupabaseConfigured()) {
      await upsertSupabaseRow("catalog_stones", buildStoneRow(bodyObj));
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

  if (pathname === "/api/charms" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { error: "Missing charm ID" });
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

    await saveOrderForApi(nextOrder);
    linkAnalyticsOrderConversion(nextOrder).catch((error) => {
      console.warn(`[analytics] order conversion link failed for ${nextOrder.id}:`, error?.message || error);
    });

    let responseOrder = nextOrder;
    try {
      await notifyAdminOrderCreated(nextOrder);
    } catch (error) {
      console.warn(`[admin-notify] unexpected failure for ${nextOrder.id}:`, error?.message || error);
    }

    try {
      const notificationResult = await trySendPaidOrderLineNotification(nextOrder);
      if (notificationResult.sent) {
        responseOrder = notificationResult.order;
        await saveOrderForApi(responseOrder);
      }
    } catch (error) {
      console.error(`Failed to send paid-order LINE notification for ${nextOrder.id}:`, error);
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

seedDatabase();

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
