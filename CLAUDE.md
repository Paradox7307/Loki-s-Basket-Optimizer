# Loki's Basket Optimizer – notes for Claude Code

Browser extension (Chrome/Edge/Brave + Firefox, Manifest V3) that collects products on
**Heureka.cz, Heureka.sk and Zboží.cz** and finds the cheapest way to buy the whole basket,
**shipping included**: best single shop vs. splitting across 2–3 shops. Personal project of
the repo owner; published **unlisted** on the Chrome Web Store, Firefox via self-distribution.

## Why this exists – the owner's goal

The owner (publishes as "Loki", based in the Czech Republic) regularly buys vitamins,
probiotics and over-the-counter medicines and compares prices on Heureka.cz. The problem:
each product is cheapest in a *different* e-shop, and ordering from three shops means three
shipping fees that erase the savings. Heureka/Zboží only compare one product at a time.

**Goal:** pick the products you want, get the best *overall* price including shipping –
"buy it all from this shop: it may not be the cheapest for vitamins, but in total it's the
best deal" – or a split across 2–3 shops when that genuinely saves money.

**Who uses it:** the owner and a few friends (Czech/Slovak). Chrome is the main browser;
Firefox is also used. Distribution is deliberately small: Chrome Web Store **unlisted** and a
self-distributed Firefox .xpi. No public listing unless Heureka agrees (see Gotchas).

**What matters most, in order:**
1. The answer must be *right*: correct prices, correct shipping. Shipping accuracy is the
   biggest known weakness (fees change; free shipping above a limit). Never present an
   estimate as a fact – mark it ("est."), and prefer the safer (higher) shipping value.
2. Works on the real sites. They change their markup; keep fixtures and tests current.
3. Simple to use: one click on the product page, one glance at the popup.
4. Private and on-demand: nothing leaves the browser, nothing runs in the background.

