/*
 * Basket optimizer.
 *
 * Problem: each basket item (with quantity) can be bought from any shop that offers it.
 * Every shop you use charges shipping once, unless the goods subtotal at that shop reaches
 * its free-shipping threshold. Find the cheapest total, optionally limited to K shops.
 *
 * Solved exactly with depth-first branch and bound (fine for typical baskets:
 * ~10 items x ~60 shops). A node limit guards against pathological inputs; if it is
 * hit, the best plan found so far is returned and flagged as approximate.
 *
 * Works in the browser (global BasketOptimizer) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const EPS = 1e-9;
  const NODE_LIMIT = 3e6;

  /*
   * Cross-site shop identity. The same shop has different ids on Heureka (UUID) and
   * Zboží ("zbozi:123"). Shops are matched by a normalized domain/name: Heureka's slug
   * ("drmax-cz") when known, otherwise the shop name ("Dr.Max", "Alza.cz").
   * Two different shops of the same site are never merged, even if their names collide.
   */
  function normShop(s) {
    let x = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    x = x.replace(/^https?:\/\//, '').replace(/^www[.\-]/, '');
    x = x.replace(/[.\-\s_](cz|sk|eu|com|net|org|pl|de|at|hu)$/, '');
    return x.replace(/[^a-z0-9]/g, '');
  }
  function siteOfShop(shopId) { return String(shopId).indexOf('zbozi:') === 0 ? 'zbozi' : 'heureka'; }

  function assignShopKeys(items, knownSlugs) {
    const slugs = Object.assign({}, knownSlugs || {});
    items.forEach((it) => it.offers.forEach((o) => { if (o.shopSlug) slugs[o.shopId] = o.shopSlug; }));
    const nameOf = new Map();                // shopId -> normalized name
    const bySiteName = new Map();            // site|name -> Set(shopId)
    items.forEach((it) => it.offers.forEach((o) => {
      if (nameOf.has(o.shopId)) return;
      const n = normShop(slugs[o.shopId] || o.shopName);
      nameOf.set(o.shopId, n);
      const k = siteOfShop(o.shopId) + '|' + n;
      if (!bySiteName.has(k)) bySiteName.set(k, new Set());
      bySiteName.get(k).add(o.shopId);
    }));
    const keyOf = (id) => {
      const n = nameOf.get(id);
      if (!n || bySiteName.get(siteOfShop(id) + '|' + n).size > 1) return 'id:' + id;
      return 'n:' + n;
    };
    const members = {};
    const out = items.map((it) => Object.assign({}, it, {
      offers: it.offers.map((o) => {
        const key = keyOf(o.shopId);
        (members[key] = members[key] || new Set()).add(o.shopId);
        return Object.assign({}, o, { shopKey: key });
      })
    }));
    Object.keys(members).forEach((k) => { members[k] = Array.from(members[k]); });
    return { items: out, members };
  }
  const keyOfOffer = (o) => o.shopKey || o.shopId;

  /*
   * Build per-shop shipping rules from what Heureka showed, plus user overrides.
   *
   * Heureka shows, per offer, the cheapest delivery option for buying that one item.
   *  - fee estimate: the highest non-zero delivery price seen for the shop (conservative).
   *  - free-shipping estimate: if the shop showed free delivery for an item priced P,
   *    orders of at least P ship free (assuming an order-value threshold). Only used
   *    when it is consistent: every paid observation must be for a cheaper item.
   */
  function buildShops(items, overrides, settings, members) {
    overrides = overrides || {};
    const unknownFee = settings && typeof settings.unknownFee === 'number' ? settings.unknownFee : 79;
    const shops = {};

    items.forEach((item) => {
      item.offers.forEach((o) => {
        const key = keyOfOffer(o);
        let s = shops[key];
        if (!s) {
          s = shops[key] = { id: key, name: o.shopName, rating: o.rating, observations: [], itemKeys: new Set(), storePickup: false };
        }
        if (o.storePickupOnly) s.storePickup = true;
        if (o.rating != null) s.rating = o.rating;
        s.observations.push({ price: o.price, delivery: o.delivery });
        s.itemKeys.add(item.key);
      });
    });

    Object.values(shops).forEach((s) => {
      const known = s.observations.filter((x) => x.delivery != null);
      const paid = known.filter((x) => x.delivery > 0);
      const free = known.filter((x) => x.delivery === 0);

      let estFee = null;
      if (paid.length) estFee = Math.max.apply(null, paid.map((x) => x.delivery));
      else if (free.length) estFee = 0;

      let estThreshold = null;
      if (paid.length && free.length) {
        const minFree = Math.min.apply(null, free.map((x) => x.price));
        const maxPaid = Math.max.apply(null, paid.map((x) => x.price));
        if (minFree > maxPaid) estThreshold = minFree;
      }

      // rules saved under the shop's key, or (older versions) under one of its site ids
      const ov = overrides[s.id] || ((members && members[s.id]) || []).map((id) => overrides[id]).find(Boolean) || {};
      const hasFee = typeof ov.fee === 'number' && !isNaN(ov.fee);
      const hasThr = typeof ov.threshold === 'number' && !isNaN(ov.threshold);

      s.estFee = estFee;
      s.estThreshold = estThreshold;
      s.fee = hasFee ? ov.fee : (estFee != null ? estFee : unknownFee);
      s.feeSource = hasFee ? 'user' : (estFee != null ? 'heureka' : 'default');
      s.threshold = hasThr ? ov.threshold : estThreshold;
      s.thresholdSource = hasThr ? 'user' : (estThreshold != null ? 'heureka' : 'none');
      s.excluded = !!ov.excluded;
      s.coverage = s.itemKeys.size;
      delete s.itemKeys;
      delete s.observations;
    });

    return shops;
  }

  function shippingFor(shop, subtotal) {
    if (shop.threshold != null && subtotal + EPS >= shop.threshold) return 0;
    return shop.fee;
  }

  /*
   * Core search. items: [{key, qty, offers:[{shopId, price, inStock, ...}]}]
   * Returns the best plan using at most maxShops shops, or null if impossible.
   */
  function search(items, shops, opts) {
    const inStockOnly = !!opts.inStockOnly;
    const maxShops = Math.max(1, opts.maxShops || items.length);

    const shopIds = Object.keys(shops).filter((id) => !shops[id].excluded);
    const idx = new Map(shopIds.map((id, i) => [id, i]));
    const S = shopIds.length;
    const fee = shopIds.map((id) => shops[id].fee);
    const thr = shopIds.map((id) => shops[id].threshold);

    // candidates per item, cheapest first
    const cand = items.map((item) => item.offers
      .filter((o) => idx.has(keyOfOffer(o)) && (!inStockOnly || o.inStock !== false))
      .map((o) => ({ s: idx.get(keyOfOffer(o)), cost: o.price * item.qty, offer: o }))
      .sort((a, b) => a.cost - b.cost));

    const missing = items.filter((_, i) => cand[i].length === 0);
    if (missing.length) return { infeasible: missing.map((m) => m.key) };

    // most constrained items first, then largest price spread
    const order = items.map((_, i) => i).sort((a, b) =>
      (cand[a].length - cand[b].length) ||
      ((cand[b][cand[b].length - 1].cost - cand[b][0].cost) - (cand[a][cand[a].length - 1].cost - cand[a][0].cost)));
    const N = order.length;
    const oc = order.map((i) => cand[i]);

    // costAt[d][s]: cost of item at depth d in shop s (or -1)
    const costAt = oc.map((list) => {
      const row = new Float64Array(S).fill(-1);
      list.forEach((c) => { row[c.s] = c.cost; });
      return row;
    });
    // minRem[d]: sum of cheapest cost of items d..N-1
    const minRem = new Float64Array(N + 1);
    for (let d = N - 1; d >= 0; d--) minRem[d] = minRem[d + 1] + oc[d][0].cost;
    // pot[d][s]: max goods value shop s could still receive from items d..N-1
    const pot = [];
    pot[N] = new Float64Array(S);
    for (let d = N - 1; d >= 0; d--) {
      pot[d] = new Float64Array(pot[d + 1]);
      oc[d].forEach((c) => { pot[d][c.s] += c.cost; });
    }

    const sub = new Float64Array(S);
    const cnt = new Int32Array(S); // items assigned per shop
    const used = [];              // stack of shops in use
    const choice = new Int32Array(N);

    let best = Infinity, bestShops = Infinity, bestChoice = null;
    let nodes = 0, truncated = false;

    function shipLowerBound(s, d) {
      if (fee[s] <= 0) return 0;
      if (thr[s] == null) return fee[s];
      return (sub[s] + pot[d][s] + EPS >= thr[s]) ? 0 : fee[s];
    }

    function dfs(d, goods) {
      if (truncated) return;
      if (++nodes > NODE_LIMIT) { truncated = true; return; }

      if (d === N) {
        let total = goods;
        for (let k = 0; k < used.length; k++) {
          const s = used[k];
          total += (thr[s] != null && sub[s] + EPS >= thr[s]) ? 0 : fee[s];
        }
        if (total < best - EPS || (Math.abs(total - best) <= EPS && used.length < bestShops)) {
          best = total; bestShops = used.length; bestChoice = Array.from(choice);
        }
        return;
      }

      // lower bound
      const full = used.length >= maxShops;
      let lb = goods;
      for (let k = 0; k < used.length; k++) lb += shipLowerBound(used[k], d);
      if (full) {
        // every remaining item must go to a shop already in use
        for (let e = d; e < N; e++) {
          let m = Infinity;
          const row = costAt[e];
          for (let k = 0; k < used.length; k++) { const v = row[used[k]]; if (v >= 0 && v < m) m = v; }
          if (m === Infinity) return; // infeasible branch
          lb += m;
          if (lb > best + EPS) return;
        }
      } else {
        lb += minRem[d];
        if (lb > best + EPS) return;
        // if some remaining item is not sold by any shop in use, one more shop is needed
        let needNew = -1;
        for (let e = d; e < N && needNew < 0; e++) {
          const row = costAt[e];
          let covered = false;
          for (let k = 0; k < used.length; k++) if (row[used[k]] >= 0) { covered = true; break; }
          if (!covered) needNew = e;
        }
        if (needNew >= 0) {
          let m = Infinity;
          const list = oc[needNew];
          for (let j = 0; j < list.length && m > 0; j++) {
            const s = list[j].s;
            if (cnt[s] > 0) continue;
            const v = shipLowerBound(s, d);
            if (v < m) m = v;
          }
          lb += (m === Infinity ? 0 : m);
          if (lb > best + EPS) return;
        }
      }

      const list = oc[d];
      for (let j = 0; j < list.length; j++) {
        const c = list[j];
        const isNew = cnt[c.s] === 0;
        if (isNew && full) continue;
        // cheap per-branch prune: goods alone already too expensive
        if (goods + c.cost + minRem[d + 1] > best + EPS) break; // list sorted by cost
        if (isNew) used.push(c.s);
        cnt[c.s]++; sub[c.s] += c.cost; choice[d] = j;
        dfs(d + 1, goods + c.cost);
        cnt[c.s]--; sub[c.s] -= c.cost;
        if (isNew) used.pop();
      }
    }

    // Seed with a good upper bound: best single shop (if any covers everything)
    const seed = opts.seed;
    if (seed && isFinite(seed.total)) { best = seed.total + EPS * 10; }

    dfs(0, 0);
    if (!bestChoice) return seed && seed.plan ? seed.plan : null;

    // Build plan
    const groups = new Map();
    for (let d = 0; d < N; d++) {
      const c = oc[d][bestChoice[d]];
      const item = items[order[d]];
      const id = shopIds[c.s];
      if (!groups.has(id)) groups.set(id, { shopId: id, name: shops[id].name, lines: [], subtotal: 0 });
      const g = groups.get(id);
      g.lines.push({ key: item.key, name: item.name, qty: item.qty, unitPrice: c.offer.price, cost: c.cost, exitUrl: c.offer.exitUrl, inStock: c.offer.inStock, storePickupOnly: !!c.offer.storePickupOnly });
      g.subtotal += c.cost;
    }
    const plan = finalizePlan(Array.from(groups.values()), shops, items);
    plan.approximate = truncated;
    plan.nodes = nodes;
    return plan;
  }

  function finalizePlan(groups, shops, items) {
    let goods = 0, shipping = 0;
    groups.forEach((g) => {
      const shop = shops[g.shopId];
      g.shipping = shippingFor(shop, g.subtotal);
      g.freeShipping = g.shipping === 0 && shop.fee > 0;
      g.shippingEstimated = shop.feeSource !== 'user' || (shop.threshold != null && shop.thresholdSource !== 'user');
      g.feeSource = shop.feeSource;
      g.threshold = shop.threshold;
      g.missingForFree = (shop.threshold != null && g.shipping > 0) ? Math.max(0, shop.threshold - g.subtotal) : null;
      g.total = g.subtotal + g.shipping;
      g.storePickupOnly = g.lines.some((l) => l.storePickupOnly);
      // keep lines in basket order
      const pos = new Map(items.map((it, i) => [it.key, i]));
      g.lines.sort((a, b) => pos.get(a.key) - pos.get(b.key));
      goods += g.subtotal; shipping += g.shipping;
    });
    groups.sort((a, b) => b.subtotal - a.subtotal);
    return { groups, goods, shipping, total: goods + shipping, shopCount: groups.length };
  }

  function bestSingleShop(items, shops, inStockOnly) {
    const plans = [];
    Object.values(shops).forEach((shop) => {
      if (shop.excluded) return;
      const lines = [];
      for (const item of items) {
        const matches = item.offers.filter((x) => keyOfOffer(x) === shop.id && (!inStockOnly || x.inStock !== false));
        if (!matches.length) return;
        const o = matches.reduce((a, b) => (b.price < a.price ? b : a));
        lines.push({ key: item.key, name: item.name, qty: item.qty, unitPrice: o.price, cost: o.price * item.qty, exitUrl: o.exitUrl, inStock: o.inStock, storePickupOnly: !!o.storePickupOnly });
      }
      const subtotal = lines.reduce((a, l) => a + l.cost, 0);
      plans.push(finalizePlan([{ shopId: shop.id, name: shop.name, lines, subtotal }], shops, items));
    });
    if (!plans.length) return null;
    plans.sort((a, b) => a.total - b.total);
    const best = plans[0];
    // other single shops that are (almost) as cheap - useful if you prefer a shop you know
    const margin = Math.max(best.total * 0.02, 0.005); // currency-independent
    best.alternatives = plans.slice(1)
      .filter((p) => p.total - best.total <= margin + EPS)
      .slice(0, 3)
      .map((p) => ({ shopId: p.groups[0].shopId, name: p.groups[0].name, total: p.total }));
    return best;
  }

  /*
   * Main entry: returns the best plan for each allowed number of shops (1..maxShops),
   * keeping only options that are strictly cheaper than using fewer shops.
   */
  function optimize(items, shops, opts) {
    opts = opts || {};
    const maxShops = Math.max(1, Math.min(opts.maxShops || 3, items.length || 1));
    if (!items.length) return { options: [], infeasible: [] };

    const options = [];
    let prev = null;
    let infeasible = [];

    const single = bestSingleShop(items, shops, opts.inStockOnly);
    if (single) { single.limit = 1; options.push(single); prev = single; }

    for (let k = 2; k <= maxShops; k++) {
      const res = search(items, shops, { inStockOnly: opts.inStockOnly, maxShops: k, seed: prev ? { total: prev.total, plan: prev } : null });
      if (res && res.infeasible) { infeasible = res.infeasible; break; }
      if (!res) continue;
      if (!prev || res.total < prev.total - EPS) {
        res.limit = k; options.push(res); prev = res;
      }
    }
    if (maxShops === 1 && !single) {
      // report which items make a single-shop order impossible
      const res = search(items, shops, { inStockOnly: opts.inStockOnly, maxShops: 1 });
      if (res && res.infeasible) infeasible = res.infeasible;
    }
    // The cheapest is the last one (each later option is strictly cheaper).
    return { options, best: options.length ? options[options.length - 1] : null, infeasible };
  }

  const api = { buildShops, optimize, search, bestSingleShop, shippingFor, assignShopKeys, normShop };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BasketOptimizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
