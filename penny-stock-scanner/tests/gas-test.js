const fs = require('fs');
const src = fs.readFileSync('feed.gs', 'utf8');
const now = Date.now();
const occ = (sym, days, cp, k) => { const d = new Date(now + days * 864e5); const y = String(d.getUTCFullYear()).slice(2), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0'); return sym + y + m + dd + cp + String(Math.round(k * 1000)).padStart(8, '0'); };
function chain(sym, px) {
  const opts = [];
  for (const days of [10, 24, 52, 80, 115, 300]) for (const k of [px * 0.8, px * 0.9, px, px * 1.1, px * 1.3]) for (const cp of ['C', 'P']) {
    const itm = cp === 'C' ? px - k : k - px, t = days / 365, intr = Math.max(0, itm), tv = px * 0.6 * Math.sqrt(t) * 0.4;
    const mid = intr + tv, delta = cp === 'C' ? Math.min(0.95, Math.max(0.05, 0.5 + itm / px * 2)) : -Math.min(0.95, Math.max(0.05, 0.5 - itm / px * 2));
    opts.push({ option: occ(sym, days, cp, k), bid: +(mid * 0.97).toFixed(2), ask: +(mid * 1.03).toFixed(2), iv: 0.6, open_interest: 800, volume: 120, delta: +delta.toFixed(3), theta: -0.01, last_trade_price: +mid.toFixed(2) });
  }
  // an unusual short-dated OTM call: 3000 contracts vs 400 OI, last at the ask
  opts.push({ option: occ(sym, 10, 'C', px * 1.2), bid: 0.4, ask: 0.45, iv: 0.9, open_interest: 400, volume: 3000, delta: 0.22, theta: -0.03, last_trade_price: 0.45 });
  opts.push({ option: sym + '1' + occ('', 52, 'C', px).slice(0), bid: 1, ask: 1.1, volume: 9999, open_interest: 1 }); // adjusted contract, must be skipped
  return { timestamp: '2026-10-26 11:45:00', data: { symbol: sym, current_price: px, close: px, iv30: 61.2, options: opts } };
}
let docText = '', desc = 'PSS tickers: SOFI, PLUG,ZZZZ', props = {}, cache = {}, fetched = [];
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
const g = {
  UrlFetchApp: {
    fetchAll: (reqs) => reqs.map((r) => UrlFetchApp_(r.url)),
    fetch: (url) => UrlFetchApp_(url),
  },
  DocumentApp: { openById: () => doc, create: () => doc },
  DriveApp: { getFileById: () => ({ isTrashed: () => false, getDescription: () => desc }), getFilesByName: () => ({ hasNext: () => false }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('prop too big ' + k); props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: {
    formatDate: (d, tz, f) => { if (f === 'EEE HH mm yyyy-MM-dd' && global.FAKE_ET) return global.FAKE_ET; const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); const u = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]; return f === 'EEE HH mm yyyy-MM-dd' ? `${p.weekday} ${p.hour} ${p.minute} ${p.year}-${p.month}-${p.day}` : `${p.month}/${p.day} ${p.hour}:${p.minute}`; },
    base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
    base64Decode: (s) => [...Buffer.from(s, 'base64')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    Charset: { UTF_8: 'UTF-8' }, sleep: () => {},
  },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }), deleteTrigger: () => {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => '' }) },
  Logger: { log: (x) => console.log('LOG', x) },
  MimeType: { GOOGLE_DOCS: 'application/vnd.google-apps.document' },
};
const doc = { getId: () => 'doc1', getUrl: () => 'https://docs/doc1', getBody: () => ({ setText: (t) => { docText = t; }, getText: () => docText }), saveAndClose: () => {} };
let volBump = 0;
function UrlFetchApp_(url) {
  fetched.push(url);
  if (url.includes('cboe')) {
    const sym = decodeURIComponent(url.split('/').pop().replace('.json', ''));
    if (sym === 'ZZZZ') return resp(403, '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>');
    const c = chain(sym, sym === 'SOFI' ? 24.5 : 3.2);
    c.data.options.forEach((o) => { if (o.volume === 3000) o.volume += volBump; });
    return resp(200, c);
  }
  if (url.includes('company_tickers')) return resp(200, { 0: { cik_str: 1818874, ticker: 'SOFI' }, 1: { cik_str: 1093691, ticker: 'PLUG' } });
  if (url.includes('submissions/CIK0001818874')) return resp(200, { filings: { recent: { form: ['8-K', 'SC 13G/A', 'SCHEDULE 13D', '4'], filingDate: [new Date().toISOString().slice(0, 10), new Date(now - 3 * 864e5).toISOString().slice(0, 10), new Date(now - 2 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)], accessionNumber: ['a', '0000950170-26-001', '0001104659-26-002', 'd'] } } });
  if (url.includes('submissions/')) return resp(200, { filings: { recent: { form: ['SC 13G'], filingDate: ['2025-01-01'], accessionNumber: ['old'] } } });
  return resp(500, 'x');
}
const run = new Function(...Object.keys(g), src + '\nreturn { setup, refresh };');
const api = run(...Object.values(g));
api.setup();
const decode = () => { const a = docText.indexOf('PSSFEED1:'), b = docText.indexOf(':PSSEND'); return JSON.parse(Buffer.from(docText.slice(a + 9, b), 'base64').toString()); };
let f = decode();
console.log('doc header:', docText.slice(0, docText.indexOf('PSSFEED1:')).trim());
console.log('req', f.req, 'st', JSON.stringify(f.st));
console.log('SOFI keys', Object.keys(f.t.SOFI), 'n', f.t.SOFI.n, 'cands', f.t.SOFI.c.length, 'first', JSON.stringify(f.t.SOFI.c[0]));
console.log('SOFI unusual', JSON.stringify(f.t.SOFI.u));
console.log('ZZZZ', JSON.stringify(f.t.ZZZZ), 'f', JSON.stringify(f.f));
console.log('json bytes', JSON.stringify(f).length, 'doc chars', docText.length);
// second run 10 minutes later with more volume: dv should appear; the SEC part shouldn't refetch
global.FAKE_ET = 'Tue 11 05 2026-10-27'; volBump = 0; api.refresh({}); volBump = 900; global.FAKE_ET = 'Tue 11 15 2026-10-27'; fetched = []; api.refresh({});
f = decode();
console.log('run2 fetched SEC?', fetched.some((u) => u.includes('sec.gov')), 'dv', f.t.SOFI.u[0][9], 'f kept', !!f.f.SOFI, 'st', JSON.stringify(f.st));
// changed ticker list triggers a run even off-hours, and refetches SEC
global.FAKE_ET = 'Sat 11 15 2026-10-31'; fetched = []; api.refresh({}); console.log('weekend same tickers ran?', fetched.length > 0);
desc = 'PSS tickers: PLUG,SOFI,NEWX'; global.FAKE_ET = 'Tue 11 25 2026-10-27'; fetched = []; api.refresh({}); console.log('run3 sec urls', fetched.filter((u) => u.includes('sec.gov')).map((u) => u.split('/').pop()));
f = decode(); console.log('run3 req', f.req, 'SEC refetched', fetched.some((u) => u.includes('sec.gov')), 'f', Object.keys(f.f));
