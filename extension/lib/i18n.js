/*
 * Translations (en, cs, sk) with CLDR plural rules and currency formatting.
 * The language is a user setting ("auto" follows the browser), so this does not use
 * chrome.i18n (which can't be switched at runtime).
 *
 * Plural entries are objects keyed by Intl.PluralRules categories
 * (one / few / many / other); missing categories fall back to "other".
 */
(function (root) {
  'use strict';

  const LANGS = ['en', 'cs', 'sk'];
  const LANG_NAMES = { en: 'English', cs: 'Čeština', sk: 'Slovenčina' };

  const D = {
    en: {
      // units (plural)
      shops: { one: '{n} shop', other: '{n} shops' },
      products: { one: '{n} product', other: '{n} products' },
      // content script
      addTo: 'Add to “{name}”',
      updateIn: 'Update in “{name}”',
      addToNew: 'Add to a new basket',
      addTitle: 'Load all offers for this product and add it to the basket',
      updateTitle: 'Re-read all offers for this product and update it in the basket',
      chooseBasket: 'Choose basket',
      newBasketEllipsis: 'New basket…',
      newBasketPrompt: 'Name of the new basket',
      loadingOffers: 'Loading offers… {n} of {total}',
      loadingOffersNoTotal: 'Loading offers… {n}',
      added: 'Added · {shops}',
      updated: 'Updated · {shops}',
      partialOf: '(of {total} offers)',
      mergeInto: 'Add to an existing product',
      mergedInto: 'Combined with “{name}” · {shops}',
      storePickupOnly: 'store pickup only',
      storePickupTitle: 'For at least one product this shop offers only pickup at its own store.',
      noOffers: 'No offers found on this page',
      readError: 'Could not read offers — reload and try again',
      // popup: header & baskets
      appTitle: "Loki's Basket Optimizer",
      openInTab: 'Open in tab',
      basket: 'Basket',
      defaultBasketName: 'Basket {n}',
      newBasket: 'New',
      rename: 'Rename',
      save: 'Save',
      cancel: 'Cancel',
      deleteBasket: 'Delete',
      deleteConfirm: 'Click again to delete',
      // popup: empty & errors
      emptyTitle: 'This basket is empty.',
      emptyHelp: 'Open a product on Heureka or Zboží and click the green button in the bottom-left corner of the page. Add everything you want to buy, then come back here.',
      cantBuild: 'Can’t build an order',
      noUsableOffer: 'No usable offer for: {names}.',
      hintInStock: 'Try turning off “Only offers in stock” in Settings, or re-enable some shops.',
      hintExcluded: 'Re-enable some shops in Shipping rules.',
      noCombination: 'No shop combination covers every product within the current limit ({n}). Allow more shops in Settings.',
      // popup: result
      cheapestWay: 'Cheapest way to buy {products}',
      cheapestWith: 'Cheapest with {shops}',
      everythingFrom: 'Everything from {shop}',
      splitAcross: 'Split across {n} shops',
      includingShipping: ', including {amount} shipping.',
      includingFreeShipping: ', with free shipping.',
      savesVsShop: 'Saves {amount} compared with buying everything from {shop}.',
      savesVsN: 'Saves {amount} compared with the best order from {n} shops.',
      costsMore: 'Costs {amount} more than the cheapest option, with fewer orders.',
      noSaving: 'Splitting the order wouldn’t save anything.',
      alsoSimilar: 'Same or nearly the same price: {list}.',
      cheapestTag: 'cheapest',
      compareGroup: 'Compare by number of shops',
      freeShipping: 'free shipping',
      shippingAmount: 'shipping {amount}',
      goodsAmount: 'goods {amount}',
      est: 'est.',
      estTitle: 'Estimated from the comparison site. Set the real fee and free-shipping limit under Shipping rules.',
      toFree: '{amount} more at this shop would make shipping free.',
      openAtShop: 'Open {products} at this shop',
      approximate: 'Large basket: this is the best plan found in the time allowed, not guaranteed optimal. Try fewer shops in Settings.',
      staleWarn: 'Some prices are older than 3 days ({n}). Open those products and click Update.',
      // popup: products
      productsHeading: 'Products',
      fromPrice: 'from {amount}',
      pricesAgo: 'prices {ago}',
      justNow: 'just now',
      minAgo: '{n} min ago',
      hAgo: '{n} h ago',
      daysAgo: '{n} days ago',
      decQty: 'Decrease quantity',
      incQty: 'Increase quantity',
      quantity: 'Quantity',
      remove: 'Remove',
      removeItem: 'Remove {name}',
      // popup: shipping rules
      shippingRules: 'Shipping rules',
      shippingRulesCount: 'Shipping rules ({n})',
      shippingEmpty: 'Shops appear here once you add products.',
      shippingExplain: 'The site shows the cheapest delivery option per product, so the fees and free-shipping limits below are estimates (shown in grey). Type the real values for shops you use; leave a box empty to go back to the estimate.',
      colShop: 'Shop',
      colSells: 'Sells',
      colSellsTitle: 'Products from this basket that the shop sells',
      colShipping: 'Shipping',
      colFreeFrom: 'Free from',
      colUse: 'Use',
      colUseTitle: 'Include this shop',
      feeFor: 'Shipping fee for {shop}',
      freeFromFor: 'Free shipping from, {shop}',
      useShop: 'Use {shop}',
      showAllShops: 'Show all shops ({n})',
      showFewerShops: 'Show fewer shops',
      // popup: settings
      settings: 'Settings',
      language: 'Language',
      languageAuto: 'Automatic (browser)',
      inStockOnly: 'Only offers in stock',
      maxShops: 'Maximum number of shops per order',
      unknownFee: 'Shipping fee when the site shows none',
      // popup: access
      noAccess: 'No access to {sites}.',
      noAccessHelp: 'The extension can’t add its button there until you allow it.',
      allowAccess: 'Allow access',
      reloadTabs: 'Then reload any open tab of these sites.'
    },

    cs: {
      shops: { one: '{n} obchod', few: '{n} obchody', many: '{n} obchodu', other: '{n} obchodů' },
      products: { one: '{n} produkt', few: '{n} produkty', many: '{n} produktu', other: '{n} produktů' },
      addTo: 'Přidat do „{name}“',
      updateIn: 'Aktualizovat v „{name}“',
      addToNew: 'Přidat do nového košíku',
      addTitle: 'Načíst všechny nabídky tohoto produktu a přidat ho do košíku',
      updateTitle: 'Znovu načíst všechny nabídky a aktualizovat produkt v košíku',
      chooseBasket: 'Vyberte košík',
      newBasketEllipsis: 'Nový košík…',
      newBasketPrompt: 'Název nového košíku',
      loadingOffers: 'Načítám nabídky… {n} z {total}',
      loadingOffersNoTotal: 'Načítám nabídky… {n}',
      added: 'Přidáno · {shops}',
      updated: 'Aktualizováno · {shops}',
      partialOf: '(z {total} nabídek)',
      mergeInto: 'Přidat k existujícímu produktu',
      mergedInto: 'Sloučeno s „{name}“ · {shops}',
      storePickupOnly: 'jen osobní odběr',
      storePickupTitle: 'U některého produktu nabízí tento obchod jen osobní odběr na své prodejně.',
      noOffers: 'Na stránce nejsou žádné nabídky',
      readError: 'Nabídky se nepodařilo načíst — obnovte stránku a zkuste to znovu',
      appTitle: "Loki's Basket Optimizer",
      openInTab: 'Otevřít v kartě',
      basket: 'Košík',
      defaultBasketName: 'Košík {n}',
      newBasket: 'Nový',
      rename: 'Přejmenovat',
      save: 'Uložit',
      cancel: 'Zrušit',
      deleteBasket: 'Smazat',
      deleteConfirm: 'Klikněte znovu pro smazání',
      emptyTitle: 'Tento košík je prázdný.',
      emptyHelp: 'Otevřete produkt na Heurece nebo Zboží a klikněte na zelené tlačítko v levém dolním rohu stránky. Přidejte vše, co chcete koupit, a pak se vraťte sem.',
      cantBuild: 'Objednávku nelze sestavit',
      noUsableOffer: 'Žádná použitelná nabídka pro: {names}.',
      hintInStock: 'Zkuste v Nastavení vypnout „Jen nabídky skladem“ nebo znovu povolit některé obchody.',
      hintExcluded: 'Povolte znovu některé obchody v Pravidlech dopravy.',
      noCombination: 'Žádná kombinace obchodů nepokryje všechny produkty v rámci současného limitu ({n}). Povolte v Nastavení více obchodů.',
      cheapestWay: 'Nejlevnější nákup: {products}',
      cheapestWith: 'Nejlevnější nákup: {shops}',
      everythingFrom: 'Vše z obchodu {shop}',
      splitAcross: 'Rozděleno mezi {n} obchody',
      includingShipping: ', včetně dopravy {amount}.',
      includingFreeShipping: ', s dopravou zdarma.',
      savesVsShop: 'Ušetří {amount} oproti nákupu všeho v obchodě {shop}.',
      savesVsN: 'Ušetří {amount} oproti nejlepší objednávce z {n} obchodů.',
      costsMore: 'Stojí o {amount} víc než nejlevnější varianta, ale s méně objednávkami.',
      noSaving: 'Rozdělení objednávky by nic neušetřilo.',
      alsoSimilar: 'Stejně nebo skoro stejně drahé: {list}.',
      cheapestTag: 'nejlevnější',
      compareGroup: 'Porovnání podle počtu obchodů',
      freeShipping: 'doprava zdarma',
      shippingAmount: 'doprava {amount}',
      goodsAmount: 'zboží {amount}',
      est: 'odhad',
      estTitle: 'Odhad podle srovnávače. Skutečný poplatek a hranici pro dopravu zdarma nastavíte v Pravidlech dopravy.',
      toFree: 'Při nákupu za dalších {amount} v tomto obchodě bude doprava zdarma.',
      openAtShop: 'Otevřít {products} v tomto obchodě',
      approximate: 'Velký košík: toto je nejlepší plán nalezený v časovém limitu, nemusí být optimální. Zkuste v Nastavení snížit počet obchodů.',
      staleWarn: 'Některé ceny jsou starší než 3 dny ({n}). Otevřete tyto produkty a klikněte na Aktualizovat.',
      productsHeading: 'Produkty',
      fromPrice: 'od {amount}',
      pricesAgo: 'ceny {ago}',
      justNow: 'právě teď',
      minAgo: 'před {n} min',
      hAgo: 'před {n} h',
      daysAgo: 'před {n} dny',
      decQty: 'Snížit množství',
      incQty: 'Zvýšit množství',
      quantity: 'Množství',
      remove: 'Odebrat',
      removeItem: 'Odebrat {name}',
      shippingRules: 'Pravidla dopravy',
      shippingRulesCount: 'Pravidla dopravy ({n})',
      shippingEmpty: 'Obchody se zde zobrazí po přidání produktů.',
      shippingExplain: 'Srovnávač ukazuje u každého produktu nejlevnější způsob dopravy, takže poplatky a hranice pro dopravu zdarma níže jsou odhady (šedě). Pro obchody, kde nakupujete, zadejte skutečné hodnoty; prázdné pole znamená návrat k odhadu.',
      colShop: 'Obchod',
      colSells: 'Prodává',
      colSellsTitle: 'Kolik produktů z košíku obchod prodává',
      colShipping: 'Doprava',
      colFreeFrom: 'Zdarma od',
      colUse: 'Použít',
      colUseTitle: 'Zahrnout tento obchod',
      feeFor: 'Poplatek za dopravu, {shop}',
      freeFromFor: 'Doprava zdarma od, {shop}',
      useShop: 'Použít {shop}',
      showAllShops: 'Zobrazit všechny obchody ({n})',
      showFewerShops: 'Zobrazit méně obchodů',
      settings: 'Nastavení',
      language: 'Jazyk',
      languageAuto: 'Automaticky (podle prohlížeče)',
      inStockOnly: 'Jen nabídky skladem',
      maxShops: 'Nejvyšší počet obchodů v objednávce',
      unknownFee: 'Poplatek za dopravu, když ho stránka neuvádí',
      noAccess: 'Chybí přístup k {sites}.',
      noAccessHelp: 'Rozšíření tam nemůže přidat své tlačítko, dokud to nepovolíte.',
      allowAccess: 'Povolit přístup',
      reloadTabs: 'Pak obnovte otevřené karty těchto stránek.'
    },

    sk: {
      shops: { one: '{n} obchod', few: '{n} obchody', many: '{n} obchodu', other: '{n} obchodov' },
      products: { one: '{n} produkt', few: '{n} produkty', many: '{n} produktu', other: '{n} produktov' },
      addTo: 'Pridať do „{name}“',
      updateIn: 'Aktualizovať v „{name}“',
      addToNew: 'Pridať do nového košíka',
      addTitle: 'Načítať všetky ponuky tohto produktu a pridať ho do košíka',
      updateTitle: 'Znova načítať všetky ponuky a aktualizovať produkt v košíku',
      chooseBasket: 'Vyberte košík',
      newBasketEllipsis: 'Nový košík…',
      newBasketPrompt: 'Názov nového košíka',
      loadingOffers: 'Načítavam ponuky… {n} z {total}',
      loadingOffersNoTotal: 'Načítavam ponuky… {n}',
      added: 'Pridané · {shops}',
      updated: 'Aktualizované · {shops}',
      partialOf: '(z {total} ponúk)',
      mergeInto: 'Pridať k existujúcemu produktu',
      mergedInto: 'Zlúčené s „{name}“ · {shops}',
      storePickupOnly: 'len osobný odber',
      storePickupTitle: 'Pri niektorom produkte ponúka tento obchod len osobný odber na svojej predajni.',
      noOffers: 'Na stránke nie sú žiadne ponuky',
      readError: 'Ponuky sa nepodarilo načítať — obnovte stránku a skúste to znova',
      appTitle: "Loki's Basket Optimizer",
      openInTab: 'Otvoriť v karte',
      basket: 'Košík',
      defaultBasketName: 'Košík {n}',
      newBasket: 'Nový',
      rename: 'Premenovať',
      save: 'Uložiť',
      cancel: 'Zrušiť',
      deleteBasket: 'Zmazať',
      deleteConfirm: 'Kliknite znova pre zmazanie',
      emptyTitle: 'Tento košík je prázdny.',
      emptyHelp: 'Otvorte produkt na Heureke alebo Zboží a kliknite na zelené tlačidlo v ľavom dolnom rohu stránky. Pridajte všetko, čo chcete kúpiť, a potom sa vráťte sem.',
      cantBuild: 'Objednávku nie je možné zostaviť',
      noUsableOffer: 'Žiadna použiteľná ponuka pre: {names}.',
      hintInStock: 'Skúste v Nastaveniach vypnúť „Len ponuky na sklade“ alebo znova povoliť niektoré obchody.',
      hintExcluded: 'Znova povoľte niektoré obchody v Pravidlách dopravy.',
      noCombination: 'Žiadna kombinácia obchodov nepokryje všetky produkty v rámci súčasného limitu ({n}). Povoľte v Nastaveniach viac obchodov.',
      cheapestWay: 'Najlacnejší nákup: {products}',
      cheapestWith: 'Najlacnejší nákup: {shops}',
      everythingFrom: 'Všetko z obchodu {shop}',
      splitAcross: 'Rozdelené medzi {n} obchodmi',
      includingShipping: ', vrátane dopravy {amount}.',
      includingFreeShipping: ', s dopravou zadarmo.',
      savesVsShop: 'Ušetrí {amount} oproti nákupu všetkého v obchode {shop}.',
      savesVsN: 'Ušetrí {amount} oproti najlepšej objednávke z {n} obchodov.',
      costsMore: 'Stojí o {amount} viac ako najlacnejšia možnosť, ale s menej objednávkami.',
      noSaving: 'Rozdelenie objednávky by nič neušetrilo.',
      alsoSimilar: 'Rovnako alebo takmer rovnako drahé: {list}.',
      cheapestTag: 'najlacnejšie',
      compareGroup: 'Porovnanie podľa počtu obchodov',
      freeShipping: 'doprava zadarmo',
      shippingAmount: 'doprava {amount}',
      goodsAmount: 'tovar {amount}',
      est: 'odhad',
      estTitle: 'Odhad podľa porovnávača. Skutočný poplatok a hranicu pre dopravu zadarmo nastavíte v Pravidlách dopravy.',
      toFree: 'Pri nákupe za ďalších {amount} v tomto obchode bude doprava zadarmo.',
      openAtShop: 'Otvoriť {products} v tomto obchode',
      approximate: 'Veľký košík: toto je najlepší plán nájdený v časovom limite, nemusí byť optimálny. Skúste v Nastaveniach znížiť počet obchodov.',
      staleWarn: 'Niektoré ceny sú staršie ako 3 dni ({n}). Otvorte tieto produkty a kliknite na Aktualizovať.',
      productsHeading: 'Produkty',
      fromPrice: 'od {amount}',
      pricesAgo: 'ceny {ago}',
      justNow: 'práve teraz',
      minAgo: 'pred {n} min',
      hAgo: 'pred {n} h',
      daysAgo: 'pred {n} dňami',
      decQty: 'Znížiť množstvo',
      incQty: 'Zvýšiť množstvo',
      quantity: 'Množstvo',
      remove: 'Odobrať',
      removeItem: 'Odobrať {name}',
      shippingRules: 'Pravidlá dopravy',
      shippingRulesCount: 'Pravidlá dopravy ({n})',
      shippingEmpty: 'Obchody sa tu zobrazia po pridaní produktov.',
      shippingExplain: 'Porovnávač ukazuje pri každom produkte najlacnejší spôsob dopravy, takže poplatky a hranice pre dopravu zadarmo nižšie sú odhady (sivou). Pre obchody, kde nakupujete, zadajte skutočné hodnoty; prázdne pole znamená návrat k odhadu.',
      colShop: 'Obchod',
      colSells: 'Predáva',
      colSellsTitle: 'Koľko produktov z košíka obchod predáva',
      colShipping: 'Doprava',
      colFreeFrom: 'Zadarmo od',
      colUse: 'Použiť',
      colUseTitle: 'Zahrnúť tento obchod',
      feeFor: 'Poplatok za dopravu, {shop}',
      freeFromFor: 'Doprava zadarmo od, {shop}',
      useShop: 'Použiť {shop}',
      showAllShops: 'Zobraziť všetky obchody ({n})',
      showFewerShops: 'Zobraziť menej obchodov',
      settings: 'Nastavenia',
      language: 'Jazyk',
      languageAuto: 'Automaticky (podľa prehliadača)',
      inStockOnly: 'Len ponuky na sklade',
      maxShops: 'Najvyšší počet obchodov v objednávke',
      unknownFee: 'Poplatok za dopravu, keď ho stránka neuvádza',
      noAccess: 'Chýba prístup k {sites}.',
      noAccessHelp: 'Rozšírenie tam nemôže pridať svoje tlačidlo, kým to nepovolíte.',
      allowAccess: 'Povoliť prístup',
      reloadTabs: 'Potom obnovte otvorené karty týchto stránok.'
    },

  };

  function resolveLang(setting, browserLang) {
    if (setting && setting !== 'auto' && D[setting]) return setting;
    const base = String(browserLang || 'en').toLowerCase().split('-')[0];
    return D[base] ? base : 'en';
  }

  function create(setting, browserLang) {
    const lang = resolveLang(setting, browserLang);
    const dict = D[lang];
    const pr = new Intl.PluralRules(lang);

    function fill(str, vars) {
      return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
    }
    function lookup(key) {
      return dict[key] != null ? dict[key] : D.en[key];
    }
    function t(key, vars) {
      const v = lookup(key);
      if (v == null) return key;
      if (typeof v === 'object') return plural(key, vars && vars.n, vars);
      return fill(v, vars);
    }
    function plural(key, n, vars) {
      const v = lookup(key);
      const cat = pr.select(n);
      const form = (v && (v[cat] || v.other)) || key;
      return fill(form, Object.assign({}, vars, { n }));
    }
    return { lang, t, plural };
  }

  // Prices are shown the way the source site shows them, regardless of UI language.
  const CURRENCY_LOCALE = { CZK: 'cs-CZ', EUR: 'sk-SK' };
  const fmtCache = {};
  function money(amount, currency) {
    const cur = currency || 'CZK';
    if (!fmtCache[cur]) {
      fmtCache[cur] = new Intl.NumberFormat(CURRENCY_LOCALE[cur] || 'en', {
        style: 'currency', currency: cur,
        minimumFractionDigits: cur === 'CZK' ? 0 : 2, maximumFractionDigits: 2
      });
    }
    return fmtCache[cur].format(Math.round(amount * 100) / 100);
  }
  function currencySymbol(currency) {
    return { CZK: 'Kč', EUR: '€' }[currency] || currency || '';
  }

  const api = { LANGS, LANG_NAMES, DICTS: D, create, resolveLang, money, currencySymbol };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
