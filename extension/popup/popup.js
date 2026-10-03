(function () {
  'use strict';

  const O = globalThis.BasketOptimizer;
  const S = globalThis.BasketStore;
  const L = globalThis.I18n;
  const SITES = [
    { name: 'heureka.cz', origin: 'https://*.heureka.cz/*' },
    { name: 'heureka.sk', origin: 'https://*.heureka.sk/*' },
    { name: 'zbozi.cz', origin: 'https://*.zbozi.cz/*' }
  ];
  const STALE_MS = 3 * 24 * 3600 * 1000;
  const SHOPS_COLLAPSED = 12;

  let store = null;           // persisted state (see lib/store.js)
  const ui = { selectedLimit: null, showAllShops: false, renaming: false, deleteArmed: null };
  let i18n = L.create('auto', navigator.language);
  const t = (k, v) => i18n.t(k, v);
  const defaultName = (n) => t('defaultBasketName', { n });

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function basket() { return S.activeBasket(store); }
  function currency() { return basket().currency || 'CZK'; }
  function money(n) { return L.money(n, currency()); }

  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return t('justNow');
    if (m < 60) return t('minAgo', { n: m });
    const h = Math.round(m / 60);
    if (h < 36) return t('hAgo', { n: h });
    return t('daysAgo', { n: Math.round(h / 24) });
  }

  async function saveBasket(patch) {
    const b = basket();
    const updated = Object.assign({}, b, patch, { updatedAt: Date.now() });
    await S.save({ baskets: store.baskets.map((x) => (x.id === b.id ? updated : x)) });
  }

  /* ---------- static text ---------- */

  function applyStaticText() {
    document.documentElement.lang = i18n.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('#open-tab').title = t('openInTab');
    const lang = $('#language');
    if (!lang.options.length) {
      ['auto'].concat(L.LANGS).forEach((code) => {
        const o = document.createElement('option');
        o.value = code;
        lang.appendChild(o);
      });
    }
    Array.from(lang.options).forEach((o) => { o.textContent = o.value === 'auto' ? t('languageAuto') : L.LANG_NAMES[o.value]; });
  }

  /* ---------- basket bar ---------- */

  function basketLabel(b) {
    const cur = b.currency ? ' · ' + L.currencySymbol(b.currency) : '';
    return `${b.name} (${b.items.length})${cur}`;
  }

  function renderBasketBar() {
    const el = $('#basketbar');
    const b = basket();
    if (ui.renaming) {
      el.innerHTML = `
        <div class="basket-select-wrap"><input class="basket-name" id="basket-name" maxlength="60" value="${esc(b.name)}" aria-label="${esc(t('basket'))}"></div>
        <div class="actions">
          <button type="button" class="primary-small" id="rename-save">${esc(t('save'))}</button>
          <button type="button" class="ghost" id="rename-cancel">${esc(t('cancel'))}</button>
        </div>`;
      const input = $('#basket-name');
      input.focus(); input.select();
      const commit = async () => {
        const name = input.value.trim();
        ui.renaming = false;
        if (name && name !== b.name) await saveBasket({ name });
        else render();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { ui.renaming = false; render(); }
      });
      $('#rename-save').addEventListener('click', commit);
      $('#rename-cancel').addEventListener('click', () => { ui.renaming = false; render(); });
      return;
    }

    el.innerHTML = `
      <div class="basket-select-wrap">
        <select class="basket-select" id="basket-select" aria-label="${esc(t('basket'))}">
          ${store.baskets.map((x) => `<option value="${esc(x.id)}" ${x.id === b.id ? 'selected' : ''}>${esc(basketLabel(x))}</option>`).join('')}
        </select>
      </div>
      <div class="actions">
        <button type="button" class="ghost" id="basket-new">${esc(t('newBasket'))}</button>
        <button type="button" class="ghost" id="basket-rename">${esc(t('rename'))}</button>
        <button type="button" class="ghost ${ui.deleteArmed ? 'armed' : ''}" id="basket-delete">${esc(ui.deleteArmed ? t('deleteConfirm') : t('deleteBasket'))}</button>
      </div>`;

    $('#basket-select').addEventListener('change', async (e) => {
      ui.selectedLimit = null; ui.showAllShops = false;
      await S.save({ activeBasketId: e.target.value });
    });
    $('#basket-new').addEventListener('click', async () => {
      const nb = S.makeBasket(S.nextDefaultName(store, defaultName), null);
      ui.renaming = true; ui.selectedLimit = null;
      await S.save({ baskets: store.baskets.concat([nb]), activeBasketId: nb.id });
    });
    $('#basket-rename').addEventListener('click', () => { ui.renaming = true; render(); });
    $('#basket-delete').addEventListener('click', async () => {
      if (!ui.deleteArmed) {
        ui.deleteArmed = setTimeout(() => { ui.deleteArmed = null; renderBasketBar(); }, 3000);
        renderBasketBar();
        return;
      }
      clearTimeout(ui.deleteArmed); ui.deleteArmed = null;
      let baskets = store.baskets.filter((x) => x.id !== b.id);
      if (!baskets.length) baskets = [S.makeBasket(defaultName(1), null)];
      ui.selectedLimit = null;
      await S.save({ baskets, activeBasketId: baskets[0].id });
    });
  }

  /* ---------- compute ---------- */

  function compute() {
    // the same shop on Heureka and Zboží becomes one shop (one shipping fee)
    const keyed = O.assignShopKeys(basket().items, store.shopSlugs);
    const shops = O.buildShops(keyed.items, store.shopOverrides, { unknownFee: store.settings.unknownFee[currency()] }, keyed.members);
    const result = O.optimize(keyed.items, shops, { maxShops: store.settings.maxShops, inStockOnly: store.settings.inStockOnly });
    return { shops, result, items: keyed.items };
  }

  /* ---------- result ---------- */

  function renderResult(model) {
    const el = $('#result');
    const items = basket().items;
    if (!items.length) {
      el.innerHTML = `<div class="empty"><p><strong>${esc(t('emptyTitle'))}</strong></p><p class="muted">${esc(t('emptyHelp'))}</p></div>`;
      return;
    }
    const { result } = model;
    if (result.infeasible && result.infeasible.length) {
      const names = result.infeasible.map((k) => (items.find((i) => i.key === k) || {}).name || k);
      el.innerHTML = `<div class="result"><p class="lead">${esc(t('cantBuild'))}</p>
        <p class="note bad">${esc(t('noUsableOffer', { names: names.join(', ') }))} ${esc(store.settings.inStockOnly ? t('hintInStock') : t('hintExcluded'))}</p></div>`;
      return;
    }
    if (!result.best) {
      el.innerHTML = `<div class="result"><p class="lead">${esc(t('cantBuild'))}</p>
        <p class="note bad">${esc(t('noCombination', { n: store.settings.maxShops }))}</p></div>`;
      return;
    }

    const options = result.options;
    const plan = options.find((o) => o.limit === ui.selectedLimit) || result.best;
    const cheapest = result.best;

    const optionButtons = options.length > 1 ? `
      <div class="options" role="group" aria-label="${esc(t('compareGroup'))}">
        ${options.map((o) => `
          <button type="button" class="option" data-limit="${o.limit}" aria-pressed="${o === plan}">
            <span class="n">${esc(t('shops', { n: o.shopCount }))}${o === cheapest ? ` <span class="tag">${esc(t('cheapestTag'))}</span>` : ''}</span>
            <span class="p">${esc(money(o.total))}</span>
          </button>`).join('')}
      </div>` : '';

    const how = plan.shopCount === 1
      ? esc(t('everythingFrom', { shop: '\u0000' })).replace('\u0000', `<strong>${esc(plan.groups[0].name)}</strong>`)
      : esc(t('splitAcross', { n: plan.shopCount }));

    let compare = '';
    if (options.length > 1) {
      const single = options[0];
      if (plan === cheapest && single !== cheapest) {
        const saved = money(single.total - cheapest.total);
        compare = single.shopCount === 1
          ? t('savesVsShop', { amount: saved, shop: single.groups[0].name })
          : t('savesVsN', { amount: saved, n: single.shopCount });
      } else if (plan !== cheapest) {
        compare = t('costsMore', { amount: money(plan.total - cheapest.total) });
      }
    } else if (plan.shopCount === 1 && store.settings.maxShops > 1) {
      compare = t('noSaving');
    }
    compare = compare ? `<p class="note">${esc(compare)}</p>` : '';

    const alt = plan.shopCount === 1 && plan.alternatives && plan.alternatives.length
      ? `<p class="note">${esc(t('alsoSimilar', { list: plan.alternatives.map((a) => `${a.name} (${money(a.total)})`).join(', ') }))}</p>`
      : '';

    const groups = plan.groups.map((g) => {
      const shipText = g.shipping === 0 ? t('freeShipping') : t('shippingAmount', { amount: money(g.shipping) });
      const est = (g.shippingEstimated ? ` <span class="est" title="${esc(t('estTitle'))}">${esc(t('est'))}</span>` : '') +
        (g.storePickupOnly ? ` <span class="est" title="${esc(t('storePickupTitle'))}">${esc(t('storePickupOnly'))}</span>` : '');
      const toFree = g.missingForFree != null && g.missingForFree > 0 && g.missingForFree <= g.shipping * 4
        ? `<p class="note">${esc(t('toFree', { amount: money(g.missingForFree) }))}</p>` : '';
      return `
        <div class="group">
          <div class="group-head"><span class="name">${esc(g.name)}</span><span>${esc(money(g.total))}</span></div>
          <ul class="lines">
            ${g.lines.map((l) => `
              <li><a class="item" href="${esc(l.exitUrl || '#')}" target="_blank" rel="noopener" title="${esc(l.name)}">${esc(l.name)}</a>
                  <span class="amt">${l.qty > 1 ? `<span class="qty">${l.qty}× </span>` : ''}${esc(money(l.cost))}</span></li>`).join('')}
          </ul>
          <div class="sums"><span>${esc(t('goodsAmount', { amount: money(g.subtotal) }))}</span><span>${esc(shipText)}${est}</span></div>
          ${toFree}
          <button type="button" class="open-shop" data-shop="${esc(g.shopId)}">${esc(t('openAtShop', { products: t('products', { n: g.lines.length }) }))}</button>
        </div>`;
    }).join('');

    const warnings = [];
    if (plan.approximate) warnings.push(`<p class="note warn">${esc(t('approximate'))}</p>`);
    const stale = items.filter((i) => Date.now() - i.capturedAt > STALE_MS);
    if (stale.length) warnings.push(`<p class="note warn">${esc(t('staleWarn', { n: stale.length }))}</p>`);

    const lead = plan === cheapest
      ? t('cheapestWay', { products: t('products', { n: items.length }) })
      : t('cheapestWith', { shops: t('shops', { n: plan.shopCount }) });

    el.innerHTML = `
      <div class="result">
        <p class="lead">${esc(lead)}</p>
        <p class="total">${esc(money(plan.total))}</p>
        <p class="how">${how}${esc(plan.shipping > 0 ? t('includingShipping', { amount: money(plan.shipping) }) : t('includingFreeShipping'))}</p>
        ${optionButtons}
        ${compare}
        ${alt}
        ${groups}
        ${warnings.join('')}
      </div>`;

    el.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
      ui.selectedLimit = Number(b.dataset.limit);
      render();
    }));
    el.querySelectorAll('.open-shop').forEach((b) => b.addEventListener('click', () => {
      const g = plan.groups.find((x) => x.shopId === b.dataset.shop);
      chrome.runtime.sendMessage({ type: 'openTabs', urls: g.lines.map((l) => l.exitUrl).filter(Boolean) });
    }));
  }

  /* ---------- products ---------- */

  function renderProducts(model) {
    const el = $('#products');
    const items = basket().items;
    const keyed = new Map(model.items.map((it) => [it.key, it]));
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <h2>${esc(t('productsHeading'))}</h2>
      <ul class="products">
        ${items.map((it) => {
          const pool = store.settings.inStockOnly ? it.offers.filter((o) => o.inStock !== false) : it.offers;
          const from = pool.length ? Math.min.apply(null, pool.map((o) => o.price)) : null;
          const stale = Date.now() - it.capturedAt > STALE_MS;
          const shopCount = new Set((keyed.get(it.key) || it).offers.map((o) => o.shopKey || o.shopId)).size;
          const sites = (it.sources || []).map((src) => src.site).filter((x, i, a) => x && a.indexOf(x) === i);
          const meta = [from != null ? t('fromPrice', { amount: money(from) }) : null, t('shops', { n: shopCount }),
            sites.length > 1 ? sites.join(' + ') : null].filter(Boolean).join(', ');
          return `
          <li class="product" data-key="${esc(it.key)}">
            ${it.image ? `<img src="${esc(it.image)}" alt="">` : '<span></span>'}
            <div class="text">
              <a class="title" href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.name)}">${esc(it.name)}</a>
              <span class="meta">${esc(meta)}, <span class="${stale ? 'stale' : ''}">${esc(t('pricesAgo', { ago: ago(it.capturedAt) }))}</span></span>
            </div>
            <div class="controls">
              <span class="stepper">
                <button type="button" data-act="dec" aria-label="${esc(t('decQty'))}">−</button>
                <span aria-label="${esc(t('quantity'))}">${Number(it.qty)}</span>
                <button type="button" data-act="inc" aria-label="${esc(t('incQty'))}">+</button>
              </span>
              <button type="button" class="remove" data-act="remove" aria-label="${esc(t('removeItem', { name: it.name }))}" title="${esc(t('remove'))}">×</button>
            </div>
          </li>`;
        }).join('')}
      </ul>`;

    el.querySelectorAll('.product button').forEach((b) => b.addEventListener('click', async () => {
      const key = b.closest('.product').dataset.key;
      const act = b.dataset.act;
      const items2 = basket().items.slice();
      const i = items2.findIndex((x) => x.key === key);
      if (i < 0) return;
      if (act === 'remove') items2.splice(i, 1);
      else items2[i] = Object.assign({}, items2[i], { qty: Math.max(1, Math.min(99, items2[i].qty + (act === 'inc' ? 1 : -1))) });
      // an emptied basket can take products in any currency again
      await saveBasket(items2.length ? { items: items2 } : { items: items2, currency: null });
    }));
  }

  /* ---------- shipping rules ---------- */

  function renderShipping(model) {
    const el = $('#shipping-body');
    const summary = $('#shipping summary');
    const shops = Object.values(model.shops);
    if (!shops.length) {
      summary.textContent = t('shippingRules');
      el.innerHTML = `<p class="explain">${esc(t('shippingEmpty'))}</p>`;
      return;
    }
    summary.textContent = t('shippingRulesCount', { n: shops.length });

    const inPlan = new Set();
    (model.result.options || []).forEach((o) => o.groups.forEach((g) => inPlan.add(g.shopId)));
    const n = basket().items.length;
    shops.sort((a, b) => (inPlan.has(b.id) - inPlan.has(a.id)) || (b.coverage - a.coverage) || a.name.localeCompare(b.name, i18n.lang));
    const visible = ui.showAllShops ? shops : shops.slice(0, SHOPS_COLLAPSED);
    const unknownFee = store.settings.unknownFee[currency()];

    el.innerHTML = `
      <p class="explain">${esc(t('shippingExplain'))}</p>
      <table class="ship-table">
        <thead><tr><th>${esc(t('colShop'))}</th><th title="${esc(t('colSellsTitle'))}">${esc(t('colSells'))}</th><th>${esc(t('colShipping'))}</th><th>${esc(t('colFreeFrom'))}</th><th title="${esc(t('colUseTitle'))}">${esc(t('colUse'))}</th></tr></thead>
        <tbody>
          ${visible.map((s) => {
            const ov = store.shopOverrides[s.id] || {};
            const feePh = s.estFee != null ? s.estFee : unknownFee;
            const thrPh = s.estThreshold != null ? s.estThreshold : '—';
            return `
            <tr class="${s.excluded ? 'excluded' : ''}" data-shop="${esc(s.id)}">
              <td class="shop-name" title="${esc(s.name)}"><span class="${inPlan.has(s.id) ? 'in-plan' : ''}">${esc(s.name)}</span>${s.rating != null ? ` <span class="rating">${Number(s.rating)}%</span>` : ''}</td>
              <td>${Number(s.coverage)}/${n}</td>
              <td><input type="number" min="0" step="any" data-field="fee" value="${ov.fee != null ? esc(ov.fee) : ''}" placeholder="${esc(feePh)}" aria-label="${esc(t('feeFor', { shop: s.name }))}"></td>
              <td><input type="number" min="0" step="any" data-field="threshold" value="${ov.threshold != null ? esc(ov.threshold) : ''}" placeholder="${esc(thrPh)}" aria-label="${esc(t('freeFromFor', { shop: s.name }))}"></td>
              <td><input type="checkbox" data-field="use" ${s.excluded ? '' : 'checked'} aria-label="${esc(t('useShop', { shop: s.name }))}"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${shops.length > SHOPS_COLLAPSED ? `<button type="button" class="ghost more-shops" id="toggle-shops">${esc(ui.showAllShops ? t('showFewerShops') : t('showAllShops', { n: shops.length }))}</button>` : ''}`;

    el.querySelectorAll('input').forEach((input) => input.addEventListener('change', async () => {
      const id = input.closest('tr').dataset.shop;
      const overrides = Object.assign({}, store.shopOverrides);
      const ov = Object.assign({}, overrides[id] || {});
      const field = input.dataset.field;
      if (field === 'use') ov.excluded = !input.checked;
      else {
        const v = input.value.trim() === '' ? null : Number(input.value.replace(',', '.'));
        ov[field] = (v == null || isNaN(v) || v < 0) ? null : v;
      }
      Object.keys(ov).forEach((k) => { if (ov[k] == null || ov[k] === false) delete ov[k]; });
      if (Object.keys(ov).length) overrides[id] = ov; else delete overrides[id];
      await S.save({ shopOverrides: overrides });
    }));
    const toggle = $('#toggle-shops');
    if (toggle) toggle.addEventListener('click', () => { ui.showAllShops = !ui.showAllShops; render(); });
  }

  /* ---------- settings ---------- */

  function renderSettings() {
    const lang = store.settings.language;
    $('#language').value = L.LANGS.indexOf(lang) >= 0 ? lang : 'auto';   // e.g. a removed language
    $('#in-stock-only').checked = !!store.settings.inStockOnly;
    $('#max-shops').value = String(store.settings.maxShops);
    $('#unknown-fee').value = String(store.settings.unknownFee[currency()]);
    $('#unknown-fee-cur').textContent = L.currencySymbol(currency());
  }

  function bindSettings() {
    const update = (patch) => S.save({ settings: Object.assign({}, store.settings, patch) });
    $('#language').addEventListener('change', (e) => update({ language: e.target.value }));
    $('#in-stock-only').addEventListener('change', (e) => update({ inStockOnly: e.target.checked }));
    $('#max-shops').addEventListener('change', (e) => { ui.selectedLimit = null; update({ maxShops: Number(e.target.value) }); });
    $('#unknown-fee').addEventListener('change', (e) => {
      const v = Number(String(e.target.value).replace(',', '.'));
      if (!isNaN(v) && v >= 0) update({ unknownFee: Object.assign({}, store.settings.unknownFee, { [currency()]: v }) });
    });
    $('#open-tab').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') });
    });
  }

  /* ---------- site access (Firefox lets users revoke it) ---------- */

  function checkAccess() {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    Promise.all(SITES.map((s) => new Promise((r) => chrome.permissions.contains({ origins: [s.origin] }, (ok) => r(ok ? null : s)))))
      .then((res) => {
        const missing = res.filter(Boolean);
        const el = $('#access');
        if (!missing.length) { el.hidden = true; el.textContent = ''; return; }
        el.hidden = false;
        el.innerHTML = `
          <p><strong>${esc(t('noAccess', { sites: missing.map((m) => m.name).join(', ') }))}</strong> ${esc(t('noAccessHelp'))}</p>
          <button type="button" id="grant">${esc(t('allowAccess'))}</button>
          <p class="note">${esc(t('reloadTabs'))}</p>`;
        $('#grant').addEventListener('click', () => {
          chrome.permissions.request({ origins: missing.map((m) => m.origin) }, (granted) => { if (granted) checkAccess(); });
        });
      });
  }

  /* ---------- main ---------- */

  function render() {
    i18n = L.create(store.settings.language, navigator.language);
    applyStaticText();
    const model = compute();
    if (ui.selectedLimit != null && !model.result.options.some((o) => o.limit === ui.selectedLimit)) ui.selectedLimit = null;
    renderBasketBar();
    renderResult(model);
    renderProducts(model);
    renderShipping(model);
    renderSettings();
  }

  async function reload() {
    store = await S.load(defaultName);
    render();
    checkAccess();
  }

  if (new URLSearchParams(location.search).has('tab')) {
    document.body.classList.add('tab');
    $('#open-tab').hidden = true;
  }
  bindSettings();
  reload();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') reload();
  });
})();
