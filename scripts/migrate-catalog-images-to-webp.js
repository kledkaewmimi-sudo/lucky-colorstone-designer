#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const DATA_JS_PATH = path.join(ROOT_DIR, "data.js");
const STONES_PATH = path.join(DATA_DIR, "stones.json");
const CHARMS_PATH = path.join(DATA_DIR, "charms.json");
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
const DATA_JS_ASSET_STRING_RE = /(["'`])((?:\/?assets\/)[^"'`]+?\.(?:png|jpe?g))\1/gi;
const SUPABASE_TABLES = [
  { table: "catalog_stones", label: "Supabase stones" },
  { table: "catalog_charms", label: "Supabase charms" },
  { table: "catalog_spacers", label: "Supabase spacers" }
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipSupabase = args.has("--skip-supabase");
const unknownArgs = [...args].filter((arg) => !["--dry-run", "--skip-supabase", "--help", "-h"].includes(arg));

function printUsage() {
  console.log(`
Usage:
  node scripts/migrate-catalog-images-to-webp.js --dry-run
  node scripts/migrate-catalog-images-to-webp.js
  node scripts/migrate-catalog-images-to-webp.js --skip-supabase

Options:
  --dry-run        Report local and Supabase changes without writing.
  --skip-supabase  Update local files only, even when Supabase env vars exist.
`.trim());
}

if (args.has("--help") || args.has("-h")) {
  printUsage();
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown option(s): ${unknownArgs.join(", ")}`);
  printUsage();
  process.exit(1);
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function getAssetFilePath(assetPath) {
  const normalized = normalizeSlashes(assetPath).replace(/^\/+/, "");
  if (!normalized.startsWith("assets/")) return null;
  return path.join(ROOT_DIR, ...normalized.split("/"));
}

function getMatchingWebpPath(imagePath) {
  if (typeof imagePath !== "string" || !IMAGE_EXT_RE.test(imagePath)) {
    return { nextPath: imagePath, webpExists: false, webpFilePath: null };
  }

  const nextPath = imagePath.replace(IMAGE_EXT_RE, ".webp");
  const webpFilePath = getAssetFilePath(nextPath);
  return {
    nextPath,
    webpExists: Boolean(webpFilePath && fs.existsSync(webpFilePath)),
    webpFilePath
  };
}

function describeChange(scope, id, fieldPath, from, to) {
  const target = id ? `${scope}:${id}` : scope;
  return { scope, id, fieldPath, from, to, target };
}

function maybeUpdateImagePath(record, fieldPath, changes, skipped, scope, id) {
  const parts = fieldPath.split(".");
  let target = record;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target = target?.[parts[index]];
    if (!target || typeof target !== "object") return;
  }

  const field = parts[parts.length - 1];
  const value = target?.[field];
  if (typeof value !== "string" || !IMAGE_EXT_RE.test(value)) return;

  const { nextPath, webpExists } = getMatchingWebpPath(value);
  if (!webpExists) {
    skipped.push({ scope, id, fieldPath, path: value, reason: "matching .webp not found" });
    return;
  }

  if (value === nextPath) return;
  target[field] = nextPath;
  changes.push(describeChange(scope, id, fieldPath, value, nextPath));
}

function updateCatalogRecords(records, scope) {
  const nextRecords = JSON.parse(JSON.stringify(records));
  const changes = [];
  const skipped = [];

  nextRecords.forEach((record, index) => {
    const id = record?.id || record?.sku || `index-${index}`;
    maybeUpdateImagePath(record, "image", changes, skipped, scope, id);
    maybeUpdateImagePath(record, "image.primary", changes, skipped, scope, id);
  });

  return { records: nextRecords, changes, skipped };
}

async function readJsonArray(filePath) {
  const text = await fsp.readFile(filePath, "utf8");
  const hasBom = text.charCodeAt(0) === 0xfeff;
  const parsed = JSON.parse(hasBom ? text.slice(1) : text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.relative(ROOT_DIR, filePath)} must contain a JSON array.`);
  }
  return { records: parsed, text };
}

async function updateJsonFile(filePath, scope) {
  const { records, text } = await readJsonArray(filePath);
  const result = updateCatalogRecords(records, scope);
  if (!dryRun && result.changes.length > 0) {
    let nextText = text;
    result.changes.forEach((change) => {
      nextText = nextText.split(JSON.stringify(change.from)).join(JSON.stringify(change.to));
    });
    await fsp.writeFile(filePath, nextText, "utf8");
  }
  return result;
}

async function updateDataJsFile() {
  const text = await fsp.readFile(DATA_JS_PATH, "utf8");
  const changes = [];
  const skipped = [];

  const nextText = text.replace(DATA_JS_ASSET_STRING_RE, (match, quote, imagePath) => {
    const { nextPath, webpExists } = getMatchingWebpPath(imagePath);
    if (!webpExists) {
      skipped.push({ scope: "data.js", id: "", fieldPath: "asset string", path: imagePath, reason: "matching .webp not found" });
      return match;
    }
    if (imagePath === nextPath) return match;
    changes.push(describeChange("data.js", "", "asset string", imagePath, nextPath));
    return `${quote}${nextPath}${quote}`;
  });

  if (!dryRun && changes.length > 0) {
    await fsp.writeFile(DATA_JS_PATH, nextText, "utf8");
  }

  return { changes, skipped };
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  return { url, serviceRoleKey, configured: Boolean(url && serviceRoleKey) };
}

async function supabaseRequest(table, { method = "GET", params = {}, body = null, prefer = "" } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      endpoint.searchParams.set(key, String(value));
    }
  });

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
  if (body !== null) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = payload?.message || payload?.error || text || `HTTP ${response.status}`;
    throw new Error(`${table} ${method} failed: ${detail}`);
  }
  return payload;
}

