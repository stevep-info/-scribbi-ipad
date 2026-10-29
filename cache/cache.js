const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to read cache file:', e.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save cache file:', e.message);
  }
}

function makeKey(board, syllabusCode, paperNumber, session, year) {
  const b = (board || '').toLowerCase().trim();
  const c = (syllabusCode || '').toLowerCase().trim();
  const p = (paperNumber || '').toLowerCase().trim();
  const s = (session || '').toLowerCase().trim();
  const y = String(year || '').toLowerCase().trim();
  return `${b}:${c}:${p}:${s}:${y}`;
}

function getCachedMarkScheme(board, syllabusCode, paperNumber, session, year) {
  const cache = loadCache();
  const key = makeKey(board, syllabusCode, paperNumber, session, year);
  return cache[key] || null;
}

function setCachedMarkScheme(board, syllabusCode, paperNumber, session, year, result) {
  if (!result || !result.source_url || !result.source_name) return;
  const cache = loadCache();
  const key = makeKey(board, syllabusCode, paperNumber, session, year);
  cache[key] = {
    source_url: result.source_url,
    source_name: result.source_name,
    cached_at: new Date().toISOString()
  };
  saveCache(cache);
}

module.exports = {
  getCachedMarkScheme,
  setCachedMarkScheme
};
