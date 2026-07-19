#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const paths = {
  stones: path.join(dataDir, "stones.json"),
  charms: path.join(dataDir, "charms.json"),
  settings: path.join(dataDir, "settings.json"),
  dataJs: path.join(repoRoot, "data.js")
};

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

const CATEGORY_CATALOG = [
  { id: "wealth", entityType: "stone", slug: "wealth", nameEn: "Wealth & Luck", nameTh: "โชคลาภ/การงาน", displayOrder: 10, isActive: true },
  { id: "love", entityType: "stone", slug: "love", nameEn: "Love & Healing", nameTh: "ความรัก/เมตตา", displayOrder: 20, isActive: true },
  { id: "calm", entityType: "stone", slug: "calm", nameEn: "Calm & Wisdom", nameTh: "สงบ/สติปัญญา", displayOrder: 30, isActive: true },
  { id: "protection", entityType: "stone", slug: "protection", nameEn: "Protection", nameTh: "ปกป้อง/คุ้มครอง", displayOrder: 40, isActive: true },
  { id: "pixiu", entityType: "charm", slug: "pixiu", nameEn: "Pi Xiu", nameTh: "ปี่เซียะ", displayOrder: 10, isActive: true },
  { id: "takrud", entityType: "charm", slug: "takrud", nameEn: "Takrud", nameTh: "ตะกรุด", displayOrder: 20, isActive: true },
  { id: "bee-heart", entityType: "charm", slug: "bee-heart", nameEn: "Bee Heart", nameTh: "สีผึ้ง / บีฮาร์ท", displayOrder: 30, isActive: true }
];

