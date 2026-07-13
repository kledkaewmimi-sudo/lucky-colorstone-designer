#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const dataJsPath = path.join(repoRoot, "data.js");

const isDryRun = process.argv.includes("--dry-run");
const isVerbose = process.argv.includes("--verbose");
const ALLOWED_TABLES = new Set([
  "catalog_stones",
  "catalog_charms",
  "catalog_spacers",
  "catalog_categories",
  "app_settings",
  "catalog_layout_order",
  "orders"
]);

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function findBalancedExpression(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unable to find balanced ${openChar}${closeChar} expression.`);
}

function extractArrayConst(source, constName) {
  const marker = `${constName} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return [];

  const arrayStart = source.indexOf("[", markerIndex);
  if (arrayStart < 0) return [];

  const expression = findBalancedExpression(source, arrayStart, "[", "]");
  return vm.runInNewContext(expression, Object.create(null), { timeout: 1000 });
}

function extractObjectFreezeArray(source, constName) {
  const marker = `${constName} = Object.freeze(`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return [];

  const arrayStart = source.indexOf("[", markerIndex);
  if (arrayStart < 0) return [];

  const expression = findBalancedExpression(source, arrayStart, "[", "]");
  return vm.runInNewContext(expression, Object.create(null), { timeout: 1000 });
}

