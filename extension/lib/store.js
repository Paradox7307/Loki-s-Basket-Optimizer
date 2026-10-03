/*
 * Storage layer shared by the content script, popup and background.
 *
 * Schema (chrome.storage.local):
 *   baskets:        [{ id, name, currency ('CZK'|'EUR'|null while empty), items: [...], createdAt, updatedAt }]
 *   activeBasketId: id of the basket shown in the popup and targeted by the page button
 *   shopOverrides:  { [shopKey]: { fee?, threshold?, excluded? } }  (shared by all baskets)
 *   shopSlugs:      { [heurekaShopId]: slug }  learned shop domains, used to match shops across sites
 *
 * A basket item can combine the same product from several sites:
 *   { key, name, image, url, site, qty, capturedAt, totalOffers, offers (all sources), sources: [
 *       { key, site, url, name, image, capturedAt, totalOffers, offers } ] }
 *   settings:       { inStockOnly, maxShops, unknownFee: { CZK, EUR }, language }
 *   schema:         2
 *
 * Version 0.2 stored a single basket in `items` and a numeric settings.unknownFee;
 * load() migrates that automatically and keeps the data.
 */
(function (root) {
  'use strict';

  const SCHEMA = 2;
  const DEFAULT_SETTINGS = {
    inStockOnly: true,
    maxShops: 3,
    unknownFee: { CZK: 79, EUR: 3.5 },
    language: 'auto'
  };

  const area = () => chrome.storage.local;
  const get = (keys) => new Promise((resolve) => area().get(keys, resolve));
  const set = (obj) => new Promise((resolve) => area().set(obj, resolve));
  const remove = (keys) => new Promise((resolve) => area().remove(keys, resolve));

  function newId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function makeBasket(name, currency) {
    const now = Date.now();
    return { id: newId(), name: name, currency: currency || null, items: [], createdAt: now, updatedAt: now };
  }

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    const fee = s && s.unknownFee;
    out.unknownFee = Object.assign({}, DEFAULT_SETTINGS.unknownFee,
      typeof fee === 'number' ? { CZK: fee } : (fee || {}));
    return out;
  }

  function settingsNeedWrite(raw) {
    const s = raw.settings;
    if (!s || typeof s !== 'object') return true;
    if (Object.keys(DEFAULT_SETTINGS).some((k) => s[k] === undefined)) return true;
    const fee = s.unknownFee;
    return !fee || typeof fee !== 'object' || ['CZK', 'EUR'].some((c) => typeof fee[c] !== 'number');
  }

  /*
   * Pure migration: raw storage object -> { state, writes, hadLegacyItems }.
   * `writes` contains only the keys that must change, so a migration never
   * overwrites data it did not need to touch.
   */
  function migrate(raw, defaultName) {
    const writes = {};
    let baskets = Array.isArray(raw.baskets) ? raw.baskets.slice() : [];
    const legacy = Array.isArray(raw.items) ? raw.items : [];
    let activeBasketId = raw.activeBasketId;

    if (legacy.length && !baskets.some((b) => b.id === 'b-migrated')) {
      // v0.2 single basket (all heureka.cz). Empty baskets can only be auto-created leftovers.
      baskets = baskets.filter((b) => b.items && b.items.length);
      const b = makeBasket(defaultName(baskets.length + 1), 'CZK');
      b.id = 'b-migrated';
      b.items = legacy;
      b.updatedAt = Math.max.apply(null, legacy.map((i) => i.capturedAt || 0));
      baskets.unshift(b);
      activeBasketId = b.id;
      writes.baskets = baskets;
      writes.activeBasketId = b.id;
    }
    if (!baskets.length) {
      baskets = [makeBasket(defaultName(1), null)];
      writes.baskets = baskets;
    }
    if (!baskets.some((b) => b.id === activeBasketId)) {
      activeBasketId = baskets[0].id;
      writes.activeBasketId = activeBasketId;
    }
    const settings = normalizeSettings(raw.settings);
    if (settingsNeedWrite(raw)) writes.settings = settings;
    if (raw.schema !== SCHEMA) writes.schema = SCHEMA;

    return {
      state: { baskets, activeBasketId, shopOverrides: raw.shopOverrides || {}, shopSlugs: raw.shopSlugs || {}, settings, schema: SCHEMA },
      writes,
      hadLegacyItems: Object.prototype.hasOwnProperty.call(raw, 'items')
    };
  }

  const KEYS = ['baskets', 'activeBasketId', 'shopOverrides', 'shopSlugs', 'settings', 'schema', 'items'];

  async function load(defaultName) {
    defaultName = defaultName || ((n) => 'Basket ' + n);
    const raw = await get(KEYS);
    const res = migrate(raw, defaultName);
    if (Object.keys(res.writes).length) await set(res.writes);
    if (res.hadLegacyItems) await remove('items');
    return res.state;
  }

  /* Read-only view for the badge: never writes, so it can't race with other writers. */
  async function peek() {
    const raw = await get(KEYS);
    if (Array.isArray(raw.baskets)) return { baskets: raw.baskets, activeBasketId: raw.activeBasketId };
    return { baskets: [{ id: 'legacy', items: raw.items || [] }], activeBasketId: 'legacy' };
  }

  function save(patch) { return set(patch); }

  function activeBasket(state) {
    return state.baskets.find((b) => b.id === state.activeBasketId) || state.baskets[0];
  }

  function compatible(basket, currency) {
    return !basket.currency || !currency || basket.currency === currency;
  }

  /* Which basket should a product in `currency` go to? null means "create a new one". */
  function targetBasket(state, currency) {
    const active = activeBasket(state);
    if (active && compatible(active, currency)) return active;
    const candidates = state.baskets.filter((b) => compatible(b, currency))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return candidates[0] || null;
  }

  function nextDefaultName(state, defaultName) {
    let n = state.baskets.length + 1;
    const names = new Set(state.baskets.map((b) => b.name));
    while (names.has(defaultName(n))) n++;
    return defaultName(n);
  }

  /* ---------- items with several sources (same product on several sites) ---------- */

  function siteFromKey(key) {
    const host = String(key || '').split('/')[0];
    if (/zbozi\.cz$/.test(host)) return 'zbozi.cz';
    if (/heureka\.sk$/.test(host)) return 'heureka.sk';
    if (/heureka\.cz$/.test(host)) return 'heureka.cz';
    return host || null;
  }

  function normalizeItem(it) {
    if (Array.isArray(it.sources) && it.sources.length) return it;
    return Object.assign({}, it, { sources: [{
      key: it.key, site: it.site || siteFromKey(it.key), url: it.url, name: it.name, image: it.image,
      capturedAt: it.capturedAt, totalOffers: it.totalOffers, offers: it.offers || []
    }] });
  }

  function recompute(it) {
    const s0 = it.sources[0];
    return Object.assign({}, it, {
      name: it.name || s0.name,
      image: it.image || it.sources.map((s) => s.image).find(Boolean) || null,
      url: it.url || s0.url,
      site: s0.site,
      offers: [].concat.apply([], it.sources.map((s) => s.offers || [])),
      capturedAt: Math.min.apply(null, it.sources.map((s) => s.capturedAt || 0)),
      totalOffers: s0.totalOffers
    });
  }

  /*
   * Put a freshly read product into a basket.
   *  - same product (any source key) already there -> refresh that source  ("updated")
   *  - mergeIntoKey given                          -> add as another source ("merged")
   *  - otherwise                                   -> new item              ("added")
   */
  function upsertProduct(basket, product, mergeIntoKey, now) {
    now = now || Date.now();
    const src = {
      key: product.key, site: product.site, url: product.url, name: product.name, image: product.image,
      capturedAt: now, totalOffers: product.totalOffers, offers: product.offers
    };
    const items = basket.items.map(normalizeItem);
    let mode, index = items.findIndex((it) => it.sources.some((s) => s.key === src.key));
    if (index >= 0) {
      const it = items[index];
      items[index] = recompute(Object.assign({}, it, { sources: it.sources.map((s) => (s.key === src.key ? src : s)) }));
      mode = 'updated';
    } else if (mergeIntoKey && (index = items.findIndex((it) => it.key === mergeIntoKey)) >= 0) {
      const it = items[index];
      items[index] = recompute(Object.assign({}, it, { sources: it.sources.concat([src]) }));
      mode = 'merged';
    } else {
      items.push(recompute({ key: src.key, name: src.name, image: src.image, url: src.url, qty: 1, sources: [src] }));
      index = items.length - 1;
      mode = 'added';
    }
    return {
      basket: Object.assign({}, basket, { items, currency: basket.currency || product.currency, updatedAt: now }),
      item: items[index],
      mode
    };
  }

  function learnSlugs(known, offers) {
    const out = Object.assign({}, known || {});
    let changed = false;
    (offers || []).forEach((o) => { if (o.shopSlug && out[o.shopId] !== o.shopSlug) { out[o.shopId] = o.shopSlug; changed = true; } });
    return changed ? out : null;
  }

  function badgeCount(state) {
    const b = activeBasket(state);
    return b ? b.items.length : 0;
  }

  const api = { SCHEMA, DEFAULT_SETTINGS, migrate, load, peek, save, upsertProduct, normalizeItem, learnSlugs, siteFromKey, makeBasket, activeBasket, compatible, targetBasket, nextDefaultName, badgeCount, normalizeSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BasketStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