const STONE_UPDATES = {
  golden_rutile: {
    nameEn: "Golden Rutile Quartz",
    categoryId: "wealth",
    meaningTh: "สื่อถึงโชคลาภ ความสำเร็จ และการดึงดูดโอกาสทางการเงิน",
    meaning: "Symbolizes prosperity, success, and attracting new opportunities.",
    tier: "D"
  },
  rutilated_quartz: {
    nameEn: "Rutilated Quartz",
    categoryId: "wealth",
    meaningTh: "สื่อถึงพลังในการเดินหน้า ความชัดเจน และความสำเร็จ",
    meaning: "Supports clarity, confidence, and forward-moving success.",
    tier: "D"
  },
  amethyst: {
    nameEn: "Amethyst",
    categoryId: "calm",
    meaningTh: "สื่อถึงความสงบ สติ และการพักใจจากความวุ่นวาย",
    meaning: "Symbolizes calm, intuition, and emotional balance.",
    tier: "B"
  },
  rose_quartz: {
    nameEn: "Rose Quartz",
    categoryId: "love",
    meaningTh: "สื่อถึงความรัก ความเมตตา และความอ่อนโยนต่อใจ",
    meaning: "Symbolizes love, compassion, and gentle emotional healing.",
    tier: "A"
  },
  lapis_lazuli: {
    nameEn: "Lapis Lazuli",
    categoryId: "calm",
    meaningTh: "สื่อถึงปัญญา ความจริง และการสื่อสารอย่างมั่นใจ",
    meaning: "Symbolizes wisdom, truth, and confident communication.",
    tier: "A"
  },
  tigers_eye: {
    nameEn: "Tiger's Eye",
    categoryId: "protection",
    meaningTh: "สื่อถึงความกล้าหาญ การปกป้อง และการตัดสินใจอย่างมั่นคง",
    meaning: "Symbolizes courage, protection, and grounded decision-making.",
    tier: "C"
  },
  pink_tiger_eye: {
    nameEn: "Pink Tiger Eye",
    categoryId: "protection",
    meaningTh: "สื่อถึงความมั่นใจที่อ่อนโยน เสน่ห์ และพลังใจที่สมดุล",
    meaning: "Symbolizes gentle confidence, charm, and balanced inner strength.",
    tier: "C"
  },
  malachite: {
    nameEn: "Malachite",
    categoryId: "protection",
    meaningTh: "สื่อถึงการเปลี่ยนผ่าน การปกป้อง และพลังในการเริ่มต้นใหม่",
    meaning: "Symbolizes transformation, protection, and renewed strength.",
    tier: "D"
  },
  citrine: {
    nameEn: "Citrine",
    categoryId: "wealth",
    meaningTh: "สื่อถึงความมั่งคั่ง ความสดใส และพลังแห่งความสำเร็จ",
    meaning: "Symbolizes abundance, optimism, and success energy.",
    tier: "D"
  },
  ice_quartz: {
    nameEn: "Ice Quartz",
    categoryId: "calm",
    meaningTh: "สื่อถึงความเย็นใจ ความชัดเจน และสมาธิที่นิ่งสงบ",
    meaning: "Symbolizes cool clarity, calm focus, and emotional ease.",
    tier: "B"
  },
  beryl: {
    nameEn: "Beryl",
    categoryId: "calm",
    meaningTh: "สื่อถึงความสดชื่นทางความคิด ความสมดุล และการสื่อสารอย่างนุ่มนวล",
    meaning: "Symbolizes mental freshness, balance, and graceful communication.",
    tier: "C"
  },
  howlite: {
    nameEn: "Howlite",
    categoryId: "calm",
    meaningTh: "สื่อถึงความอดทน ความสงบ และการปล่อยวางความฟุ้งซ่าน",
    meaning: "Symbolizes patience, serenity, and a quietly grounded mind.",
    tier: "A"
  },
  sodalite: {
    nameEn: "Sodalite",
    categoryId: "calm",
    meaningTh: "สื่อถึงตรรกะ ปัญญา และความมั่นใจในการสื่อสาร",
    meaning: "Symbolizes logic, wisdom, and confident self-expression.",
    tier: "B"
  },
  clear_quartz: {
    nameEn: "Clear Quartz",
    categoryId: "calm",
    meaningTh: "สื่อถึงความชัดเจน การขยายพลัง และการตั้งเจตนา",
    meaning: "Symbolizes clarity, amplification, and focused intention.",
    tier: "A"
  },
  white_jade: {
    nameEn: "White Jade",
    categoryId: "calm",
    meaningTh: "สื่อถึงความสงบ ความอ่อนโยน และการปกป้องอย่างนุ่มนวล",
    meaning: "Symbolizes peace, gentleness, and quiet protection.",
    tier: "B"
  },
  white_cat_eye: {
    nameEn: "White Cat Eye",
    categoryId: "protection",
    meaningTh: "สื่อถึงการคุ้มครอง การมองเห็นโอกาส และความมั่นคง",
    meaning: "Symbolizes protection, awareness, and steady confidence.",
    tier: "A"
  },
  opal: {
    nameEn: "Opal",
    categoryId: "love",
    meaningTh: "สื่อถึงแรงบันดาลใจ เสน่ห์ และความงดงามจากภายใน",
    meaning: "Symbolizes inspiration, charm, and inner radiance.",
    tier: "D"
  },
  red_tiger_eye: {
    nameEn: "Red Tiger Eye",
    categoryId: "protection",
    meaningTh: "สื่อถึงแรงผลักดัน ความกล้า และพลังในการลงมืออย่างมั่นคง",
    meaning: "Symbolizes motivation, courage, and grounded action.",
    tier: "C"
  },
  lavender_quartz: {
    nameEn: "Lavender Quartz",
    categoryId: "love",
    meaningTh: "สื่อถึงความรักที่อ่อนโยน ความละมุนใจ และความสงบจากภายใน",
    meaning: "Symbolizes gentle love, emotional softness, and inner peace.",
    tier: "B"
  },
  black_tourmaline: {
    nameEn: "Black Tourmaline",
    categoryId: "protection",
    meaningTh: "สื่อถึงการปกป้อง ขอบเขตที่มั่นคง และการปล่อยพลังลบ",
    meaning: "Symbolizes protection, firm boundaries, and grounded release.",
    tier: "C"
  },
  labradorite: {
    nameEn: "Labradorite",
    categoryId: "calm",
    meaningTh: "สื่อถึงสัญชาตญาณ การเปลี่ยนผ่าน และพลังภายในที่ลึกซึ้ง",
    meaning: "Symbolizes intuition, transformation, and inner strength.",
    tier: "C"
  },
  carnelian: {
    nameEn: "Carnelian",
    categoryId: "wealth",
    meaningTh: "สื่อถึงพลังชีวิต ความมั่นใจ และแรงบันดาลใจในการสร้างสรรค์",
    meaning: "Symbolizes vitality, confidence, and creative momentum.",
    tier: "B"
  },
  moss_agate: {
    nameEn: "Moss Agate",
    categoryId: "wealth",
    meaningTh: "สื่อถึงการเติบโต ความอุดมสมบูรณ์ และความมั่นคงจากธรรมชาติ",
    meaning: "Symbolizes growth, abundance, and grounded stability.",
    tier: "B"
  },
  rhodonite: {
    nameEn: "Rhodonite",
    categoryId: "love",
    meaningTh: "สื่อถึงเมตตา การเยียวยาใจ และความสมดุลในความสัมพันธ์",
    meaning: "Symbolizes compassion, emotional healing, and heart balance.",
    tier: "B"
  },
  sunstone: {
    nameEn: "Sunstone",
    categoryId: "wealth",
    meaningTh: "สื่อถึงความสดใส โอกาส และความมั่นใจในการก้าวสู่ความสำเร็จ",
    meaning: "Symbolizes optimism, opportunity, and confident success.",
    tier: "C"
  },
  pearls: {
    nameEn: "Pearls",
    categoryId: "love",
    meaningTh: "สื่อถึงความสง่างาม ความอ่อนโยน และเสน่ห์ที่สุขุม",
    meaning: "Symbolizes elegance, tenderness, and graceful charm.",
    tier: "B"
  },
  aquamarine: {
    nameEn: "Aquamarine",
    categoryId: "calm",
    meaningTh: "สื่อถึงความสงบ ความชัดเจน และการสื่อสารอย่างอ่อนโยน",
    meaning: "Symbolizes calm, clarity, and soothing communication.",
    tier: "C"
  },
  moonstone: {
    nameEn: "Moonstone",
    categoryId: "love",
    meaningTh: "สื่อถึงเสน่ห์ สัญชาตญาณ และความสมดุลของอารมณ์",
    meaning: "Symbolizes charm, intuition, and emotional flow.",
    tier: "C"
  },
  pyrite: {
    nameEn: "Pyrite",
    categoryId: "wealth",
    meaningTh: "สื่อถึงความมั่งคั่ง ความเด็ดเดี่ยว และการปกป้องโอกาสที่ดี",
    meaning: "Symbolizes prosperity, strong will, and protected opportunity.",
    tier: "C"
  },
  honey_jade: {
    nameEn: "Honey Jade",
    categoryId: "wealth",
    meaningTh: "สื่อถึงความอุดมสมบูรณ์ที่อบอุ่น มุมมองบวก และความสำเร็จที่มั่นคง",
    meaning: "Symbolizes warm abundance, optimism, and steady success.",
    tier: "B"
  },
  cherry_quartz: {
    nameEn: "Cherry Quartz",
    categoryId: "love",
    meaningTh: "สื่อถึงความสดใส ความรัก และพลังบวกในความสัมพันธ์",
    meaning: "Symbolizes joy, affection, and positive emotional energy.",
    tier: "A"
  }
};

