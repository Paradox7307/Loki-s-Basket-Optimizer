"""Regenerates the Chrome Web Store images in store/chrome/ from the real extension,
using made-up products and shops (no real brands or prices).
Needs: pip install playwright && python -m playwright install chromium"""
import json, shutil, base64, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
EXT = str(ROOT / 'extension')
OUT = str(ROOT / 'store' / 'chrome')
TMP = tempfile.gettempdir()

def bottle(color, label_color='#ffffff'):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#fff"/>
      <rect x="27" y="10" width="26" height="10" rx="3" fill="#C9D3CF"/><rect x="22" y="18" width="36" height="54" rx="8" fill="{color}"/>
      <rect x="22" y="34" width="36" height="20" fill="{label_color}" opacity=".85"/></svg>'''
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()
def gadget(color):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#fff"/>
      <path d="M20 44 a20 20 0 0 1 40 0" fill="none" stroke="{color}" stroke-width="6"/><rect x="14" y="40" width="14" height="22" rx="5" fill="{color}"/><rect x="52" y="40" width="14" height="22" rx="5" fill="{color}"/></svg>'''
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()

S = {'plus': 'LékárnaPlus.cz', 'domov': 'Zdravý domov', 'bylinka': 'Bylinka.cz', 'med': 'MedShop.cz', 'tech': 'TechNoir.cz', 'mob': 'Mobilník.cz', 'zvuk': 'ZvukDomů.cz',
     'sk-plus': 'LékárnaPlus.sk', 'sk-domov': 'Zdravý domov', 'sk-bylinka': 'Bylinka.sk', 'sk-med': 'MedShop.sk'}
def off(shop, price, delivery, site='heureka'):
    sid = ('zbozi:' if site == 'zbozi' else 'h-') + shop
    exit_url = 'https://www.heureka.sk/' if shop.startswith('sk-') else 'https://www.heureka.cz/'
    return {'shopId': sid, 'shopName': S[shop], 'price': price, 'delivery': delivery, 'inStock': True, 'exitUrl': exit_url}
import time
now = int(time.time() * 1000) - 2 * 3600 * 1000   # 'prices 2 h ago'
def item(key, name, img, qty, offers, sources=None, site='heureka.cz'):
    url = f'https://www.{site}/'
    srcs = sources or [{'key': key, 'site': site, 'url': url, 'name': name, 'image': img, 'capturedAt': now, 'totalOffers': len(offers), 'offers': offers}]
    return {'key': key, 'name': name, 'image': img, 'url': url, 'site': srcs[0]['site'], 'qty': qty, 'capturedAt': now,
            'totalOffers': len(offers), 'offers': [o for s in srcs for o in s['offers']], 'sources': srcs}

pharmacy = [
  item('h/d3', 'Vitamín D3 2000 IU, 90 tobolek', bottle('#E8A33D'), 2, [off('plus', 149, 49), off('domov', 139, 69), off('bylinka', 189, 39), off('med', 155, 59)]),
  item('h/probio', 'Probiotika Komplex, 30 kapslí', bottle('#5B8DEF'), 1, [off('domov', 299, 69), off('plus', 329, 49), off('bylinka', 245, 39)]),
  item('h/ibu', 'Ibuprofen 400 mg, 24 tablet', bottle('#E05D5D'), 1, [off('plus', 89, 49), off('bylinka', 99, 39), off('domov', 85, 69), off('med', 79, 59)]),
  item('h/mg', 'Hořčík + B6, 60 tablet', bottle('#7BC47F'), 1, [off('plus', 119, 49), off('bylinka', 129, 39), off('med', 99, 59)]),
]
h_off = [off('tech', 1890, 0), off('mob', 1949, 79), off('zvuk', 1999, 0)]
z_off = [off('tech', 1849, 0, 'zbozi'), off('zvuk', 1929, 0, 'zbozi'), off('mob', 1899, 69, 'zbozi')]
electronics = [
  item('h/x200', 'Bezdrátová sluchátka X200', gadget('#2E3A36'), 1, h_off, sources=[
    {'key': 'h/x200', 'site': 'heureka.cz', 'url': 'https://www.heureka.cz/', 'name': 'Bezdrátová sluchátka X200', 'image': gadget('#2E3A36'), 'capturedAt': now, 'totalOffers': 3, 'offers': h_off},
    {'key': 'z/x200', 'site': 'zbozi.cz', 'url': 'https://www.zbozi.cz/', 'name': 'Bezdrátová sluchátka X200', 'image': None, 'capturedAt': now, 'totalOffers': 3, 'offers': z_off}]),
  item('h/cable', 'Kabel USB-C 2 m', gadget('#0A7456'), 2, [off('tech', 249, 0), off('mob', 199, 79), off('zvuk', 229, 0)]),
]
STATE = {'schema': 2, 'activeBasketId': 'b1', 'shopSlugs': {},
  'baskets': [{'id': 'b1', 'name': 'Lékárna', 'currency': 'CZK', 'items': pharmacy, 'createdAt': now, 'updatedAt': now},
              {'id': 'b2', 'name': 'Elektronika', 'currency': 'CZK', 'items': electronics, 'createdAt': now, 'updatedAt': now - 1}],
  'shopOverrides': {'n:lekarnaplus': {'fee': 49, 'threshold': 1500}},
  'settings': {'inStockOnly': True, 'maxShops': 3, 'unknownFee': {'CZK': 79, 'EUR': 3.5}, 'language': 'cs'}}

