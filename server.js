const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const { buildMetaPurchaseEvent, getMetaPurchaseEventId, summarizeMetaCapiSuccessBody } = require('./meta-capi-purchase.js');
const {
  TIKTOK_EVENTS_API_URL,
  buildTikTokCompletePaymentEvent,
  buildTikTokEventsRequest,
  getTikTokCompletePaymentEventId,
  summarizeTikTokEventsApiResponse
} = require('./tiktok-events-api.js');
const { HANDOFF_TTL_MS, TOKEN_PATTERN: HANDOFF_TOKEN_PATTERN, createHandoffToken, normalizeHandoffPayload } = require('./line-auth-handoff.js');
const { validateAuthoritativeOrder } = require('./server-order-validation.js');
const { preserveOrCreateOrderCostSnapshot } = require('./server-order-cost-snapshot.js');
const {
  attachAdminOrderNumbers,
  buildAdminOrderNumberLine,
  normalizeAdminOrderNumber
} = require('./server-admin-order-numbers.js');
const { buildCrmOverview, paginateCrmOrders, toCrmOrderSummary } = require('./crm-order-read-model.js');
const {
  DEFERRED_LOGIN_QA_TTL_MS,
  DEFERRED_LOGIN_QA_TOKEN_PATTERN,
  createDeferredLoginQaToken,
  isDeferredLoginQaSessionActive
} = require('./deferred-login-qa-session.js');

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
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

// ============================================================================
// SECURITY HOTFIX 2026-10-10 - public static asset policy (Render origin).
//
// The static fallback used to serve ANY file that existed under the workspace:
// server.js, server.ps1, lucky-colorstone-designer.zip, package.json,
// .env.local, reports/, tests/ and the writable data stores were all publicly
// downloadable from the Render origin. Static serving is now an explicit
// ALLOWLIST: only web assets whose extension is public are served, and every
// internal path class is denied first.
//
// A denied path is reported exactly like a missing file, so the response cannot
// be used to confirm that server-side source, archives or backups exist on disk.
// ============================================================================
const PUBLIC_STATIC_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".png", ".jpg", ".jpeg", ".webp",
  ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".webmanifest", ".txt"
]);

// Directories that are never public (server code, tooling, docs, tests, stores).
const PUBLIC_STATIC_DENY_SEGMENTS = new Set([
  "reports", "tests", "test-results", "scripts", "docs", "supabase",
  "node_modules", "production-backups", "assets_backup", "backup", "backups",
  "logs", "tmp", "temp", "private", "internal", "secrets", "server", "api-backup"
]);

// Files whose extension is public but whose content is not.
const PUBLIC_STATIC_DENY_FILES = new Set([
  "server.js", "server.cjs", "server.mjs", "server.ps1", "package.json",
  "package-lock.json", "npm-shrinkwrap.json", "vercel.json", "procfile",
  "dockerfile", "docker-compose.yml", "orders.json", "analytics_events.json",
  "analytics_sessions.json", "analytics_errors.json", "admin_order_numbers.json",
  "purchase_entries.json", "stone_purchase_entries.json"
]);

// Extensions that must never be served, even if a future allowlist entry slips.
const PUBLIC_STATIC_DENY_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".tgz", ".rar", ".7z", ".md", ".log", ".yml", ".yaml",
  ".sql", ".sh", ".bash", ".ps1", ".bat", ".cmd", ".ini", ".cfg", ".conf",
  ".bak", ".backup", ".orig", ".rej", ".patch", ".diff", ".key", ".pem", ".crt",
  ".cer", ".p12", ".pfx", ".map", ".csv", ".tsv", ".db", ".sqlite", ".env"
]);

// Extension-less files that the release package classifies as client-required.
const PUBLIC_STATIC_EXCEPTION_FILES = new Set(["_redirects"]);

function isPublicStaticAsset(relativePath) {
  const raw = String(relativePath || "");
  if (!raw || raw.length > 512) return false;
  if (raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return false;

  const segments = raw.split("/");
  if (!segments.length) return false;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return false;
    // Dotfiles/dotdirs, trailing dot or space (Windows normalises them away),
    // any whitespace, NTFS alternate data streams, 8.3 short names and any
    // remaining escape/encoding artefact are all rejected outright.
    if (segment.startsWith(".") || segment.endsWith(".") || segment.endsWith(" ")) return false;
    if (/[\s~:]/.test(segment)) return false;
    if (/%[0-9a-f]{2}/i.test(segment)) return false;
  }

  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.some((segment) => PUBLIC_STATIC_DENY_SEGMENTS.has(segment))) return false;

  const base = lower[lower.length - 1];
  if (PUBLIC_STATIC_DENY_FILES.has(base)) return false;
  if (PUBLIC_STATIC_EXCEPTION_FILES.has(base)) return true;

  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  if (!ext) return false;
  if (PUBLIC_STATIC_DENY_EXTENSIONS.has(ext)) return false;
  return PUBLIC_STATIC_EXTENSIONS.has(ext);
}

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

// TURN 10 (data transfer): public catalog/settings and authenticated CRM JSON were previously
// re-transferred in full on every request because the response carried no validator. A strong ETag plus
// must-revalidate semantics keeps freshness exactly as it is (a change still revalidates immediately)
// while a warm reload costs a 304 with no body. The validator is content-derived, so it cannot go stale
// behind a data change.
function sendJsonValidated(req, res, statusCode, data, { cacheControl = "public, max-age=0, must-revalidate", vary = null } = {}) {
  const payload = JSON.stringify(data);
  const etag = `W/"${crypto.createHash("sha1").update(payload).digest("hex")}"`;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", etag);
  if (vary) res.setHeader("Vary", vary);
  setCorsHeaders(res);
  const inm = String(req?.headers?.["if-none-match"] || "");
  if (inm && inm.split(",").map((value) => value.trim()).includes(etag)) {
    res.statusCode = 304;
    res.removeHeader("Content-Type");
    res.end();
    return;
  }
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

// ============================================================================
// SECURITY HOTFIX 2026-10-09 — server-verified authorization for customer and
// CRM data. Nothing else in this file was changed: routes, order payloads,
// pricing, Stripe and PromptPay behaviour are untouched.
// ============================================================================

// ---- admin (CRM) authorization -------------------------------------------
// A server-side shared secret must be configured. If it is missing the admin
// API fails CLOSED (503) instead of exposing data.
function getAdminApiSecret() {
  return getEnvValue('ADMIN_API_SECRET') || getEnvValue('DEFERRED_LOGIN_QA_ADMIN_SECRET');
}
function adminApiConfigured() { return Boolean(getAdminApiSecret()); }
function hasAdminApiAccess(req) {
  const secret = getAdminApiSecret();
  const provided = String(req.headers['x-admin-secret'] || '');
  if (secret && provided) {
    const expectedBuffer = Buffer.from(secret, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return true;
  }
  return Boolean(getAdminSession(req));
}
function denyAdminApi(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!adminApiConfigured()) {
    sendJson(res, 503, { error: 'Admin API is not configured.' });
    return;
  }
  sendJson(res, 401, { error: 'Admin authorization required.' });
}

// ---- admin operator sessions --------------------------------------------
// Operators exchange the server master secret for a short-lived, HttpOnly, signed
// session cookie plus a CSRF token bound to that session. Cookie-authenticated
// state changes must also present the CSRF token, so a cross-site page can never
// replay an operator session. The master secret is never stored in frontend source
// and never persisted in browser storage.
const ADMIN_SESSION_COOKIE = 'lcs_admin_session';
const ADMIN_CSRF_COOKIE = 'lcs_admin_csrf';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 10;
const adminLoginAttempts = new Map();
const revokedAdminSessions = new Map();

function getAdminUsername() { return String(getEnvValue('ADMIN_USERNAME') || 'admin').trim() || 'admin'; }
function getClientIp(req) {
  // Behind Vercel/Render the edge appends the address of the peer it actually saw, so the LAST entry
  // is the one the trusted hop supplied. Every earlier entry (including anything the client sent) is
  // attacker-controlled and must never key the rate limiter, or a spoofed x-forwarded-for could bypass it.
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return String(req.socket?.remoteAddress || 'unknown');
}
function getAdminSessionKey() {
  const base = getAdminApiSecret() || getEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  if (!base) return null;
  return crypto.createHmac('sha256', base).update('lcs-admin-session-v1').digest();
}
function base64UrlEncode(value) { return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64UrlDecode(value) { const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8'); }
function createAdminSessionToken(ttlMs = ADMIN_SESSION_TTL_MS) {
  const key = getAdminSessionKey();
  if (!key) return null;
  const payload = { exp: Date.now() + ttlMs, csrf: crypto.randomBytes(24).toString('hex'), user: getAdminUsername(), jti: crypto.randomBytes(12).toString('hex') };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', key).update(body).digest('hex');
  return { token: body + '.' + sig, payload };
}
function verifyAdminSessionToken(token) {
  const key = getAdminSessionKey();
  const value = String(token || '').trim();
  if (!key || !value.includes('.')) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest('hex');
  const a = Buffer.from(expected, 'utf8'); const b = Buffer.from(parts[1], 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload = null;
  try { payload = JSON.parse(base64UrlDecode(parts[0])); } catch { return null; }
  if (!payload || !Number.isFinite(payload.exp) || Date.now() > payload.exp) return null;
  if (payload.jti && revokedAdminSessions.has(payload.jti)) {
    if (revokedAdminSessions.get(payload.jti) > Date.now()) return null;
    revokedAdminSessions.delete(payload.jti);
  }
  return payload;
}
function getAdminSession(req) { return verifyAdminSessionToken(getRequestCookie(req, ADMIN_SESSION_COOKIE)); }
function isAdminCookieAuthenticated(req) { return Boolean(getAdminSession(req)); }
function hasValidAdminCsrf(req) {
  const session = getAdminSession(req);
  if (!session) return false;
  const provided = String(req.headers['x-csrf-token'] || '');
  return Boolean(provided) && provided === session.csrf;
}
function adminSessionCookieAttributes(maxAgeSeconds) {
  return 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + Math.max(0, Math.trunc(maxAgeSeconds));
}
function setAdminSessionCookies(res, session) {
  const maxAge = Math.ceil(ADMIN_SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', [
    ADMIN_SESSION_COOKIE + '=' + session.token + '; ' + adminSessionCookieAttributes(maxAge),
    ADMIN_CSRF_COOKIE + '=' + session.payload.csrf + '; Path=/; Secure; SameSite=Strict; Max-Age=' + maxAge
  ]);
}
function clearAdminSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    ADMIN_SESSION_COOKIE + '=; ' + adminSessionCookieAttributes(0),
    ADMIN_CSRF_COOKIE + '=; Path=/; Secure; SameSite=Strict; Max-Age=0'
  ]);
}
function adminLoginRateLimited(req) {
  const entry = adminLoginAttempts.get(getClientIp(req));
  if (!entry || Date.now() - entry.first > ADMIN_LOGIN_WINDOW_MS) return false;
  return entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS;
}
function recordAdminLoginFailure(req) {
  const ip = getClientIp(req); const now = Date.now();
  const entry = adminLoginAttempts.get(ip);
  if (!entry || now - entry.first > ADMIN_LOGIN_WINDOW_MS) adminLoginAttempts.set(ip, { first: now, count: 1 });
  else { entry.count += 1; adminLoginAttempts.set(ip, entry); }
}
function clearAdminLoginFailures(req) { adminLoginAttempts.delete(getClientIp(req)); }

