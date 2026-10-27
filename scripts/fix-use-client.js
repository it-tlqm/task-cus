const fs = require("fs");
const path = require("path");

const importLine = 'import { V5Icon } from "@/components/v5/ui/icon";';
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

let fixed = 0;
for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  source = source.replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const clientIndex = lines.findIndex((line) => line.trim() === '"use client";');
  const importIndex = lines.findIndex((line) => line.trim() === importLine);
  if (clientIndex > 0 && importIndex === 0) {
    lines.shift();
    const client = lines.shift();
    source = [client, "", importLine, ...lines].join("\n");
  } else if (clientIndex > 0) {
    // The directive must be the first statement. Move any leading V5 icon import below it.
    const withoutImport = lines.filter((line) => line.trim() !== importLine);
    const directiveIndex = withoutImport.findIndex((line) => line.trim() === '"use client";');
    if (directiveIndex > 0) {
      const directive = withoutImport.splice(directiveIndex, 1)[0];
      withoutImport.unshift(directive, "");
      source = withoutImport.join("\n");
    }
  }
  if (source !== original) {
    fs.writeFileSync(file, source);
    fixed++;
  }
}
console.log(`fixed=${fixed}`);
