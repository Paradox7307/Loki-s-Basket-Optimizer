const fs = require('fs');
const { JSDOM } = require('jsdom');
const P = require('../../extension/lib/parser.js');
const assert = require('assert');

const { fixture } = require('./_fixtures');
const html = fixture('heureka-cz-product.html');
const url = 'https://doplnky-stravy.heureka.cz/simethicon-s-olejem-kminu-korenneho-80-mg-50-kapsli_2/';
const dom = new JSDOM(html, { url });
const doc = dom.window.document, loc = dom.window.location;

// money parsing
assert.strictEqual(P.parseMoney('1\u00a0299 Kč'), 1299);
assert.strictEqual(P.parseMoney('Doprava od 69\u00a0Kč'), 69);
assert.strictEqual(P.parseMoney('12,49 €'), 12.49);
assert.strictEqual(P.parseDelivery('Doprava zdarma'), 0);
assert.strictEqual(P.parseDelivery(''), null);

assert.ok(P.isProductPage(doc));
const next = P.parseNextData(doc, loc);
assert.ok(next.fresh, 'next data should match URL');
assert.strictEqual(next.totalOffers, 46);

const domOffers = P.parseOffersFromDom(doc, loc.href);
console.log('DOM rows:', domOffers.length);

// cross-check DOM vs NEXT for every shop both know
const byId = new Map(next.offers.map(o => [o.shopId, o]));
let checked = 0;
for (const d of domOffers) {
  const n = byId.get(d.shopId);
  if (!n) continue;
  assert.strictEqual(d.price, n.price, 'price ' + d.shopName);
  assert.strictEqual(d.delivery, n.delivery, 'delivery ' + d.shopName);
  assert.strictEqual(d.inStock, n.inStock, 'stock ' + d.shopName);
  assert.strictEqual(d.shopName, n.shopName, 'name');
  checked++;
}
console.log('DOM rows cross-checked against embedded data:', checked);

const p = P.extractProduct(doc, loc);
console.log({ key: p.key, name: p.name, image: p.image, totalOffers: p.totalOffers, offers: p.offers.length });
console.table(p.offers.map(o => ({ shop: o.shopName, price: o.price, delivery: o.delivery, inStock: o.inStock, rating: o.rating, id: o.shopId.slice(0, 8) })));
assert.strictEqual(new Set(p.offers.map(o => o.shopId)).size, p.offers.length, 'no duplicate shops');

// stale NEXT data (client-side navigation to another product) must be ignored
const dom2 = new JSDOM(html, { url: 'https://doplnky-stravy.heureka.cz/some-other-product/' });
const p2 = P.extractProduct(dom2.window.document, dom2.window.location);
assert.strictEqual(p2.totalOffers, null);
assert.ok(!p2.offers.some(o => o.shopName === 'www.lekarna-gabriela.cz'), 'stale embedded offers not used');
console.log('stale-data guard OK; DOM-only offers:', p2.offers.length);
console.log('ALL PARSER TESTS PASSED');
