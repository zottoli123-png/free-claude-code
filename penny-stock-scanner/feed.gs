/**
 * PSS Options Feed: free option chains and 13D/13G filings for your Penny Stock Scanner.
 *
 * Runs on Google's servers under your own Google account, every 10 minutes on market days,
 * even when your phone is off. It reads two free public sources:
 *   - CBOE's delayed option quotes (the same data cboe.com shows without signing in; about 15 minutes old)
 *   - SEC EDGAR's filing index (13D/13G stakes over 5%)
 * and saves a short summary in a Google Doc named "PSS Options Feed" in your Drive.
 * Your app reads that Doc through your Google Drive connector, and writes the stocks it wants
 * checked into the Doc's description. Nothing else in your Drive is read or changed.
 *
 * Setup: paste this whole file into a new project at script.google.com, pick "setup"
 * in the function menu, press Run and allow access.
 * To stop it: delete the project at script.google.com (the Doc can be deleted too).
 * For personal, non-commercial use.
 */
const FEED_TITLE = 'PSS Options Feed';
const MAX_TICKERS = 40;
const EVERY_MIN = 10;
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options/';
// SEC asks automated tools for a contact email. If the app shows "SEC: HTTP 403", put your email between the quotes.
const SEC_CONTACT = '';

function setup() {
  const doc = feedDoc_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refresh') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refresh').timeBased().everyMinutes(EVERY_MIN).create();
  refresh(true);
  Logger.log('Feed ready: ' + doc.getUrl());
}

function refresh(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const doc = feedDoc_(), file = DriveApp.getFileById(doc.getId());
    const syms = wanted_(file.getDescription());
    const props = PropertiesService.getScriptProperties(), last = JSON.parse(props.getProperty('last') || '{}');
    const et = etNow_(), key = syms.join(',');
    if (force !== true && !due_(et, last, key)) return;
    const prev = readFeed_(doc) || {};
    const feed = { v: 1, at: new Date().toISOString(), req: syms, t: {}, f: prev.f || {}, st: {} };
    if (!syms.length) feed.st.note = 'Waiting for the app to send its list of stocks.';
    else {
      feed.st.cboe = chains_(syms, feed.t, et.day);
      // SEC filings: every stock every 6 hours, and newly added stocks right away.
      Object.keys(feed.f).forEach(function (s) { if (syms.indexOf(s) < 0) delete feed.f[s]; });
      const full = force === true || !last.secAt || Date.now() - last.secAt > 6 * 3600e3;
      const secSyms = full ? syms : syms.filter(function (s) { return !(s in feed.f); });
      if (secSyms.length) { feed.st.sec = filings_(secSyms, feed.f); if (full) last.secAt = Date.now(); }
      else feed.st.sec = prev.st && prev.st.sec || null;
    }
    write_(doc, feed);
    props.setProperty('last', JSON.stringify({ key: key, day: et.day, mins: et.mins, secAt: last.secAt || null }));
  } catch (e) {
    try { write_(feedDoc_(), { v: 1, at: new Date().toISOString(), req: [], t: {}, f: {}, st: { error: String(e && e.message || e) } }); } catch (e2) {}
    throw e;
  } finally { lock.releaseLock(); }
}

function feedDoc_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('docId');
  if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) return DocumentApp.openById(id); } catch (e) {} }
  const found = DriveApp.getFilesByName(FEED_TITLE);
  while (found.hasNext()) {
    const f = found.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_DOCS) { props.setProperty('docId', f.getId()); return DocumentApp.openById(f.getId()); }
  }
  const doc = DocumentApp.create(FEED_TITLE);
  props.setProperty('docId', doc.getId());
  return doc;
}

// The app writes "PSS tickers: SOFI,PLUG,..." into the Doc's description.
function wanted_(desc) {
  const m = /tickers:\s*([A-Z0-9.,\s-]+)/i.exec(desc || '');
  const out = [];
  (m ? m[1] : '').split(/[\s,]+/).forEach(function (s) { s = s.trim().toUpperCase(); if (/^[A-Z][A-Z0-9.\-]{0,6}$/.test(s) && out.indexOf(s) < 0) out.push(s); });
  return out.slice(0, MAX_TICKERS);
}

function etNow_() {
  const p = Utilities.formatDate(new Date(), 'America/New_York', 'EEE HH mm yyyy-MM-dd').split(' ');
  return { dow: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p[0]) + 1 || 7, mins: Number(p[1]) * 60 + Number(p[2]), day: p[3] };
}

// Every run during market hours; one closing snapshot after 4:20 pm ET; any time the app asks for different stocks.
function due_(et, last, key) {
  if (last.key !== key || !last.day) return true;
  if (et.dow > 5) return false;
  if (et.mins >= 9 * 60 + 25 && et.mins <= 16 * 60 + 20) return true;
  if (et.mins > 16 * 60 + 20) return !(last.day === et.day && last.mins > 16 * 60 + 20);
  return false;
}

