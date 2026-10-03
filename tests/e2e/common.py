"""Shared setup for the browser tests: paths, fixtures and simulated product pages.

The tests load the real extension into Playwright's Chromium and serve saved product
pages at their real URLs (all other network requests are blocked). Pages that only
exist as simulations are built from the saved heureka.cz page by the SIM script.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXT = str(ROOT / 'extension')
FIXTURES = ROOT / 'tests' / 'fixtures'
OUT = ROOT / 'tests' / 'e2e' / 'output'
OUT.mkdir(parents=True, exist_ok=True)
THUMB = (ROOT / 'tests' / 'assets' / 'thumb.png').read_bytes()


def fixture(name):
    p = FIXTURES / name
    if not p.exists():
        print(f'SKIPPED: fixture {name} is missing (see tests/fixtures/README.md)')
        sys.exit(0)
    return p.read_text(encoding='utf-8')


def make_sk_page(cz_html):
    """heureka.sk uses the same page code: turn the saved .cz page into a .sk one."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(cz_html, 'lxml')
    eur = [('3,72 €', 'Doprava od 5,5 €', 'Na sklade'), ('4 €', 'Doprava od 2,99 €', 'Na sklade'), ('4,5 €', 'Doprava zdarma', 'Na sklade'),
           ('3,97 €', 'Doprava od 2,5 €', 'Do 3 dní'), ('4,15 €', 'Doprava od 0,89 €', 'Na sklade'), ('1 299,00 €', 'Doprava zdarma', 'Info v obchode')]
    for i, row in enumerate(soup.select('.c-offer')):
        p, d, a = eur[i % len(eur)]
        row.select_one('.c-offer__price').string = p
        row.select_one('.c-offer__price-desc').string = d
        av = row.select_one('[data-testid="Availability Badge"]')
        if av:
            av.clear(); av.append(a)
    soup.select_one('.c-offers-list__more-button').string = 'Zobraziť ďalšie ponuky'
    soup.find('script', id='__NEXT_DATA__').decompose()
    return str(soup)


HTML_CZ = fixture('heureka-cz-product.html')
HTML_SK = make_sk_page(HTML_CZ)

def launch(p, profile, dark=False):
    """Chromium with the extension loaded (fresh profile)."""
    import shutil
    shutil.rmtree(profile, ignore_errors=True)
    return p.chromium.launch_persistent_context(profile, channel='chromium', headless=True,
        color_scheme='dark' if dark else 'light',
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])


P1 = 'https://doplnky-stravy.heureka.cz/simethicon-s-olejem-kminu-korenneho-80-mg-50-kapsli_2/'
P2 = 'https://doplnky-stravy.heureka.cz/probiotikum-test-30-kapsli/'
P3 = 'https://leky.heureka.cz/ibuprofen-test-400-mg-24-tablet/'
P4 = 'https://mobilni-telefony.heureka.cz/nabijecka-test-usb-c-65w/'
SK1 = 'https://lieky-volne-predajne.heureka.sk/espumisan-cps-50-x-40-mg/'
SK2 = 'https://lieky-volne-predajne.heureka.sk/paralen-test-500-mg/'

