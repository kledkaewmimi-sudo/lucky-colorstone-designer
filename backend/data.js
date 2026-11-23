// LUCKY.COLORSTONE - Shared Database & Sync Layer (REST API)
// ==========================================

import { normalizeCrmOrderDetailResponse } from './crm-order-details.js';

const CANONICAL_CATEGORY_LABELS = {
  all: { en: "All", th: "ทั้งหมด" },
  wealth: { en: "Wealth & Luck", th: "โชคลาภ/การงาน" },
  love: { en: "Love & Healing", th: "ความรัก/เมตตา" },
  calm: { en: "Calm & Wisdom", th: "สงบ/สติปัญญา" },
  protection: { en: "Protection", th: "ปกป้อง/คุ้มครอง" },
  pixiu: { en: "Pi Xiu", th: "ปี่เซียะ" },
  takrud: { en: "Takrud", th: "ตะกรุด" }
};


// SECURITY HOTFIX (Phase 2): CRM/admin requests are authorized by a server-issued, HttpOnly
// session cookie. The legacy shared header is still accepted for compatible tooling, but the
// master secret is no longer entered into or persisted by browser storage. State-changing
// requests also carry the CSRF token the server binds to the operator session.
function readCookieValue(name) {
  try {
    const entry = String(document.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
  } catch { return ''; }
}
export function getCrmAdminSecret() { try { return localStorage.getItem('lucky_crm_admin_secret') || ''; } catch { return ''; } }
export function setCrmAdminSecret(value) { try { if (value) localStorage.setItem('lucky_crm_admin_secret', String(value)); else localStorage.removeItem('lucky_crm_admin_secret'); } catch {} }
export function getCrmAdminCsrf() { return readCookieValue('lcs_admin_csrf'); }
export function crmAdminHeaders(extra = {}) {
  const headers = { ...extra };
  const secret = getCrmAdminSecret();
  if (secret) headers['x-admin-secret'] = secret;
  const csrf = getCrmAdminCsrf();
  if (csrf) headers['x-csrf-token'] = csrf;
  return headers;
}
export async function adminLogin(password, username = 'admin') {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(payload.error || 'Login failed.'); error.status = res.status; throw error; }
  return payload;
}
// SECURITY HOTFIX (Phase 3): when a customer opens an order link that predates signed tokens,
// prove ownership with the LIFF LINE ID token and ask the server for a fresh, scoped token.
async function obtainLiffIdToken() {
  try {
    const api = (typeof window !== 'undefined' && window.liff) ? window.liff : (typeof liff !== 'undefined' ? liff : null);
    if (api && typeof api.getIDToken === 'function') {
      const value = api.getIDToken();
      if (value) return String(value);
    }
  } catch (error) { /* not running inside LIFF */ }
  return '';
}
export async function reauthorizeOrderAccess(orderId = '') {
  const idToken = await obtainLiffIdToken();
  if (!idToken) return null;
  try {
    const res = await fetch('/api/orders/reauthorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderId ? { idToken, orderId } : { idToken })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) { return null; }
}
export async function adminLogout() {
  try { await fetch('/api/admin/logout', { method: 'POST', headers: crmAdminHeaders({ 'Content-Type': 'application/json' }) }); } catch { /* ignore */ }
}
export async function getAdminSession() {
  try {
    const res = await fetch('/api/admin/session', { cache: 'no-store' });
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch { return { authenticated: false }; }
}

export const CATALOG_LAYOUT_ORDER_STORAGE_KEY = "lucky_crm_catalog_layout_order";

// Bump this when replacing catalog assets with the same filename so browsers/CDNs fetch the new file.
export const ASSET_VERSION = "20260804-blue-diamond-ball-normalized";

function isLocalCatalogAssetUrl(imageUrl = "") {
  const value = String(imageUrl || "").trim();
  if (!value) return false;
  if (/^(data|blob|https?):/i.test(value) || value.startsWith("//")) return false;
  return value.startsWith("assets/") || value.startsWith("/assets/") || value.includes("/assets/");
}

function getCatalogImageVersion(item = {}) {
  return String(
    item?.imageVersion ||
    item?.assetVersion ||
    item?.updatedAt ||
    item?.updated_at ||
    item?.payload?.updatedAt ||
    item?.payload?.updated_at ||
    ASSET_VERSION
  ).trim();
}

export function withCatalogImageVersion(imageUrl, item = {}) {
  const value = String(imageUrl || "").trim();
  if (!isLocalCatalogAssetUrl(value)) return value;

  const version = getCatalogImageVersion(item);
  if (!version) return value;

  const [urlWithoutHash, hash = ""] = value.split("#");
  if (/[?&]v=/.test(urlWithoutHash)) {
    const updatedUrl = urlWithoutHash.replace(/([?&])v=[^&]*/, `$1v=${encodeURIComponent(version)}`);
    return `${updatedUrl}${hash ? `#${hash}` : ""}`;
  }
  const separator = urlWithoutHash.includes("?") ? "&" : "?";
  return `${urlWithoutHash}${separator}v=${encodeURIComponent(version)}${hash ? `#${hash}` : ""}`;
}

const CATALOG_LAYOUT_CATEGORIES = Object.freeze(["stones", "charms", "spacers"]);

function normalizeCatalogLayoutCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  return CATALOG_LAYOUT_CATEGORIES.includes(value) ? value : "stones";
}

export function normalizeCatalogLayoutOrder(order = {}) {
  return CATALOG_LAYOUT_CATEGORIES.reduce((normalized, category) => {
    const ids = Array.isArray(order?.[category]) ? order[category] : [];
    const seen = new Set();
    normalized[category] = ids
      .map((id) => String(id || "").trim())
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    return normalized;
  }, { stones: [], charms: [], spacers: [] });
}

export function getCatalogLayoutOrder() {
  try {
    const raw = typeof window !== "undefined"
      ? window.localStorage?.getItem(CATALOG_LAYOUT_ORDER_STORAGE_KEY)
      : "";
    return normalizeCatalogLayoutOrder(raw ? JSON.parse(raw) : {});
  } catch (err) {
    console.warn("Unable to read catalog layout order.", err);
    return normalizeCatalogLayoutOrder();
  }
}

export function saveCatalogLayoutOrder(order = {}) {
  const normalized = normalizeCatalogLayoutOrder(order);
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(CATALOG_LAYOUT_ORDER_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent?.(new Event("catalog_layout_order_updated"));
    }
  } catch (err) {
    console.warn("Unable to save catalog layout order.", err);
  }
  return normalized;
}

export function resetCatalogLayoutOrder(category = "all") {
  const normalizedCategory = String(category || "all").trim().toLowerCase();
  if (normalizedCategory === "all") {
    return saveCatalogLayoutOrder();
  }

  const currentOrder = getCatalogLayoutOrder();
  currentOrder[normalizeCatalogLayoutCategory(normalizedCategory)] = [];
  return saveCatalogLayoutOrder(currentOrder);
}

export function applyCatalogLayoutOrder(items = [], category = "stones", getId = (item) => item?.id) {
  const list = Array.isArray(items) ? items.slice() : [];
  const order = getCatalogLayoutOrder()[normalizeCatalogLayoutCategory(category)] || [];
  if (order.length === 0) return list;

  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return list
    .map((item, index) => ({ item, index, id: String(getId(item) || "") }))
    .sort((a, b) => {
      const aRank = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bRank = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

const KNOWN_BAD_CATEGORY_THAI = {
  all: new Set([
    "เธ—เธฑเนเธเธซเธกเธ”",
    "เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€"
  ]),
  wealth: new Set([
    "เนเธเธเธฅเธฒเธ /เธเธฒเธฃเธเธฒเธ",
    "เน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธเธ’เน€เธย /เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธย"
  ]),
  love: new Set([
    "เธเธงเธฒเธกเธฃเธฑเธ/เน€เธกเธ•เธ•เธฒ",
    "เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธ‘เน€เธย/เน€เธโฌเน€เธเธเน€เธโ€ขเน€เธโ€ขเน€เธเธ’"
  ]),
  calm: new Set([
    "เธชเธเธ/เธชเธ•เธดเธเธฑเธเธเธฒ",
    "เน€เธเธเน€เธยเน€เธย/เน€เธเธเน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ’"
  ]),
  protection: new Set([
    "เธเธเธเนเธญเธ/เธเธธเนเธกเธเธฃเธญเธ",
    "เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธย/เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธย"
  ]),
  pixiu: new Set([
    "เธเธตเนเน€เธเธตเธขเธฐ",
    "เน€เธยเน€เธเธ•เน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธเธ"
  ]),
  takrud: new Set([
    "เธ•เธฐเธเธฃเธธเธ”",
    "เน€เธโ€ขเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธโ€"
  ])
};

function sanitizeCategoryThaiLabel(categoryId, value) {
  const normalizedId = String(categoryId || "").trim();
  const trimmedValue = String(value || "").trim();
  const canonical = FIXED_CATEGORY_LABELS[normalizedId]?.th || CANONICAL_CATEGORY_LABELS[normalizedId]?.th || "";

  if (!trimmedValue) return canonical;
  if (KNOWN_BAD_CATEGORY_THAI[normalizedId]?.has(trimmedValue)) {
    return canonical;
  }
  return trimmedValue;
}

const FIXED_CATEGORY_LABELS = {
  all: { en: "All", th: "\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14" },
  wealth: { en: "Wealth & Luck", th: "\u0E42\u0E0A\u0E04\u0E25\u0E32\u0E20/\u0E01\u0E32\u0E23\u0E07\u0E32\u0E19" },
  love: { en: "Love & Healing", th: "\u0E04\u0E27\u0E32\u0E21\u0E23\u0E31\u0E01/\u0E40\u0E21\u0E15\u0E15\u0E32" },
  calm: { en: "Calm & Wisdom", th: "\u0E2A\u0E07\u0E1A/\u0E2A\u0E15\u0E34\u0E1B\u0E31\u0E0D\u0E0D\u0E32" },
  protection: { en: "Protection", th: "\u0E1B\u0E01\u0E1B\u0E49\u0E2D\u0E07/\u0E04\u0E38\u0E49\u0E21\u0E04\u0E23\u0E2D\u0E07" },
  pixiu: { en: "Pi Xiu", th: "\u0E1B\u0E35\u0E48\u0E40\u0E0B\u0E35\u0E22\u0E30" },
  takrud: { en: "Takrud", th: "\u0E15\u0E30\u0E01\u0E23\u0E38\u0E14" }
};

export const COMPONENT_TYPE_LABELS = Object.freeze({
  stone: { th: "\u0E2B\u0E34\u0E19", en: "Stones", singularEn: "Stone" },
  charm: { th: "\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E32\u0E07", en: "Talismans", singularEn: "Talisman" },
  spacer: { th: "\u0E0A\u0E32\u0E23\u0E4C\u0E21", en: "Charms", singularEn: "Charm" }
});

export function getComponentTypeLabel(type, locale = "th") {
  const normalizedType = String(type || "").trim().toLowerCase();
  const label = COMPONENT_TYPE_LABELS[normalizedType] || COMPONENT_TYPE_LABELS.stone;
  return label[locale] || label.th;
}

export const CATEGORIES = {
  all: { en: "All", th: "ทั้งหมด" },
  wealth: { en: "Wealth & Luck", th: "โชคลาภ/การงาน" },
  love: { en: "Love & Healing", th: "ความรัก/เมตตา" },
  calm: { en: "Calm & Wisdom", th: "สงบ/สติปัญญา" },
  protection: { en: "Protection", th: "ปกป้อง/คุ้มครอง" }
};

Object.assign(CATEGORIES, {
  all: { ...FIXED_CATEGORY_LABELS.all },
  wealth: { ...FIXED_CATEGORY_LABELS.wealth },
  love: { ...FIXED_CATEGORY_LABELS.love },
  calm: { ...FIXED_CATEGORY_LABELS.calm },
  protection: { ...FIXED_CATEGORY_LABELS.protection }
});

export let CATEGORY_RECORDS = [];

const DEFAULT_CATEGORY_CATALOG = [
    {
      "id": "wealth",
      "entityType": "stone",
      "slug": "wealth",
      "nameEn": "Wealth & Luck",
      "nameTh": "โชคลาภ/การงาน",
      "displayOrder": 10,
      "isActive": true
    },
    {
      "id": "love",
      "entityType": "stone",
      "slug": "love",
      "nameEn": "Love & Healing",
      "nameTh": "ความรัก/เมตตา",
      "displayOrder": 20,
      "isActive": true
    },
    {
      "id": "calm",
      "entityType": "stone",
      "slug": "calm",
      "nameEn": "Calm & Wisdom",
      "nameTh": "สงบ/สติปัญญา",
      "displayOrder": 30,
      "isActive": true
    },
    {
      "id": "protection",
      "entityType": "stone",
      "slug": "protection",
      "nameEn": "Protection",
      "nameTh": "ปกป้อง/คุ้มครอง",
      "displayOrder": 40,
      "isActive": true
    },
    {
      "id": "pixiu",
      "entityType": "charm",
      "slug": "pixiu",
      "nameEn": "Pi Xiu",
      "nameTh": "ปี่เซียะ",
      "displayOrder": 10,
      "isActive": true
    },
    {
      "id": "takrud",
      "entityType": "charm",
      "slug": "takrud",
      "nameEn": "Takrud",
      "nameTh": "ตะกรุด",
      "displayOrder": 20,
      "isActive": true
    },
    {
      "id": "bee-heart",
      "entityType": "charm",
      "slug": "bee-heart",
      "nameEn": "Bee Heart",
      "nameTh": "สีผึ้ง / บีฮาร์ท",
      "displayOrder": 30,
      "isActive": true
    }
  ];

function cloneDefaultCategoryCatalog() {
  return DEFAULT_CATEGORY_CATALOG.map((category) => ({ ...category }));
}

function normalizeCategoryRecord(record, index = 0) {
  if (!record || typeof record !== "object") return null;

  const rawEntityType = typeof record.entityType === "string"
    ? record.entityType
    : typeof record.scope === "string"
      ? record.scope
      : typeof record.kind === "string"
        ? record.kind
        : "stone";
  const entityType = rawEntityType.trim().toLowerCase();
  const id = (record.id || record.slug || "").trim();
  if (!id) return null;

  return {
    id,
    entityType,
    slug: (record.slug || id).trim(),
    nameEn: record.nameEn || record.name?.en || "",
    nameTh: sanitizeCategoryThaiLabel(id, record.nameTh || record.name?.th || ""),
    displayOrder: Number.isFinite(Number(record.displayOrder)) ? Number(record.displayOrder) : (index + 1) * 10,
    isActive: record.isActive !== false
  };
}

function sortCategoryRecords(a, b) {
  const entityCompare = (a.entityType || "").localeCompare(b.entityType || "");
  if (entityCompare !== 0) return entityCompare;
  const orderCompare = (a.displayOrder || 0) - (b.displayOrder || 0);
  if (orderCompare !== 0) return orderCompare;
  return (a.nameEn || a.nameTh || a.id || "").localeCompare(b.nameEn || b.nameTh || b.id || "");
}

function syncLegacyCategoryMap(records = []) {
  const nextMap = {
    all: { en: "All", th: "เธ—เธฑเนเธเธซเธกเธ”" }
  };

  nextMap.all = { ...FIXED_CATEGORY_LABELS.all };

  records
    .filter((record) => record.entityType === "stone" && record.isActive !== false)
    .slice()
    .sort(sortCategoryRecords)
    .forEach((record) => {
      nextMap[record.id] = {
        en: record.nameEn || record.slug || record.id,
        th: record.nameTh || record.slug || record.id
      };
    });

  Object.keys(CATEGORIES).forEach((key) => {
    if (key !== "all") delete CATEGORIES[key];
  });
  Object.assign(CATEGORIES, nextMap);
}

function getDefaultCategoryRecords() {
  return cloneDefaultCategoryCatalog()
    .map((record, index) => normalizeCategoryRecord(record, index))
    .filter(Boolean)
    .sort(sortCategoryRecords);
}

function normalizeCategoryCatalog(records = []) {
  return records
    .map((record, index) => normalizeCategoryRecord(record, index))
    .filter(Boolean)
    .sort(sortCategoryRecords);
}

function normalizeStoneRecord(record, index = 0) {
  if (!record || typeof record !== "object") return null;

  const id = String(record.id || "").trim();
  if (!id) return null;

  const categoryId = String(record.categoryId || record.category || "").trim();
  const normalizedCategory = categoryId || "uncategorized";
  const stockQty = normalizeStockQty(record.stockQty ?? record.stock_qty ?? record.availability?.stockQty ?? record.availability?.stock_qty, null);
  const normalizeManualCost = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  };

  const { p8: legacyP8, ...stoneRecord } = record;
  const nestedInStock = record.availability && record.availability.inStock !== undefined
    ? record.availability.inStock !== false
    : null;
  const nestedIsActive = record.availability && record.availability.isActive !== undefined
    ? record.availability.isActive !== false
    : null;
  const flatInStock = record.inStock === undefined ? null : record.inStock !== false;
  const flatIsActive = record.isActive === undefined ? null : record.isActive !== false;
  const availabilityInStock = (nestedInStock ?? flatInStock ?? true) && (stockQty === null || stockQty > 0);
  const availabilityIsActive = nestedIsActive ?? flatIsActive ?? true;
  return {
    ...stoneRecord,
    id,
    name: record.name || record.nameEn || "",
    nameTh: record.nameTh || "",
    p4: Number(record.p4 || record.price || 0),
    p6: Number(record.p6 || record.price || 0),
    p10: Number(record.p10 ?? legacyP8 ?? record.price ?? 0),
    manualCost4mm: normalizeManualCost(record.manualCost4mm),
    manualCost6mm: normalizeManualCost(record.manualCost6mm),
    manualCost10mm: normalizeManualCost(record.manualCost10mm),
    category: normalizedCategory,
    categoryId: normalizedCategory,
    categoryTh: record.categoryTh || "",
    meaning: record.meaning || "",
    meaningTh: record.meaningTh || "",
    image: record.image || "",
    color: record.color || "#E2C974",
    sizes: Array.isArray(record.sizes)
      ? [...new Set(record.sizes.map((size) => Number(size) === 8 ? 10 : Number(size)))]
      : [4, 6, 10],
    stockQty,
    inStock: availabilityInStock,
    isActive: availabilityIsActive,
    stock_qty: stockQty,
    availability: {
      inStock: availabilityInStock,
      isActive: availabilityIsActive,
      stockQty,
      stock_qty: stockQty
    }
  };
}

function normalizeStockQty(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

export function getCategoryRecordById(categoryId, entityType = "all") {
  const normalizedId = String(categoryId || "").trim();
  if (!normalizedId) return null;

  const pool = Array.isArray(CATEGORY_RECORDS) && CATEGORY_RECORDS.length > 0
    ? CATEGORY_RECORDS
    : getDefaultCategoryRecords();

  return pool.find((record) => (
    record.id === normalizedId &&
    (entityType === "all" || record.entityType === entityType)
  )) || null;
}

export function getCategoryLabelById(categoryId, entityType = "all") {
  const record = getCategoryRecordById(categoryId, entityType);
  if (record) {
    return {
      id: record.id,
      en: record.nameEn || record.slug || record.id,
      th: record.nameTh || record.slug || record.id,
      isActive: record.isActive !== false,
      entityType: record.entityType,
      missing: false
    };
  }

  const fallbackId = String(categoryId || "").trim();
  if (!fallbackId) {
    return { id: "", en: "Unassigned", th: "ยังไม่กำหนด", isActive: false, entityType };
  }

  return {
    id: fallbackId,
    en: `Missing category (${fallbackId})`,
    th: `หมวดหมู่หายไป (${fallbackId})`,
    isActive: false,
    entityType,
    missing: true
  };
}

export const CHARM_PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Charm placeholder">
    <rect width="96" height="96" rx="18" fill="#eef3f9" />
    <circle cx="48" cy="48" r="29" fill="#d7e0ec" />
    <circle cx="48" cy="48" r="17" fill="#bcc9da" />
    <path d="M40 47c3-6 9-10 17-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.75" />
  </svg>
`.trim())}`;

export const SPACER_CATALOG = Object.freeze([
  {
    id: "diamond_ball_orange",
    sku: "SP-DB-ORANGE",
    nameTh: "Diamond Ball Orange",
    nameEn: "Diamond Ball Orange",
    type: "ball",
    color: "orange",
    image: "/assets/spacers/diamond-ball-orange-9mm.webp",
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 15,
    description: "Decorative orange spacer bead",
    inStock: true,
    displayOrder: 10
  },
  {
    id: "diamond_ball_pink",
    sku: "SP-DB-PINK",
    nameTh: "Diamond Ball Pink",
    nameEn: "Diamond Ball Pink",
    type: "ball",
    color: "pink",
    image: "/assets/spacers/diamond-ball-pink-9mm.webp",
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 15,
    description: "Decorative pink spacer bead",
    inStock: true,
    displayOrder: 20
  },
  {
    id: "diamond_ball_purple",
    sku: "SP-DB-PURPLE",
    nameTh: "Diamond Ball Purple",
    nameEn: "Diamond Ball Purple",
    type: "ball",
    color: "purple",
    image: "/assets/spacers/diamond-ball-purple-9mm.webp",
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 15,
    description: "Decorative purple spacer bead",
    inStock: true,
    displayOrder: 30
  },
  {
    id: "diamond_ball_white",
    sku: "SP-DB-WHITE",
    nameTh: "Diamond Ball White",
    nameEn: "Diamond Ball White",
    type: "ball",
    color: "white",
    image: "/assets/spacers/diamond-ball-white-9mm.webp",
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 15,
    description: "Decorative white spacer bead",
    inStock: true,
    displayOrder: 40
  },
  {
    id: "diamond-ball-blue-9mm",
    slug: "diamond-ball-blue-9mm",
    sku: "SP-DB-BLUE-9MM",
    nameTh: "\u0e25\u0e01\u0e1a\u0e2d\u0e25\u0e04\u0e23\u0e2a\u0e15\u0e25\u0e2a\u0e1f\u0e32 9mm",
    nameEn: "Diamond Ball Blue 9mm",
    entityType: "spacer",
    categoryId: "diamond-ball",
    type: "ball",
    color: "blue",
    image: "assets/spacers/diamond-ball-blue-9mm.webp",
    sizeMm: 9,
    displaySizeMm: 9,
    effectiveLengthMm: 9,
    renderSizeMm: 9,
    price: 15,
    stockQty: 20,
    inStock: true,
    isActive: true,
    meaningTh: "\u0e2a\u0e2d\u0e16\u0e07\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e07\u0e1a \u0e04\u0e27\u0e32\u0e21\u0e2a\u0e14\u0e43\u0e2a \u0e01\u0e32\u0e23\u0e2a\u0e2d\u0e2a\u0e32\u0e23\u0e17\u0e2d\u0e2d\u0e19\u0e42\u0e22\u0e19 \u0e41\u0e25\u0e30\u0e1e\u0e25\u0e07\u0e1a\u0e27\u0e01\u0e17\u0e40\u0e1a\u0e32\u0e2a\u0e1a\u0e32\u0e22",
    meaningEn: "Symbolizes calmness, clarity, gentle communication, and light positive energy.",
    description: "Decorative blue diamond ball spacer",
    displayOrder: 45
  },
  {
    id: "golden_ball",
    sku: "SP-GOLD-BALL",
    nameTh: "Golden Ball",
    nameEn: "Golden Ball",
    type: "ball",
    color: "gold",
    image: "/assets/spacers/golden-ball-7mm.webp",
    displaySizeMm: 7,
    effectiveLengthMm: 7,
    renderSizeMm: 7,
    price: 10,
    description: "Decorative gold spacer bead",
    inStock: true,
    displayOrder: 50
  },
  {
    id: "gold_flower",
    sku: "SP-GOLD-FLOWER",
    nameTh: "Gold Flower",
    nameEn: "Gold Flower",
    type: "flat-spacer",
    color: "gold",
    image: "/assets/spacers/flower-gold-6mm.webp",
    displaySizeMm: 6,
    effectiveLengthMm: 1,
    thicknessMm: 1,
    renderSizeMm: 6,
    price: 9,
    description: "Flat gold flower spacer",
    inStock: true,
    displayOrder: 60
  },
  {
    id: "silver_flower",
    sku: "SP-SILVER-FLOWER",
    nameTh: "Silver Flower",
    nameEn: "Silver Flower",
    type: "flat-spacer",
    color: "silver",
    image: "/assets/spacers/flower-silver-6mm.webp",
    displaySizeMm: 6,
    effectiveLengthMm: 1,
    thicknessMm: 1,
    renderSizeMm: 6,
    price: 9,
    description: "Flat silver flower spacer",
    inStock: true,
    displayOrder: 70
  },
  {
    id: 'mallow',
    sku: 'SP-MALLOW',
    slug: 'mallow',
    name: { en: 'Mallow', th: '\u0E2D\u0E31\u0E0D\u0E21\u0E13\u0E35\u0E41\u0E2B\u0E48\u0E07\u0E40\u0E2A\u0E19\u0E48\u0E2B\u0E4C' },
    type: 'hanging',
    presentation: 'hanging',
    color: 'gold',
    image: { primary: '/assets/spacers/Mallow.webp' },
    inStock: true,
    meaning: { en: 'Mushroom hanging charm', th: '' },
    pricing: { base: 150 },
    business: {
      sizeMm: 33.5,
      displaySizeMm: 33.5,
      effectiveLengthMm: 4.2,
      renderSizeMm: 33.5,
      renderWidthMm: 17,
      renderHeightMm: 33.5,
      attachmentLoopMm: 4.2,
      thicknessMm: 0
    },
    isActive: true,
    stockQty: 50,
    stock_qty: 50,
    categoryId: 'spacer',
    collection: 'spacer',
    entityType: 'spacer',
    availability: { inStock: true, isActive: true, stockQty: 50, stock_qty: 50 },
    displayOrder: 80
  },
  {
    id: 'pony',
    sku: 'SP-PONY',
    slug: 'pony',
    name: { en: 'Pony', th: '\u0E21\u0E49\u0E32\u0E41\u0E2B\u0E48\u0E07\u0E1D\u0E31\u0E19' },
    type: 'hanging',
    presentation: 'hanging',
    color: 'pink',
    image: { primary: '/assets/spacers/Pony.webp' },
    inStock: true,
    meaning: { en: 'Horse hanging charm', th: '' },
    pricing: { base: 150 },
    business: {
      sizeMm: 30,
      displaySizeMm: 30,
      effectiveLengthMm: 4.2,
      renderSizeMm: 30,
      renderWidthMm: 21,
      renderHeightMm: 30,
      attachmentLoopMm: 4.2,
      thicknessMm: 0
    },
    isActive: true,
    stockQty: 50,
    stock_qty: 50,
    categoryId: 'spacer',
    collection: 'spacer',
    entityType: 'spacer',
    availability: { inStock: true, isActive: true, stockQty: 50, stock_qty: 50 },
    displayOrder: 90
  }
]);

export const CHARM_CATALOG = [
    {
      "id": "px01",
      "sku": "PX01",
      "nameTh": "ปี่เซียะ PX01",
      "nameEn": "Pi Xiu PX01",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px01.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 490,
      "meaningTh": "สื่อถึงการเรียกทรัพย์ โชคลาภ และการปกป้องทรัพย์ให้มั่นคง",
      "meaningEn": "Symbolizes wealth attraction, prosperity, and guarding good fortune.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 10
    },
    {
      "id": "px02",
      "sku": "PX02",
      "nameTh": "ปี่เซียะ PX02",
      "nameEn": "Pi Xiu PX02",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px02.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 490,
      "meaningTh": "สื่อถึงโชคลาภ การเปิดรับโอกาสทางการเงิน และพลังคุ้มครอง",
      "meaningEn": "Symbolizes prosperity, financial opportunity, and protective energy.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 20
    },
    {
      "id": "px03",
      "sku": "PX03",
      "nameTh": "ปี่เซียะ PX03",
      "nameEn": "Pi Xiu PX03",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px03.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 590,
      "meaningTh": "สื่อถึงการเรียกทรัพย์ ความมั่นคง และพลังเสริมความสำเร็จ",
      "meaningEn": "Symbolizes wealth calling, stability, and success energy.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 30
    },
    {
      "id": "px04",
      "sku": "PX04",
      "nameTh": "ปี่เซียะ PX04",
      "nameEn": "Pi Xiu PX04",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px04.webp",
      "sizeCm": 2.4,
      "visualScale": 0.98,
      "visualOffsetX": 0.01,
      "visualOffsetY": 0.01,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.98,
      "rotation": 0,
      "anchor": "top",
      "price": 590,
      "meaningTh": "สื่อถึงการปกป้องทรัพย์ การกันพลังลบ และความมั่งคั่งที่มั่นคง",
      "meaningEn": "Symbolizes wealth protection, energetic shielding, and stable abundance.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 40
    },
    {
      "id": "px05",
      "sku": "PX05",
      "nameTh": "ปี่เซียะ PX05",
      "nameEn": "Pi Xiu PX05",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px05.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 690,
      "meaningTh": "สื่อถึงเสน่ห์แห่งโชคลาภ โอกาสใหม่ และพลังสนับสนุนด้านการเงิน",
      "meaningEn": "Symbolizes charm, luck, new opportunity, and financial support.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 50
    },
    {
      "id": "px06",
      "sku": "PX06",
      "nameTh": "ปี่เซียะ PX06",
      "nameEn": "Pi Xiu PX06",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px06.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 690,
      "meaningTh": "สื่อถึงพลังคุ้มครอง ความมั่งคั่ง และการเสริมบารมีในการทำงาน",
      "meaningEn": "Symbolizes protection, prosperity, and empowered career presence.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 60
    },
    {
      "id": "px07",
      "sku": "PX07",
      "nameTh": "ปี่เซียะ PX07",
      "nameEn": "Pi Xiu PX07",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px07.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 790,
      "meaningTh": "สื่อถึงโชคลาภระดับพรีเมียม การเก็บทรัพย์ และความสำเร็จที่มั่นคง",
      "meaningEn": "Symbolizes premium fortune, wealth keeping, and stable success.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 70
    },
    {
      "id": "px08",
      "sku": "PX08",
      "nameTh": "ปี่เซียะ PX08",
      "nameEn": "Pi Xiu PX08",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/pixiu/px08.webp",
      "sizeCm": 2.4,
      "visualScale": 0.95,
      "visualOffsetX": -0.01,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.95,
      "rotation": 0,
      "anchor": "top",
      "price": 790,
      "meaningTh": "สื่อถึงพลังเรียกทรัพย์ ความมั่งคั่ง และการปกป้องโอกาสดี",
      "meaningEn": "Symbolizes wealth attraction, abundance, and protection of good opportunities.",
      "inStock": true,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": true,
      "displayOrder": 80
    },
    {
      "id": "tg01",
      "sku": "TG01",
      "nameTh": "ตะกรุดพระพิฆเนศ เงิน TG01",
      "nameEn": "Takrud Ganesha Silver TG01",
      "type": "takrud_ganesha",
      "collection": "takrud",
      "image": "/assets/charms/takrud/tg01.webp",
      "sizeCm": 3,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 0.98,
      "maxHeightRatio": 1,
      "rotation": 0,
      "anchor": "top",
      "price": 990,
      "meaningTh": "สื่อถึงการเปิดทาง ความสำเร็จ การขจัดอุปสรรค และความมั่นใจในการเริ่มต้น",
      "meaningEn": "Symbolizes removing obstacles, opening paths, success, and confident beginnings.",
      "inStock": true,
      "categoryId": "takrud",
      "footprintMm": 30,
      "isActive": true,
      "displayOrder": 90
    },
    {
      "id": "tg03",
      "sku": "TG03",
      "nameTh": "ตะกรุดพระพิฆเนศ สีเงิน",
      "nameEn": "Ganesha Takrud Silver",
      "type": "takrud_ganesha",
      "collection": "takrud",
      "image": "/assets/charms/takrud/tg03.webp",
      "sizeCm": 3,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 0.98,
      "maxHeightRatio": 1,
      "rotation": 0,
      "anchor": "top",
      "price": 990,
      "meaningTh": "สื่อถึงการคุ้มครอง การเปิดทางเรื่องงาน และการสนับสนุนให้เดินหน้าสู่เป้าหมาย",
      "meaningEn": "Symbolizes protection, career path opening, and support toward goals.",
      "inStock": true,
      "categoryId": "takrud",
      "footprintMm": 30,
      "isActive": true,
      "displayOrder": 100
    },
    {
      "id": "px09",
      "sku": "PX09",
      "nameTh": "ปี่เซียะ PX09",
      "nameEn": "Pi Xiu PX09",
      "type": "pi_xiu",
      "collection": "pixiu",
      "image": "/assets/charms/_placeholder.png",
      "sizeCm": 2.4,
      "visualScale": 0.88,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 0.92,
      "rotation": 0,
      "anchor": "top",
      "price": 890,
      "meaningTh": "สื่อถึงการเรียกทรัพย์ โชคลาภ และการรักษาโอกาสทางการเงินให้มั่นคง",
      "meaningEn": "Symbolizes wealth attraction, prosperity, and steady financial opportunity.",
      "inStock": false,
      "categoryId": "pixiu",
      "footprintMm": 24,
      "isActive": false,
      "displayOrder": 100
    },
    {
      "id": "tg02",
      "sku": "TG02",
      "nameTh": "ตะกรุดพระพิฆเนศ ทอง",
      "nameEn": "Takrud Ganesha Gold",
      "type": "takrud_ganesha",
      "collection": "takrud",
      "image": "/assets/charms/takrud/tg02.webp",
      "sizeCm": 3,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 0.98,
      "maxHeightRatio": 1,
      "rotation": 0,
      "anchor": "top",
      "price": 1290,
      "meaningTh": "สื่อถึงความสำเร็จ บารมี โชคลาภ และการเปิดทางสู่โอกาสที่ดีกว่า",
      "meaningEn": "Symbolizes success, prestige, prosperity, and opening better opportunities.",
      "inStock": true,
      "categoryId": "takrud",
      "footprintMm": 30,
      "isActive": true,
      "displayOrder": 110
    },
    {
      "id": "tl01",
      "sku": "TL01",
      "nameTh": "ตะกรุดพระลักษมี ทอง",
      "nameEn": "Takrud Lakshmi Gold",
      "type": "takrud_lakshmi",
      "collection": "takrud",
      "image": "/assets/charms/_placeholder.png",
      "sizeCm": 3,
      "visualScale": 0.9,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 0.98,
      "maxHeightRatio": 0.88,
      "rotation": 0,
      "anchor": "top",
      "price": 1190,
      "meaningTh": "สื่อถึงความมั่งคั่ง ความอุดมสมบูรณ์ โชคลาภ และพลังสนับสนุนด้านการเงิน",
      "meaningEn": "Symbolizes abundance, prosperity, financial luck, and supportive wealth energy.",
      "inStock": false,
      "categoryId": "takrud",
      "footprintMm": 30,
      "isActive": false,
      "displayOrder": 120
    },
    {
      "id": "bh01",
      "sku": "BH01",
      "nameTh": "บีฮาร์ท สีน้ำเงิน",
      "nameEn": "Bee Heart Blue",
      "type": "bee_heart",
      "collection": "bee-heart",
      "categoryId": "bee-heart",
      "image": "/assets/charms/takrud/bee=blue.webp",
      "sizeCm": 2.7,
      "footprintMm": 2,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 1,
      "edgeFitMode": "horizontal_fill",
      "targetWidthFillRatio": 1,
      "contactInsetLeft": 0.4,
      "contactInsetRight": 0.4,
      "rotation": 0,
      "anchor": "top",
      "price": 990,
      "meaningTh": "สื่อถึงเสน่ห์ เมตตา ความน่ารักน่าเอ็นดู และการสื่อสารที่อ่อนโยน",
      "meaningEn": "Symbolizes charm, kindness, gentle attraction, and soft communication.",
      "inStock": true,
      "isActive": true,
      "displayOrder": 140
    },
    {
      "id": "bh02",
      "sku": "BH02",
      "nameTh": "บีฮาร์ท สีส้ม",
      "nameEn": "Bee Heart Orange",
      "type": "bee_heart",
      "collection": "bee-heart",
      "categoryId": "bee-heart",
      "image": "/assets/charms/takrud/bee-orange.webp",
      "sizeCm": 2.7,
      "footprintMm": 2,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 1,
      "edgeFitMode": "horizontal_fill",
      "targetWidthFillRatio": 1,
      "contactInsetLeft": 0.4,
      "contactInsetRight": 0.4,
      "rotation": 0,
      "anchor": "top",
      "price": 990,
      "meaningTh": "สื่อถึงเสน่ห์ ความสดใส ความมั่นใจ และพลังดึงดูดแบบอบอุ่น",
      "meaningEn": "Symbolizes charm, brightness, confidence, and warm attraction.",
      "inStock": true,
      "isActive": true,
      "displayOrder": 150
    },
    {
      "id": "bh03",
      "sku": "BH03",
      "nameTh": "บีฮาร์ท สีม่วง",
      "nameEn": "Bee Heart Purple",
      "type": "bee_heart",
      "collection": "bee-heart",
      "categoryId": "bee-heart",
      "image": "/assets/charms/takrud/bee-purple.webp",
      "sizeCm": 2.7,
      "footprintMm": 2,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 1,
      "edgeFitMode": "horizontal_fill",
      "targetWidthFillRatio": 1,
      "contactInsetLeft": 0.4,
      "contactInsetRight": 0.4,
      "rotation": 0,
      "anchor": "top",
      "price": 990,
      "meaningTh": "สื่อถึงเสน่ห์ลึกลับ ความเมตตา ความน่าดึงดูด และพลังแห่งความอ่อนโยน",
      "meaningEn": "Symbolizes mysterious charm, kindness, attraction, and gentle energy.",
      "inStock": true,
      "isActive": true,
      "displayOrder": 160
    },
    {
      "id": "cl01",
      "sku": "CL01",
      "slug": "clover-gold",
      "nameTh": "ลคก ใบโคลเวอร นำโชค",
      "nameEn": "Lucky Clover",
      "type": "bee_heart",
      "collection": "clover",
      "categoryId": "clover",
      "entityType": "charm",
      "image": "/assets/charms/clover/cl01.webp",
      "sizeCm": 2.65,
      "footprintMm": 4.2,
      "visualScale": 1,
      "visualOffsetX": 0,
      "visualOffsetY": 0,
      "maxWidthRatio": 1,
      "maxHeightRatio": 1,
      "edgeFitMode": "horizontal_fill",
      "targetWidthFillRatio": 1,
      "contactInsetLeft": 0.4,
      "contactInsetRight": 0.4,
      "rotation": 0,
      "anchor": "top",
      "price": 290,
      "meaningTh": "สอถงโชคลาภ ความสำเรจ และโอกาสดทเขามาในชวต",
      "meaningEn": "Symbolizes luck, success, and positive opportunities.",
      "inStock": true,
      "stockQty": 10,
      "stock_qty": 10,
      "isActive": true,
      "displayOrder": 170
    }
  ];

function cloneLegacyCharmCatalog() {
  return CHARM_CATALOG.map((charm) => ({
    ...charm
  }));
}

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function buildNormalizedCharmFallback(charm, index = 0) {
  const safeSizeCm = toFiniteNumber(charm.sizeCm, 0);
  const displayOrder = toFiniteNumber(charm.displayOrder, (index + 1) * 10);
  const stockQty = normalizeStockQty(charm.stockQty ?? charm.stock_qty, null);

  return {
    id: charm.id,
    entityType: "charm",
    sku: charm.sku || charm.id?.toUpperCase() || `CHARM-${index + 1}`,
    slug: charm.slug || charm.id || `charm-${index + 1}`,
    name: {
      en: charm.nameEn || "",
      th: charm.nameTh || ""
    },
    categoryId: charm.categoryId || charm.collection || charm.type || "charms",
    type: charm.type || null,
    collection: charm.collection || charm.categoryId || null,
    image: {
      primary: charm.image || ""
    },
    pricing: {
      base: Number(charm.price || 0)
    },
    business: {
      sizeCm: safeSizeCm,
      footprintMm: toFiniteNumber(charm.footprintMm, safeSizeCm * 10)
    },
    meaning: {
      en: charm.meaningEn || "",
      th: charm.meaningTh || ""
    },
    availability: {
      inStock: charm.inStock !== false && (stockQty === null || stockQty > 0),
      isActive: charm.isActive !== false,
      stockQty
    },
    renderTuning: {
      visualScale: charm.visualScale,
      visualOffsetX: charm.visualOffsetX,
      visualOffsetY: charm.visualOffsetY,
      maxWidthRatio: charm.maxWidthRatio,
      maxHeightRatio: charm.maxHeightRatio,
      edgeFitMode: charm.edgeFitMode,
      targetWidthFillRatio: charm.targetWidthFillRatio,
      contactInsetLeft: charm.contactInsetLeft,
      contactInsetRight: charm.contactInsetRight,
      rotation: charm.rotation,
      anchor: charm.anchor
    },
    displayOrder
  };
}

function isNormalizedCharmRecord(record) {
  return !!record && (
    record.entityType === "charm" ||
    typeof record.business === "object" ||
    typeof record.renderTuning === "object"
  );
}

function normalizeCharmRecord(record, index = 0) {
  if (!record) return null;
  if (!isNormalizedCharmRecord(record)) {
    return buildNormalizedCharmFallback(record, index);
  }

  const safeRecord = {
    ...record,
    entityType: "charm",
    sku: record.sku || record.id?.toUpperCase() || `CHARM-${index + 1}`,
    slug: record.slug || record.id || `charm-${index + 1}`,
    name: {
      en: record.name?.en || record.nameEn || "",
      th: record.name?.th || record.nameTh || ""
    },
    categoryId: record.categoryId || record.collection || record.type || "charms",
    collection: record.collection || record.categoryId || null,
    image: {
      primary: record.image?.primary || record.image || ""
    },
    pricing: {
      base: toFiniteNumber(record.pricing?.base ?? record.price ?? 0, 0)
    },
  };

  const safeSizeCm = toFiniteNumber(record.business?.sizeCm ?? record.sizeCm ?? 0, 0);
  const safeFootprintMm = toFiniteNumber(
    record.business?.footprintMm ?? record.footprintMm,
    safeSizeCm * 10
  );
  const threadingOccupancyMm = toFiniteNumber(
    record.business?.threadingOccupancyMm ?? record.threadingOccupancyMm,
    0
  );
  const loopWidthMm = toFiniteNumber(record.business?.loopWidthMm ?? record.loopWidthMm, 0);
  const loopHeightMm = toFiniteNumber(record.business?.loopHeightMm ?? record.loopHeightMm, 0);
  const pendantBodyWidthMm = toFiniteNumber(record.business?.pendantBodyWidthMm ?? record.pendantBodyWidthMm, 0);
  const pendantBodyHeightMm = toFiniteNumber(record.business?.pendantBodyHeightMm ?? record.pendantBodyHeightMm, 0);
  const attachmentAnchorFromTopRatio = toFiniteNumber(
    record.business?.attachmentAnchorFromTopRatio ?? record.attachmentAnchorFromTopRatio,
    0
  );
  const thicknessMm = toFiniteNumber(record.business?.thicknessMm ?? record.thicknessMm, 0);
  const stockQty = normalizeStockQty(record.availability?.stockQty ?? record.availability?.stock_qty ?? record.stockQty ?? record.stock_qty, null);

  // Owner-reported 2026-10-11: the CRM form writes status through the nested availability object, but
  // a record that was disabled earlier still carries flat inStock:false / isActive:false at the top
  // level. ANDing both representations let the stale flat copy win forever, so re-enabling a talisman
  // could never be saved. An explicitly present nested value is authoritative; the flat keys are then
  // kept in sync so every reader (CRM, customer catalog, backend payload) agrees.
  const nestedInStock = record.availability && record.availability.inStock !== undefined
    ? record.availability.inStock !== false
    : null;
  const nestedIsActive = record.availability && record.availability.isActive !== undefined
    ? record.availability.isActive !== false
    : null;
  const flatInStock = record.inStock === undefined ? null : record.inStock !== false;
  const flatIsActive = record.isActive === undefined ? null : record.isActive !== false;
  const availabilityInStock = (nestedInStock ?? flatInStock ?? true) && (stockQty === null || stockQty > 0);
  const availabilityIsActive = nestedIsActive ?? flatIsActive ?? true;

  return {
    ...safeRecord,
    inStock: availabilityInStock,
    isActive: availabilityIsActive,
    stockQty,
    stock_qty: stockQty,
    business: {
      sizeCm: safeSizeCm,
      footprintMm: safeFootprintMm,
      threadingOccupancyMm,
      loopWidthMm,
      loopHeightMm,
      pendantBodyWidthMm,
      pendantBodyHeightMm,
      attachmentAnchorFromTopRatio,
      thicknessMm
    },
    meaning: {
      en: record.meaning?.en || record.meaningEn || "",
      th: record.meaning?.th || record.meaningTh || ""
    },
    availability: {
      inStock: availabilityInStock,
      isActive: availabilityIsActive,
      stockQty,
      stock_qty: stockQty
    },
    renderTuning: {
      visualScale: record.renderTuning?.visualScale ?? record.visualScale,
      visualOffsetX: record.renderTuning?.visualOffsetX ?? record.visualOffsetX,
      visualOffsetY: record.renderTuning?.visualOffsetY ?? record.visualOffsetY,
      maxWidthRatio: record.renderTuning?.maxWidthRatio ?? record.maxWidthRatio,
      maxHeightRatio: record.renderTuning?.maxHeightRatio ?? record.maxHeightRatio,
      edgeFitMode: record.renderTuning?.edgeFitMode ?? record.edgeFitMode,
      targetWidthFillRatio: record.renderTuning?.targetWidthFillRatio ?? record.targetWidthFillRatio,
      contactInsetLeft: record.renderTuning?.contactInsetLeft ?? record.contactInsetLeft,
      contactInsetRight: record.renderTuning?.contactInsetRight ?? record.contactInsetRight,
      rotation: record.renderTuning?.rotation ?? record.rotation,
      anchor: record.renderTuning?.anchor ?? record.anchor
    },
    displayOrder: toFiniteNumber(record.displayOrder, (index + 1) * 10)
  };
}

function normalizeSpacerRecord(record, index = 0) {
  if (!record || typeof record !== "object") return null;

  const id = String(record.id || "").trim();
  if (!id) return null;

  const displaySizeMm = toFiniteNumber(record.business?.displaySizeMm ?? record.displaySizeMm ?? record.sizeMm, 0);
  const effectiveLengthMm = toFiniteNumber(record.business?.effectiveLengthMm ?? record.effectiveLengthMm ?? record.footprintMm, displaySizeMm);
  const packingLengthMm = toFiniteNumber(
    record.business?.packingLengthMm ?? record.packingLengthMm,
    effectiveLengthMm
  );
  const visualBounds = Array.isArray(record.business?.visualBounds ?? record.visualBounds)
    ? (record.business?.visualBounds ?? record.visualBounds)
    : null;
  const stockQty = normalizeStockQty(record.availability?.stockQty ?? record.availability?.stock_qty ?? record.stockQty ?? record.stock_qty, null);
  const manualCostValue = record.manualCost;
  const manualCost = manualCostValue === undefined || manualCostValue === null || manualCostValue === ''
    ? null
    : (Number.isFinite(Number(manualCostValue)) && Number(manualCostValue) >= 0 ? Number(manualCostValue) : null);
  const nestedInStock = record.availability && record.availability.inStock !== undefined
    ? record.availability.inStock !== false
    : null;
  const nestedIsActive = record.availability && record.availability.isActive !== undefined
    ? record.availability.isActive !== false
    : null;
  const flatInStock = record.inStock === undefined ? null : record.inStock !== false;
  const flatIsActive = record.isActive === undefined ? null : record.isActive !== false;
  const availabilityInStock = (nestedInStock ?? flatInStock ?? true) && (stockQty === null || stockQty > 0);
  const availabilityIsActive = nestedIsActive ?? flatIsActive ?? true;

  return {
    id,
    entityType: "spacer",
    inStock: availabilityInStock,
    isActive: availabilityIsActive,
    stockQty,
    stock_qty: stockQty,
    sku: record.sku || id.toUpperCase(),
    slug: record.slug || id,
    name: {
      en: record.name?.en || record.nameEn || "",
      th: record.name?.th || record.nameTh || record.name?.en || record.nameEn || ""
    },
    categoryId: record.categoryId || record.collection || "spacer",
    type: record.type || "spacer",
    collection: record.collection || "spacer",
    color: record.color || "",
    manualCost,
    presentation: record.presentation || 'inline',
    image: {
      primary: record.image?.primary || record.image || ""
    },
    pricing: {
      base: toFiniteNumber(record.pricing?.base ?? record.price ?? 0, 0)
    },
    business: {
      sizeMm: displaySizeMm,
      displaySizeMm,
      effectiveLengthMm,
      packingLengthMm,
      renderWidthMm: toFiniteNumber(record.business?.renderWidthMm ?? record.renderWidthMm, 0),
      renderHeightMm: toFiniteNumber(record.business?.renderHeightMm ?? record.renderHeightMm, 0),
      attachmentLoopMm: toFiniteNumber(record.business?.attachmentLoopMm ?? record.attachmentLoopMm, 0),
      renderSizeMm: toFiniteNumber(record.business?.renderSizeMm ?? record.renderSizeMm, displaySizeMm),
      thicknessMm: toFiniteNumber(record.business?.thicknessMm ?? record.thicknessMm, 0),
      visualBounds
    },
    meaning: {
      en: record.meaning?.en || record.description || record.meaningEn || "",
      th: record.meaning?.th || record.descriptionTh || record.meaningTh || ""
    },
    availability: {
      inStock: availabilityInStock,
      isActive: availabilityIsActive,
      stockQty,
      stock_qty: stockQty
    },
    displayOrder: toFiniteNumber(record.displayOrder, (index + 1) * 10)
  };
}

export function adaptNormalizedCharmToLegacy(record) {
  if (!record) return null;

  const normalized = normalizeCharmRecord(record);
  if (!normalized) return null;

  return {
    id: normalized.id,
    sku: normalized.sku,
    nameTh: normalized.name.th,
    nameEn: normalized.name.en,
    type: normalized.type,
    collection: normalized.collection,
    image: normalized.image.primary,
    sizeCm: normalized.business.sizeCm,
    footprintMm: normalized.business.footprintMm,
    threadingOccupancyMm: normalized.business.threadingOccupancyMm,
    loopWidthMm: normalized.business.loopWidthMm,
    loopHeightMm: normalized.business.loopHeightMm,
    pendantBodyWidthMm: normalized.business.pendantBodyWidthMm,
    pendantBodyHeightMm: normalized.business.pendantBodyHeightMm,
    attachmentAnchorFromTopRatio: normalized.business.attachmentAnchorFromTopRatio,
    thicknessMm: normalized.business.thicknessMm,
    attachmentAnchor: normalized.attachmentAnchor,
    threadingAxis: normalized.threadingAxis,
    price: normalized.pricing.base,
    meaningTh: normalized.meaning.th,
    meaningEn: normalized.meaning.en,
    inStock: normalized.availability.inStock,
    isActive: normalized.availability.isActive,
    stockQty: normalized.availability.stockQty,
    displayOrder: normalized.displayOrder,
    visualScale: normalized.renderTuning.visualScale,
    visualOffsetX: normalized.renderTuning.visualOffsetX,
    visualOffsetY: normalized.renderTuning.visualOffsetY,
    maxWidthRatio: normalized.renderTuning.maxWidthRatio,
    maxHeightRatio: normalized.renderTuning.maxHeightRatio,
    edgeFitMode: normalized.renderTuning.edgeFitMode,
    targetWidthFillRatio: normalized.renderTuning.targetWidthFillRatio,
    contactInsetLeft: normalized.renderTuning.contactInsetLeft,
    contactInsetRight: normalized.renderTuning.contactInsetRight,
    rotation: normalized.renderTuning.rotation,
    anchor: normalized.renderTuning.anchor
  };
}

export function adaptNormalizedCharmCatalogToLegacy(records = []) {
  return records
    .map((record) => adaptNormalizedCharmToLegacy(record))
    .filter(Boolean)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

// --- In-memory cache ---
export let STONES = [];
export const LANDING_BRACELET_COUNT_FALLBACK = 1350;
export function normalizeLandingBraceletCount(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

export let SETTINGS = {
  globalDiscountPercent: 20,
  discountEnabled: true,
  showDiscountBanner: true,
  landingBraceletCount: LANDING_BRACELET_COUNT_FALLBACK
};
export let ORDERS = [];
export let CHARM_RECORDS = [];
export let SPACER_RECORDS = [];
let ordersFetchSequence = 0;
let committedOrdersFetchSequence = 0;
let ordersMutationRevision = 0;
let settingsFetchSequence = 0;
let committedSettingsFetchSequence = 0;
let settingsMutationRevision = 0;

// --- Price calculation helper based on bead size ---
export function getStonePriceForSize(stone, size) {
  if (!stone) return 0;
  const sz = parseInt(size);
  if (sz === 4) return stone.p4 !== undefined ? stone.p4 : (stone.price || 0);
  if (sz === 10 || sz === 8) return stone.p10 !== undefined ? stone.p10 : (stone.p8 ?? stone.price ?? 0);
  return stone.p6 !== undefined ? stone.p6 : (stone.price || 0); // default to 6mm
}

// --- Asynchronous API Helpers ---

export async function refreshCatalog() {
  await refreshCategoryCatalog();

  // Try fetching from the API first (when backend is available)
  try {
    const res = await fetch("/api/stones");
    if (res.ok) {
      const loaded = await res.json();
      const normalized = Array.isArray(loaded)
        ? loaded.map((record, index) => normalizeStoneRecord(record, index)).filter(Boolean)
        : [];
      STONES.length = 0;
      STONES.push(...normalized);
      return STONES;
    }
  } catch (e) {
    console.warn("API fetch failed, falling back to local data", e);
  }

  // Fallback: load static JSON bundled with the app
  try {
    const localRes = await fetch("/data/stones.json");
    if (localRes.ok) {
      const localData = await localRes.json();
      const normalized = Array.isArray(localData)
        ? localData.map((record, index) => normalizeStoneRecord(record, index)).filter(Boolean)
        : [];
      STONES.length = 0;
      STONES.push(...normalized);
      return STONES;
    }
  } catch (e) {
    console.error("Failed to load local stones data", e);
  }

  console.warn("Unable to load stones data from any source");
  return STONES;
}

export async function refreshCategoryCatalog() {
  try {
    const settings = await getSharedSettings();
    const loaded = Array.isArray(settings.catalogCategories) && settings.catalogCategories.length > 0
      ? settings.catalogCategories
      : getDefaultCategoryRecords();
    const normalized = normalizeCategoryCatalog(loaded);
    CATEGORY_RECORDS.length = 0;
    CATEGORY_RECORDS.push(...normalized);
    syncLegacyCategoryMap(CATEGORY_RECORDS);
    return CATEGORY_RECORDS;
  } catch (e) {
    console.warn("Failed to load category catalog, using defaults", e);
  }

  const fallback = getDefaultCategoryRecords();
  CATEGORY_RECORDS.length = 0;
  CATEGORY_RECORDS.push(...fallback);
  syncLegacyCategoryMap(CATEGORY_RECORDS);
  return CATEGORY_RECORDS;
}

export async function getSharedCategoryCatalog(entityType = "all") {
  if (CATEGORY_RECORDS.length === 0) {
    await refreshCategoryCatalog();
  }

  if (entityType === "all") {
    return CATEGORY_RECORDS;
  }

  return CATEGORY_RECORDS.filter((record) => record.entityType === entityType);
}

export async function saveSharedCategoryCatalogEntry(record) {
  const normalizedRecord = normalizeCategoryRecord(record);
  if (!normalizedRecord || !normalizedRecord.id) return null;

  const currentCatalog = await getSharedCategoryCatalog("all");
  const nextCatalog = currentCatalog.slice();
  const existingIndex = nextCatalog.findIndex((entry) => entry.id === normalizedRecord.id);
  if (existingIndex >= 0) {
    nextCatalog[existingIndex] = normalizedRecord;
  } else {
    nextCatalog.push(normalizedRecord);
  }
  nextCatalog.sort(sortCategoryRecords);

  const settings = await getSharedSettings();
  const savedSettings = await saveSharedSettings({
    ...settings,
    catalogCategories: nextCatalog
  });

  if (JSON.stringify(savedSettings?.catalogCategories || []) !== JSON.stringify(nextCatalog)) {
    return null;
  }

  await refreshCategoryCatalog();
  return CATEGORY_RECORDS.find((entry) => entry.id === normalizedRecord.id) || normalizedRecord;
}

export async function deleteSharedCategoryCatalogEntry(categoryId) {
  if (!categoryId) return false;

  const currentCatalog = await getSharedCategoryCatalog("all");
  const nextCatalog = currentCatalog.filter((entry) => entry.id !== categoryId);
  if (nextCatalog.length === currentCatalog.length) return false;

  const settings = await getSharedSettings();
  const savedSettings = await saveSharedSettings({
    ...settings,
    catalogCategories: nextCatalog
  });

  if (JSON.stringify(savedSettings?.catalogCategories || []) !== JSON.stringify(nextCatalog)) {
    return false;
  }

  await refreshCategoryCatalog();
  return true;
}

export async function refreshCharmCatalog() {
  try {
    const res = await fetch("/api/charms");
    if (res.ok) {
      const loaded = await res.json();
      const normalized = Array.isArray(loaded)
        ? loaded.map((record, index) => normalizeCharmRecord(record, index)).filter(Boolean)
        : [];
      CHARM_RECORDS.length = 0;
      CHARM_RECORDS.push(...normalized);
      return CHARM_RECORDS;
    }
  } catch (e) {
    console.warn("Failed to load charm catalog from API, falling back to bundled source", e);
  }

  try {
    const res = await fetch("/data/charms.json");
    if (res.ok) {
      const loaded = await res.json();
      const normalized = Array.isArray(loaded)
        ? loaded.map((record, index) => normalizeCharmRecord(record, index)).filter(Boolean)
        : [];
      CHARM_RECORDS.length = 0;
      CHARM_RECORDS.push(...normalized);
      return CHARM_RECORDS;
    }
  } catch (e) {
    console.warn("Failed to load bundled charm catalog, falling back to bundled legacy charms", e);
  }

  const fallbackRecords = cloneLegacyCharmCatalog()
    .map((record, index) => buildNormalizedCharmFallback(record, index))
    .filter(Boolean);
  CHARM_RECORDS.length = 0;
  CHARM_RECORDS.push(...fallbackRecords);
  return CHARM_RECORDS;
}

export async function getSharedCatalog() {
  await refreshCatalog();
  return STONES;
}

export async function getSharedCharmCatalog() {
  if (CHARM_RECORDS.length === 0) {
    await refreshCharmCatalog();
  }
  return CHARM_RECORDS;
}

export async function refreshSpacerCatalog() {
  try {
    const res = await fetch("/api/spacers");
    if (res.ok) {
      const loaded = await res.json();
      const normalized = Array.isArray(loaded)
        ? loaded.map((record, index) => normalizeSpacerRecord(record, index)).filter(Boolean)
        : [];
      if (normalized.length > 0) {
        SPACER_RECORDS.length = 0;
        SPACER_RECORDS.push(...normalized);
        return SPACER_RECORDS;
      }
    }
  } catch (e) {
    console.warn("Failed to load spacer catalog from API, falling back to bundled source", e);
  }

  const normalized = SPACER_CATALOG
    .map((record, index) => normalizeSpacerRecord(record, index))
    .filter(Boolean)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  SPACER_RECORDS.length = 0;
  SPACER_RECORDS.push(...normalized);
  return SPACER_RECORDS;
}

let lastSpacerSaveError = "";
export function getLastSpacerSaveError() {
  return lastSpacerSaveError;
}

export async function saveSharedSpacerCatalogEntry(record) {
  const normalizedRecord = normalizeSpacerRecord(record);
  lastSpacerSaveError = "";
  if (!normalizedRecord || !normalizedRecord.id) {
    lastSpacerSaveError = "A charm ID is required.";
    return null;
  }

  try {
    const res = await fetch(`/api/spacers/${encodeURIComponent(normalizedRecord.id)}`, {
      method: "PUT",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(normalizedRecord)
    });
    if (res.ok) {
      const savedRecord = normalizeSpacerRecord(await res.json());
      await refreshSpacerCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return savedRecord;
    }
    const payload = await res.json().catch(() => ({}));
    lastSpacerSaveError = payload.error || `The charm could not be saved (HTTP ${res.status}).`;
  } catch (e) {
    console.error("Failed to save spacer to API", e);
    lastSpacerSaveError = "The charm could not be saved because the server could not be reached.";
  }
  return null;
}

export async function getSharedSpacerCatalog() {
  if (SPACER_RECORDS.length === 0) {
    await refreshSpacerCatalog();
  }
  return SPACER_RECORDS;
}

// First-paint catalog seed. The deployment ships its own catalog JSON under /data (same-origin,
// CDN-served), so this fills the in-memory catalogs far faster than the /api backend, which can
// cold-start for several seconds. It never overwrites data an authoritative /api refresh already
// produced: every array is only filled while it is still empty.
let bundledCatalogSeedPromise = null;
export async function seedCatalogFromBundledFiles() {
  if (bundledCatalogSeedPromise) return bundledCatalogSeedPromise;
  bundledCatalogSeedPromise = (async () => {
    const load = async (file) => {
      try {
        const response = await fetch(file, { cache: 'force-cache' });
        if (!response.ok) return null;
        const payload = await response.json();
        return Array.isArray(payload) ? payload : null;
      } catch {
        return null;
      }
    };
    const [stones, charms, spacers] = await Promise.all([
      load('/data/stones.json'),
      load('/data/charms.json'),
      load('/data/spacers.json')
    ]);
    if (stones && STONES.length === 0) {
      STONES.length = 0;
      STONES.push(...stones.map((record, index) => normalizeStoneRecord(record, index)).filter(Boolean));
    }
    if (charms && CHARM_RECORDS.length === 0) {
      CHARM_RECORDS.length = 0;
      CHARM_RECORDS.push(...charms.map((record, index) => normalizeCharmRecord(record, index)).filter(Boolean));
    }
    if (spacers && SPACER_RECORDS.length === 0) {
      SPACER_RECORDS.length = 0;
      SPACER_RECORDS.push(...spacers.map((record, index) => normalizeSpacerRecord(record, index)).filter(Boolean));
    }
    return true;
  })().catch(() => false);
  return bundledCatalogSeedPromise;
}
export async function getLegacyCharmCatalog() {
  const sharedCharms = await getSharedCharmCatalog();
  return adaptNormalizedCharmCatalogToLegacy(sharedCharms);
}

// The talisman write path must not rely on the customer-visible catalog to decide whether a record
// already exists. Hidden/inactive records can be missing from that list (and when /api/charms is
// unreachable the list is the bundled snapshot, which can drift from the stored catalog), so an
// edit of such a record used to be sent as POST /api/charms and refused with 409 - a failure the
// CRM swallowed. The server response is authoritative here: 409 means the id is already stored
// (update that exact record), 404 means it is gone.
let lastCharmSaveError = "";

/** Human-readable reason the last charm save failed; empty after a successful save. */
export function getLastCharmSaveError() {
  return lastCharmSaveError;
}

function describeCharmSaveFailure(status, charmId) {
  if (status === 404) return `This talisman is no longer in the catalog. Reload the page and try again.`;
  if (status === 409) return `Talisman ID '${charmId}' already exists in the catalog. Open it from the talisman list to edit it.`;
  if (status === 401 || status === 403) return "Your admin session or CSRF token is no longer valid. Sign in again and retry.";
  if (status === 400) return "The server rejected these talisman details. Check the Thai text and the required fields.";
  return `The talisman could not be saved (HTTP ${status}).`;
}

async function readCharmSaveFailureDetail(res) {
  const body = await res.json().catch(() => null);
  return String(body?.error || body?.message || "").trim();
}

export async function saveSharedCharmCatalogEntry(record, options = {}) {
  const normalizedRecord = normalizeCharmRecord(record);
  lastCharmSaveError = "";
  if (!normalizedRecord || !normalizedRecord.id) {
    lastCharmSaveError = "A talisman ID is required.";
    return null;
  }

  const charmId = normalizedRecord.id;
  // An explicit mode is authoritative: the CRM knows whether it opened the form for an existing
  // record. Without one, fall back to the visible catalog.
  const explicitMode = options.mode === "update" || options.mode === "create" ? options.mode : null;
  const knownExisting = explicitMode
    ? explicitMode === "update"
    : (await getSharedCharmCatalog()).some((entry) => entry.id === charmId);

  const write = (method, payload) => fetch(
    method === "PUT" ? `/api/charms/${encodeURIComponent(charmId)}` : "/api/charms",
    {
      method,
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    }
  );

  try {
    let res = await write(knownExisting ? "PUT" : "POST", normalizedRecord);

    // The server already stores this id even though the visible catalog did not list it. Retry
    // against that exact id, carrying the stored record's protected fields (render tuning, image,
    // footprint) so the update cannot silently blank them out.
    if (!knownExisting && res.status === 409) {
      const authoritative = (await refreshCharmCatalog()).find((entry) => entry.id === charmId);
      if (!authoritative) {
        lastCharmSaveError = describeCharmSaveFailure(409, charmId);
        return null;
      }
      res = await write("PUT", {
        ...authoritative,
        ...normalizedRecord,
        id: charmId,
        renderTuning: authoritative.renderTuning || normalizedRecord.renderTuning
      });
    }

    if (!res.ok) {
      const detail = await readCharmSaveFailureDetail(res);
      lastCharmSaveError = detail
        ? `${describeCharmSaveFailure(res.status, charmId)} (${detail})`
        : describeCharmSaveFailure(res.status, charmId);
      return null;
    }

    const savedRecord = normalizeCharmRecord(await res.json());
    await refreshCharmCatalog();
    window.dispatchEvent(new Event("storage_sync"));
    return savedRecord;
  } catch (e) {
    console.error("Failed to save charm to API", e);
    lastCharmSaveError = "The talisman could not be saved because the server could not be reached.";
  }
  return null;
}

export async function deleteSharedCharmCatalogEntry(charmId) {
  if (!charmId) return false;

  try {
    const res = await fetch(`/api/charms/${encodeURIComponent(charmId)}`, {
      method: "DELETE",
      headers: crmAdminHeaders()
    });
    if (res.ok) {
      await refreshCharmCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return true;
    }
  } catch (e) {
    console.error("Failed to delete charm from API", e);
  }

  try {
    const fallbackRes = await fetch("/api/charms/delete", {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: charmId })
    });
    if (fallbackRes.ok) {
      await refreshCharmCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return true;
    }
  } catch (e) {
    console.error("Failed to delete charm from POST fallback API", e);
  }

  return false;
}

let lastStoneSaveError = "";
export function getLastStoneSaveError() {
  return lastStoneSaveError;
}

export async function saveSharedCatalog(stone) {
  lastStoneSaveError = "";
  try {
    const normalizedStone = normalizeStoneRecord(stone);
    const res = await fetch("/api/stones/save", {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(normalizedStone || stone)
    });
    if (res.ok) {
      await refreshCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return await res.json();
    }
    const payload = await res.json().catch(() => ({}));
    lastStoneSaveError = payload.error || `The stone could not be saved (HTTP ${res.status}).`;
  } catch (e) {
    console.error("Failed to save stone to API", e);
    lastStoneSaveError = "The stone could not be saved because the server could not be reached.";
  }
  return null;
}

async function parseApiJsonResponse(response) {
  const rawText = await response.text();
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    return { payload: null, rawText: "" };
  }

  try {
    return {
      payload: JSON.parse(trimmedText),
      rawText
    };
  } catch {
    return {
      payload: null,
      rawText,
      parseError: true
    };
  }
}

export async function deleteSharedCatalog(stoneId) {
  if (!stoneId) {
    return { success: false, error: "Missing stone ID." };
  }

  const request = {
    label: "POST /api/stones/delete",
    url: "/api/stones/delete",
    options: {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: stoneId })
    }
  };

  let lastError = "Stone delete failed.";

  try {
    const res = await fetch(request.url, request.options);
    const { payload, parseError, rawText } = await parseApiJsonResponse(res);
    if (res.ok && payload?.success === true) {
      await refreshCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return { success: true, id: stoneId };
    }

    if (parseError) {
      const statusLabel = res.status ? `HTTP ${res.status}` : "unknown status";
      const snippet = rawText ? rawText.slice(0, 120).replace(/\s+/g, " ") : "";
      lastError = snippet
        ? `${request.label} returned non-JSON (${statusLabel}): ${snippet}`
        : `${request.label} returned non-JSON (${statusLabel}).`;
    } else {
      lastError = payload?.error || `${request.label} failed.`;
    }
  } catch (e) {
    lastError = e?.message || `${request.label} failed.`;
    console.error(`Failed to delete stone via ${request.label}`, e);
  }

  return { success: false, error: lastError };
}

export async function getSharedSettings() {
  const requestSequence = ++settingsFetchSequence;
  const mutationRevisionAtStart = settingsMutationRevision;
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (res.ok) {
      const loaded = await res.json();
      if (requestSequence < committedSettingsFetchSequence || mutationRevisionAtStart !== settingsMutationRevision) {
        return SETTINGS;
      }
      SETTINGS = {
        ...loaded,
        landingBraceletCount: normalizeLandingBraceletCount(loaded?.landingBraceletCount) ?? LANDING_BRACELET_COUNT_FALLBACK
      };
      committedSettingsFetchSequence = requestSequence;
      return SETTINGS;
    }
  } catch (e) {
    console.error("Failed to fetch settings from API", e);
  }
  return SETTINGS;
}

