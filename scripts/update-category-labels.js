#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const help = args.has("--help") || args.has("-h");
const unknownArgs = [...args].filter((arg) => !["--dry-run", "--help", "-h"].includes(arg));

const LABELS = {
  charm: { nameTh: "เครื่องราง", nameEn: "Talismans" },
  spacer: { nameTh: "ชาร์ม", nameEn: "Charms" }
};

const TOP_LEVEL_IDS = {
  charm: new Set(["charm", "charms", "talisman", "talismans"]),
  spacer: new Set(["spacer", "spacers", "decorative_charm", "decorative_charms"])
};

function printUsage() {
  console.log(`
Usage:
  node scripts/update-category-labels.js --dry-run
  node scripts/update-category-labels.js

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

This updates display labels only. It preserves IDs, slugs, entity_type values, and catalog item payloads.
`.trim());
}

if (help) {
  printUsage();
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown option(s): ${unknownArgs.join(", ")}`);
  printUsage();
  process.exit(1);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isTopLevelCategory(category, entityType) {
  const ids = TOP_LEVEL_IDS[entityType] || new Set();
  return ids.has(normalize(category.id)) || ids.has(normalize(category.slug));
}

function patchCategoryPayload(payload, entityType) {
  const label = LABELS[entityType];
  if (!label || !payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    nameEn: label.nameEn,
    nameTh: label.nameTh,
    name: {
      ...(payload.name && typeof payload.name === "object" ? payload.name : {}),
      en: label.nameEn,
      th: label.nameTh
    }
  };
}

function patchSettingsValue(value) {
  if (!Array.isArray(value)) return { value, changed: false };
  let changed = false;
  const nextValue = value.map((category) => {
    const entityType = normalize(category?.entityType || category?.scope || category?.kind);
    if (!["charm", "spacer"].includes(entityType) || !isTopLevelCategory(category, entityType)) {
      return category;
    }

    const label = LABELS[entityType];
    changed = true;
    return {
      ...category,
      nameEn: label.nameEn,
      nameTh: label.nameTh,
      name: {
        ...(category.name && typeof category.name === "object" ? category.name : {}),
        en: label.nameEn,
        th: label.nameTh
      }
    };
  });
  return { value: nextValue, changed };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch (error) {
    console.error("Missing dependency: @supabase/supabase-js. Run `npm install @supabase/supabase-js` if it is not installed.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const summary = {
    catalogCategoriesMatched: 0,
    catalogCategoriesUpdated: 0,
    appSettingsUpdated: 0
  };

  const { data: categories, error: categoryError } = await supabase
    .from("catalog_categories")
    .select("id, entity_type, slug, payload");

  if (categoryError) throw categoryError;

  for (const row of categories || []) {
    const entityType = normalize(row.entity_type);
    if (!["charm", "spacer"].includes(entityType) || !isTopLevelCategory({ id: row.id, slug: row.slug }, entityType)) {
      continue;
    }

    const label = LABELS[entityType];
    const nextPayload = patchCategoryPayload(row.payload || {}, entityType);
    summary.catalogCategoriesMatched += 1;
    console.log(`${dryRun ? "Would update" : "Updating"} catalog_categories.${row.id}: ${label.nameTh} / ${label.nameEn}`);

    if (!dryRun) {
      const { error } = await supabase
        .from("catalog_categories")
        .update({
          name_th: label.nameTh,
          name_en: label.nameEn,
          payload: nextPayload
        })
        .eq("id", row.id);
      if (error) throw error;
      summary.catalogCategoriesUpdated += 1;
    }
  }

  const { data: settingsRows, error: settingsError } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", "catalogCategories");

  if (settingsError) throw settingsError;

  for (const row of settingsRows || []) {
    const patched = patchSettingsValue(row.value);
    if (!patched.changed) continue;
    console.log(`${dryRun ? "Would update" : "Updating"} app_settings.catalogCategories labels.`);

    if (!dryRun) {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: patched.value })
        .eq("key", row.key);
      if (error) throw error;
      summary.appSettingsUpdated += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
