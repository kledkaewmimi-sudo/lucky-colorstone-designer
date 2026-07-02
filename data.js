// ==========================================
// LUCKY.COLORSTONE - Shared Database & Sync Layer (REST API)
// ==========================================

export const CATEGORIES = {
  all: { en: "All", th: "ทั้งหมด" },
  wealth: { en: "Wealth & Luck", th: "โชคลาภ/การงาน" },
  love: { en: "Love & Healing", th: "ความรัก/เมตตา" },
  calm: { en: "Calm & Wisdom", th: "สงบ/สติปัญญา" },
  protection: { en: "Protection", th: "ปกป้อง/คุ้มครอง" }
};

export const CHARM_PLACEHOLDER_IMAGE = "/assets/charms/_placeholder.png";

export const CHARM_CATALOG = [
  {
    id: "px01",
    sku: "PX01",
    nameTh: "ปี่เซียะ PX01",
    nameEn: "Pi Xiu PX01",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px01.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.02,
    contactInsetLeft: 0.14,
    contactInsetRight: 0.14,
    rotation: 0,
    anchor: "top",
    price: 490,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px02",
    sku: "PX02",
    nameTh: "ปี่เซียะ PX02",
    nameEn: "Pi Xiu PX02",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px02.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    rotation: 0,
    anchor: "top",
    price: 490,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px03",
    sku: "PX03",
    nameTh: "ปี่เซียะ PX03",
    nameEn: "Pi Xiu PX03",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px03.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.01,
    contactInsetLeft: 0.1,
    contactInsetRight: 0.1,
    rotation: 0,
    anchor: "top",
    price: 590,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px04",
    sku: "PX04",
    nameTh: "ปี่เซียะ PX04",
    nameEn: "Pi Xiu PX04",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px04.png",
    sizeCm: 2.4,
    visualScale: 0.98,
    visualOffsetX: 0.01,
    visualOffsetY: 0.01,
    maxWidthRatio: 1,
    maxHeightRatio: 0.98,
    rotation: 0,
    anchor: "top",
    price: 590,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px05",
    sku: "PX05",
    nameTh: "ปี่เซียะ PX05",
    nameEn: "Pi Xiu PX05",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px05.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.01,
    contactInsetLeft: 0.13,
    contactInsetRight: 0.13,
    rotation: 0,
    anchor: "top",
    price: 690,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px06",
    sku: "PX06",
    nameTh: "ปี่เซียะ PX06",
    nameEn: "Pi Xiu PX06",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px06.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.01,
    contactInsetLeft: 0.12,
    contactInsetRight: 0.12,
    rotation: 0,
    anchor: "top",
    price: 690,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px07",
    sku: "PX07",
    nameTh: "ปี่เซียะ PX07",
    nameEn: "Pi Xiu PX07",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px07.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.01,
    contactInsetLeft: 0.1,
    contactInsetRight: 0.1,
    rotation: 0,
    anchor: "top",
    price: 790,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px08",
    sku: "PX08",
    nameTh: "ปี่เซียะ PX08",
    nameEn: "Pi Xiu PX08",
    type: "pi_xiu",
    collection: "pixiu",
    image: "/assets/charms/pixiu/px08.png",
    sizeCm: 2.4,
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    rotation: 0,
    anchor: "top",
    price: 790,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "tg01",
    sku: "TG01",
    nameTh: "ตะกรุดพระพิฆเนศ เงิน TG01",
    nameEn: "Takrud Ganesha Silver TG01",
    type: "takrud_ganesha",
    collection: "takrud",
    image: "/assets/charms/takrud/tg01.png",
    sizeCm: 3.0,
    visualScale: 1,
    visualOffsetX: 0,
    visualOffsetY: 0,
    maxWidthRatio: 0.98,
    maxHeightRatio: 1,
    rotation: 0,
    anchor: "top",
    price: 990,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "px09",
    sku: "PX09",
    nameTh: "ปี่เซียะ PX09",
    nameEn: "Pi Xiu PX09",
    type: "pi_xiu",
    collection: "pixiu",
    image: CHARM_PLACEHOLDER_IMAGE,
    sizeCm: 2.4,
    visualScale: 0.88,
    visualOffsetX: 0,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.92,
    rotation: 0,
    anchor: "top",
    price: 890,
    meaningTh: "",
    meaningEn: "",
    inStock: false
  },
  {
    id: "tg02",
    sku: "TG02",
    nameTh: "ตะกรุดพระลักษมี ทอง",
    nameEn: "Takrud Ganesha Gold",
    type: "takrud_ganesha",
    collection: "takrud",
    image: "/assets/charms/takrud/tg02.png",
    sizeCm: 3.0,
    visualScale: 1,
    visualOffsetX: 0,
    visualOffsetY: 0,
    maxWidthRatio: 0.98,
    maxHeightRatio: 1,
    rotation: 0,
    anchor: "top",
    price: 1290,
    meaningTh: "",
    meaningEn: "",
    inStock: true
  },
  {
    id: "tl01",
    sku: "TL01",
    nameTh: "ตะกรุดพระพิฆเนศ ทอง",
    nameEn: "Takrud Lakshmi Gold",
    type: "takrud_lakshmi",
    collection: "takrud",
    image: CHARM_PLACEHOLDER_IMAGE,
    sizeCm: 3.0,
    visualScale: 0.9,
    visualOffsetX: 0,
    visualOffsetY: 0,
    maxWidthRatio: 0.98,
    maxHeightRatio: 0.88,
    rotation: 0,
    anchor: "top",
    price: 1190,
    meaningTh: "",
    meaningEn: "",
    inStock: false
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
      inStock: charm.inStock !== false,
      isActive: charm.isActive !== false
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
      inStock: record.availability?.inStock !== false && record.inStock !== false,
      isActive: record.availability?.isActive !== false && record.isActive !== false
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
export let SETTINGS = { globalDiscountPercent: 20 };
export let ORDERS = [];
export let CHARM_RECORDS = [];

// --- Price calculation helper based on bead size ---
export function getStonePriceForSize(stone, size) {
  if (!stone) return 0;
  const sz = parseInt(size);
  if (sz === 4) return stone.p4 !== undefined ? stone.p4 : (stone.price || 0);
  if (sz === 8) return stone.p8 !== undefined ? stone.p8 : (stone.price || 0);
  return stone.p6 !== undefined ? stone.p6 : (stone.price || 0); // default to 6mm
}

// --- Asynchronous API Helpers ---

export async function refreshCatalog() {
  // Try fetching from the API first (when backend is available)
  try {
    const res = await fetch("/api/stones");
    if (res.ok) {
      const loaded = await res.json();
      STONES.length = 0;
      STONES.push(...loaded);
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
      STONES.length = 0;
      STONES.push(...localData);
      return STONES;
    }
  } catch (e) {
    console.error("Failed to load local stones data", e);
  }

  console.warn("Unable to load stones data from any source");
  return STONES;
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
  return false;
}

export async function saveSharedCatalog(stone) {
  try {
    const res = await fetch("/api/stones/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stone)
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

export async function deleteSharedCatalog(stoneId) {
  try {
    const res = await fetch("/api/stones/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stoneId })
    });
    if (res.ok) {
      await refreshCatalog();
      window.dispatchEvent(new Event("storage_sync"));
      return true;
    }
  } catch (e) {
    console.error("Failed to delete stone from API", e);
  }
  return false;
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

export async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch("/api/orders/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: newStatus })
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
