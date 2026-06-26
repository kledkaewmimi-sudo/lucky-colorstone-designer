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

// --- In-memory cache ---
export let STONES = [];
export let SETTINGS = { globalDiscountPercent: 20 };
export let ORDERS = [];

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
  try {
    const res = await fetch("/api/stones");
    if (res.ok) {
      const loaded = await res.json();
      STONES.length = 0;
      STONES.push(...loaded);
      return STONES;
    }
  } catch (e) {
    console.error("Failed to fetch stones from API, using cached values", e);
  }
  return STONES;
}

export async function getSharedCatalog() {
  await refreshCatalog();
  return STONES;
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

