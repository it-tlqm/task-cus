/* Replace static Material Symbol spans with the V5 lucide bridge. */
const fs = require("fs");
const path = require("path");

const roots = ["src/app", "src/components"];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) files.push(full);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);

const importLine = 'import { V5Icon } from "@/components/v5/ui/icon";';
let changedFiles = 0;
let replaced = 0;
let skipped = 0;

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  const before = source;
  source = source.replace(
    /<span([^>]*)>\s*([a-z0-9_]+)\s*<\/span>/g,
    (full, attrs, name) => {
      if (!attrs.includes("material-symbols-")) return full;
      const classNameMatch = attrs.match(/className="([^"]*)"/);
      if (!classNameMatch) {
        skipped++;
        return full;
      }
      const className = classNameMatch[1]
        .replace(/\bmaterial-symbols-(outlined|rounded|sharp)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const titleMatch = attrs.match(/title="([^"]*)"/);
      const styleMatch = attrs.match(/style=\{\{[^}]*\}\}/);
      const props = [
        `name="${name}"`,
        className ? `className="${className}"` : "",
        titleMatch ? `title="${titleMatch[1]}"` : "",
        styleMatch ? styleMatch[0] : "",
      ]
        .filter(Boolean)
        .join(" ");
      replaced++;
      return `<V5Icon ${props} />`;
    }
  );

  if (source !== before) {
    if (!source.includes("V5Icon")) {
      // The replacement always contains V5Icon, so check the import explicitly.
    }
    if (!source.includes(importLine)) {
      if (source.startsWith('"use client";')) {
        source = source.replace('"use client";', `"use client";\n\n${importLine}`);
      } else {
        source = `${importLine}\n${source}`;
      }
    }
    fs.writeFileSync(file, source);
    changedFiles++;
  }
}

console.log(`changedFiles=${changedFiles} replaced=${replaced} skipped=${skipped}`);