async function updateSupabaseTable(tableConfig) {
  const rows = await supabaseRequest(tableConfig.table, {
    params: { select: "id,payload" }
  });
  const sourceRecords = Array.isArray(rows) ? rows.map((row) => row.payload).filter(Boolean) : [];
  const result = updateCatalogRecords(sourceRecords, tableConfig.label);
  const changedIds = new Set(result.changes.map((change) => change.id));
  const rowsToUpdate = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && changedIds.has(row.id))
    .map((row) => ({
      id: row.id,
      payload: result.records.find((record) => record?.id === row.id) || row.payload
    }));

  if (!dryRun && rowsToUpdate.length > 0) {
    await supabaseRequest(tableConfig.table, {
      method: "POST",
      params: { on_conflict: "id" },
      body: rowsToUpdate,
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  return { ...result, rowCount: rowsToUpdate.length };
}

function logResult(title, result) {
  console.log(`\n${title}`);
  if (result.changes.length === 0) {
    console.log("  No image path changes.");
  } else {
    result.changes.forEach((change) => {
      console.log(`  ${change.target} ${change.fieldPath}: ${change.from} -> ${change.to}`);
    });
  }

  if (result.skipped.length > 0) {
    console.log("  Skipped:");
    result.skipped.forEach((skip) => {
      const idPart = skip.id ? `${skip.scope}:${skip.id}` : skip.scope;
      console.log(`  ${idPart} ${skip.fieldPath}: ${skip.path} (${skip.reason})`);
    });
  }
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(`Missing assets directory: ${ASSETS_DIR}`);
  }

  console.log(`Catalog image WebP migration mode: ${dryRun ? "dry-run" : "write"}`);

  const localResults = [
    { title: "data/stones.json", result: await updateJsonFile(STONES_PATH, "stones.json") },
    { title: "data/charms.json", result: await updateJsonFile(CHARMS_PATH, "charms.json") },
    { title: "data.js fallback catalogs", result: await updateDataJsFile() }
  ];

  localResults.forEach(({ title, result }) => logResult(title, result));

  const supabaseConfig = getSupabaseConfig();
  const supabaseResults = [];
  if (skipSupabase) {
    console.log("\nSupabase skipped by --skip-supabase.");
  } else if (!supabaseConfig.configured) {
    console.log("\nSupabase skipped: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set.");
  } else {
    for (const tableConfig of SUPABASE_TABLES) {
      const result = await updateSupabaseTable(tableConfig);
      supabaseResults.push({ title: tableConfig.table, result });
      logResult(tableConfig.table, result);
    }
  }

  const allResults = [...localResults, ...supabaseResults].map((entry) => entry.result);
  const totalChanges = allResults.reduce((sum, result) => sum + result.changes.length, 0);
  const totalSkipped = allResults.reduce((sum, result) => sum + result.skipped.length, 0);

  console.log("\nSummary");
  console.log(`  Image paths ${dryRun ? "that would change" : "changed"}: ${totalChanges}`);
  console.log(`  Skipped paths: ${totalSkipped}`);
  if (dryRun) {
    console.log("  No files or Supabase rows were modified.");
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
