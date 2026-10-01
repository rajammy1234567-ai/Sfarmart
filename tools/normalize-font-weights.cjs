const fs = require("fs");
const path = require("path");

const exts = [".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".html"];

function normalizeFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let original = content;

  // Replace CSS numeric weights 900/800/700 -> 600
  content = content.replace(
    /font-weight\s*:\s*(?:900|800|700)\b/g,
    "font-weight: 600",
  );
  // Then reduce 600 -> 500
  content = content.replace(/font-weight\s*:\s*600\b/g, "font-weight: 500");

  // Replace JS style quotes and numbers: fontWeight: '900' / "900" / 900 -> '600'
  content = content.replace(
    /fontWeight\s*:\s*['\"]?(?:900|800|700)['\"]?/g,
    "fontWeight: '600'",
  );
  // Then reduce 600 -> 500
  content = content.replace(
    /fontWeight\s*:\s*['\"]?600['\"]?/g,
    "fontWeight: '500'",
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log("Normalized font weights in", filePath);
    return true;
  }
  return false;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full);
    } else {
      if (exts.includes(path.extname(entry.name))) {
        try {
          normalizeFile(full);
        } catch (err) {
          console.error("ERR", full, err.message);
        }
      }
    }
  }
}

const target = process.argv[2] || ".";
console.log("Normalizing font weights under", target);
walk(path.resolve(target));
console.log("Done.");