const STONE_PRICE_TIERS = {
  A: { p4: 70, p6: 110, p8: 150 },
  B: { p4: 80, p6: 120, p8: 160 },
  C: { p4: 90, p6: 130, p8: 170 },
  D: { p4: 100, p6: 150, p8: 200 }
};

const CHARM_MEANINGS = {
  pixiu: {
    th: "สื่อถึงโชคลาภ การเรียกทรัพย์ และการปกป้องทรัพย์ให้มั่นคง",
    en: "Symbolizes wealth attraction, prosperity, and guarding good fortune."
  },
  takrud_ganesha: {
    th: "สื่อถึงการเปิดทาง ความสำเร็จ และการขจัดอุปสรรค",
    en: "Symbolizes removing obstacles, opening paths, and success."
  },
  takrud_lakshmi: {
    th: "สื่อถึงความมั่งคั่ง ความอุดมสมบูรณ์ และโชคลาภด้านการเงิน",
    en: "Symbolizes abundance, prosperity, and financial blessings."
  },
  bee_heart: {
    th: "สื่อถึงเสน่ห์ เมตตา ความรัก และความน่าดึงดูดอย่างอ่อนโยน",
    en: "Symbolizes charm, affection, kindness, and gentle attraction."
  }
};

const CHARM_NAME_TH = {
  px01: "ปี่เซียะ PX01",
  px02: "ปี่เซียะ PX02",
  px03: "ปี่เซียะ PX03",
  px04: "ปี่เซียะ PX04",
  px05: "ปี่เซียะ PX05",
  px06: "ปี่เซียะ PX06",
  px07: "ปี่เซียะ PX07",
  px08: "ปี่เซียะ PX08",
  px09: "ปี่เซียะ PX09",
  tg01: "ตะกรุดพระพิฆเนศ เงิน TG01",
  tg02: "ตะกรุดพระพิฆเนศ ทอง",
  tg03: "ตะกรุดพระพิฆเนศ สีเงิน",
  tl01: "ตะกรุดพระลักษมี ทอง",
  bh01: "บีฮาร์ท สีน้ำเงิน",
  bh02: "บีฮาร์ท สีส้ม",
  bh03: "บีฮาร์ท สีม่วง"
};