function num_(x) { const v = Number(x); return x === null || x === undefined || x === '' || !isFinite(v) ? null : v; }
function r_(x, d) { if (x === null || x === undefined) return null; const f = Math.pow(10, d); return Math.round(x * f) / f; }

function chains_(syms, out, day) {
  const res = UrlFetchApp.fetchAll(syms.map(function (s) { return { url: CBOE + encodeURIComponent(s) + '.json', muteHttpExceptions: true, headers: { Accept: 'application/json' } }; }));
  const cache = CacheService.getScriptCache(), st = { ok: 0, none: 0, fail: 0, codes: {} };
  res.forEach(function (r, i) {
    const s = syms[i], code = r.getResponseCode();
    if (code === 404 || code === 403 && /<Code>AccessDenied|NoSuchKey/i.test(r.getContentText().slice(0, 400))) { out[s] = { e: 'none' }; st.none++; return; }
    if (code !== 200) { st.fail++; st.codes[code] = (st.codes[code] || 0) + 1; out[s] = { e: 'http ' + code }; return; }
    let j; try { j = JSON.parse(r.getContentText()); } catch (e) { st.fail++; out[s] = { e: 'bad json' }; return; }
    const prevRaw = cache.get('v:' + s), prev = prevRaw ? JSON.parse(prevRaw) : null;
    const sum = summarize_(s, j, prev && prev.day === day ? prev.v : null);
    out[s] = sum.out;
    try { cache.put('v:' + s, JSON.stringify({ day: day, v: sum.vols }), 21600); } catch (e) {}
    if (sum.out.e) st.none++; else st.ok++;
  });
  return st;
}

function summarize_(sym, j, prev) {
  const d = j && j.data;
  if (!d || !Array.isArray(d.options) || !d.options.length) return { out: { e: 'none' }, vols: {} };
  const px = num_(d.current_price) || num_(d.close), now = Date.now();
  const rows = [], volByTail = {}, vols = {};
  let cv = 0, pv = 0, coi = 0, poi = 0;
  d.options.forEach(function (o) {
    const occ = String(o.option || '');
    if (occ.length < 16 || occ.slice(0, -15) !== sym) return; // skip adjusted (non-standard) contracts
    const tail = occ.slice(-15), y = 2000 + Number(tail.slice(0, 2)), m = Number(tail.slice(2, 4)), dd = Number(tail.slice(4, 6)), cp = tail.charAt(6), k = Number(tail.slice(7)) / 1000;
    const dte = Math.ceil((Date.UTC(y, m - 1, dd, 21) - now) / 864e5);
    if (dte < 0) return;
    const x = { tail: tail, cp: cp, k: k, dte: dte, bid: num_(o.bid) || 0, ask: num_(o.ask) || 0, last: num_(o.last_trade_price) || 0, vol: num_(o.volume) || 0, oi: num_(o.open_interest) || 0, iv: num_(o.iv), delta: num_(o.delta), theta: num_(o.theta) };
    if (cp === 'C') { cv += x.vol; coi += x.oi; } else { pv += x.vol; poi += x.oi; }
    volByTail[tail] = x.vol;
    if (x.vol >= 50) vols[tail] = x.vol;
    rows.push(x);
  });
  const mid = function (x) { return x.bid > 0 && x.ask > 0 ? (x.bid + x.ask) / 2 : null; };
  // Call candidates for the app's "best contract" pick: 21–200 days out, roughly 0.25–0.90 delta.
  const cands = rows.filter(function (x) {
    if (x.cp !== 'C' || x.dte < 21 || x.dte > 200 || !(x.ask > 0)) return false;
    if (x.delta != null) return x.delta >= 0.25 && x.delta <= 0.9;
    return px ? x.k >= px * 0.7 && x.k <= px * 1.2 : false;
  }).map(function (x) {
    const m = mid(x), sp = m ? (x.ask - x.bid) / m : 1, dl = x.delta != null ? x.delta : 0.5;
    return { x: x, sc: Math.abs(x.dte - 75) / 75 + Math.abs(dl - 0.6) / 0.3 + Math.min(sp, 1) - Math.log(1 + x.oi) / Math.LN10 / 4 };
  }).sort(function (a, b) { return a.sc - b.sc; }).slice(0, 8).map(function (e) { const x = e.x; return [x.tail, r_(x.bid, 3), r_(x.ask, 3), r_(x.last, 3), x.vol, x.oi, r_(x.iv, 3), r_(x.delta, 3), r_(x.theta, 3)]; });
  // Unusual activity: 100+ contracts, more than the open interest, 45 days or less, $10K+ premium.
  const unusual = rows.filter(function (x) { return x.vol >= 100 && x.dte <= 45 && x.vol > x.oi; }).map(function (x) {
    const p = x.last > 0 ? x.last : mid(x) || 0, prem = x.vol * p * 100;
    const opp = volByTail[x.tail.slice(0, 6) + (x.cp === 'C' ? 'P' : 'C') + x.tail.slice(7)] || 0;
    const side = x.last > 0 && x.ask > 0 && x.last >= x.ask ? 'A' : x.last > 0 && x.bid > 0 && x.last <= x.bid ? 'B' : 'M';
    const dv = prev && prev[x.tail] != null ? x.vol - prev[x.tail] : null;
    return { prem: prem, row: [x.tail, r_(x.bid, 3), r_(x.ask, 3), r_(x.last, 3), x.vol, x.oi, r_(x.iv, 3), r_(x.delta, 3), Math.round(prem), dv, opp, side] };
  }).filter(function (e) { return e.prem >= 1e4; }).sort(function (a, b) { return b.prem - a.prem; }).slice(0, 5).map(function (e) { return e.row; });
  return { out: { px: r_(px, 4), iv30: r_(num_(d.iv30), 2), ts: String(j.timestamp || ''), n: rows.length, cv: cv, pv: pv, coi: coi, poi: poi, c: cands, u: unusual }, vols: vols };
}

