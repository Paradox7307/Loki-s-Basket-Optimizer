const assert = require('assert');
// minimal chrome.storage.local mock
const mem = {};
global.chrome = { storage: { local: {
  get: (keys, cb) => { const out = {}; (Array.isArray(keys) ? keys : Object.keys(keys)).forEach(k => { if (k in mem) out[k] = JSON.parse(JSON.stringify(mem[k])); }); cb(out); },
  set: (obj, cb) => { Object.assign(mem, JSON.parse(JSON.stringify(obj))); cb && cb(); },
  remove: (k, cb) => { [].concat(k).forEach(x => delete mem[x]); cb && cb(); }
} } };
const S = require('../../extension/lib/store.js');

(async () => {
  // v0.2 data exactly as the old extension stored it
  Object.assign(mem, {
    items: [{ key: 'doplnky-stravy.heureka.cz/simethicon', name: 'Simethicon', qty: 2, capturedAt: 1790000000000, offers: [{ shopId: 'a', shopName: 'A', price: 59 }] }],
    shopOverrides: { a: { fee: 49, threshold: 1500 } },
    settings: { inStockOnly: false, maxShops: 2, unknownFee: 89 }
  });
  const st = await S.load((n) => 'Košík ' + n);
  assert.strictEqual(st.baskets.length, 1);
  assert.strictEqual(st.baskets[0].name, 'Košík 1');
  assert.strictEqual(st.baskets[0].currency, 'CZK');
  assert.strictEqual(st.baskets[0].items[0].qty, 2, 'items kept incl. quantity');
  assert.deepStrictEqual(st.shopOverrides, { a: { fee: 49, threshold: 1500 } }, 'shipping rules kept');
  assert.strictEqual(st.settings.inStockOnly, false);
  assert.strictEqual(st.settings.maxShops, 2);
  assert.deepStrictEqual(st.settings.unknownFee, { CZK: 89, EUR: 3.5 }, 'old fallback fee kept for Kč');
  assert.strictEqual(st.settings.language, 'auto');
  assert.ok(!('items' in mem), 'legacy key removed');
  const again = await S.load();
  assert.deepStrictEqual(again, st, 'second load is a no-op');

  // routing: a € product must never land in a Kč basket
  const eurTarget = S.targetBasket(st, 'EUR');
  assert.strictEqual(eurTarget, null, 'no compatible basket -> create new');
  const empty = S.makeBasket('Prázdny', null);
  const st2 = Object.assign({}, st, { baskets: st.baskets.concat([empty]) });
  assert.strictEqual(S.targetBasket(st2, 'EUR').id, empty.id, 'empty basket accepts any currency');
  assert.strictEqual(S.targetBasket(st2, 'CZK').id, st.baskets[0].id, 'active Kč basket used for Kč');
  assert.strictEqual(S.nextDefaultName(st2, (n) => 'Košík ' + n), 'Košík 3');

  // fresh install
  for (const k of Object.keys(mem)) delete mem[k];
  const fresh = await S.load((n) => 'Basket ' + n);
  assert.strictEqual(fresh.baskets.length, 1);
  assert.strictEqual(fresh.baskets[0].currency, null);
  console.log('ALL STORE TESTS PASSED (v0.2 data migrates with items, quantities, shipping rules and settings intact)');
})();

// race leftover: a fresh empty basket was created before the old data was seen -> old items must still migrate
(async () => {
  await new Promise(r => setTimeout(r, 50));
  for (const k of Object.keys(mem)) delete mem[k];
  Object.assign(mem, {
    baskets: [{ id: 'bx', name: 'Basket 1', currency: null, items: [], createdAt: 1, updatedAt: 1 }], activeBasketId: 'bx', schema: 2,
    items: [{ key: 'k', name: 'Old item', qty: 3, capturedAt: 5, offers: [] }],
    shopOverrides: { s: { fee: 10 } }, settings: { inStockOnly: true, maxShops: 3, unknownFee: 89 }
  });
  const st = await S.load((n) => 'Basket ' + n);
  assert.strictEqual(st.baskets.length, 1, 'empty leftover dropped');
  assert.strictEqual(st.baskets[0].items[0].qty, 3, 'old items survive the race');
  assert.strictEqual(st.activeBasketId, 'b-migrated');
  assert.deepStrictEqual(mem.shopOverrides, { s: { fee: 10 } }, 'untouched keys are not rewritten');
  assert.strictEqual(mem.settings.unknownFee.CZK, 89);
  const peek = await S.peek();
  assert.strictEqual(S.badgeCount(peek), 1);
  console.log('RACE-SAFE MIGRATION TEST PASSED');
})();

// items combining the same product from several sites
(async () => {
  await new Promise(r => setTimeout(r, 100));
  const legacyItem = { key: 'doplnky-stravy.heureka.cz/x', name: 'X', url: 'u', qty: 2, capturedAt: 10, offers: [{ shopId: 'a', price: 1 }] };
  let basket = { id: 'b', name: 'B', currency: 'CZK', items: [legacyItem] };
  const zb = { key: 'zbozi.cz/x?varianta=v', site: 'zbozi.cz', currency: 'CZK', url: 'zu', name: 'X (Zboží)', image: 'img', totalOffers: 31, offers: [{ shopId: 'zbozi:1', price: 2 }] };
  let r = S.upsertProduct(basket, zb, 'doplnky-stravy.heureka.cz/x', 1000);
  assert.strictEqual(r.mode, 'merged');
  assert.strictEqual(r.basket.items.length, 1);
  assert.strictEqual(r.item.qty, 2, 'quantity kept');
  assert.deepStrictEqual(r.item.sources.map(s => s.site), ['heureka.cz', 'zbozi.cz'], 'legacy item normalized to a source');
  assert.strictEqual(r.item.offers.length, 2, 'offers from both sites');
  assert.strictEqual(r.item.capturedAt, 10, 'oldest source decides staleness');
  r = S.upsertProduct(r.basket, Object.assign({}, zb, { offers: [{ shopId: 'zbozi:1', price: 3 }] }), null, 2000);
  assert.strictEqual(r.mode, 'updated', 're-adding from Zboží refreshes that source only');
  assert.strictEqual(r.item.offers.find(o => o.shopId === 'zbozi:1').price, 3);
  r = S.upsertProduct(r.basket, Object.assign({}, zb, { key: 'zbozi.cz/y' }), null, 3000);
  assert.strictEqual(r.mode, 'added'); assert.strictEqual(r.basket.items.length, 2);
  assert.deepStrictEqual(S.learnSlugs({}, [{ shopId: 'u1', shopSlug: 'alza-cz' }, { shopId: 'u2' }]), { u1: 'alza-cz' });
  assert.strictEqual(S.learnSlugs({ u1: 'alza-cz' }, [{ shopId: 'u1', shopSlug: 'alza-cz' }]), null, 'no write when nothing new');
  console.log('MULTI-SOURCE ITEM TESTS PASSED');
})();
