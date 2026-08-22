/* Playwright scrape of oto.com.vn — infinite scroll, extract structured cards,
   filter to 10+ year-old cars (year <= 2016). Outputs JSON to stdout.
   Usage: node oto_pw.js [scrolls]
   Reuses the same card field semantics as parse_oto_text in multi_source_scraper.py.
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SCROLLS = parseInt(process.argv[2] || "12", 10);
const CURRENT_YEAR = new Date().getFullYear();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" });
  const page = await ctx.newPage();
  await page.goto("https://oto.com.vn/mua-ban-xe", { waitUntil: "domcontentloaded", timeout: 40000 });

  // try to wait for listing cards
  try { await page.waitForSelector(".item-car", { timeout: 10000 }); }
  catch (e) { console.error("no .item-car after load:", e.message); }

  // infinite scroll to load more listings
  for (let i = 0; i < SCROLLS; i++) {
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await page.waitForTimeout(1400);
  }

  // extract every card's structured data
  const cards = await page.evaluate((SCROLLS) => {
    const out = [];
    // match the real listing cards; dev/sponsored cards lack car-name
    const nodes = Array.from(document.querySelectorAll("div[class*='item-car']"));
    nodes.forEach(c => {
      const nameEl = c.querySelector("span.car-name");
      if (!nameEl) return;
      const name = nameEl.innerText.trim();
      const priceEl = c.querySelector("p.price");
      const price = priceEl ? priceEl.innerText.trim() : "";
      const tagEls = c.querySelectorAll("ul.tag-list li");
      const tags = Array.from(tagEls).map(li => li.innerText.trim()).filter(Boolean);
      // parse year from name: "YYYY - Brand Model - desc"
      const ym = name.match(/\b(20[01][0-9])\b/);
      const year = ym ? parseInt(ym[1], 10) : null;
      out.push({ name, price, tags, year });
    });
    return out;
  }, SCROLLS);

  // filter to 10+ year old cars (year <= CURRENT_YEAR - 10 => <= 2016)
  const old = cards.filter(c => c.year && c.year <= CURRENT_YEAR - 10);
  const allYears = cards.map(c => c.year).filter(Boolean);

  fs.writeFileSync(path.join(__dirname, "oto_raw_cards.json"), JSON.stringify(cards, null, 1));
  console.error(`scrolled ${SCROLLS} times | total cards: ${cards.length} | old(10+) cards: ${old.length}`);
  console.error("years present:", JSON.stringify([...new Set(allYears)].sort((a,b)=>a-b)));
  // emit old cards + a sample of their content for verification
  const sample = old.slice(0, 12).map(c => ({ name: c.name, price: c.price, tags: c.tags, year: c.year }));
  console.log(JSON.stringify({ total: cards.length, old: old.length, sample }, null, 1));
  await browser.close();
})();
