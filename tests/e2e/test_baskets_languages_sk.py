"""Migration from 0.2, multiple baskets, page menu, heureka.sk, translations, delete."""
import json, tempfile, os
from playwright.sync_api import sync_playwright
from common import *

V02 = {  # what the old version (0.2) left in storage
  'items': [{'key': 'doplnky-stravy.heureka.cz/vitamin-d3-test', 'url': 'https://doplnky-stravy.heureka.cz/vitamin-d3-test/', 'name': 'Vitamín D3 Test 2000 IU', 'image': None, 'qty': 2,
             'capturedAt': 1790500000000, 'totalOffers': 3, 'offers': [
               {'shopId': DRMAX, 'shopName': 'Dr. Max lékárna', 'price': 149, 'delivery': 29, 'inStock': True, 'exitUrl': P1},
               {'shopId': POHODA, 'shopName': 'Lékárna pohoda', 'price': 139, 'delivery': 69, 'inStock': True, 'exitUrl': P1},
               {'shopId': uid(1), 'shopName': 'Pilulka.cz', 'price': 159, 'delivery': 49, 'inStock': True, 'exitUrl': P1}]}],
  'shopOverrides': {DRMAX: {'threshold': 1500}},
  'settings': {'inStockOnly': True, 'maxShops': 3, 'unknownFee': 89}
}
STATE_JS = "() => new Promise(r => chrome.storage.local.get(null, r))"

