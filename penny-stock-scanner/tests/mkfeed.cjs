// Builds a real feed Doc by running feed.gs against mock CBOE/SEC answers at a fixed time (2026-10-22 10:55 ET).
const fs = require('fs');
const src = fs.readFileSync('feed.gs', 'utf8');
const FIX = Date.parse('2026-10-22T14:55:00Z');
let fixNow = FIX;
class FDate extends Date { constructor(...a) { super(...(a.length ? a : [fixNow])); } static now() { return fixNow; } }
const occ = (sym, days, cp, k) => { const d = new Date(FIX + days * 864e5); const y = String(d.getUTCFullYear()).slice(2), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0'); return sym + y + m + dd + cp + String(Math.round(k * 1000)).padStart(8, '0'); };
let volBump = 0;
function chain(sym, px, thin) {
  const opts = [];
  for (const days of [10, 24, 52, 80, 115, 300]) for (const k of [px * 0.8, px * 0.9, px, px * 1.1, px * 1.3]) for (const cp of ['C', 'P']) {
    const kk = Math.round(k * 2) / 2 || 0.5, itm = cp === 'C' ? px - kk : kk - px, t = days / 365, mid = Math.max(0, itm) + px * 0.6 * Math.sqrt(t) * 0.4;
    const delta = cp === 'C' ? Math.min(0.95, Math.max(0.05, 0.5 + itm / px * 2)) : -Math.min(0.95, Math.max(0.05, 0.5 - itm / px * 2));
    opts.push({ option: occ(sym, days, cp, kk), bid: +(mid * (thin ? 0.8 : 0.97)).toFixed(2), ask: +(mid * (thin ? 1.2 : 1.03)).toFixed(2), iv: 0.62, open_interest: thin ? 40 : 800, volume: 120, delta: +delta.toFixed(3), theta: -0.004, last_trade_price: +mid.toFixed(2) });
  }
  if (sym === 'T5') opts.push({ option: occ(sym, 10, 'C', 5), bid: 0.4, ask: 0.45, iv: 0.9, open_interest: 400, volume: 3000 + volBump, delta: 0.22, theta: -0.03, last_trade_price: 0.45 });
  if (sym === 'T20') opts.push({ option: occ(sym, 10, 'C', 5), bid: 0.4, ask: 0.45, iv: 0.9, open_interest: 100, volume: 5000, delta: 0.22, theta: -0.03, last_trade_price: 0.45 });
  if (sym === 'T7') { opts.push({ option: occ(sym, 10, 'C', 5), bid: 0.4, ask: 0.45, open_interest: 100, volume: 4000, delta: 0.3, last_trade_price: 0.42 }); opts.push({ option: occ(sym, 10, 'P', 5), bid: 0.5, ask: 0.55, open_interest: 100, volume: 3900, delta: -0.6, last_trade_price: 0.52 }); }
  return { timestamp: '2026-10-22 10:40:00', data: { symbol: sym, current_price: px, iv30: 61.2, options: opts } };
}
let docText = '', props = {}, cache = {};
const syms = Array.from({ length: 30 }, (_, i) => 'T' + i).join(',');
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
function get(url) {
  if (url.includes('cboe')) { const s = decodeURIComponent(url.split('/').pop().replace('.json', '')); if (s === 'T29') return resp(403, '<Error><Code>AccessDenied</Code></Error>'); return resp(200, chain(s, 4.2, s === 'T11')); }
  if (url.includes('company_tickers')) return resp(200, { 0: { cik_str: 999, ticker: 'T9' } });
  if (url.includes('CIK0000000999')) return resp(200, { filings: { recent: { form: ['SCHEDULE 13D', 'SC 13G/A'], filingDate: ['2026-10-21', '2026-10-20'], accessionNumber: ['0001-26-1', '0001-26-2'] } } });
  return resp(404, '');
}
const g = {
  UrlFetchApp: { fetchAll: (r) => r.map((x) => get(x.url)), fetch: (u) => get(u) },
  DocumentApp: { openById: () => doc, create: () => doc },
  DriveApp: { getFileById: () => ({ isTrashed: () => false, getDescription: () => 'PSS tickers: ' + syms }), getFilesByName: () => ({ hasNext: () => false }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { formatDate: (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); const u = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]; return f === 'EEE HH mm yyyy-MM-dd' ? `${p.weekday} ${p.hour} ${p.minute} ${p.year}-${p.month}-${p.day}` : `${p.month}/${p.day} ${p.hour}:${p.minute}`; },
    base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'), base64Decode: (s) => [...Buffer.from(s, 'base64')], newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }), Charset: { UTF_8: 'UTF-8' }, sleep: () => {} },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }), deleteTrigger: () => {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => '' }) }, Logger: { log: () => {} }, MimeType: { GOOGLE_DOCS: 'x' }, Date: FDate,
};
const doc = { getId: () => 'feedid', getUrl: () => '', getBody: () => ({ setText: (t) => { docText = t; }, getText: () => docText }), saveAndClose: () => {} };
const api = new Function(...Object.keys(g), src + '\nreturn { setup, refresh };')(...Object.values(g));
fixNow = FIX - 10 * 60e3; api.setup();
fixNow = FIX; volBump = 1200; api.refresh({});
fs.writeFileSync('feed-doc.txt', docText);
const a = docText.indexOf('PSSFEED1:'), b = docText.indexOf(':PSSEND'), f = JSON.parse(Buffer.from(docText.slice(a + 9, b), 'base64').toString());
console.log('feed at', f.at, 'stocks', Object.keys(f.t).length, 'st', JSON.stringify(f.st), 'T5.u', JSON.stringify(f.t.T5.u), 'T9 f', JSON.stringify(f.f.T9), 'size', docText.length);