function toInt(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeStoneRow(stone, index) {
  return {
    id: String(stone.id).trim(),
    payload: stone,
    category_id: String(stone.categoryId || stone.category || "").trim() || null,
    display_order: toInt(stone.displayOrder, (index + 1) * 10),
    in_stock: stone.inStock !== false,
    is_active: stone.isActive !== false
  };
}

function normalizeCharmRow(charm, index) {
  return {
    id: String(charm.id).trim(),
    payload: charm,
    category_id: String(charm.categoryId || charm.collection || "").trim() || null,
    display_order: toInt(charm.displayOrder, (index + 1) * 10),
    in_stock: charm.availability?.inStock !== false && charm.inStock !== false,
    is_active: charm.availability?.isActive !== false && charm.isActive !== false
  };
}

function normalizeSpacerRow(spacer, index) {
  return {
    id: String(spacer.id).trim(),
    payload: spacer,
    display_order: toInt(spacer.displayOrder, (index + 1) * 10),
    in_stock: spacer.availability?.inStock !== false && spacer.inStock !== false,
    is_active: spacer.availability?.isActive !== false && spacer.isActive !== false
  };
}

function normalizeCategoryRow(category, index) {
  const id = String(category.id || category.slug || "").trim();
  return {
    id,
    entity_type: String(category.entityType || category.scope || category.kind || "stone").trim().toLowerCase(),
    slug: String(category.slug || id).trim() || null,
    name_en: String(category.nameEn || category.name?.en || "").trim() || null,
    name_th: String(category.nameTh || category.name?.th || "").trim() || null,
    display_order: toInt(category.displayOrder, (index + 1) * 10),
    is_active: category.isActive !== false,
    payload: category
  };
}

function normalizeOrderRow(order) {
  const id = String(order.id || order.orderId || "").trim();
  return {
    id,
    status: order.status ? String(order.status) : null,
    customer_name: order.customerName ? String(order.customerName) : null,
    line_user_id: order.lineUserId ? String(order.lineUserId) : null,
    stripe_checkout_session_id: order.stripeCheckoutSessionId ? String(order.stripeCheckoutSessionId) : null,
    stripe_payment_status: order.stripePaymentStatus ? String(order.stripePaymentStatus) : null,
    net_price: toNumberOrNull(order.netPrice),
    final_price: toNumberOrNull(order.finalPrice),
    total_price: toNumberOrNull(order.totalPrice),
    payload: order,
    date: order.date || null
  };
}

function compactRows(rows, tableName) {
  const skipped = [];
  const seen = new Set();
  const compacted = [];

  rows.forEach((row, index) => {
    if (!row.id) {
      skipped.push({ index, reason: "missing id" });
      return;
    }
    if (seen.has(row.id)) {
      skipped.push({ index, reason: `duplicate id '${row.id}'` });
      return;
    }
    seen.add(row.id);
    compacted.push(row);
  });

  if (skipped.length > 0) {
    console.warn(`${tableName}: skipped ${skipped.length} invalid or duplicate rows.`);
    skipped.slice(0, 10).forEach((entry) => {
      console.warn(`  - source index ${entry.index}: ${entry.reason}`);
    });
  }

  return compacted;
}

function validateTableName(tableName) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Invalid Supabase table name '${tableName}'. Use a plain table name without slashes.`);
  }
  if (tableName.includes("/") || tableName.includes(".")) {
    throw new Error(`Invalid Supabase table path '${tableName}'. Do not use a URL, schema prefix, or leading slash.`);
  }
}

function logTargetTable(tableName, rows) {
  validateTableName(tableName);
  if (isDryRun || isVerbose) {
    console.log(`Target table: ${tableName} (${rows.length} rows)`);
  }
}

function validateSupabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL such as https://your-project.supabase.co.");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  if (pathName && pathName !== "") {
    throw new Error(
      "SUPABASE_URL must be the project root URL, not a REST endpoint. " +
      "Use https://your-project.supabase.co, not a URL ending in /rest/v1."
    );
  }

  return parsed.origin;
}

async function upsertRows(supabase, tableName, rows) {
  logTargetTable(tableName, rows);

  if (isDryRun) {
    console.log(`[dry-run] ${tableName}: ${rows.length} rows ready to upsert.`);
    return;
  }

  if (rows.length === 0) {
    console.log(`${tableName}: no rows to upsert.`);
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`${tableName} upsert failed: ${error.message}`);
  }

  console.log(`${tableName}: upserted ${rows.length} rows.`);
}

async function upsertKeyRows(supabase, tableName, rows) {
  logTargetTable(tableName, rows);

  if (isDryRun) {
    console.log(`[dry-run] ${tableName}: ${rows.length} rows ready to upsert.`);
    return;
  }

  if (rows.length === 0) {
    console.log(`${tableName}: no rows to upsert.`);
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: "key" });

  if (error) {
    throw new Error(`${tableName} upsert failed: ${error.message}`);
  }

  console.log(`${tableName}: upserted ${rows.length} rows.`);
}

function loadMigrationData() {
  const dataJs = fs.readFileSync(dataJsPath, "utf8");
  const stonesPath = path.join(dataDir, "stones.json");
  const charmsPath = path.join(dataDir, "charms.json");
  const settingsPath = path.join(dataDir, "settings.json");
  const ordersPath = path.join(dataDir, "orders.json");

  const stones = readJsonFile(stonesPath, []);
  const charms = readJsonFile(charmsPath, []);
  const settings = readJsonFile(settingsPath, {});
  const orders = readJsonFile(ordersPath, []);
  const spacers = extractObjectFreezeArray(dataJs, "SPACER_CATALOG");
  const defaultCategories = extractArrayConst(dataJs, "DEFAULT_CATEGORY_CATALOG");
  const categories = Array.isArray(settings.catalogCategories) && settings.catalogCategories.length > 0
    ? settings.catalogCategories
    : defaultCategories;

  return {
    sourceFiles: {
      stonesPath,
      charmsPath,
      settingsPath,
      ordersPath,
      dataJsPath
    },
    stones: Array.isArray(stones) ? stones : [],
    charms: Array.isArray(charms) ? charms : [],
    spacers: Array.isArray(spacers) ? spacers : [],
    categories: Array.isArray(categories) ? categories : [],
    settings: settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {},
    orders: Array.isArray(orders) ? orders : []
  };
}

async function main() {
  const migrationData = loadMigrationData();

  const stoneRows = compactRows(migrationData.stones.map(normalizeStoneRow), "catalog_stones");
  const charmRows = compactRows(migrationData.charms.map(normalizeCharmRow), "catalog_charms");
  const spacerRows = compactRows(migrationData.spacers.map(normalizeSpacerRow), "catalog_spacers");
  const categoryRows = compactRows(migrationData.categories.map(normalizeCategoryRow), "catalog_categories");
  const orderRows = compactRows(migrationData.orders.map(normalizeOrderRow), "orders");
  const settingsRows = Object.entries(migrationData.settings).map(([key, value]) => ({ key, value }));
  const layoutRows = [{
    key: "default",
    value: migrationData.settings.catalogLayoutOrder || { stones: [], charms: [], spacers: [] }
  }];

  console.log(`Mode: ${isDryRun ? "dry-run" : "real migration"}`);
  console.log("Source files detected:");
  Object.values(migrationData.sourceFiles).forEach((filePath) => {
    console.log(`  - ${path.relative(repoRoot, filePath)}${fs.existsSync(filePath) ? "" : " (missing)"}`);
  });

  console.log("Prepared row counts:");
  console.log(`  catalog_stones: ${stoneRows.length}`);
  console.log(`  catalog_charms: ${charmRows.length}`);
  console.log(`  catalog_spacers: ${spacerRows.length}`);
  console.log(`  catalog_categories: ${categoryRows.length}`);
  console.log(`  app_settings: ${settingsRows.length}`);
  console.log(`  catalog_layout_order: ${layoutRows.length}`);
  console.log(`  orders: ${orderRows.length}`);

  if (!isDryRun) {
    const { createClient } = require("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for real migration mode.");
    }

    const supabase = createClient(validateSupabaseUrl(supabaseUrl), serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    await upsertRows(supabase, "catalog_stones", stoneRows);
    await upsertRows(supabase, "catalog_charms", charmRows);
    await upsertRows(supabase, "catalog_spacers", spacerRows);
    await upsertRows(supabase, "catalog_categories", categoryRows);
    await upsertKeyRows(supabase, "app_settings", settingsRows);
    await upsertKeyRows(supabase, "catalog_layout_order", layoutRows);
    await upsertRows(supabase, "orders", orderRows);
  } else {
    await upsertRows(null, "catalog_stones", stoneRows);
    await upsertRows(null, "catalog_charms", charmRows);
    await upsertRows(null, "catalog_spacers", spacerRows);
    await upsertRows(null, "catalog_categories", categoryRows);
    await upsertKeyRows(null, "app_settings", settingsRows);
    await upsertKeyRows(null, "catalog_layout_order", layoutRows);
    await upsertRows(null, "orders", orderRows);
  }

  console.log("Migration script completed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
