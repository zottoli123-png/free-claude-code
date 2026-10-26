import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.addInitScript(() => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ symbol: "T" + i, name: "Test Co " + i, exchange_code: "NAS", price: 2 + i * 0.3, volume: 3e6, market_value: 1e8, change_ratio: 0.01 * (i - 10) }));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cache = {};
  const bars = (sym, count) => { const k = sym + count; if (cache[k]) return cache[k]; let c = 3 + (sym.charCodeAt(1) % 5); const res = Array.from({ length: count }, (_, i) => { c *= 1 + (rnd() - 0.48) * 0.06; const o = c * (1 + (rnd() - 0.5) * 0.02); return { time: Date.now() - (count - i) * 864e5, open: o, high: Math.max(o, c) * 1.02, low: Math.min(o, c) * 0.98, close: c, volume: 1e6 + rnd() * 1e6 }; }); return (cache[k] = { symbol: sym, result: res }); };
  const mcp = {
    watchTool: (s, t, a, cb) => { setTimeout(() => cb({ type: "data", result: { payload: a.page_index === "1" ? rows : [] } }), 50); return () => {}; },
    callTool: async (s, t, a) => {
      if (t === "get_stock_bars") return { payload: { result: (a.symbols || []).map((x) => bars(x, Math.min(a.count || 100, 520))) } };
      if (t === "get_stock_snapshot") return { payload: String(a.symbols).split(",").map((x) => ({ symbol: x, price: 4.2, volume: 1e6, market_value: 3e8, change_ratio: -0.02, bid: 4.18, ask: 4.22 })) };
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
});
await p.goto("file://" + process.cwd() + "/penny-stock-scanner.html");
await p.waitForTimeout(3000);
const tab = async (t, wait = 2000) => { await p.evaluate((x) => document.querySelector('[data-tab="' + x + '"]').click(), t); await p.waitForTimeout(wait); };
await tab("main", 8000);
console.log("BANNER:", (await p.locator("#regime-banner").innerText()).replace(/\n/g," | "));
const buyRows = await p.locator("#out-main tbody tr").allInnerTexts();
console.log("BUY rows:", buyRows.length); console.log(buyRows.slice(0, 3).map(x => x.replace(/\s+/g, " ").slice(0, 230)).join("\n"));
await tab("wider", 1500);
const hold = await p.locator("#out-wider").innerText();
console.log("HOLD has rank text:", /ranks #\d+ of \d+ today/.test(hold), "| sample:", (hold.match(/Passes your rules, but ranks[^\n]*/)||[""])[0].slice(0,140));
console.log("HOLD 'Not yet' sample:", (hold.match(/Not yet:[^\n]*/)||[""])[0].slice(0,140));
await tab("sell", 1200); console.log("SELL:", (await p.locator("#sell").innerText()).replace(/\s+/g," ").slice(0, 400));
await tab("backtest", 500); await p.click("#bt-run"); await p.waitForTimeout(15000);
console.log("BACKTEST:", (await p.locator("#out-bt").innerText()).slice(0, 1600));
console.log("rules doc:", await p.evaluate(() => JSON.stringify(window.__store.get("settings/rules"))));
await tab("rulebook", 800); const rb = await p.locator("#out-rulebook").innerText();
console.log("RULEBOOK v2 text:", /Rules v2: rebuilt/.test(rb), "| S1 row:", (rb.match(/S1\t[^\n]*/)||[""])[0].slice(0,90));
await tab("watchlist", 800);
for (const s of ["T14", "T5", "T20"]) { await p.fill("#find-q", s); await p.waitForTimeout(400); await p.locator("#find-out [data-star]").first().click(); await p.waitForTimeout(300); }
await tab("scores", 7000); const sc = await p.locator("#out-scores").textContent();
console.log("SCORES gates:", /S1Not overbought/.test(sc), /S2Not stretched/.test(sc), /S3No chasing/.test(sc), "| R2:", (sc.match(/Stop \$[0-9.]+ \([^)]*\), 3 ATR below entry/)||[""])[0]);
await tab("wallet", 3000); console.log("WALLET T3:", (await p.locator("#out-wallet tbody").innerText()).replace(/\s+/g," ").match(/T3 .{0,260}/)?.[0]);
console.log("errors:", errs, "width:", await p.evaluate(() => document.documentElement.scrollWidth));
await b.close();
