import cors from './cors.js';
// tools/apply-cors.js
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const fnDir = path.join(root, "netlify", "functions");

const SKIP = new Set(["_supabase.js", "cors.js"]);

function listFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".js"));
}

function patchFile(full) {
  let src = fs.readFileSync(full, "utf8");
  const file = path.basename(full);

  if (SKIP.has(file)) return false;

  let changed = false;

  // 1) Fix wrong imports -> const cors = require("./cors");
  const wrong1 = /const\s*\{\s*cors\s*\}\s*=\s*require\(["']\.\/cors["']\)\s*;?/;
  const wrong2 = /const\s*cors2?\s*=\s*require\(["']\.\/cors["']\)\.cors\s*;?/;
  const wrong3 = /import\s+cors\s+from\s+["']\.\/cors["']\s*;?/;

  if (wrong1.test(src) || wrong2.test(src) || wrong3.test(src)) {
    src = src
      .replace(wrong1, 'const cors = require("./cors");')
      .replace(wrong2, 'const cors = require("./cors");')
      .replace(wrong3, 'const cors = require("./cors");');
    changed = true;
  }

  // 2) Ensure a proper require exists near top if none present
  if (!/require\(["']\.\/cors["']\)/.test(src)) {
    // insert after 'use strict' or first line
    const lines = src.split("\n");
    let insertAt = 0;
    if (/^['"]use strict['"];?/.test(lines[0])) insertAt = 1;
    lines.splice(insertAt, 0, 'const cors = require("./cors");');
    src = lines.join("\n");
    changed = true;
  }

  // 3) Wrap exports.handler if not already wrapped
  // a) inline form: exports.handler = async (...) => { ... };
  const inlineRE = /exports\.handler\s*=\s*(async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\});?/m;
  if (inlineRE.test(src) && !/exports\.handler\s*=\s*cors\(/.test(src)) {
    src = src.replace(inlineRE, (m, fn) => `exports.handler = cors(${fn});`);
    changed = true;
  }

  // b) named function form: async function handler(...) { ... } exports.handler = handler;
  const nameAssignRE = /exports\.handler\s*=\s*([A-Za-z$_][A-Za-z0-9$_]*)\s*;?/;
  if (nameAssignRE.test(src) && !/exports\.handler\s*=\s*cors\(/.test(src)) {
    src = src.replace(nameAssignRE, (m, name) => `exports.handler = cors(${name});`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(full, src, "utf8");
  }
  return changed;
}

function run() {
  if (!fs.existsSync(fnDir)) {
    console.error("Cannot find netlify/functions directory.");
    process.exit(1);
  }

  const files = listFiles(fnDir);
  let touched = 0;

  for (const f of files) {
    const full = path.join(fnDir, f);
    if (patchFile(full)) {
      console.log("Patched:", f);
      touched++;
    }
  }

  console.log(touched ? `✅ Patched ${touched} files.` : "No changes needed.");
}

run();
