"""Zboží: all offers via the page API, and the fallback that clicks "Další obchody" and reads rows."""
import json, re, tempfile, os
from playwright.sync_api import sync_playwright
from common import EXT, THUMB, OUT, fixture, launch
HTML = fixture('zbozi-product-rendered.html')
URL = 'https://www.zbozi.cz/vyrobek/pokemon-tcg-30th-celebration-booster-bundle/'
nd = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', HTML, re.S).group(1))
emb = nd['props']['pageProps']['data']['offers']['items']
raw = lambda o: {'id': o['offerId'], 'displayName': o['name'], 'price': o['price'], 'availability': o['availability'], 'click': o['url'],
    'delivery': {'minPrice': o['minPriceDelivery'], 'count': o['countDelivery']}, 'pickup': {'minPrice': o['minPricePickup'], 'count': o['countPickup']},
    'shop': {'id': o['shop']['id'], 'displayName': o['shop']['name']}}
more = [{'id': f'm{i}', 'displayName': 'x', 'price': 210000 + i * 1000, 'availability': 'in_stock', 'click': f'/clickthru?c=m{i}',
         'delivery': {'minPrice': 7900, 'count': 1}, 'pickup': {'minPrice': 4900, 'count': 9000}, 'shop': {'id': 900 + i, 'displayName': f'Obchod {i}.cz'}} for i in range(9)]
API = {'product': {'normalizedName': 'pokemon-tcg-30th-celebration-booster-bundle', 'shopCount': 14, 'cheapestOffers': {'count': 14, 'offers': [raw(o) for o in emb] + more}}}

# simulated "Další obchody" for the fallback run: each click adds 5 rows to #product-offers until 14
SIM = r'''
document.addEventListener('DOMContentLoaded', () => {
  const sec = document.querySelector('#product-offers'); if (!sec) return;
  const btn = sec.querySelector('[data-dot="show-more"]'); const tpl = sec.querySelector('[data-testid="product-offer"]');
  let n = 0;
  btn.addEventListener('click', () => setTimeout(() => {
    for (let i = 0; i < 5 && sec.querySelectorAll('[data-testid="product-offer"]').length < 14; i++, n++) {
      const r = tpl.cloneNode(true);
      r.setAttribute('data-dot-data', JSON.stringify({ shopId: 800 + n }));
      r.querySelector('[class*="ProductOffer_shopName__"]').textContent = 'Fallback ' + n + '.cz';
      r.querySelector('[data-dot="price"]').textContent = (2200 + n * 10) + '\u00a0Kč';
      tpl.parentElement.appendChild(r);
    }
    if (sec.querySelectorAll('[data-testid="product-offer"]').length >= 14) btn.remove();
  }, 250));
});'''

def run(api_ok):
    with sync_playwright() as p:
        ctx = launch(p, os.path.join(tempfile.gettempdir(), 'lbo-e2e-zbozi'))
        seen = []
        def route(r):
            u = r.request.url
            if u.startswith('chrome-extension://'): return r.continue_()
            if '/api/v3/product/' in u:
                seen.append((u, r.request.headers.get('x-zbozi-page-type'), r.request.headers.get('cookie')))
                if api_ok: return r.fulfill(status=200, content_type='application/json', body=json.dumps(API))
                return r.fulfill(status=503, body='down')
            if u.split('?')[0] == URL: return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=HTML)
            if 'sdn.cz' in u: return r.fulfill(status=200, content_type='image/png', body=THUMB)
            return r.abort()
        ctx.route('**/*', route)
        ctx.add_cookies([{'name': 'testcookie', 'value': 'session123', 'domain': 'www.zbozi.cz', 'path': '/', 'secure': True}])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
        ext = sw.url.split('/')[2]
        errors = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if 'Basket Optimizer' in m.text else None)
        if not api_ok: pg.add_init_script(SIM)
        pg.goto(URL)
        pg.locator('#lokis-basket-root .main').wait_for(state='visible', timeout=8000); pg.wait_for_timeout(400)
        pg.locator('#lokis-basket-root .main').click()
        pg.wait_for_function("() => /Added|No offers|Could not/.test(document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent)", timeout=30000)
        label = pg.evaluate("document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.label').textContent")
        bar = pg.evaluate("document.querySelector('#lokis-basket-root').shadowRoot.querySelector('.bar').className")
        st = sw.evaluate("() => new Promise(r => chrome.storage.local.get(null, r))")
        it = next(b for b in st['baskets'] if b['id'] == st['activeBasketId'])['items'][0]
        print(f"[API {'OK' if api_ok else 'DOWN'}] label={label!r} ({bar}) | stored {len(it['offers'])} offers | rows on page: {pg.locator('#product-offers [data-testid=product-offer]').count()}")
        if seen: print('   API request sent:', seen[0][0].split('zbozi.cz')[1][:120], '| header:', seen[0][1], '| cookie sent:', bool(seen[0][2]))
        amipa = next(o for o in it['offers'] if o['shopName'] == 'Amipa.cz')
        print('   Amipa delivery:', amipa['delivery'], '| sample:', [(o['shopName'], o['price']) for o in it['offers'][-3:]])
        pop = ctx.new_page(); pop.set_viewport_size({'width': 420, 'height': 900})
        pop.goto(f'chrome-extension://{ext}/popup/popup.html'); pop.wait_for_selector('.result .total')
        print('   popup:', pop.locator('.result').inner_text().replace('\n', ' | ')[:200])
        if api_ok: pop.screenshot(path=str(OUT / 'v5-popup.png'), full_page=True)
        print('   errors:', errors or 'none')
        ctx.close()

run(True)
run(False)
