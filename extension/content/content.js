/*
 * Runs on Heureka (.cz, .sk) and Zboží.cz pages. On product pages it shows a floating button
 * (bottom-left, inside a Shadow DOM so the site's CSS can't touch it):
 *   [ count | Add to “Basket” ][ ▾ ]
 * The main part loads all offers and saves the product into the target basket;
 * the ▾ part lets you pick another basket (same currency), create a new one, or add this
 * page's offers to a product already in the basket (same product on another site).
 */
(function () {
  'use strict';
  if (globalThis.__lokisBasketLoaded) return;
  globalThis.__lokisBasketLoaded = true;

  const ADAPTERS = [globalThis.HeurekaParser, globalThis.ZboziParser].filter(Boolean);
  const A = ADAPTERS.find((a) => a.siteInfo(location.hostname));
  if (!A) return;
  const S = globalThis.BasketStore;
  const L = globalThis.I18n;
  const MAX_EXPAND_CLICKS = 30;
  const EXPAND_WAIT_MS = 8000;

  const site = A.siteInfo(location.hostname);
  let state = null;
  let i18n = L.create('auto', navigator.language);
  const t = (k, v) => i18n.t(k, v);
  const defaultName = (n) => t('defaultBasketName', { n });

  /* ---------- UI ---------- */

  const host = document.createElement('div');
  host.id = 'lokis-basket-root';
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483646;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: relative; font: 600 14px/1.2 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif; }
      .bar { display: inline-flex; border-radius: 999px; box-shadow: 0 6px 18px rgba(10, 60, 45, 0.28), 0 1px 2px rgba(10, 60, 45, 0.3); }
      button { font: inherit; border: 0; cursor: pointer; color: #fff; background: #0A7456; transition: background-color .15s ease; }
      button:hover { background: #075C44; }
      button:focus-visible { outline: 3px solid #9BE3C8; outline-offset: 2px; }
      .main { display: inline-flex; align-items: center; gap: 10px; padding: 10px 14px 10px 12px; border-radius: 999px 0 0 999px; max-width: 360px; }
      .main .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .caret { padding: 10px 12px 10px 10px; border-radius: 0 999px 999px 0; border-left: 1px solid rgba(255,255,255,.28); }
      .bar.busy button { cursor: progress; background: #3E6B5E; }
      .bar.done button { background: #14231F; }
      .bar.error button { background: #8A2D1A; }
      .count {
        min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; flex: none;
        border-radius: 999px; background: #fff; color: #0A7456;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px; font-variant-numeric: tabular-nums;
      }
      .bar.done .count { color: #14231F; }
      .bar.error .count { color: #8A2D1A; }
      .menu {
        position: absolute; left: 0; bottom: calc(100% + 8px); min-width: 240px; max-width: 360px;
        background: #fff; color: #14231F; border-radius: 12px; padding: 6px;
        box-shadow: 0 10px 30px rgba(10, 40, 30, 0.25), 0 1px 3px rgba(10, 40, 30, 0.2);
        font-weight: 400;
      }
      .menu[hidden] { display: none; }
      .menu h3 { margin: 6px 10px 4px; font-size: 12px; font-weight: 600; color: #56675F; }
      .menu button {
        display: flex; width: 100%; align-items: center; gap: 10px;
        background: none; color: inherit; text-align: left; padding: 8px 10px; border-radius: 8px; font-weight: 400;
      }
      .menu button:hover { background: #E2F1EA; }
      .menu button[aria-checked] { padding-left: 26px; position: relative; }
      .menu button[aria-checked="true"] { font-weight: 650; }
      .menu button[aria-checked="true"]::before { content: ""; position: absolute; left: 10px; width: 8px; height: 8px; border-radius: 50%; background: #0A7456; }
      .menu .n { color: #56675F; font-variant-numeric: tabular-nums; margin-left: auto; }
      .menu .sep { height: 1px; background: #D6E2DC; margin: 4px 6px; }
      .menu button.merge { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    </style>
    <div class="wrap">
      <div class="menu" role="menu" hidden></div>
      <div class="bar">
        <button type="button" class="main"><span class="count">0</span><span class="label"></span></button>
        <button type="button" class="caret" aria-haspopup="menu" aria-expanded="false">▾</button>
      </div>
    </div>`;
  const bar = shadow.querySelector('.bar');
  const mainBtn = shadow.querySelector('.main');
  const caretBtn = shadow.querySelector('.caret');
  const labelEl = shadow.querySelector('.label');
  const countEl = shadow.querySelector('.count');
  const menuEl = shadow.querySelector('.menu');

  let busy = false;
  let flashTimer = null;

  let keyCache = { href: '', key: '' };
  function currentKey() {
    if (keyCache.href !== location.href) {
      let key = A.productKey(location);
      if (A.parseDoc) { const p = A.parseDoc(document, location); if (p) key = p.key; }   // e.g. default variant
      keyCache = { href: location.href, key };
    }
    return keyCache.key;
  }
  const hasKey = (item, key) => (item.sources ? item.sources.some((s) => s.key === key) : item.key === key);
  function target() { return state ? S.targetBasket(state, site.currency) : null; }

  function renderIdle() {
    if (!state || busy || flashTimer) return;
    bar.className = 'bar';
    const b = target();
    countEl.textContent = String(b ? b.items.length : 0);
    const inBasket = b && b.items.some((i) => hasKey(i, currentKey()));
    labelEl.textContent = !b ? t('addToNew') : (inBasket ? t('updateIn', { name: b.name }) : t('addTo', { name: b.name }));
    mainBtn.title = inBasket ? t('updateTitle') : t('addTitle');
    caretBtn.title = t('chooseBasket');
    caretBtn.setAttribute('aria-label', t('chooseBasket'));
  }

  function flash(cls, text, ms) {
    clearTimeout(flashTimer);
    bar.className = 'bar ' + cls;
    labelEl.textContent = text;
    flashTimer = setTimeout(() => { flashTimer = null; renderIdle(); }, ms);
  }

  /* ---------- basket menu ---------- */

  function closeMenu() { menuEl.hidden = true; caretBtn.setAttribute('aria-expanded', 'false'); }

  function openMenu() {
    const current = target();
    const list = state.baskets.filter((b) => S.compatible(b, site.currency));
    menuEl.textContent = '';
    const h = document.createElement('h3');
    h.textContent = t('chooseBasket');
    menuEl.appendChild(h);
    list.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', String(!!current && b.id === current.id));
      const name = document.createElement('span'); name.textContent = b.name;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = String(b.items.length);
      btn.append(name, n);
      btn.addEventListener('click', async () => {
        closeMenu();
        await S.save({ activeBasketId: b.id });
      });
      menuEl.appendChild(btn);
    });
    if (list.length) { const sep = document.createElement('div'); sep.className = 'sep'; menuEl.appendChild(sep); }
    const key = currentKey();
    const mergeable = current ? current.items.filter((it) => !hasKey(it, key)) : [];
    if (mergeable.length) {
      const h2 = document.createElement('h3');
      h2.textContent = t('mergeInto');
      menuEl.appendChild(h2);
      mergeable.forEach((it) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.className = 'merge';
        btn.textContent = it.name;
        btn.title = it.name;
        btn.addEventListener('click', () => { closeMenu(); addCurrentProduct(it.key); });
        menuEl.appendChild(btn);
      });
      const sep2 = document.createElement('div'); sep2.className = 'sep'; menuEl.appendChild(sep2);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.setAttribute('role', 'menuitem');
    add.textContent = t('newBasketEllipsis');
    add.addEventListener('click', async () => {
      closeMenu();
      const name = (window.prompt(t('newBasketPrompt'), S.nextDefaultName(state, defaultName)) || '').trim();
      if (!name) return;
      const fresh = await S.load(defaultName);
      const b = S.makeBasket(name, site.currency);
      await S.save({ baskets: fresh.baskets.concat([b]), activeBasketId: b.id });
    });
    menuEl.appendChild(add);
    menuEl.hidden = false;
    caretBtn.setAttribute('aria-expanded', 'true');
  }

  caretBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (busy || !state) return;
    if (menuEl.hidden) openMenu(); else closeMenu();
  });
  document.addEventListener('click', (e) => { if (!e.composedPath().includes(host)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ---------- load all offers ---------- */

  function findMoreButton() { return A.moreButton(document); }
  function offerCount() { return A.offerRowCount(document); }

  function waitFor(predicate, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll() {
        if (predicate()) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(poll, 150);
      })();
    });
  }

  async function expandAllOffers(total) {
    for (let i = 0; i < MAX_EXPAND_CLICKS; i++) {
      const more = findMoreButton();
      if (!more || more.disabled) break;
      const before = offerCount();
      labelEl.textContent = total ? t('loadingOffers', { n: before, total }) : t('loadingOffersNoTotal', { n: before });
      more.click();
      const progressed = await waitFor(() => offerCount() > before || !findMoreButton(), EXPAND_WAIT_MS);
      if (!progressed) break;
    }
  }

  async function addCurrentProduct(mergeIntoKey) {
    if (typeof mergeIntoKey !== 'string') mergeIntoKey = null;
    if (busy) return;
    busy = true;
    closeMenu();
    clearTimeout(flashTimer); flashTimer = null;
    bar.className = 'bar busy';
    try {
      let product = await A.extract(document, location);
      const complete = product && product.totalOffers && product.offers.length >= product.totalOffers * 0.8;
      if (!complete && findMoreButton()) {
        await expandAllOffers(product && product.totalOffers);
        product = await A.extract(document, location);
      }
      if (!product || !product.offers.length) {
        busy = false;
        flash('error', t('noOffers'), 3500);
        return;
      }

      // re-read storage right before writing (another tab may have changed it)
      const fresh = await S.load(defaultName);
      let basket = S.targetBasket(fresh, product.currency);
      let baskets = fresh.baskets.slice();
      if (!basket) {
        basket = S.makeBasket(S.nextDefaultName(fresh, defaultName), product.currency);
        baskets.push(basket);
      }
      const res = S.upsertProduct(basket, product, mergeIntoKey);
      baskets = baskets.map((b) => (b.id === res.basket.id ? res.basket : b));
      const patch = { baskets, activeBasketId: res.basket.id };
      const slugs = S.learnSlugs(fresh.shopSlugs, product.offers);
      if (slugs) patch.shopSlugs = slugs;
      await S.save(patch);

      busy = false;
      const shops = product.offers.length;
      const partial = !!product.totalOffers && shops < product.totalOffers * 0.8;
      const shopsText = t('shops', { n: shops });
      const text = (res.mode === 'merged' ? t('mergedInto', { name: res.item.name, shops: shopsText }) : t(res.mode, { shops: shopsText })) +
        (partial ? ' ' + t('partialOf', { total: product.totalOffers }) : '');
      flash(partial ? 'error' : 'done', text, partial ? 5000 : 2500);
    } catch (err) {
      console.error("[Loki's Basket Optimizer]", err);
      busy = false;
      flash('error', t('readError'), 4000);
    }
  }

  mainBtn.addEventListener('click', addCurrentProduct);

  /* ---------- show only on product pages (handles client-side navigation) ---------- */

  let lastHref = '';
  let checkTimer = null;
  function check() {
    checkTimer = null;
    host.style.display = A.isProductPage(document, location) ? 'block' : 'none';
    if (location.href !== lastHref) { lastHref = location.href; closeMenu(); renderIdle(); }
  }
  function scheduleCheck() { if (!checkTimer) checkTimer = setTimeout(check, 400); }

  async function refreshState() {
    state = await S.load(defaultName);
    i18n = L.create(state.settings.language, navigator.language);
    renderIdle();
  }

  document.documentElement.appendChild(host);
  new MutationObserver(scheduleCheck).observe(document.body || document.documentElement, { childList: true, subtree: true });
  check();
  refreshState();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') refreshState();
  });
})();
