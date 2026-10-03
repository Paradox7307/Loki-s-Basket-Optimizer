const I = require('../../extension/lib/i18n.js');
const assert = require('assert');
const en = I.DICTS.en;
// every language has every key, same placeholders, and plural objects where English has them
for (const lang of I.LANGS) {
  const d = I.DICTS[lang];
  for (const k of Object.keys(en)) {
    assert.ok(d[k] != null, `${lang} missing ${k}`);
    const ph = (v) => JSON.stringify(v).match(/\{\w+\}/g)?.sort().filter((x, i, a) => a.indexOf(x) === i).join() || '';
    assert.strictEqual(ph(d[k]), ph(en[k]), `${lang}.${k} placeholders differ`);
    assert.strictEqual(typeof d[k], typeof en[k], `${lang}.${k} type`);
  }
  for (const k of Object.keys(d)) assert.ok(en[k] != null, `${lang} has extra key ${k}`);
}
const out = {};
for (const lang of I.LANGS) {
  const t = I.create(lang);
  out[lang] = [1, 2, 5, 22, 47].map(n => t.t('shops', { n })).join(' | ') + '   ·   ' + [1, 3, 12].map(n => t.t('products', { n })).join(' | ');
}
console.table(out);
assert.strictEqual(I.create('cs').t('shops', { n: 47 }), '47 obchodů');
assert.strictEqual(I.create('sk').t('shops', { n: 3 }), '3 obchody');
assert.strictEqual(I.create('auto', 'sk-SK').lang, 'sk');
assert.strictEqual(I.create('auto', 'de-DE').lang, 'en');
console.log(I.money(601, 'CZK'), '|', I.money(1299, 'CZK'), '|', I.money(12.5, 'EUR'), '|', I.money(3, 'EUR'));
console.log('ALL I18N TESTS PASSED');

assert.strictEqual(I.create('pl', 'pl-PL').lang, 'en', 'removed language falls back');
assert.ok(!I.LANGS.includes('pl'));
console.log('POLISH REMOVED OK');
