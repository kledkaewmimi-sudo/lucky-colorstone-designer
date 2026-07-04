const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const workspaceDir = __dirname;
const dataDir = path.join(workspaceDir, "data");
const dataFiles = {
  stones: path.join(dataDir, "stones.json"),
  charms: path.join(dataDir, "charms.json"),
  orders: path.join(dataDir, "orders.json"),
  settings: path.join(dataDir, "settings.json")
};

const defaultFileText = {
  stones: "[]",
  charms: "[]",
  orders: "[]",
  settings: "{\"globalDiscountPercent\":20}"
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

function ensureDataFile(filePath, fallbackText) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fallbackText, "utf8");
    return;
  }

  const raw = fs.readFileSync(filePath);
  if (!raw.length || !normalizeJsonText(raw.toString("utf8"), "")) {
    fs.writeFileSync(filePath, fallbackText, "utf8");
  }
}

function readJsonFileText(filePath, fallback = "[]") {
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
  ensureDataFile(dataFiles.stones, defaultFileText.stones);
  ensureDataFile(dataFiles.charms, defaultFileText.charms);
  ensureDataFile(dataFiles.orders, defaultFileText.orders);
  ensureDataFile(dataFiles.settings, defaultFileText.settings);

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

  const safeOrigin = getSafeOrigin(origin);
  const amountTotal = normalizeCurrencyAmount(order.netPrice);
  const customerName = String(order.customerName || "Khun Guest").trim() || "Khun Guest";
  const beadSize = String(order.beadSize || "").trim() || "6";
  const totalBeads = Number.parseInt(order.totalBeads || 0, 10) || 0;
  const configurationCode = String(order.configurationCode || "").trim();
  const shippingSource = order.shippingInfo && typeof order.shippingInfo === "object" ? order.shippingInfo : order;
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
  form.append("shipping_address_collection[allowed_countries][0]", "TH");
  form.append("phone_number_collection[enabled]", "true");
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
  form.append("metadata[wristSize]", String(order.wristSize ?? ""));
  form.append("metadata[beadSize]", beadSize.slice(0, 500));
  form.append("metadata[totalBeads]", String(totalBeads));
  form.append("metadata[netPrice]", String(order.netPrice ?? ""));
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

async function handleApiRequest(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method;
  const bodyObj = req.headers["content-length"] || req.headers["transfer-encoding"]
    ? await parseJsonBody(req)
    : null;

  const stones = Array.isArray(readJsonFile(dataFiles.stones, defaultFileText.stones))
    ? readJsonFile(dataFiles.stones, defaultFileText.stones)
    : [];
  const charms = Array.isArray(readJsonFile(dataFiles.charms, defaultFileText.charms))
    ? readJsonFile(dataFiles.charms, defaultFileText.charms)
    : [];
  const orders = Array.isArray(readJsonFile(dataFiles.orders, defaultFileText.orders))
    ? readJsonFile(dataFiles.orders, defaultFileText.orders)
    : [];
  const settings = readJsonFile(dataFiles.settings, defaultFileText.settings) || { globalDiscountPercent: 20 };

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

  if (pathname === "/api/stones" && method === "GET") {
    sendJsonString(res, 200, readJsonFileText(dataFiles.stones, defaultFileText.stones));
    return true;
  }

  if (pathname === "/api/stones/save" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    writeJsonFile(dataFiles.stones, upsertById(stones, bodyObj));
    sendJson(res, 200, bodyObj);
    return true;
  }

  if (pathname === "/api/stones/delete" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { success: false, error: "Missing ID" });
      return true;
    }

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
    sendJsonString(res, 200, readJsonFileText(dataFiles.charms, defaultFileText.charms));
    return true;
  }

  if (pathname === "/api/charms" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { error: "Missing charm ID" });
      return true;
    }

    if (charms.some((entry) => entry && entry.id === bodyObj.id)) {
      sendJson(res, 409, { error: "Charm already exists" });
      return true;
    }

    writeJsonFile(dataFiles.charms, [...charms, bodyObj]);
    sendJson(res, 201, bodyObj);
    return true;
  }

  if (pathname === "/api/charms/delete" && method === "POST") {
    if (!bodyObj || !bodyObj.id) {
      sendJson(res, 400, { error: "Missing charm ID" });
      return true;
    }

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

      const existingIndex = charms.findIndex((entry) => entry && entry.id === charmId);
      if (existingIndex < 0) {
        sendJson(res, 404, { error: "Charm not found" });
        return true;
      }

      const nextRecord = { ...bodyObj, id: charmId };
      charms[existingIndex] = nextRecord;
      writeJsonFile(dataFiles.charms, charms);
      sendJson(res, 200, nextRecord);
      return true;
    }

    if (method === "DELETE") {
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
    sendJsonString(res, 200, readJsonFileText(dataFiles.orders, defaultFileText.orders));
    return true;
  }

  if (pathname === "/api/orders" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    const nextOrder = { ...bodyObj };
    if (!nextOrder.id) {
      nextOrder.id = nextRandomOrderId();
    }
    if (!nextOrder.date) {
      nextOrder.date = new Date().toISOString();
    }
    if (!nextOrder.status) {
      nextOrder.status = "New Order";
    }

    writeJsonFile(dataFiles.orders, [nextOrder, ...orders]);
    sendJson(res, 200, nextOrder);
    return true;
  }

  if (pathname === "/api/orders/update-status" && method === "POST") {
    if (!bodyObj || !bodyObj.id || bodyObj.status == null) {
      sendJson(res, 400, { error: "Missing parameters" });
      return true;
    }

    const orderIndex = orders.findIndex((entry) => entry && entry.id === bodyObj.id);
    if (orderIndex >= 0) {
      orders[orderIndex] = { ...orders[orderIndex], status: bodyObj.status };
    }

    writeJsonFile(dataFiles.orders, orders);
    sendJson(res, 200, { success: true, id: bodyObj.id, status: bodyObj.status });
    return true;
  }

  if (pathname === "/api/settings" && method === "GET") {
    sendJsonString(res, 200, readJsonFileText(dataFiles.settings, defaultFileText.settings));
    return true;
  }

  if (pathname === "/api/settings/save" && method === "POST") {
    if (!bodyObj) {
      sendJson(res, 400, { error: "Empty body" });
      return true;
    }

    writeJsonFile(dataFiles.settings, bodyObj);
    sendJson(res, 200, bodyObj);
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