export async function getSharedCatalogLayoutOrder() {
  return refreshCatalogLayoutOrder();
}

export async function refreshCatalogLayoutOrder() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) {
      throw new Error(`GET /api/settings failed with HTTP ${res.status}`);
    }
    const settings = await res.json();
    SETTINGS = settings;
    const normalized = normalizeCatalogLayoutOrder(settings?.catalogLayoutOrder || {});
    saveCatalogLayoutOrder(normalized);
    return normalized;
  } catch (e) {
    console.warn("Failed to refresh shared catalog layout order; using local cache.", e);
  }

  return getCatalogLayoutOrder();
}

export async function saveSharedSettings(newSettings) {
  const normalizedLandingCount = normalizeLandingBraceletCount(newSettings?.landingBraceletCount);
  if (normalizedLandingCount === null) return null;
  const payload = {
    ...newSettings,
    landingBraceletCount: normalizedLandingCount
  };
  settingsMutationRevision += 1;
  try {
    const res = await fetch("/api/settings/save", {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const saved = await res.json();
      const savedLandingCount = normalizeLandingBraceletCount(saved?.landingBraceletCount);
      if (savedLandingCount !== normalizedLandingCount) return null;
      SETTINGS = {
        ...saved,
        landingBraceletCount: savedLandingCount
      };
      window.dispatchEvent(new Event("storage_sync"));
      return SETTINGS;
    }
  } catch (e) {
    console.error("Failed to save settings to API", e);
  }
  return null;
}

export async function saveSharedCatalogLayoutOrder(order = {}) {
  const normalized = normalizeCatalogLayoutOrder(order);
  saveCatalogLayoutOrder(normalized);

  let currentSettings;
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) {
      throw new Error(`GET /api/settings failed with HTTP ${res.status}`);
    }
    currentSettings = await res.json();
  } catch (e) {
    console.error("Failed to load settings before saving catalog layout order", e);
    throw e;
  }

  const nextSettings = {
    ...(currentSettings && typeof currentSettings === "object" ? currentSettings : {}),
    catalogLayoutOrder: normalized
  };

  try {
    const res = await fetch("/api/settings/save", {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(nextSettings)
    });
    if (!res.ok) {
      throw new Error(`POST /api/settings/save failed with HTTP ${res.status}`);
    }
    const savedSettings = await res.json();
    SETTINGS = savedSettings;
    const savedOrder = normalizeCatalogLayoutOrder(savedSettings?.catalogLayoutOrder || {});
    saveCatalogLayoutOrder(savedOrder);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage_sync"));
    }
    return savedOrder;
  } catch (e) {
    console.error("Failed to save shared catalog layout order", e);
    throw e;
  }
}

