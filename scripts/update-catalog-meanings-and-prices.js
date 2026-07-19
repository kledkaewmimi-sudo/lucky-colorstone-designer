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
    nameTh: "ไหมทอง",
    categoryId: "wealth",
    targetPrice: 150,
    meaningTh: "สื่อถึงโชคลาภ ความมั่งคั่ง ความสำเร็จ และการดึงดูดโอกาสทางการเงิน",
    meaningEn: "Symbolizes prosperity, success, wealth energy, and attracting new opportunities."
  },
  rutilated_quartz: {
    nameEn: "Rutilated Quartz",
    nameTh: "ไหมทอง",
    categoryId: "wealth",
    targetPrice: 150,
    meaningTh: "สื่อถึงพลังในการเดินหน้า ความชัดเจน การตัดสินใจ และความสำเร็จในงาน",
    meaningEn: "Symbolizes clarity, confidence, direction, and forward-moving success."
  },
  amethyst: {
    nameEn: "Amethyst",
    nameTh: "อเมทิสต์",
    categoryId: "calm",
    targetPrice: 120,
    meaningTh: "สื่อถึงความสงบ สติ สมาธิ และการพักใจจากความวุ่นวาย",
    meaningEn: "Symbolizes calm, intuition, focus, and emotional balance."
  },
  rose_quartz: {
    nameEn: "Rose Quartz",
    nameTh: "โรสควอตซ์",
    categoryId: "love",
    targetPrice: 90,
    meaningTh: "สื่อถึงความรัก ความเมตตา ความอ่อนโยน และการเปิดใจรับพลังดี",
    meaningEn: "Symbolizes love, compassion, tenderness, and gentle emotional healing."
  },
  lapis_lazuli: {
    nameEn: "Lapis Lazuli",
    nameTh: "ลาพิส ลาซูลี",
    categoryId: "calm",
    targetPrice: 110,
    meaningTh: "สื่อถึงปัญญา ความจริง การสื่อสารที่ชัดเจน และความมั่นใจภายใน",
    meaningEn: "Symbolizes wisdom, truth, clear communication, and inner confidence."
  },
  tigers_eye: {
    nameEn: "Tiger's Eye",
    nameTh: "ไทเกอร์อาย",
    categoryId: "protection",
    targetPrice: 130,
    meaningTh: "สื่อถึงความกล้าหาญ การปกป้อง ความมั่นคง และการตัดสินใจอย่างมีพลัง",
    meaningEn: "Symbolizes courage, protection, grounded confidence, and strong decision-making."
  },
  pink_tiger_eye: {
    nameEn: "Pink Tiger Eye",
    nameTh: "ไทเกอร์อายชมพู",
    categoryId: "love",
    targetPrice: 130,
    meaningTh: "สื่อถึงเสน่ห์ ความมั่นใจที่อ่อนโยน พลังใจ และความสมดุลในความสัมพันธ์",
    meaningEn: "Symbolizes gentle confidence, charm, balanced emotions, and relationship harmony."
  },
  malachite: {
    nameEn: "Malachite",
    nameTh: "มาลาไคท์",
    categoryId: "protection",
    targetPrice: 180,
    meaningTh: "สื่อถึงการเปลี่ยนผ่าน การปกป้อง การเริ่มต้นใหม่ และพลังในการเติบโต",
    meaningEn: "Symbolizes transformation, protection, renewal, and personal growth."
  },
  citrine: {
    nameEn: "Citrine",
    nameTh: "ซิทริน",
    categoryId: "wealth",
    targetPrice: 140,
    meaningTh: "สื่อถึงความมั่งคั่ง ความสดใส โอกาสใหม่ และพลังแห่งความสำเร็จ",
    meaningEn: "Symbolizes abundance, optimism, opportunity, and success energy."
  },
  ice_quartz: {
    nameEn: "Ice Quartz",
    nameTh: "ไอซ์ควอตซ์",
    categoryId: "calm",
    targetPrice: 90,
    meaningTh: "สื่อถึงความใสสะอาด ความสงบ ความชัดเจน และการเริ่มต้นด้วยใจที่เบา",
    meaningEn: "Symbolizes purity, calmness, clarity, and a refreshed state of mind."
  },
  beryl: {
    nameEn: "Beryl",
    nameTh: "เบริล",
    categoryId: "calm",
    targetPrice: 110,
    meaningTh: "สื่อถึงความสมดุล ความนิ่ง ความเข้าใจ และการมองสถานการณ์อย่างอ่อนโยน",
    meaningEn: "Symbolizes balance, serenity, understanding, and gentle clarity."
  },
  howlite: {
    nameEn: "Howlite",
    nameTh: "ฮาวไลต์",
    categoryId: "calm",
    targetPrice: 90,
    meaningTh: "สื่อถึงความผ่อนคลาย ความอดทน การปล่อยวาง และการนอนหลับอย่างสงบ",
    meaningEn: "Symbolizes relaxation, patience, release, and peaceful rest."
  },
  sodalite: {
    nameEn: "Sodalite",
    nameTh: "โซดาไลต์",
    categoryId: "calm",
    targetPrice: 90,
    meaningTh: "สื่อถึงเหตุผล สติปัญญา ความมั่นใจในการสื่อสาร และการคิดอย่างเป็นระบบ",
    meaningEn: "Symbolizes logic, wisdom, communication confidence, and clear thinking."
  },
  clear_quartz: {
    nameEn: "Clear Quartz",
    nameTh: "เคลียร์ควอตซ์",
    categoryId: "calm",
    targetPrice: 90,
    meaningTh: "สื่อถึงความชัดเจน การขยายพลัง การตั้งเจตนา และการเริ่มต้นใหม่",
    meaningEn: "Symbolizes clarity, energy amplification, focused intention, and new beginnings."
  },
  white_jade: {
    nameEn: "White Jade",
    nameTh: "ไวท์เจด",
    categoryId: "love",
    targetPrice: 90,
    meaningTh: "สื่อถึงความสงบ ความอ่อนโยน ความเมตตา และการปกป้องอย่างนุ่มนวล",
    meaningEn: "Symbolizes peace, gentleness, compassion, and soft protection."
  },
  white_cat_eye: {
    nameEn: "White Cat Eye",
    nameTh: "แคทอายขาว",
    categoryId: "protection",
    targetPrice: 90,
    meaningTh: "สื่อถึงการคุ้มครอง การมองเห็นโอกาส ความมั่นคง และการป้องกันพลังลบ",
    meaningEn: "Symbolizes protection, awareness, steady confidence, and energetic boundaries."
  },
  opal: {
    nameEn: "Opal",
    nameTh: "โอปอล",
    categoryId: "love",
    targetPrice: 140,
    meaningTh: "สื่อถึงแรงบันดาลใจ เสน่ห์ ความคิดสร้างสรรค์ และประกายความงามจากภายใน",
    meaningEn: "Symbolizes inspiration, charm, creativity, and inner radiance."
  },
  red_tiger_eye: {
    nameEn: "Red Tiger Eye",
    nameTh: "เรดไทเกอร์อาย",
    categoryId: "protection",
    targetPrice: 130,
    meaningTh: "สื่อถึงพลังใจ ความกล้า ความมุ่งมั่น และการลงมือทำอย่างมั่นใจ",
    meaningEn: "Symbolizes vitality, courage, determination, and confident action."
  },
  lavender_quartz: {
    nameEn: "Lavender Quartz",
    nameTh: "ลาเวนเดอร์ควอตซ์",
    categoryId: "love",
    targetPrice: 110,
    meaningTh: "สื่อถึงความรักที่นุ่มนวล ความสบายใจ ความเมตตา และการเยียวยาใจอย่างอ่อนโยน",
    meaningEn: "Symbolizes soft love, comfort, compassion, and gentle emotional healing."
  },
  black_tourmaline: {
    nameEn: "Black Tourmaline",
    nameTh: "แบล็กทัวร์มาลีน",
    categoryId: "protection",
    targetPrice: 160,
    meaningTh: "สื่อถึงการปกป้อง การกราวด์พลัง ความมั่นคง และการกันพลังลบ",
    meaningEn: "Symbolizes protection, grounding, stability, and shielding from negativity."
  },
  labradorite: {
    nameEn: "Labradorite",
    nameTh: "ลาบราโดไรต์",
    categoryId: "protection",
    targetPrice: 160,
    meaningTh: "สื่อถึงสัญชาตญาณ การเปลี่ยนแปลง การปกป้อง และการค้นพบศักยภาพใหม่",
    meaningEn: "Symbolizes intuition, transformation, protection, and hidden potential."
  },
  carnelian: {
    nameEn: "Carnelian",
    nameTh: "คาร์เนเลียน",
    categoryId: "wealth",
    targetPrice: 100,
    meaningTh: "สื่อถึงพลังสร้างสรรค์ ความมั่นใจ ความกระตือรือร้น และแรงผลักดันในการลงมือทำ",
    meaningEn: "Symbolizes creativity, confidence, motivation, and bold action."
  },
  moss_agate: {
    nameEn: "Moss Agate",
    nameTh: "มอสอาเกต",
    categoryId: "calm",
    targetPrice: 110,
    meaningTh: "สื่อถึงการเติบโต ความอุดมสมบูรณ์ ความสมดุล และการเชื่อมโยงกับธรรมชาติ",
    meaningEn: "Symbolizes growth, abundance, balance, and connection with nature."
  },
  rhodonite: {
    nameEn: "Rhodonite",
    nameTh: "โรโดไนต์",
    categoryId: "love",
    targetPrice: 120,
    meaningTh: "สื่อถึงการเยียวยาความสัมพันธ์ ความเข้าใจ การให้อภัย และความรักที่มั่นคง",
    meaningEn: "Symbolizes relationship healing, understanding, forgiveness, and steady love."
  },
  sunstone: {
    nameEn: "Sunstone",
    nameTh: "ซันสโตน",
    categoryId: "wealth",
    targetPrice: 120,
    meaningTh: "สื่อถึงความสดใส โชคดี ความมั่นใจ และพลังบวกในการเริ่มต้นวันใหม่",
    meaningEn: "Symbolizes joy, luck, confidence, and uplifting positive energy."
  },
  pearls: {
    nameEn: "Pearls",
    nameTh: "ไข่มุก",
    categoryId: "love",
    targetPrice: 120,
    meaningTh: "สื่อถึงความบริสุทธิ์ ความอ่อนโยน ความสง่างาม และเสน่ห์แบบละมุน",
    meaningEn: "Symbolizes purity, softness, elegance, and graceful charm."
  },
  aquamarine: {
    nameEn: "Aquamarine",
    nameTh: "อะความารีน",
    categoryId: "calm",
    targetPrice: 140,
    meaningTh: "สื่อถึงความสงบ การสื่อสารอย่างอ่อนโยน ความกล้า และความสบายใจ",
    meaningEn: "Symbolizes calmness, gentle communication, courage, and emotional ease."
  },
  moonstone: {
    nameEn: "Moonstone",
    nameTh: "มูนสโตน",
    categoryId: "love",
    targetPrice: 140,
    meaningTh: "สื่อถึงพลังแห่งความอ่อนโยน สัญชาตญาณ ความรัก และการเริ่มต้นใหม่",
    meaningEn: "Symbolizes feminine energy, intuition, love, and new beginnings."
  },
  pyrite: {
    nameEn: "Pyrite",
    nameTh: "ไพไรต์",
    categoryId: "wealth",
    targetPrice: 160,
    meaningTh: "สื่อถึงทรัพย์ ความมั่งคั่ง ความกล้าลงมือ และการดึงดูดโอกาสทางการเงิน",
    meaningEn: "Symbolizes wealth, prosperity, bold action, and financial opportunity."
  },
  honey_jade: {
    nameEn: "Honey Jade",
    nameTh: "ฮันนี่เจด",
    categoryId: "wealth",
    targetPrice: 100,
    meaningTh: "สื่อถึงความอบอุ่น โชคลาภ ความอุดมสมบูรณ์ และพลังสนับสนุนที่นุ่มนวล",
    meaningEn: "Symbolizes warmth, luck, abundance, and gentle supportive energy."
  },
  cherry_quartz: {
    nameEn: "Cherry Quartz",
    nameTh: "เชอร์รี่ควอตซ์",
    categoryId: "love",
    targetPrice: 90,
    meaningTh: "สื่อถึงความสดใส ความรัก พลังบวก และความสุขในความสัมพันธ์",
    meaningEn: "Symbolizes joy, affection, positivity, and happiness in relationships."
  }
};