const CHARM_NAME_EN = {
  px01: "Pi Xiu PX01",
  px02: "Pi Xiu PX02",
  px03: "Pi Xiu PX03",
  px04: "Pi Xiu PX04",
  px05: "Pi Xiu PX05",
  px06: "Pi Xiu PX06",
  px07: "Pi Xiu PX07",
  px08: "Pi Xiu PX08",
  px09: "Pi Xiu PX09",
  tg01: "Takrud Ganesha Silver TG01",
  tg02: "Takrud Ganesha Gold",
  tg03: "Takrud Ganesha Silver",
  tl01: "Takrud Lakshmi Gold",
  bh01: "Bee Heart Blue",
  bh02: "Bee Heart Orange",
  bh03: "Bee Heart Purple"
};

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = readText(filePath).trim();
  return raw ? JSON.parse(raw) : fallback;
}

function writeText(filePath, nextText) {
  if (isDryRun) return;
  fs.writeFileSync(filePath, nextText, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function setIfChanged(target, key, value, changes, label) {
  if (target[key] !== value) {
    changes.push(label || key);
    target[key] = value;
  }
}

function updateStone(stone) {
  const curated = STONE_UPDATES[stone.id];
  const changes = [];
  if (!curated) return { record: stone, changes };

  const next = { ...stone };
  setIfChanged(next, "nameEn", curated.nameEn || next.name || "", changes, "nameEn");
  setIfChanged(next, "category", curated.categoryId, changes, "category");
  setIfChanged(next, "categoryId", curated.categoryId, changes, "categoryId");
  setIfChanged(next, "meaningTh", curated.meaningTh, changes, "meaningTh");
  setIfChanged(next, "meaning", curated.meaning, changes, "meaning");

  const tierPrices = STONE_PRICE_TIERS[curated.tier] || STONE_PRICE_TIERS.B;
  ["p4", "p6", "p8"].forEach((priceKey) => {
    if (!finitePositive(next[priceKey])) {
      setIfChanged(next, priceKey, tierPrices[priceKey], changes, priceKey);
    }
  });

  return { record: next, changes };
}

function getCharmMeaning(charm) {
  const type = String(charm.type || "").trim();
  if (type === "bee_heart") return CHARM_MEANINGS.bee_heart;
  if (type === "takrud_lakshmi") return CHARM_MEANINGS.takrud_lakshmi;
  if (type === "takrud_ganesha" || String(charm.id || "").startsWith("tg")) return CHARM_MEANINGS.takrud_ganesha;
  return CHARM_MEANINGS.pixiu;
}

function getCharmCategory(charm) {
  return charm.type === "bee_heart" ? "bee-heart" : (charm.categoryId || charm.collection || "pixiu");
}

function updateCharm(charm) {
  const next = { ...charm };
  const changes = [];
  const id = String(next.id || "");
  const meaning = getCharmMeaning(next);
  const categoryId = getCharmCategory(next);
  const isNormalized = next.name && typeof next.name === "object";

  if (isNormalized) {
    next.name = { ...next.name };
    next.meaning = { ...(next.meaning || {}) };
    next.pricing = { ...(next.pricing || {}) };
    next.availability = { ...(next.availability || {}) };

    setIfChanged(next.name, "th", CHARM_NAME_TH[id] || next.name.th || "", changes, "name.th");
    setIfChanged(next.name, "en", CHARM_NAME_EN[id] || next.name.en || "", changes, "name.en");
    setIfChanged(next, "categoryId", categoryId, changes, "categoryId");
    setIfChanged(next, "collection", categoryId, changes, "collection");
    setIfChanged(next.meaning, "th", meaning.th, changes, "meaning.th");
    setIfChanged(next.meaning, "en", meaning.en, changes, "meaning.en");
    if (!finitePositive(next.pricing.base)) {
      setIfChanged(next.pricing, "base", 990, changes, "pricing.base");
    }
  } else {
    setIfChanged(next, "nameTh", CHARM_NAME_TH[id] || next.nameTh || "", changes, "nameTh");
    setIfChanged(next, "nameEn", CHARM_NAME_EN[id] || next.nameEn || "", changes, "nameEn");
    setIfChanged(next, "categoryId", categoryId, changes, "categoryId");
    setIfChanged(next, "collection", categoryId, changes, "collection");
    setIfChanged(next, "meaningTh", meaning.th, changes, "meaningTh");
    setIfChanged(next, "meaningEn", meaning.en, changes, "meaningEn");
    if (!finitePositive(next.price)) {
      setIfChanged(next, "price", 990, changes, "price");
    }
  }

  return { record: next, changes };
}

function findBalancedExpression(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return { expression: source.slice(startIndex, index + 1), endIndex: index + 1 };
    }
  }
  throw new Error(`Unable to find balanced ${openChar}${closeChar} expression.`);
}

