const fs = require('fs');
const { JSDOM } = require('jsdom');
const assert = require('assert');
const P = require('../../extension/lib/parser.js');
const { fixture } = require('./_fixtures');
// heureka.sk runs the same page code as heureka.cz: turn the saved .cz page into a .sk one,
// using the formats seen on the real heureka.sk ("Na sklade", "4,5 €", "Doprava od 0,89 €").
const cz = new JSDOM(fixture('heureka-cz-product.html')).window.document;
const eur = [['3,72 €', 'Doprava od 5,5 €', 'Na sklade'], ['4 €', 'Doprava od 2,99 €', 'Na sklade'], ['4,5 €', 'Doprava zdarma', 'Na sklade'],
  ['3,97 €', 'Doprava od 2,5 €', 'Do 3 dní'], ['4,15 €', 'Doprava od 0,89 €', 'Na sklade'], ['1 299,00 €', 'Doprava zdarma', 'Info v obchode']];
cz.querySelectorAll('.c-offer').forEach((row, i) => {
  const [p, d, a] = eur[i % eur.length];
  row.querySelector('.c-offer__price').textContent = p;
  row.querySelector('.c-offer__price-desc').textContent = d;
  const av = row.querySelector('[data-testid="Availability Badge"]');
  if (av) av.textContent = a;
});
cz.querySelector('.c-offers-list__more-button').textContent = 'Zobraziť ďalšie ponuky';
cz.getElementById('__NEXT_DATA__').remove();      // exercise the DOM-only path
const dom = new JSDOM(cz.documentElement.outerHTML, { url: 'https://lieky-volne-predajne.heureka.sk/espumisan-cps-50-x-40-mg/' });
const p = P.extractProduct(dom.window.document, dom.window.location);
console.table(p.offers.slice(0, 7).map(o => ({ shop: o.shopName, price: o.price, delivery: o.delivery, inStock: o.inStock, availability: o.availability })));
assert.strictEqual(p.currency, 'EUR'); assert.strictEqual(p.site, 'heureka.sk');
const byPrice = Object.fromEntries(p.offers.map(o => [o.price, o]));
assert.strictEqual(byPrice[3.72].delivery, 5.5);
assert.strictEqual(byPrice[4].delivery, 2.99);
assert.strictEqual(byPrice[4.5].delivery, 0);
assert.strictEqual(byPrice[4.15].delivery, 0.89);
assert.strictEqual(byPrice[1299].delivery, 0, 'thousands separator + decimals');
assert.strictEqual(byPrice[3.72].inStock, true, '"Na sklade" = in stock');
assert.strictEqual(byPrice[3.97].inStock, false, '"Do 3 dní" = not in stock');
assert.ok(P.MORE_BUTTON_TEXT.test('Zobraziť ďalšie ponuky') && P.MORE_BUTTON_TEXT.test('Zobrazit další nabídky'));
assert.strictEqual(P.siteInfo('www.heureka.cz').currency, 'CZK');
assert.strictEqual(P.siteInfo('evil-heureka.sk.example.com'), null);
console.log('ALL HEUREKA.SK PARSER TESTS PASSED');