// SECURITY HOTFIX 2026-10-09: the full order collection is no longer publicly readable.
// Callers must supply the entitlement they already hold: a Stripe checkout session id, or an
// order id plus the signed access token that arrived with the order link (?t=...).
export async function getSharedOrders({ sessionId = "", orderId = "", token = "" } = {}) {
  try {
    // SECURITY HOTFIX: if the caller does not pass an entitlement, derive it from the current page.
    // Legitimate flows are the Stripe return (?session_id=...) and an order link (?orderId=...&t=...).
    let entitlementSession = sessionId;
    let entitlementOrderId = orderId;
    let entitlementToken = token;
    if (!entitlementSession && !entitlementOrderId) {
      try {
        const pageParams = new URLSearchParams(window.location.search);
        entitlementSession = pageParams.get('session_id') || pageParams.get('sessionId') || '';
        entitlementOrderId = pageParams.get('orderId') || '';
        entitlementToken = pageParams.get('t') || '';
      } catch (error) { /* ignore */ }
    }
    if (entitlementOrderId && !entitlementToken) {
      // Legacy link without a signed token: reauthorize with the customer's LINE identity.
      const reauthorized = await reauthorizeOrderAccess(entitlementOrderId);
      const match = Array.isArray(reauthorized?.orders) ? reauthorized.orders.find((entry) => entry.id === entitlementOrderId) : null;
      if (match?.token) {
        entitlementToken = match.token;
      } else {
        // Outside LINE, or LINE could not verify the customer: never fetch with a tokenless order id.
        console.warn('Order link requires a signed access token or a LINE-verified session.');
        return [];
      }
    }
    const params = new URLSearchParams();
    if (entitlementSession) params.set("session_id", entitlementSession);
    else if (entitlementOrderId) { params.set("orderId", entitlementOrderId); if (entitlementToken) params.set("t", entitlementToken); }
    else { console.warn("getSharedOrders requires sessionId or orderId (public order collection is disabled)"); return []; }
    const res = await fetch("/api/orders?" + params.toString());
    if (res.ok) {
      const loaded = await res.json();
      ORDERS = loaded;
      return ORDERS;
    }
  } catch (e) {
    console.error("Failed to fetch orders from API", e);
  }
  return ORDERS;
}

