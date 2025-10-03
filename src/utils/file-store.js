import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../../data');
const countersPath = path.join(dataDir, 'counters.json');
const templatesPath = path.join(dataDir, 'templates.json');

function ensureDataFiles() {
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  try { if (!fs.existsSync(countersPath)) fs.writeFileSync(countersPath, JSON.stringify({}), 'utf8'); } catch {}
  try { if (!fs.existsSync(templatesPath)) fs.writeFileSync(templatesPath, JSON.stringify([]), 'utf8'); } catch {}
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || (typeof fallback === 'string' ? fallback : JSON.stringify(fallback)));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

async function incrementCounter(category) {
  ensureDataFiles();
  const counters = readJson(countersPath, {});
  const current = Number(counters[category] || 0) + 1;
  counters[category] = current;
  writeJson(countersPath, counters);
  return current;
}

async function appendTemplate(doc) {
  ensureDataFiles();
  const arr = readJson(templatesPath, []);
  arr.push(doc);
  writeJson(templatesPath, arr);
}

async function listTemplates({ category = null, limit = 20, page = 1 } = {}) {
  ensureDataFiles();
  const arr = readJson(templatesPath, []);
  const filtered = category ? arr.filter(t => String(t.category) === String(category)) : arr.slice();
  // Sort by serial_no desc
  filtered.sort((a, b) => Number(b.serial_no || 0) - Number(a.serial_no || 0));
  const pg = Math.max(1, parseInt(page) || 1);
  const lim = Math.max(1, Math.min(100, parseInt(limit) || 20));
  const start = (pg - 1) * lim;
  const pageItems = filtered.slice(start, start + lim);
  return { templates: pageItems, total: filtered.length };
}

async function getLatestTemplate(category) {
  const { templates } = await listTemplates({ category, limit: 1, page: 1 });
  return templates[0] || null;
}

export default {
  incrementCounter,
  appendTemplate,
  listTemplates,
  getLatestTemplate,
};