function extractArrayConst(source, constName) {
  const marker = `${constName} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return [];
  const arrayStart = source.indexOf("[", markerIndex);
  const { expression } = findBalancedExpression(source, arrayStart, "[", "]");
  return vm.runInNewContext(expression, { CHARM_PLACEHOLDER_IMAGE: "/assets/charms/_placeholder.png" }, { timeout: 1000 });
}

function replaceArrayConst(source, constName, records) {
  const marker = `${constName} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${constName} in data.js.`);
  const arrayStart = source.indexOf("[", markerIndex);
  const { endIndex } = findBalancedExpression(source, arrayStart, "[", "]");
  const formatted = JSON.stringify(records, null, 2).replace(/\n/g, "\n  ");
  return `${source.slice(0, arrayStart)}${formatted}${source.slice(endIndex)}`;
}

function toLegacyCharm(charm) {
  return {
    id: charm.id,
    sku: charm.sku,
    nameTh: charm.name?.th || "",
    nameEn: charm.name?.en || "",
    type: charm.type,
    collection: charm.collection,
    categoryId: charm.categoryId,
    image: charm.image?.primary || "",
    sizeCm: charm.business?.sizeCm || 0,
    footprintMm: charm.business?.footprintMm || 0,
    visualScale: charm.renderTuning?.visualScale,
    visualOffsetX: charm.renderTuning?.visualOffsetX,
    visualOffsetY: charm.renderTuning?.visualOffsetY,
    maxWidthRatio: charm.renderTuning?.maxWidthRatio,
    maxHeightRatio: charm.renderTuning?.maxHeightRatio,
    edgeFitMode: charm.renderTuning?.edgeFitMode,
    targetWidthFillRatio: charm.renderTuning?.targetWidthFillRatio,
    contactInsetLeft: charm.renderTuning?.contactInsetLeft,
    contactInsetRight: charm.renderTuning?.contactInsetRight,
    rotation: charm.renderTuning?.rotation,
    anchor: charm.renderTuning?.anchor,
    price: charm.pricing?.base || 0,
    meaningTh: charm.meaning?.th || "",
    meaningEn: charm.meaning?.en || "",
    inStock: charm.availability?.inStock !== false,
    isActive: charm.availability?.isActive !== false,
    displayOrder: charm.displayOrder
  };
}

function summarizeChanges(label, results) {
  const changed = results.filter((entry) => entry.changes.length > 0);
  console.log(`${label}: ${changed.length}/${results.length} records changed`);
  changed.forEach((entry) => console.log(`  - ${entry.id}: ${entry.changes.join(", ")}`));
}

function buildStoneRow(stone, index = 0) {
  return {
    id: String(stone.id || "").trim(),
    payload: stone,
    category_id: String(stone.categoryId || stone.category || "").trim() || null,
    display_order: Number.isFinite(Number(stone.displayOrder)) ? Number(stone.displayOrder) : (index + 1) * 10,
    in_stock: stone.inStock !== false,
    is_active: stone.isActive !== false
  };
}

function buildCharmRow(charm, index = 0) {
  return {
    id: String(charm.id || "").trim(),
    payload: charm,
    category_id: String(charm.categoryId || charm.collection || "").trim() || null,
    display_order: Number.isFinite(Number(charm.displayOrder)) ? Number(charm.displayOrder) : (index + 1) * 10,
    in_stock: charm.availability?.inStock !== false && charm.inStock !== false,
    is_active: charm.availability?.isActive !== false && charm.isActive !== false
  };
}

function buildCategoryRow(category, index = 0) {
  return {
    id: String(category.id || category.slug || "").trim(),
    entity_type: String(category.entityType || "stone").trim().toLowerCase(),
    slug: String(category.slug || category.id || "").trim() || null,
    name_en: String(category.nameEn || "").trim() || null,
    name_th: String(category.nameTh || "").trim() || null,
    display_order: Number.isFinite(Number(category.displayOrder)) ? Number(category.displayOrder) : (index + 1) * 10,
    is_active: category.isActive !== false,
    payload: category
  };
}

function validateSupabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid project URL.");
  }
  return parsed.origin;
}

async function upsertRows(tableName, rows, conflictKey = "id") {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`${tableName}: skipped Supabase upsert; SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not provided.`);
    return;
  }
  if (isDryRun) {
    console.log(`[dry-run] ${tableName}: ${rows.length} rows ready for Supabase upsert.`);
    return;
  }

  const endpoint = `${validateSupabaseUrl(process.env.SUPABASE_URL)}/rest/v1/${tableName}?on_conflict=${encodeURIComponent(conflictKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    throw new Error(`${tableName} Supabase upsert failed: ${response.status} ${await response.text()}`);
  }
  console.log(`${tableName}: upserted ${rows.length} rows to Supabase.`);
}

async function main() {
  const stones = readJson(paths.stones, []);
  const charms = readJson(paths.charms, []);
  const settings = readJson(paths.settings, {});
  const dataJs = readText(paths.dataJs);
  const fallbackCharms = extractArrayConst(dataJs, "CHARM_CATALOG");

  const stoneResults = stones.map((stone) => {
    const result = updateStone(stone);
    return { id: stone.id, ...result };
  });
  const updatedStones = stoneResults.map((entry) => entry.record);

  const charmResults = charms.map((charm) => {
    const result = updateCharm(charm);
    return { id: charm.id, ...result };
  });
  const updatedCharms = charmResults.map((entry) => entry.record);

  const fallbackById = new Map(fallbackCharms.map((charm) => [charm.id, charm]));
  updatedCharms.map(toLegacyCharm).forEach((charm) => {
    fallbackById.set(charm.id, { ...(fallbackById.get(charm.id) || {}), ...charm });
  });
  const updatedFallbackCharms = updatedCharms.map((charm) => fallbackById.get(charm.id)).filter(Boolean);
  const fallbackResults = updatedFallbackCharms.map((charm) => {
    const before = fallbackCharms.find((entry) => entry.id === charm.id);
    const changes = JSON.stringify(before || null) === JSON.stringify(charm) ? [] : ["fallback"];
    return { id: charm.id, record: charm, changes };
  });

  const updatedSettings = {
    ...settings,
    catalogCategories: CATEGORY_CATALOG
  };

  summarizeChanges("stones", stoneResults);
  summarizeChanges("charms", charmResults);
  summarizeChanges("data.js CHARM_CATALOG", fallbackResults);
  console.log(`settings: catalogCategories ${JSON.stringify(settings.catalogCategories || null) === JSON.stringify(CATEGORY_CATALOG) ? "unchanged" : "updated"}`);

  if (!isDryRun) {
    writeJson(paths.stones, updatedStones);
    writeJson(paths.charms, updatedCharms);
    writeJson(paths.settings, updatedSettings);
    let nextDataJs = replaceArrayConst(dataJs, "DEFAULT_CATEGORY_CATALOG", CATEGORY_CATALOG);
    nextDataJs = replaceArrayConst(nextDataJs, "CHARM_CATALOG", updatedFallbackCharms);
    writeText(paths.dataJs, nextDataJs);
  }

  await upsertRows("catalog_stones", updatedStones.map(buildStoneRow));
  await upsertRows("catalog_charms", updatedCharms.map(buildCharmRow));
  await upsertRows("catalog_categories", CATEGORY_CATALOG.map(buildCategoryRow));
  await upsertRows("app_settings", Object.entries(updatedSettings).map(([key, value]) => ({ key, value })), "key");

  console.log(`Catalog update ${isDryRun ? "dry-run" : "completed"}.`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