SIM = r'''
window.__SIM = %s;
document.addEventListener('DOMContentLoaded', () => {
  const cfg = window.__SIM; if (!cfg) return;
  const eur = cfg.currency === 'EUR';
  const fmt = (v) => eur ? String(v).replace('.', ',') + '\u00a0€' : v + '\u00a0Kč';
  const rows = [...document.querySelectorAll('.c-offer')];
  if (rows.length < 2) return;
  const tpl = rows[1], list = tpl.parentElement;
  const setRow = (row, o) => {
    row.querySelectorAll('a[href*="exit-click"]').forEach(a => {
      a.setAttribute('href', a.getAttribute('href').replace(/si=[^&]+/, 'si=' + o.id));
      a.setAttribute('aria-label', 'Do obchodu ' + o.name);
    });
    row.querySelector('.c-offer__price').textContent = fmt(o.price);
    row.querySelector('.c-offer__price-desc').textContent = o.delivery === 0 ? 'Doprava zdarma' : 'Doprava od ' + fmt(o.delivery);
    const av = row.querySelector('[data-testid="Availability Badge"] span') || row.querySelector('[data-testid="Availability Badge"]');
    if (av) av.textContent = o.stock ? (eur ? 'Na sklade' : 'Skladem') : (eur ? 'Do 3 dní' : 'Do 5 dnů');
  };
  if (cfg.initial) {
    document.querySelector('h1').textContent = cfg.name;
    rows.forEach((r, i) => { if (cfg.initial[i]) setRow(r, cfg.initial[i]); else r.remove(); });
  }
  const more = document.querySelector('.c-offers-list__more-button');
  let pending = (cfg.more || []).slice();
  if (!pending.length) { more.remove(); return; }
  more.addEventListener('click', () => setTimeout(() => {
    pending.splice(0, 10).forEach(o => { const r = tpl.cloneNode(true); setRow(r, o); list.appendChild(r); });
    if (!pending.length) more.remove();
  }, 300));
});
'''
uid = lambda n: f'{n:08x}-0000-4000-8000-000000000000'
nd = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', HTML_CZ, re.S).group(1))
ids = {o['shop']['name']: o['shop']['id'] for o in nd['props']['pageProps']['initialData']['productDetail']['offers']['regular']}
DRMAX, POHODA = ids['Dr. Max lékárna'], ids['Lékárna pohoda']
extra1 = [dict(id=uid(1), name='Pilulka.cz', price=74, delivery=49, stock=True), dict(id=uid(2), name='BENU Lékárna', price=76, delivery=59, stock=True),
          dict(id=uid(3), name='Lékárna.cz', price=78, delivery=39, stock=True)] + \
         [dict(id=uid(100+i), name=f'Lékárna {i}', price=74+i, delivery=49+(i%4)*10, stock=i % 5 != 0) for i in range(33)]
pages = {
  P1: dict(more=extra1),
  P2: dict(name='Probiotikum Test 30 kapslí', initial=[dict(id=uid(1), name='Pilulka.cz', price=219, delivery=49, stock=True), dict(id=DRMAX, name='Dr. Max lékárna', price=329, delivery=29, stock=True),
           dict(id=POHODA, name='Lékárna pohoda', price=299, delivery=69, stock=True), dict(id=uid(3), name='Lékárna.cz', price=305, delivery=39, stock=True)]),
  P3: dict(name='Ibuprofen Test 400 mg 24 tablet', initial=[dict(id=DRMAX, name='Dr. Max lékárna', price=89, delivery=29, stock=True), dict(id=uid(1), name='Pilulka.cz', price=135, delivery=49, stock=True),
           dict(id=uid(3), name='Lékárna.cz', price=92, delivery=39, stock=True), dict(id=POHODA, name='Lékárna pohoda', price=85, delivery=69, stock=True)]),
  P4: dict(name='Nabíječka Test USB-C 65 W', initial=[dict(id=uid(700), name='Alza.cz', price=899, delivery=0, stock=True), dict(id=uid(701), name='CZC.cz', price=849, delivery=99, stock=True),
           dict(id=uid(702), name='Datart', price=879, delivery=79, stock=True)]),
  SK1: dict(currency='EUR', name='Espumisan cps.50 x 40 mg', initial=[dict(id=uid(800), name='Lekáreň AVE', price=3.72, delivery=5.5, stock=True), dict(id=uid(801), name='Dr.Max lekáreň', price=5.39, delivery=0, stock=True),
           dict(id=uid(802), name='BENU LEKÁREŇ', price=4.79, delivery=0, stock=True), dict(id=uid(803), name='Vitalpoint', price=4, delivery=2.99, stock=True)],
           more=[dict(id=uid(804), name='medikament.sk', price=4.15, delivery=2.5, stock=True), dict(id=uid(805), name='GigaLekaren.sk', price=3.97, delivery=2.5, stock=False)]),
  SK2: dict(currency='EUR', name='Paralen Test 500 mg 24 tbl', initial=[dict(id=uid(801), name='Dr.Max lekáreň', price=2.49, delivery=0, stock=True), dict(id=uid(800), name='Lekáreň AVE', price=2.19, delivery=5.5, stock=True),
           dict(id=uid(802), name='BENU LEKÁREŇ', price=2.59, delivery=0, stock=True)]),
}