# Slovak listing: the pharmacy basket in € from Heureka.sk; electronics stays in Kč
# (it combines Heureka.cz with Zboží, which is Czech only).
pharmacy_sk = [
  item('hsk/d3', 'Vitamín D3 2000 IU, 90 kapsúl', bottle('#E8A33D'), 2, [off('sk-plus', 5.9, 2.0), off('sk-domov', 5.5, 2.9), off('sk-bylinka', 7.5, 1.5), off('sk-med', 6.2, 2.5)], site='heureka.sk'),
  item('hsk/probio', 'Probiotiká Komplex, 30 kapsúl', bottle('#5B8DEF'), 1, [off('sk-domov', 11.9, 2.9), off('sk-plus', 13.2, 2.0), off('sk-bylinka', 9.8, 1.5)], site='heureka.sk'),
  item('hsk/ibu', 'Ibuprofén 400 mg, 24 tabliet', bottle('#E05D5D'), 1, [off('sk-plus', 3.5, 2.0), off('sk-bylinka', 3.9, 1.5), off('sk-domov', 3.4, 2.9), off('sk-med', 3.2, 2.5)], site='heureka.sk'),
  item('hsk/mg', 'Horčík + B6, 60 tabliet', bottle('#7BC47F'), 1, [off('sk-plus', 4.7, 2.0), off('sk-bylinka', 5.1, 1.5), off('sk-med', 3.9, 2.5)], site='heureka.sk'),
]
SK_NAMES = {'Bezdrátová sluchátka X200': 'Bezdrôtové slúchadlá X200', 'Kabel USB-C 2 m': 'Kábel USB-C 2 m'}
def slovak(st):
    b1, b2 = st['baskets']
    b1.update(name='Lekáreň', currency='EUR', items=json.loads(json.dumps(pharmacy_sk)))
    b2['name'] = 'Elektronika'
    for it in b2['items']:
        it['name'] = SK_NAMES[it['name']]
        for src in it['sources']: src['name'] = it['name']
    st['shopOverrides'] = {'n:lekarnaplus': {'fee': 2.0, 'threshold': 60}}
    return st

TEXT = {
 'cs': [('Celý košík co nejlevněji', 'Porovná nákup v jednom obchodě s rozdělením do více obchodů, včetně dopravy.'),
        ('Heureka i Zboží v jednom', 'Stejný obchod na obou webech se počítá jako jeden, stejný produkt můžete sloučit.'),
        ('Doprava podle vás', 'Poplatky a hranice dopravy zdarma odhadne ze srovnávače, skutečné hodnoty doplníte jednou.')],
 'en': [('Your whole basket, cheapest', 'Compares one-shop orders with splits across shops, shipping included.'),
        ('Heureka and Zboží together', 'The same shop on both sites counts once; the same product can be combined.'),
        ('Shipping, your way', 'Fees and free-shipping limits are estimated from the site; enter the real ones once.')],
 'sk': [('Celý košík čo najlacnejšie', 'Porovná nákup v jednom obchode s rozdelením do viacerých obchodov, vrátane dopravy.'),
        ('Heureka aj Zboží v jednom', 'Rovnaký obchod na oboch weboch sa počíta ako jeden, rovnaký produkt môžete zlúčiť.'),
        ('Doprava podľa vás', 'Poplatky a hranice dopravy zadarmo odhadne z porovnávača, skutočné hodnoty doplníte raz.')],
}
# Languages to render: all by default, or the ones given, e.g. `python tools/store-assets.py sk`.
# The promo tile is only redrawn when rendering all languages.
import sys
LANGS = sys.argv[1:] or list(TEXT)