with sync_playwright() as p:
    ctx = launch(p, os.path.join(tempfile.gettempdir(), 'lbo-e2e-baskets'))
    def route(r):
        u = r.request.url
        if u.startswith('chrome-extension://'): return r.continue_()
        base = u.split('?')[0]
        if base in pages: return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=HTML_SK if '.heureka.sk' in base else HTML_CZ)
        if 'img-cdn.heureka.group' in u: return r.fulfill(status=200, content_type='image/png', body=THUMB)
        return r.abort()
    ctx.route('**/*', route)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    ext = sw.url.split('/')[2]
    errors = []

    # 1) pretend the user had version 0.2 with data, then the update runs
    #    (first let the fresh-install setup finish, as it would have long before a real update)
    sw.evaluate("() => new Promise(r => { const t = () => chrome.storage.local.get('schema', x => x.schema ? r() : setTimeout(t, 50)); t(); })")
    sw.evaluate("(d) => new Promise(r => chrome.storage.local.clear(() => chrome.storage.local.set(d, r)))", V02)
    pop = ctx.new_page(); pop.set_viewport_size({'width': 420, 'height': 900})
    pop.on('pageerror', lambda e: errors.append('popup: ' + str(e)))
    pop.on('console', lambda m: errors.append('popup console: ' + m.text) if m.type == 'error' else None)
    pop.goto(f'chrome-extension://{ext}/popup/popup.html')
    try:
        pop.wait_for_selector('.result .total', timeout=5000)
    except Exception:
        print('ERRORS:', errors); print('RESULT HTML:', pop.locator('#result').inner_html()[:600]); print('STATE:', str(sw.evaluate(STATE_JS))[:600]); raise SystemExit(1)
    st = sw.evaluate(STATE_JS)
    b0 = st['baskets'][0]
    print('MIGRATION:', 'legacy key gone:', 'items' not in st, '| basket:', b0['name'], b0['currency'], '| items:', [(i['name'], i['qty']) for i in b0['items']],
          '| overrides kept:', st['shopOverrides'] == V02['shopOverrides'], '| fees:', st['settings']['unknownFee'])
    print('  popup:', pop.locator('.result').inner_text().replace('\n', ' | ')[:160])

    def add(url, expect_label=None, menu_pick=None):
        pg = ctx.new_page(); pg.on('console', lambda m: errors.append(m.text) if 'Basket Optimizer' in m.text else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.add_init_script(SIM % json.dumps(pages[url])); pg.goto(url)
        btn = pg.locator('#lokis-basket-root .main'); btn.wait_for(state='visible', timeout=5000)
        pg.wait_for_timeout(300)
        lab = lambda: pg.evaluate("document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent")
        before = lab()
        if menu_pick is not None:
            pg.locator('#lokis-basket-root .caret').click()
            items = pg.locator('#lokis-basket-root .menu button')
            names = [items.nth(i).inner_text().replace('\n', ' ') for i in range(items.count())]
            items.nth(menu_pick).click(); pg.wait_for_timeout(300)
            print(f'   menu: {names} -> picked #{menu_pick}; label now: {lab()}')
            pg.set_viewport_size({'width': 700, 'height': 400})
        btn.click()
        pg.wait_for_function("() => /Added|Updated|Přidáno|Aktualizováno|Pridané|Dodano|No offers|Could not/.test(document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent)", timeout=20000)
        print(f'   {url.split("/")[-2][:32]:<32} before: {before!r:<40} after: {lab()!r}')
        return pg

    # 2) Czech UI, add the pharmacy products (go to the migrated Kč basket)
    sw.evaluate("() => new Promise(r => chrome.storage.local.get('settings', s => chrome.storage.local.set({settings: Object.assign(s.settings, {language: 'cs'})}, r)))")
    print('ADD (Czech UI):')
    for u in (P1, P2, P3): add(u).close()

    # 3) new basket from the popup, rename it, then add an electronics product there
    pop.reload(); pop.wait_for_selector('#basket-new')
    pop.locator('#basket-new').click(); pop.wait_for_selector('#basket-name')
    pop.locator('#basket-name').fill('Elektronika'); pop.locator('#basket-name').press('Enter'); pop.wait_for_timeout(300)
    print('NEW BASKET:', pop.locator('#basket-select option:checked').inner_text())
    add(P4).close()

    # 4) switch target basket via the page menu, then update a product in it
    pg = add(P1, menu_pick=0)
    pg.locator('#lokis-basket-root .caret').click(); pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / 'v3-page-menu.png'), clip={'x': 0, 'y': 150, 'width': 460, 'height': 250})
    pg.close()

    # 5) heureka.sk products: must not go into a Kč basket -> new € basket
    print('ADD heureka.sk:')
    add(SK1).close(); add(SK2).close()
    st = sw.evaluate(STATE_JS)
    for b in st['baskets']:
        print(f"   basket {b['name']!r:<16} {b['currency']}  items={[(i['name'][:24], len(i['offers'])) for i in b['items']]}")
    print('   active:', next(b['name'] for b in st['baskets'] if b['id'] == st['activeBasketId']), '| badge:', repr(sw.evaluate("() => chrome.action.getBadgeText({})")))

    # 6) popup screenshots: € basket in Slovak, pharmacy basket in cs / pl / en
    def shot(lang, basket_name, path):
        sw.evaluate("(l) => new Promise(r => chrome.storage.local.get('settings', s => chrome.storage.local.set({settings: Object.assign(s.settings, {language: l})}, r)))", lang)
        st = sw.evaluate(STATE_JS)
        bid = next(b['id'] for b in st['baskets'] if b['name'] == basket_name)
        sw.evaluate("(id) => new Promise(r => chrome.storage.local.set({activeBasketId: id}, r))", bid)
        pop.reload(); pop.wait_for_selector('.result .total'); pop.wait_for_timeout(200)
        pop.screenshot(path=path, full_page=True)
        return pop.locator('.result').inner_text().replace('\n', ' | ')
    print('SK € basket (sk):', shot('sk', 'Košík 3', str(OUT / 'v3-sk.png'))[:300])
    print('Pharmacy (cs):  ', shot('cs', 'Basket 1', str(OUT / 'v3-cs.png'))[:300])
    print('Removed language (pl) falls back:', shot('pl', 'Basket 1', str(OUT / 'v3-pl.png'))[:220])
    print('Pharmacy (en):  ', shot('en', 'Basket 1', str(OUT / 'v3-en.png'))[:220])
    pop.locator('#settings summary').click(); pop.locator('#shipping summary').click()
    pop.screenshot(path=str(OUT / 'v3-en-full.png'), full_page=True)
    print('language options:', pop.locator('#language option').all_inner_texts())

    # 7) delete a basket (two clicks)
    n_before = len(sw.evaluate(STATE_JS)['baskets'])
    pop.locator('#basket-delete').click(); armed = pop.locator('#basket-delete').inner_text()
    pop.locator('#basket-delete').click(); pop.wait_for_timeout(300)
    print('DELETE:', repr(armed), '->', n_before, 'baskets ->', len(sw.evaluate(STATE_JS)['baskets']))
    print('ERRORS:', errors or 'none')
    ctx.close()