// Single gate for every administrative read and write. Fails closed when no server
// secret is configured, and requires a CSRF token for cookie-authenticated writes.
function requireAdminAccess(req, res, { write = false } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!adminApiConfigured()) { sendJson(res, 503, { error: 'Admin API is not configured.' }); return false; }
  if (!hasAdminApiAccess(req)) { sendJson(res, 401, { error: 'Admin authorization required.' }); return false; }
  if (write && isAdminCookieAuthenticated(req) && !hasValidAdminCsrf(req)) { sendJson(res, 403, { error: 'CSRF token required for admin changes.' }); return false; }
  return true;
}

// ---- customer order access tokens ----------------------------------------
// A signed, order-scoped, expiring token. The HMAC key is derived from an
// existing server-only secret with a domain-separation label, so no new
// secret material is required and the token can never be forged by a client.
const ORDER_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function getOrderAccessTokenKey() {
  const base = getEnvValue('SUPABASE_SERVICE_ROLE_KEY') || getEnvValue('STRIPE_WEBHOOK_SECRET') || getEnvValue('LINE_CHANNEL_SECRET');
  if (!base) return null;
  return crypto.createHmac('sha256', base).update('lcs-order-access-token-v1').digest();
}
function signOrderAccessToken(orderId, expiresAt) {
  const key = getOrderAccessTokenKey();
  if (!key || !orderId) return null;
  return crypto.createHmac('sha256', key).update('order:' + orderId + ':' + expiresAt).digest('hex');
}
function createOrderAccessToken(orderId, ttlMs = ORDER_ACCESS_TOKEN_TTL_MS) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  const expiresAt = Date.now() + ttlMs;
  const signature = signOrderAccessToken(id, expiresAt);
  return signature ? expiresAt + '.' + signature : null;
}
function verifyOrderAccessToken(orderId, token) {
  const id = String(orderId || '').trim();
  const value = String(token || '').trim();
  if (!id || !value) return false;
  const [rawExpiry, signature] = value.split('.');
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (Date.now() > expiresAt) return false;
  const expected = signOrderAccessToken(id, expiresAt);
  if (!expected) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- scoped order reads (server-side filtering, never "download all") ----
async function readOrderByIdScoped(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  if (isSupabaseConfigured()) {
    const rows = await supabaseRequest('orders', { params: { select: 'payload', 'payload->>id': 'eq.' + id, limit: '1' } });
    return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  }
  return readJsonArray('orders').find((entry) => getOrderId(entry) === id) || null;
}
async function readOrderBySessionIdScoped(sessionId) {
  const value = String(sessionId || '').trim();
  if (!value) return null;
  if (isSupabaseConfigured()) {
    const rows = await supabaseRequest('orders', { params: { select: 'payload', stripe_checkout_session_id: 'eq.' + value, limit: '1' } });
    return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  }
  return readJsonArray('orders').find((entry) => entry?.stripeCheckoutSessionId === value) || null;
}
// ---- LINE-verified customer reauthorization ------------------------------
// Legacy order links (created before signed tokens existed) can still be opened safely when
// the customer proves ownership: the browser returns a LINE ID token from LIFF, the server
// verifies it with LINE, and only that verified customer's own orders are ever returned.
function getLineLoginChannelId() {
  const explicit = getEnvValue('LINE_LOGIN_CHANNEL_ID') || getEnvValue('LINE_CHANNEL_ID');
  if (explicit) return String(explicit).trim();
  const liffId = String(getEnvValue('PRODUCTION_LIFF_ID') || getEnvValue('LINE_LIFF_ID') || '2010525799-qImIuhla').trim();
  const prefix = liffId.split('-')[0];
  return /^[0-9]+$/.test(prefix) ? prefix : '';
}
async function verifyLineIdToken(idToken, channelId) {
  const endpoint = String(getEnvValue('LINE_TOKEN_VERIFY_URL') || 'https://api.line.me/oauth2/v2.1/verify').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
      signal: controller.signal
    });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => null);
    const sub = String(payload?.sub || '').trim();
    return /^U[0-9a-f]{32}$/i.test(sub) ? sub : '';
  } finally {
    clearTimeout(timer);
  }
}
async function readOrdersByLineUserIdScoped(lineUserId) {
  const id = String(lineUserId || '').trim();
  if (!id) return [];
  if (isSupabaseConfigured()) {
    const rows = await supabaseRequest('orders', { params: { select: 'payload', line_user_id: 'eq.' + id, order: 'created_at.desc', limit: '50' } });
    return (Array.isArray(rows) ? rows : []).map((row) => row?.payload).filter(Boolean);
  }
  return readJsonArray('orders').filter((entry) => String(entry?.lineUserId || '').trim() === id).slice(0, 50);
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

function normalizeStripeCheckoutAttemptId(value) {
  const attemptId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(attemptId) ? attemptId : '';
}

function resolveStripeCheckoutAttemptId(value) {
  return value === undefined ? crypto.randomUUID() : normalizeStripeCheckoutAttemptId(value);
}

function getStripeCheckoutOrderId(attemptId) {
  const digest = crypto.createHash('sha256').update(attemptId).digest();
  return `ORD-${100000 + (digest.readUInt32BE(0) % 900000)}`;
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

async function sendMetaPurchaseEvent(order, stripeSession) {
  const config = getMetaConversionsApiConfig();
  const orderReference = getOrderId(order) || 'unknown';
  const totalPrice = getOrderTotalPrice(order);
  const event = buildMetaPurchaseEvent({ order, stripeSession, totalPrice, currency: 'THB', eventTime: Date.now(), fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/' });
  if (!config || !event) {
    return { sent: false, skipped: "not_configured_or_incomplete" };
  }

  console.info(`[meta-capi] Purchase attempt order=${orderReference}`);
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 8000);
  let response;
  try {
    response = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(config.pixelId)}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: timeout.signal,
      body: JSON.stringify({ access_token: config.accessToken, data: [event] })
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) throw new Error(`Meta Conversions API returned HTTP ${response.status}.`);
  let delivery = { eventsReceived: null, fbtraceIdPresent: false };
  try {
    delivery = summarizeMetaCapiSuccessBody(await response.text());
  } catch {
    // Response-body observability must not affect an already accepted delivery.
  }
  console.info(`[meta-capi] Purchase accepted order=${orderReference} events_received=${delivery.eventsReceived ?? 'unknown'} fbtrace_id_present=${delivery.fbtraceIdPresent} http_status=${response.status}`);
  return { sent: true };
}

function getTikTokEventsApiConfig() {
  const pixelId = getEnvValue('TIKTOK_PIXEL_ID').trim();
  const accessToken = getEnvValue('TIKTOK_EVENTS_API_ACCESS_TOKEN').trim();
  const testEventCode = getEnvValue('TIKTOK_TEST_EVENT_CODE').trim();
  return pixelId && accessToken ? { pixelId, accessToken, testEventCode } : null;
}

async function sendTikTokCompletePaymentEvent(order, stripeSession) {
  const config = getTikTokEventsApiConfig();
  const orderReference = getOrderId(order) || 'unknown';
  const event = buildTikTokCompletePaymentEvent({
    order,
    stripeSession,
    totalPrice: getOrderTotalPrice(order),
    currency: 'THB',
    eventTime: Date.now(),
    fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/'
  });
  const payload = config ? buildTikTokEventsRequest({
    pixelId: config.pixelId,
    event,
    testEventCode: config.testEventCode
  }) : null;
  if (!config || !payload) return { sent: false, skipped: 'not_configured_or_incomplete' };

  console.info(`[tiktok-events-api] CompletePayment attempt order=${orderReference}`);
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 8000);
  let response;
  try {
    response = await fetch(TIKTOK_EVENTS_API_URL, {
      method: 'POST',
      headers: { 'Access-Token': config.accessToken, 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify(payload)
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const delivery = summarizeTikTokEventsApiResponse(await response.text());
  if (!response.ok || delivery.code !== 0) {
    throw new Error(`TikTok Events API rejected CompletePayment (HTTP ${response.status}, code ${delivery.code ?? 'unknown'}).`);
  }
  console.info(`[tiktok-events-api] CompletePayment accepted order=${orderReference} request_id_present=${delivery.requestIdPresent} http_status=${response.status}`);
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
    // SECURITY HOTFIX: server-generated order links carry a signed, expiring
    // order-scoped token so the customer can still open their own order.
    const token = createOrderAccessToken(orderId);
    if (token) url.searchParams.set("t", token);
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
  const [catalogs, settings] = await Promise.all([readStockCatalogMapsForOrder(), readSettingsForApi()]);
  const validated = validateAuthoritativeOrder({ clientOrder, catalogs, settings });
  const finalPrice = validated.finalPrice;
  const clientTotal = parseMoneyValue(clientOrder?.checkoutSummary?.finalPrice ?? clientOrder.finalPrice ?? clientOrder.totalPrice);
  if (clientTotal != null && Math.abs(clientTotal - finalPrice) > 0.01) {
    const error = new Error("Price changed. Please refresh before checkout.");
    error.statusCode = 409;
    throw error;
  }
  return {
    ...clientOrder,
    id: String(clientOrder.id || nextRandomOrderId()),
    ...validated,
    shippingAmount: 0,
    checkoutSummary: {
      subtotal: validated.subtotal,
      discountPercent: validated.discountPercent,
      discountAmount: validated.discountAmount,
      shippingAmount: 0,
      finalPrice,
      totalPrice: finalPrice,
      netPrice: finalPrice,
      stoneVariants: validated.stoneVariants,
      geometry: validated.geometry
    },
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

function buildAdminOrderNotification(order, adminOrderNumber) {
  const orderId = getOrderId(order) || "-";
  const totalPrice = getOrderTotalPrice(order);
  const customerName = String(order?.customerName || order?.recipientName || "").trim() || "-";
  const customerPhone = getOrderCustomerPhone(order) || "-";
  const wristSize = Number(order?.wristSize ?? order?.checkoutSummary?.wristSize);
  const braceletLengthCm = getOrderBraceletLengthCm(order);
  const beadSize = String(order?.beadSize || order?.checkoutSummary?.beadSize || "").trim() || "-";
  const createdTime = String(order?.paidAt || order?.paymentReceivedAt || order?.date || new Date().toISOString());

  const lines = [
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
  ];
  lines[1] = buildAdminOrderNumberLine(adminOrderNumber);
  const text = lines.join("\n");

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

  const adminOrderNumber = await getAdminOrderNumberForOrderId(getOrderId(order));
  if (adminOrderNumber === null) {
    console.warn(`[admin-notify] skipped ${getOrderId(order)}: database admin order number is unavailable`);
    return { sent: false, skipped: "missing-admin-order-number" };
  }

  const messages = buildAdminOrderNotification(order, adminOrderNumber);
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

async function createStripeCheckoutSession({ order, origin, idempotencyKey }) {
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
      'Idempotency-Key': idempotencyKey,
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

async function readLineAuthHandoff(token) {
  if (!isSupabaseConfigured() || !HANDOFF_TOKEN_PATTERN.test(String(token || ''))) return null;
  const rows = await supabaseRequest('line_auth_handoffs', {
    params: {
      select: 'payload',
      token: `eq.${token}`,
      consumed_at: 'is.null',
      expires_at: `gt.${new Date().toISOString()}`,
      limit: '1'
    }
  });
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
  // Database columns are authoritative even when an older payload omits or
  // retains a stale availability flag.
  if (typeof row.in_stock === "boolean") payload.inStock = row.in_stock;
  if (typeof row.is_active === "boolean") payload.isActive = row.is_active;
  return payload;
}

function normalizeCatalogAvailabilityPayload(item) {
  const stockQty = getCatalogPayloadStockQty(item);
  // Owner-reported 2026-10-11: the admin form writes status through the nested availability object,
  // while a record disabled earlier still carries flat inStock:false / isActive:false at the top
  // level. ANDing both representations let the stale flat copy win forever, so a reactivation could
  // never be persisted. An explicitly present nested value is authoritative; the flat keys are then
  // derived from it so the payload and the catalog columns stay consistent.
  const nestedInStock = item?.availability && item.availability.inStock !== undefined
    ? item.availability.inStock !== false
    : null;
  const nestedIsActive = item?.availability && item.availability.isActive !== undefined
    ? item.availability.isActive !== false
    : null;
  const flatInStock = item?.inStock === undefined ? null : item.inStock !== false;
  const flatIsActive = item?.isActive === undefined ? null : item.isActive !== false;
  const inStock = (nestedInStock ?? flatInStock ?? true) && (stockQty === null || stockQty > 0);
  const isActive = nestedIsActive ?? flatIsActive ?? true;
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
    // TURN 10 (data transfer): every analytics event used to read the whole session row back from
    // Supabase before upserting it - one extra round trip (and one billed read) per event, measured at
    // 9-26 reads per page load / interaction burst. The read only exists to stop the upsert from
    // clobbering first-touch attribution and sticky identity fields with NULL, so it can be replaced by
    // a bounded cache whose entry is only reused while EVERY sticky field is already known: in that
    // state a fresh read would return the same values and the merge result is provably identical.
    // Anything still unknown (a new visitor id, a newly linked LINE user, an unfilled first-touch
    // column, a session with no cached order id) still performs the real read.
    const cacheKey = String(payload.sessionId || "");
    const cachedEntry = cacheKey ? analyticsSessionReadCache.get(cacheKey) : null;
    const cacheFresh = cachedEntry && Date.now() - cachedEntry.at < ANALYTICS_SESSION_READ_CACHE_MS;
    let existing = null;
    if (cacheFresh) {
      const cachedRow = cachedEntry.row;
      const stickyComplete = Boolean(
        (cachedRow.visitor_id || sessionRow.visitor_id) &&
        (cachedRow.line_user_id || sessionRow.line_user_id) &&
        cachedRow.first_source && cachedRow.first_medium && cachedRow.first_campaign &&
        cachedRow.referrer && cachedRow.landing_url && cachedRow.platform_guess && cachedRow.started_at
      );
      if (stickyComplete) existing = cachedRow;
    }
    // A fresh cache entry is only usable when every sticky field is already known. If it is not usable
    // (or absent) the real read must still happen - skipping it here was a regression the first-touch
    // test caught: a session whose LINE identity was still unknown had its attribution overwritten with
    // 'unknown' instead of being merged.
    if (!existing) {
      const existingRows = await supabaseRequest("analytics_sessions", {
        params: {
          // Only the merge inputs are read; the previous `select=*` also transferred columns this path
          // never uses (current_step, last_seen_at, user_agent, created timestamps, ...).
          select: "session_id,visitor_id,line_user_id,first_source,first_medium,first_campaign,referrer,landing_url,platform_guess,started_at,order_id,converted,revenue",
          session_id: `eq.${payload.sessionId}`,
          limit: "1"
        }
      });
      existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (cacheKey && existing) analyticsSessionReadCache.set(cacheKey, { at: Date.now(), row: existing });
    }
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
    // Remember exactly what was just persisted, so the next event of this session can reuse it without
    // a read (the cache is only consulted when every sticky field is already present).
    if (cacheKey) analyticsSessionReadCache.set(cacheKey, { at: Date.now(), row: sessionRow });
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

// TURN 10.2 error-reporting controls. All three are process-local on purpose: they are a rate limiter, not
// a source of truth, so a second Render instance simply has its own budget. Nothing here can lose a
// failure that has not already been stored by another instance or by an earlier window.
const ANALYTICS_ERROR_DEDUPE_MS = 60000;
const ANALYTICS_ERROR_SESSION_WINDOW_MS = 3600000;
const ANALYTICS_ERROR_SESSION_CAP = 100;
const ANALYTICS_ERROR_PROPERTIES_LIMIT = 2000;
let analyticsErrorSignatures = new Map();
let analyticsErrorSessionBudget = new Map();

function boundAnalyticsErrorProperties(properties = {}) {
  const source = properties && typeof properties === "object" ? properties : {};
  let serialized = "";
  try {
    serialized = JSON.stringify(source);
  } catch {
    return { schema_version: ANALYTICS_SCHEMA_VERSION, funnel_version: ANALYTICS_FUNNEL_VERSION, properties_unserializable: true };
  }
  if (serialized.length <= ANALYTICS_ERROR_PROPERTIES_LIMIT) return source;
  // Keep the identification fields the dashboard and any triage actually read, and record that the rest
  // was too large to store instead of silently dropping the row.
  return {
    schema_version: source.schema_version ?? ANALYTICS_SCHEMA_VERSION,
    funnel_version: source.funnel_version ?? ANALYTICS_FUNNEL_VERSION,
    error_type: truncateText(source.error_type, 120),
    source: truncateText(source.source, 500),
    step: source.step ?? null,
    properties_truncated: true,
    properties_bytes: serialized.length
  };
}

function shouldStoreAnalyticsError(errorRow = {}) {
  const now = Date.now();
  if (analyticsErrorSignatures.size > 5000) {
    for (const [key, at] of analyticsErrorSignatures) {
      if (now - at > ANALYTICS_ERROR_DEDUPE_MS) analyticsErrorSignatures.delete(key);
    }
    if (analyticsErrorSignatures.size > 5000) analyticsErrorSignatures = new Map();
  }
  const signature = [errorRow.session_id, errorRow.error_type, errorRow.message, errorRow.source].join("\u0000");
  const lastAt = analyticsErrorSignatures.get(signature);
  if (lastAt && now - lastAt < ANALYTICS_ERROR_DEDUPE_MS) return false;

  if (analyticsErrorSessionBudget.size > 5000) analyticsErrorSessionBudget = new Map();
  const sessionKey = String(errorRow.session_id || "unknown");
  const budget = analyticsErrorSessionBudget.get(sessionKey);
  const window = budget && now - budget.windowStartedAt < ANALYTICS_ERROR_SESSION_WINDOW_MS
    ? budget
    : { count: 0, windowStartedAt: now };
  if (window.count >= ANALYTICS_ERROR_SESSION_CAP) {
    if (window.count === ANALYTICS_ERROR_SESSION_CAP) {
      window.count += 1;
      console.warn(`[analytics] error rate limit reached for session ${sessionKey}; further distinct errors in this hour are not stored.`);
    }
    analyticsErrorSessionBudget.set(sessionKey, window);
    return false;
  }
  window.count += 1;
  analyticsErrorSessionBudget.set(sessionKey, window);
  analyticsErrorSignatures.set(signature, now);
  return true;
}

async function saveAnalyticsError(payload) {
  // TURN 10.2 (owner preference: remove unnecessary granular tracking): client error reporting is kept -
  // actionable production failures are the whole point of the table - but it is no longer allowed to
  // amplify. Three controls, in order of severity:
  //   1. an identical failure signature is stored at most once per 60 s window,
  //   2. a single session may create at most 100 NEW signatures per hour, and a tripped cap is logged,
  //   3. `properties` is bounded.
  // A failure that has not been seen before is always stored, so a unique critical failure is never
  // suppressed by control 1. Only control 2 can drop a first-seen signature, and only for a session that
  // is already producing >100 distinct errors per hour - the pathological case the control exists for.
  const errorRow = {
    session_id: payload.sessionId,
    error_type: truncateText(payload.properties?.error_type || payload.eventName, 120),
    message: truncateText(payload.properties?.message, 1000),
    stack: truncateText(payload.properties?.stack, 4000),
    source: truncateText(payload.properties?.source, 500),
    step: payload.step,
    url: payload.url || null,
    properties: boundAnalyticsErrorProperties(payload.properties),
    created_at: payload.timestamp || new Date().toISOString()
  };

  if (!shouldStoreAnalyticsError(errorRow)) return;

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

// Turn 10.3: bounded idempotency window for design-summary bursts.
const ANALYTICS_DESIGN_SUMMARY_DEDUPE_MS = 10 * 60 * 1000;
const ANALYTICS_DESIGN_SUMMARY_DEDUPE_MAX = 20000;
let analyticsDesignSummaryIds = new Map();

function claimDesignSummaryId(payload = {}) {
  const properties = payload.properties && typeof payload.properties === "object" ? payload.properties : {};
  const summaryId = truncateText(properties.summary_id || properties.summaryId, 80);
  if (!summaryId) return true;
  const now = Date.now();
  if (analyticsDesignSummaryIds.size > ANALYTICS_DESIGN_SUMMARY_DEDUPE_MAX) {
    for (const [key, at] of analyticsDesignSummaryIds) {
      if (now - at > ANALYTICS_DESIGN_SUMMARY_DEDUPE_MS) analyticsDesignSummaryIds.delete(key);
    }
    // Still oversized means the traffic is pathological; start clean rather than growing without bound.
    if (analyticsDesignSummaryIds.size > ANALYTICS_DESIGN_SUMMARY_DEDUPE_MAX) analyticsDesignSummaryIds = new Map();
  }
  const key = `${payload.sessionId}\u0000${summaryId}`;
  const seenAt = analyticsDesignSummaryIds.get(key);
  if (seenAt && now - seenAt < ANALYTICS_DESIGN_SUMMARY_DEDUPE_MS) return false;
  analyticsDesignSummaryIds.set(key, now);
  return true;
}

async function saveAnalyticsPayload(payload) {
  if (!payload.sessionId || !payload.eventName) {
    throw new Error("Missing sessionId or eventName.");
  }
  await upsertAnalyticsSession(payload);
  // TURN 10.2 (owner preference: remove unnecessary granular tracking): `session_heartbeat` exists only
  // to keep the session row's `last_seen_at` fresh, and the upsert above already writes it. The event row
  // itself was never read by the analytics summary, the funnel, the daily trend or any report, so it is no
  // longer inserted. The request the browser sends is unchanged, so session inactivity expiration
  // (ANALYTICS_SESSION_TIMEOUT_MS), the 30-minute `insights.activeWindowMinutes` figure and every
  // attribution field behave exactly as before.
  if (payload.eventName === "session_heartbeat") return;
  // TURN 10.3 idempotency. A `design_summary` is the one event whose loss would silently under-report a
  // customer's design, so the browser retries a failed delivery and may also deliver it twice through the
  // lifecycle beacons. The burst carries a `summary_id`, and a repeat inside the window is dropped here
  // instead of being counted twice in `popularItems` / `popularBeadSizes` / `popularCategories`.
  // The first delivery of an id is always stored; only a repeat inside the window is dropped. The check is
  // process-local on purpose - it is a duplicate guard, not a source of truth, so a second Render instance
  // simply has its own window and nothing is lost when it is not shared.
  // A summary with no `summary_id` is accepted, so a browser running an older bundle keeps reporting.
  if (payload.eventName === "design_summary" && !claimDesignSummaryId(payload)) return;
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
// TURN 10 (data transfer): the exact column sets the CRM analytics summary reads. Measured against the
// previous `select=*` behaviour in tools/turn10-bench.mjs. `properties` must stay on events (the funnel,
// bead-size, duration and category breakdowns read it); `stack` is deliberately absent from errors
// because no part of the dashboard renders it.
const ANALYTICS_SUMMARY_SESSION_FIELDS = "session_id,visitor_id,line_user_id,first_source,first_medium,first_campaign,platform_guess,started_at,last_seen_at,current_step,order_id,converted,revenue";
const ANALYTICS_SUMMARY_EVENT_FIELDS = "session_id,event_name,step,properties,created_at";
const ANALYTICS_SUMMARY_ERROR_FIELDS = "session_id,error_type,message,step,properties,url,created_at";
const ANALYTICS_SUMMARY_EVENT_LIMIT = 10000;
// Short-lived in-process cache so switching dashboard range/tab does not re-read the same rows from
// Supabase. Read-only and range-keyed; it never serves one range's rows for another.
const ANALYTICS_SUMMARY_CACHE_MS = 30000;
let analyticsSummaryCache = new Map();
// TURN 10 (data transfer): bounded cache for the per-event session row read. It is only reused when
// every sticky field is already known, so the upsert merge result is identical to a fresh read.
const ANALYTICS_SESSION_READ_CACHE_MS = 60000;
const ANALYTICS_SESSION_READ_CACHE_MAX = 5000;
let analyticsSessionReadCache = new Map();
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

// TURN 10.2 (option C - server-side aggregation): the dashboard used to read the newest 10,000
// `analytics_events` rows and aggregate them inside Render. At the measured production rate (~3,036
// events/day) that read silently covered only ~3.3 days of a 7-day range, and it transferred ~5.6 MB per
// dashboard call. Option C replaces that raw read with one `analytics_summary_aggregate` RPC that returns
// the same information as counts plus one row per (session, stage), so the range is complete and the
// transfer is bounded by sessions x stages instead of by event volume.
//
// The aggregate is re-expanded into the EXISTING event row shape, which keeps every downstream consumer
// in buildAnalyticsSummary (funnel, daily trend, channel/day, popular items/sizes/categories, step
// durations, current stage) running its untouched code path. Parity is a property of the substitution
// rather than of a parallel re-implementation, and it is verified against a complete uncapped fixture by
// tests/turn10-2-aggregate-equivalence.test.mjs.
const ANALYTICS_AGGREGATE_STAGE_EVENTS = new Set([...ANALYTICS_V2_FUNNEL_STAGES, 'line_auth_started', 'line_auth_success', 'oa_friend_required', 'oa_friend_cancelled', 'line_callback_resume']);

function createAggregateEvent(sessionId, eventName, properties = {}, createdAt = null) {
  return {
    session_id: sessionId,
    event_name: eventName,
    step: null,
    properties: {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      funnel_version: ANALYTICS_FUNNEL_VERSION,
      funnel_stage: eventName,
      funnel_stage_key: `v${ANALYTICS_FUNNEL_VERSION}:${sessionId}:${eventName}`,
      current_stage: eventName,
      ...properties
    },
    created_at: createdAt
  };
}

function mapAnalyticsSummaryAggregate(aggregate, includeTest = false) {
  if (!aggregate || typeof aggregate !== 'object') return null;
  const events = [];
  // TURN 10.2 correction: a count-based aggregate row carries no session id, so it cannot be dropped by the
  // summary's test-session filter the way a raw row is. The aggregate therefore tags every count with whether
  // it came from a `prelaunch_test` session, and the same include_test switch that governs the funnel governs
  // these blocks too. Without this, `popularItems` / `popularBeadSizes` / `popularCategories` / `stepDurations`
  // over-reported by the share of prelaunch_test traffic: tools/turn10-2-crosscheck.mjs measured +10
  // placements and +12 duration samples on a fixture where 1 session in 17 is a test session. The funnel was
  // already correct because stage rows keep their session id.
  const keepCount = (row) => includeTest || !row?.test;
  // One row per (session, stage): the funnel sets, the per-session latest stage used by the
  // active-session panel and the stage date used by the daily trend and the channel/day matrix.
  (Array.isArray(aggregate.stages) ? aggregate.stages : []).forEach((row) => {
    const sessionId = String(row?.session_id || '').trim();
    const eventName = String(row?.event_name || '').trim();
    if (!sessionId || !ANALYTICS_AGGREGATE_STAGE_EVENTS.has(eventName)) return;
    events.push(createAggregateEvent(sessionId, eventName, {}, row?.first_at || row?.last_at || null));
  });
  // Step durations are only ever consumed as a SUM plus a SAMPLE COUNT per step
  // (averageMs = round(total / samples)), so re-expanding the aggregate as equal shares cannot change any
  // rendered number - the remainder is added to the last share so the sum is exact.
  (Array.isArray(aggregate.durations) ? aggregate.durations : []).filter(keepCount).forEach((row) => {
    const samples = Math.max(0, Math.trunc(Number(row?.samples) || 0));
    const totalMs = Math.max(0, Math.trunc(Number(row?.total_ms) || 0));
    if (!samples || !totalMs) return;
    const share = Math.floor(totalMs / samples);
    for (let index = 0; index < samples; index += 1) {
      events.push(createAggregateEvent('__aggregate__', 'step_duration', { from_step: row?.step ?? 'unknown', duration_ms: index === samples - 1 ? totalMs - share * (samples - 1) : share }, null));
    }
  });
  // Placements, bead sizes and categories arrive already collapsed: one synthetic `design_summary` row per
  // distinct label carries the exact count the raw stream would have produced.
  const placements = (Array.isArray(aggregate.placements) ? aggregate.placements : []).filter(keepCount);
  if (placements.length) {
    events.push(createAggregateEvent('__aggregate__', 'design_summary', { items: placements.map((row) => ({ itemId: row?.label ?? null, sizeMm: null, itemType: null, count: Math.max(0, Math.trunc(Number(row?.count) || 0)) })).filter((row) => row.count > 0) }, null));
  }
  const beadSizes = (Array.isArray(aggregate.bead_sizes) ? aggregate.bead_sizes : []).filter(keepCount);
  if (beadSizes.length) {
    events.push(createAggregateEvent('__aggregate__', 'design_summary', { items: beadSizes.map((row) => ({ itemId: null, sizeMm: row?.label ?? null, itemType: null, count: Math.max(0, Math.trunc(Number(row?.count) || 0)) })).filter((row) => row.count > 0 && row.sizeMm !== null) }, null));
  }
  const categories = (Array.isArray(aggregate.categories) ? aggregate.categories : []).filter(keepCount);
  if (categories.length) {
    events.push(createAggregateEvent('__aggregate__', 'design_summary', { categories: categories.map((row) => ({ category: row?.label ?? null, count: Math.max(0, Math.trunc(Number(row?.count) || 0)) })).filter((row) => row.count > 0 && row.category) }, null));
  }
  return {
    events,
    earliestEventAt: aggregate.earliest_event_at || null,
    totalEvents: Math.max(0, Math.trunc(Number(aggregate.total_events) || 0))
  };
}

const ANALYTICS_SUMMARY_SESSION_PARAMS = { select: ANALYTICS_SUMMARY_SESSION_FIELDS, order: "last_seen_at.desc", limit: "5000" };
const ANALYTICS_SUMMARY_ERROR_PARAMS = { select: ANALYTICS_SUMMARY_ERROR_FIELDS, order: "created_at.desc", limit: "500" };

async function readAnalyticsRowsForSummary(rangeInfo = normalizeAnalyticsRangeParams(), includeTest = false) {
  const aggregateRpcName = getEnvValue('ANALYTICS_SUMMARY_RPC');
  if (isSupabaseConfigured() && aggregateRpcName) {
    try {
      // Option C: one RPC replaces the raw event read. Sessions and errors stay as the same bounded,
      // projected reads because their shape is unchanged and their volume is already capped - the event
      // table is the one that carries both the 10,000-row cap and the large transfer.
      const [sessions, errors, aggregate] = await Promise.all([
        supabaseRequest("analytics_sessions", { params: addDateRangeFilters({ ...ANALYTICS_SUMMARY_SESSION_PARAMS }, "last_seen_at", rangeInfo) }),
        supabaseRequest("analytics_errors", { params: addDateRangeFilters({ ...ANALYTICS_SUMMARY_ERROR_PARAMS }, "created_at", rangeInfo) }),
        supabaseRpc(aggregateRpcName, { p_start: rangeInfo.startIso, p_end: rangeInfo.endIso })
      ]);
      const mapped = mapAnalyticsSummaryAggregate(aggregate, includeTest);
      if (mapped) {
        return {
          sessions: Array.isArray(sessions) ? sessions : [],
          events: mapped.events,
          errors: Array.isArray(errors) ? errors : [],
          // The aggregate is uncapped by construction, so the range is complete and the truncation banner
          // must not fire. `eventsCoveredSince` still reports the oldest event the aggregate saw.
          eventsTruncated: false,
          eventsLimit: null,
          eventsCoveredSince: mapped.earliestEventAt,
          aggregateSource: aggregateRpcName,
          aggregateEventCount: mapped.totalEvents
        };
      }
    } catch (error) {
      // A missing/unprivileged function must never take the dashboard down: fall through to the raw read.
      warnSupabaseReadFallback("/api/analytics/summary (aggregate rpc)", error);
    }
  }
  if (isSupabaseConfigured()) {
    try {
      const [sessions, events, errors] = await Promise.all([
        supabaseRequest("analytics_sessions", {
          // Keep session attribution available for in-range events that belong to an older session.
          // The summary applies its own selected-period filter to session-start KPIs below.
          // TURN 10 (data transfer): this used to read `select=*` for the newest 5,000 sessions on
          // every dashboard call, which is ~4 MB per call for columns the summary never touches
          // (referrer, landing_url, user_agent). It now selects only the columns the summary reads,
          // and - when the caller asks for a bounded range - only the sessions seen inside that range.
          // Every session that owns an in-range event has an in-range `last_seen_at`, because the
          // ingest path stamps `last_seen_at = now` on every event, so attribution is unchanged.
          params: addDateRangeFilters({ ...ANALYTICS_SUMMARY_SESSION_PARAMS }, "last_seen_at", rangeInfo)
        }),
        supabaseRequest("analytics_events", {
          params: addDateRangeFilters({ select: ANALYTICS_SUMMARY_EVENT_FIELDS, order: "created_at.desc", limit: String(ANALYTICS_SUMMARY_EVENT_LIMIT) }, "created_at", rangeInfo)
        }),
        supabaseRequest("analytics_errors", {
          // `stack` is never rendered by the dashboard (recentErrors shows type/step/message only) and
          // is the single largest column in this table, so it is not transferred any more.
          params: addDateRangeFilters({ ...ANALYTICS_SUMMARY_ERROR_PARAMS }, "created_at", rangeInfo)
        })
      ]);
      return {
        sessions: Array.isArray(sessions) ? sessions : [],
        events: Array.isArray(events) ? events : [],
        errors: Array.isArray(errors) ? errors : [],
        // TURN 10.1: surface the read cap instead of silently reporting a partial range. A full 7-day
        // range needs ~21k events at the measured production rate while the query asks for 10,000, so the
        // dashboard could show a shorter window than its label claims. The boolean lets the CRM warn,
        // and the covered boundary is reported so the UI can tell the operator how far back the numbers
        // actually go.
        eventsTruncated: Array.isArray(events) && events.length >= ANALYTICS_SUMMARY_EVENT_LIMIT,
        eventsLimit: ANALYTICS_SUMMARY_EVENT_LIMIT,
        eventsCoveredSince: Array.isArray(events) && events.length
          ? events[events.length - 1]?.created_at || null
          : null
      };
    } catch (error) {
      warnSupabaseReadFallback("/api/analytics/summary", error);
    }
  }

  return {
    sessions: readJsonArray("analyticsSessions"),
    events: readJsonArray("analyticsEvents").filter((row) => isAnalyticsRowInRange(row, rangeInfo, ["created_at", "timestamp"])),
    errors: readJsonArray("analyticsErrors").filter((row) => isAnalyticsRowInRange(row, rangeInfo, ["created_at", "timestamp"])),
    eventsTruncated: false,
    eventsLimit: ANALYTICS_SUMMARY_EVENT_LIMIT,
    eventsCoveredSince: null
  };
}

function incrementCount(map, key, amount = 1) {
  const safeKey = String(key || "unknown").trim() || "unknown";
  map[safeKey] = (map[safeKey] || 0) + amount;
}

// TURN 10.2: `amount` lets one `design_summary` row contribute the per-item counts it accumulated, so
// the dashboard totals stay identical to the previous one-row-per-bead stream.
function addAnalyticsCount(map, key, labelKey = "label", amount = 1) {
  const safeKey = normalizeAnalyticsDimension(key, "unknown");
  if (!map[safeKey]) {
    map[safeKey] = { [labelKey]: safeKey, count: 0 };
  }
  map[safeKey].count += amount;
}

async function buildAnalyticsSummary(searchParams = new URLSearchParams()) {
  const rangeInfo = normalizeAnalyticsRangeParams(searchParams);
  const includeTestParam = searchParams.get("include_test") === "1";
  // The key must not include the computed end boundary: "last 7 days" recomputes `now` on every call,
  // so keying on it would make every request a cache miss (measured: 4 dashboard calls, 4 full reads).
  const cacheKey = `${rangeInfo.range}|${searchParams.get("start") || ""}|${searchParams.get("end") || ""}|${includeTestParam ? 1 : 0}`;
  const cached = analyticsSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ANALYTICS_SUMMARY_CACHE_MS) {
    return { ...cached.payload, generatedAt: new Date().toISOString(), servedFromCache: true, cacheAgeMs: Date.now() - cached.at, cacheTtlMs: ANALYTICS_SUMMARY_CACHE_MS };
  }
  const analyticsRows = await readAnalyticsRowsForSummary(rangeInfo, includeTestParam);
  const includeTest = includeTestParam;
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
    // TURN 10.2: the single `design_summary` row that now replaces the per-bead `item_added` and
    // per-tab `category_changed` rows. The two legacy branches above are deliberately KEPT so that the
    // ~396k historical rows already stored in `analytics_events` keep contributing to the same totals -
    // removing them would silently under-report every past period.
    // `properties.bead_size` is not read here: it would double count `bead_size_selected`, which already
    // feeds `popularBeadSizes`. Only the per-bead sizes the customer actually placed are counted, exactly
    // as the legacy `item_added` branch did.
    if (eventName === "design_summary") {
      const designItems = Array.isArray(properties.items) ? properties.items : [];
      designItems.forEach((entry) => {
        const amount = Math.max(0, Math.trunc(Number(entry?.count) || 0));
        if (!amount) return;
        const sizeMm = entry?.sizeMm ?? entry?.size_mm;
        if (sizeMm) addAnalyticsCount(beadSizeCounts, `${sizeMm}mm`, "beadSize", amount);
        const itemId = entry?.itemId ?? entry?.item_id;
        if (itemId) addAnalyticsCount(itemCounts, itemId, "item", amount);
        const itemCategory = entry?.category ?? entry?.itemType ?? entry?.item_type;
        if (itemCategory) addAnalyticsCount(categoryCounts, itemCategory, "category", amount);
      });
      const designCategories = Array.isArray(properties.categories) ? properties.categories : [];
      designCategories.forEach((entry) => {
        const amount = Math.max(0, Math.trunc(Number(entry?.count) || 0));
        if (!amount) return;
        const category = entry?.category;
        if (category) addAnalyticsCount(categoryCounts, category, "category", amount);
      });
    }
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

  const summaryPayload = {
    success: true, modelVersion: ANALYTICS_FUNNEL_VERSION, legacyExcluded: true, range: rangeInfo.range, start: rangeInfo.startIso, end: rangeInfo.endIso, generatedAt: new Date().toISOString(),
    eventsTruncated: Boolean(analyticsRows.eventsTruncated), eventsLimit: analyticsRows.eventsLimit ?? ANALYTICS_SUMMARY_EVENT_LIMIT, eventsCoveredSince: analyticsRows.eventsCoveredSince ?? null,
    totals: { sessions: sessions.length, uniqueVisitors: visitorIds.size, visitorTrackedSessions: sessions.filter((session) => getAnalyticsVisitorId(session)).length, legacySessionsWithoutVisitorId: sessions.filter((session) => !getAnalyticsVisitorId(session)).length, orders: totalOrders, conversionRate: landingCount ? (totalOrders / landingCount) * 100 : 0, revenue, aov: totalOrders ? revenue / totalOrders : 0, errors: errors.length },
    ownerChannels: OWNER_ANALYTICS_CHANNELS.map((definition) => serializeOwner(ownerChannels.get(definition.key))),
    sourceDetails: Array.from(sourceDetails.values()).map((row) => ({ ...row, conversionRate: row.sessions ? (row.orders / row.sessions) * 100 : 0, aov: row.orders ? row.revenue / row.orders : 0 })).sort((a, b) => b.sessions - a.sessions || b.revenue - a.revenue),
    funnel, stepDistribution: currentStage, dailyTrend, channelByDay: channelDays,
    insights: { completedNoPayment: Math.max(0, checkoutIds.size - totalOrders), activeWindowMinutes: 30 },
    channels: [], sources: [], bySource: [], stepDurations, averageTimePerStep: stepDurations.map((row) => ({ step: row.step, average_ms: row.averageMs, samples: row.samples })), popularBeadSizes: sortCountRows(beadSizeCounts), popularItems: sortCountRows(itemCounts), popularCategories: sortCountRows(categoryCounts), recentErrors, recentOrders: [], recentSessions, testCampaignExcluded: true, paymentSuccessAuthority: "stripe_webhook_authoritative"
  };
  if (analyticsSummaryCache.size > 8) analyticsSummaryCache = new Map();
  if (analyticsSessionReadCache.size > ANALYTICS_SESSION_READ_CACHE_MAX) analyticsSessionReadCache = new Map(analyticsSessionReadCache);
  analyticsSummaryCache.set(cacheKey, { at: Date.now(), payload: summaryPayload });
  return { ...summaryPayload, servedFromCache: false, cacheAgeMs: 0, cacheTtlMs: ANALYTICS_SUMMARY_CACHE_MS };
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
    () => [],
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

// ---------------------------------------------------------------------------------------------
// Landing-page social proof (additive route merged 2026-10-10 from the full UAT feature migration).
//
// This is the ONLY backend change the migration brings: a read-only, PUBLIC, AGGREGATE-ONLY counter.
// It is ported onto the hardened production server rather than adopting the candidate's pre-hotfix
// server.js, so every security control added by the hotfix (session auth, entitlement-scoped order
// reads, static allowlist, rate limiting, webhook signature checks) is preserved verbatim.
//
// PRIVACY (2026-10-10): the first merged revision reused the frozen candidate's design, which returned
// up to four real customer bracelet preview images. That design was rejected and never deployed to the
// backend. This revision publishes a NUMBER ONLY:
//   * the response body is exactly { displayCount, successfulOrderCount }: no images, no order ids,
//     no names, no phone numbers, no addresses, no payment data and no base64 payloads of any kind;
//   * the count is obtained without reading order records - a PostgREST exact-count request filtered by
//     the CRM's own paid-order filter and projecting a single id column, with the existing
//     readCrmPaidOrderCount() helper as the fallback when the count header is unavailable;
//   * the payload is cached in-process for 60s, so a public page view cannot amplify Supabase reads
//     (the owner-reported Free-plan egress constraint) or hammer the database;
//   * any failure degrades to the static base count instead of throwing.
const SOCIAL_PROOF_BASE_COUNT = 1035;
const SOCIAL_PROOF_ORDER_MULTIPLIER = 3;
const SOCIAL_PROOF_CACHE_MS = 60000;
// Landing social proof also publishes the four newest eligible bracelet previews. The publication was
// authorised by the owner on 2026-10-11 (the count-only revision of 2026-10-10 is superseded); the
// privacy contract of the response is unchanged in kind - it still carries no order identifiers, no
// customer details and no payment data, and the imagery is a bracelet render, not a photo of a person.
const SOCIAL_PROOF_PREVIEW_COUNT = 4;
const SOCIAL_PROOF_PREVIEW_SCAN_LIMIT = 10;   // bounded: only the newest 10 paid orders are ever read
const SOCIAL_PROOF_THUMB_PX = 176;            // crisp for the ~26-40px strip thumbs at up to 4x DPR
const SOCIAL_PROOF_THUMB_QUALITY = 78;
const SOCIAL_PROOF_PREVIEW_TTL_MS = 6 * 60 * 60 * 1000;
const SOCIAL_PROOF_PREVIEW_SHORT_TTL_MS = 15 * 60 * 1000;
const SOCIAL_PROOF_MAX_SOURCE_CHARS = 640000; // ~470KB binary: rejects oversized stored payloads
const SOCIAL_PROOF_PREVIEW_FIELD_SELECT = "created_at,preview:payload->>braceletPreviewImage,checkoutPreview:payload->checkoutSummary->>braceletPreviewImage";
let socialProofCache = { at: 0, payload: null };
// Thumbnails are kept until the newest paid order changes, so the (bounded) preview read stays off the
// public request path: a landing page view cannot amplify Supabase egress.
let socialProofPreviewCache = { stamp: null, thumbs: [], at: 0 };

let socialProofSharpLoaded = false;
let socialProofSharp = null;
function getSocialProofSharp() {
  if (socialProofSharpLoaded) return socialProofSharp;
  socialProofSharpLoaded = true;
  try {
    socialProofSharp = require("sharp");
  } catch (error) {
    socialProofSharp = null;
    console.warn("[/api/social-proof] sharp unavailable; stored previews are published unoptimized.", error?.message || error);
  }
  return socialProofSharp;
}

const isPaidOrderRecord = (order) => String(order?.stripePaymentStatus || order?.paymentStatus || "").trim().toLowerCase() === "paid";

// A stored preview is only ever accepted as a bounded inline image data URL. Anything else (missing
// field, remote URL, oversized payload, non-image data) is skipped instead of being published.
function isPublishablePreviewDataUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 33 || trimmed.length > SOCIAL_PROOF_MAX_SOURCE_CHARS) return false;
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}

function readOrderPreviewDataUrl(order) {
  const candidates = [
    order?.braceletPreviewImage,
    order?.checkoutSummary?.braceletPreviewImage,
    order?.braceletPreviewDataUrl,
    order?.checkoutSummary?.braceletPreviewDataUrl
  ];
  return candidates.find(isPublishablePreviewDataUrl) || null;
}

function readProjectedPreviewDataUrl(row) {
  return [row?.preview, row?.checkoutPreview].find(isPublishablePreviewDataUrl) || null;
}

// TURN 10.1: fetch only the preview columns for one order (the CRM card and the preview endpoint both
// need just the image), instead of reading the whole order payload to extract one field.
async function readOrderPreviewRow(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  if (!isSupabaseConfigured()) {
    const order = readJsonArray('orders').find((entry) => getOrderId(entry) === id) || null;
    return order ? { preview: order.braceletPreviewImage || null, checkoutPreview: order.checkoutSummary?.braceletPreviewImage || null } : null;
  }
  try {
    const rows = await supabaseRequest('orders', {
      params: {
        select: SOCIAL_PROOF_PREVIEW_FIELD_SELECT,
        'payload->>id': `eq.${id}`,
        limit: '1'
      }
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    console.warn('[crm-order-preview] read failed:', error?.message || error);
    return null;
  }
}

// TURN 10.1: which of these orders actually have a stored preview? Asking for the ids (and filtering on
// `not.is.null`) costs a few hundred bytes and lets the list advertise a preview URL only where one
// exists, so legacy orders without a snapshot keep rendering the SVG layout fallback exactly as before.
async function readOrderIdsWithStoredPreview(ids = []) {
  const wanted = ids.map((id) => String(id || '').trim()).filter(Boolean);
  if (!wanted.length) return new Set();
  if (!isSupabaseConfigured()) {
    return new Set(readJsonArray('orders')
      .filter((order) => readProjectedPreviewDataUrl({ preview: order?.braceletPreviewImage, checkoutPreview: order?.checkoutSummary?.braceletPreviewImage }))
      .map((order) => getOrderId(order)));
  }
  try {
    const rows = await supabaseRequest('orders', {
      params: {
        select: 'id:payload->>id',
        'payload->>id': `in.(${wanted.join(',')})`,
        or: '(payload->>braceletPreviewImage.not.is.null,payload->checkoutSummary->>braceletPreviewImage.not.is.null)'
      }
    });
    return new Set((Array.isArray(rows) ? rows : []).map((row) => row.id).filter(Boolean));
  } catch (error) {
    // A lookup failure must not hide previews: fall back to advertising the URL for every id and let the
    // client's error handler degrade gracefully.
    console.warn('[crm-order-preview] existence lookup failed:', error?.message || error);
    return new Set(wanted);
  }
}

// The stored snapshot is a bounded `data:image/...;base64,...` string. Decode it once per request so the
// browser receives image bytes rather than a 33% larger base64 wrapper inside JSON.
function decodeStoredPreviewDataUrl(dataUrl) {
  if (!isPublishablePreviewDataUrl(dataUrl)) return null;
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return null;
    return { contentType: match[1].toLowerCase(), buffer };
  } catch {
    return null;
  }
}

// Aggregate paid-order count. Returns a number only; it never reads or returns customer records and
// never touches bracelet previews.
async function readPaidOrderCountAggregate() {
  if (!isSupabaseConfigured()) {
    // Local/JSON mode (development and the offline harnesses): count in place, still without
    // surfacing any field of any order.
    return sortOrdersForApi(readJsonArray("orders")).filter((order) =>
      String(order?.stripePaymentStatus || order?.paymentStatus || "").trim().toLowerCase() === "paid").length;
  }
  try {
    const { serviceRoleKey } = getSupabaseConfig();
    const params = applyCrmPaidOrderFilter({ select: "id:payload->>id", limit: 1 });
    const response = await fetch(createSupabaseRestUrl("orders", params), {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: "count=exact" }
    });
    if (response.ok) {
      const total = Number(String(response.headers.get("content-range") || "").split("/")[1]);
      if (Number.isFinite(total) && total >= 0) return total;
    }
  } catch (error) {
    console.warn("[/api/social-proof] exact count unavailable; using the fallback count.", error?.message || error);
  }
  return readCrmPaidOrderCount();
}

async function readSocialProofForApi() {
  const now = Date.now();
  if (socialProofCache.payload && now - socialProofCache.at < SOCIAL_PROOF_CACHE_MS) {
    return socialProofCache.payload;
  }
  let successfulOrderCount = 0;
  try {
    successfulOrderCount = await readPaidOrderCountAggregate();
  } catch (error) {
    console.warn("[/api/social-proof] count unavailable; returning the safe default.", error?.message || error);
  }
  let recentBracelets = [];
  try {
    recentBracelets = await readRecentBraceletPreviews(now);
  } catch (error) {
    console.warn("[/api/social-proof] previews unavailable; publishing the aggregate only.", error?.message || error);
    recentBracelets = [];
  }
  const payload = {
    displayCount: SOCIAL_PROOF_BASE_COUNT + successfulOrderCount * SOCIAL_PROOF_ORDER_MULTIPLIER,
    successfulOrderCount,
    recentBracelets
  };
  socialProofCache = { at: now, payload };
  return payload;
}

// Newest paid order timestamp. Two tiny columns only, used to decide whether the preview set needs to
// be rebuilt - the expensive read never runs for an unchanged catalogue of orders.
async function readNewestPaidOrderStamp() {
  if (!isSupabaseConfigured()) {
    const paid = sortOrdersForApi(readJsonArray("orders")).filter(isPaidOrderRecord);
    const newest = paid[0] || null;
    return newest ? String(newest.created_at || newest.date || "") : "";
  }
  const params = applyCrmPaidOrderFilter({ select: "created_at", order: "created_at.desc", limit: 1 });
  const rows = await supabaseRequest("orders", { params });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? String(row.created_at || "") : "";
}

// Bounded, newest-first read of the paid orders that can contribute a preview. Only the creation
// timestamp and the two preview columns are requested, and the scan is capped, so the egress for a
// refresh is a handful of small image payloads instead of the whole order table.
async function readRecentBraceletPreviewSources() {
  if (!isSupabaseConfigured()) {
    return sortOrdersForApi(readJsonArray("orders"))
      .filter(isPaidOrderRecord)
      .map(readOrderPreviewDataUrl)
      .filter(Boolean)
      .slice(0, SOCIAL_PROOF_PREVIEW_SCAN_LIMIT);
  }
  const params = applyCrmPaidOrderFilter({
    select: SOCIAL_PROOF_PREVIEW_FIELD_SELECT,
    order: "created_at.desc",
    limit: SOCIAL_PROOF_PREVIEW_SCAN_LIMIT
  });
  const rows = await supabaseRequest("orders", { params });
  return (Array.isArray(rows) ? rows : []).map(readProjectedPreviewDataUrl).filter(Boolean);
}

// Publishes at most four optimized thumbnails. sharp re-encodes each stored render to a small square
// WebP with metadata dropped (no EXIF/ICC/profile survives), which keeps the public payload tiny and
// removes any embedded metadata before it can reach a visitor.
async function buildSocialProofThumbnails(sources) {
  const thumbs = [];
  const sharp = getSocialProofSharp();
  for (const source of sources) {
    if (thumbs.length >= SOCIAL_PROOF_PREVIEW_COUNT) break;
    const base64 = source.slice(source.indexOf(",") + 1);
    let sourceBuffer;
    try {
      sourceBuffer = Buffer.from(base64, "base64");
    } catch (error) {
      continue;
    }
    if (!sourceBuffer.length) continue;
    if (!sharp) {
      // Graceful degradation: without the optimizer only modest stored previews are published, so a
      // page view stays bounded even in that failure mode.
      if (sourceBuffer.length <= 96000) thumbs.push(source);
      continue;
    }
    try {
      const thumbBuffer = await sharp(sourceBuffer, { failOn: "none" })
        .resize(SOCIAL_PROOF_THUMB_PX, SOCIAL_PROOF_THUMB_PX, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
          withoutEnlargement: false
        })
        .webp({ quality: SOCIAL_PROOF_THUMB_QUALITY, alphaQuality: 92, effort: 4 })
        .toBuffer();
      if (thumbBuffer && thumbBuffer.length) thumbs.push("data:image/webp;base64," + thumbBuffer.toString("base64"));
    } catch (error) {
      console.warn("[/api/social-proof] preview skipped:", error?.message || error);
    }
  }
  return thumbs;
}

async function readRecentBraceletPreviews(now) {
  const stamp = await readNewestPaidOrderStamp();
  const cached = socialProofPreviewCache;
  const ttl = cached.thumbs.length >= SOCIAL_PROOF_PREVIEW_COUNT ? SOCIAL_PROOF_PREVIEW_TTL_MS : SOCIAL_PROOF_PREVIEW_SHORT_TTL_MS;
  if (cached.thumbs.length > 0 && cached.stamp === stamp && now - cached.at < ttl) {
    return cached.thumbs;
  }
  const sources = await readRecentBraceletPreviewSources();
  const thumbs = await buildSocialProofThumbnails(sources);
  socialProofPreviewCache = { stamp, thumbs, at: now };
  return thumbs;
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

async function readAdminOrderNumberRows() {
  if (!isSupabaseConfigured()) return [];
  const rows = await supabaseRequest("admin_order_numbers", {
    params: { select: "order_id,admin_order_number" }
  });
  return Array.isArray(rows) ? rows : [];
}

async function getAdminOrderNumberForOrderId(orderId) {
  const id = String(orderId || "").trim();
  if (!id || !isSupabaseConfigured()) return null;
  const rows = await supabaseRequest("admin_order_numbers", {
    params: {
      select: "admin_order_number",
      order_id: `eq.${id}`,
      limit: "1"
    }
  });
  return normalizeAdminOrderNumber(Array.isArray(rows) ? rows[0]?.admin_order_number : null);
}

async function readOrdersForCrmApi() {
  const orders = await readOrdersForApi();
  if (!isSupabaseConfigured()) return orders;
  try {
    return attachAdminOrderNumbers(orders, await readAdminOrderNumberRows());
  } catch (error) {
    console.warn("[crm-orders] admin number lookup failed:", error?.message || error);
    return orders;
  }
}

function applyCrmPaidOrderFilter(params) {
  // stripePaymentStatus is authoritative when present; paymentStatus is only the
  // historical fallback when the Stripe field is absent.
  params.or = '(payload->>stripePaymentStatus.ilike.paid,and(payload->>stripePaymentStatus.is.null,payload->>paymentStatus.ilike.paid))';
  return params;
}

function stripOrderListPreview(order) {
  if (!order || typeof order !== 'object') return order;
  const { braceletPreviewImage, braceletPreviewDataUrl, braceletPreviewSnapshot, ...rest } = order;
  return rest;
}

async function readCrmOrderProjection({ page = null, limit = null, paidOnly = false, includePreview = false } = {}) {
  if (!isSupabaseConfigured()) {
    const rows = await readOrdersForCrmApi();
    return includePreview ? rows : rows.map(stripOrderListPreview);
  }
  const select = 'id:payload->>id,date:payload->>date,status:payload->>status,customerName:payload->>customerName,stripePaymentStatus:payload->>stripePaymentStatus,paymentStatus:payload->>paymentStatus,wristSize:payload->>wristSize,beadSize:payload->>beadSize,totalBeads:payload->>totalBeads,hasCharm:payload->>hasCharm,charmNameTh:payload->>charmNameTh,charmNameEn:payload->>charmNameEn,charmSku:payload->>charmSku,charmSizeCm:payload->>charmSizeCm,hasSpacer:payload->>hasSpacer,spacerCount:payload->>spacerCount,' + (includePreview ? 'braceletPreviewImage:payload->>braceletPreviewImage,braceletPreviewDataUrl:payload->>braceletPreviewDataUrl,braceletPreviewSnapshot:payload->>braceletPreviewSnapshot,checkoutBraceletPreviewImage:payload->checkoutSummary->>braceletPreviewImage,checkoutBraceletPreviewDataUrl:payload->checkoutSummary->>braceletPreviewDataUrl,checkoutBraceletPreviewSnapshot:payload->checkoutSummary->>braceletPreviewSnapshot,' : '') + 'costSnapshotStatus:payload->costSnapshot->>status,costSnapshotMaterialCost:payload->costSnapshot->>materialCost,costSnapshotDeliveryCost:payload->costSnapshot->>deliveryCost,costSnapshotTotalCost:payload->costSnapshot->>totalCost,costSnapshotProfit:payload->costSnapshot->>profit,costSnapshotMarginPercent:payload->costSnapshot->>marginPercent,subtotal:payload->>subtotal,discountPercent:payload->>discountPercent,discountAmount:payload->>discountAmount,totalPrice:payload->>totalPrice,finalPrice:payload->>finalPrice,netPrice:payload->>netPrice,checkoutSubtotal:payload->checkoutSummary->>subtotal,checkoutDiscountPercent:payload->checkoutSummary->>discountPercent,checkoutDiscountAmount:payload->checkoutSummary->>discountAmount,checkoutTotalPrice:payload->checkoutSummary->>totalPrice,checkoutFinalPrice:payload->checkoutSummary->>finalPrice,checkoutNetPrice:payload->checkoutSummary->>netPrice,created_at';
  // The authenticated CRM order cards present the same shipping information as View Detail, so the
  // projection carries the recipient/phone/address fields. No public route reads this projection.
  const selectWithShipping = select + ',recipientName:payload->>recipientName,phoneNumber:payload->>phoneNumber,addressLine:payload->>addressLine,province:payload->>province,postalCode:payload->>postalCode,shippingInfo:payload->shippingInfo';
  const params = { select: selectWithShipping, order: 'date.desc.nullslast,created_at.desc' };
  if (paidOnly) applyCrmPaidOrderFilter(params);
  if (Number.isInteger(page) && Number.isInteger(limit)) { params.limit = limit; params.offset = (page - 1) * limit; }
  const rows = await supabaseRequest('orders', { params });
  const adminRows = await readAdminOrderNumberRows();
  const numbers = new Map(adminRows.map((row) => [row.order_id, normalizeAdminOrderNumber(row.admin_order_number)]));
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    braceletPreviewImage: row.braceletPreviewImage,
    braceletPreviewDataUrl: row.braceletPreviewDataUrl,
    braceletPreviewSnapshot: row.braceletPreviewSnapshot,
    // Fall back to the legacy top-level address fields exactly like getOrderShippingInfo in crm.js.
    shippingInfo: {
      recipientName: row.shippingInfo?.recipientName ?? row.recipientName ?? '',
      phoneNumber: row.shippingInfo?.phoneNumber ?? row.phoneNumber ?? '',
      addressLine: row.shippingInfo?.addressLine ?? row.addressLine ?? '',
      province: row.shippingInfo?.province ?? row.province ?? '',
      postalCode: row.shippingInfo?.postalCode ?? row.postalCode ?? ''
    },
    costSnapshot: {
      status: row.costSnapshotStatus,
      materialCost: row.costSnapshotMaterialCost,
      deliveryCost: row.costSnapshotDeliveryCost,
      totalCost: row.costSnapshotTotalCost,
      profit: row.costSnapshotProfit,
      marginPercent: row.costSnapshotMarginPercent
    },
    checkoutSummary: {
      // TASK B1 (2026-10-12): this literal used to be assigned twice, and the second assignment threw
      // the preview fields away - so an order whose bracelet preview lives only in checkoutSummary
      // (which includePreview=1 explicitly pays to fetch) rendered an order card with no preview even
      // though View Detail could resolve it. The projection now keeps both halves in one object.
      braceletPreviewImage: row.checkoutBraceletPreviewImage,
      braceletPreviewDataUrl: row.checkoutBraceletPreviewDataUrl,
      braceletPreviewSnapshot: row.checkoutBraceletPreviewSnapshot,
      subtotal: row.checkoutSubtotal,
      discountPercent: row.checkoutDiscountPercent,
      discountAmount: row.checkoutDiscountAmount,
      totalPrice: row.checkoutTotalPrice,
      finalPrice: row.checkoutFinalPrice,
      netPrice: row.checkoutNetPrice
    },
    adminOrderNumber: numbers.get(row.id) ?? null
  }));
}

async function readCrmPaidOrderCount() {
  if (!isSupabaseConfigured()) return (await readOrdersForCrmApi()).filter((order) => String(order.stripePaymentStatus || order.paymentStatus || '').trim().toLowerCase() === 'paid').length;
  const params = applyCrmPaidOrderFilter({ select: 'id:payload->>id' });
  const rows = await supabaseRequest('orders', { params });
  return Array.isArray(rows) ? rows.length : 0;
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

async function persistPaidOrderCostSnapshot(order) {
  if (order?.costSnapshot) return order;
  let purchases = [];
  if (isSupabaseConfigured()) {
    try {
      purchases = await supabaseRequest('stone_purchase_entries', {
        params: { select: 'item_type,catalog_item_id,size_mm,quantity,total_cost,purchased_at' }
      });
    } catch (error) {
      console.warn(`[order-cost] purchase cost lookup unavailable for ${getOrderId(order)}:`, error?.message || error);
    }
  }
  return preserveOrCreateOrderCostSnapshot(order, Array.isArray(purchases) ? purchases : []);
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
  const paidOrderWithStock = await deductStockForOrder({
    ...order,
    status: 'Payment Received',
    stripePaymentStatus: 'paid',
    stripeCheckoutStatus: session.status || 'complete',
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
    paidAt: new Date().toISOString(),
    stripeWebhookEventIds: [...processed, eventId].slice(-20)
  });
  const paidOrder = await persistPaidOrderCostSnapshot(paidOrderWithStock);
  await saveOrderForApi(paidOrder);
  await linkAnalyticsOrderConversion(paidOrder);
  sendMetaPurchaseEvent(paidOrder, session).catch((error) => {
    console.warn(`[meta-capi] Purchase delivery failed for order=${orderReference}:`, error?.message || error);
  });
  sendTikTokCompletePaymentEvent(paidOrder, session).catch((error) => {
    console.warn(`[tiktok-events-api] CompletePayment delivery failed for order=${orderReference}:`, error?.message || error);
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

  // SECURITY HOTFIX: sensitive order/CRM/payment/business responses must never be cached by
  // shared caches or intermediaries. Applied to the whole sensitive surface up front.
  if (pathname === '/api/orders' ||
      pathname === '/api/analytics/summary' ||
      pathname === '/api/stripe/checkout-session' ||
      pathname === '/api/stripe/purchase-tracking' ||
      pathname === '/api/purchases' ||
      pathname.startsWith('/api/purchases/') ||
      pathname === '/api/purchase-costs' ||
      pathname.startsWith('/api/purchase-costs/') ||
      pathname.startsWith('/api/crm/') ||
      pathname.startsWith('/api/admin/')) {
    res.setHeader('Cache-Control', 'private, no-store');
  }

  if (pathname === '/api/crm/overview' && method === 'GET') {
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    sendJson(res, 200, buildCrmOverview(await readCrmOrderProjection({ paidOnly: true })));
    return true;
  }

  if (pathname.startsWith('/api/crm/orders/') && method === 'GET') {
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    // TURN 10.1: an order's saved bracelet preview is an immutable snapshot, so it is served as raw
    // image bytes from its own authenticated, immutably cacheable URL instead of being inlined as
    // base64 in every order row of every list page. The read selects only the two preview columns, so
    // producing one preview no longer drags the whole ~113 KB order payload through Supabase.
    if (pathname.endsWith('/preview')) {
      const previewOrderId = decodeURIComponent(pathname.slice('/api/crm/orders/'.length, -'/preview'.length));
      const row = await readOrderPreviewRow(previewOrderId);
      const dataUrl = row ? readProjectedPreviewDataUrl(row) : null;
      const decoded = decodeStoredPreviewDataUrl(dataUrl);
      if (!decoded) { sendJson(res, 404, { error: 'No bracelet preview stored for this order.' }); return true; }
      const etag = `W/"${crypto.createHash('sha1').update(decoded.buffer).digest('hex')}"`;
      const inm = String(req.headers['if-none-match'] || '');
      res.setHeader('Content-Type', decoded.contentType);
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.setHeader('ETag', etag);
      res.setHeader('Vary', 'Cookie');
      setCorsHeaders(res);
      if (inm.split(',').map((value) => value.trim()).includes(etag)) { res.statusCode = 304; res.end(); return true; }
      res.statusCode = 200;
      res.end(decoded.buffer);
      return true;
    }
    const orderId = decodeURIComponent(pathname.slice('/api/crm/orders/'.length));
    const order = await readOrderByIdScoped(orderId);
    if (!order) { sendJson(res, 404, { error: 'Order not found.' }); return true; }
    order.adminOrderNumber = await getAdminOrderNumberForOrderId(orderId);
    // TURN 10: an order detail is a large authenticated document (design + preview). A private
    // validator lets the operator's browser reuse it across card/detail navigation instead of
    // re-transferring ~117 KB per open, without any shared-cache exposure.
    sendJsonValidated(req, res, 200, order, { cacheControl: 'private, max-age=60, must-revalidate', vary: 'Cookie' });
    return true;
  }

  if (pathname === '/api/crm/orders' && method === 'GET') {
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    const page = Math.max(1, Math.trunc(Number(urlObj.searchParams.get('page')) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(urlObj.searchParams.get('limit')) || 20)));
    // TURN 10.1: `previewMode=url` is the new, smaller transport - the list carries a per-order
    // authenticated preview URL instead of 20 inline base64 images. `includePreview=1` keeps working
    // exactly as before for any client that has not been updated yet, so the two sides can deploy in
    // any order.
    const previewModeUrl = urlObj.searchParams.get('previewMode') === 'url';
    const [rows, total] = await Promise.all([
      readCrmOrderProjection({ page, limit, paidOnly: true, includePreview: urlObj.searchParams.get('includePreview') === '1' }),
      readCrmPaidOrderCount()
    ]);
    const orders = rows.map(toCrmOrderSummary);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (previewModeUrl) {
      const withPreview = await readOrderIdsWithStoredPreview(orders.map((order) => order.id));
      for (const order of orders) {
        order.braceletPreviewUrl = order.id && withPreview.has(order.id)
          ? `/api/crm/orders/${encodeURIComponent(order.id)}/preview`
          : '';
      }
    }
    // TURN 10: the list page is re-fetched on every pagination click; a private validator makes a
    // revisit a 304 instead of another preview-heavy body.
    // `previewTransport` is an explicit capability marker: a CRM client that asked for `previewMode=url`
    // can tell an upgraded backend from an older one and only then stop expecting inline snapshots, so
    // the frontend and backend can be deployed in either order without operators losing previews.
    sendJsonValidated(req, res, 200, {
      page, limit, total, totalPages, orders, hasMore: page < totalPages,
      ...(previewModeUrl ? { previewTransport: 'url' } : {})
    }, { cacheControl: 'private, max-age=60, must-revalidate', vary: 'Cookie' });
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

  if (pathname === '/api/tracking/config' && method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300');
    sendJson(res, 200, { tiktokPixelId: getEnvValue('TIKTOK_PIXEL_ID').trim() });
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

  // ---- admin operator session endpoints (Phase 2) --------------------------
  if (pathname === '/api/admin/session' && method === 'GET') {
    if (!adminApiConfigured()) { sendJson(res, 503, { authenticated: false, error: 'Admin API is not configured.' }); return true; }
    const session = getAdminSession(req);
    if (!session) { sendJson(res, 200, { authenticated: false, csrf: '', username: '' }); return true; }
    sendJson(res, 200, { authenticated: true, csrf: String(session.csrf || ''), username: String(session.user || getAdminUsername()) });
    return true;
  }
  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!adminApiConfigured()) { sendJson(res, 503, { authenticated: false, error: 'Admin API is not configured.' }); return true; }
    if (adminLoginRateLimited(req)) { sendJson(res, 429, { authenticated: false, error: 'Too many attempts. Try again later.' }); return true; }
    const secret = getAdminApiSecret();
    const username = String(bodyObj?.username || '').trim();
    const password = String(bodyObj?.password || bodyObj?.secret || '');
    const userOk = username === '' || username === getAdminUsername();
    const passBuffer = Buffer.from(password, 'utf8');
    const secretBuffer = Buffer.from(secret, 'utf8');
    const passOk = passBuffer.length === secretBuffer.length && crypto.timingSafeEqual(passBuffer, secretBuffer);
    if (!userOk || !passOk) {
      recordAdminLoginFailure(req);
      sendJson(res, 401, { authenticated: false, error: 'Invalid credentials.' });
      return true;
    }
    clearAdminLoginFailures(req);
    const session = createAdminSessionToken();
    if (!session) { sendJson(res, 503, { authenticated: false, error: 'Admin session unavailable.' }); return true; }
    setAdminSessionCookies(res, session);
    sendJson(res, 200, { authenticated: true, csrf: session.payload.csrf, username: session.payload.user });
    return true;
  }
  if (pathname === '/api/admin/logout' && method === 'POST') {
    const active = getAdminSession(req);
    if (active && active.jti) revokedAdminSessions.set(active.jti, Number(active.exp) || (Date.now() + ADMIN_SESSION_TTL_MS));
    clearAdminSessionCookies(res);
    sendJson(res, 200, { authenticated: false });
    return true;
  }

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

  const readHandoffMatch = pathname.match(/^\/api\/auth-handoffs\/([A-Za-z0-9_-]{43})$/);
  if (readHandoffMatch && method === 'GET') {
    try {
      const payload = await readLineAuthHandoff(readHandoffMatch[1]);
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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

    const checkoutAttemptId = resolveStripeCheckoutAttemptId(bodyObj.checkoutAttemptId);
    if (!checkoutAttemptId) {
      sendJson(res, 400, { error: 'A valid checkout attempt ID is required.' });
      return true;
    }

    let authoritativeOrder;
    try {
      authoritativeOrder = await buildAuthoritativeStripeOrder({
        ...bodyObj.order,
        id: getStripeCheckoutOrderId(checkoutAttemptId)
      });
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
      origin: bodyObj.origin,
      idempotencyKey: checkoutAttemptId
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

  if (pathname === "/api/stripe/purchase-tracking" && method === "GET") {
    const sessionId = String(urlObj.searchParams.get("session_id") || "").trim();
    const order = await findOrderByStripeCheckoutSessionId(sessionId);
    const paid = String(order?.stripePaymentStatus || '').trim().toLowerCase() === 'paid';
    const eventId = paid ? getMetaPurchaseEventId(order) : null;
    const value = paid ? Number(getOrderTotalPrice(order)) : null;
    res.setHeader('Cache-Control', 'private, no-store');
    sendJson(res, 200, paid && eventId && Number.isFinite(value)
      ? { paid: true, event_id: eventId, value, currency: 'THB' }
      : { paid: false });
    return true;
  }

  if (pathname === "/api/storage/status" && method === "GET") {
    if (!requireAdminAccess(req, res)) return true;
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const entries = await supabaseRequest('stone_purchase_entries', { params: { select: '*', order: 'purchased_at.desc,created_at.desc' } });
    sendJson(res, 200, Array.isArray(entries) ? entries : []);
    return true;
  }

  if (pathname === "/api/purchase-costs/stones" && method === "GET") {
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const [stones, charms, spacers] = await Promise.all([readStonesForApi(), readCharmsForApi(), readSpacersForApi()]);
    const entry = normalizePurchaseEntry(bodyObj, { stones, charms, spacers });
    const rows = await supabaseRequest('stone_purchase_entries', { method: 'POST', body: entry, prefer: 'return=representation' });
    sendJson(res, 201, Array.isArray(rows) ? rows[0] : entry);
    return true;
  }

  if (pathname.startsWith('/api/purchases/') && pathname.endsWith('/catalog-link') && method === 'PATCH') {
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
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
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    if (!isSupabaseConfigured()) throw new Error('Purchase history requires Supabase.');
    const id = decodeURIComponent(pathname.slice('/api/purchases/'.length));
    const rows = await supabaseRequest('stone_purchase_entries', { method: 'DELETE', params: { id: `eq.${id}` }, prefer: 'return=representation' });
    if (!Array.isArray(rows) || !rows[0]) { sendJson(res, 404, { error: 'Purchase entry not found.' }); return true; }
    sendJson(res, 200, { success: true });
    return true;
  }

  if (pathname === "/api/stones" && method === "GET") {
    sendJsonValidated(req, res, 200, await readStonesForApi());
    return true;
  }

  if (pathname === "/api/stones/save" && method === "POST") {
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    sendJsonValidated(req, res, 200, await readCharmsForApi());
    return true;
  }

  if (pathname === "/api/spacers" && method === "GET") {
    sendJsonValidated(req, res, 200, await readSpacersForApi());
    return true;
  }

  if (pathname === "/api/charms" && method === "POST") {
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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

  if (pathname === "/api/social-proof" && method === "GET") {
    // Public, anonymous, cacheable: the CDN and the browser reuse the payload so a landing-page view
    // does not reach the origin (and therefore not Supabase) on every load.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
    sendJson(res, 200, await readSocialProofForApi());
    return true;
  }

  if (pathname === "/api/orders" && method === "GET") {
    // SECURITY HOTFIX: the full order collection is never returned to a client.
    // A caller must present either the Stripe checkout session id (the existing
    // server-validated Stripe-return entitlement) or a signed, expiring,
    // order-scoped access token.
    res.setHeader('Cache-Control', 'private, no-store');
    const sessionId = String(urlObj.searchParams.get('session_id') || '').trim();
    const orderId = String(urlObj.searchParams.get('orderId') || '').trim();
    const orderToken = String(urlObj.searchParams.get('t') || '').trim();
    if (sessionId) {
      const order = await readOrderBySessionIdScoped(sessionId);
      if (!order) { sendJson(res, 404, { error: 'Order not found.' }); return true; }
      sendJson(res, 200, [order]);
      return true;
    }
    if (orderId && verifyOrderAccessToken(orderId, orderToken)) {
      const order = await readOrderByIdScoped(orderId);
      if (!order) { sendJson(res, 404, { error: 'Order not found.' }); return true; }
      sendJson(res, 200, [order]);
      return true;
    }
    sendJson(res, 403, { error: 'Order access requires a valid session or order access token.' });
    return true;
  }

  if (pathname === '/api/orders/reauthorize' && method === 'POST') {
    res.setHeader('Cache-Control', 'private, no-store');
    const idToken = String(bodyObj?.idToken || bodyObj?.id_token || '').trim();
    const requestedOrderId = String(bodyObj?.orderId || '').trim();
    if (!idToken) { sendJson(res, 400, { error: 'A LINE ID token is required.' }); return true; }
    const channelId = getLineLoginChannelId();
    if (!channelId) { sendJson(res, 503, { error: 'LINE reauthorization is not configured.' }); return true; }
    let lineUserId = '';
    try {
      lineUserId = await verifyLineIdToken(idToken, channelId);
    } catch (error) {
      console.warn('[orders] LINE reauthorization verify failed:', error?.message || error);
    }
    if (!lineUserId) { sendJson(res, 401, { error: 'LINE identity could not be verified.' }); return true; }
    try {
      const owned = await readOrdersByLineUserIdScoped(lineUserId);
      const scoped = requestedOrderId ? owned.filter((order) => getOrderId(order) === requestedOrderId) : owned;
      if (requestedOrderId && scoped.length === 0) { sendJson(res, 404, { error: 'Order not found.' }); return true; }
      const orders = scoped.slice(0, 50).map((order) => ({
        id: getOrderId(order),
        date: order?.date || '',
        status: order?.status || '',
        totalPrice: Number(order?.totalPrice ?? order?.finalPrice ?? order?.netPrice ?? 0),
        token: createOrderAccessToken(getOrderId(order))
      })).filter((entry) => entry.id && entry.token);
      sendJson(res, 200, { orders });
    } catch (error) {
      console.warn('[orders] reauthorization lookup failed:', error?.message || error);
      sendJson(res, 500, { error: 'Unable to load orders.' });
    }
    return true;
  }

  if (pathname === "/api/crm/orders" && method === "GET") {
    // Defensive: this branch is unreachable (the paginated handler above always returns first),
    // but it must never become an unguarded path if the route order ever changes.
    if (!hasAdminApiAccess(req)) { denyAdminApi(res); return true; }
    sendJson(res, 200, await readOrdersForCrmApi());
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    sendJsonValidated(req, res, 200, await readSettingsForApi());
    return true;
  }

  if (pathname === "/api/settings/save" && method === "POST") {
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
    if (!requireAdminAccess(req, res, { write: true })) return true;
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
  // Returns a safe relative path, or null when the request is not a plain,
  // single-encoded static path. Traversal is rejected instead of silently
  // rewritten, so two different requests can never alias the same file.
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(pathname || "/"));
  } catch {
    return null; // malformed percent-encoding
  }
  if (!decoded.startsWith("/")) return null;
  if (/%[0-9a-f]{2}/i.test(decoded)) return null; // double-encoded input
  if (decoded.includes("\0") || decoded.includes("\\")) return null;

  const normalized = path.posix.normalize(decoded);
  if (!normalized.startsWith("/")) return null;

  const relative = normalized.replace(/^\/+/, "");
  if (!relative) return null;
  if (relative.split("/").some((segment) => segment === "." || segment === ".." || segment === "")) return null;
  return relative;
}

async function serveStaticFile(req, res, urlObj) {
  const relativePath = urlObj.pathname === "/"
    ? resolveRootDocument(req)
    : sanitizeStaticPath(urlObj.pathname);

  // SECURITY HOTFIX: static serving is an allowlist. A path that is not an
  // approved public web asset is answered exactly like a missing file.
  if (!relativePath || !isPublicStaticAsset(relativePath)) {
    sendText(res, 404, `File Not Found: ${urlObj.pathname}`);
    return;
  }

  const localFile = path.join(workspaceDir, relativePath);
  const workspaceBoundary = workspaceDir.endsWith(path.sep) ? workspaceDir : workspaceDir + path.sep;
  if (localFile !== workspaceDir && !localFile.startsWith(workspaceBoundary)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(localFile);
    if (!stat.isFile()) {
      sendText(res, 404, `File Not Found: ${urlObj.pathname}`);
      return;
    }

    // Containment is re-checked on the resolved target so a symlink inside the
    // workspace cannot be used to read a file outside it.
    const realFile = await fsp.realpath(localFile);
    if (realFile !== workspaceDir && !realFile.startsWith(workspaceBoundary)) {
      sendText(res, 403, "Forbidden");
      return;
    }

    const content = await fsp.readFile(realFile);
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

    // SECURITY HOTFIX: a request target beginning with "//" is parsed as a protocol-relative
    // URL, so `new URL("//server.js", base)` would silently turn "server.js" into a host and
    // resolve the path to "/". Such a target is never a legitimate static request - reject it
    // instead of answering with the application document.
    if (/^\/\//.test(String(req.url || ""))) {
      sendText(res, 404, `File Not Found: ${req.url}`);
      return;
    }

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
