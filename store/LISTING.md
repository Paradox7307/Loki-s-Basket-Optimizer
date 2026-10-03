# Chrome Web Store – fields to paste (unlisted)

Upload `lokis-basket-optimizer-chrome-1.0.0.zip` (manifest at the zip root) in the Developer
Dashboard, then fill in the tabs below.

## Store listing

**Name / summary:** taken from the extension: "Loki's Basket Optimizer" (same name
in every language; the summary is localized). Default language English; add Czech
and Slovak listings with the texts below.

**Category:** Shopping

**Graphics:** icon = from the extension (128×128); screenshots =
`chrome/screenshot-en-1..3.png` (English listing), `screenshot-cs-1..3.png`
(Czech listing) and `screenshot-sk-1..3.png` (Slovak listing); small promo tile = `chrome/promo-small-440x280.png`.

### Description – English
Collect the products you want to buy on Heureka.cz, Heureka.sk or Zboží.cz and see
the cheapest way to buy them all – shipping included.

• Compares buying everything in one shop with splitting the order across 2–3 shops,
  and shows exactly what splitting saves.
• Knows free-shipping limits: estimates them from the comparison site, or uses the
  real values you enter once.
• Several baskets (pharmacy, electronics, …), Kč and € kept separate.
• The same shop on Heureka and Zboží counts as one shop; the same product from
  both sites can be combined to get every shop's offer.
• Czech, Slovak and English.

How to use: open a product on Heureka or Zboží and click the green button in the
bottom-left corner. Then open the extension to see the cheapest plan.
All data stays in your browser. No account, no tracking.

### Popis – čeština
Sbírejte produkty, které chcete koupit, na Heureka.cz, Heureka.sk nebo Zboží.cz a
uvidíte nejlevnější způsob, jak je koupit všechny – včetně dopravy.

• Porovná nákup všeho v jednom obchodě s rozdělením do 2–3 obchodů a ukáže,
  kolik rozdělení ušetří.
• Počítá s dopravou zdarma od určité částky: odhadne ji ze srovnávače, nebo použije
  skutečné hodnoty, které jednou zadáte.
• Více košíků (lékárna, elektronika, …), Kč a € zvlášť.
• Stejný obchod na Heurece a Zboží se počítá jako jeden; stejný produkt z obou
  webů lze sloučit a získat nabídky všech obchodů.
• Čeština, slovenština a angličtina.

Použití: otevřete produkt na Heurece nebo Zboží a klikněte na zelené tlačítko
v levém dolním rohu. Pak otevřete rozšíření a uvidíte nejlevnější plán.
Všechna data zůstávají ve vašem prohlížeči. Bez účtu, bez sledování.

### Popis – slovenčina
Zbierajte produkty, ktoré chcete kúpiť, na Heureka.cz, Heureka.sk alebo Zboží.cz a
uvidíte najlacnejší spôsob, ako ich kúpiť všetky – vrátane dopravy.

• Porovná nákup všetkého v jednom obchode s rozdelením do 2–3 obchodov a ukáže,
  koľko rozdelenie ušetrí.
• Počíta s dopravou zadarmo od určitej sumy: odhadne ju z porovnávača, alebo použije
  skutočné hodnoty, ktoré raz zadáte.
• Viac košíkov (lekáreň, elektronika, …), Kč a € zvlášť.
• Rovnaký obchod na Heureke a Zboží sa počíta ako jeden; rovnaký produkt z oboch
  webov možno zlúčiť a získať ponuky všetkých obchodov.
• Čeština, slovenčina a angličtina.

Použitie: otvorte produkt na Heureke alebo Zboží a kliknite na zelené tlačidlo
v ľavom dolnom rohu. Potom otvorte rozšírenie a uvidíte najlacnejší plán.
Všetky údaje zostávajú vo vašom prehliadači. Bez účtu, bez sledovania.

## Privacy practices

**Single purpose:** Find the cheapest way to buy a set of products from price
comparison sites (Heureka.cz, Heureka.sk, Zboží.cz), including shipping costs.

**Permission justifications:**
- `storage` – saves the user's baskets, shipping rules and settings locally.
- Host permissions `https://*.heureka.cz/*`, `https://*.heureka.sk/*`,
  `https://*.zbozi.cz/*` – shows the "Add to basket" button on product pages of
  these sites and reads the product's offers (prices, shipping) when the user
  clicks it. On Zboží it requests the product's offer list from zbozi.cz, as the
  site does itself. No other sites are accessed.

**Remote code:** No, I am not using remote code.

**Data usage:** tick **Website content** (product names, prices and shop offers read
from the pages, stored only on the user's device). Tick the three certifications
(not sold to third parties; not used for purposes unrelated to the single purpose;
not used for creditworthiness or lending).

**Privacy policy URL:** where you publish `PRIVACY.md` (a public GitHub Gist or
GitHub Pages page works).

## Distribution
- **Visibility: Unlisted** – only people with the link can install it.
- Price: free. Regions: all (or Czechia + Slovakia).
- Edge users can install from the same Chrome Web Store link
  (Edge asks to allow extensions from other stores once). Brave installs directly.

## Test instructions for the reviewer (optional field)
Open any product page on heureka.cz (e.g. a vitamin or phone), click the green
"Add to …" button in the bottom-left corner, wait for "Added", then open the
extension popup to see the cheapest plan. Repeat with a second product to see the
comparison of one shop vs. split orders.

# Firefox (unlisted = self-distribution)
Upload `lokis-basket-optimizer-firefox-1.0.0.zip` at addons.mozilla.org → Submit a New
Add-on → **On your own**. You get a signed `.xpi`; give that file to friends
(Firefox: about:addons → gear → Install Add-on From File). Updates are not
automatic with self-distribution: send the new `.xpi` when you release one.
