/* Harvestworks — gameplay, rendering and UI.
   Reads content from HW_DATA (data.js) and sprites from HW_ART (art.js). */
(function () {
  'use strict';
  const D = window.HW_DATA, C = D.config, ART = window.HW_ART;
  const QN = C.qualityNames, QM = C.qualityMult;
  const SAVE_KEY = 'harvestworks.save.v1';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let S = null;                                   // the whole saveable game state
  const UI = { cat: { buy: 'all', sell: 'all', inv: 'all', disc: 'all' }, yaw: 0, yawTo: null, tilt: 1, stick: null, sel: -1, hover: -1, drawer: null, mtab: 'buy', fert: false, confirmReset: false,
               floats: [], parts: [], sq: {}, hcrop: null, hrec: null, dirty: true, saveIn: 8, savedAt: 0, html: {}, goalsOpen: true, smokeT: 0 };
  const cam = { u: 0, v: 80, z: 1.6 };
  // Phones: a narrow screen (portrait) or a short one (landscape), driven by touch.
  const mq = q => window.matchMedia && window.matchMedia(q).matches;
  const isPhone = () => mq('(max-width: 760px)') || mq('(max-height: 500px) and (pointer: coarse)');
  const isTouch = () => mq('(pointer: coarse)');
  const CAM_SPEED = 0.8; // camera pan / turn speed (1 = map follows the cursor exactly)
  const cv = $('#world'), cx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  /* ================= state ================= */
  function initRes(t) {
    if (t === 'forest') return { st: 'tree', g: 0 };
    if (t === 'water') return { stock: D.gather.water.stock, rt: 0 };
    if (t === 'boulder') return { stock: D.gather.boulder.stock, rt: 0 };
    return null;
  }
  function makeB(type) {
    const B = D.buildings[type];
    if (B.kind === 'farm') return { type, st: 'raw' };
    if (B.kind === 'station') return { type, q: [], lv: { speed: 0, capacity: 0, quality: 0 } };
    return { type };
  }
  function newState() {
    const M = D.map, h = M.rows.length, w = M.rows[0].length;
    const TT = { g: 'grass', f: 'forest', w: 'water', b: 'boulder' };
    const tiles = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = TT[M.rows[y][x]]; tiles.push({ t, o: false, b: null, r: initRes(t), v: (x * 7 + y * 13) % 3 }); }
    for (let y = M.owned[1]; y <= M.owned[3]; y++) for (let x = M.owned[0]; x <= M.owned[2]; x++) tiles[y * w + x].o = true;
    M.structures.forEach(([type, x, y]) => { tiles[y * w + x].b = makeB(type); });
    S = { v: 1, w, h, tiles, time: 60, gold: C.startGold, score: 0, dp: 0, inv: {}, home: 0, unl: [], firsts: {}, disc: [],
          av: { x: M.spawn[0], y: M.spawn[1], path: [], face: 1 }, queue: [], cur: null, orders: [], ms: 0, refill: 0,
          day: 1, market: { offers: [], demand: null, pin: [] }, goal: 0, exp: 0, maxQ: 0, built: 0,
          name: 'Farmer', shirt: 0, hat: 0, uid: 1, tools: {}, helper: null };
    for (const [id, n] of Object.entries(C.startInventory)) addItem(id, n, 0, true);
    C.startKnown.forEach(id => S.disc.includes(id) || S.disc.push(id));
    D.startOrders.forEach(o => S.orders.push({ id: S.uid++, kind: 'raw', name: 'Neighbour’s request', need: o.need, gold: o.gold, score: Math.round(o.gold * .6) }));
    rollMarket();
    return S;
  }
  // Bring older saves up to date: new fields get defaults, nothing existing changes.
  function migrate() {
    S.tools = Object.assign(Object.fromEntries(Object.keys(D.tools).map(k => [k, 0])), S.tools || {});
    if (S.helper === undefined) S.helper = null;
    if (!S.log) S.log = [];
    if (!S.tick) S.tick = { open: true, spd: 'slow' };
  }
  const idx = (x, y) => y * S.w + x, tx = i => i % S.w, ty = i => (i / S.w) | 0;
  const inB = (x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function nbrs(i) { const x = tx(i), y = ty(i), o = []; N4.forEach(([dx, dy]) => inB(x + dx, y + dy) && o.push(idx(x + dx, y + dy))); return o; }
  const walkable = i => S.tiles[i].o && D.terrain[S.tiles[i].t].walk;
  const unlocked = id => !id || S.unl.includes(id);
  // Storage = the Homestead's level plus every storage building you've placed.
  const G_ = () => D.homeGrowth, nList = () => D.homeUpgrades.length;
  const homeCap = l => l < C.capacity.length ? C.capacity[l] : C.capacity[C.capacity.length - 1] + G_().cap * (l - C.capacity.length + 1);
  function homeCost(l) { if (l < nList()) return D.homeUpgrades[l]; const k = l - nList();
    return { gold: Math.round(G_().gold * Math.pow(G_().goldMult, k + 1) / 10) * 10, brick: G_().brick + G_().brickStep * (k + 1), crate: G_().crate + G_().crateStep * (k + 1) }; }
  const homeGate = l => D.homeGate[Math.min(l, D.homeGate.length - 1)];
  const extraCap = () => S.tiles.reduce((n, t) => n + (t.b && D.buildings[t.b.type] && D.buildings[t.b.type].storage || 0), 0);
  const cap = () => homeCap(S.home) + extraCap();

  /* ================= inventory ================= */
  const storable = id => D.items[id].cat !== 'kit';
  function count(id, minQ = 0) { const a = S.inv[id]; if (!a) return 0; let n = 0; for (let q = minQ; q < 3; q++) n += a[q]; return n; }
  function used() { let n = 0; for (const k in S.inv) if (storable(k)) n += S.inv[k][0] + S.inv[k][1] + S.inv[k][2]; return n; }
  const room = () => cap() - used();
  function addItem(id, n, q = 0, silent) {
    (S.inv[id] = S.inv[id] || [0, 0, 0])[q] += n;
    if (!S.disc.includes(id)) S.disc.push(id);
    if (!silent && q > S.maxQ) S.maxQ = q;
    if (!silent && q === 1) first('q1', C.firsts.good, 'First Good-quality goods');
    if (!silent && q === 2) first('q2', C.firsts.excellent, 'First Excellent-quality goods');
  }
  // take n units; 'high' uses best quality first (processing), 'low' uses worst eligible first (orders)
  function take(id, n, minQ = 0, order = 'low') {
    const a = S.inv[id]; let worst = 2;
    const qs = order === 'high' ? [2, 1, 0] : [0, 1, 2];
    for (const q of qs) { if (q < minQ) continue; const k = Math.min(a[q], n); if (k > 0) { a[q] -= k; n -= k; worst = Math.min(worst, q); } if (!n) break; }
    return worst;
  }
  function canPay(cost) { for (const k in cost) { if (k === 'gold') { if (S.gold < cost.gold) return `Needs ${cost.gold}g`; } else if (count(k) < cost[k]) return `Needs ${cost[k]} ${D.items[k].name}` + (k === 'stone' ? ' (break boulders on a Boulder Field, or buy at the market)' : ''); } return null; }
  function pay(cost) { for (const k in cost) { if (k === 'gold') S.gold -= cost.gold; else take(k, cost[k]); } }
  function costTxt(cost) { return Object.entries(cost).map(([k, n]) => k === 'gold' ? `${n}g` : `${n} ${D.items[k].name}`).join(' + ') || 'Free'; }
  // Seeds and supplies sell back for half their market price.
  const baseValue = id => D.items[id].value || Math.max(1, Math.floor((D.items[id].buy || 2) / 2));
  function sellPrice(id, q) { const d = S.market.demand; return Math.max(1, Math.round(baseValue(id) * QM[q] * (d && d.item === id ? 1 + d.pct / 100 : 1) * mult(id))); }

  /* ================= progression ================= */
  function gainScore(n, i) { n = Math.round(n); if (n <= 0) return; S.score += n; if (i !== undefined) float(i, `+${n}`, '#f6e27a'); }
  function first(key, dp, why) {
    if (S.firsts[key] || !dp) return; S.firsts[key] = 1; S.dp += dp;
    toast(`<b>+${dp} Discovery</b> · ${esc(why)}`, 'disc');
  }
  function emit(ev, data = {}) {
    const g = D.goals[S.goal];
    if (g && g.ev === ev && (!g.item || g.item === data.item) && (!g.st || g.st === data.st)) completeGoal();
  }
  function goalStateDone(g) { return g.state === 'unl' ? S.unl.length > 0 : g.state === 'exp' ? S.exp > 0 : g.state === 'built' ? S.built > 0 : false; }
  function completeGoal() {
    const g = D.goals[S.goal]; S.goal++; S.gold += g.reward || 0;
    toast(`<b>Goal complete:</b> ${esc(g.title)}${g.reward ? ` · +${g.reward}g` : ''}`, 'goal');
    if (S.goal === D.goals.length) { S.dp += 1; toast('<b>Tutorial finished · +1 Discovery.</b> Your homestead is on its feet. Check the Order Board for the next contract.', 'disc'); }
    dirty();
  }
  function depth(id) {
    const r = Object.values(D.recipes).find(r => r.out[id]);
    return r ? 1 + Math.max(...Object.keys(r.in).map(depth)) : 0;
  }

  /* ================= market & orders ================= */
  /* ================= shared valley market =================
     Prices are shared by everyone playing the hosted game. Each sale or purchase is reported to a small
     Supabase database, which nudges that item's price for all players; prices drift back to normal over
     a few hours. If the database can't be reached (offline, or on hosts that block outside connections)
     the game simply uses its normal local prices. */
  const NET = { url: 'https://xtbsmtystiozdogielrd.supabase.co/rest/v1/rpc/', key: 'sb_publishable_PJJnI2sfHAgoy0KnTIg6fQ_Jov1DbwY',
                ok: false, tried: false, prices: {}, trades: [], at: 0, skew: 0 };
  const PLAYER = (() => { try { let id = localStorage.getItem('harvestworks.player');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('harvestworks.player', id); } return id; } catch (e) { return crypto.randomUUID(); } })();
  async function rpc(fn, body) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(NET.url + fn, { method: 'POST', signal: ctl.signal, headers: { apikey: NET.key, Authorization: 'Bearer ' + NET.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(tm); }
  }
  async function pullMarket() {
    try { const m = await rpc('get_market'); NET.prices = m.prices || {}; NET.trades = m.trades || []; NET.active = m.active || 1; NET.recov = m.recovery_hours; NET.ok = true;
      NET.skew = Date.now() - Date.parse(m.now); NET.at = Date.now(); }
    catch (e) { NET.ok = false; }
    NET.tried = true; UI.tickDirty = true; dirty();
  }
  function reportTrade(item, qty, side) {
    if (!NET.ok || D.items[item].cat === 'kit') return;
    NET.trades.unshift({ item, qty, side, created_at: new Date(Date.now() - NET.skew).toISOString(), mine: true }); NET.trades.length = Math.min(NET.trades.length, 40);
    UI.tickDirty = true;
    rpc('record_trade', { p_player: PLAYER, p_item: item, p_qty: qty, p_side: side }).then(m => { if (typeof m === 'number') { NET.prices[item] = m; dirty(); } }).catch(() => {});
  }
  const mult = id => (NET.ok && D.items[id].cat !== 'kit' && NET.prices[id]) || 1;
  // Goods you've made at least once can be bought back from the market at a markup (above even the +50% demand sell price).
  const RESALE = 1.75;
  const buyPrice = id => Math.max(1, Math.round((D.items[id].buy || (D.items[id].value || 1) * RESALE) * mult(id)));
  function moveTag(id) { const m = mult(id); if (Math.abs(m - 1) < .005) return '';
    const pct = Math.round((m - 1) * 100); return `<span class="mv ${pct > 0 ? 'up' : 'dn'}" title="Shared valley price">${pct > 0 ? '▲' : '▼'}${Math.abs(pct)}%</span>`; }

  const SELLABLE = ['crop', 'gathered', 'good', 'component'];          // what orders and market demand use
  const MARKET_BUYS = SELLABLE.concat(['seed', 'supply']);               // what the market will buy from you
  // A short "how do I use this?" line for items that aren't obvious.
  function useHint(id) { const it = D.items[id];
    if (it.cat === 'seed') { const c = Object.values(D.crops).find(c => c.seed === id); return `Plant on a tilled Farm Plot: select the plot → Plant ${c ? c.name : ''}.`; }
    if (id === 'sapling') return 'Plant on a tree stump in a Forest, or use Change this land → Plant a woodland on grass.';
    if (id === 'fertilizer') return 'Crops grow 40% faster and gain +1 quality. Tick “Use fertilizer” when planting, or choose Add fertilizer on a growing crop.';
    if (it.cat === 'kit') return 'Select empty grass you own → Place.';
    return ''; }
  function rollMarket() {
    const kits = Object.keys(D.items).filter(id => D.items[id].cat === 'kit' && D.items[id].buy && unlocked(D.items[id].requires));
    for (let i = kits.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [kits[i], kits[j]] = [kits[j], kits[i]]; }
    S.market.offers = kits.slice(0, C.marketOffers);
    const pool = S.disc.filter(id => SELLABLE.includes(D.items[id].cat));
    if (pool.length) { const it = pool[(Math.random() * pool.length) | 0]; S.market.demand = { item: it, pct: Math.random() < .3 ? 50 : 25 }; }
  }
  function genOrder() {
    const pool = S.disc.filter(id => SELLABLE.includes(D.items[id].cat) && !S.orders.some(o => o.need[0][0] === id));
    if (!pool.length) return null;
    const crafted = pool.filter(id => ['good', 'component'].includes(D.items[id].cat));
    const raw = pool.filter(id => !crafted.includes(id));
    const useC = crafted.length && (!raw.length || Math.random() < .55);
    const list = useC ? crafted : raw, id = list[(Math.random() * list.length) | 0];
    const qty = useC ? 1 + ((Math.random() * 2.5) | 0) : 2 + ((Math.random() * 4) | 0);
    const minQ = S.maxQ >= 1 && Math.random() < .25 ? 1 : 0;
    const gold = Math.round(D.items[id].value * qty * (useC ? 1.6 : 1.35) * (1 + minQ * .6));
    const names = D.orderNames[useC ? 'crafted' : 'raw'];
    return { id: S.uid++, kind: useC ? 'crafted' : 'raw', name: names[(Math.random() * names.length) | 0], need: [[id, qty, minQ]], gold, score: Math.round(gold * (useC ? .9 : .5)) };
  }
  const canFill = need => need.every(([id, n, q]) => count(id, q) >= n);
  function newDay() {
    rollMarket();
    toast(`<b>Day ${S.day}.</b> ${S.market.demand ? `Market wants ${esc(D.items[S.market.demand.item].name)}: +${S.market.demand.pct}% today.` : ''}`, 'info');
    dirty();
  }

  /* ================= tasks ================= */
  const T_ = (i) => S.tiles[i];
  const stationSlots = b => D.buildings[b.type].slots + D.upgrades.capacity.effect[b.lv.capacity];
  function expCost(i) {
    const c = { gold: D.terrain[T_(i).t].cost + C.expandStep * S.exp };
    if (T_(i).t === 'boulder') return c; // the source of stone never costs stone, or there'd be no way in
    if (S.exp >= C.expandStoneAt) c.stone = 2;
    if (S.exp >= C.expandFenceAt) c.fence_kit = 1;
    return c;
  }
  const isEmptyGrass = i => T_(i).o && T_(i).t === 'grass' && !T_(i).b;
  function outRoom(out) { let n = 0; for (const k in out) n += out[k]; return room() >= n; }
  const FULL = 'Storage is full. Sell goods or upgrade the Homestead.';

  /* tools: tier effects come from D.tools */
  const toolLv = k => (S.tools && S.tools[k]) || 0;
  const toolFor = a => Object.keys(D.tools).find(k => D.tools[k].act === a);
  const toolStat = (a, stat, dflt) => { const k = toolFor(a), T = k && D.tools[k]; return T && T[stat] ? T[stat][toolLv(k)] : dflt; };
  const workDur = t => (C.workTime[t.a] || (t.a === 'clearplot' ? 1.2 : 1)) * toolStat(t.a, 'speed', 1);
  function around(i, r) { const x = tx(i), y = ty(i), o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inB(x + dx, y + dy)) o.push(idx(x + dx, y + dy)); return o; }
  const farmAt = j => { const T = T_(j); return T.o && T.b && T.b.type === 'farm' ? T.b : null; };
  function gatherOut(terrain, act) { const o = Object.assign({}, D.gather[terrain].out), main = Object.keys(o)[0]; o[main] += toolStat(act, 'bonus', 0);
    if (terrain === 'boulder' && unlocked('prospecting')) o.copper_ore = 1; return o; }
  function waterPlot(b) { b.wet = true; b.w[b.half ? 1 : 0] = 1; }

  /* station work, shared by the farmer, the farmhand and station automation */
  function loadErr(i, rid) { const b = T_(i).b, R = D.recipes[rid]; if (!b || !b.q || !R || R.station !== b.type) return 'Not a station';
    if (!unlocked(R.requires)) return 'Recipe locked';
    if (b.q.length >= stationSlots(b)) return 'All slots busy';
    for (const k in R.in) if (count(k) < R.in[k]) return `Needs ${R.in[k]} ${D.items[k].name}`; return null; }
  function fillCount(i, rid) { const b = T_(i).b, R = D.recipes[rid]; if (loadErr(i, rid)) return 0;
    let n = stationSlots(b) - b.q.length; for (const k in R.in) n = Math.min(n, Math.floor(count(k) / R.in[k])); return Math.max(0, n); }
  function doLoad(i, rid) { const b = T_(i).b, R = D.recipes[rid]; let q = Object.keys(R.in).length ? 2 : 0;
    for (const k in R.in) q = Math.min(q, take(k, R.in[k], 0, 'high'));
    q = Math.min(2, q + D.upgrades.quality.effect[b.lv.quality]);
    b.q.push({ r: rid, t: 0, dur: R.time * D.upgrades.speed.effect[b.lv.speed], qual: q, done: false });
    emit('load', { st: b.type }); }
  function collectErr(i) { const b = T_(i).b; const done = b && b.q ? b.q.filter(x => x.done) : [];
    if (!done.length) return 'Nothing ready'; let n = 0; done.forEach(x => { for (const k in D.recipes[x.r].out) if (storable(k)) n += D.recipes[x.r].out[k]; }); return room() >= n ? null : FULL; }
  function doCollect(i) { const b = T_(i).b; const done = b.q.filter(x => x.done); b.q = b.q.filter(x => !x.done);
    done.forEach(x => { const out = D.recipes[x.r].out; for (const k in out) {
      addItem(k, out[k], x.qual); const d = depth(k);
      float(i, `+${out[k]} ${D.items[k].name}${x.qual ? ' · ' + QN[x.qual] : ''}`, '#fff');
      gainScore(C.score.craftPerDepth * d * out[k] * (1 + x.qual * .5), i);
      first('craft:' + k, C.firsts.craft, `First ${D.items[k].name} made`);
      if (d >= 2) first('deep:' + k, C.firsts.craftDeep, `${d}-step production chain: ${D.items[k].name}`);
      emit('collect', { item: k }); } }); }

  const TASKS = {
    till: { label: () => 'Till soil', check: t => { const b = T_(t.i).b; return b && b.type === 'farm' && b.st === 'raw' ? null : 'Soil is already prepared'; },
      run: t => { const hit = around(t.i, toolStat('till', 'area', 0)).filter(j => { const b = farmAt(j); return b && b.st === 'raw'; });
        hit.forEach(j => { T_(j).b.st = 'tilled'; gainScore(C.score.till, j); }); emit('till'); } },
    plant: { label: t => `Plant ${D.crops[t.p].name}`, check: t => { const b = T_(t.i).b, cr = D.crops[t.p];
        if (!b || b.st !== 'tilled') return 'Till the soil first';
        if (count(cr.seed) < 1) return `No ${D.items[cr.seed].name}`;
        if (t.f && count('fertilizer') < 1) return 'No fertilizer'; return null; },
      run: t => { const cr = D.crops[t.p]; take(cr.seed, 1); if (t.f) take('fertilizer', 1);
        T_(t.i).b = { type: 'farm', st: 'growing', crop: t.p, last: t.p, g: 0, wet: false, w: [0, 0], half: false, fert: !!t.f };
        gainScore(C.score.plant, t.i); emit('plant'); } },
    fertilize: { label: () => 'Fertilize crop',
      check: t => { const b = T_(t.i).b; if (!b || b.type !== 'farm' || b.st !== 'growing') return 'Only growing crops can be fertilized';
        if (b.fert) return 'Already fertilized'; return count('fertilizer') < 1 ? 'No fertilizer in storage' : null; },
      run: t => { take('fertilizer', 1); T_(t.i).b.fert = true; float(t.i, 'Fertilized · +1 quality', '#b8f08a'); gainScore(C.score.water, t.i); } },
    water: { label: () => 'Water crop', check: t => { const b = T_(t.i).b; return b && b.st === 'growing' && !b.wet ? null : 'Soil is already wet'; },
      run: t => { const hit = around(t.i, toolStat('water', 'area', 0)).filter(j => { const b = farmAt(j); return b && b.st === 'growing' && !b.wet; });
        hit.forEach(j => { waterPlot(T_(j).b); gainScore(C.score.water, j); }); emit('water'); } },
    harvest: { label: () => 'Harvest', check: t => { const b = T_(t.i).b; if (!b || b.st !== 'ready') return 'Not ready yet'; return room() >= D.crops[b.crop].yield ? null : FULL; },
      run: t => { const b = T_(t.i).b, cr = D.crops[b.crop];
        const q = Math.min(2, (b.w[0] && b.w[1] ? 1 : 0) + (b.fert ? 1 : 0));
        addItem(cr.item, cr.yield, q); float(t.i, `+${cr.yield} ${D.items[cr.item].name}${q ? ' · ' + QN[q] : ''}`, '#fff');
        T_(t.i).b = { type: 'farm', st: 'raw', last: b.crop };
        gainScore(C.score.harvest * (1 + q * .5), t.i); first('harvest:' + b.crop, C.firsts.harvest, `First ${cr.name.toLowerCase()} harvested`);
        emit('harvest', { item: cr.item }); } },
    chop: { label: () => 'Chop tree', check: t => { const T = T_(t.i); if (!unlocked('woodcutting')) return 'Unlock Woodcutting first'; if (T.r.st !== 'tree') return 'No grown tree'; return outRoom(gatherOut('forest', 'chop')) ? null : FULL; },
      run: t => { const o = gatherOut('forest', 'chop'); for (const k in o) addItem(k, o[k]); T_(t.i).r.st = 'stump';
        float(t.i, `+${o.log} Logs`, '#fff'); gainScore(C.score.chop, t.i); first('gather:log', C.firsts.gather, 'First logs chopped'); emit('chop'); } },
    replant: { label: () => 'Plant sapling', check: t => T_(t.i).r.st !== 'stump' ? 'Nothing to replant' : count('sapling') < 1 ? 'No sapling' : null,
      run: t => { take('sapling', 1); Object.assign(T_(t.i).r, { st: 'sapling', g: 0 }); gainScore(C.score.replant, t.i); } },
    fish: { label: () => 'Fish', check: t => !unlocked('fishing') ? 'Unlock Fishing first' : T_(t.i).r.stock < 1 ? 'Fish are hiding. Try again soon' : outRoom(gatherOut('water', 'fish')) ? null : FULL,
      run: t => { const n = gatherOut('water', 'fish').fish; T_(t.i).r.stock--; addItem('fish', n); float(t.i, `+${n} Fish`, '#fff'); gainScore(C.score.fish, t.i); first('gather:fish', C.firsts.gather, 'First fish caught'); } },
    mine: { label: () => 'Break stone', check: t => !unlocked('stonecutting') ? 'Unlock Stonecutting first' : T_(t.i).r.stock < 1 ? 'No boulders left. They resurface over time' : outRoom(gatherOut('boulder', 'mine')) ? null : FULL,
      run: t => { const o = gatherOut('boulder', 'mine'), n = o.stone; T_(t.i).r.stock--; for (const k in o) addItem(k, o[k]); float(t.i, `+${n} Stone${o.copper_ore ? ' + ore' : ''}`, '#fff'); if (o.copper_ore) first('gather:ore', C.firsts.gather, 'First copper ore'); gainScore(C.score.mine, t.i); first('gather:stone', C.firsts.gather, 'First stone quarried'); } },
    load: { label: t => `Load ${t.n > 1 ? t.n + '× ' : ''}${D.items[Object.keys(D.recipes[t.p].out)[0]].name}`,
      check: t => loadErr(t.i, t.p), run: t => { const n = Math.max(1, Math.min(t.n || 1, fillCount(t.i, t.p))); for (let k = 0; k < n; k++) doLoad(t.i, t.p); } },
    collect: { label: () => 'Collect', check: t => collectErr(t.i), run: t => doCollect(t.i) },
    buy: { label: t => `Buy ${t.n} ${D.items[t.p].name}`, check: t => { const c = buyPrice(t.p) * t.n;
        if (S.gold < c) return `Needs ${c}g`; if (storable(t.p) && room() < t.n) return FULL; return null; },
      run: t => { const c = buyPrice(t.p) * t.n; S.gold -= c; addItem(t.p, t.n, 0, true); float(t.i, `-${c}g`, '#ffb3a0'); reportTrade(t.p, t.n, 'buy'); emit('buy'); } },
    sell: { label: t => `Sell ${t.n} ${D.items[t.p].name}`, check: t => (S.inv[t.p] || [0, 0, 0])[t.q] >= t.n ? null : 'Not enough in storage',
      run: t => { const g = sellPrice(t.p, t.q) * t.n; S.inv[t.p][t.q] -= t.n; S.gold += g; float(t.i, `+${g}g`, '#f6e27a'); reportTrade(t.p, t.n, 'sell');
        gainScore(g / C.score.sellPer, t.i); first('sell', C.firsts.sell, 'First sale at the market'); emit('sell'); } },
    deliver: { label: t => t.p === 'ms' ? `Deliver: ${D.milestones[S.ms] ? D.milestones[S.ms].name : 'contract'}` : 'Deliver order',
      check: t => { const o = t.p === 'ms' ? D.milestones[S.ms] : S.orders.find(o => o.id === t.p); if (!o) return 'Order is gone'; return canFill(o.need) ? null : 'Missing goods'; },
      run: t => {
        if (t.p === 'ms') { const m = D.milestones[S.ms]; m.need.forEach(([id, n, q]) => take(id, n, q));
          S.gold += m.gold; S.dp += m.dp; S.ms++; gainScore(m.gold, t.i);
          toast(`<b>Contract complete: ${esc(m.name)}</b> · +${m.gold}g · +${m.dp} Discovery`, 'disc');
        } else { const o = S.orders.find(o => o.id === t.p); o.need.forEach(([id, n, q]) => take(id, n, q));
          S.gold += o.gold; gainScore(o.score, t.i); S.orders = S.orders.filter(x => x !== o); S.refill = C.orderRefill;
          float(t.i, `+${o.gold}g`, '#f6e27a');
          if (o.kind === 'crafted') first('orderC', C.firsts.orderCrafted, 'First crafted order filled'); }
        first('order', C.firsts.order, 'First order delivered'); emit('deliver'); } },
    build: { label: () => 'Build Farm Plot', check: t => !isEmptyGrass(t.i) ? 'Tile is not empty grass' : canPay(C.farmPlotCost),
      run: t => { pay(C.farmPlotCost); T_(t.i).b = makeB('farm'); gainScore(C.score.build / 2, t.i); } },
    place: { label: t => `Place ${D.buildings[D.items[t.p].building].name}`,
      check: t => { if (!isEmptyGrass(t.i)) return 'Tile is not empty grass'; if (count(t.p) < 1) return 'No kit in storage'; return canPay(D.buildings[D.items[t.p].building].place); },
      run: t => { const bt = D.items[t.p].building; take(t.p, 1); pay(D.buildings[bt].place); T_(t.i).b = makeB(bt); S.built++;
        gainScore(C.score.build, t.i); first('build:' + bt, C.firsts.build, `${D.buildings[bt].name} built`);
        toast(`<b>${esc(D.buildings[bt].name)} is running.</b> ${D.buildings[bt].kind === 'station' ? 'Select it to load recipes.' : D.buildings[bt].kind === 'storage' ? `Storage is now ${cap()}.` : 'It waters the planted plots around it.'}`, 'info'); emit('build', { st: bt }); } },
    expand: { label: t => `Buy ${D.terrain[T_(t.i).t].name}`,
      check: t => { if (T_(t.i).o) return 'Already yours'; if (!nbrs(t.i).some(n => T_(n).o)) return 'Expand closer first'; return canPay(expCost(t.i)); },
      run: t => { const T = T_(t.i); pay(expCost(t.i)); T.o = true; S.exp++; gainScore(C.score.expand, t.i);
        first('expand:' + T.t, C.firsts.expand, `New terrain: ${D.terrain[T.t].name}`); float(t.i, 'New land!', '#b8f08a'); emit('expand'); } },
    upgrade: { label: t => `Upgrade ${D.upgrades[t.p].name}`,
      check: t => { const b = T_(t.i).b, U = D.upgrades[t.p]; if (!unlocked('tuning')) return 'Unlock Station Tuning';
        const g = U.gate && U.gate[b.lv[t.p]]; if (g && !unlocked(g)) return `Unlock ${D.discoveries.find(d => d.id === g).name}`;
        if (b.lv[t.p] >= U.cost.length) return 'Fully upgraded'; return canPay(U.cost[b.lv[t.p]]); },
      run: t => { const b = T_(t.i).b; pay(D.upgrades[t.p].cost[b.lv[t.p]]); b.lv[t.p]++; gainScore(C.score.upgrade, t.i);
        toast(`<b>${esc(D.buildings[b.type].name)} upgraded:</b> ${D.upgrades[t.p].label(b.lv[t.p])}.`, 'info'); } },
    homeup: { label: () => 'Expand storage', check: () => (homeGate(S.home) && !unlocked(homeGate(S.home))) ? 'Unlock Root Cellar in Discovery' : canPay(homeCost(S.home)),
      run: t => { pay(homeCost(S.home)); S.home++; gainScore(C.score.upgrade, t.i); toast(`<b>Storage expanded</b> to ${cap()} items.`, 'info'); } },
    reshape: { label: t => D.landShape[t.p].verb,
      check: t => { const T = T_(t.i), [from, to] = t.p.split('>'), L = D.landShape[t.p];
        if (!L || !T.o) return 'Not your land'; if (T.t !== from) return 'The land has changed';
        if (T.b) return 'Clear what’s built here first';
        const other = (S.helper && Math.round(S.helper.x) === tx(t.i) && Math.round(S.helper.y) === ty(t.i));
        if (to === 'water' && other) return 'Your farmhand is standing there';
        let need = 0; for (const k in L.back) need += L.back[k]; return room() < need ? FULL : canPay(L.cost); },
      run: t => { const T = T_(t.i), [from, to] = t.p.split('>'), L = D.landShape[t.p];
        pay(L.cost); const back = Object.assign({}, L.back);
        if (L.backPerStock && T.r && T.r.stock) back[L.backPerStock] = (back[L.backPerStock] || 0) + T.r.stock;
        if (from === 'forest' && T.r && T.r.st !== 'tree') back.log = 0; // a stump or sapling has no timber in it
        for (const k in back) if (back[k] > 0) addItem(k, back[k]);
        T.t = to; T.r = initRes(to); if (to === 'forest') Object.assign(T.r, { st: 'sapling', g: 0 });
        if (S.helper) S.helper.steps = S.helper.steps.filter(st => st.i !== t.i);
        if (!D.terrain[to].walk) { // step off a tile that just became water
          const i = t.i; if (Math.round(S.av.x) === tx(i) && Math.round(S.av.y) === ty(i)) { const n = nbrs(i).find(walkable); if (n !== undefined) { S.av.x = tx(n); S.av.y = ty(n); } } }
        gainScore(C.score.build / 2, t.i); float(t.i, `Now ${D.terrain[to].name}`, '#b8f08a');
        first('reshape', C.firsts.build, 'First land reshaped'); } },
    clearplot: { label: () => 'Clear farm plot',
      check: t => { const b = T_(t.i).b; if (!b || b.type !== 'farm') return 'No farm plot here'; return b.st === 'raw' ? null : 'Only untilled plots can be cleared'; },
      run: t => { T_(t.i).b = null; if (S.helper) S.helper.steps = S.helper.steps.filter(st => st.i !== t.i);
        float(t.i, 'Cleared', '#b8f08a'); toast('Plot cleared. The tile is open grass again, ready to build on.', 'info'); } },
    toolup: { label: t => `Upgrade ${D.tools[t.p].name}`,
      check: t => { const T = D.tools[t.p], l = toolLv(t.p); if (!unlocked('tools')) return 'Unlock Toolsmithing'; if (l >= T.cost.length) return 'Fully upgraded'; return canPay(T.cost[l]); },
      run: t => { const T = D.tools[t.p]; pay(T.cost[toolLv(t.p)]); S.tools[t.p]++; gainScore(C.score.upgrade, t.i);
        toast(`<b>${T.tiers[S.tools[t.p]]} ${esc(T.name)}.</b> ${esc(T.desc[S.tools[t.p]])}`, 'info'); } },
    hire: { label: () => 'Hire a farmhand', check: () => !unlocked('farmhand') ? 'Unlock Farmhand' : S.helper ? 'Already hired' : canPay(D.farmhand.hire),
      run: t => { pay(D.farmhand.hire); S.helper = { x: Math.round(S.av.x), y: Math.round(S.av.y), path: [], dir: [1, -1], cur: null, steps: [], k: 0, idle: 0, on: true };
        toast('<b>Your farmhand is here.</b> Select a plot, station, tree, pond or boulder field and choose “Add to farmhand”.', 'goal'); } }
  };
  const ONCE = ['fertilize', 'reshape', 'clearplot', 'till', 'plant', 'water', 'harvest', 'chop', 'replant', 'collect', 'build', 'place', 'expand', 'upgrade', 'homeup', 'deliver', 'toolup', 'hire'];
  function checkTask(t) { return TASKS[t.a].check(t); }
  function queueTask(t) {
    t.a = t.a; const busy = S.queue.length + (S.cur ? 1 : 0);
    const same = x => x && x.a === t.a && x.i === t.i && x.p === t.p;
    if (ONCE.includes(t.a) && (same(S.cur) || S.queue.some(same))) { toast('That’s already in the task queue.', 'warn'); return; }
    if (busy >= C.maxQueue) { toast(`Task queue is full (${C.maxQueue}). Wait for your farmer to finish.`, 'warn'); return; }
    S.queue.push(Object.assign({ id: S.uid++ }, t)); dirty();
  }

  /* ================= pathing & avatar ================= */
  const avTile = () => idx(Math.round(S.av.x), Math.round(S.av.y));
  function standGoals(i) { return walkable(i) ? [i] : nbrs(i).filter(walkable); }
  function findPath(from, goals) {
    if (!goals.length) return null; if (goals.includes(from)) return [];
    const prev = new Map([[from, -1]]), q = [from];
    while (q.length) { const c = q.shift();
      for (const n of nbrs(c)) { if (prev.has(n) || !walkable(n)) continue; prev.set(n, c);
        if (goals.includes(n)) { const p = [n]; let k = c; while (k !== from) { p.unshift(k); k = prev.get(k); } return p; }
        q.push(n); } }
    return null;
  }
  // Activity log: what the farmer and farmhand actually did, with the results they produced.
  function logAct(text, who) { S.log.unshift({ d: S.day, c: clock(), text, who }); if (S.log.length > 150) S.log.length = 150; UI.logDirty = true; }
  function runLogged(t, who) {
    const g0 = S.gold, f0 = UI.floats.length; TASKS[t.a].run(t);
    const res = UI.floats.slice(f0).map(f => f.text).filter(x => !/^\+\d+$/.test(x) && !/g$/.test(x)), dg = S.gold - g0;
    const money = ['sell', 'buy', 'deliver', 'expand', 'build', 'place', 'upgrade', 'toolup', 'homeup', 'hire', 'reshape'].includes(t.a); // goal rewards aren't the action's doing
    logAct(TASKS[t.a].label(t) + (res.length ? ' · ' + res.join(', ') : '') + (money && dg ? ` · ${dg > 0 ? '+' : '−'}${Math.abs(dg)}g` : ''), who);
  }
  function fail(t, msg) { toast(`<b>${esc(TASKS[t.a].label(t))}:</b> ${esc(msg)}`, 'warn'); S.cur = null; S.av.path = []; dirty(); }
  function updateAvatar(dt) {
    const A = S.av;
    if (!S.cur) { if (!S.queue.length) return; const t = S.queue.shift(); const p = findPath(avTile(), standGoals(t.i));
      if (!p) { S.cur = t; fail(t, 'Your farmer can’t reach that spot.'); return; }
      A.path = p; t.ph = 'walk'; S.cur = t; dirty(); }
    const t = S.cur;
    if (t.ph === 'walk') {
      if (A.path.length) { const n = A.path[0], nx = tx(n), ny = ty(n), dx = nx - A.x, dy = ny - A.y, d = Math.hypot(dx, dy), st = C.walkSpeed * dt;
        if (Math.abs(dx) + Math.abs(dy) > .01) A.dir = [dx, dy];
        if (d <= st) { A.x = nx; A.y = ny; A.path.shift(); } else { A.x += dx / d * st; A.y += dy / d * st; }
      } else { const e = checkTask(t); if (e) return fail(t, e); t.ph = 'work'; t.t = 0; t.dur = workDur(t);
        const ddx = tx(t.i) - A.x, ddy = ty(t.i) - A.y; if (Math.abs(ddx) + Math.abs(ddy) > .01) A.dir = [ddx, ddy]; dirty(); }
    } else { t.t += dt; if (t.t >= t.dur) { const e = checkTask(t); if (e) return fail(t, e); runLogged(t, 'you'); S.cur = null; dirty(); UI.saveIn = Math.min(UI.saveIn, 1.5); } }
  }

  /* ================= farmhand ================= */
  const fhMax = () => unlocked('crew') ? 8 : D.farmhand.maxSteps;
  function moveActor(A, dt, speed) { // step along A.path; true once arrived
    if (!A.path.length) return true;
    const n = A.path[0], nx = tx(n), ny = ty(n), dx = nx - A.x, dy = ny - A.y, d = Math.hypot(dx, dy), st = speed * dt;
    if (Math.abs(dx) + Math.abs(dy) > .01) A.dir = [dx, dy];
    if (d <= st) { A.x = nx; A.y = ny; A.path.shift(); } else { A.x += dx / d * st; A.y += dy / d * st; }
    return false;
  }
  // A routine step names a place and a kind of job; this picks the concrete task it needs right now.
  function resolveStep(st) {
    const T = T_(st.i), b = T.b; let t = null;
    if (st.s === 'tend' && b && b.type === 'farm') t = b.st === 'raw' ? { a: 'till' } : b.st === 'tilled' ? { a: 'plant', p: st.p, f: 0 } : b.st === 'growing' && !b.wet ? { a: 'water' } : b.st === 'ready' ? { a: 'harvest' } : null;
    else if (st.s === 'station' && b && b.q) t = b.q.some(x => x.done) ? { a: 'collect' } : { a: 'load', p: st.p };
    else if (st.s === 'forest' && T.r) t = T.r.st === 'tree' ? { a: 'chop' } : T.r.st === 'stump' ? { a: 'replant' } : null;
    else if (st.s === 'fish' || st.s === 'mine') t = { a: st.s };
    if (!t) return null; t.i = st.i;
    if (checkTask(t)) return null;
    const same = x => x && x.a === t.a && x.i === t.i; if (same(S.cur) || S.queue.some(same)) return null; // the farmer has it
    return t;
  }
  function stepLabel(st) {
    if (st.s === 'tend') return `Tend plot · ${D.crops[st.p].name}`;
    if (st.s === 'station') return `Run ${D.buildings[T_(st.i).b ? T_(st.i).b.type : 'stove'].name} · ${D.items[Object.keys(D.recipes[st.p].out)[0]].name}`;
    return { forest: 'Chop and replant a tree', fish: 'Fish the pond', mine: 'Break stone' }[st.s];
  }
  function updateHelper(dt) {
    const F = S.helper; if (!F || !F.on || !F.steps.length) { if (F) F.cur = null; return; }
    if (!F.cur) {
      if (F.idle > 0) { F.idle -= dt * (F.spd || 1); return; }
      const n = F.steps.length;
      for (let k = 0; k < n; k++) { const si = (F.k + k) % n, t = resolveStep(F.steps[si]); if (!t) continue;
        const path = findPath(idx(Math.round(F.x), Math.round(F.y)), standGoals(t.i)); if (!path) continue;
        F.path = path; t.ph = 'walk'; t.si = si; F.cur = t; dirty(); break; }
      if (!F.cur) { F.idle = D.farmhand.idle; return; }
    }
    const t = F.cur, next = () => { F.cur = null; F.k = (t.si + 1) % Math.max(1, F.steps.length); dirty(); };
    if (t.ph === 'walk') {
      if (moveActor(F, dt * (F.spd || 1), unlocked('crew') ? C.walkSpeed : D.farmhand.walkSpeed)) { if (checkTask(t)) return next();
        t.ph = 'work'; t.t = 0; t.dur = workDur(t) * (unlocked('crew') ? 1 : D.farmhand.workMult);
        const ddx = tx(t.i) - F.x, ddy = ty(t.i) - F.y; if (Math.abs(ddx) + Math.abs(ddy) > .01) F.dir = [ddx, ddy]; }
    } else { t.t += dt * (F.spd || 1); if (t.t >= t.dur) { if (!checkTask(t)) runLogged(t, 'hand'); next(); } }
  }

  /* ================= simulation ================= */
  function update(dt) {
    S.time += dt;
    const day = Math.floor(S.time / C.dayLength) + 1; if (day !== S.day) { S.day = day; newDay(); }
    S.tiles.forEach((T, i) => {
      const b = T.b;
      if (b && b.type === 'farm' && b.st === 'growing') {
        const cr = D.crops[b.crop]; b.g += dt * (b.wet ? 1 : .45) * (b.fert ? C.fertGrowth : 1);
        if (!b.half && b.g >= cr.grow / 2) { b.half = true; b.wet = false; dirty(); }
        if (b.g >= cr.grow) { b.st = 'ready'; float(i, 'Ready!', '#b8f08a'); dirty(); }
      } else if (b && b.q) {
        const j = b.q.find(x => !x.done);
        if (j) { j.t += dt; if (j.t >= j.dur) { j.done = true; if (!b.auto) float(i, 'Done!', '#b8f08a'); dirty(); } }
        if (b.auto && unlocked('autocollect') && !collectErr(i)) { doCollect(i); dirty(); }
        if (b.rep && unlocked('repeat') && !loadErr(i, b.rep)) { doLoad(i, b.rep); dirty(); }
      } else if (b && D.buildings[b.type].kind === 'sprinkler') {
        if (b.fx > 0) b.fx -= dt;
        around(i, D.buildings[b.type].radius).forEach(j => { const f = farmAt(j); if (f && f.st === 'growing' && !f.wet) { waterPlot(f); b.fx = 1.4; dirty(); } });
      }
      const R = T.r; if (!R) return;
      if (T.t === 'forest') { if (R.st === 'sapling') { R.g += dt; if (R.g >= D.gather.forest.regrow) { R.st = 'tree'; dirty(); } } }
      else { const G = D.gather[T.t]; if (R.stock < G.stock) { R.rt += dt; if (R.rt >= G.regen) { R.rt = 0; R.stock++; dirty(); } } else R.rt = 0; }
    });
    if (S.orders.length < C.orderSlots) { S.refill -= dt; if (S.refill <= 0) { const o = genOrder(); if (o) S.orders.push(o); S.refill = C.orderRefill; dirty(); } }
    updateAvatar(dt); updateHelper(dt);
    const g = D.goals[S.goal]; if (g && goalStateDone(g)) completeGoal();
    UI.saveIn -= dt; if (UI.saveIn <= 0) save();
  }

  /* ================= save / load ================= */
  function save() { UI.saveIn = 8; try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); UI.savedAt = Date.now(); } catch (e) { /* storage blocked: play continues */ } }
  function load() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return null; const o = JSON.parse(s); return o && o.v === 1 && o.tiles ? o : null; } catch (e) { return null; } }

  /* ================= camera & input ================= */
  const P = () => 2 * cam.z * DPR;
  const isoU = (x, y) => (x - y) * 16, isoV = (x, y) => (x + y) * 8 * UI.tilt;
  const TILT_MIN = .55, TILT_MAX = 1.7;
  const fromIso = (u, v) => [(u / 16 + v / (8 * UI.tilt)) / 2, (v / (8 * UI.tilt) - u / 16) / 2]; // screen-iso → view tile coords
  // Free map rotation (yaw, radians) around the map centre. The isometric tilt never changes:
  // world (x, y) is turned into view (x, y) before projecting, and back again when picking.
  function turn(dx, dy, a) { const c = Math.cos(a), s = Math.sin(a); return [dx * c - dy * s, dx * s + dy * c]; }
  function view(x, y, a = UI.yaw) { const mx = (S.w - 1) / 2, my = (S.h - 1) / 2, [u, v] = turn(x - mx, y - my, a); return [mx + u, my + v]; }
  const unview = (x, y) => view(x, y, -UI.yaw);
  const toScreen = (x, y) => { const [vx, vy] = view(x, y); return [W / 2 + (isoU(vx, vy) - cam.u) * P(), H / 2 + (isoV(vx, vy) - cam.v) * P()]; };
  function pick(mx, my) {
    const u = (mx - W / 2) / P() + cam.u, v = (my - H / 2) / P() + cam.v;
    const [fx, fy] = unview(...fromIso(u, v)), x = Math.round(fx), y = Math.round(fy);
    return inB(x, y) ? idx(x, y) : -1;
  }
  // turn and/or tilt the world while keeping whatever is at screen centre in place
  function setView(a, t) {
    const [wx, wy] = unview(...fromIso(cam.u, cam.v));
    const T = Math.PI * 2; UI.yaw = ((a % T) + T) % T; S.yaw = UI.yaw;
    UI.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, t)); S.tilt = UI.tilt;
    const [vx, vy] = view(wx, wy); cam.u = isoU(vx, vy); cam.v = isoV(vx, vy); clampCam();
  }
  const setYaw = a => setView(a, UI.tilt);
  // buttons and Q/E glide a quarter turn; right-drag sets the angle directly
  function rotateView(dir) { UI.yawTo = (UI.yawTo ?? UI.yaw) + dir * Math.PI / 2; }
  // Right button held = a thumbstick: how far the mouse is from where you pressed sets turn and tilt speed.
  const STICK_R = 110, STICK_DEAD = 8, YAW_RATE = 2.4, TILT_RATE = 1.1;
  function tickStick(dt) {
    const k = UI.stick; if (!k) return;
    let dx = (k.x - k.ax) / DPR, dy = (k.y - k.ay) / DPR; const d = Math.hypot(dx, dy);
    if (d < STICK_DEAD) return;
    const m = Math.min(1, (d - STICK_DEAD) / (STICK_R - STICK_DEAD)) / d; dx *= m; dy *= m; // -1…1 each axis, with a dead zone
    const ease = v => Math.sign(v) * v * v;                                            // fine control near the centre
    UI.yawTo = null; setView(UI.yaw + ease(dx) * YAW_RATE * CAM_SPEED * dt, UI.tilt + ease(dy) * TILT_RATE * CAM_SPEED * dt);
  }
  function drawStick() {
    const k = UI.stick; if (!k) return; const R = STICK_R * DPR;
    let dx = k.x - k.ax, dy = k.y - k.ay; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    cx.save(); cx.globalAlpha = .9;
    cx.beginPath(); cx.arc(k.ax, k.ay, R, 0, 7); cx.fillStyle = 'rgba(36,22,13,.28)'; cx.fill(); cx.lineWidth = 2 * DPR; cx.strokeStyle = 'rgba(246,231,193,.45)'; cx.stroke();
    cx.beginPath(); cx.arc(k.ax, k.ay, STICK_DEAD * DPR, 0, 7); cx.strokeStyle = 'rgba(246,231,193,.3)'; cx.stroke();
    cx.beginPath(); cx.arc(k.ax + dx, k.ay + dy, 14 * DPR, 0, 7); cx.fillStyle = 'rgba(245,197,66,.9)'; cx.fill(); cx.strokeStyle = '#24160d'; cx.stroke();
    cx.restore();
  }
  function tickCam(dt) {
    const g = UI.camTo; if (!g) return; const f = Math.min(1, dt * 9);
    cam.u += (g.u - cam.u) * f; cam.v += (g.v - cam.v) * f; clampCam();
    if (Math.abs(g.u - cam.u) + Math.abs(g.v - cam.v) < .3) UI.camTo = null;
  }
  // On a phone the panel covers the lower half, so slide the chosen tile into the upper part of the screen.
  function frameTile(i) {
    if (!isPhone() || i < 0) return;
    const [vx, vy] = view(tx(i), ty(i)), portrait = H > W;
    UI.camTo = { u: isoU(vx, vy) + (portrait ? 0 : W * .22 / P()), v: isoV(vx, vy) + (portrait ? H * .2 / P() : 0) };
  }
  function tickYaw(dt) {
    tickCam(dt);
    tickStick(dt);
    if (UI.yawTo == null) return; const d = UI.yawTo - UI.yaw, T = Math.PI * 2;
    const diff = ((d % T) + T + Math.PI) % T - Math.PI;
    if (Math.abs(diff) < .002) { setYaw(UI.yawTo); UI.yawTo = null; return; }
    const f = Math.min(1, dt * 12 * CAM_SPEED); setYaw(UI.yaw + diff * f); UI.yawTo = UI.yaw + diff * (1 - f);
  }
  function clampCam() {
    cam.z = Math.max(.7, Math.min(3.2, cam.z));
    cam.u = Math.max(-S.h * 16, Math.min(S.w * 16, cam.u)); cam.v = Math.max(0, Math.min((S.w + S.h) * 8 * UI.tilt, cam.v));
  }
  function zoomAt(f, mx, my) {
    const u0 = (mx - W / 2) / P() + cam.u, v0 = (my - H / 2) / P() + cam.v;
    cam.z *= f; clampCam(); cam.u = u0 - (mx - W / 2) / P(); cam.v = v0 - (my - H / 2) / P(); clampCam();
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect(); W = cv.width = Math.round(r.width * DPR); H = cv.height = Math.round(r.height * DPR);
  }
  const ptrs = new Map(); let drag = null, pinch = null;
  cv.addEventListener('pointerdown', e => { UI.camTo = null; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX * DPR, e.offsetY * DPR]);
    // right (2) or middle (1) button = pan only, never selects a tile
    if (ptrs.size === 1) { const m = e.pointerType === 'mouse'; drag = { x: e.offsetX * DPR, y: e.offsetY * DPR, moved: 0, rot: m && e.button === 2, pan: m && e.button !== 0, acc: 0 };
      if (drag.pan) { e.preventDefault(); cv.classList.add(drag.rot ? 'rotating' : 'panning'); }
      if (drag.rot) UI.stick = { ax: drag.x, ay: drag.y, x: drag.x, y: drag.y }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), my: (a[1] + b[1]) / 2, accA: 0, accT: 0, rot: false, tilt: false }; drag = null; } });
  cv.addEventListener('pointermove', e => {
    const p = [e.offsetX * DPR, e.offsetY * DPR];
    if (ptrs.has(e.pointerId)) {
      const old = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), my = (a[1] + b[1]) / 2;
        let dA = ang - pinch.ang; if (dA > Math.PI) dA -= 2 * Math.PI; if (dA < -Math.PI) dA += 2 * Math.PI;
        const dY = (my - pinch.my) / DPR;
        zoomAt(d / pinch.d, (a[0] + b[0]) / 2, my);
        // engage turn or tilt only after a clear intent, so a plain pinch doesn't wobble the view
        pinch.accA += dA; pinch.accT += dY;
        if (!pinch.rot && Math.abs(pinch.accA) > .14) pinch.rot = true;
        if (!pinch.tilt && !pinch.rot && Math.abs(pinch.accT) > 22 && Math.abs(d - pinch.d) < 6 * DPR) pinch.tilt = true;
        if (pinch.rot) { UI.yawTo = null; setYaw(UI.yaw + dA); }
        if (pinch.tilt) setView(UI.yaw, UI.tilt + dY * .006);
        pinch.d = d; pinch.ang = ang; pinch.my = my; }
      else if (drag && drag.rot) { if (UI.stick) { UI.stick.x = p[0]; UI.stick.y = p[1]; } }
      else if (drag) { cam.u -= (p[0] - old[0]) / P() * CAM_SPEED; cam.v -= (p[1] - old[1]) / P() * CAM_SPEED; clampCam(); drag.moved += Math.abs(p[0] - old[0]) + Math.abs(p[1] - old[1]); }
    } else UI.hover = pick(p[0], p[1]);
  });
  const endPtr = e => { ptrs.delete(e.pointerId);
    if (drag && !drag.pan && ptrs.size === 0 && drag.moved < 8 * DPR) clickTile(pick(e.offsetX * DPR, e.offsetY * DPR));
    if (ptrs.size < 2) pinch = null; if (!ptrs.size) { drag = null; UI.stick = null; cv.classList.remove('panning', 'rotating'); } };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; UI.stick = null; cv.classList.remove('panning', 'rotating'); });
  cv.addEventListener('contextmenu', e => e.preventDefault());       // keep the browser menu out of the way of right-drag
  cv.addEventListener('auxclick', e => e.preventDefault());          // no middle-click autoscroll
  cv.addEventListener('pointerleave', () => { UI.hover = -1; });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * .0015), e.offsetX * DPR, e.offsetY * DPR); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    const k = e.key, s = 40 / cam.z * CAM_SPEED;
    if (k === 'ArrowLeft' || k === 'a') cam.u -= s; else if (k === 'ArrowRight' || k === 'd') cam.u += s;
    else if (k === 'ArrowUp' || k === 'w') cam.v -= s / 2; else if (k === 'ArrowDown' || k === 's') cam.v += s / 2;
    else if (k === '+' || k === '=') zoomAt(1.2, W / 2, H / 2); else if (k === '-') zoomAt(1 / 1.2, W / 2, H / 2);
    else if (k === 'q' || k === 'Q') rotateView(-1); else if (k === 'e' || k === 'E') rotateView(1);
    else if (k === 'Escape') { if (UI.drawer) UI.drawer = null; else UI.sel = -1; dirty(); }
    else return; clampCam();
  });

  function primaryAction(i) {
    const T = T_(i), b = T.b;
    if (!T.o) return null;
    if (b && b.type === 'farm') {
      if (b.st === 'raw') return { a: 'till' };
      if (b.st === 'tilled') { const c = Object.keys(D.crops).find(k => count(D.crops[k].seed) > 0); return c ? { a: 'plant', p: c, f: UI.fert && count('fertilizer') > 0 } : null; }
      if (b.st === 'growing' && !b.wet) return { a: 'water' };
      if (b.st === 'ready') return { a: 'harvest' };
    }
    if (b && b.q && b.q.some(x => x.done)) return { a: 'collect' };
    if (!b && T.t === 'forest') return T.r.st === 'tree' ? { a: 'chop' } : T.r.st === 'stump' ? { a: 'replant' } : null;
    if (T.t === 'water') return { a: 'fish' };
    if (T.t === 'boulder') return { a: 'mine' };
    return null;
  }
  function clickTile(i) {
    if (i < 0) { UI.sel = -1; dirty(); return; }
    if (i !== UI.sel) frameTile(i);
    if (i === UI.sel) { const pa = primaryAction(i); if (pa) { const t = Object.assign({ i }, pa); const e = checkTask(t); if (e && !['load'].includes(t.a)) toast(esc(e), 'warn'); else queueTask(t); } }
    UI.sel = i; dirty();
  }

  /* ================= rendering ================= */
  function float(i, text, col) { UI.floats.push({ x: tx(i), y: ty(i), text, col, t: 0, off: UI.floats.filter(f => f.t < .4).length * 9 }); }
  // outline of a tile's (rotated) square on screen; pad insets it in sprite pixels
  function tilePoly(i, pad = 0) {
    const x = tx(i), y = ty(i), h = .5 - pad / 32; cx.beginPath();
    [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([a, b], k) => { const [sx, sy] = toScreen(x + a, y + b); k ? cx.lineTo(sx, sy) : cx.moveTo(sx, sy); });
    cx.closePath();
  }
  // draw a ground sprite's 32×16 top face mapped onto the rotated tile square (affine, so exact)
  function groundAt(i, img) {
    const [cxs, cys] = toScreen(tx(i), ty(i)), k = 1.035; // slight overdraw hides seams
    const E = UI.ex, F = UI.ey;
    const a = (E[0] - F[0]) / 32 * k, b = (E[1] - F[1]) / 32 * k, c = (E[0] + F[0]) / 16 * k, d = (E[1] + F[1]) / 16 * k;
    cx.setTransform(a, b, c, d, cxs - 16 * a - 8 * c, cys - 16 * b - 8 * d);
    cx.save(); cx.beginPath(); cx.moveTo(16, -.6); cx.lineTo(32.8, 8); cx.lineTo(16, 16.6); cx.lineTo(-.8, 8); cx.closePath(); cx.clip(); // top face only, no side pixels
    cx.drawImage(img, 0, 0, 32, 16, 0, 0, 32, 16); cx.restore(); cx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function blit(img, sx, sy, p, ax, ay, alpha) { if (alpha !== undefined) cx.globalAlpha = alpha; cx.drawImage(img, Math.round(sx - ax * p), Math.round(sy - ay * p), Math.round(img.width * p), Math.round(img.height * p)); cx.globalAlpha = 1; }
  function bar(sx, sy, p, frac, col) { const w = 18 * p, h = 2.5 * p; cx.fillStyle = 'rgba(30,18,12,.75)'; cx.fillRect(sx - w / 2 - p, sy - p, w + 2 * p, h + 2 * p); cx.fillStyle = col; cx.fillRect(sx - w / 2, sy, w * Math.min(1, frac), h); }
  function bubble(sx, sy, p, iconImg, txt) {
    cx.fillStyle = '#fff6e0'; cx.strokeStyle = '#3d2617'; cx.lineWidth = p * .8;
    const s = 12 * p; cx.beginPath(); cx.rect(sx - s / 2, sy - s, s, s); cx.fill(); cx.stroke();
    cx.beginPath(); cx.moveTo(sx - 2 * p, sy); cx.lineTo(sx, sy + 3 * p); cx.lineTo(sx + 2 * p, sy); cx.fill();
    if (iconImg) cx.drawImage(iconImg, sx - 5 * p, sy - s + p, 10 * p, 10 * p);
    else { // water drop
      const rows = [[0, 1], [-1, 3], [-1, 3], [-2, 5], [-2, 5], [-2, 5], [-1, 3]];
      rows.forEach(([o, w], k) => { cx.fillStyle = '#3a8cc4'; cx.fillRect(sx + o * p - p / 2, sy - s + (2 + k) * p, w * p, p); });
      cx.fillStyle = '#bfe6f8'; cx.fillRect(sx - 1.5 * p, sy - s + 6 * p, p, p); }
  }
  function groundKey(T) {
    const b = T.b;
    if (b && b.type === 'farm') return b.st === 'raw' ? 'farm_raw' : (b.st === 'growing' && b.wet) ? 'farm_wet' : 'farm_tilled';
    if (T.t === 'water') return 'water:' + ((((S.time * 1.2) | 0) + T.v) % 3);
    return T.t + ':' + T.v;
  }
  function draw() {
    const p = P(), now = S.time;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#1e3a30'; cx.fillRect(0, 0, W, H);
    const order = []; for (let i = 0; i < S.tiles.length; i++) order.push(i);
    const vd = S.tiles.map((_, i) => view(tx(i), ty(i)));
    order.sort((a, b) => (vd[a][0] + vd[a][1]) - (vd[b][0] + vd[b][1]) || vd[a][0] - vd[b][0]);
    const frontier = new Set(); S.tiles.forEach((T, i) => { if (!T.o && nbrs(i).some(n => S.tiles[n].o)) frontier.add(i); });
    // screen step for one tile along world x and world y at the current angle
    { const o = toScreen(0, 0), ax = toScreen(1, 0), ay = toScreen(0, 1); UI.ex = [ax[0] - o[0], ax[1] - o[1]]; UI.ey = [ay[0] - o[0], ay[1] - o[1]]; }
    // the map's earthen sides, drawn under the tops along its outer edges
    const skirt = 4 * p;
    for (const i of order) { const x = tx(i), y = ty(i);
      N4.forEach(([dx, dy]) => { if (inB(x + dx, y + dy)) return;
        if (dx * UI.ex[1] + dy * UI.ey[1] <= .01) return; // only edges facing the viewer show a side
        const c1 = toScreen(x + .5 * dx - .5 * dy, y + .5 * dy + .5 * dx), c2 = toScreen(x + .5 * dx + .5 * dy, y + .5 * dy - .5 * dx);
        const water = S.tiles[i].t === 'water', lit = (c2[0] - c1[0]) * (c2[1] - c1[1]) > 0;
        cx.fillStyle = water ? (lit ? '#2f6f9a' : '#265c80') : (lit ? '#8a5a32' : '#6e4425');
        cx.beginPath(); cx.moveTo(c1[0], c1[1]); cx.lineTo(c2[0], c2[1]); cx.lineTo(c2[0], c2[1] + skirt); cx.lineTo(c1[0], c1[1] + skirt); cx.closePath(); cx.fill(); }); }
    // ground layer
    for (const i of order) {
      const T = S.tiles[i], [sx, sy] = toScreen(tx(i), ty(i));
      if (sx < -40 * p || sx > W + 40 * p || sy < -40 * p || sy > H + 60 * p) continue;
      groundAt(i, ART.get(groundKey(T)));
      if (!T.o) { tilePoly(i); cx.fillStyle = frontier.has(i) ? 'rgba(28,16,36,.22)' : 'rgba(22,12,30,.5)'; cx.fill(); }
    }
    // frontier hints
    const pulse = .5 + .5 * Math.sin(now * 3);
    frontier.forEach(i => { tilePoly(i, 1.5);
      cx.setLineDash([3 * p, 2 * p]); cx.strokeStyle = `rgba(246,226,122,${.35 + .4 * pulse})`; cx.lineWidth = p * .7; cx.stroke(); cx.setLineDash([]); });
    // hover & selection
    if (UI.hover >= 0 && UI.hover !== UI.sel) { tilePoly(UI.hover); cx.strokeStyle = 'rgba(255,255,255,.45)'; cx.lineWidth = p * .8; cx.stroke(); }
    if (UI.sel >= 0 && S.tiles[UI.sel].b && D.buildings[S.tiles[UI.sel].b.type].kind === 'sprinkler') around(UI.sel, D.buildings[S.tiles[UI.sel].b.type].radius).forEach(j => { if (j === UI.sel) return; tilePoly(j, 1); cx.fillStyle = 'rgba(143,211,239,.18)'; cx.fill(); });
    if (UI.sel >= 0) { tilePoly(UI.sel); cx.strokeStyle = '#f6e27a'; cx.lineWidth = p * 1.2; cx.stroke(); }
    // task target markers
    [S.cur, ...S.queue].forEach((t, k) => { if (!t) return; tilePoly(t.i, 3); cx.strokeStyle = k ? 'rgba(143,211,239,.55)' : 'rgba(143,211,239,.9)'; cx.lineWidth = p * .7; cx.stroke(); });
    // objects + avatar, depth sorted
    const actors = [{ A: S.av, cur: S.cur, shirt: S.shirt, hat: S.hat }];
    if (S.helper) actors.push({ A: S.helper, cur: S.helper.cur, shirt: 2, hat: 1, tag: 'Farmhand' });
    actors.forEach(a => { const v = view(a.A.x, a.A.y); a.d = v[0] + v[1] + .5; }); actors.sort((m, n) => m.d - n.d); let ai = 0;
    const drawAv = ({ A, cur, shirt, hat, tag }) => {
      const [sx, sy] = toScreen(A.x, A.y), walking = cur && cur.ph === 'walk' && A.path.length, working = cur && cur.ph === 'work';
      const f = walking ? ((now * 8) | 0) % 2 : working ? ((now * 5) | 0) % 2 : 0;
      const img = ART.get(`avatar:${shirt}.${hat}.${f}.${working ? f : 0}`);
      cx.save(); cx.translate(sx, 0); const fd = turn(...(A.dir || [1, -1]), UI.yaw); cx.scale(fd[0] - fd[1] < 0 ? -1 : 1, 1); blit(img, 0, sy - (walking ? (f ? p : 0) : 0), p, 6, 19); cx.restore();
      if (working) bar(sx, sy - 23 * p, p, cur.t / cur.dur, tag ? '#b8f08a' : '#8fd3ef');
      if (tag && UI.sel >= 0 && S.tiles[UI.sel].b && S.tiles[UI.sel].b.type === 'homestead') { cx.font = `600 ${5 * p}px "Lexend", system-ui, sans-serif`; cx.textAlign = 'center'; cx.fillStyle = '#fff6e0'; cx.fillText(tag, sx, sy - 26 * p); }
    };
    for (const i of order) {
      const x = tx(i), y = ty(i);
      while (ai < actors.length && vd[i][0] + vd[i][1] > actors[ai].d) drawAv(actors[ai++]);
      const T = S.tiles[i], b = T.b, [sx, sy] = toScreen(x, y);
      if (sx < -40 * p || sx > W + 40 * p || sy < -60 * p || sy > H + 60 * p) continue;
      const a = T.o ? 1 : .72;
      if (b) {
        if (b.type === 'farm') {
          if (b.st === 'growing' || b.st === 'ready') { const st = b.st === 'ready' ? 2 : b.g < D.crops[b.crop].grow / 2 ? 0 : 1; blit(ART.get(`crop:${b.crop}.${st}`), sx, sy, p, 16, 16); }
          if (b.st === 'growing') { bar(sx, sy + 5 * p, p, b.g / D.crops[b.crop].grow, '#7cc04b'); if (!b.wet) bubble(sx, sy - 10 * p, p, null); }
          if (b.st === 'ready') bubble(sx, sy - 12 * p, p, ART.iconCanvas(D.crops[b.crop].item, D.items));
        } else {
          let key = b.type; const active = b.q && b.q.some(j => !j.done);
          if (b.type === 'stove' && active) key = 'stove_on';
          if (b.type === 'mill' || b.type === 'sawmill') key += ':' + (active ? ((now * 4) | 0) % 2 : 0);
          if (D.buildings[b.type].kind === 'sprinkler') key = (b.type === 'big_sprinkler' ? 'big_sprinkler:' : 'sprinkler:') + (b.fx > 0 ? ((now * 6) | 0) % 2 : 0);
          const img = ART.get(key); blit(img, sx, sy, p, 16, img.height - 4);
          if (b.q) { const j = b.q.find(j => !j.done), dn = b.q.find(j => j.done);
            if (dn) bubble(sx, sy - (img.height - 2) * p, p, ART.iconCanvas(Object.keys(D.recipes[dn.r].out)[0], D.items));
            if (j) bar(sx, sy + 3 * p, p, j.t / j.dur, '#f0a030');
            if (['stove', 'kiln', 'oven', 'smokehouse', 'smelter'].includes(b.type) && active && Math.random() < .08) UI.parts.push({ x: sx + 5 * p, y: sy - 26 * p, t: 0, vx: (Math.random() - .5) * p * 4 }); }
        }
      } else if (T.r) {
        if (T.t === 'forest') { const img = ART.get(T.r.st); blit(img, sx, sy, p, 16, img.height - 4, a);
          if (T.r.st === 'sapling' && T.o) bar(sx, sy + 4 * p, p, T.r.g / D.gather.forest.regrow, '#7cc04b'); }
        else if (T.t === 'boulder') { const img = ART.get('rocks:' + T.r.stock); blit(img, sx, sy, p, 16, img.height - 4, a); }
        else if (T.t === 'water' && T.v === 1) blit(ART.get('reeds'), sx, sy, p, 16, 16, a);
      }
    }
    while (ai < actors.length) drawAv(actors[ai++]);
    // particles
    UI.parts.forEach(q => { cx.fillStyle = `rgba(230,230,235,${.6 * (1 - q.t)})`; cx.fillRect(q.x + q.vx * q.t * 4, q.y - q.t * 18 * p, 2 * p * (1 + q.t), 2 * p * (1 + q.t)); });
    // dusk tint
    const hr = hour(); if (hr > 18) { cx.fillStyle = `rgba(70,30,100,${Math.min(.28, (hr - 18) / 4 * .28)})`; cx.fillRect(0, 0, W, H); }
    // floating text
    cx.textAlign = 'center'; cx.font = `600 ${6 * p}px "Lexend", system-ui, sans-serif`;
    UI.floats.forEach(f => { const [sx, sy] = toScreen(f.x, f.y); const yy = sy - 18 * p - f.t * 14 * p - f.off * p;
      cx.globalAlpha = Math.min(1, 2.2 - f.t * 1.4); cx.fillStyle = '#2a1a12'; cx.fillText(f.text, sx + .6 * p, yy + .6 * p); cx.fillStyle = f.col; cx.fillText(f.text, sx, yy); cx.globalAlpha = 1; });
  }
  const hour = () => 6 + ((S.time % C.dayLength) / C.dayLength) * 16;
  function clock() { const h = hour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10; return `${hh}:${String(mm).padStart(2, '0')}`; }

  /* ================= UI ================= */
  function dirty() { UI.dirty = true; }
  function toast(html, kind = 'info') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = html;
    const box = $('#toasts'); box.prepend(el); while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'warn' ? 3200 : 5200);
  }
  const ico = (id, cls = '') => `<img class="ico ${cls}" src="${ART.icon(id, D.items)}" alt="">`;
  const qtag = q => q ? `<span class="q q${q}">${QN[q]}</span>` : '';
  function setHTML(sel, html) {
    if (UI.html[sel] === html) return; const el = $(sel), a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'number')) && el.contains(a)) return; // don't yank a field mid-typing
    UI.html[sel] = html; el.innerHTML = isTouch() ? html.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : html;
  }
  function btn(t, label, opts = {}) {
    const e = opts.err !== undefined ? opts.err : checkTask(t);
    const data = Object.entries(t).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<button class="btn ${opts.cls || ''}" data-task ${data} ${e ? 'disabled' : ''}>${label}${e ? `<small>${esc(e)}</small>` : opts.sub ? `<small>${opts.sub}</small>` : ''}</button>`;
  }
  const pbar = (key, cls = '') => `<div class="pb ${cls}"><i data-prog="${key}"></i></div>`;

  function renderTop() {
    const canUnlock = D.discoveries.some(d => !unlocked(d.id) && d.req.every(unlocked) && S.dp >= d.cost);
    const status = paused() ? 'Paused' : S.cur ? `${S.cur.ph === 'walk' ? 'Walking to' : 'Working:'} ${esc(TASKS[S.cur.a].label(S.cur))}` : 'Idle';
    setHTML('#stats', `
      <div class="stat" title="Gold"><span class="coin"></span><b>${S.gold}</b></div>
      <div class="stat score" title="Score"><span class="lbl">Score</span><b>${S.score}</b></div>
      <button class="stat disc ${canUnlock ? 'ping' : ''}" data-drawer="disc" title="Spend Discovery"><span class="lbl"><span class="lg">Discovery</span><span class="sm">DP</span></span><b>${S.dp}</b></button>
      <button class="stat store" data-drawer="inv" title="Storage"><span class="lbl"><span class="lg">Storage</span><span class="sm">Store</span></span><b>${used()}/${cap()}</b></button>
      <div class="stat time"><span class="lbl"><span class="lg">Day ${S.day}</span><span class="sm">D${S.day}</span></span><b>${clock()}</b></div>
      ${S.goalMin ? (() => { const g = D.goals[S.goal], m = D.milestones[S.ms], t = g ? g.title : m ? m.name : 'All done';
        return `<button class="stat goalbtn" data-goal-restore title="${g ? 'Goal' : 'Contract'}: ${esc(t)}" aria-label="Show ${g ? 'goal' : 'contract'}: ${esc(t)}"><span class="lbl">${g ? 'Goal' : 'Contract'}</span><b>${esc(t)}</b></button>`; })() : ''}
      <div class="status">${status}</div>`);
  }
  // The goal / contract card: full, title only, or minimized into a button in the top bar.
  function renderGoals() {
    const g = D.goals[S.goal], m = D.milestones[S.ms];
    const eyebrow = g ? `Goal ${S.goal + 1} of ${D.goals.length}` : 'Next contract';
    const title = g ? g.title : m ? m.name : 'All contracts complete';
    const el = $('#goals'); el.hidden = !!S.goalMin;
    if (S.goalMin) { UI.html['#goals'] = ''; return; }
    const ctl = `<span class="gctl"><button class="gbtn" data-toggle-goals aria-label="${UI.goalsOpen ? 'Show title only' : 'Show details'}" title="${UI.goalsOpen ? 'Show title only' : 'Show details'}">${UI.goalsOpen ? '–' : '+'}</button><button class="gbtn" data-goal-min aria-label="Minimize" title="Minimize">×</button></span>`;
    let body = '';
    if (UI.goalsOpen) body = g ? `<p>${esc(g.hint)}</p><div class="steps">${D.goals.map((_, k) => `<i class="${k < S.goal ? 'on' : k === S.goal ? 'now' : ''}"></i>`).join('')}</div>`
      : m ? `<div class="gneeds">${m.need.map(([id, n, q]) => { const have = count(id, q), ok = have >= n;
            return `<div class="gneed ${ok ? 'ok' : ''}">${ico(id)}<span>${esc(D.items[id].name)}${q ? ` <em>${QN[q]}+</em>` : ''}</span><b>${Math.min(have, n)}/${n}</b></div>`; }).join('')}</div>
          <p>${esc(m.hint)} Deliver at the Order Board.</p>${isComplex(m.need) ? `<button class="gtree" data-tree="ms">See everything it takes ▸</button>` : ''}`
        : `<p>Chase a higher score with Excellent goods and tuned stations.</p>`;
    setHTML('#goals', `<div class="goalhead"><span class="eyebrow">${eyebrow}</span>${ctl}</div><div class="goaltitle">${esc(title)}</div>${body}`);
  }
  function renderQueue() {
    const all = [S.cur, ...S.queue].filter(Boolean), F = S.helper;
    const fh = F ? `<div class="chip helper ${F.on ? '' : 'off'}"><span>Farmhand: ${!F.on ? 'paused' : !F.steps.length ? 'no jobs yet' : F.cur ? esc(TASKS[F.cur.a].label(F.cur)) : 'waiting for work'}</span>
      <button class="fhb" data-fh-toggle aria-label="${F.on ? 'Pause farmhand' : 'Start farmhand'}" title="${F.on ? 'Pause' : 'Start'}">${F.on ? '❚❚' : '▶'}</button>
      <button class="fhb spd" data-fh-speed aria-label="Farmhand speed ${F.spd || 1}×, tap to change" title="Speed">${F.spd || 1}×</button>${F.steps.length ? `<button class="fhb clr ${UI.fhClear ? 'arm' : ''}" data-fh-clear aria-label="${UI.fhClear ? 'Tap again to clear all farmhand jobs' : 'Clear all farmhand jobs'}" title="Clear all jobs">${UI.fhClear ? 'Clear all?' : 'Clear'}</button>` : ''}</div>` : '';
    setHTML('#queue', (all.length ? all.map((t, k) => `<div class="chip ${k === 0 && S.cur ? 'cur' : ''}"><span>${esc(TASKS[t.a].label(t))}</span>${k === 0 && S.cur ? pbar('task', 'thin') : `<button class="x" data-cancel="${t.id}" aria-label="Cancel">×</button>`}</div>`).join('') : `<div class="chip idle">Click a tile, then pick an action. Your farmer queues up to ${C.maxQueue} tasks.</div>`) + fh);
  }

  function needRow(need) {
    return need.map(([id, n, q]) => { const have = count(id, q), ok = have >= n, known = S.disc.includes(id);
      return `<div class="need ${ok ? 'ok' : ''}">${ico(id)}<span>${n}× ${esc(D.items[id].name)}${q ? ` <em>${QN[q]}+</em>` : ''}</span><b>${Math.min(have, n)}/${n}</b>${!known ? '<span class="new">new</span>' : ''}</div>`; }).join('');
  }
  /* production tree: what it takes to make something, all the way back to raw materials */
  const recipeFor = id => { const all = Object.entries(D.recipes).filter(([, R]) => R.out[id]); return (all.find(([, R]) => unlocked(R.requires)) || all[0] || [null])[0]; };
  const hasStation = type => S.tiles.some(t => t.b && t.b.type === type);
  function sourceOf(id) { // where a raw material comes from
    const crop = Object.values(D.crops).find(c => c.item === id);
    if (crop) { const sd = D.items[crop.seed], need = sd.requires && !unlocked(sd.requires) ? D.discoveries.find(d => d.id === sd.requires).name : null;
      return need ? `Grow ${crop.name.toLowerCase()} · unlock “${need}” first` : `Grow ${crop.name.toLowerCase()} on a farm plot (${sd.name.toLowerCase()} at the market)`; }
    for (const [ter, G] of Object.entries(D.gather)) if (G.out[id] || (id === 'copper_ore' && ter === 'boulder')) {
      const req = id === 'copper_ore' ? 'prospecting' : G.needs, name = D.terrain[ter].name;
      return unlocked(req) ? `Gather from a ${name}` : `Gather from a ${name} · unlock “${D.discoveries.find(d => d.id === req).name}” first`; }
    if (D.items[id].buy) return `Buy at the Open Market (${buyPrice(id)}g each)`;
    return 'Raw material';
  }
  function tree(id, n, minQ = 0, seen = []) {
    const have = count(id, minQ), short = Math.max(0, n - have), node = { id, n, have, short, minQ, kids: [] };
    const rid = recipeFor(id); if (!rid || seen.includes(id)) { node.src = sourceOf(id); return node; }
    const R = D.recipes[rid]; node.rid = rid; node.station = R.station;
    node.batches = Math.ceil(short / R.out[id]);
    if (R.requires && !unlocked(R.requires)) node.lock = `Unlock “${D.discoveries.find(d => d.id === R.requires).name}”`;
    else if (!hasStation(R.station)) node.lock = `Build a ${D.buildings[R.station].name}`;
    // Quality: crops and made goods can carry it up; gathered goods are always Basic, so the station must add it.
    const canQ = k => D.items[k].cat !== 'gathered';
    const ins = Object.keys(R.in);
    if (minQ && (!ins.length || ins.some(k => !canQ(k)))) node.qnote = `For ${QN[minQ]} quality, give the ${D.buildings[R.station].name} a Quality upgrade${ins.some(canQ) ? `, or use ${QN[minQ]} ingredients where you can` : ''}.`;
    for (const [k, per] of Object.entries(R.in)) node.kids.push(tree(k, per * node.batches, canQ(k) ? minQ : 0, seen.concat(id)));
    return node;
  }
  function leaves(node, acc = {}) { if (!node.kids.length && node.rid === undefined) { if (node.short) acc[node.id] = (acc[node.id] || 0) + node.short; } else node.kids.forEach(k => leaves(k, acc)); return acc; }
  function treeHTML(node) {
    const ok = node.short === 0, name = esc(D.items[node.id].name);
    let line = `<div class="tnode ${ok ? 'ok' : ''}">${ico(node.id)}<div class="grow1"><b>${node.n}× ${name}</b>${node.minQ ? ` <em class="qmin">${QN[node.minQ]}+</em>` : ''}<small>have ${node.have}${ok ? ' ✓' : ` · need ${node.short} more`}</small>`;
    if (!ok && node.rid) line += `<small class="how">${node.batches} batch${node.batches === 1 ? '' : 'es'} at the ${esc(D.buildings[node.station].name)}${node.lock ? ` · <span class="lock">${esc(node.lock)}</span>` : ''}</small>${node.qnote ? `<small class="qn">${esc(node.qnote)}</small>` : ''}`;
    if (!ok && node.src) line += `<small class="how">${esc(node.src)}</small>`;
    line += `</div></div>`;
    const kids = !ok && node.kids.length ? `<ul>${node.kids.map(k => `<li>${treeHTML(k)}</li>`).join('')}</ul>` : '';
    return line + kids;
  }
  const isComplex = need => need.some(([id]) => recipeFor(id));

  /* categories */
  const groupOf = id => { const it = D.items[id]; return (D.itemGroups.find(g => g.items && g.items.includes(id)) || D.itemGroups.find(g => g.cats && g.cats.includes(it.cat)) || D.itemGroups[D.itemGroups.length - 1]).id; };
  const groupName = gid => D.itemGroups.find(g => g.id === gid).name;
  // filter chips: only categories that have something in them, with counts
  function chips(kind, counts, extra = []) {
    const cur = UI.cat[kind], opts = [['all', 'All', null], ...extra, ...counts];
    if (!opts.some(o => o[0] === cur)) UI.cat[kind] = 'all';
    return `<div class="chips" role="group" aria-label="Filter by category">${opts.map(([id, name, n]) => `<button class="chipf ${UI.cat[kind] === id ? 'on' : ''}" data-cat="${kind}:${id}" aria-pressed="${UI.cat[kind] === id}">${esc(name)}${n != null ? `<span>${n}</span>` : ''}</button>`).join('')}</div>`;
  }
  // render ids grouped under category headings, honouring the active chip
  function grouped(ids, kind, row, wrap) {
    const by = {}; ids.forEach(id => (by[groupOf(id)] = by[groupOf(id)] || []).push(id));
    const sel = kind ? UI.cat[kind] : 'all';
    return D.itemGroups.filter(g => by[g.id] && (sel === 'all' || sel === g.id))
      .map(g => `<div class="grp"><span class="eyebrow">${esc(g.name)}</span>${wrap ? `<div class="${wrap}">` : ''}${by[g.id].map(row).join('')}${wrap ? '</div>' : ''}</div>`).join('');
  }
  const groupCounts = (ids, weigh = () => 1) => { const c = {}; ids.forEach(id => { const g = groupOf(id); c[g] = (c[g] || 0) + weigh(id); }); return D.itemGroups.filter(g => c[g.id]).map(g => [g.id, g.name, c[g.id]]); };
  function head(title, sub) { return `<div class="phead"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="close" data-close aria-label="Close">×</button></div>`; }

  function fhControl(i, kind) {
    const F = S.helper; if (!F) return '';
    const has = F.steps.some(st => st.i === i);
    let h = `<span class="eyebrow">Farmhand</span>`;
    if (has) return h + `<p class="hint">Your farmhand works here. Edit the routine at the Homestead.</p>`;
    if (F.steps.length >= fhMax()) return h + `<p class="hint">The routine is full (${fhMax()} jobs). Remove one at the Homestead.</p>`;
    if (kind === 'tend') { const crops = Object.keys(D.crops).filter(k => unlocked(D.items[D.crops[k].seed].requires));
      const b = T_(i).b, cur = crops.includes(UI.hcrop) ? UI.hcrop : (b.last && crops.includes(b.last) ? b.last : crops[0]);
      return h + `<div class="fhrow"><select id="hcrop" aria-label="Crop for the farmhand">${crops.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(D.crops[k].name)}</option>`).join('')}</select><button class="btn ghost sm" data-fh-add="tend" data-i="${i}">Add to farmhand</button></div><small class="why">They till, plant, water and harvest this plot. Seeds come from storage.</small>`; }
    if (kind === 'station') { const recs = Object.keys(D.recipes).filter(r => D.recipes[r].station === T_(i).b.type && unlocked(D.recipes[r].requires));
      const cur = recs.includes(UI.hrec) ? UI.hrec : (T_(i).b.rep && recs.includes(T_(i).b.rep) ? T_(i).b.rep : recs[0]);
      return h + `<div class="fhrow"><select id="hrec" aria-label="Recipe for the farmhand">${recs.map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${esc(D.items[Object.keys(D.recipes[r].out)[0]].name)}</option>`).join('')}</select><button class="btn ghost sm" data-fh-add="station" data-i="${i}">Add to farmhand</button></div><small class="why">They collect finished goods and load this recipe.</small>`; }
    return h + `<button class="btn ghost" data-fh-add="${kind}" data-i="${i}">Add to farmhand</button>`;
  }
  function farmPanel(i, b) {
    let h = head('Farm Plot', 'Till → plant → water → harvest. Re-till after each harvest.');
    if (b.st === 'raw') h += `<p class="state">Untilled soil.</p>` + btn({ a: 'till', i }, 'Till soil', { cls: 'pri' }) + btn({ a: 'clearplot', i }, 'Clear plot', { cls: 'ghost', sub: 'Turns it back into grass you can build on. No refund.' });
    else if (b.st === 'tilled') {
      h += `<p class="state">Tilled and ready for seeds.</p>`;
      if (unlocked('compost')) h += `<label class="check"><input type="checkbox" id="fert" ${UI.fert ? 'checked' : ''}> Use fertilizer (${count('fertilizer')} in storage) · grows faster, +1 quality</label>`;
      const seeds = Object.keys(D.crops).filter(k => count(D.crops[k].seed) > 0);
      h += seeds.length ? `<div class="grid2">${seeds.map(k => btn({ a: 'plant', i, p: k, f: UI.fert ? 1 : 0 }, `${ico(D.crops[k].seed)} Plant ${D.crops[k].name}`, { sub: `${count(D.crops[k].seed)} seeds · ${D.crops[k].grow}s` })).join('')}</div>`
        : `<p class="hint">No seeds. Buy some at the Open Market.</p>`;
    } else {
      const cr = D.crops[b.crop];
      h += `<div class="row">${ico(cr.item)}<div class="grow1"><b>${esc(cr.name)}</b> ${b.st === 'ready' ? '· ready' : `· ${b.wet ? 'soil is wet' : '<span class="warn">needs water</span>'}`}${b.st === 'growing' ? pbar('f:' + i) : ''}</div></div>`;
      const q = Math.min(2, (b.w[0] && b.w[1] ? 1 : 0) + (b.fert ? 1 : 0));
      h += `<p class="hint">Quality: watered early ${b.w[0] ? '✓' : '—'} · watered late ${b.w[1] ? '✓' : '—'}${b.fert ? ' · fertilized ✓' : ''} → <b>${b.st === 'ready' ? QN[q] : 'aiming ' + QN[Math.min(2, (b.w[0] && (b.w[1] || !b.half) ? 1 : 0) + (b.fert ? 1 : 0))]}</b></p>`;
      if (b.st === 'growing') h += btn({ a: 'water', i }, 'Water', { cls: 'pri', sub: b.half ? 'Second watering: Good quality' : 'Wet soil grows 2× faster' });
      if (b.st === 'growing' && !b.fert && (unlocked('compost') || count('fertilizer') > 0)) h += btn({ a: 'fertilize', i }, 'Add fertilizer', { sub: `Grows ${Math.round((C.fertGrowth - 1) * 100)}% faster · +1 quality · ${count('fertilizer')} in storage` });
      else h += btn({ a: 'harvest', i }, `Harvest ${cr.yield} ${esc(D.items[cr.item].name)}`, { cls: 'pri' });
    }
    return h + fhControl(i, 'tend') + `<p class="tip">Tip: click a selected tile again to repeat its main action.</p>`;
  }
  function stationPanel(i, b) {
    const B = D.buildings[b.type], slots = stationSlots(b);
    let h = head(B.name, esc(B.desc));
    h += `<div class="slots"><span class="eyebrow">Batches ${b.q.length}/${slots}</span>`;
    const SHOW = 4, more = b.q.length - SHOW;
    h += b.q.length ? b.q.slice(0, SHOW).map((j, k) => { const out = Object.keys(D.recipes[j.r].out)[0];
      return `<div class="row">${ico(out)}<div class="grow1"><b>${esc(D.items[out].name)}</b> ${qtag(j.qual)} ${j.done ? '<span class="ok">· ready</span>' : k === b.q.findIndex(x => !x.done) ? '' : '<span class="muted">· waiting</span>'}${j.done ? '' : pbar(`s:${i}:${k}`)}</div></div>`; }).join('')
        + (more > 0 ? `<p class="hint">+${more} more batch${more === 1 ? '' : 'es'} queued (${b.q.filter(j => j.done).length} ready in total).</p>` : '')
      : `<p class="hint">Empty. Load a recipe below; ingredients come from storage.</p>`;
    if (b.q.some(j => j.done)) h += btn({ a: 'collect', i }, 'Collect finished goods', { cls: 'pri' });
    if (unlocked('autocollect')) h += `<button class="toggle ${b.auto ? 'on' : ''}" data-auto="${i}" aria-pressed="${!!b.auto}"><i></i>Auto-collect finished goods into storage</button>`;
    h += `</div><span class="eyebrow">Recipes</span>`;
    if (unlocked('repeat')) h += `<p class="hint">Repeat keeps one recipe loaded whenever a slot is free and the ingredients are in storage.</p>`;
    const recs = Object.entries(D.recipes).filter(([, R]) => R.station === b.type);
    h += recs.map(([id, R]) => {
      if (!unlocked(R.requires)) { const d = D.discoveries.find(d => d.id === R.requires); return `<div class="recipe locked"><span>${ico(Object.keys(R.out)[0], 'dim')} ${esc(D.items[Object.keys(R.out)[0]].name)}</span><small>Unlock “${esc(d.name)}” in Discovery</small></div>`; }
      const ins = Object.entries(R.in).map(([k, n]) => `<span class="in ${count(k) >= n ? '' : 'short'}">${ico(k)}${n}<small>(${count(k)})</small></span>`).join('<span class="plus">+</span>');
      const outs = Object.entries(R.out).map(([k, n]) => `${ico(k)}${n > 1 ? n : ''}`).join('');
      const le = checkTask({ a: 'load', i, p: id });
      return `<div class="recipe"><div class="grow1"><b class="rname">${esc(D.items[Object.keys(R.out)[0]].name)}</b><div class="formula">${ins}<span class="arrow">→</span>${outs}<span class="muted">${Math.round(R.time * D.upgrades.speed.effect[b.lv.speed])}s</span></div>${le ? `<small class="why">${esc(le)}</small>` : ''}${unlocked('repeat') ? `<button class="toggle sm ${b.rep === id ? 'on' : ''}" data-rep="${i}:${id}" aria-pressed="${b.rep === id}"><i></i>Repeat</button>` : ''}</div><div class="ldb">${btn({ a: 'load', i, p: id }, 'Load', { err: le })}${(() => { const n = fillCount(i, id); return n > 1 ? btn({ a: 'load', i, p: id, n }, `Fill ×${n}`, { cls: 'ghost' }) : ''; })()}</div></div>`;
    }).join('');
    h += `<span class="eyebrow">Upgrades</span>`;
    if (!unlocked('tuning')) h += `<p class="hint">Unlock “Station Tuning” in Discovery to improve speed, capacity and quality.</p>`;
    else h += Object.entries(D.upgrades).map(([ax, U]) => { const l = b.lv[ax], max = l >= U.cost.length;
      const e = max ? null : checkTask({ a: 'upgrade', i, p: ax });
      return `<div class="recipe"><div class="grow1"><b class="rname">${U.name} <span class="muted">· now ${U.label(l)}</span></b>${max ? '<small class="why">Fully upgraded</small>' : `<small class="cost">Next: ${U.label(l + 1)} · Cost: ${costTxt(U.cost[l])}</small>${e ? `<small class="why short">${esc(e)}</small>` : ''}`}</div>${max ? '<span class="muted">Max</span>' : btn({ a: 'upgrade', i, p: ax }, 'Upgrade', { err: e })}</div>`; }).join('');
    return h + fhControl(i, 'station');
  }
  function homePanel(i) {
    let h = head(`${S.name}’s Homestead`, esc(D.buildings.homestead.desc));
    h += `<div class="row"><div class="grow1"><span class="eyebrow">Storage</span><div class="pb"><i style="width:${Math.round(used() / cap() * 100)}%"></i></div><small>${used()} of ${cap()} items</small></div></div>`;
    const ex = extraCap(), nb = S.tiles.filter(t => t.b && D.buildings[t.b.type] && D.buildings[t.b.type].kind === 'storage').length;
    h += `<p class="hint">Homestead ${homeCap(S.home)}${ex ? ` + ${nb} storage building${nb === 1 ? '' : 's'} ${ex}` : ''}. Expand the Homestead below, or build Storage Barns from the Open Market for more room.</p>`;
    h += btn({ a: 'homeup', i }, `Expand Homestead storage: ${homeCap(S.home)} → ${homeCap(S.home + 1)}`, { sub: costTxt(homeCost(S.home)) });
    h += `<button class="btn ghost" data-drawer="inv">Open inventory</button>`;
    h += `<span class="eyebrow">Your farmer</span><label class="field">Name <input id="pname" maxlength="14" value="${esc(S.name)}"></label>
      <div class="swatches"><span>Shirt</span>${ART.SHIRTS.map((c, k) => `<button class="sw ${S.shirt === k ? 'on' : ''}" style="background:${c}" data-shirt="${k}" aria-label="Shirt colour ${k + 1}"></button>`).join('')}</div>
      <div class="swatches"><span>Hat</span>${ART.HATS.map((c, k) => `<button class="sw ${S.hat === k ? 'on' : ''}" style="background:${c}" data-hat="${k}" aria-label="Hat colour ${k + 1}"></button>`).join('')}</div>`;
    h += `<span class="eyebrow">Tools</span>`;
    if (!unlocked('tools')) h += `<p class="hint">Unlock “Toolsmithing” in Discovery to upgrade your tools.</p>`;
    h += Object.entries(D.tools).map(([k, T]) => { const l = toolLv(k), max = l >= T.cost.length;
      const e = max || !unlocked('tools') ? null : checkTask({ a: 'toolup', i, p: k });
      return `<div class="recipe"><div class="grow1"><b class="rname">${T.tiers[l]} ${esc(T.name)}</b><small class="why">${esc(T.desc[l])}${max ? '' : ` Next: ${esc(T.desc[l + 1])}`}</small>${max ? '' : `<small class="cost">Cost: ${costTxt(T.cost[l])}</small>`}${e ? `<small class="why short">${esc(e)}</small>` : ''}</div>${max ? '<span class="muted">Max</span>' : unlocked('tools') ? btn({ a: 'toolup', i, p: k }, 'Upgrade', { err: e }) : ''}</div>`; }).join('');
    h += `<span class="eyebrow">Farmhand</span>`;
    const F = S.helper;
    if (!unlocked('farmhand')) h += `<p class="hint">Unlock “Farmhand” in Discovery (after Repeat Recipes) to hire help.</p>`;
    else if (!F) h += btn({ a: 'hire', i }, 'Hire a farmhand', { cls: 'pri', sub: `${costTxt(D.farmhand.hire)} · works a loop of up to ${fhMax()} jobs` });
    else {
      h += `<button class="toggle ${F.on ? 'on' : ''}" data-fh-toggle aria-pressed="${F.on}"><i></i>${F.on ? 'Working' : 'Paused'}</button>`;
      h += F.steps.length ? `<ol class="routine">${F.steps.map((st, k) => `<li class="${F.cur && F.cur.si === k ? 'now' : ''}"><button class="linkish" data-goto="${st.i}">${esc(stepLabel(st))}</button><button class="x" data-fh-del="${k}" aria-label="Remove job">×</button></li>`).join('')}</ol>`
        : `<p class="hint">No jobs yet. Select a farm plot, station, tree, pond or boulder field and choose “Add to farmhand”.</p>`;
      if (F.steps.length) h += `<button class="btn ${UI.fhClear ? 'danger' : 'ghost'}" data-fh-clear>${UI.fhClear ? 'Tap again to clear all ' + F.steps.length + ' jobs' : 'Clear all jobs'}</button>`;
      h += `<small class="why">They walk a little slower than you, skip jobs that have nothing to do, and never take a job you’ve queued yourself.</small>`;
    }
    return h;
  }
  function marketPanel(i) {
    const d = S.market.demand;
    let h = head('Open Market', 'Every trade sends your farmer to the stall.');
    h += `<p class="netline ${NET.ok ? 'on' : ''}">${NET.ok ? `<b>Shared valley prices</b> · ${NET.active} trader${NET.active === 1 ? '' : 's'} this hour · prices settle back over ~${NET.recov >= 1.5 ? Math.round(NET.recov) + 'h' : Math.max(1, Math.round(NET.recov * 60)) + ' min'} · updated ${Math.max(0, Math.round((Date.now() - NET.at) / 1000))}s ago` : NET.tried ? 'Shared prices unavailable here, so this market uses local prices.' : 'Connecting to the valley market…'}</p>`;
    if (d) h += `<div class="demand">${ico(d.item)}<span>Today: <b>${esc(D.items[d.item].name)}</b> sells for <b>+${d.pct}%</b></span></div>`;
    h += `<div class="tabs">${['buy', 'sell', 'stations'].map(t => `<button class="tab ${UI.mtab === t ? 'on' : ''}" data-mtab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`;
    if (UI.mtab === 'buy') {
      const list = Object.keys(D.items).filter(id => D.items[id].cat !== 'kit' && (D.items[id].buy ? unlocked(D.items[id].requires) : S.disc.includes(id) && SELLABLE.includes(D.items[id].cat)));
      h += chips('buy', groupCounts(list));
      h += grouped(list, 'buy', id => `<div class="trade">${ico(id)}<div class="grow1"><b>${esc(D.items[id].name)}</b><small>${buyPrice(id)}g each ${moveTag(id)} · have ${count(id)}</small>${useHint(id) ? `<small class="use">${esc(useHint(id))}</small>` : ''}</div>${btn({ a: 'buy', i, p: id, n: 1 }, '×1', { cls: 'sm' })}${btn({ a: 'buy', i, p: id, n: 5 }, '×5', { cls: 'sm' })}</div>`);
      h += `<p class="hint">Any good you've made at least once is sold here too, at about ${RESALE}× its normal value, always Normal quality. Every purchase nudges the price up for everyone; every sale nudges it down.</p>`;
      const locked = Object.keys(D.items).filter(id => D.items[id].buy && D.items[id].cat !== 'kit' && !unlocked(D.items[id].requires));
      if (locked.length) h += `<p class="hint">More through Discovery: ${locked.map(id => esc(D.items[id].name)).join(', ')}.</p>`;
    } else if (UI.mtab === 'sell') {
      const ids = Object.keys(S.inv).filter(id => MARKET_BUYS.includes(D.items[id].cat) && count(id) > 0);
      if (ids.length) h += chips('sell', groupCounts(ids));
      const sellRow = id => [0, 1, 2].filter(q => S.inv[id][q] > 0).map(q => { const n = S.inv[id][q], key = `${id}:${q}`, pr = sellPrice(id, q), v = Math.max(1, Math.min(n, UI.sq[key] || 1));
        return `<div class="trade sell">${ico(id)}<div class="grow1"><b>${esc(D.items[id].name)}</b> ${qtag(q)}<small>${pr}g each ${moveTag(id)} · have ${n}</small></div>
          <div class="sellctl">${btn({ a: 'sell', i, p: id, q, n: 1 }, 'Sell 1', { cls: 'sm' })}${n > 1 ? btn({ a: 'sell', i, p: id, q, n }, `All · ${pr * n}g`, { cls: 'sm' }) : ''}
          <span class="qtybox"><input type="number" class="qty" id="sq-${id}-${q}" data-sq="${key}" data-max="${n}" data-price="${pr}" min="1" max="${n}" step="1" value="${v}" inputmode="numeric" aria-label="How many ${esc(D.items[id].name)} to sell"><button class="btn sm pri" data-sellqty="${key}" data-i="${i}">Sell · <span data-sqtotal="${key}">${pr * v}</span>g</button></span></div></div>`; }).join('');
      h += ids.length ? grouped(ids, 'sell', sellRow) : `<p class="hint">Nothing to sell yet. Harvest or make something first.</p>`;
    } else {
      const built = new Set(S.tiles.filter(t => t.b).map(t => t.b.type));
      const fresh = Object.keys(D.items).filter(id => { const it = D.items[id]; return it.cat === 'kit' && it.buy && unlocked(it.requires) && (!built.has(it.building) || D.buildings[it.building].kind === 'storage'); }); // storage is always stocked
      const list = [...new Set([...fresh, ...S.market.offers])];
      h += `<p class="hint">New stations and storage buildings are always stocked; extra copies of other stations rotate each morning. Place a kit on empty grass you own.</p>`;
      const kitRow = id => { const it = D.items[id], B = D.buildings[it.building];
        return `<div class="trade">${ico(id)}<div class="grow1"><b>${esc(B.name)}</b><small>${esc(B.desc)} Placing needs: ${costTxt(B.place)}.</small></div>${btn({ a: 'buy', i, p: id, n: 1 }, `${it.buy}g`, { cls: 'sm' })}</div>`; };
      const extra = list.filter(id => !fresh.includes(id));
      if (fresh.length) h += `<div class="grp"><span class="eyebrow">New stations & storage</span>${fresh.map(kitRow).join('')}</div>`;
      if (extra.length) h += `<div class="grp"><span class="eyebrow">Build another · today’s stock</span>${extra.map(kitRow).join('')}</div>`;
      if (!list.length) h += `<p class="hint">No station kits yet. Unlock Sawmill (after Woodcutting) in Discovery.</p>`;
    }
    return h;
  }
  function boardPanel(i) {
    let h = head('Order Board', 'Requests use goods you know, plus one contract pointing to what’s next.');
    const m = D.milestones[S.ms];
    if (m) h += `<div class="order ms"><div class="otop"><span class="eyebrow">Contract</span><b>${esc(m.name)}</b></div>${needRow(m.need)}
      <p class="hint">${esc(m.hint)}</p>${isComplex(m.need) ? `<button class="btn ghost sm treebtn" data-tree="ms">See everything it takes</button>` : ''}<div class="oreward">+${m.gold}g · +${m.dp} Discovery</div>${btn({ a: 'deliver', i, p: 'ms' }, 'Deliver', { cls: 'pri' })}</div>`;
    h += S.orders.map(o => `<div class="order"><div class="otop"><span class="eyebrow">${o.kind === 'crafted' ? 'Crafted delivery' : 'Delivery'}</span><b>${esc(o.name)}</b></div>${needRow(o.need)}
      <div class="oreward">+${o.gold}g · +${o.score} score</div><div class="obtns">${btn({ a: 'deliver', i, p: o.id }, 'Deliver', { cls: 'pri' })}<button class="btn ghost sm" data-pass="${o.id}">Pass</button></div></div>`).join('');
    if (S.orders.length < C.orderSlots) h += `<p class="hint">New request in ${Math.ceil(Math.max(0, S.refill))}s.</p>`;
    return h;
  }
  function gatherPanel(i, T) {
    const Tr = D.terrain[T.t];
    let h = head(Tr.name, esc(Tr.desc));
    const G = D.gather[T.t], need = D.discoveries.find(d => d.id === G.needs);
    if (!unlocked(G.needs)) h += `<p class="hint">Unlock <b>${esc(need.name)}</b> in Discovery to work this tile.</p>`;
    if (T.t === 'forest') {
      if (T.r.st === 'tree') h += btn({ a: 'chop', i }, 'Chop tree', { cls: 'pri', sub: `${gatherOut('forest', 'chop').log} logs + 1 sapling` });
      else if (T.r.st === 'stump') h += btn({ a: 'replant', i }, 'Plant sapling', { cls: 'pri', sub: `${count('sapling')} saplings` });
      else h += `<div class="row"><div class="grow1">Sapling growing${pbar('t:' + i)}</div></div>`;
    } else {
      h += `<div class="row"><div class="grow1">${T.t === 'water' ? 'Fish' : 'Boulders'} available: <b>${T.r.stock}/${G.stock}</b>${T.r.stock < G.stock ? pbar('r:' + i, 'thin') : ''}</div></div>`;
      h += btn({ a: G.action, i }, T.t === 'water' ? 'Fish' : 'Break stone', { cls: 'pri', sub: T.t === 'water' ? `+${gatherOut('water', 'fish').fish} fish` : `+${gatherOut('boulder', 'mine').stone} stone` });
    }
    if (unlocked(G.needs)) h += fhControl(i, T.t === 'forest' ? 'forest' : G.action);
    return h + reshapeSection(i) + `<p class="tip">${esc(Tr.future)}</p>`;
  }
  function reshapeSection(i) {
    const T = T_(i), opts = Object.keys(D.landShape).filter(k => k.startsWith(T.t + '>'));
    if (!opts.length) return '';
    return `<span class="eyebrow">Change this land</span>` + opts.map(k => { const L = D.landShape[k], to = k.split('>')[1];
      const back = Object.entries(L.back).filter(([id, n]) => n && !(T.t === 'forest' && id === 'log' && T.r && T.r.st !== 'tree'));
      return btn({ a: 'reshape', i, p: k }, `${esc(L.verb)} → ${esc(D.terrain[to].name)}`, { cls: 'ghost', sub: `${costTxt(L.cost)}${back.length ? ' · get back ' + costTxt(Object.fromEntries(back)) : ''}. ${esc(L.note)}` }); }).join('');
  }
  function storagePanel(i) {
    const B = D.buildings[T_(i).b.type];
    return head(B.name, esc(B.desc)) + `<p class="state">Adds <b>${B.storage}</b> to your storage. Total now: ${used()} of ${cap()} used.</p><p class="hint">Everything lives in shared storage, so it doesn’t matter where on your land you build these.</p>`;
  }
  function sprinklerPanel(i) {
    const B = D.buildings[T_(i).b.type], n = around(i, B.radius).filter(j => j !== i && farmAt(j)).length, max = (B.radius * 2 + 1) ** 2 - 1;
    return head(B.name, esc(B.desc)) + `<p class="state">Covering ${n} farm plot${n === 1 ? '' : 's'}.</p><p class="hint">Plots it waters still earn Good quality when they’re watered at both growth stages. Place it among your plots to cover up to ${max}.</p>`;
  }
  function emptyPanel(i) {
    let h = head('Empty grassland', 'Build a farm plot or place a station kit here.');
    h += btn({ a: 'build', i }, 'Build Farm Plot', { cls: 'pri', sub: costTxt(C.farmPlotCost) });
    const kits = Object.keys(S.inv).filter(id => D.items[id].cat === 'kit' && count(id) > 0);
    h += kits.length ? kits.map(id => { const B = D.buildings[D.items[id].building]; return btn({ a: 'place', i, p: id }, `Place ${esc(B.name)}`, { sub: `Kit + ${costTxt(B.place)}` }); }).join('')
      : `<p class="hint">Station kits are sold at the Open Market once unlocked.</p>`;
    return h + reshapeSection(i);
  }
  function lockedPanel(i, T) {
    const Tr = D.terrain[T.t], adj = nbrs(i).some(n => S.tiles[n].o);
    let h = head(Tr.name, `${esc(Tr.desc)}`);
    if (adj) { const c = expCost(i); h += `<p class="state">Unclaimed land at your border.</p>` + btn({ a: 'expand', i }, `Buy this tile`, { cls: 'pri', sub: costTxt(c) });
      if (S.exp < C.expandStoneAt) h += `<p class="hint">From your ${C.expandStoneAt + 1}th tile, land also costs stone; from the ${C.expandFenceAt + 1}th, a fence kit. Boulder Fields only ever cost gold.</p>`; }
    else h += `<p class="hint">Too far away. Buy the land between here and your homestead first.</p>`;
    const G = D.gather[T.t]; if (G && !unlocked(G.needs)) h += `<p class="hint">Working it needs <b>${esc(D.discoveries.find(d => d.id === G.needs).name)}</b>.</p>`;
    return h + `<p class="tip">${esc(Tr.future)}</p>`;
  }
  function renderPanel() {
    const i = UI.sel; const el = $('#panel');
    document.body.classList.toggle('sheet-open', i >= 0);
    if (i < 0) { el.hidden = true; UI.html['#panel'] = ''; return; }
    if (UI.lastSel !== i) { const a = document.activeElement; if (a && el.contains(a)) a.blur(); UI.lastSel = i; } // new tile: let the panel redraw
    el.hidden = false; const T = S.tiles[i];
    let h;
    if (!T.o) h = lockedPanel(i, T);
    else if (T.b) { const k = D.buildings[T.b.type].kind;
      h = k === 'farm' ? farmPanel(i, T.b) : k === 'station' ? stationPanel(i, T.b) : k === 'home' ? homePanel(i) : k === 'market' ? marketPanel(i) : k === 'sprinkler' ? sprinklerPanel(i) : k === 'storage' ? storagePanel(i) : boardPanel(i); }
    else if (T.r) h = gatherPanel(i, T);
    else h = emptyPanel(i);
    setHTML('#panel', h);
  }
  function renderDrawer() {
    const el = $('#drawer');
    if (!UI.drawer) { el.hidden = true; UI.html['#drawer'] = ''; return; }
    el.hidden = false; let h = '';
    if (UI.drawer === 'disc') {
      h = `<div class="phead"><div><h2>Discovery</h2><p class="sub">Earned from firsts, deeper chains, quality and contracts. Never from repeating cheap work. You have <b>${S.dp}</b>.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      const rank = d => unlocked(d.id) ? 3 : d.req.every(unlocked) ? (S.dp >= d.cost ? 0 : 1) : 2;
      const branchOf = d => (D.discoveryBranches.find(b => b.ids.includes(d.id)) || D.discoveryBranches[0]).id;
      const avail = D.discoveries.filter(d => !unlocked(d.id) && d.req.every(unlocked));
      h += chips('disc', D.discoveryBranches.map(b => [b.id, b.name, D.discoveries.filter(d => branchOf(d) === b.id && !unlocked(d.id)).length || null]), avail.length ? [['avail', 'Ready to unlock', avail.length]] : []);
      const sel = UI.cat.disc, card = d => { const own = unlocked(d.id), reqOk = d.req.every(unlocked);
        const st = own ? 'own' : reqOk ? (S.dp >= d.cost ? 'can' : 'short') : 'lock';
        return `<div class="card ${st}"><div class="ctop"><img class="dimg" src="${ART.discPic(d.pic, D.items)}" alt=""><div class="ctxt"><b>${esc(d.name)}</b><span class="cost">${own ? 'Unlocked' : d.cost + ' DP'}</span></div></div><p>${esc(d.text)}</p><p class="where">${esc(d.where)}</p>
          ${own ? '' : !reqOk ? `<small>Needs ${d.req.filter(r => !unlocked(r)).map(r => esc(D.discoveries.find(x => x.id === r).name)).join(', ')}</small>` : `<button class="btn ${st === 'can' ? 'pri' : ''}" data-unlock="${d.id}" ${st === 'can' ? '' : 'disabled'}>Unlock${st === 'short' ? `<small>Need ${d.cost - S.dp} more</small>` : ''}</button>`}</div>`; };
      if (sel === 'avail') h += `<div class="cards">${[...avail].sort((a, b) => rank(a) - rank(b)).map(card).join('')}</div>`;
      else h += D.discoveryBranches.filter(b => sel === 'all' || sel === b.id).map(b => {
        const ds = D.discoveries.filter(d => branchOf(d) === b.id).sort((x, y) => rank(x) - rank(y));
        return `<div class="grp"><span class="eyebrow">${esc(b.name)} · ${ds.filter(d => unlocked(d.id)).length}/${ds.length}</span><div class="cards">${ds.map(card).join('')}</div></div>`; }).join('');
    } else if (UI.drawer === 'inv') {
      h = `<div class="phead"><div><h2>Storage</h2><p class="sub">${used()} of ${cap()} items. Stations draw from here; station kits don’t count.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      const ids = Object.keys(S.inv).filter(id => count(id) > 0);
      if (ids.length) h += chips('inv', groupCounts(ids, count));
      const slot = id => `<div class="slot" title="${esc(D.items[id].name)}">${ico(id, 'big')}<div><b>${esc(D.items[id].name)}</b><small>${[0, 1, 2].filter(q => S.inv[id][q]).map(q => `${S.inv[id][q]} ${QN[q]}`).join(' · ')}</small>${useHint(id) ? `<small class="use">${esc(useHint(id))}</small>` : ''}</div></div>`;
      h += ids.length ? grouped(ids, 'inv', slot, 'invgrid') : '<p class="hint">Storage is empty.</p>';
    } else if (UI.drawer === 'tree') {
      const m = D.milestones[S.ms];
      if (!m) h = `<div class="phead"><div><h2>All contracts complete</h2></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      else { const roots = m.need.map(([id, n, q]) => tree(id, n, q)), tot = {}; roots.forEach(r => leaves(r, tot));
        const done = roots.every(r => r.short === 0);
        h = `<div class="phead"><div><h2>${esc(m.name)}</h2><p class="sub">${done ? 'You have everything. Deliver it at the Order Board.' : 'Everything this contract needs, traced back to raw materials. Amounts already account for what’s in storage.'}</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
        if (!done && Object.keys(tot).length) h += `<span class="eyebrow">Raw materials still to get</span><div class="shop">${Object.entries(tot).map(([id, n]) => `<div class="need">${ico(id)}<span>${n}× ${esc(D.items[id].name)}</span></div>`).join('')}</div>`;
        h += `<span class="eyebrow">Production tree</span><ul class="ptree">${roots.map(r => `<li>${treeHTML(r)}</li>`).join('')}</ul>`;
        h += `<p class="hint">Reward: +${m.gold}g · +${m.dp} Discovery.</p>`; }
    } else if (UI.drawer === 'support') {
      h = `<div class="phead"><div></div><button class="close" data-close-drawer aria-label="Close">×</button></div><div class="supportbox">${supportHTML()}<div class="menu"><button class="btn ghost" data-drawer="menu">Back to the menu</button></div></div>`;
    } else if (UI.drawer === 'menu') {
      h = `<div class="phead"><div><h2>Harvestworks</h2><p class="sub">${S.menuPause !== false ? '<b>Game paused.</b> ' : ''}Progress saves in this browser<span id="savedago"></span>.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>
        <button class="toggle ${S.menuPause !== false ? 'on' : ''}" data-menupause aria-pressed="${S.menuPause !== false}"><i></i>Pause the game while this menu is open</button>
        <div class="menu"><button class="btn pri" data-save>Save now</button><button class="btn ${UI.confirmReset ? 'danger' : 'ghost'}" data-reset>${UI.confirmReset ? 'Click again to erase this farm' : 'Start a new farm'}</button></div>
        <span class="eyebrow">Move your farm</span>
        <p class="sub">Download your farm as a save file, then load it on another device or on the web version. Loading replaces the farm on that page.</p>
        <div class="menu"><button class="btn pri" data-download-save>Download save file</button><button class="btn ghost" data-load-file>Load a save file</button></div>
        <button class="linkish small" data-toggle-code>${UI.showCode ? 'Hide save codes' : 'Or copy and paste a save code instead'}</button>
        ${UI.showCode ? `<div class="menu"><button class="btn ghost" data-export>${UI.exportCode ? 'Refresh save code' : 'Export save code'}</button><button class="btn ghost" data-import-open>Paste a save code</button></div>` : ''}
        ${UI.showCode && UI.exportCode ? `<label class="eyebrow" for="expcode">Your save code · ${Math.ceil(UI.exportCode.length / 1024)} KB of text</label><textarea id="expcode" class="code" readonly rows="4">${esc(UI.exportCode)}</textarea>
          <div class="menu"><button class="btn pri" data-copy-code>${UI.copied ? 'Copied ✓' : 'Copy save code'}</button></div>` : ''}
        ${UI.fileInfo || UI.fileErr ? `<div id="filestatus">${UI.fileErr ? `<p class="hint err">${esc(UI.fileErr)}</p>` : `<p class="hint">${UI.fileInfo}</p><div class="menu"><button class="btn ${UI.confirmImport ? 'danger' : 'pri'}" data-import>${UI.confirmImport ? 'Tap again to replace this farm' : 'Load this farm'}</button><button class="btn ghost" data-file-cancel>Cancel</button></div>`}</div>` : ''}
        ${UI.showCode && UI.importOpen ? `<label class="eyebrow" for="impcode">Paste a save code</label><textarea id="impcode" class="code" rows="4" placeholder="HWZ1:…">${esc(UI.importText || '')}</textarea>
          <div id="impstatus">${UI.importErr ? `<p class="hint err">${esc(UI.importErr)}</p>` : UI.importInfo ? `<p class="hint">${UI.importInfo}</p>` : ''}</div>
          <div class="menu"><button class="btn ${UI.confirmImport ? 'danger' : 'pri'}" data-import ${UI.importInfo ? '' : 'disabled'}>${UI.confirmImport ? 'Tap again to replace this farm' : 'Import this farm'}</button></div>` : ''}
        <span class="eyebrow">Show your support</span>
        <p class="sub">Harvestworks is free to play. If you’re enjoying your farm, a show of support helps keep new updates coming.</p>
        <div class="menu"><button class="btn pri" data-drawer="support">Show your support</button></div>
        <div class="menu"><button class="btn ghost" data-title-open>Main menu</button><button class="btn ghost" data-tut-replay>Replay the tutorial</button></div>
        <span class="eyebrow">Controls</span>${isTouch() ? `<ul class="help"><li>Tap a tile to select it; tap it again to repeat its main action.</li><li>Drag with one finger to move around. Pinch to zoom.</li><li>Twist two fingers to turn the world; slide two fingers up or down together to tilt the view.</li><li>⟲ ⟳ turn a quarter; ⌂ recentres and resets the tilt.</li><li>Your farmer works through queued tasks in order. Cancel with ×.</li></ul>` : ''}<ul class="help ${isTouch() ? 'desk' : ''}"><li>Click a tile to select it; the panel lists its actions.</li><li>Click a selected tile again to repeat its main action.</li><li>Hold the right mouse button and push the mouse away from where you pressed, like a thumbstick: left and right turn the world, up and down tilt the view. The further you push, the faster it moves. ⌂ recentres and resets the tilt. Q / E or the ⟲ ⟳ buttons glide a quarter turn. Left- or middle-drag to pan. Scroll or pinch to zoom. Arrow keys and +/− work too.</li><li>Your farmer walks to each queued task in order. Cancel with ×.</li><li>Later, Discovery unlocks tool upgrades, repeating recipes, auto-collect, sprinklers and a farmhand.</li></ul>
        <span class="eyebrow">Your record</span><p class="sub">Score <b>${S.score}</b> · Day ${S.day} · ${S.tiles.filter(t => t.o).length} tiles · ${S.disc.length} goods discovered</p>`;
    }
    setHTML('#drawer', `<div class="dbox">${h}</div>`);
    const sa = UI.drawer === 'menu' && $('#savedago');
    if (sa) { const t = UI.savedAt ? `; last saved ${Math.round((Date.now() - UI.savedAt) / 1000)}s ago` : ''; if (sa.textContent !== t) sa.textContent = t; }
  }
  // Show your support: a big QR code to scan with a phone, and a link that opens Ko-fi.
  const supportHTML = () => `<h2>Show your support</h2>
    <p class="sub">Harvestworks is free to play and made by one person. If you’re enjoying your farm, a show of support helps keep new updates coming. $1 is plenty; anything is appreciated.</p>
    <div class="bigqr"><img class="qr big" src="${D.support.qr}" alt="QR code for the Harvestworks Ko-fi page"><span>Scan with your phone’s camera</span></div>
    <a class="btn pri big paylink" href="${esc(D.support.url)}" target="_blank" rel="noopener">Open Ko-fi ↗</a>`;
  // Backend entries stay in the CHANGELOG only; players see the rest.
  const PUB = D.updates.filter(u => !u.backend);
  const latest = () => PUB[0];
  const unseen = () => S.seenUpdate !== latest().v;
  function fmtAt(at) { const [d, t] = at.split(' '), [y, m, dd] = d.split('-').map(Number), [hh, mm] = t.split(':').map(Number);
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
    return `${mon} ${dd}, ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'} PT`; }
  function renderLogs() {
    setHTML('#logbar', `<button class="ibtn lg ${UI.logOpen === 'act' ? 'on' : ''}" data-log="act" aria-expanded="${UI.logOpen === 'act'}">Activity ▾</button>
      <button class="ibtn lg ${UI.logOpen === 'upd' ? 'on' : ''}" data-log="upd" aria-expanded="${UI.logOpen === 'upd'}">Updates ▾${unseen() ? '<i class="dot"></i>' : ''}</button>`);
    const el = $('#logpanel');
    if (!UI.logOpen) { el.hidden = true; UI.html['#logpanel'] = ''; return; }
    el.hidden = false;
    let h;
    if (UI.logOpen === 'act') {
      h = `<div class="lphead"><b>Activity</b><span class="muted">Newest first · last ${S.log.length}</span><button class="close" data-log="act" aria-label="Close">×</button></div>`;
      h += S.log.length ? `<ol class="loglist">${S.log.map(e => `<li><span class="when">Day ${e.d} ${e.c}</span><span class="what">${e.who === 'hand' ? '<em>Farmhand</em> ' : ''}${esc(e.text)}</span></li>`).join('')}</ol>`
        : `<p class="hint">Nothing yet. Everything you and your farmhand finish will be listed here.</p>`;
    } else {
      h = `<div class="lphead"><b>Updates</b><span class="muted">What changed in the game</span><button class="close" data-log="upd" aria-label="Close">×</button></div>`;
      h += `<ol class="loglist upd">${PUB.map((u, k) => `<li><span class="when">v${u.v} · ${fmtAt(u.at)}${k === 0 && unseen() ? ' <span class="new">new</span>' : ''}</span><ul>${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
    }
    setHTML('#logpanel', h);
  }
  /* ticker: recent valley trades scrolling across the top bar */
  const TICK_SPEED = { slow: 32, fast: 60 }; // px per second
  function agoTxt(iso) { const s = Math.max(0, (Date.now() - NET.skew - Date.parse(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; }
  function tickerText() {
    if (!NET.tried) return 'Connecting to the valley market…';
    if (!NET.ok) return 'Valley market offline: prices are local. Shared prices work on the web version at zcgrimshaw.github.io/harvestwork';
    const items = NET.trades.filter(t => D.items[t.item]).slice(0, 25).map(t => {
      const it = D.items[t.item], pr = t.side === 'sell' ? sellPrice(t.item, 0) : buyPrice(t.item), mv = moveTag(t.item);
      return `<span class="tk"><b>${t.qty} ${esc(it.name)}</b> ${t.side === 'sell' ? 'sold' : 'bought'}${t.mine ? ' (you)' : ''} · ${agoTxt(t.created_at)} · now ${pr}g ${mv}</span>`; });
    return items.length ? items.join('<span class="sep">◆</span>') : 'The valley market is quiet. Sell something to get prices moving.';
  }
  function renderTicker() {
    const T = S.tick || (S.tick = { open: true, spd: 'slow' }), el = $('#ticker');
    const shell = `${T.open ? '' : 'closed'}|${T.spd}`;
    if (UI.tickShell !== shell) { UI.tickShell = shell; UI.tickText = null;
      el.className = T.open ? 'open' : 'closed';
      el.innerHTML = T.open ? `<span class="tklabel">Valley market</span><div class="tkwin"><div class="tktrack"><span class="tkc"></span><span class="tkc" aria-hidden="true"></span></div></div>
        <button class="tkb" data-tick-speed aria-label="Ticker speed: ${T.spd}, tap to change" title="Speed">${T.spd === 'slow' ? 'Slow' : 'Fast'}</button>
        <button class="tkb" data-tick-toggle aria-label="Collapse ticker" title="Collapse">–</button>`
        : `<button class="tkopen" data-tick-toggle aria-label="Show valley market ticker">Valley market ▸</button>`; }
    if (!T.open) return;
    const txt = tickerText(); if (txt === UI.tickText && !UI.tickDirty) return;
    UI.tickText = txt; UI.tickDirty = false;
    el.querySelectorAll('.tkc').forEach(c => { c.innerHTML = txt + '<span class="sep">◆</span>'; });
  }
  function tickTicker(dt) {
    const T = S.tick; if (!T || !T.open) return; const tr = document.querySelector('#ticker .tktrack'), c = tr && tr.firstElementChild; if (!c) return;
    const w = c.offsetWidth; if (!w) return;
    if (!mq('(prefers-reduced-motion: reduce)')) UI.tickX = ((UI.tickX || 0) + TICK_SPEED[T.spd] * dt) % w;
    tr.style.transform = `translateX(${-(UI.tickX || 0)}px)`;
  }
  function renderUI() {
    renderLogs(); renderTicker();
    renderTop(); renderGoals(); renderQueue(); renderPanel(); renderDrawer(); renderCoach();
  }
  function progress(key) {
    const [k, a, b] = key.split(':');
    if (k === 'task') return S.cur ? (S.cur.ph === 'work' ? S.cur.t / S.cur.dur : .03) : 0;
    const T = S.tiles[+a]; if (!T) return 0;
    if (k === 'f') return T.b && T.b.g !== undefined ? T.b.g / D.crops[T.b.crop].grow : 0;
    if (k === 's') { const j = T.b && T.b.q && T.b.q[+b]; return j ? j.t / j.dur : 0; }
    if (k === 't') return T.r.g / D.gather.forest.regrow;
    if (k === 'r') return T.r.rt / D.gather[T.t].regen;
    return 0;
  }

  // delegated UI events
  document.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el) return;
    const ds = el.dataset;
    if ('task' in ds) { const t = { a: ds.a, i: +ds.i }; if (ds.p !== undefined) t.p = isNaN(+ds.p) || ds.p === '' ? ds.p : (ds.a === 'deliver' ? +ds.p : ds.p);
      if (ds.n !== undefined) t.n = +ds.n; if (ds.q !== undefined) t.q = +ds.q; if (ds.f !== undefined) t.f = +ds.f; queueTask(t); }
    else if ('close' in ds) UI.sel = -1;
    else if ('closeDrawer' in ds) { UI.drawer = null; UI.confirmReset = false; }
    else if ('titleOpen' in ds) { save(); UI.drawer = null; UI.hadSave = true; openTitle('main'); }
    else if ('tutReplay' in ds) { UI.drawer = null; startTut(); }
    else if ('tutNext' in ds) { tutAdvance(); }
    else if ('tutSkip' in ds) { endTut(true); }
    else if (ds.drawer) { UI.drawer = UI.drawer === ds.drawer ? null : ds.drawer; UI.confirmReset = false; }
    else if (ds.tree) UI.drawer = 'tree';
    else if (ds.log) { const was = UI.logOpen; UI.logOpen = was === ds.log ? null : ds.log;
      if (was === 'upd' && UI.logOpen !== 'upd') { S.seenUpdate = latest().v; save(); } } // closing Updates marks it as read
    else if ('tickToggle' in ds) { S.tick.open = !S.tick.open; save(); }
    else if ('tickSpeed' in ds) { S.tick.spd = S.tick.spd === 'slow' ? 'fast' : 'slow'; save(); }
    else if (ds.mtab) UI.mtab = ds.mtab;
    else if (ds.cat) { const [k, v] = ds.cat.split(':'); UI.cat[k] = v; }
    else if (ds.cancel) { S.queue = S.queue.filter(t => t.id !== +ds.cancel); }
    else if (ds.pass) { S.orders = S.orders.filter(o => o.id !== +ds.pass); S.refill = C.orderRefill; }
    else if (ds.unlock) { const d = D.discoveries.find(x => x.id === ds.unlock);
      if (d && !unlocked(d.id) && S.dp >= d.cost) { S.dp -= d.cost; S.unl.push(d.id); logAct(`Unlocked ${d.name} · −${d.cost} Discovery`, 'you');
        const kit = Object.keys(D.items).find(k => D.items[k].cat === 'kit' && D.items[k].buy && D.items[k].requires === d.id);
        if (kit && !S.market.offers.includes(kit)) { S.market.offers.unshift(kit); S.market.offers = S.market.offers.slice(0, C.marketOffers); }
        toast(`<b>Unlocked ${esc(d.name)}.</b> ${esc(d.text)} <span class="where">${esc(d.where)}</span>`, 'disc'); emit('unlock'); save(); } }
    else if (ds.sellqty) { const [id, q] = ds.sellqty.split(':'), inp = document.querySelector(`[data-sq="${ds.sellqty}"]`);
      const max = +inp.dataset.max, n = Math.max(1, Math.min(max, parseInt(inp.value, 10) || 1)); UI.sq[ds.sellqty] = n; inp.blur();
      queueTask({ a: 'sell', i: +ds.i, p: id, q: +q, n }); }
    else if (ds.rep) { const [ti, rid] = ds.rep.split(':'), b = S.tiles[+ti].b; b.rep = b.rep === rid ? null : rid; }
    else if (ds.auto) { const b = S.tiles[+ds.auto].b; b.auto = !b.auto; }
    else if (ds.fhAdd) { const i = +ds.i, st = { s: ds.fhAdd, i };
      if (st.s === 'tend') st.p = ($('#hcrop') || {}).value; if (st.s === 'station') st.p = ($('#hrec') || {}).value;
      if (S.helper && S.helper.steps.length < fhMax() && (st.p || !['tend', 'station'].includes(st.s))) { S.helper.steps.push(st); toast(`Farmhand job added: ${esc(stepLabel(st))}.`, 'info'); } }
    else if (ds.fhDel !== undefined) { S.helper.steps.splice(+ds.fhDel, 1); S.helper.cur = null; S.helper.k = 0; }
    else if ('fhClear' in ds) {
      if (!UI.fhClear) { UI.fhClear = true; clearTimeout(UI.fhClearT); UI.fhClearT = setTimeout(() => { UI.fhClear = false; dirty(); }, 3000); }
      else { UI.fhClear = false; clearTimeout(UI.fhClearT); S.helper.steps = []; S.helper.cur = null; S.helper.k = 0; S.helper.path = []; toast('Farmhand jobs cleared. Add new ones from any plot, station or resource tile.', 'info'); save(); } }
    else if ('fhSpeed' in ds) { const sp = D.farmhand.speeds; S.helper.spd = sp[(sp.indexOf(S.helper.spd || 1) + 1) % sp.length]; }
    else if ('fhToggle' in ds) { S.helper.on = !S.helper.on; if (!S.helper.on) { S.helper.cur = null; } }
    else if (ds.goto !== undefined) { UI.sel = +ds.goto; centerOn(+ds.goto); }
    else if (ds.shirt !== undefined) S.shirt = +ds.shirt;
    else if (ds.hat !== undefined) S.hat = +ds.hat;
    else if ('toggleGoals' in ds) UI.goalsOpen = !UI.goalsOpen;
    else if ('goalMin' in ds) { S.goalMin = true; save(); }
    else if ('goalRestore' in ds) { S.goalMin = false; UI.goalsOpen = true; save(); }
    else if ('menupause' in ds) { S.menuPause = S.menuPause === false; save(); }
    else if ('save' in ds) { save(); toast('Saved.', 'info'); }
    else if ('downloadSave' in ds) { downloadSave(); }
    else if ('loadFile' in ds) { fileIn.value = ''; fileIn.click(); return; }
    else if ('toggleCode' in ds) { UI.showCode = !UI.showCode; }
    else if ('fileCancel' in ds) { UI.fileInfo = UI.fileErr = null; UI.importData = null; UI.confirmImport = false; }
    else if ('export' in ds) { exportCode().then(c => { UI.exportCode = c; UI.copied = false; dirty(); }).catch(e => toast('Couldn’t make a save code: ' + esc(e.message), 'warn')); }
    else if ('copyCode' in ds) { const ta = $('#expcode');
      const ok = () => { UI.copied = true; dirty(); }, fallback = () => { ta.focus(); ta.select(); toast('Press and hold (or Ctrl/Cmd+C) to copy the selected code.', 'info'); };
      try { navigator.clipboard.writeText(UI.exportCode).then(ok, fallback); } catch (e) { fallback(); } }
    else if ('importOpen' in ds) { UI.importOpen = !UI.importOpen; UI.importErr = UI.importInfo = null; UI.confirmImport = false; }
    else if ('import' in ds) {
      if (!UI.importData) return;
      if (!UI.confirmImport) { UI.confirmImport = true; dirty(); return; }
      adoptState(UI.importData); UI.importOpen = false; UI.importData = UI.importText = UI.importInfo = UI.fileInfo = UI.fileErr = null; UI.confirmImport = false; UI.exportCode = null;
      toast(`<b>Farm imported.</b> Welcome back, ${esc(S.name)}: day ${S.day}, ${S.gold}g.`, 'goal'); logAct('Imported this farm from a save code', 'you'); }
    else if ('reset' in ds) { if (!UI.confirmReset) UI.confirmReset = true; else { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } newState(); migrate(); UI.yaw = 0; UI.yawTo = null; centerOn(idx(...D.map.spawn)); UI.sel = -1; UI.drawer = null; UI.confirmReset = false; toast('A fresh homestead. Good luck!', 'goal'); } }
    else if (ds.rot) rotateView(+ds.rot);
    else if (ds.zoom) { ds.zoom === 'home' ? (setView(UI.yaw, 1), centerOn(idx(...D.map.spawn))) : zoomAt(ds.zoom === 'in' ? 1.25 : .8, W / 2, H / 2); }
    else return;
    dirty();
  });
  $('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') { UI.drawer = null; UI.confirmReset = false; dirty(); } });
  const fileIn = $('#loadfile');
  fileIn.addEventListener('change', () => {
    const file = fileIn.files && fileIn.files[0]; if (!file) return;
    if (UI.title) { UI.tFile = { busy: file.name };  renderTitle();
      const rd = file.text ? file.text() : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Couldn’t read that file.')); r.readAsText(file); });
      rd.then(parseSaveText).then(o => { UI.tFile = { o, name: file.name }; }).catch(err => { UI.tFile = { err: (err && err.message) || 'Couldn’t read that file.' }; })
        .then(() => { fileIn.value = ''; renderTitle(); });
      return; }
    UI.fileErr = UI.fileInfo = null; UI.importData = null; UI.confirmImport = false;
    toast(`Reading <b>${esc(file.name)}</b>…`);
    const read = file.text ? file.text() : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Couldn’t read that file.')); r.readAsText(file); });
    read.then(parseSaveText).then(o => { UI.importData = o;
        UI.fileInfo = `<b>${esc(file.name)}</b>: ${esc(o.name || 'Farmer')}’s farm, day ${o.day}, ${o.gold}g, ${o.tiles.filter(t => t.o).length} tiles, score ${o.score}.`;
        toast(`<b>Save file ready.</b> ${esc(o.name || 'Farmer')}’s farm, day ${o.day}. Press <b>Load this farm</b> in the menu to switch.`, 'goal'); })
      .catch(err => { UI.fileErr = (err && err.message) || 'Couldn’t read that file.'; toast(esc(UI.fileErr), 'warn'); })
      .then(() => { fileIn.value = ''; if (UI.drawer !== 'menu') UI.drawer = 'menu'; dirty();
        setTimeout(() => { const st = $('#filestatus'); if (st) st.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 80); });
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'fert') { UI.fert = e.target.checked; dirty(); } else if (id === 'hcrop') UI.hcrop = e.target.value; else if (id === 'hrec') UI.hrec = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.sq) { const b = document.querySelector(`[data-sellqty="${e.target.dataset.sq}"]`); if (b) b.click(); } });
  document.addEventListener('input', e => {
    if (e.target.id === 'impcode') { UI.importText = e.target.value; UI.confirmImport = false; UI.importData = null; UI.importErr = UI.importInfo = null;
      const v = e.target.value.trim();
      if (v) parseCode(v).then(o => { if (UI.importText !== e.target.value) return; UI.importData = o;
          UI.importInfo = `Found <b>${esc(o.name || 'Farmer')}</b>’s farm: day ${o.day}, ${o.gold}g, ${o.tiles.filter(t => t.o).length} tiles, score ${o.score}.`; showImportStatus(); })
        .catch(err => { if (UI.importText !== e.target.value) return; UI.importErr = err.message; showImportStatus(); });
      showImportStatus();
      return; } if (e.target.id === 'pname') { S.name = e.target.value.trim() || 'Farmer'; renderTop(); }
    const sq = e.target.dataset && e.target.dataset.sq; if (sq) { const max = +e.target.dataset.max, n = Math.max(1, Math.min(max, parseInt(e.target.value, 10) || 1));
      UI.sq[sq] = n; const out = document.querySelector(`[data-sqtotal="${sq}"]`); if (out) out.textContent = n * +e.target.dataset.price; } });
  function centerOn(i) { const [vx, vy] = view(tx(i), ty(i)); cam.u = isoU(vx, vy); cam.v = isoV(vx, vy); }

  /* ================= loop ================= */
  // The menu pauses the world (crops, stations, farmer, farmhand, clock) unless the player turns that off.
  const paused = () => !!UI.title || UI.drawer === 'menu' && S.menuPause !== false;
  let last = performance.now(), uiT = 0;
  function frame(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now;
    if (!paused()) update(dt); tickYaw(dt); tickTicker(dt); tutTick();
    UI.floats.forEach(f => f.t += dt); UI.floats = UI.floats.filter(f => f.t < 1.6);
    UI.parts.forEach(q => q.t += dt); UI.parts = UI.parts.filter(q => q.t < 1);
    draw();
    uiT -= dt; if (UI.dirty || uiT <= 0) { renderUI(); UI.dirty = false; uiT = .5; }
    document.querySelectorAll('[data-prog]').forEach(el => { el.style.width = (Math.min(1, progress(el.dataset.prog)) * 100).toFixed(1) + '%'; });
    requestAnimationFrame(frame);
  }

  /* ================= update notice =================
     When hosted as static files, a newer build may go live while someone is playing. Every few minutes
     the game reads version.json next to it; if the build differs, a banner offers a reload. It never
     reloads on its own, and saving first means nothing is lost. Missing file or offline = silently skip. */
  const BUILD = '20261013-170200';
  async function checkForUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json(); if (v && v.build && v.build !== BUILD) $('#update').hidden = false;
    } catch (e) { /* not hosted, offline, or blocked: nothing to do */ }
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-reload]')) { save(); try { sessionStorage.setItem('infinifarm.skipTitle', '1'); } catch (er) { } location.reload(); }
    else if (e.target.closest('[data-later]')) $('#update').hidden = true;
  });
  /* ================= export / import a farm =================
     A farm travels as a text "save code" the player copies and pastes, because pages here can't
     download files. The code is the save, gzip-compressed where the browser supports it, then base64. */
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function exportCode() {
    save(); const json = JSON.stringify(S), raw = new TextEncoder().encode(json);
    if (window.CompressionStream) {
      const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      return 'HWZ1:' + b64(z); }
    return 'HW1:' + b64(raw);
  }
  async function parseCode(code) {
    code = (code || '').replace(/\s+/g, '');
    let json;
    if (code.startsWith('HWZ1:')) {
      if (!window.DecompressionStream) throw new Error('This browser can’t read compressed save codes. Try another browser.');
      const out = await new Response(new Blob([unb64(code.slice(5))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      json = new TextDecoder().decode(out);
    } else if (code.startsWith('HW1:')) json = new TextDecoder().decode(unb64(code.slice(4)));
    else throw new Error('That isn’t a Harvestworks save code. It should start with HWZ1: or HW1:.');
    return validState(JSON.parse(json), 'The save code is damaged or incomplete. Copy it again in full.');
  }
  function validState(o, msg) {
    if (!o || o.v !== 1 || !Array.isArray(o.tiles) || o.tiles.length !== o.w * o.h || !o.inv) throw new Error(msg);
    return o;
  }
  // A save file is plain JSON: { format, saved, state }. Older save codes pasted into a .txt file also load.
  async function parseSaveText(text) {
    text = (text || '').trim();
    if (text.startsWith('{')) { let o; try { o = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a readable Harvestworks save.'); }
      return validState(/^(harvestworks|infinifarm)-save$/.test(o.format) ? o.state : o, 'That file isn’t a Harvestworks save, or it’s damaged.'); }
    return parseCode(text);
  }
  const saveFileName = () => `harvestworks-${(S.name || 'farm').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm'}-day${S.day}.json`;
  async function downloadSave() {
    save();
    const body = JSON.stringify({ format: 'harvestworks-save', saved: new Date().toISOString(), version: D.updates[0].v, state: S });
    const name = saveFileName();
    // Inside Claude the viewer's own download prompt is used; on a normal website a plain browser download.
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { try { await dl.save({ filename: name, data: body }); toast(`<b>Save file ready:</b> ${esc(name)}`, 'goal'); }
      catch (e) { if (e && e.code === 'declined') return; toast('Couldn’t save the file here. Use “Copy a save code instead” below.', 'warn'); UI.showCode = true; dirty(); }
      return; }
    if (window.claude && window.claude.use) { toast('Downloads aren’t available in this view. Use “Copy a save code instead” below.', 'warn'); UI.showCode = true; dirty(); return; }
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`<b>Downloaded</b> ${esc(name)}`, 'goal');
  }
  function showImportStatus() { // update just the status line and button, so the text box keeps focus
    const st = $('#impstatus'), b = document.querySelector('[data-import]'); if (!st) return;
    st.innerHTML = UI.importErr ? `<p class="hint err">${esc(UI.importErr)}</p>` : UI.importInfo ? `<p class="hint">${UI.importInfo}</p>` : '';
    if (b) { b.disabled = !UI.importData; b.className = 'btn pri'; b.textContent = 'Import this farm'; }
  }
  function adoptState(o) { // switch the running game over to an imported farm
    S = o; migrate(); UI.yaw = S.yaw != null ? S.yaw : 0; UI.yawTo = null; UI.tilt = S.tilt || 1;
    UI.sel = -1; UI.drawer = null; UI.html = {}; UI.tickShell = null; centerOn(idx(Math.round(S.av.x), Math.round(S.av.y))); save(); dirty();
  }
  function boot(snap) {
    const saved = (snap && snap.tiles) ? null : load(); UI.hadSave = !!(snap && snap.tiles) || !!saved;
    S = (snap && snap.tiles) ? snap : (saved || newState()); migrate(); UI.yaw = S.yaw != null ? S.yaw : (S.rot || 0) * Math.PI / 2; UI.tilt = S.tilt || 1;
    if (!S.market) newState();
    if (isPhone()) UI.goalsOpen = false;
    if (S.seenUpdate === undefined && S.time < 61) S.seenUpdate = latest().v; // brand-new farm: nothing to announce
    if (unseen()) UI.logOpen = 'upd';
    resize(); centerOn(idx(Math.round(S.av.x), Math.round(S.av.y)));
    window.addEventListener('resize', resize);
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => S);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    requestAnimationFrame(t => { last = t; frame(t); });
    setTimeout(checkForUpdate, 5000); setInterval(checkForUpdate, 120000);
    pullMarket(); setInterval(() => { if (!document.hidden) pullMarket(); }, 30000);
    let skip = false; try { skip = sessionStorage.getItem('infinifarm.skipTitle') === '1'; sessionStorage.removeItem('infinifarm.skipTitle'); } catch (e) { }
    if (!(snap && snap.tiles) && !skip) { let seen = false; try { seen = localStorage.getItem('infinifarm.seen') === '1'; } catch (e) { } openTitle(seen || UI.hadSave ? 'main' : 'splash'); }
    if (S.tut) startTut(S.tut.n);
  }
  /* ================= title screen & main menu =================
     First visit: a welcome splash, then the main menu. Later visits open on the main menu with Continue on top.
     The world keeps drawing behind it but is paused (see paused()). */
  const titleEl = $('#title');
  function openTitle(screen) { UI.title = screen; UI.tFile = null; UI.sel = -1; renderTitle(); dirty(); }
  function closeTitle() { UI.title = null; titleEl.hidden = true; titleEl.innerHTML = ''; try { localStorage.setItem('infinifarm.seen', '1'); } catch (e) { } dirty(); }
  const cropRow = () => ['carrot', 'potato', 'apple', 'wheat', 'bread', 'cheese', 'cider'].filter(id => D.items[id]).map(id => `<img src="${ART.icon(id, D.items)}" alt="">`).join('');
  function renderTitle() {
    const t = UI.title; if (!t) return; let h = '';
    const back = `<button class="btn ghost" data-t="main">Back</button>`;
    if (t === 'splash') h = `<div class="tcard splash"><span class="twel">Welcome to</span><h1 class="tlogo">Harvestworks</h1><div class="tcrops">${cropRow()}</div>
        <p class="sub">Grow, craft and trade your way from one patch of dirt to a farm that never stops growing.</p>
        <button class="btn pri big" data-t="main" autofocus>Let’s go</button></div>`;
    else if (t === 'main') { const f = UI.tFile;
      h = `<div class="tcard"><h1 class="tlogo">Harvestworks</h1><div class="tcrops">${cropRow()}</div><div class="tmenu">
        ${UI.hadSave ? `<button class="btn pri big" data-t="continue">Continue<small>${esc(S.name)}’s farm · Day ${S.day} · ${S.gold}g</small></button>` : ''}
        <button class="btn ${UI.hadSave ? '' : 'pri'} big" data-t="new">New farm</button>
        <button class="btn big" data-t="load">Load a save file<small>A .json file downloaded from the Menu</small></button>
        <button class="btn ghost big" data-t="support">Show your support</button></div>
        ${f ? `<div class="tfile">${f.busy ? `<p class="hint">Reading ${esc(f.busy)}…</p>` : f.err ? `<p class="hint err">${esc(f.err)}</p>`
          : `<p class="hint"><b>${esc(f.name)}</b>: ${esc(f.o.name || 'Farmer')}’s farm, day ${f.o.day}, ${f.o.gold}g.${UI.hadSave ? ` This replaces ${esc(S.name)}’s farm in this browser.` : ''}</p>
             <div class="menu"><button class="btn pri" data-t="loadgo">Load this farm</button><button class="btn ghost" data-t="filecancel">Cancel</button></div>`}</div>` : ''}
        <p class="tver">v${esc(D.updates[0].v)}</p></div>`; }
    else if (t === 'confirm') h = `<div class="tcard"><h2>Start a new farm?</h2>
        <p class="sub">This replaces <b>${esc(S.name)}’s farm</b> (day ${S.day}, ${S.gold}g) in this browser. Download a save file first if you might want it back.</p>
        <div class="tmenu"><button class="btn big" data-t="dl">Download save file</button><button class="btn danger big" data-t="name">Replace it and start fresh</button>${back}</div></div>`;
    else if (t === 'name') h = `<div class="tcard"><h2>Name your farmer</h2>
        <label class="field tname">Name <input id="tname" maxlength="14" placeholder="Farmer" autocomplete="off"></label>
        <div class="tmenu"><button class="btn pri big" data-t="go-tut">Start with a quick tutorial<small>About two minutes. Skip any time.</small></button>
        <button class="btn big" data-t="go">Start without the tutorial</button>${back}</div></div>`;
    else if (t === 'support') h = `<div class="tcard">${supportHTML()}<div class="tmenu">${back}</div></div>`;
    titleEl.className = 'title-' + t; titleEl.innerHTML = h; titleEl.hidden = false;
    const inp = $('#tname'); if (inp) inp.focus();
  }
  function startNewFarm(name, tut) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    newState(); migrate(); S.name = name || 'Farmer'; S.seenUpdate = latest().v;
    UI.yaw = 0; UI.yawTo = null; UI.tilt = 1; setView(0, 1); centerOn(idx(...D.map.spawn)); UI.sel = -1; UI.drawer = null; UI.html = {}; UI.logOpen = null;
    UI.hadSave = true; closeTitle(); save();
    if (tut) startTut(); else toast(`<b>Welcome to Harvestworks, ${esc(S.name)}.</b> Follow the goal card at the top left to get your homestead going.`, 'goal');
  }
  titleEl.addEventListener('click', e => {
    const el = e.target.closest('[data-t]'); if (!el) return; const a = el.dataset.t;
    if (a === 'main') openTitle('main');
    else if (a === 'continue') closeTitle();
    else if (a === 'new') openTitle(UI.hadSave ? 'confirm' : 'name');
    else if (a === 'name') openTitle('name');
    else if (a === 'dl') downloadSave();
    else if (a === 'support') openTitle('support');
    else if (a === 'load') { fileIn.value = ''; fileIn.click(); }
    else if (a === 'filecancel') { UI.tFile = null; renderTitle(); }
    else if (a === 'loadgo' && UI.tFile && UI.tFile.o) { const o = UI.tFile.o; adoptState(o); UI.hadSave = true; closeTitle();
      toast(`<b>Farm loaded.</b> Welcome back, ${esc(S.name)}: day ${S.day}, ${S.gold}g.`, 'goal'); logAct('Loaded this farm from a save file', 'you'); }
    else if (a === 'go' || a === 'go-tut') { const n = ($('#tname') || {}).value; startNewFarm((n || '').trim(), a === 'go-tut'); }
  });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tname') { e.preventDefault(); startNewFarm(e.target.value.trim(), true); } });

  /* ================= tutorial =================
     A short hands-on coach: each step waits for the player to actually do the thing, then moves on.
     Gameplay beyond planting is handed to the goal card, which already walks through it. */
  const farmIdx = () => { const f = D.map.structures.find(st => st[0] === 'farm'); return idx(f[1], f[2]); };
  const hasJob = a => (S.cur && S.cur.a === a && S.cur.i === farmIdx()) || S.queue.some(q => q.a === a && q.i === farmIdx());
  const TUT = [
    { t: 'Look around', d: () => isTouch() ? 'Drag with one finger to move around your land.' : 'Drag with the left mouse button to move around your land. The arrow keys work too.',
      done: b => Math.hypot(cam.u - b.u, cam.v - b.v) > 40 },
    { t: 'Zoom and turn', d: () => isTouch() ? 'Pinch to zoom. Twist two fingers to turn the world, or use ⟲ ⟳ on the right. ⌂ brings you back home.'
        : 'Scroll to zoom. Hold the right mouse button and push left or right to turn the world, up or down to tilt it. ⟲ ⟳ and ⌂ on the right do the same.',
      done: b => Math.abs(cam.z - b.z) > .08 || Math.abs(UI.yaw - b.yaw) > .15 || Math.abs(UI.tilt - b.tilt) > .05 },
    { t: 'Pick a tile', d: () => `${isTouch() ? 'Tap' : 'Click'} the <b>Farm Plot</b>: the bare patch of soil beside your house. Everything you can do there shows up in the panel.`,
      done: () => UI.sel === farmIdx(), skip: () => S.tiles[farmIdx()].b.st !== 'raw' },
    { t: 'Give your farmer a job', d: () => 'Press <b>Till soil</b> in the panel. Your farmer walks over and does the work. Jobs line up along the bottom of the screen; × cancels one.',
      done: () => hasJob('till') || S.tiles[farmIdx()].b.st !== 'raw' },
    { t: 'Plant something', d: () => 'When the soil is tilled, press <b>Plant Carrots</b> in the panel. Seeds come from storage; the Open Market sells more.',
      done: () => hasJob('plant') || !!S.tiles[farmIdx()].b.crop },
    { t: 'Follow the goal card', d: () => `The card at the top left always shows your next step: watering, harvesting, cooking, then contracts at the Order Board for gold and Discovery.${isPhone() ? ' Tap it to open or close it.' : ''}`, next: 'Next' },
    { t: 'You’re all set', d: () => 'Storage and the Menu are at the top right. The Menu saves, loads, lists every control, and can replay this tutorial. Have fun!', next: 'Start farming' }
  ];
  let tutBase = null;
  function startTut(n = 0) { S.tut = { n }; tutBase = { u: cam.u, v: cam.v, z: cam.z, yaw: UI.yaw, tilt: UI.tilt }; UI.html['#coach'] = null; dirty(); }
  function tutAdvance() { if (!S.tut) return; S.tut.n++; tutBase = { u: cam.u, v: cam.v, z: cam.z, yaw: UI.yaw, tilt: UI.tilt };
    if (S.tut.n >= TUT.length) endTut(false); else dirty(); }
  function endTut(skipped) { S.tut = null; $('#coach').hidden = true; UI.html['#coach'] = null; save(); if (skipped) toast('Tutorial skipped. You can replay it from the Menu.', 'info'); else toast('<b>Tutorial done.</b> Keep following the goal card.', 'goal'); }
  function tutTick() { if (!S || !S.tut || UI.title) return; const st = TUT[S.tut.n]; if (!st) return endTut(false);
    if (!tutBase) tutBase = { u: cam.u, v: cam.v, z: cam.z, yaw: UI.yaw, tilt: UI.tilt };
    if ((st.done && st.done(tutBase)) || (st.skip && st.skip())) { tutAdvance(); } }
  function renderCoach() { const el = $('#coach');
    if (!S.tut || UI.title) { el.hidden = true; return; } const n = S.tut.n, st = TUT[n]; if (!st) return;
    el.hidden = false;
    setHTML('#coach', `<div class="cstep">Tutorial · ${n + 1} of ${TUT.length}</div><b class="ct">${st.t}</b><p>${st.d()}</p>
      <div class="cbtns">${st.next ? `<button class="btn pri sm" data-tut-next>${st.next}</button>` : '<span class="cwait">Waiting for you…</span>'}<button class="linkish small" data-tut-skip>Skip tutorial</button></div>`); }

  window.HW = { get state() { return S; }, select(i) { UI.sel = i; dirty(); }, screenOf(i) { const [x, y] = toScreen(tx(i), ty(i)); return [x / DPR, y / DPR]; }, get sel() { return UI.sel; }, TASKS, checkTask, queueTask, update, newState: () => newState() };
  const h = window.claude && window.claude.hot;
  if (h && h.ready) h.ready(d => boot(d)); else boot(h && h.data);
})();
