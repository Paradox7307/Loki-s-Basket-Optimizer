/*
 * Heureka product-page parser (heureka.cz and heureka.sk share the same page code).
 *
 * Two sources, merged:
 *  1. Rendered offer rows (.c-offer) - includes offers loaded via "Zobrazit další nabídky".
 *  2. Embedded Next.js data (#__NEXT_DATA__) - structured, but only the first ~10 offers,
 *     and stale after client-side navigation, so it is used only when it matches the URL.
 *
 * Works in the browser (global HeurekaParser) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const SPACES = /[\s\u00a0\u202f\u2009]/g;
  const IN_STOCK = /skladem|skladom|na sklade/i;
  const FREE = /zdarma|zadarmo/i;

  /* Sites this parser understands and their currency. */
  const SITES = [
    { re: /(^|\.)heureka\.cz$/i, currency: 'CZK', site: 'heureka.cz' },
    { re: /(^|\.)heureka\.sk$/i, currency: 'EUR', site: 'heureka.sk' }
  ];
  function siteInfo(hostname) {
    return SITES.find((x) => x.re.test(hostname || '')) || null;
  }

  function parseMoney(text) {
    if (text == null) return null;
    const compact = String(text).replace(SPACES, '');
    const m = compact.match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!m) return null;
    return Math.round(parseFloat(m[1].replace(',', '.')) * 100) / 100;
  }

  function parseDelivery(text) {
    if (text == null) return null;
    if (FREE.test(text)) return 0;
    return parseMoney(text);
  }

  function absoluteUrl(href, base) {
    if (!href) return null;
    try { return new URL(href, base).href; } catch (e) { return null; }
  }

  function shopIdFromExitUrl(href, base) {
    try { return new URL(href, base).searchParams.get('si'); } catch (e) { return null; }
  }

  function cleanText(el) {
    return el ? el.textContent.replace(SPACES, ' ').replace(/\s+/g, ' ').trim() : '';
  }

  /* ---------- 1. Rendered offer rows ---------- */

  function parseOfferRow(row, base) {
    const exitLink = row.querySelector('.c-offer__logo') ||
      row.querySelector('a[href*="exit-click"]');
    const priceEl = row.querySelector('.c-offer__price');
    const price = parseMoney(cleanText(priceEl));
    if (!exitLink || price == null) return null;

    const href = exitLink.getAttribute('href');
    let shopName = (exitLink.getAttribute('aria-label') || '').replace(/^Do obchodu\s+/i, '').trim();
    if (!shopName) {
      const img = row.querySelector('.c-offer__shop-logo');
      shopName = img ? (img.getAttribute('alt') || '').replace(/^Logo\s+/i, '').trim() : '';
    }
    const shopId = shopIdFromExitUrl(href, base) || (shopName ? 'name:' + shopName.toLowerCase() : null);
    if (!shopId) return null;

    const deliveryEl = row.querySelector('.c-offer__price-desc');
    const availEl = row.querySelector('[data-testid="Availability Badge"]');
    const availability = cleanText(availEl) || null;
    const ratingEl = row.querySelector('[data-cy="verified-by-customers-badge"]');
    const ratingMatch = ratingEl ? cleanText(ratingEl).match(/(\d{1,3})\s*%/) : null;

    return {
      shopId,
      shopName: shopName || shopId,
      price,
      delivery: deliveryEl ? parseDelivery(cleanText(deliveryEl)) : null,
      inStock: availability ? IN_STOCK.test(availability) : null,
      availability,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      exitUrl: absoluteUrl(href, base)
    };
  }

  function parseOffersFromDom(doc, base) {
    const out = [];
    doc.querySelectorAll('.c-offer').forEach((row) => {
      const offer = parseOfferRow(row, base);
      if (offer) out.push(offer);
    });
    return out;
  }

  /* ---------- 2. Embedded Next.js data ---------- */

  function pathSlug(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function parseNextData(doc, loc) {
    const el = doc.getElementById('__NEXT_DATA__');
    if (!el) return null;
    let data;
    try { data = JSON.parse(el.textContent); } catch (e) { return null; }
    const pageProps = data && data.props && data.props.pageProps;
    const detail = pageProps && pageProps.initialData && pageProps.initialData.productDetail;
    if (!detail || !detail.product) return null;

    const slug = (data.query && data.query.product) || pageProps.productSlug || '';
    const fresh = !!slug && slug === pathSlug(loc.pathname);
    const base = loc.href;

    const o = detail.offers || {};
    const raw = [].concat(o.regular || [], o.bidding || [], o.highlighted || [], o.topOffer ? [o.topOffer] : []);
    const offers = raw.filter((x) => x && x.shop && typeof x.price === 'number').map((x) => ({
      shopId: x.shop.id || shopIdFromExitUrl(x.exitUrl, base) || 'name:' + String(x.shop.name).toLowerCase(),
      shopName: x.shop.name,
      shopSlug: x.shop.slug || null,
      price: x.price,
      delivery: typeof x.minDeliveryPrice === 'number' ? x.minDeliveryPrice : null,
      inStock: x.availability ? x.availability.type === 'IN_STOCK' : null,
      availability: x.availability ? x.availability.type : null,
      rating: x.shop.rating && x.shop.rating.recommendations && x.shop.rating.recommendations.hasEnoughRatings
        ? x.shop.rating.recommendations.percentage : null,
      exitUrl: absoluteUrl(x.exitUrl, base)
    }));

    const img = detail.product.mainImage;
    return {
      fresh,
      product: {
        id: detail.product.localId || detail.product.id,
        name: detail.product.name,
        image: img ? (img.thumbnail || img.url) : null
      },
      totalOffers: typeof o.regularCount === 'number' ? o.regularCount : null,
      offers
    };
  }

  /* ---------- Merge & extract ---------- */

  function better(a, b) {
    // true if offer a should replace offer b for the same shop
    if (a.price !== b.price) return a.price < b.price;
    if (a.inStock && !b.inStock) return true;
    return false;
  }

  function mergeOffers(lists) {
    const byShop = new Map();
    lists.forEach((list) => list.forEach((offer) => {
      const prev = byShop.get(offer.shopId);
      if (!prev) { byShop.set(offer.shopId, Object.assign({}, offer)); return; }
      const winner = better(offer, prev) ? Object.assign({}, offer) : prev;
      const loser = winner === prev ? offer : prev;
      // fill gaps from the other source
      ['delivery', 'rating', 'exitUrl', 'availability', 'inStock', 'shopSlug'].forEach((k) => {
        if (winner[k] == null && loser[k] != null) winner[k] = loser[k];
      });
      byShop.set(offer.shopId, winner);
    }));
    return Array.from(byShop.values()).sort((a, b) => a.price - b.price);
  }

  function productKey(loc) {
    return loc.hostname + '/' + pathSlug(loc.pathname);
  }

  function extractProduct(doc, loc) {
    const next = parseNextData(doc, loc);
    const useNext = next && next.fresh;
    const domOffers = parseOffersFromDom(doc, loc.href);
    const offers = mergeOffers([domOffers, useNext ? next.offers : []]);

    const h1 = doc.querySelector('h1');
    const ogImage = doc.querySelector('meta[property="og:image"]');
    const info = siteInfo(loc.hostname) || {};
    return {
      key: productKey(loc),
      site: info.site || loc.hostname,
      currency: info.currency || null,
      url: loc.origin + loc.pathname,
      name: (useNext && next.product.name) || cleanText(h1) || doc.title,
      image: (useNext && next.product.image) || (ogImage && ogImage.getAttribute('content')) || null,
      totalOffers: useNext ? next.totalOffers : null,
      domOfferCount: domOffers.length,
      offers
    };
  }

  function isProductPage(doc) {
    return !!doc.querySelector('.c-offer, .c-offers-list');
  }

  const MORE_BUTTON_TEXT = /další nabídky|ďalšie ponuky/i;

  /* adapter interface shared with lib/zbozi.js */
  function moreButton(doc) {
    const byClass = doc.querySelector('.c-offers-list__more-button');
    if (byClass) return byClass;
    return Array.from(doc.querySelectorAll('button')).find((b) => MORE_BUTTON_TEXT.test(b.textContent || '')) || null;
  }
  function offerRowCount(doc) { return doc.querySelectorAll('.c-offer').length; }
  async function extract(doc, loc) { return extractProduct(doc, loc); }

  const api = {
    id: 'heureka', parseMoney, parseDelivery, parseOffersFromDom, parseNextData,
    mergeOffers, extractProduct, extract, productKey, isProductPage, pathSlug, siteInfo, MORE_BUTTON_TEXT, moreButton, offerRowCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeurekaParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
