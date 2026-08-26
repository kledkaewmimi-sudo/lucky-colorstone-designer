// ==========================================
// LUCKY.COLORSTONE - Shared Database & Sync Layer (REST API)
// ==========================================

const CANONICAL_CATEGORY_LABELS = {
  all: { en: "All", th: "ทั้งหมด" },
  wealth: { en: "Wealth & Luck", th: "โชคลาภ/การงาน" },
  love: { en: "Love & Healing", th: "ความรัก/เมตตา" },
  calm: { en: "Calm & Wisdom", th: "สงบ/สติปัญญา" },
  protection: { en: "Protection", th: "ปกป้อง/คุ้มครอง" },
  pixiu: { en: "Pi Xiu", th: "ปี่เซียะ" },
  takrud: { en: "Takrud", th: "ตะกรุด" }
};

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
    inStock: record.inStock !== false && (stockQty === null || stockQty > 0),
    isActive: record.isActive !== false
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
    price: 0,
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
    price: 0,
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
    price: 0,
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
    price: 0,
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
    price: 120,
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
    price: 0,
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
    price: 0,
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
    price: 0,
    description: "Flat silver flower spacer",
    inStock: true,
    displayOrder: 70
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
  const stockQty = normalizeStockQty(record.availability?.stockQty ?? record.availability?.stock_qty ?? record.stockQty ?? record.stock_qty, null);

  return {
    ...safeRecord,
    business: {
      sizeCm: safeSizeCm,
      footprintMm: safeFootprintMm
    },
    meaning: {
      en: record.meaning?.en || record.meaningEn || "",
      th: record.meaning?.th || record.meaningTh || ""
    },
    availability: {
      inStock: record.availability?.inStock !== false && record.inStock !== false && (stockQty === null || stockQty > 0),
      isActive: record.availability?.isActive !== false && record.isActive !== false,
      stockQty
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
  const stockQty = normalizeStockQty(record.availability?.stockQty ?? record.availability?.stock_qty ?? record.stockQty ?? record.stock_qty, null);
  const manualCostValue = record.manualCost;
  const manualCost = manualCostValue === undefined || manualCostValue === null || manualCostValue === ''
    ? null
    : (Number.isFinite(Number(manualCostValue)) && Number(manualCostValue) >= 0 ? Number(manualCostValue) : null);

  return {
    id,
    entityType: "spacer",
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
      renderSizeMm: toFiniteNumber(record.business?.renderSizeMm ?? record.renderSizeMm, displaySizeMm),
      thicknessMm: toFiniteNumber(record.business?.thicknessMm ?? record.thicknessMm, 0)
    },
    meaning: {
      en: record.meaning?.en || record.description || record.meaningEn || "",
      th: record.meaning?.th || record.descriptionTh || record.meaningTh || ""
    },
    availability: {
      inStock: record.availability?.inStock !== false && record.inStock !== false && (stockQty === null || stockQty > 0),
      isActive: record.availability?.isActive !== false && record.isActive !== false,
      stockQty
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
export let SETTINGS = { globalDiscountPercent: 20, discountEnabled: true, showDiscountBanner: true };
export let ORDERS = [];
export let CHARM_RECORDS = [];
export let SPACER_RECORDS = [];

// --- Price calculation helper based on bead size ---
export function getStonePriceForSize(stone, size) {
  const sz = Number(size);
  const field = sz === 4 ? 'p4' : sz === 6 ? 'p6' : sz === 10 ? 'p10' : null;
  const price = field ? Number(stone?.[field]) : NaN;
  return Number.isFinite(price) && price >= 0 ? price : null;
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

export async function saveSharedSpacerCatalogEntry(record) {
  const normalizedRecord = normalizeSpacerRecord(record);
  if (!normalizedRecord || !normalizedRecord.id) return null;

  try {
    const res = await fetch(`/api/spacers/${encodeURIComponent(normalizedRecord.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedRecord)
    });
    if (res.ok) {
      const savedRecord = normalizeSpacerRecord(await res.json());
      await refreshSpacerCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return savedRecord;
    }
  } catch (e) {
    console.error("Failed to save spacer to API", e);
  }
  return null;
}

export async function getSharedSpacerCatalog() {
  if (SPACER_RECORDS.length === 0) {
    await refreshSpacerCatalog();
  }
  return SPACER_RECORDS;
}

export async function getLegacyCharmCatalog() {
  const sharedCharms = await getSharedCharmCatalog();
  return adaptNormalizedCharmCatalogToLegacy(sharedCharms);
}

export async function saveSharedCharmCatalogEntry(record) {
  const normalizedRecord = normalizeCharmRecord(record);
  if (!normalizedRecord || !normalizedRecord.id) return null;

  const existingRecords = await getSharedCharmCatalog();
  const hasExisting = existingRecords.some((entry) => entry.id === normalizedRecord.id);
  const endpoint = hasExisting
    ? `/api/charms/${encodeURIComponent(normalizedRecord.id)}`
    : "/api/charms";
  const method = hasExisting ? "PUT" : "POST";

  try {
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedRecord)
    });
    if (res.ok) {
      const savedRecord = normalizeCharmRecord(await res.json());
      await refreshCharmCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return savedRecord;
    }
  } catch (e) {
    console.error("Failed to save charm to API", e);
  }
  return null;
}

export async function deleteSharedCharmCatalogEntry(charmId) {
  if (!charmId) return false;

  try {
    const res = await fetch(`/api/charms/${encodeURIComponent(charmId)}`, {
      method: "DELETE"
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
      headers: { "Content-Type": "application/json" },
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

export async function saveSharedCatalog(stone) {
  try {
    const normalizedStone = normalizeStoneRecord(stone);
    const res = await fetch("/api/stones/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedStone || stone)
    });
    if (res.ok) {
      await refreshCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return await res.json();
    }
  } catch (e) {
    console.error("Failed to save stone to API", e);
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
      headers: { "Content-Type": "application/json" },
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
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const loaded = await res.json();
      SETTINGS = loaded;
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
  try {
    const res = await fetch("/api/settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    });
    if (res.ok) {
      SETTINGS = await res.json();
      window.dispatchEvent(new Event("storage_sync"));
      return SETTINGS;
    }
  } catch (e) {
    console.error("Failed to save settings to API", e);
  }
  return SETTINGS;
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
      headers: { "Content-Type": "application/json" },
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

export async function getSharedOrders() {
  try {
    const res = await fetch("/api/orders");
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
  try {
    const res = await fetch("/api/orders/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: newStatus, ...updates })
    });
    if (res.ok) {
      await getSharedOrders();
      window.dispatchEvent(new Event("storage_sync"));
      return true;
    }
  } catch (e) {
    console.error("Failed to update order status to API", e);
  }
  return false;
}

export async function getSharedPurchaseEntries() {
  const res = await fetch('/api/purchases');
  if (!res.ok) throw new Error('Unable to load purchase history.');
  return res.json();
}

export async function getSharedStonePurchaseCostSummaries() {
  const res = await fetch('/api/purchase-costs/stones');
  if (!res.ok) throw new Error('Unable to load stone purchase costs.');
  return res.json();
}

export async function getSharedPurchaseCostSummaries() {
  const res = await fetch('/api/purchase-costs');
  if (!res.ok) throw new Error('Unable to load purchase costs.');
  return res.json();
}

export async function savePurchaseEntry(entry, id = '') {
  const res = await fetch(id ? `/api/purchases/${encodeURIComponent(id)}` : '/api/purchases', {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry)
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Unable to save purchase entry.');
  return res.json();
}

export async function deletePurchaseEntry(id) {
  const res = await fetch(`/api/purchases/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Unable to delete purchase entry.');
}
