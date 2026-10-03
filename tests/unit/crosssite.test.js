const assert = require('assert');
const O = require('../../extension/lib/optimizer.js');
const off = (shopId, shopName, price, delivery, extra) => Object.assign({ shopId, shopName, price, delivery, inStock: true }, extra || {});

// normalization
assert.strictEqual(O.normShop('alza-cz'), 'alza');
assert.strictEqual(O.normShop('Alza.cz'), 'alza');
assert.strictEqual(O.normShop('www.lekarna-gabriela.cz'), 'lekarnagabriela');
assert.strictEqual(O.normShop('lekarna-gabriela-cz'), 'lekarnagabriela');
assert.strictEqual(O.normShop('Dr.Max'), 'drmax');
assert.strictEqual(O.normShop('drmax-cz'), 'drmax');
assert.strictEqual(O.normShop('1-2umobil.cz'), '12umobil');

const phoneHeureka = { key: 'h/phone', name: 'Phone', qty: 1, offers: [
  off('uuid-alza', 'Alza.cz', 8300, 0, { shopSlug: 'alza-cz' }), off('uuid-drmax', 'Dr. Max lékárna', 8400, 29) ] };
const caseZbozi = { key: 'z/case', name: 'Case', qty: 1, offers: [
  off('zbozi:1', 'Alza.cz', 299, 99), off('zbozi:2', 'Dr.Max', 250, 49), off('zbozi:3', 'Mobilkryty.cz', 199, 79) ] };

// 1) Alza is one shop across the two sites; Dr.Max only once its Heureka slug is known
let r = O.assignShopKeys([phoneHeureka, caseZbozi], {});
const keys = (it) => it.offers.map((o) => o.shopKey);
assert.deepStrictEqual(keys(r.items[0]), ['n:alza', 'n:drmaxlekarna']);
assert.deepStrictEqual(keys(r.items[1]), ['n:alza', 'n:drmax', 'n:mobilkryty']);
r = O.assignShopKeys([phoneHeureka, caseZbozi], { 'uuid-drmax': 'drmax-cz' });
assert.strictEqual(r.items[0].offers[1].shopKey, 'n:drmax', 'learned slug lets Dr.Max match across sites');
assert.deepStrictEqual(r.members['n:alza'].sort(), ['uuid-alza', 'zbozi:1']);

// 2) same-site name collision must NOT merge two different shops
const coll = O.assignShopKeys([{ key: 'x', qty: 1, offers: [off('u1', 'Lékárna.cz', 100, 39), off('u2', 'Lékárna', 90, 49)] }], {});
assert.deepStrictEqual(coll.items[0].offers.map((o) => o.shopKey), ['id:u1', 'id:u2']);

// 3) optimizer pays Alza's shipping once for products from both sites
const ov = { 'uuid-alza': { fee: 99, threshold: 1000 } };            // rule saved by an older version under the Heureka id
const { items, members } = O.assignShopKeys([phoneHeureka, caseZbozi], {});
const shops = O.buildShops(items, ov, { unknownFee: 79 }, members);
assert.strictEqual(shops['n:alza'].fee, 99, 'old per-site rule applies to the merged shop');
assert.strictEqual(shops['n:alza'].threshold, 1000);
const res = O.optimize(items, shops, { maxShops: 3, inStockOnly: true });
const single = res.options[0];
assert.strictEqual(single.groups[0].name, 'Alza.cz');
assert.strictEqual(single.total, 8300 + 299 + 0, 'one Alza order, over the 1000 Kč limit -> free shipping');
console.log('cheapest plan:', res.best.groups.map((g) => `${g.name}: ${g.subtotal} + ${g.shipping}`).join(' | '), '=', res.best.total);

// 4) same product merged from both sites: cheapest offer of a shop wins; store-pickup flag carried through
const merged = { key: 'm', name: 'Merged', qty: 2, offers: [off('uuid-alza', 'Alza.cz', 500, 0, { shopSlug: 'alza-cz' }), off('zbozi:1', 'Alza.cz', 480, 0),
  off('zbozi:9', 'MobilyOstrava.cz', 400, 0, { storePickupOnly: true })] };
const m = O.assignShopKeys([merged], {});
const ms = O.buildShops(m.items, {}, { unknownFee: 79 }, m.members);
const mr = O.optimize(m.items, ms, { maxShops: 1, inStockOnly: true });
const alzaPlan = O.bestSingleShop(m.items.map((it) => Object.assign({}, it, { offers: it.offers.filter((o) => o.shopKey === 'n:alza') })), ms, true);
assert.strictEqual(alzaPlan.groups[0].lines[0].unitPrice, 480, 'cheaper of the two Alza offers');
assert.strictEqual(mr.best.groups[0].name, 'MobilyOstrava.cz');
assert.strictEqual(mr.best.groups[0].storePickupOnly, true, 'store-pickup-only is flagged on the plan');
console.log('ALL CROSS-SITE TESTS PASSED');
