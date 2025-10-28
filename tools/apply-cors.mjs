// tools/apply-cors.mjs  (ESM version)
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Where your Netlify functions live
const FN_DIR = path.resolve(__dirname, "../netlify/functions");

// Files to ignore (your shared files or already-wrapped CORS)
const IGNORE = new Set(["_supabase.js", "cors.js"]);

const read = (p) => fs.readFile(p, "utf8");
const write = (p, s) => fs.writeFile(p, s, "utf8");

const hasImportCors = (s) =>
  /\bimport\s+cors\b.*from\s+['"]\.\/cors\.js['"]/.test(s);

function wrapHandlerESM(src) {
  let out = src;
  let changed = false;

  // Ensure import cors at top (after any "use client"/comments)
  if (!hasImportCors(out)) {
    out = `import cors from './cors.js';\n` + out;
    changed = true;
  }

  // Pattern 1: export async function handler(...)
  if (/\bexport\s+async\s+function\s+handler\s*\(/.test(out)) {
    out = out.replace(
      /\bexport\s+async\s+function\s+handler\s*\(/,
      `async function __rawHandler(`
    );
    out += `\nexport const handler = cors(__rawHandler);\n`;
    changed = true;
  }

  // Pattern 2: export const handler = ...
  else if (/\bexport\s+const\s+handler\s*=/.test(out)) {
    out = out.replace(/\bexport\s+const\s+handler\s*=/, `const __rawHandler =`);
    out += `\nexport const handler = cors(__rawHandler);\n`;
    changed = true;
  }

  // Pattern 3: export default async function handler(...)
  else if (/\bexport\s+default\s+async\s+function\s+handler\s*\(/.test(out)) {
    out = out.replace(
      /\bexport\s+default\s+async\s+function\s+handler\s*\(/,
      `async function __rawHandler(`
    );
    out += `\nexport default cors(__rawHandler);\n`;
    changed = true;
  }

  // Pattern 4: export default handler;  (where handler was defined above)
  else if (/\bexport\s+default\s+handler\b/.test(out)) {
    out = out
      .replace(/\bexport\s+default\s+handler\b/, `export default cors(handler)`);
    changed = true;
  }

  return { out, changed };
}

(async () => {
  const entries = await fs.readdir(FN_DIR, { withFileTypes: true });

  let patched = 0;
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".js")) continue;
    if (IGNORE.has(ent.name)) continue;

    const full = path.join(FN_DIR, ent.name);
    const src = await read(full);

    // Skip already wrapped files
    if (src.includes("cors(__rawHandler)") || src.includes("export default cors(") || src.includes("export const handler = cors(")) {
      continue;
    }

    const { out, changed } = wrapHandlerESM(src);
    if (changed) {
      await write(full, out);
      console.log(`Patched: ${ent.name}`);
      patched++;
    }
  }

  if (patched === 0) {
    console.log("No files needed changes or they are already wrapped.");
  } else {
    console.log(`Done. Patched ${patched} file(s).`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
