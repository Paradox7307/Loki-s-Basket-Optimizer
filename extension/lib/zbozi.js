/*
 * Zboží.cz product-page parser.
 *
 * Zboží renders the offer rows in the browser, so the reliable source is the embedded
 * Next.js data (#__NEXT_DATA__): props.pageProps.data.offers.items. Prices there are in
 * hellers (815000 = 8 150 Kč). Each offer has the cheapest home-delivery and pickup prices;
 * a price only counts when that method exists (countDelivery / countPickup > 0).
 *
 * The embedded data covers only the cheapest few offers (5 at the time of writing). All offers
 * come from the endpoint the page itself uses for "Další obchody":
 *   GET /api/v3/product/{name}/?productVariant=..&limitCheapOffers=N&filterFields=offersData,isFavourite
 *   -> product.cheapestOffers.offers[] (all shops, by price) and product.bestOffers.offers[]
 *   raw offer: { price, availability, click, delivery{minPrice,count}, pickup{minPrice,count}, shop{id,displayName} }
 * If that request ever fails, the content script clicks "Další obchody" (#product-offers) until the
 * list is complete and the rendered rows are read instead (rows show home delivery only).
 *
 * Products have variants (?varianta=...), which are part of the product key.
 * After client-side navigation (e.g. picking another variant) the embedded data is stale;
 * extract() then re-reads the current URL's HTML once.
 *
 * Works in the browser (global ZboziParser) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const SITE = { re: /(^|\.)zbozi\.cz$/i, currency: 'CZK', site: 'zbozi.cz' };
  const STORE_PICKUP_MAX_PLACES = 5;   // a handful of pickup places = the shop's own branches

  function siteInfo(hostname) { return SITE.re.test(hostname || '') ? SITE : null; }

  function pathSlug(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    return parts[0] === 'vyrobek' && parts[1] ? parts[1] : '';
  }

  function urlVariant(loc) {
    try { return new URLSearchParams(loc.search || '').get('varianta') || ''; } catch (e) { return ''; }
  }

  function isProductPage(doc, loc) {
    return /^\/vyrobek\/[^/]+/.test((loc || (doc && doc.location) || {}).pathname || '');
  }

  function readNextData(doc) {
    const el = doc.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function productKey(loc, variant) {
    const v = variant || urlVariant(loc);
    return 'zbozi.cz/' + pathSlug(loc.pathname) + (v ? '?varianta=' + v : '');
  }

  const heller = (n) => (typeof n === 'number' ? Math.round(n) / 100 : null);

  function shipping(o) {
    const options = [];
    if (o.countDelivery > 0 && typeof o.minPriceDelivery === 'number') options.push({ price: heller(o.minPriceDelivery), kind: 'delivery' });
    if (o.countPickup > 0 && typeof o.minPricePickup === 'number') {
      options.push({ price: heller(o.minPricePickup), kind: o.countPickup <= STORE_PICKUP_MAX_PLACES ? 'store' : 'pickup' });
    }
    if (!options.length) return { delivery: null, storePickupOnly: false };
    // a pickup in the shop's own branch is only used when nothing else exists
    const remote = options.filter((x) => x.kind !== 'store');
    const pool = remote.length ? remote : options;
    const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
    return { delivery: best.price, storePickupOnly: !remote.length };
  }

  function offersFromData(data, base) {
    const items = (data && data.offers && data.offers.items) || [];
    return items.filter((x) => x && x.shop && typeof x.price === 'number').map((x) => {
      const ship = shipping(x);
      let exitUrl = null;
      try { exitUrl = x.url ? new URL(x.url, base).href : null; } catch (e) { exitUrl = null; }
      return {
        shopId: 'zbozi:' + x.shop.id,
        shopName: x.shop.name,
        shopSlug: null,
        price: heller(x.price),
        delivery: ship.delivery,
        storePickupOnly: ship.storePickupOnly || undefined,
        inStock: x.availability ? x.availability === 'in_stock' : null,
        availability: x.availability || null,
        rating: null,
        exitUrl
      };
    });
  }

  function absolute(href, base) {
    try { return href ? new URL(href, base).href : null; } catch (e) { return null; }
  }

  /* ---------- raw API offers ---------- */

  function fromRawOffer(o, base) {
    const d = o.delivery || {}, pk = o.pickup || {};
    const ship = shipping({ countDelivery: d.count || 0, minPriceDelivery: d.minPrice || 0, countPickup: pk.count || 0, minPricePickup: pk.minPrice || 0 });
    return {
      shopId: 'zbozi:' + o.shop.id,
      shopName: o.shop.displayName || o.shop.name || String(o.shop.id),
      shopSlug: null,
      price: heller(o.price),
      delivery: ship.delivery,
      storePickupOnly: ship.storePickupOnly || undefined,
      inStock: o.availability ? o.availability === 'in_stock' : null,
      availability: o.availability || null,
      rating: null,
      exitUrl: absolute(o.click || o.url, base)
    };
  }

  function offersFromApi(json, base) {
    const p = json && json.product;
    if (!p || !p.cheapestOffers || !Array.isArray(p.cheapestOffers.offers)) return null;
    const raw = p.cheapestOffers.offers.concat((p.bestOffers && p.bestOffers.offers) || []);
    return raw.filter((o) => o && o.shop && o.shop.id != null && typeof o.price === 'number').map((o) => fromRawOffer(o, base));
  }

  function apiUrl(loc, productName, variant, limit) {
    const q = new URLSearchParams();
    if (variant) q.set('productVariant', variant);
    q.set('limitTopOffers', '4');
    q.set('limitCheapOffers', String(limit || -1));
    q.set('filterFields', 'offersData,isFavourite');
    return loc.origin + '/api/v3/product/' + encodeURIComponent(productName) + '/?' + q.toString();
  }

  /* ---------- rendered rows (fallback) ---------- */

  const SPACES = /[\s\u00a0\u202f\u2009]+/g;
  const clean = (el) => (el ? el.textContent.replace(SPACES, ' ').trim() : '');
  function amounts(text) {
    const out = [];
    String(text || '').replace(/(\d[\d\s\u00a0\u202f]*(?:,\d{1,2})?)\s*Kč/g, (m, n) => {
      out.push(parseFloat(n.replace(SPACES, '').replace(',', '.')));
      return m;
    });
    return out;
  }

  function parseRowsFromDom(doc, base) {
    const out = [];
    doc.querySelectorAll('[data-testid="product-offer"]').forEach((row) => {
      let id = null;
      try { id = JSON.parse(row.getAttribute('data-dot-data') || '{}').shopId; } catch (e) { id = null; }
      let name = clean(row.querySelector('[class*="ProductOffer_shopName__"]'));
      if (!name) {
        const img = row.querySelector('a[data-testid="shop-link"] img');
        const m = img && (img.getAttribute('alt') || '').match(/v obchodě\s+(.+)$/);
        name = m ? m[1].trim() : '';
      }
      // a discounted row may also show the old price: the current one is the lowest amount
      const prices = amounts(clean(row.querySelector('[data-dot="price"]')));
      if (!prices.length || (id == null && !name)) return;
      const delText = clean(row.querySelector('[data-dot="delivery"]'));
      const delivery = !delText ? null : (/zdarma/i.test(delText) ? 0 : (amounts(delText)[0] != null ? amounts(delText)[0] : null));
      const availability = clean(row.querySelector('[data-dot="availability"]')) || null;
      const link = row.querySelector('a[data-testid="shop-link"]');
      out.push({
        shopId: id != null ? 'zbozi:' + id : 'zbozi-name:' + name.toLowerCase(),
        shopName: name || String(id),
        shopSlug: null,
        price: Math.min.apply(null, prices),
        delivery,
        inStock: availability ? /skladem/i.test(availability) : null,
        availability,
        rating: null,
        exitUrl: link ? absolute(link.getAttribute('href'), base) : null
      });
    });
    return out;
  }

  /* One offer per shop: lowest price; structured data (API/embedded) fills gaps in rendered rows. */
  function mergeByShop(lists) {
    const byShop = new Map();
    lists.forEach((list) => (list || []).forEach((o) => {
      const prev = byShop.get(o.shopId);
      if (!prev) { byShop.set(o.shopId, Object.assign({}, o)); return; }
      const winner = o.price < prev.price ? Object.assign({}, o) : prev;
      const other = winner === prev ? o : prev;
      ['delivery', 'exitUrl', 'availability', 'inStock', 'storePickupOnly'].forEach((k) => {
        if (winner[k] == null && other[k] != null) winner[k] = other[k];
      });
      byShop.set(o.shopId, winner);
    }));
    return Array.from(byShop.values()).sort((a, b) => a.price - b.price);
  }

  /* Parse a document whose embedded data matches `loc`; returns null if it doesn't. */
  function parseDoc(doc, loc) {
    const nd = readNextData(doc);
    const data = nd && nd.props && nd.props.pageProps && nd.props.pageProps.data;
    if (!data || !data.offers) return null;
    const q = nd.query || {};
    const wantVariant = urlVariant(loc);
    const fresh = q.product === pathSlug(loc.pathname) && (!wantVariant || q.varianta === wantVariant);
    if (!fresh) return null;

    const variant = data.selectedVariant || null;
    const variantSlug = wantVariant || q.varianta || (variant && variant.normalizedName) || '';
    const hasVariants = Array.isArray(data.variants) && data.variants.length > 1;
    const name = data.name + (hasVariants && variant && variant.name ? ' ' + variant.name : '');
    const image = (variant && variant.images && variant.images[0]) || (data.images && data.images[0] && (data.images[0].url || data.images[0])) || null;
    const offers = offersFromData(data, loc.href).sort((a, b) => a.price - b.price);
    const total = variant && typeof variant.offerCount === 'number' ? variant.offerCount
      : (typeof data.offers.shopCount === 'number' ? data.offers.shopCount : null);

    return {
      key: productKey(loc, variantSlug),
      site: SITE.site,
      currency: SITE.currency,
      url: loc.origin + loc.pathname + (variantSlug ? '?varianta=' + variantSlug : ''),
      name,
      image: typeof image === 'string' ? image : null,
      totalOffers: total,
      domOfferCount: 0,
      offers
    };
  }

  function pageFetch() {
    // Firefox: content.fetch makes the request as the page (same cookies); Chrome: plain fetch
    try { if (typeof content !== 'undefined' && content && typeof content.fetch === 'function') return content.fetch.bind(content); } catch (e) { /* ignore */ }
    return typeof fetch !== 'undefined' ? fetch : null;
  }

  let apiBroken = false;   // after one failure on this page, don't keep retrying

  async function extract(doc, loc, fetchImpl, DOMParserImpl) {
    const f = fetchImpl || pageFetch();
    let product = parseDoc(doc, loc);
    if (!product && f) {
      // embedded data belongs to another page/variant (client-side navigation): re-read once
      const DP = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
      try {
        const res = await f(loc.href, { credentials: 'include' });
        if (res.ok && DP) product = parseDoc(new DP().parseFromString(await res.text(), 'text/html'), loc);
      } catch (e) { /* fall through */ }
    }
    if (!product) return null;

    let apiOffers = null;
    if (f && !apiBroken && product.totalOffers !== product.offers.length) {
      try {
        const variant = (product.key.split('?varianta=')[1]) || '';
        const res = await f(apiUrl(loc, pathSlug(loc.pathname), variant, product.totalOffers || -1), {
          credentials: 'include', headers: { 'Accept': 'application/json', 'X-Zbozi-Page-Type': 'product-self' }
        });
        apiOffers = res.ok ? offersFromApi(await res.json(), loc.href) : null;
      } catch (e) { apiOffers = null; }
      if (!apiOffers) apiBroken = true;
    }
    const domOffers = parseRowsFromDom(doc, loc.href);
    product.offers = mergeByShop([apiOffers, product.offers, domOffers]);
    product.source = apiOffers ? 'api' : (domOffers.length ? 'page' : 'embedded');
    product.domOfferCount = domOffers.length;
    return product;
  }

  /* fallback expansion: the "Další obchody" button of the by-price list */
  function moreButton(doc) {
    const b = doc.querySelector('#product-offers [data-dot="show-more"]');
    if (b) return b;
    return Array.from(doc.querySelectorAll('#product-offers button')).find((x) => /další obchody/i.test(x.textContent || '')) || null;
  }
  function offerRowCount(doc) { return doc.querySelectorAll('#product-offers [data-testid="product-offer"]').length; }

  const api = {
    id: 'zbozi', siteInfo, isProductPage, productKey, parseDoc, extract, shipping, pathSlug,
    offersFromApi, parseRowsFromDom, mergeByShop, apiUrl, moreButton, offerRowCount,
    _resetApiState: () => { apiBroken = false; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZboziParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