// 13D / 13G filings in the last 30 days, from SEC EDGAR's free index. SEC asks automated tools to name themselves.
function filings_(syms, out) {
  const ua = { 'User-Agent': 'PSS personal research script' + (SEC_CONTACT ? ' ' + SEC_CONTACT : ''), Accept: 'application/json' };
  const props = PropertiesService.getScriptProperties();
  let ciks = JSON.parse(props.getProperty('ciks') || '{}');
  const need = syms.filter(function (s) { return !(s in ciks); });
  if (need.length) {
    const r = UrlFetchApp.fetch('https://www.sec.gov/files/company_tickers.json', { muteHttpExceptions: true, headers: ua });
    if (r.getResponseCode() !== 200) return { fail: syms.length, err: 'SEC ticker list: HTTP ' + r.getResponseCode() };
    const all = JSON.parse(r.getContentText()), map = {};
    Object.keys(all).forEach(function (k) { map[all[k].ticker] = all[k].cik_str; });
    need.forEach(function (s) { ciks[s] = map[s] || map[s.replace('.', '-')] || 0; });
    const keys = Object.keys(ciks);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(function (k) { delete ciks[k]; });
    props.setProperty('ciks', JSON.stringify(ciks));
  }
  const list = syms.filter(function (s) { return ciks[s]; }), st = { ok: 0, fail: 0 }, cutoff = Date.now() - 30 * 864e5;
  syms.forEach(function (s) { if (!ciks[s]) out[s] = { cik: 0, h: [] }; });
  for (let i = 0; i < list.length; i += 8) {
    const batch = list.slice(i, i + 8);
    const res = UrlFetchApp.fetchAll(batch.map(function (s) { return { url: 'https://data.sec.gov/submissions/CIK' + ('0000000000' + ciks[s]).slice(-10) + '.json', muteHttpExceptions: true, headers: ua }; }));
    res.forEach(function (r, k) {
      const s = batch[k];
      if (r.getResponseCode() !== 200) { st.fail++; st.err = 'SEC: HTTP ' + r.getResponseCode(); return; }
      try {
        const rec = JSON.parse(r.getContentText()).filings.recent, hits = [];
        for (let n = 0; n < rec.form.length && hits.length < 6; n++) {
          if (!/^(SC 13[DG]|SCHEDULE 13[DG])(\/A)?$/.test(rec.form[n])) continue;
          if (Date.parse(rec.filingDate[n] + 'T12:00:00Z') < cutoff) continue;
          hits.push([rec.form[n], rec.filingDate[n], rec.accessionNumber[n]]);
        }
        out[s] = { cik: ciks[s], h: hits };
        st.ok++;
      } catch (e) { st.fail++; }
    });
    if (i + 8 < list.length) Utilities.sleep(1100);
  }
  return st;
}

// The app looks for the text between PSSFEED1: and :PSSEND. Base64 keeps Drive's text conversion from changing it.
function write_(doc, feed) {
  let json = JSON.stringify(feed);
  if (json.length > 40000) { Object.keys(feed.t).forEach(function (s) { const x = feed.t[s]; if (x.c) x.c = x.c.slice(0, 5); if (x.u) x.u = x.u.slice(0, 3); }); json = JSON.stringify(feed); }
  const when = Utilities.formatDate(new Date(), 'America/New_York', 'MMM d, h:mm a') + ' ET';
  doc.getBody().setText('Penny Stock Scanner options feed, updated ' + when + '. Your app reads this file, so please leave it as it is.\n\nPSSFEED1:' + Utilities.base64Encode(json, Utilities.Charset.UTF_8) + ':PSSEND');
  doc.saveAndClose();
}

function readFeed_(doc) {
  try {
    const t = doc.getBody().getText(), a = t.indexOf('PSSFEED1:'), b = t.indexOf(':PSSEND', a);
    if (a < 0 || b < 0) return null;
    return JSON.parse(Utilities.newBlob(Utilities.base64Decode(t.slice(a + 9, b).replace(/[^A-Za-z0-9+\/=]/g, ''))).getDataAsString('UTF-8'));
  } catch (e) { return null; }
}