def compose(page, shot_png, title, sub, out):
    img = 'data:image/png;base64,' + base64.b64encode(open(shot_png, 'rb').read()).decode()
    page.set_content(f'''<html><body style="margin:0;width:1280px;height:800px;background:#F4F8F6;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden">
      <div style="position:absolute;left:96px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center">
        <div style="width:56px;height:6px;background:#0A7456;border-radius:3px;margin-bottom:28px"></div>
        <div style="font-size:52px;line-height:1.08;font-weight:700;color:#14231F;letter-spacing:-0.01em">{title}</div>
        <div style="font-size:24px;line-height:1.4;color:#56675F;margin-top:22px;max-width:520px">{sub}</div>
      </div>
      <div style="position:absolute;right:110px;top:48px;width:420px;height:752px;border-radius:14px 14px 0 0;overflow:hidden;
                  box-shadow:0 20px 50px rgba(10,50,40,.18),0 2px 6px rgba(10,50,40,.12);background:#fff">
        <img src="{img}" style="width:420px;display:block">
      </div></body></html>''')
    page.screenshot(path=out, clip={'x': 0, 'y': 0, 'width': 1280, 'height': 800})

shutil.rmtree(f'{TMP}/lbo-store-assets', ignore_errors=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(f'{TMP}/lbo-store-assets', channel='chromium', headless=True, device_scale_factor=1,
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    ext = sw.url.split('/')[2]
    sw.evaluate("() => new Promise(r => { const t = () => chrome.storage.local.get('schema', x => x.schema ? r() : setTimeout(t, 50)); t(); })")
    pop = ctx.new_page(); pop.set_viewport_size({'width': 420, 'height': 900})
    comp = ctx.new_page(); comp.set_viewport_size({'width': 1280, 'height': 800})
    for lang in LANGS:
        st = json.loads(json.dumps(STATE)); st['settings']['language'] = lang
        if lang == 'en': st['baskets'][0]['name'], st['baskets'][1]['name'] = 'Pharmacy', 'Electronics'
        if lang == 'sk': slovak(st)
        pop.goto('about:blank')   # no open popup may react to the reset
        sw.evaluate("(s) => new Promise(r => chrome.storage.local.clear(() => chrome.storage.local.set(s, r)))", st)
        pop.goto(f'chrome-extension://{ext}/popup/popup.html'); pop.wait_for_selector('.result .total'); pop.wait_for_timeout(300)
        pop.screenshot(path=f'{TMP}/sk-{lang}-1.png', full_page=False)
        print(lang, 'pharmacy:', pop.locator('.result').inner_text().replace('\n', ' | ')[:180])
        sw.evaluate("() => new Promise(r => chrome.storage.local.set({activeBasketId: 'b2'}, r))")
        pop.reload(); pop.wait_for_selector('.result .total'); pop.wait_for_timeout(300)
        pop.evaluate("document.querySelector('#products').scrollIntoView()")
        pop.evaluate("window.scrollTo(0, 0)")
        pop.screenshot(path=f'{TMP}/sk-{lang}-2.png')
        print(lang, 'electronics:', pop.locator('.result').inner_text().replace('\n', ' | ')[:160])
        sw.evaluate("() => new Promise(r => chrome.storage.local.set({activeBasketId: 'b1'}, r))")
        pop.reload(); pop.wait_for_selector('.result .total')
        pop.locator('#shipping summary').click(); pop.wait_for_timeout(200)
        y = pop.evaluate("document.querySelector('#products').getBoundingClientRect().top + window.scrollY")
        pop.evaluate(f"window.scrollTo(0, {y} - 8)"); pop.wait_for_timeout(100)
        pop.screenshot(path=f'{TMP}/sk-{lang}-3.png')
        for i, (t, s) in enumerate(TEXT[lang], 1):
            compose(comp, f'{TMP}/sk-{lang}-{i}.png', t, s, f'{OUT}/screenshot-{lang}-{i}.png')
    # small promo tile (cannot be localized)
    if sys.argv[1:]: ctx.close(); print('done'); sys.exit()
    icon = 'data:image/png;base64,' + base64.b64encode(open(f'{EXT}/icons/icon128.png', 'rb').read()).decode()
    comp.set_viewport_size({'width': 440, 'height': 280})
    comp.set_content(f'''<html><body style="margin:0;width:440px;height:280px;background:#0A7456;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden">
      <div style="position:absolute;left:36px;top:0;bottom:0;display:flex;align-items:center;gap:22px">
        <img src="{icon}" style="width:96px;height:96px;border-radius:22px;box-shadow:0 0 0 3px rgba(255,255,255,.25)">
        <div><div style="color:#CFEBDD;font-size:22px;font-weight:600;line-height:1;margin-bottom:6px">Loki's</div>
             <div style="color:#fff;font-size:34px;font-weight:700;line-height:1.05">Basket<br>Optimizer</div>
             <div style="color:#CFEBDD;font-size:16px;margin-top:10px">Heureka · Zboží</div></div></body></html>''')
    comp.screenshot(path=f'{OUT}/promo-small-440x280.png', clip={'x': 0, 'y': 0, 'width': 440, 'height': 280})
    ctx.close()
print('done')