const CHARM_UPDATES = {
  px01: {
    nameEn: "Pi Xiu PX01",
    nameTh: "ปี่เซียะ PX01",
    categoryId: "pixiu",
    price: 490,
    meaningTh: "สื่อถึงการเรียกทรัพย์ โชคลาภ และการปกป้องทรัพย์ให้มั่นคง",
    meaningEn: "Symbolizes wealth attraction, prosperity, and guarding good fortune."
  },
  px02: {
    nameEn: "Pi Xiu PX02",
    nameTh: "ปี่เซียะ PX02",
    categoryId: "pixiu",
    price: 490,
    meaningTh: "สื่อถึงโชคลาภ การเปิดรับโอกาสทางการเงิน และพลังคุ้มครอง",
    meaningEn: "Symbolizes prosperity, financial opportunity, and protective energy."
  },
  px03: {
    nameEn: "Pi Xiu PX03",
    nameTh: "ปี่เซียะ PX03",
    categoryId: "pixiu",
    price: 590,
    meaningTh: "สื่อถึงการเรียกทรัพย์ ความมั่นคง และพลังเสริมความสำเร็จ",
    meaningEn: "Symbolizes wealth calling, stability, and success energy."
  },
  px04: {
    nameEn: "Pi Xiu PX04",
    nameTh: "ปี่เซียะ PX04",
    categoryId: "pixiu",
    price: 590,
    meaningTh: "สื่อถึงการปกป้องทรัพย์ การกันพลังลบ และความมั่งคั่งที่มั่นคง",
    meaningEn: "Symbolizes wealth protection, energetic shielding, and stable abundance."
  },
  px05: {
    nameEn: "Pi Xiu PX05",
    nameTh: "ปี่เซียะ PX05",
    categoryId: "pixiu",
    price: 690,
    meaningTh: "สื่อถึงเสน่ห์แห่งโชคลาภ โอกาสใหม่ และพลังสนับสนุนด้านการเงิน",
    meaningEn: "Symbolizes charm, luck, new opportunity, and financial support."
  },
  px06: {
    nameEn: "Pi Xiu PX06",
    nameTh: "ปี่เซียะ PX06",
    categoryId: "pixiu",
    price: 690,
    meaningTh: "สื่อถึงพลังคุ้มครอง ความมั่งคั่ง และการเสริมบารมีในการทำงาน",
    meaningEn: "Symbolizes protection, prosperity, and empowered career presence."
  },
  px07: {
    nameEn: "Pi Xiu PX07",
    nameTh: "ปี่เซียะ PX07",
    categoryId: "pixiu",
    price: 790,
    meaningTh: "สื่อถึงโชคลาภระดับพรีเมียม การเก็บทรัพย์ และความสำเร็จที่มั่นคง",
    meaningEn: "Symbolizes premium fortune, wealth keeping, and stable success."
  },
  px08: {
    nameEn: "Pi Xiu PX08",
    nameTh: "ปี่เซียะ PX08",
    categoryId: "pixiu",
    price: 790,
    meaningTh: "สื่อถึงพลังเรียกทรัพย์ ความมั่งคั่ง และการปกป้องโอกาสดี",
    meaningEn: "Symbolizes wealth attraction, abundance, and protection of good opportunities."
  },
  px09: {
    nameEn: "Pi Xiu PX09",
    nameTh: "ปี่เซียะ PX09",
    categoryId: "pixiu",
    price: 890,
    meaningTh: "สื่อถึงการเรียกทรัพย์ โชคลาภ และการรักษาโอกาสทางการเงินให้มั่นคง",
    meaningEn: "Symbolizes wealth attraction, prosperity, and steady financial opportunity."
  },
  tg01: {
    nameEn: "Takrud Ganesha Silver TG01",
    nameTh: "ตะกรุดพระพิฆเนศ เงิน TG01",
    categoryId: "takrud",
    price: 990,
    meaningTh: "สื่อถึงการเปิดทาง ความสำเร็จ การขจัดอุปสรรค และความมั่นใจในการเริ่มต้น",
    meaningEn: "Symbolizes removing obstacles, opening paths, success, and confident beginnings."
  },
  tg03: {
    nameEn: "Ganesha Takrud Silver",
    nameTh: "ตะกรุดพระพิฆเนศ สีเงิน",
    categoryId: "takrud",
    price: 990,
    meaningTh: "สื่อถึงการคุ้มครอง การเปิดทางเรื่องงาน และการสนับสนุนให้เดินหน้าสู่เป้าหมาย",
    meaningEn: "Symbolizes protection, career path opening, and support toward goals."
  },
  tg02: {
    nameEn: "Takrud Ganesha Gold",
    nameTh: "ตะกรุดพระพิฆเนศ ทอง",
    categoryId: "takrud",
    price: 1290,
    meaningTh: "สื่อถึงความสำเร็จ บารมี โชคลาภ และการเปิดทางสู่โอกาสที่ดีกว่า",
    meaningEn: "Symbolizes success, prestige, prosperity, and opening better opportunities."
  },
  tl01: {
    nameEn: "Takrud Lakshmi Gold",
    nameTh: "ตะกรุดพระลักษมี ทอง",
    categoryId: "takrud",
    price: 1190,
    meaningTh: "สื่อถึงความมั่งคั่ง ความอุดมสมบูรณ์ โชคลาภ และพลังสนับสนุนด้านการเงิน",
    meaningEn: "Symbolizes abundance, prosperity, financial luck, and supportive wealth energy."
  },
  bh01: {
    nameEn: "Bee Heart Blue",
    nameTh: "บีฮาร์ท สีน้ำเงิน",
    categoryId: "bee-heart",
    price: 990,
    meaningTh: "สื่อถึงเสน่ห์ เมตตา ความน่ารักน่าเอ็นดู และการสื่อสารที่อ่อนโยน",
    meaningEn: "Symbolizes charm, kindness, gentle attraction, and soft communication."
  },
  bh02: {
    nameEn: "Bee Heart Orange",
    nameTh: "บีฮาร์ท สีส้ม",
    categoryId: "bee-heart",
    price: 990,
    meaningTh: "สื่อถึงเสน่ห์ ความสดใส ความมั่นใจ และพลังดึงดูดแบบอบอุ่น",
    meaningEn: "Symbolizes charm, brightness, confidence, and warm attraction."
  },
  bh03: {
    nameEn: "Bee Heart Purple",
    nameTh: "บีฮาร์ท สีม่วง",
    categoryId: "bee-heart",
    price: 990,
    meaningTh: "สื่อถึงเสน่ห์ลึกลับ ความเมตตา ความน่าดึงดูด และพลังแห่งความอ่อนโยน",
    meaningEn: "Symbolizes mysterious charm, kindness, attraction, and gentle energy."
  }
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

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function stonePrices(targetPrice) {
  return {
    p4: Math.max(1, Math.round(Number(targetPrice) * 0.6)),
    p6: Math.max(1, Math.round(Number(targetPrice) * 0.8)),
    p8: Math.max(1, Math.round(Number(targetPrice)))
  };
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
  setIfChanged(next, "name", curated.nameEn, changes, "name");
  setIfChanged(next, "nameEn", curated.nameEn, changes, "nameEn");
  setIfChanged(next, "nameTh", curated.nameTh, changes, "nameTh");
  setIfChanged(next, "category", curated.categoryId, changes, "category");
  setIfChanged(next, "categoryId", curated.categoryId, changes, "categoryId");
  setIfChanged(next, "meaningTh", curated.meaningTh, changes, "meaningTh");
  setIfChanged(next, "meaning", curated.meaningEn, changes, "meaning");

  const prices = stonePrices(curated.targetPrice);
  ["p4", "p6", "p8"].forEach((priceKey) => {
    setIfChanged(next, priceKey, prices[priceKey], changes, priceKey);
  });

  return { record: next, changes };
}

function updateCharm(charm) {
  const curated = CHARM_UPDATES[charm.id];
  const changes = [];
  if (!curated) return { record: charm, changes };

  const next = { ...charm };
  const categoryId = curated.categoryId;

  if (isPlainObject(next.name)) {
    next.name = { ...next.name };
    setIfChanged(next.name, "en", curated.nameEn, changes, "name.en");
    setIfChanged(next.name, "th", curated.nameTh, changes, "name.th");
  } else {
    setIfChanged(next, "nameEn", curated.nameEn, changes, "nameEn");
    setIfChanged(next, "nameTh", curated.nameTh, changes, "nameTh");
  }

  setIfChanged(next, "categoryId", categoryId, changes, "categoryId");
  setIfChanged(next, "collection", categoryId, changes, "collection");

  if (isPlainObject(next.meaning)) {
    next.meaning = { ...next.meaning };
    setIfChanged(next.meaning, "en", curated.meaningEn, changes, "meaning.en");
    setIfChanged(next.meaning, "th", curated.meaningTh, changes, "meaning.th");
  } else {
    setIfChanged(next, "meaningEn", curated.meaningEn, changes, "meaningEn");
    setIfChanged(next, "meaningTh", curated.meaningTh, changes, "meaningTh");
  }

  if (isPlainObject(next.pricing)) {
    next.pricing = { ...next.pricing };
    setIfChanged(next.pricing, "base", curated.price, changes, "pricing.base");
  } else {
    setIfChanged(next, "price", curated.price, changes, "price");
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
    nameTh: charm.name?.th || charm.nameTh || "",
    nameEn: charm.name?.en || charm.nameEn || "",
    type: charm.type,
    collection: charm.collection,
    categoryId: charm.categoryId,
    image: charm.image?.primary || charm.image || "",
    sizeCm: charm.business?.sizeCm || charm.sizeCm || 0,
    footprintMm: charm.business?.footprintMm || charm.footprintMm || 0,
    visualScale: charm.renderTuning?.visualScale ?? charm.visualScale,
    visualOffsetX: charm.renderTuning?.visualOffsetX ?? charm.visualOffsetX,
    visualOffsetY: charm.renderTuning?.visualOffsetY ?? charm.visualOffsetY,
    maxWidthRatio: charm.renderTuning?.maxWidthRatio ?? charm.maxWidthRatio,
    maxHeightRatio: charm.renderTuning?.maxHeightRatio ?? charm.maxHeightRatio,
    edgeFitMode: charm.renderTuning?.edgeFitMode ?? charm.edgeFitMode,
    targetWidthFillRatio: charm.renderTuning?.targetWidthFillRatio ?? charm.targetWidthFillRatio,
    contactInsetLeft: charm.renderTuning?.contactInsetLeft ?? charm.contactInsetLeft,
    contactInsetRight: charm.renderTuning?.contactInsetRight ?? charm.contactInsetRight,
    rotation: charm.renderTuning?.rotation ?? charm.rotation,
    anchor: charm.renderTuning?.anchor ?? charm.anchor,
    price: charm.pricing?.base || charm.price || 0,
    meaningTh: charm.meaning?.th || charm.meaningTh || "",
    meaningEn: charm.meaning?.en || charm.meaningEn || "",
    inStock: charm.availability?.inStock !== false && charm.inStock !== false,
    isActive: charm.availability?.isActive !== false && charm.isActive !== false,
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
    return { skipped: true, count: rows.length };
  }
  if (isDryRun) {
    console.log(`[dry-run] ${tableName}: ${rows.length} rows ready for Supabase upsert.`);
    return { dryRun: true, count: rows.length };
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
  return { updated: true, count: rows.length };
}

function validateCatalog({ stones, charms }) {
  const missingStones = Object.keys(STONE_UPDATES).filter((id) => !stones.some((stone) => stone.id === id));
  const missingCharms = Object.keys(CHARM_UPDATES).filter((id) => !charms.some((charm) => charm.id === id));
  const invalidStones = stones.filter((stone) => STONE_UPDATES[stone.id] && (!finitePositive(stone.p4) || !finitePositive(stone.p6) || !finitePositive(stone.p8)));
  const invalidCharms = charms.filter((charm) => CHARM_UPDATES[charm.id] && !finitePositive(charm.pricing?.base || charm.price));

  if (missingStones.length || missingCharms.length || invalidStones.length || invalidCharms.length) {
    throw new Error([
      missingStones.length ? `Missing stone records: ${missingStones.join(", ")}` : "",
      missingCharms.length ? `Missing charm records: ${missingCharms.join(", ")}` : "",
      invalidStones.length ? `Invalid stone prices: ${invalidStones.map((stone) => stone.id).join(", ")}` : "",
      invalidCharms.length ? `Invalid charm prices: ${invalidCharms.map((charm) => charm.id).join(", ")}` : ""
    ].filter(Boolean).join("\n"));
  }
}

async function main() {
  const stones = readJson(paths.stones, []);
  const charms = readJson(paths.charms, []);
  const settings = readJson(paths.settings, {});
  const dataJs = readText(paths.dataJs);
  const fallbackCharms = extractArrayConst(dataJs, "CHARM_CATALOG");

  const stoneResults = stones.map((stone) => ({ id: stone.id, ...updateStone(stone) }));
  const updatedStones = stoneResults.map((entry) => entry.record);

  const charmResults = charms.map((charm) => ({ id: charm.id, ...updateCharm(charm) }));
  const updatedCharms = charmResults.map((entry) => entry.record);

  validateCatalog({ stones: updatedStones, charms: updatedCharms });

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
  const settingsChanged = !jsonEqual(settings.catalogCategories || null, CATEGORY_CATALOG);

  summarizeChanges("stones", stoneResults);
  summarizeChanges("charms", charmResults);
  summarizeChanges("data.js CHARM_CATALOG", fallbackResults);
  console.log(`settings: catalogCategories ${settingsChanged ? "updated" : "unchanged"}`);

  if (!isDryRun) {
    if (!jsonEqual(stones, updatedStones)) {
      writeJson(paths.stones, updatedStones);
    }
    if (!jsonEqual(charms, updatedCharms)) {
      writeJson(paths.charms, updatedCharms);
    }
    if (settingsChanged) {
      writeJson(paths.settings, updatedSettings);
    }
    let nextDataJs = replaceArrayConst(dataJs, "DEFAULT_CATEGORY_CATALOG", CATEGORY_CATALOG);
    nextDataJs = replaceArrayConst(nextDataJs, "CHARM_CATALOG", updatedFallbackCharms);
    if (nextDataJs !== dataJs) {
      writeText(paths.dataJs, nextDataJs);
    }
  }

  await upsertRows("catalog_stones", updatedStones.map(buildStoneRow));
  await upsertRows("catalog_charms", updatedCharms.map(buildCharmRow));
  if (settingsChanged) {
    await upsertRows("catalog_categories", CATEGORY_CATALOG.map(buildCategoryRow));
  } else {
    console.log("catalog_categories: skipped; category data unchanged.");
  }

  const unmatchedStones = stones.map((stone) => stone.id).filter((id) => !STONE_UPDATES[id]);
  const unmatchedCharms = charms.map((charm) => charm.id).filter((id) => !CHARM_UPDATES[id]);
  console.log(`unmatched stones: ${unmatchedStones.length ? unmatchedStones.join(", ") : "none"}`);
  console.log(`unmatched charms: ${unmatchedCharms.length ? unmatchedCharms.join(", ") : "none"}`);
  console.log(`Catalog update ${isDryRun ? "dry-run" : "completed"}.`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
