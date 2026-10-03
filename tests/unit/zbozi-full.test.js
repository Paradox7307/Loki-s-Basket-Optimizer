const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');
const Z = require('../../extension/lib/zbozi.js');
const { fixture } = require('./_fixtures');
const html = fixture('zbozi-product-rendered.html');
const URL_ = 'https://www.zbozi.cz/vyrobek/pokemon-tcg-30th-celebration-booster-bundle/';
const mk = () => new JSDOM(html, { url: URL_ });

// 1) rendered rows ("Webpage, Complete" capture): 14 rows in two lists = 9 shops
let dom = mk();
const rows = Z.parseRowsFromDom(dom.window.document, URL_);
const uniq = Z.mergeByShop([rows]);
console.table(uniq.map(o => ({ shop: o.shopName, id: o.shopId, price: o.price, delivery: o.delivery, inStock: o.inStock, link: (o.exitUrl || '').slice(0, 34) })));
assert.strictEqual(rows.length, 14);
assert.strictEqual(uniq.length, 9);
const by = Object.fromEntries(uniq.map(o => [o.shopName, o]));
assert.strictEqual(by['Smarty.cz'].price, 1099, 'price next to the "Nejlevnější" tag');
assert.strictEqual(by['Smarty.cz'].delivery, 89);
assert.strictEqual(by['Tolarie.cz'].delivery, 109, '"Doprava od 109 Kč"');
assert.strictEqual(by['Luskni.cz'].delivery, 0, '"Doprava zdarma"');
assert.strictEqual(by['Myší Doupě'].delivery, null, 'no delivery shown -> unknown');
assert.strictEqual(by['Smarty.cz'].shopId, 'zbozi:16577');
assert.ok(by['Smarty.cz'].exitUrl.startsWith('https://www.zbozi.cz/clickthru?'));
assert.strictEqual(Z.offerRowCount(dom.window.document), 5);
assert.ok(Z.moreButton(dom.window.document) && /Další obchody/.test(Z.moreButton(dom.window.document).textContent));
// discounted row: old price shown too -> lowest amount wins
const fake = new JSDOM('<article data-testid="product-offer" data-dot-data=\'{"shopId":1}\'><span class="ProductOffer_shopName__x">A</span><span data-dot="price">-15 % 1 299 Kč 1 099 Kč</span></article>').window.document;
assert.strictEqual(Z.parseRowsFromDom(fake, URL_)[0].price, 1099);

// 2) raw API (format read from Zboží's own code) -> all shops, pickup prices included
const nd = JSON.parse(dom.window.document.getElementById('__NEXT_DATA__').textContent);
const emb = nd.props.pageProps.data.offers.items;
const raw = (o) => ({ id: o.offerId, displayName: o.name, price: o.price, availability: o.availability, click: o.url,
  delivery: { minPrice: o.minPriceDelivery, count: o.countDelivery, hasMore: o.hasMoreDeliveryPrices },
  pickup: { minPrice: o.minPricePickup, count: o.countPickup, placesCount: o.countPickupPlaces },
  shop: { id: o.shop.id, displayName: o.shop.name } });
const extraShops = uniq.filter(o => !emb.some(e => 'zbozi:' + e.shop.id === o.shopId)).map(o => ({
  id: 'x' + o.shopId, displayName: 'x', price: Math.round(o.price * 100), availability: 'in_stock', click: '/clickthru?c=' + o.shopId,
  delivery: { minPrice: Math.round((o.delivery || 0) * 100), count: o.delivery == null ? 0 : 1 }, pickup: { minPrice: 0, count: 0 },
  shop: { id: Number(o.shopId.split(':')[1]), displayName: o.shopName } }));
const more = [1, 2, 3, 4, 5].map(i => ({ id: 'm' + i, displayName: 'x', price: 250000 + i * 100, availability: 'in_stock', click: '/clickthru?c=m' + i,
  delivery: { minPrice: 7900, count: 1 }, pickup: { minPrice: 4900, count: 9000 }, shop: { id: 900 + i, displayName: 'Obchod ' + i + '.cz' } }));
const apiJson = { product: { normalizedName: 'pokemon-tcg-30th-celebration-booster-bundle', shopCount: 14,
  cheapestOffers: { count: 14, offers: emb.map(raw).concat(extraShops, more) }, bestOffers: { count: 9, offers: emb.slice(0, 2).map(raw) } } };

(async () => {
  dom = mk(); Z._resetApiState();
  let req = null;
  const okFetch = async (u, opts) => { req = { u, opts }; return { ok: true, json: async () => apiJson }; };
  const p = await Z.extract(dom.window.document, dom.window.location, okFetch, dom.window.DOMParser);
  const q = new URL(req.u);
  console.log('API request:', q.pathname, Object.fromEntries(q.searchParams), req.opts.headers);
  assert.strictEqual(q.pathname, '/api/v3/product/pokemon-tcg-30th-celebration-booster-bundle/');
  assert.strictEqual(q.searchParams.get('limitCheapOffers'), '14', 'asks for all shops, like "Další obchody" until the end');
  assert.strictEqual(q.searchParams.get('filterFields'), 'offersData,isFavourite');
  assert.strictEqual(req.opts.headers['X-Zbozi-Page-Type'], 'product-self');
  assert.strictEqual(p.source, 'api');
  assert.strictEqual(p.offers.length, 14, 'all 14 shops');
  const amipa = p.offers.find(o => o.shopName === 'Amipa.cz');
  assert.strictEqual(amipa.delivery, 59, 'pickup point (59) beats home delivery (96) - only known from structured data');
  assert.ok(p.offers.find(o => o.shopName === 'Obchod 3.cz').exitUrl.startsWith('https://www.zbozi.cz/clickthru?'));

  // 3) API fails -> rendered rows + embedded data (pickup info kept where known)
  dom = mk(); Z._resetApiState();
  const badFetch = async () => ({ ok: false, status: 500 });
  const f = await Z.extract(dom.window.document, dom.window.location, badFetch, dom.window.DOMParser);
  assert.strictEqual(f.source, 'page');
  assert.strictEqual(f.offers.length, 9);
  assert.strictEqual(f.offers.find(o => o.shopName === 'Amipa.cz').delivery, 59, 'embedded pickup price merged into row');
  // and it doesn't hammer a broken API on the second read
  let calls = 0;
  await Z.extract(dom.window.document, dom.window.location, async (u) => { calls++; return { ok: false }; }, dom.window.DOMParser);
  assert.strictEqual(calls, 0);
  console.log('ALL ZBOZI FULL-OFFER TESTS PASSED');
})();
