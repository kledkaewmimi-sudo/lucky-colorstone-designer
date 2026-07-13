#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const MAX_DIMENSION_PX = 800;
const WEBP_QUALITY = 82;
const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const unknownArgs = [...args].filter((arg) => !["--dry-run", "--force", "--help", "-h"].includes(arg));

function printUsage() {
  console.log(`
Usage:
  node scripts/optimize-assets-to-webp.js --dry-run
  node scripts/optimize-assets-to-webp.js
  node scripts/optimize-assets-to-webp.js --force

Options:
  --dry-run  Scan and report what would be converted without writing files.
  --force    Regenerate .webp files even when they are newer than the source.
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function toRelative(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
}

function getWebpPath(sourcePath) {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}.webp`);
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function scanImages(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await scanImages(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (SOURCE_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function buildPlan(sourceFiles) {
  const plan = [];

  for (const sourcePath of sourceFiles) {
    const outputPath = getWebpPath(sourcePath);
    const sourceStat = await fsp.stat(sourcePath);
    const outputExists = await pathExists(outputPath);
    const outputStat = outputExists ? await fsp.stat(outputPath) : null;
    const isFresh = outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs;
    const shouldConvert = force || !isFresh;

    plan.push({
      sourcePath,
      outputPath,
      sourceSize: sourceStat.size,
      outputSize: outputStat?.size ?? null,
      outputExists,
      isFresh: Boolean(isFresh),
      shouldConvert
    });
  }

  return plan.sort((a, b) => b.sourceSize - a.sourceSize);
}

function loadSharp() {
  try {
    return require("sharp");
  } catch (error) {
    console.error("Missing dependency: sharp");
    console.error("Install project dependencies before running real conversion:");
    console.error("  npm install");
    console.error("");
    console.error("Dry-run does not require sharp:");
    console.error("  node scripts/optimize-assets-to-webp.js --dry-run");
    process.exit(1);
  }
}

async function convertImage(sharp, item) {
  const outputBuffer = await sharp(item.sourcePath)
    .rotate()
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  await fsp.writeFile(item.outputPath, outputBuffer);
  return outputBuffer.length;
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`Assets directory not found: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const sourceFiles = await scanImages(ASSETS_DIR);
  const plan = await buildPlan(sourceFiles);
  const toConvert = plan.filter((item) => item.shouldConvert);
  const skipped = plan.length - toConvert.length;

  console.log(`Asset optimization mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(`Assets scanned: ${plan.length}`);
  console.log(`Will convert: ${toConvert.length}`);
  console.log(`Skipped fresh WebP files: ${skipped}`);
  console.log(`Max dimension: ${MAX_DIMENSION_PX}px`);
  console.log(`WebP quality: ${WEBP_QUALITY}`);
  console.log("");

  if (toConvert.length === 0) {
    console.log("No assets need conversion.");
    return;
  }

  let totalSourceBytes = 0;
  let totalOutputBytes = 0;
  const sharp = dryRun ? null : loadSharp();

  for (const item of toConvert) {
    totalSourceBytes += item.sourceSize;

    if (dryRun) {
      const existingText = item.outputExists ? `existing ${formatBytes(item.outputSize)}` : "new";
      console.log(`[dry-run] ${toRelative(item.sourcePath)} -> ${toRelative(item.outputPath)} (${formatBytes(item.sourceSize)} -> ${existingText})`);
      continue;
    }

    const outputSize = await convertImage(sharp, item);
    totalOutputBytes += outputSize;
    const saved = item.sourceSize - outputSize;
    const savedText = saved >= 0 ? `saved ${formatBytes(saved)}` : `larger by ${formatBytes(Math.abs(saved))}`;
    console.log(`${toRelative(item.sourcePath)} -> ${toRelative(item.outputPath)} (${formatBytes(item.sourceSize)} -> ${formatBytes(outputSize)}, ${savedText})`);
  }

  if (dryRun) {
    console.log("");
    console.log(`Dry-run total source size selected: ${formatBytes(totalSourceBytes)}`);
    console.log("Run without --dry-run to write WebP files and calculate actual savings.");
    return;
  }

  const totalSaved = totalSourceBytes - totalOutputBytes;
  console.log("");
  console.log(`Converted: ${toConvert.length}`);
  console.log(`Before: ${formatBytes(totalSourceBytes)}`);
  console.log(`After: ${formatBytes(totalOutputBytes)}`);
  console.log(`Total ${totalSaved >= 0 ? "saved" : "increase"}: ${formatBytes(Math.abs(totalSaved))}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