export async function getSharedCrmOrders() {
  const requestSequence = ++ordersFetchSequence;
  const mutationRevisionAtStart = ordersMutationRevision;
  try {
    const res = await fetch("/api/crm/orders", { headers: crmAdminHeaders(), cache: "no-store" });
    if (res.ok) {
      const loaded = await res.json();
      if (requestSequence < committedOrdersFetchSequence || mutationRevisionAtStart !== ordersMutationRevision) {
        return ORDERS;
      }
      ORDERS = Array.isArray(loaded)
        ? loaded
        : (Array.isArray(loaded?.orders) ? loaded.orders : []);
      committedOrdersFetchSequence = requestSequence;
      return ORDERS;
    }
  } catch (e) {
    console.error("Failed to fetch CRM orders from API", e);
  }
  return ORDERS;
}

export async function getCrmOverview() {
  const res = await fetch('/api/crm/overview', { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error(`GET /api/crm/overview failed with HTTP ${res.status}`);
  return res.json();
}

export async function getCrmOrderPage(page = 1, limit = 20) {
  // TURN 10.1: the order cards need their saved bracelet preview, but transferring 20 inline base64
  // snapshots on every list page cost ~246 KB per page. The CRM now asks for `previewMode=url`: the list
  // carries a small authenticated URL per order and the browser fetches the image lazily and caches it
  // immutably.
  const params = new URLSearchParams({ page: String(page), limit: String(limit), previewMode: 'url' });
  const res = await fetch(`/api/crm/orders?${params.toString()}`, { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error(`GET /api/crm/orders failed with HTTP ${res.status}`);
  const payload = await res.json();
  // Deployment-order safety: an older backend ignores the unknown parameter and answers without the
  // `previewTransport` marker, which would leave every card without its saved preview. In that case ask
  // once more in the legacy form. Once the backend is upgraded the marker is present and the extra
  // request never happens.
  if (payload && payload.previewTransport !== 'url') {
    const legacyParams = new URLSearchParams({ page: String(page), limit: String(limit), includePreview: '1' });
    const legacyRes = await fetch(`/api/crm/orders?${legacyParams.toString()}`, { headers: crmAdminHeaders() });
    if (legacyRes.ok) return legacyRes.json();
  }
  return payload;
}

export async function getCrmOrderDetail(orderId) {
  const res = await fetch(`/api/crm/orders/${encodeURIComponent(orderId)}`, { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error(`GET /api/crm/orders/:id failed with HTTP ${res.status}`);
  return normalizeCrmOrderDetailResponse(await res.json());
}

export async function addSharedOrder(orderData) {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData)
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const error = new Error(payload.error || `Order save failed with HTTP ${res.status}`);
      error.status = res.status;
      error.stockIssues = payload.stockIssues || [];
      throw error;
    }
    if (res.ok) {
      const newOrder = await res.json();
      await getSharedOrders();
      window.dispatchEvent(new Event("storage_sync"));
      return newOrder;
    }
  } catch (e) {
    console.error("Failed to add order to API", e);
  }
  return null;
}

export async function updateOrderStatus(orderId, newStatus, updates = {}) {
  ordersMutationRevision += 1;
  try {
    const res = await fetch("/api/orders/update-status", {
      method: "POST",
      headers: crmAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: orderId, status: newStatus, ...updates })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: payload.error || `Order update failed with HTTP ${res.status}.` };
    }
    const savedOrder = payload?.order;
    const persistedTracking = String(savedOrder?.trackingNumber || savedOrder?.trackingNo || "").trim();
    const requestedTracking = Object.prototype.hasOwnProperty.call(updates, "trackingNumber")
      ? String(updates.trackingNumber || "").trim()
      : persistedTracking;
    const persistedCarrier = String(savedOrder?.shippingCarrier || "").trim();
    const requestedCarrier = Object.prototype.hasOwnProperty.call(updates, "shippingCarrier")
      ? String(updates.shippingCarrier || "").trim()
      : persistedCarrier;
    const persistedCustomCarrier = String(savedOrder?.shippingCarrierCustom || "").trim();
    const requestedCustomCarrier = Object.prototype.hasOwnProperty.call(updates, "shippingCarrierCustom")
      ? String(updates.shippingCarrierCustom || "").trim()
      : persistedCustomCarrier;
    if (
      !payload?.success ||
      !savedOrder ||
      savedOrder.id !== orderId ||
      savedOrder.status !== newStatus ||
      persistedTracking !== requestedTracking ||
      persistedCarrier !== requestedCarrier ||
      persistedCustomCarrier !== requestedCustomCarrier
    ) {
      return { success: false, error: "The server did not confirm the saved order status and tracking number." };
    }
    window.dispatchEvent(new Event("storage_sync"));
    return { success: true, order: savedOrder, notification: payload.notification || null };
  } catch (e) {
    console.error("Failed to update order status to API", e);
  }
  return { success: false, error: "Unable to reach the order service." };
}

export async function getSharedPurchaseEntries() {
  const res = await fetch('/api/purchases', { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error('Unable to load purchase history.');
  return res.json();
}

export async function getSharedStonePurchaseCostSummaries() {
  const res = await fetch('/api/purchase-costs/stones', { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error('Unable to load stone purchase costs.');
  return res.json();
}

export async function getSharedPurchaseCostSummaries() {
  const res = await fetch('/api/purchase-costs', { headers: crmAdminHeaders() });
  if (!res.ok) throw new Error('Unable to load purchase costs.');
  return res.json();
}

export async function savePurchaseEntry(entry, id = '') {
  const res = await fetch(id ? `/api/purchases/${encodeURIComponent(id)}` : '/api/purchases', {
    method: id ? 'PUT' : 'POST', headers: crmAdminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(entry)
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Unable to save purchase entry.');
  return res.json();
}

export async function deletePurchaseEntry(id) {
  const res = await fetch(`/api/purchases/${encodeURIComponent(id)}`, { method: 'DELETE', headers: crmAdminHeaders() });
  if (!res.ok) throw new Error('Unable to delete purchase entry.');
}
