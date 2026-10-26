import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const MODE = process.argv[2]; await p.clock.install({ time: new Date(MODE === "pre" ? "2026-10-26T09:11:00Z" : "2026-10-26T15:00:00Z") });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const FEED = require("fs").readFileSync("feed-doc.txt", "utf8");
await p.addInitScript(([FEED, MODE]) => {
  window.__desc = []; window.__drive = [];
  window.__feedExists = !location.hash.includes("nofeed"); window.__deny = location.hash.includes("deny");
  const rows = Array.from({ length: 30 }, (_, i) => ({ symbol: "T" + i, name: "Test Co " + i, exchange_code: "NAS", price: 2 + i * 0.3, volume: 3e6, market_value: 1e8, change_ratio: 0.01 * (i - 10) }));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cache = {};
  const bars = (sym, count) => { const k = sym + count; if (cache[k]) return cache[k]; let c = 3 + (sym.charCodeAt(1) % 5); const res = Array.from({ length: count }, (_, i) => { c *= 1 + (rnd() - 0.48) * 0.06; const o = c * (1 + (rnd() - 0.5) * 0.02); return { time: Date.now() - (count - i) * 864e5, open: o, high: Math.max(o, c) * 1.02, low: Math.min(o, c) * 0.98, close: c, volume: 1e6 + rnd() * 1e6 }; }); return (cache[k] = { symbol: sym, result: res }); };

  const m5 = (sym, count) => {
    const daily = bars(sym, 260).result, hi = Math.max(...daily.map((x) => x.high)), prev = daily[daily.length - 1].close, out = [];
    const now = Date.parse("2026-10-22T15:00:00Z"), open0 = Date.parse("2026-10-22T13:30:00Z");
    for (let dd = 21; dd >= 0; dd--) {
      const day = open0 - dd * 864e5, wd = new Date(day).getUTCDay(); if (wd === 0 || wd === 6) continue;
      for (let k = 0; k < 78; k++) {
        const t0 = day + k * 300e3; if (t0 >= now) break;
        let c = prev * (1 + Math.sin(k + dd) * 0.003), v = 20000 + (k % 7) * 1000;
        if (sym === "T5" && dd === 0 && k === 12) { c = hi * 1.02; v = 220000; }
        if (sym === "T5" && dd === 0 && k > 12) c = hi * 1.025;
        if (sym === "T20" && dd === 0 && k === 10) { c = hi * 1.03; v = 300000; }
        out.push({ time: new Date(t0).toISOString(), open: String(c * 0.998), high: String(c * 1.002), low: String(c * 0.995), close: String(c), volume: String(v) });
      }
    }
    return out.slice(-count);
  };
  const mcp = {
    watchTool: (s, t, a, cb) => { setTimeout(() => cb({ type: "data", result: { payload: a.page_index === "1" ? rows : [] } }), 50); return () => {}; },
    callTool: async (s, t, a) => {
      if (s === "Google Drive") {
        window.__drive.push(t);
        if (window.__deny) throw { code: "not_in_manifest", message: "declined" };
        if (t === "search_files") return { payload: { files: window.__feedExists ? [{ id: "feedid", title: "PSS Options Feed", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-22T14:55:00Z" }] : [] } };
        // Drive's text conversion may add markdown escapes and line breaks: the parser must survive both.
        if (t === "read_file_content") { const txt = FEED.replace(/\+/g, "\\+").replace(/(PSSFEED1:.{500})/, "$1\n"); return { payload: { content: "# PSS Options Feed\n\n" + txt }, result: { content: [{ type: "text", text: "x" }] } }; }
        if (t === "update_file") { window.__desc.push(a.description); return { payload: { id: a.fileId } }; }
      }
      if (t === "get_stock_capital_flow") return { payload: [{ date: "20261021", large_in: "100000", large_out: "50000", medium_in: "1", medium_out: "2", small_in: "3", small_out: "1" }, { date: "20261022", large_in: "300000", large_out: "100000", medium_in: "5", medium_out: "2", small_in: "3", small_out: "9" }] };
      if (t === "get_option_contracts") return { payload: [{ underlying_symbol: a.underlying_symbols, expiration_date: "2026-11-20", strike_price: "5", status: "LISTING" }, { underlying_symbol: a.underlying_symbols, expiration_date: "2026-12-18", strike_price: "6", status: "LISTING" }] };

      if (t === "get_stock_bars" && a.timespan === "M5") return { payload: { result: (a.symbols || []).map((x) => ({ symbol: x, result: m5(x, a.count) })) } };
      if (t === "get_stock_unusual_activities") return { payload: [{ symbol: "T5", alert_type: "VOLUME_SURGE_RALLY", time: "2026-10-22T10:31:00.000-0400", volume: "50000" }, { symbol: "T9", alert_type: "MAJOR_BUY", time: "2026-10-22T10:20:00.000-0400", volume: "40000" }, { symbol: "T12", alert_type: "GAIN_EXCEEDS_7_PCT", time: "2026-10-22T10:10:00.000-0400", volume: "0" }, { symbol: "T20", alert_type: "VOLUME_SURGE_RALLY", time: "2026-10-22T10:05:00.000-0400", volume: "9000" }] };
      if (t === "get_stock_tick") { const now = Date.now(), res = []; for (let i = 0; i < 40; i++) res.push({ time: String(now - i * 60e3), price: "4.2", volume: String(100 + i), side: "N" }); if (a.symbol === "T9") for (let k = 0; k < 5; k++) res.push({ time: String(now - k * 1500e3), price: String(4.20 + k * 0.01), volume: "10000", side: "N" }); return { payload: { symbol: a.symbol, result: res } }; }
      if (t === "get_insider_transactions") return { payload: { data: a.symbol === "T12" ? [{ side: "BUY", shares: "20000", price: "4.1", insider_name: "Doe (Jane)", transaction_date: "2026-10-20", shares_after: "90000" }, { side: "BUY", shares: "10000", price: "4.0", insider_name: "Roe (Rick)", transaction_date: "2026-10-19", shares_after: "30000" }, { side: "SELL", shares: "-5000", price: "5", insider_name: "Poe (Al)", transaction_date: "2026-03-01" }] : [] } };
      if (t === "get_stock_earnings_calendar" && a.symbol === "T20") return { payload: [{ expected_publish_date: "2026-10-23" }] };
      if (t === "get_stock_bars") return { payload: { result: (a.symbols || []).map((x) => bars(x, Math.min(a.count || 100, 520))) } };
      if (t === "get_stock_snapshot") return { payload: String(a.symbols).split(",").map((x) => x === "T3" ? ({ symbol: x, price: 1.82, close: 1.82, pre_close: 2.37, change_ratio: "-0.232068", last_trade_time: MODE === "pre" ? Date.parse("2026-10-23T19:59:57Z") : Date.now() - 60e3, volume: 4e6, market_value: 7e7, bid: 1.8, ask: 1.84, out_standing_shares: "32562291", trade_status: MODE === "pre" ? "PRE" : "TRADING" }) : ({ symbol: x, price: 4.2, volume: 1e6, market_value: 3e8, change_ratio: -0.02, bid: 4.18, ask: 4.22, out_standing_shares: "100000000" })) };
      if (t === "get_account_list") return { payload: [{ account_id: "1" }] };
      if (t === "get_account_positions") return { payload: [{ symbol: "T3", quantity: "100", cost_price: "2", market_value: "300", unrealized_profit_loss: "100" }] };
      if (t === "get_account_balance") return { payload: { total_net_liquidation_value: "5000", account_currency_assets: [{ settled_cash: "2000" }] } };
      if (t === "get_balance_sheet") return { payload: Array.from({ length: 8 }, (_, i) => { const d = new Date(Date.now() - (8 - i) * 91 * 864e5); return { end_date: d.toISOString().slice(0, 10), publish_date: new Date(d.getTime() + 40 * 864e5).toISOString().slice(0, 10), cash_st_invest: String(5e7 - i * 3e6), total_sh_equity: String(4e7), total_cur_assets: "6e7", total_cur_liab: "3e7", common_shares_out: String(1e7 * (1 + i * 0.05)) }; }) };
      if (t === "get_cash_flow") return { payload: Array.from({ length: 8 }, (_, i) => ({ end_date: new Date(Date.now() - (8 - i) * 91 * 864e5).toISOString().slice(0, 10), cfo: "-3000000" })) };
      return { payload: [] };
    },
    invalidate: async () => {},
  };
  // in-memory store with live listeners
  const store = new Map(), docL = new Map(), colL = [];
  window.__store = store;
  const parent = (path) => path.split("/").slice(0, -1).join("/");
  const snapOf = (path) => ({ id: path.split("/").pop(), exists: store.has(path), data: () => store.get(path) });
  const fire = (path) => { (docL.get(path) || []).forEach((cb) => cb(snapOf(path))); colL.filter((l) => l.col === parent(path)).forEach((l) => l.run()); };
  const docRef = (path) => ({ get: async () => snapOf(path), set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); fire(path); }, update: async (d) => { store.set(path, { ...(store.get(path) || {}), ...d }); fire(path); }, delete: async () => { store.delete(path); fire(path); },
    onSnapshot: (cb) => { if (!docL.has(path)) docL.set(path, []); docL.get(path).push(cb); setTimeout(() => cb(snapOf(path)), 0); return () => {}; } });
  const query = (col, ord, lim) => ({ orderBy: (f, dir) => query(col, [f, dir], lim), limit: (nn) => query(col, ord, nn), where: () => query(col, ord, lim),
    get: async () => run(), onSnapshot: (cb) => { const l = { col, run: () => cb(run()) }; colL.push(l); setTimeout(l.run, 0); return () => {}; }, add: async (d) => { const id = "id" + Math.random().toString(36).slice(2); await docRef(col + "/" + id).set(d); return docRef(col + "/" + id); }, doc: (id) => docRef(col + "/" + id) });
  function run() { return { docs: [] }; }
  const mkq = (col, ord, lim) => { const q = query(col, ord, lim); const runner = () => { let docs = [...store.keys()].filter((k) => parent(k) === col).map(snapOf); if (ord) docs.sort((a, z) => String(a.data()[ord[0]]).localeCompare(String(z.data()[ord[0]])) * (ord[1] === "desc" ? -1 : 1)); if (lim) docs = docs.slice(0, lim); return { docs }; };
    return { ...q, orderBy: (f, dir) => mkq(col, [f, dir], lim), limit: (nn) => mkq(col, ord, nn), get: async () => runner(), onSnapshot: (cb) => { const l = { col, run: () => cb(runner()) }; colL.push(l); setTimeout(l.run, 0); return () => {}; } }; };
  const db = { doc: docRef, collection: (c) => mkq(c) };
  window.claude = { use: async (k) => k === "mcp" ? mcp : k === "db" ? db : null };
  localStorage.setItem("pss-tab", "dashboard");
}, [FEED, MODE]);
await p.goto("file://" + process.cwd() + "/penny-stock-scanner.html#" + process.argv[2]);
await p.waitForTimeout(3000);
const tab = async (t, wait = 2000) => { await p.evaluate((x) => document.querySelector('[data-tab="' + x + '"]').click(), t); await p.waitForTimeout(wait); };
const wide = async (label) => console.log("WIDE", label, JSON.stringify(await p.evaluate(() => { const W = document.documentElement.clientWidth, out = []; for (const el of document.querySelectorAll("body *")) { if (el.closest(".tbl-box, pre, [hidden]")) continue; const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1) out.push(el.tagName + "." + el.className + " " + Math.round(r.right) + " " + (el.textContent || "").slice(0, 50)); } return [document.documentElement.scrollWidth, ...out.slice(0, 6)]; })));
await wide("dashboard");
await p.waitForTimeout(4000);
await tab("wallet", 4000);
console.log(MODE, "toasts:", (await p.locator(".toast").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")));
const w = await p.locator("#out-wallet").innerText().catch(() => "");
console.log("  wallet labels:", (w.match(/(Today|Last session)[^\n]*/g) || []).slice(0, 2), "| pill:", (w.match(/(▼ fell \w+|▼ plummeting)/) || [""])[0], "| movers:", (w.match(/Big movers[^\n]*/) || [""])[0]);
console.log("  alert keys:", await p.evaluate(() => [...window.__store.keys()].filter((k) => k.startsWith("alerts/"))));
await tab("main", 2500);
console.log("  buy header:", (await p.locator("#out-main thead").innerText()).replace(/\s+/g, " ").slice(0, 120));
console.log("  errors:", errs);
await b.close();
