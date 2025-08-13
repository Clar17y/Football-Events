#!/usr/bin/env node
/**
 * Scan CSS files for class selectors and report likely-unused ones.
 * - Understands CSS Modules usage via `styles.className` references
 * - Checks JSX/TSX/HTML for className/class attributes
 * - Safelists common framework classes (Mui, ion-, react-colorful__)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const codeExts = new Set(['.tsx', '.ts', '.jsx', '.js', '.html']);

/** Recursively list files under dir matching ext predicate */
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function extractClasses(cssContent) {
  // naive but effective class extractor: .className in selectors
  const classSet = new Set();
  const re = /\.([a-zA-Z0-9_-]+)(?=[\s\.,:#>{\[\)])(?![^{]*\})/g;
  let m;
  while ((m = re.exec(cssContent)) !== null) {
    classSet.add(m[1]);
  }
  return [...classSet];
}

function isSafelisted(name) {
  return (
    /^Mui/.test(name) ||
    /^ion-/.test(name) ||
    /^react-colorful__/.test(name) ||
    /^swiper-/.test(name)
  );
}

function countUsage(name, files, isModule) {
  const word = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const classAttrRe = new RegExp(`class(Name)?=([\\"'` + "`" + `])[^\\1]*?\\b${word}\\b[^\\1]*?\\1`, 'm');
  const moduleRe = new RegExp(`\bstyles\s*\.\s*${word}\b`);
  const looseRe = new RegExp(`\b${word}\b`);
  let count = 0;
  for (const f of files) {
    const ext = path.extname(f);
    if (!codeExts.has(ext)) continue;
    const txt = read(f);
    if (classAttrRe.test(txt)) { count++; continue; }
    if (isModule && moduleRe.test(txt)) { count++; continue; }
    if (looseRe.test(txt)) { count++; continue; }
  }
  return count;
}

function main() {
  const srcFiles = listFiles(root);
  const cssFiles = srcFiles.filter(f => f.endsWith('.css'));
  const codeFiles = srcFiles.filter(f => !f.endsWith('.css'));
  const report = [];

  for (const cssFile of cssFiles) {
    const css = read(cssFile);
    const classes = extractClasses(css).filter(Boolean);
    if (classes.length === 0) continue;
    const isModule = /\.module\.css$/.test(cssFile);
    const items = [];
    for (const name of classes) {
      if (isSafelisted(name) || name === 'dark-theme' || name === 'css' || name === 'tsx' || name === 'googleapis') continue;
      const usage = countUsage(name, codeFiles, isModule);
      items.push({ name, usage });
    }
    const unused = items.filter(x => x.usage === 0).map(x => x.name).sort();
    const used = items.filter(x => x.usage > 0).length;
    report.push({ file: path.relative(process.cwd(), cssFile), total: classes.length, used, unusedCount: unused.length, unused });
  }

  // Print concise summary then detailed unused lists per file
  console.log('CSS usage summary (by file):');
  for (const r of report.sort((a,b)=> b.unusedCount - a.unusedCount)) {
    console.log(`- ${r.file}: total=${r.total}, unused=${r.unusedCount}`);
  }
  console.log('\nUnused selectors (per file):');
  for (const r of report.filter(r=>r.unusedCount>0)) {
    console.log(`\n# ${r.file}`);
    for (const name of r.unused) console.log(name);
  }
}

main();