**Decisions already made** (don't revisit without being asked): name "Loki's Basket
Optimizer" in all languages; UI in Czech, Slovak, English (Polish was removed on request);
baskets are per currency (Kč / €); public GitHub repo; saved third-party pages stay out of
git; unlisted store listing.

**Open questions / wishes** (ask before building):
- How to handle changing shipping fees and free-shipping limits – the owner wasn't sure;
  the proposed "v1.1 shipping learning" (see Ideas) has **not** been approved yet.
- Export/import of baskets and shipping rules (offered, not decided). Note the store
  version starts with empty data, separate from an unpacked install.
- License (none yet = all rights reserved). Add the Chrome Web Store link to README.md once
  the listing is approved.

## Working with the owner

- Technically experienced (IT background), comfortable with depth, but not a full-time web
  developer and new to extension publishing and GitHub workflows. Explain the *why* briefly,
  then give exact clicks/commands. Works on **Windows** (use PowerShell-friendly commands;
  `py` may be the Python launcher).
- Iterative and hands-on: tests changes in the real browser and comes back with results.
  Give a clear "how to check it worked" for every change (what the button/popup should show).
- Prefers direct, structured answers and honest uncertainty over confident guesses. Say
  plainly what was tested and what wasn't (e.g. "verified against the saved page, not the live
  site").
- When a site changed and parsing breaks, ask for a saved page (Ctrl+S, "Webpage, HTML only";
  for Zboží's rendered rows "Webpage, Complete") and add it as a fixture before fixing.
- Keep `npm test` green; add tests with every parsing or optimizer change. Bump the version
  in `extension/manifest.json` for every store upload. Submitting to the stores is the
  owner's step – prepare `dist/` and tell them what to upload.

## Layout

```
extension/            the extension itself (load this folder unpacked)
  manifest.json       version lives here (single source of truth)
  _locales/{en,cs,sk} extension name + store summary
  background.js       badge, migration on install/update, opens shop tabs
  content/content.js  floating button + basket menu on product pages
  lib/i18n.js         translations (en, cs, sk), plurals, money formatting
  lib/store.js        storage schema, migration, basket/item helpers
  lib/parser.js       Heureka adapter (.cz and .sk share page code)
  lib/zbozi.js        Zboží adapter (page API, rendered rows, embedded data)
  lib/optimizer.js    shipping estimates, cross-site shop identity, exact optimizer
  popup/              result, products, shipping rules, settings
tests/unit/           Node tests (npm test); some need fixtures
tests/e2e/            Playwright (Python) tests that load the real extension
tests/fixtures/       saved Heureka/Zboží pages – LOCAL ONLY (gitignored, third-party content)
tools/build.mjs       builds dist/ Chrome + Firefox zips
tools/store-assets.py regenerates store/chrome/*.png
store/                Chrome Web Store listing texts (LISTING.md) and images
PRIVACY.md            privacy policy; its GitHub URL is the store's privacy policy URL
```

## Commands

```
npm install                 # jsdom + web-ext
npm test                    # unit tests (fixture-dependent ones print SKIPPED if a fixture is missing)
npm run lint                # Mozilla addons-linter; expect 0 errors, 12 known warnings (see Gotchas)
npm run build               # dist/lokis-basket-optimizer-{chrome,firefox}-<version>.zip
npm run test:e2e            # browser tests; first: pip install playwright beautifulsoup4 lxml
                            #                and python -m playwright install chromium
python tools/store-assets.py  # store screenshots (en, cs, sk) + promo tile from the real extension (demo data);
                            #   `... store-assets.py sk` renders only the given languages
```

Dev install: `chrome://extensions` → Developer mode → Load unpacked → `extension/`.
Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `extension/manifest.json`.

## Release checklist

1. Bump `version` in `extension/manifest.json`.
2. `npm test`, `npm run test:e2e` (if fixtures are present), `npm run lint`.
3. If the popup UI changed: `python tools/store-assets.py` and review `store/chrome/`.
4. `npm run build`.
5. Chrome Web Store dashboard → item → Package → Upload new package (`dist/…-chrome-<v>.zip`) → Submit for review.
6. Firefox (optional): addons.mozilla.org → "On your own" → upload `dist/…-firefox-<v>.zip` → signed .xpi.

## Architecture

- Plain JS, no bundler, no framework. Each `lib/*.js` file sets a global in the browser
  (`globalThis.HeurekaParser`, `ZboziParser`, `BasketStore`, `BasketOptimizer`, `I18n`) and
  `module.exports` in Node for the tests. Keep that pattern.
- `manifest.json` has **both** `background.service_worker` (Chrome) and `background.scripts`
  (Firefox), plus `browser_specific_settings.gecko` (id `lokis-basket-optimizer@personal`,
  `strict_min_version` 140, `data_collection_permissions: none`). `tools/build.mjs` strips the
  Firefox-only keys for the Chrome Web Store zip.
- **Site adapters** (`lib/parser.js`, `lib/zbozi.js`) share one interface used by `content.js`:
  `siteInfo(hostname) → {site, currency}`, `isProductPage(doc, loc)`, `productKey(loc)`,
  `async extract(doc, loc) → product`, `moreButton(doc)`, `offerRowCount(doc)`.
  Product: `{key, site, currency, url, name, image, totalOffers, offers[]}`.
  Offer: `{shopId, shopName, shopSlug, price, delivery (cheapest option; null = unknown),
  storePickupOnly?, inStock, availability, rating, exitUrl}`.
  `content.js` clicks the site's "more offers" button until the list is complete, unless
  `extract` already returned ≥80 % of `totalOffers`.
- **Storage** (`lib/store.js`, `chrome.storage.local`, schema 2): `baskets[] {id, name,
  currency (CZK|EUR|null while empty), items[]}`, `activeBasketId`, `shopOverrides {[shopKey]:
  {fee, threshold, excluded}}` (shared by all baskets), `shopSlugs {[heurekaShopId]: slug}`,
  `settings {inStockOnly, maxShops, unknownFee {CZK, EUR}, language}`. An item can combine the
  same product from several sites: `item.sources[]` each with its own offers; `item.offers` is
  their union. `upsertProduct` decides added / updated / merged. Version 0.2 kept one basket in
  `items`; `load()` migrates it (writes only changed keys).
- **Optimizer** (`lib/optimizer.js`): `assignShopKeys` gives every offer a cross-site shop key;
  `buildShops` estimates each shop's fee (highest paid delivery seen) and free-shipping limit
  (cheapest product that shipped free, if consistent) and applies user overrides; `optimize`
  returns the best plan for each number of shops up to `maxShops` (exact branch and bound,
  verified against brute force; a node limit marks a plan `approximate`).
- **i18n**: every visible string goes through `t(key, vars)`; plural entries are objects keyed
  by `Intl.PluralRules` categories (`one/few/many/other`). `tests/unit/i18n.test.js` checks that
  every key and placeholder exists in en, cs and sk. The language is a setting ("auto" follows
  the browser), so `chrome.i18n` is only used for the extension name/summary.
- **Popup** escapes all data (`esc()`) before `innerHTML`; the content script builds its menu
  with DOM APIs inside a Shadow DOM.

## Site knowledge (hard-won – check here before re-investigating)

**Heureka (.cz and .sk – same page code)**
- Offer rows: `.c-offer`. Shop name: `.c-offer__logo[aria-label="Do obchodu X"]` (fallback: img
  alt "Logo X"). Shop id: the `si` query param (UUID) of the `exit-click-web` link.
- Price `.c-offer__price`; delivery `.c-offer__price-desc` ("Doprava od 69 Kč", "Doprava zdarma");
  stock `[data-testid="Availability Badge"]` ("Skladem"; .sk "Na sklade").
- More button `.c-offers-list__more-button` ("Zobrazit další nabídky" / "Zobraziť ďalšie ponuky").
- `#__NEXT_DATA__` → `props.pageProps.initialData.productDetail.offers` has only ~10 regular
  offers (+ bidding, topOffer, `regularCount` = total) and `shop.slug` (e.g. `drmax-cz`, ≈ domain).
  It is stale after client-side navigation: only use it when `query.product` matches the URL.
- .sk prices look like "4 €", "4,5 €", "1 299,00 €".

**Zboží.cz**
- Next.js. `#__NEXT_DATA__` → `props.pageProps.data.offers.items` holds only ~5 offers.
  Prices are in **hellers** (815000 = 8 150 Kč). A delivery/pickup price counts only when its
  `countDelivery` / `countPickup` > 0; `countPickup` ≤ 5 means pickup in the shop's own store →
  `storePickupOnly` (shown in the plan).
- Variants: `?varianta=` is part of the product key. After a variant switch the embedded data is
  stale → `extract` re-fetches the page HTML once.
- **All offers**: `GET /api/v3/product/{normalizedName}/?productVariant=…&limitTopOffers=4&limitCheapOffers=N&filterFields=offersData,isFavourite`
  with header `X-Zbozi-Page-Type: product-self` → `product.cheapestOffers.offers[]` (all shops,
  by price) and `product.bestOffers.offers[]`. Raw offer: `{price, availability, click,
  delivery{minPrice,count}, pickup{minPrice,count,placesCount}, shop{id, displayName}}`.
  Found by reading Zboží's JS (`getOffersData` / `_getOffersReqParams`). It is the same request
  the page makes for "Další obchody". Firefox uses `content.fetch` so it goes out as the page.
  Confirmed working on the real site (Oct 2026).
- Fallback if the API fails: click `#product-offers [data-dot="show-more"]` ("Další obchody",
  +5 rows per click) and parse `[data-testid="product-offer"]`: shop id in `data-dot-data` JSON,
  name `[class*="ProductOffer_shopName__"]`, `[data-dot="price"]` (lowest Kč amount = current
  price), `[data-dot="delivery"]` (home delivery only), `[data-dot="availability"]`,
  `a[data-testid="shop-link"]`. `#product-top-offers` is the separate "recommended" list.

**Cross-site shop identity**: `normShop(slug || name)` lowercases, strips diacritics, `www`, a
trailing TLD and punctuation (`alza-cz`, `Alza.cz` → `alza`). Two different shops of the same site
are never merged. Overrides saved under old per-site ids still apply (fallback lookup).

## Gotchas

- Chrome derives an **unpacked** extension's id from its folder path: loading from a new path =
  new id = empty storage. The store-installed version is another id (separate data).
- Firefox does not grant host permissions added in an update (the popup shows "Allow access");
  Firefox popups cannot use `confirm()`/`alert()` (Clear/Delete use a click-twice pattern).
- Only the popup and content script write storage; `background.js` only reads (`peek`) except
  on install/update (avoids a migration race that once replaced data with an empty basket).
- Known lint warnings (12): Firefox ignores `background.service_worker`; an Android
  min-version notice; `innerHTML` in popup.js (values are escaped).
- **Keep the behaviour on-demand**: the extension acts only when the user clicks on the page
  they are viewing. Heureka's website terms forbid bulk automated extraction and "derived
  services" without consent (heureka.cz/a/podminky-pouzivani-internetovych-stranek-c-30309/);
  Zboží's terms were not reviewed. No background crawling, no remote code, no analytics.
- Polish was removed on purpose; a saved `language: 'pl'` falls back to the browser language.

## Publishing

- Chrome Web Store, visibility **Unlisted**, developer/contact account paradox7307labs@gmail.com.
  All dashboard fields are in `store/LISTING.md`. Privacy policy URL = `PRIVACY.md` on GitHub.
- Firefox: addons.mozilla.org "On your own" → signed .xpi shared manually (no auto-updates).
- Brand name "Loki's Basket Optimizer" is the same in every language.

## Ideas / backlog

- **v1.1 shipping learning** (proposed, not built): keep a history of paid/free shipping
  observations per shop across all baskets; infer free-shipping limits from it; expire entries
  after ~3 months; date user-entered rules and show "check again?" when old or contradicted by
  fresh data; show ranges like "shipping 0–89 Kč" when the total falls in the unknown zone.
- Export/import of baskets and shipping rules (to move data between installs).
- Refresh stale prices without revisiting each product page.
- More sites (e.g. Pricemania.sk); better matching when names differ ("Dr. Max lékárna" vs "Dr.Max").
- Ask Heureka for consent before any public listing.
