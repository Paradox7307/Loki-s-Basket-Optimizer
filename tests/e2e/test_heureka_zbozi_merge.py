"""Heureka product + Zboží page (API unreachable -> embedded offers) combined into one product; cross-site shops."""
import json, tempfile, os
from playwright.sync_api import sync_playwright
from common import *

HTML_ZB = fixture('zbozi-product-embedded.html')
ZB = 'https://www.zbozi.cz/vyrobek/samsung-galaxy-a57-5g/?varianta=8-128-gb-awesome-navy'
HP = 'https://mobilni-telefony.heureka.cz/samsung-galaxy-a57-5g-8gb-128gb-awesome-navy/'
pages[HP] = dict(name='Samsung Galaxy A57 5G 8GB/128GB Awesome Navy', initial=[
    dict(id=uid(900), name='Alza.cz', price=8399, delivery=0, stock=True),
    dict(id=uid(901), name='Trendmobil.cz', price=8190, delivery=69, stock=True),   # same shop as on Zboží (8150 there)
    dict(id=uid(902), name='1-2umobil.cz', price=8290, delivery=0, stock=True),
    dict(id=uid(903), name='CZC.cz', price=8490, delivery=0, stock=True)])
STATE_JS = "() => new Promise(r => chrome.storage.local.get(null, r))"

with sync_playwright() as p:
    ctx = launch(p, os.path.join(tempfile.gettempdir(), 'lbo-e2e-merge'))
    def route(r):
        u = r.request.url
        if u.startswith('chrome-extension://'): return r.continue_()
        base = u.split('?')[0]
        if u.startswith('https://www.zbozi.cz/vyrobek/samsung-galaxy-a57-5g/'): return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=HTML_ZB)
        if base in pages: return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=HTML_CZ)
        if 'img-cdn.heureka.group' in u or 'sdn.cz' in u: return r.fulfill(status=200, content_type='image/png', body=THUMB)
        return r.abort()
    ctx.route('**/*', route)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    ext = sw.url.split('/')[2]
    sw.evaluate("() => new Promise(r => { const t = () => chrome.storage.local.get('schema', x => x.schema ? r() : setTimeout(t, 50)); t(); })")
    errors = []
    lab = lambda pg: pg.evaluate("document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent")
    done = "() => /Added|Updated|Combined|No offers|Could not/.test(document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent)"

    # 1) Heureka listing of the phone
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script(SIM % json.dumps(pages[HP])); pg.goto(HP)
    pg.locator('#lokis-basket-root .main').wait_for(state='visible'); pg.wait_for_timeout(300)
    pg.locator('#lokis-basket-root .main').click(); pg.wait_for_function(done, timeout=15000)
    print('Heureka:', lab(pg)); pg.close()

    # 2) Zboží page (real saved HTML; its own scripts are blocked, so only the embedded data exists)
    zb = ctx.new_page(); zb.on('pageerror', lambda e: errors.append(str(e)))
    zb.on('console', lambda m: errors.append(m.text) if 'Basket Optimizer' in m.text else None)
    zb.set_viewport_size({'width': 760, 'height': 520})
    zb.goto(ZB)
    zb.locator('#lokis-basket-root .main').wait_for(state='visible', timeout=8000); zb.wait_for_timeout(400)
    print('Zboží button:', repr(lab(zb)))
    zb.locator('#lokis-basket-root .caret').click(); zb.wait_for_timeout(200)
    items = zb.locator('#lokis-basket-root .menu button, #lokis-basket-root .menu h3')
    print('Zboží menu:', [items.nth(i).inner_text() for i in range(items.count())])
    zb.screenshot(path=str(OUT / 'v4-zbozi-menu.png'), clip={'x': 0, 'y': 260, 'width': 480, 'height': 260})
    zb.locator('#lokis-basket-root .menu button.merge').first.click()
    zb.wait_for_function(done, timeout=15000)
    print('Zboží after merge:', repr(lab(zb)), '| bar class:', zb.evaluate("document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.bar').className"))
    zb.wait_for_timeout(5500); print('Zboží idle label:', repr(lab(zb)))

    st = sw.evaluate(STATE_JS)
    b = next(x for x in st['baskets'] if x['id'] == st['activeBasketId'])
    for it in b['items']:
        print(f"  item {it['name'][:44]!r}: sources={[s['site'] for s in it['sources']]} offers={len(it['offers'])} qty={it['qty']}")

    # 3) popup
    pop = ctx.new_page(); pop.set_viewport_size({'width': 420, 'height': 900}); pop.on('pageerror', lambda e: errors.append('popup: ' + str(e)))
    pop.goto(f'chrome-extension://{ext}/popup/popup.html'); pop.wait_for_selector('.result .total')
    print('POPUP:', pop.locator('.result').inner_text().replace('\n', ' | ')[:420])
    print('PRODUCT META:', pop.locator('.product .meta').first.inner_text())
    pop.locator('#shipping summary').click()
    rows = pop.locator('.ship-table tbody tr')
    print('SHOPS:', [rows.nth(i).locator('td').nth(0).inner_text() + ' ' + rows.nth(i).locator('td').nth(1).inner_text() for i in range(rows.count())])
    pop.screenshot(path=str(OUT / 'v4-popup.png'), full_page=True)

    # 4) store-pickup-only shop shows its tag when it's in the plan: exclude everyone else
    st = sw.evaluate(STATE_JS)
    keys_js = """() => new Promise(r => chrome.storage.local.get(null, s => {
        const b = s.baskets.find(x => x.id === s.activeBasketId);
        const ov = {}; b.items[0].offers.forEach(o => { if (o.shopName !== 'MobilyOstrava.cz') ov[o.shopId] = { excluded: true }; });
        chrome.storage.local.set({ shopOverrides: ov }, r); }))"""
    sw.evaluate(keys_js); pop.reload(); pop.wait_for_selector('.result .total')
    print('ONLY MobilyOstrava:', pop.locator('.result .group').first.inner_text().replace('\n', ' | ')[:200])
    print('ERRORS:', errors or 'none')
    ctx.close()
