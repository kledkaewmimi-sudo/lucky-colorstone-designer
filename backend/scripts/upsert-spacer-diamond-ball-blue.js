#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const unknownArgs = [...args].filter((arg) => !["--dry-run", "--help", "-h"].includes(arg));

const spacer = {
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
};

function printUsage() {
  console.log("Usage: node scripts/upsert-spacer-diamond-ball-blue.js [--dry-run]");
}

function validateSupabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid project URL.");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  if (pathName) {
    throw new Error("SUPABASE_URL must be the project root URL, not a REST endpoint.");
  }

  return parsed.origin;
}

function buildRow() {
  return {
    id: spacer.id,
    payload: spacer,
    display_order: spacer.displayOrder,
    in_stock: spacer.inStock,
    is_active: spacer.isActive
  };
}

async function main() {
  if (args.has("--help") || args.has("-h")) {
    printUsage();
    return;
  }
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown option(s): ${unknownArgs.join(", ")}`);
  }

  const row = buildRow();
  if (dryRun) {
    console.log(`[dry-run] catalog_spacers: 1 row ready to upsert (${row.id}).`);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.");
  }

  const endpoint = `${validateSupabaseUrl(supabaseUrl)}/rest/v1/catalog_spacers?on_conflict=id`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([row])
  });

  if (!response.ok) {
    throw new Error(`catalog_spacers upsert failed: ${response.status} ${await response.text()}`);
  }
  console.log(`catalog_spacers: upserted 1 row (${row.id}).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
