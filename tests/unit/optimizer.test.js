const O = require('../../extension/lib/optimizer.js');
const assert = require('assert');

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function brute(items, shops, maxShops, inStockOnly) {
  const ids = Object.keys(shops).filter(id => !shops[id].excluded);
  const cands = items.map(it => it.offers.filter(o => ids.includes(o.shopId) && (!inStockOnly || o.inStock !== false)));
  let best = Infinity;
  const pick = new Array(items.length);
  (function rec(i) {
    if (i === items.length) {
      const sub = {};
      pick.forEach((o, k) => { sub[o.shopId] = (sub[o.shopId] || 0) + o.price * items[k].qty; });
      const used = Object.keys(sub);
      if (used.length > maxShops) return;
      let t = 0;
      used.forEach(s => { t += sub[s] + O.shippingFor(shops[s], sub[s]); });
      if (t < best) best = t;
      return;
    }
    for (const o of cands[i]) { pick[i] = o; rec(i + 1); }
  })(0);
  return best;
}

let cases = 0, withSplit = 0;
for (let t = 0; t < 1500; t++) {
  const nShops = ri(2, 7), nItems = ri(1, 6);
  const overrides = {};
  const shopNames = Array.from({ length: nShops }, (_, i) => 's' + i);
  shopNames.forEach(s => {
    if (rnd() < 0.5) overrides[s] = { fee: ri(0, 120), threshold: rnd() < 0.6 ? ri(100, 1500) : undefined, excluded: rnd() < 0.1 };
  });
  const items = Array.from({ length: nItems }, (_, i) => ({
    key: 'i' + i, name: 'Item ' + i, qty: ri(1, 3),
    offers: shopNames.filter(() => rnd() < 0.75).map(s => {
      const price = ri(30, 900);
      return { shopId: s, shopName: s, price, delivery: rnd() < 0.2 ? null : (rnd() < 0.2 ? 0 : ri(29, 99)), inStock: rnd() < 0.85 };
    })
  }));
  const shops = O.buildShops(items, overrides, { unknownFee: 79 });
  for (const inStockOnly of [false, true]) {
    for (const maxShops of [1, 2, 3, 6]) {
      const exp = brute(items, shops, Math.min(maxShops, nItems), inStockOnly);
      const res = O.optimize(items, shops, { maxShops, inStockOnly });
      const got = res.best ? res.best.total : Infinity;
      if (Math.abs(exp - got) > 1e-6) {
        console.log(JSON.stringify({ items, overrides, maxShops, inStockOnly, exp, got }, null, 1));
        throw new Error('mismatch');
      }
      if (res.best) {
        // plan integrity: every item appears exactly once, shop count within limit, totals add up
        const keys = res.best.groups.flatMap(g => g.lines.map(l => l.key)).sort();
        assert.deepStrictEqual(keys, items.map(i => i.key).sort());
        assert.ok(res.best.shopCount <= maxShops);
        const sum = res.best.groups.reduce((a, g) => a + g.subtotal + g.shipping, 0);
        assert.ok(Math.abs(sum - res.best.total) < 1e-6);
        // options strictly decreasing in total
        for (let k = 1; k < res.options.length; k++) assert.ok(res.options[k].total < res.options[k - 1].total);
        if (res.best.shopCount > 1) withSplit++;
      }
      cases++;
    }
  }
}
console.log(`optimizer matches brute force on ${cases} cases (${withSplit} where splitting won)`);

// threshold / fee estimation from Heureka observations
const est = O.buildShops([
  { key: 'a', qty: 1, offers: [{ shopId: 'x', shopName: 'X', price: 80, delivery: 59 }] },
  { key: 'b', qty: 1, offers: [{ shopId: 'x', shopName: 'X', price: 1200, delivery: 0 }] },
  { key: 'c', qty: 1, offers: [{ shopId: 'y', shopName: 'Y', price: 500, delivery: 0 }, { shopId: 'z', shopName: 'Z', price: 90, delivery: null }] },
], {}, { unknownFee: 79 });
assert.strictEqual(est.x.fee, 59); assert.strictEqual(est.x.threshold, 1200);
assert.strictEqual(est.y.fee, 0);
assert.strictEqual(est.z.fee, 79); assert.strictEqual(est.z.feeSource, 'default');
console.log('shipping estimation OK');

// performance: realistic big basket
seed = 999;
const shopNames = Array.from({ length: 60 }, (_, i) => 'shop' + i);
const big = Array.from({ length: 12 }, (_, i) => ({
  key: 'p' + i, name: 'P' + i, qty: 1,
  offers: shopNames.filter(() => rnd() < 0.6).map(s => ({ shopId: s, shopName: s, price: ri(50, 400), delivery: ri(29, 89), inStock: true }))
}));
const bigShops = O.buildShops(big, Object.fromEntries(shopNames.map(s => [s, { threshold: ri(400, 1500) }])), {});
for (const k of [3, 5]) {
  const t0 = Date.now();
  const r = O.optimize(big, bigShops, { maxShops: k, inStockOnly: true });
  console.log(`12 items x 60 shops, max ${k} shops: ${Date.now() - t0} ms, best ${r.best.total} Kč in ${r.best.shopCount} shops, approximate=${!!r.best.approximate}, options=${r.options.map(o => o.limit + ':' + o.total).join(' ')}`);
}

// realistic: same product priced within ~40% across shops, pharmacy-like shipping
seed = 4242;
for (const [nItems, nShops] of [[5, 40], [8, 60], [12, 60], [15, 80]]) {
  const names = Array.from({ length: nShops }, (_, i) => 'shop' + i);
  const fees = names.map(() => ri(29, 89)), thr = names.map(() => (rnd() < 0.8 ? ri(8, 20) * 100 : undefined));
  const its = Array.from({ length: nItems }, (_, i) => {
    const base = ri(60, 600);
    return { key: 'p' + i, name: 'P' + i, qty: ri(1, 2),
      offers: names.filter(() => rnd() < 0.55).map((s) => ({ shopId: s, shopName: s, price: Math.round(base * (1 + rnd() * 0.4)), delivery: fees[+s.slice(4)], inStock: rnd() < 0.9 })) };
  });
  const sh = O.buildShops(its, Object.fromEntries(names.map((s, i) => [s, { threshold: thr[i] }])), {});
  for (const k of [3, 5]) {
    const t0 = Date.now();
    const r = O.optimize(its, sh, { maxShops: k, inStockOnly: true });
    console.log(`realistic ${nItems} items x ${nShops} shops, max ${k}: ${Date.now() - t0} ms, options=${r.options.map(o => o.limit + ':' + o.total).join(' ')} approx=${r.options.some(o => o.approximate)}`);
  }
}
