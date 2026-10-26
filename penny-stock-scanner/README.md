# Penny Stock Scanner

A personal Claude Artifact app for finding and tracking penny stocks, published at
https://claude.ai/artifact/5cDcLvSvkzC3igiEmjBGnM (private to its owner).

It reads market and account data through the owner's Webull connector, read-only: it never places
trades. It keeps its state (watchlist, signals, journal, settings) in the artifact's database.

| Path | What it is |
| --- | --- |
| `penny-stock-scanner.html` | The app, as published (version 35). |
| `feed.gs` | The free options feed, a Google Apps Script. The app also embeds a copy for its **Copy setup script** button. |
| `tests/` | Headless-browser and script tests with mock Webull, Google Drive and CBOE data. |

## Free options feed

Webull's connector charges for option prices, and an artifact page can't load other websites. So
`feed.gs` runs on Google's servers under the owner's Google account. It does three things:

- Every 10 minutes on market days, it copies CBOE's free 15-minute-delayed option chains for up to
  40 stocks into a Google Doc named "PSS Options Feed".
- Every 6 hours, it checks SEC EDGAR for 13D/13G filings.
- It reads which stocks to check from the Doc's description, which the app writes.

The app reads the Doc through the Google Drive connector. The data sits between `PSSFEED1:` and
`:PSSEND` as base64-encoded JSON.

The feed powers:

- the **Option pick** column on the Buy, Hold and Sell tabs, and the **Options check** in each stock's details;
- the contracts table and calculator fill-in on the **Options** tab;
- the Velocity Scanner's **unusual options** and **13D/13G** triggers.

### One-time setup (about 5 minutes, on a computer)

1. In the app, open **Options** and tap **Copy setup script** (or copy `feed.gs`).
2. Open https://script.google.com/home/projects/create with the personal Google account the Drive
   connector uses. Delete the sample code, paste the script and save.
3. Choose **setup** in the function menu, press **Run** and allow access. Google warns the app isn't
   verified because the script is yours: Advanced → Go to (unsafe) → Allow. Wait for
   "Execution completed".
4. Back in the app, tap **Check for my feed** and allow Google Drive.

To stop the feed, delete the project at script.google.com.

The CBOE and SEC fetches have only been tested against mock answers, because the build environment
couldn't reach either site. If either source refuses Google's requests, the Options tab shows the
HTTP error.

## Tests

Run these from this folder. The browser tests use the preinstalled Playwright and Chromium.

```sh
node tests/gas-test.js    # feed script against mock CBOE/SEC answers: schedule, volume bursts, SEC refresh
node tests/mkfeed.cjs     # builds feed-doc.txt with the real script, for the browser tests
node tests/opt.mjs        # app with the feed: Option pick, Options check, scanner triggers, phone width
node tests/opt-fail.mjs nofeed   # and: deny
node tests/mv.mjs pre     # and: open (price-move alerts before the open vs during market hours)
node tests/velo.mjs       # Velocity Scanner triggers
node tests/v2test.mjs     # Buy/Hold/Sell rules
```
