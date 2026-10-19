/* Harvestworks — gameplay, rendering and UI.
   Reads content from HW_DATA (data.js) and sprites from HW_ART (art.js). */
(function () {
  'use strict';
  const D = window.HW_DATA, C = D.config, ART = window.HW_ART, SND = window.HW_SOUND;
  const QN = C.qualityNames, QM = C.qualityMult;
  // Three farm slots (slot 1 keeps the original key so existing farms stay put) and a separate slot for a race.
  const SLOT_KEYS = ['harvestworks.save.v1', 'harvestworks.save.v1.s2', 'harvestworks.save.v1.s3'], RACE_KEY = 'harvestworks.race.v1';
  let SLOT = (() => { try { return Math.max(0, Math.min(2, (+localStorage.getItem('harvestworks.slot')) || 0)); } catch (e) { return 0; } })();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let S = null;                                   // the whole saveable game state
  const UI = { cat: Object.assign({ buy: 'all', sell: 'all', inv: 'all', disc: 'all' }, (() => { try { return JSON.parse(localStorage.getItem('harvestworks.tabs')) || {}; } catch (e) { return {}; } })()), catShow: {}, yaw: 0, yawTo: null, tilt: 1, stick: null, sel: -1, hover: -1, drawer: null, mtab: 'buy', fert: false, confirmReset: false,
               floats: [], parts: [], labels: false, sq: {}, mq: {}, hcrop: null, hrec: null, dirty: true, saveIn: 8, savedAt: 0, html: {}, goalsOpen: true, smokeT: 0 };
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
    if (D.gather[t] && D.gather[t].stock) { const G = D.gather[t]; return G.deposit ? { stock: G.stock, rt: 0, dep: G.deposit } : { stock: G.stock, rt: 0 }; }
    return null;
  }
  /* Rock, clay and ore are finite: r.dep counts the digs left in the tile (what's on the surface included).
     Surface stock still comes back a bit at a time, but only out of what's left. Races and challenges don't run out. */
  const finite = T => T.r && T.r.dep != null && !(S && S.race);
  const worked = T => finite(T) && T.r.dep <= 0;
  const useDep = T => { if (finite(T) && !builderDay()) T.r.dep = Math.max(0, T.r.dep - 1); };
  const DEEPEN_COST = { gold: 250, plank: 6 };
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
    rollMarket(); expandWorld();
    return S;
  }
  /* ================= the wider world =================
     The world is a grid of 6×6 areas (C.worldRegions across). Your starting land fills the middle 2×2 and
     counts as one area; every area you survey adds one more. Unsurveyed tiles are 'void': never drawn or walked.
     Older 12×12 saves are lifted into the middle of the bigger world and every stored tile index is remapped. */
  const RS = () => C.regionSize, RW = () => S.w / C.regionSize;
  function expandWorld() {
    if (S.regions) return;
    const ow = S.w, oh = S.h, N = C.regionSize * C.worldRegions, off = (N - ow) / 2;
    const map = i => ((i / ow | 0) + off) * N + (i % ow) + off;
    const tiles = []; for (let k = 0; k < N * N; k++) tiles.push({ t: 'void', o: false, b: null, r: null, v: 0 });
    S.tiles.forEach((T, i) => { tiles[map(i)] = T; });
    S.tiles = tiles; S.w = N; S.h = N;
    const fix = t => { if (t && typeof t.i === 'number') t.i = map(t.i); };
    S.queue.forEach(fix); fix(S.cur);
    S.av.x += off; S.av.y += off; S.av.path = (S.av.path || []).map(map);
    if (S.helper) { S.helper.x += off; S.helper.y += off; S.helper.path = (S.helper.path || []).map(map); (S.helper.steps || []).forEach(fix); fix(S.helper.cur); }
    const R = C.worldRegions; S.regions = [];
    for (let k = 0; k < R * R; k++) { const rx = k % R, ry = k / R | 0, home = rx * RS() >= off && rx * RS() < off + ow && ry * RS() >= off && ry * RS() < off + oh;
      S.regions.push({ open: home, theme: home ? 'home' : themeAt(rx, ry) }); }
    S.surveys = 0; UI.live = null;
  }
  function themeAt(rx, ry) { const T = Object.keys(D.regionThemes); return T[(rx * 3 + ry * 5 + (rx * ry) % 3) % T.length]; }
  const regionOf = i => ((ty(i) / RS() | 0) * RW() + (tx(i) / RS() | 0));
  const regionTiles = r => { const x0 = (r % RW()) * RS(), y0 = (r / RW() | 0) * RS(), o = []; for (let y = 0; y < RS(); y++) for (let x = 0; x < RS(); x++) o.push(idx(x0 + x, y0 + y)); return o; };
  function regionNbrs(r) { const rx = r % RW(), ry = r / RW() | 0, o = []; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const x = rx + dx, y = ry + dy; if (x >= 0 && y >= 0 && x < RW() && y < RW()) o.push(y * RW() + x); }); return o; }
  /* Contracts run in order, except the new-land ones: if the next contract needs an area you haven't surveyed yet
     and a later one needs an area you have (or none at all), they swap, so you're never stuck waiting on land. */
  const hasLand = th => th === 'any' ? (S.surveys || 0) > 0 : S.regions.some(R => R.open && R.theme === th);
  const curMs = () => D.milestones[S.msOrd ? S.msOrd[S.ms] : S.ms];
  function fixMsOrder() { if (!S.msOrd) S.msOrd = D.milestones.map((m, k) => k); for (let k = 0; k < D.milestones.length; k++) if (!S.msOrd.includes(k)) S.msOrd.push(k);
    const O = S.msOrd, cur = D.milestones[O[S.ms]]; if (!cur || !cur.land || hasLand(cur.land)) return;
    for (let k = S.ms + 1; k < O.length; k++) { const m = D.milestones[O[k]]; if (!m.land || hasLand(m.land)) { [O[S.ms], O[k]] = [O[k], O[S.ms]]; return; } } }
  // a discovery is ready once its prerequisites are unlocked (animals also need your first new area surveyed)
  const discOk = d => d.req.every(unlocked) && (!d.survey || (S.surveys || 0) > 0);
  const surveyable = r => r >= 0 && S.regions[r] && !S.regions[r].open && regionNbrs(r).some(n => S.regions[n].open && S.regions[n].theme !== 'green');
  const areas = () => 1 + (S.surveys || 0);
  const isVoid = i => S.tiles[i].t === 'void';
  // Lay out a freshly surveyed area: weighted terrain from its theme, smoothed once so like joins like.
  function genRegion(r) {
    const th = D.regionThemes[S.regions[r].theme], ids = regionTiles(r), rnd = (seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(r * 7919 + 101);
    const keys = Object.keys(th.mix), tot = keys.reduce((n, k) => n + th.mix[k], 0);
    const pickT = () => { let x = rnd() * tot; for (const k of keys) { x -= th.mix[k]; if (x <= 0) return k; } return keys[0]; };
    const t = {}; ids.forEach(i => { t[i] = pickT(); });
    ids.forEach(i => { const c = {}; nbrs(i).forEach(n => { if (t[n]) c[t[n]] = (c[t[n]] || 0) + 1; }); const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; if (best && c[best] >= 3) t[i] = best; });
    const special = keys.find(k => D.gather[k] && D.gather[k].action === 'gather');
    if (special && !ids.some(i => t[i] === special)) t[ids[(rnd() * ids.length) | 0]] = special; // every area shows its resource
    ids.forEach(i => { S.tiles[i] = { t: t[i], o: false, b: null, r: initRes(t[i]), v: (tx(i) * 7 + ty(i) * 13) % 3 }; });
  }
  function surveyCost() { const n = S.surveys || 0, V = C.survey, c = { gold: Math.round(V.gold * Math.pow(V.goldMult, n) / 50) * 50, fence_kit: V.fence + n, plank: V.plank + V.plankStep * n };
    if (n >= V.brickFrom) c.brick = V.brick + V.brickStep * (n - V.brickFrom);
    if (n >= V.roofFrom && hasLand('claybank')) c.roof_tile = V.roof + V.roofStep * (n - V.roofFrom);
    return c; }
  const homeIdx = () => S.tiles.findIndex(T => T.b && T.b.type === 'homestead');
  const startOff = () => (S.w - D.map.rows[0].length) / 2;
  // Bring older saves up to date: new fields get defaults, nothing existing changes.
  function migrate() {
    S.tools = Object.assign(Object.fromEntries(Object.keys(D.tools).map(k => [k, 0])), S.tools || {});
    if (S.helper === undefined) S.helper = null;
    if (!S.log) S.log = [];
    if (!S.tick) S.tick = { open: !isPhone(), spd: 'slow' }; // phones start with the ticker tucked away, for more map
    if (!S.wk) weekStart();
    if (!S.mode) S.mode = 'online'; // farms from before modes existed were all part of the valley
    if (!S.fid) S.fid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
    expandWorld(); UI.live = null; fixMsOrder();
    S.tiles.forEach(T => { const G = D.gather[T.t]; if (G && G.deposit && T.r && T.r.stock != null && T.r.dep == null) T.r.dep = Math.max(G.deposit, T.r.stock); });
  }
  const idx = (x, y) => y * S.w + x, tx = i => i % S.w, ty = i => (i / S.w) | 0;
  const inB = (x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function nbrs(i) { const x = tx(i), y = ty(i), o = []; N4.forEach(([dx, dy]) => inB(x + dx, y + dy) && o.push(idx(x + dx, y + dy))); return o; }
  const walkable = i => S.tiles[i].o && D.terrain[S.tiles[i].t].walk;
  const unlocked = id => !id || S.unl.includes(id);
  // Storage = the Homestead's level plus every storage building you've placed.
  const G_ = () => D.homeGrowth, nList = () => D.homeUpgrades.length;
  const homeCap = l => l < C.capacity.length ? C.capacity[l] : C.capacity[C.capacity.length - 1] + (unlocked('granary') ? G_().granary : G_().cap) * (l - C.capacity.length + 1);
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
  function canPay(cost) { for (const k in cost) { if (k === 'gold') { if (S.gold < cost.gold) return `Needs ${cost.gold}g`; } else if (count(k) < cost[k]) return `Needs ${cost[k]} ${D.items[k].name}` + (k === 'stone' ? ' (break boulders on a Boulder Field, or buy at the market)' : k === 'fence_kit' ? (unlocked('workbench') ? ` (make ${cost[k] > 1 ? 'them' : 'it'} at the Workbench: ${inTxt(D.recipes.fence_kit.in)} each)` : ' (unlock the Workbench in Discoveries first, then make Land Kits there)') : ''); } return null; }
  function pay(cost) { for (const k in cost) { if (k === 'gold') S.gold -= cost.gold; else take(k, cost[k]); } }
  // every ingredient of a price, with what you have: ✓ when covered, the shortfall when not
  function costList(cost) {
    return `<ul class="costlist">${Object.entries(cost).map(([k, n]) => { const have = k === 'gold' ? S.gold : count(k), ok = have >= n;
      return `<li class="${ok ? 'ok' : 'short'}">${k === 'gold' ? '<span class="coin"></span>' : ico(k)}<b>${n}${k === 'gold' ? 'g' : ' ' + esc(D.items[k].name)}</b><span>${ok ? '✓ have ' + have : `have ${have}, need ${n - have} more`}</span></li>`; }).join('')}</ul>`; }
  function costTxt(cost) { return Object.entries(cost).map(([k, n]) => k === 'gold' ? `${n}g` : `${n} ${D.items[k].name}`).join(' + ') || 'Free'; }
  // Seeds and supplies sell back for half their market price.
  const baseValue = id => D.items[id].value || Math.max(1, Math.floor((D.items[id].buy || 2) / 2));
  function sellPrice(id, q) { const d = S.market.demand; return Math.max(1, Math.round(baseValue(id) * QM[q] * (d && d.item === id ? 1 + d.pct / 100 : 1) * mult(id) * wrule('sell', 1) * seasonSell(id) * (1 + mastPerk(id, 'sell')))); }
  /* ================= mastery =================
     Each crop and animal good counts what this farm has produced. Targets are points (units × base value), shown
     as units rounded to friendly numbers. Off in races and weekly challenges (no counting, no perks). */
  const MAS = D.mastery, isMast = id => MAS.items.includes(id);
  const niceN = n => n < 100 ? Math.max(5, Math.round(n / 5) * 5) : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100;
  const mastNeed = (id, t) => niceN(MAS.tiers[t].pts / (D.items[id].value || 1));
  const mastN = id => (S.mast && S.mast[id]) || 0;
  function mastTierRaw(id) { const n = mastN(id); let t = 0; while (t < MAS.tiers.length && n >= mastNeed(id, t)) t++; return t; }
  const mastTier = id => S.race || !isMast(id) ? 0 : mastTierRaw(id);
  const mastPerk = (id, k) => { const t = mastTier(id); return t ? MAS.tiers[t - 1][k] : 0; };
  // every Nth harvest/batch from Gold up gives one more, if storage has room
  function mastExtra(id, roomFor) { const e = mastPerk(id, 'extra'); if (!e) return 0; S.mastX = S.mastX || {};
    S.mastX[id] = (S.mastX[id] || 0) + 1; return S.mastX[id] % e === 0 && roomFor ? 1 : 0; }
  function mastAdd(id, n, i) { if (S.race || !isMast(id) || n <= 0) return; S.mast = S.mast || {};
    const was = mastTierRaw(id); S.mast[id] = mastN(id) + n; const now = mastTierRaw(id);
    for (let t = was + 1; t <= now; t++) { const T = MAS.tiers[t - 1], nm = D.items[id].name;
      S.dp += T.dp; SND.play('goal'); if (i !== undefined) float(i, `${nm} mastery: ${T.name}!`, '#f6d24a');
      toast(`<b>${esc(nm)} mastery: ${T.name}</b> · +${T.dp} Discovery. ${esc(mastPerkTxt(id, t))}`, 'disc'); } }
  const extraWord = e => e === 2 ? 'second' : e === 3 ? 'third' : 'fourth';
  function mastPerkTxt(id, t) { if (!t) return 'No perks yet.'; const T = MAS.tiers[t - 1], nm = D.items[id].name, crop = Object.values(D.crops).some(c => c.item === id);
    const o = [`sells for ${Math.round(T.sell * 100)}% more`];
    if (T.speed) o.push(`${crop ? 'grows' : 'is made'} ${Math.round(T.speed * 100)}% faster`);
    if (T.extra) o.push(`every ${extraWord(T.extra)} ${crop ? 'harvest' : 'batch'} gives one extra`);
    return `${nm} now ${nmList(o)}.`; }
  const mastBadge = id => { const t = mastTier(id); return t ? `<span class="mtier ${MAS.tiers[t - 1].id}" title="${esc(D.items[id].name)} mastery: ${MAS.tiers[t - 1].name}">${t >= 4 ? '★' : ''}${MAS.tiers[t - 1].name}</span>` : ''; };
  function mastRow(id, full) { const t = mastTierRaw(id), n = mastN(id), nx = t < MAS.tiers.length ? mastNeed(id, t) : 0;
    const pct = nx ? Math.min(100, Math.round(n / nx * 100)) : 100;
    const line = nx ? `${n.toLocaleString()} / ${nx.toLocaleString()} for ${MAS.tiers[t].name}` : `${n.toLocaleString()} made · fully mastered`;
    return `<div class="mrow ${t ? MAS.tiers[t - 1].id : 'none'}">${full ? ico(id) : ''}<div class="grow1"><div class="mtop">${full ? `<b>${esc(D.items[id].name)}</b>` : '<b>Mastery</b>'}${t ? `<span class="mtier ${MAS.tiers[t - 1].id}">${t >= 4 ? '★' : ''}${MAS.tiers[t - 1].name}</span>` : '<span class="mtier none">No tier yet</span>'}</div>
      <div class="mbar"><i style="width:${pct}%"></i></div><small>${line}</small>${t ? `<small class="mperk">${esc(mastPerkTxt(id, t))}</small>` : ''}</div></div>`; }

  /* ================= daily puzzle =================
     One riddle chain a day (UTC day), built only from goods this farm can make right now, so every step is solvable.
     Farms that can make the same goods get the same puzzle. The first clue is a riddle (data.js daily.riddles); each
     later clue is written from a recipe that links the last answer to the next, and is only used if exactly one good
     this farm can make fits it. Handing in the right goods reveals the next clue. Off in races and weekly challenges. */
  const DQ = D.daily, DQ_CATS = ['crop', 'gathered', 'good', 'component'], DQ_ANIM = ['coop', 'dairy', 'pasture', 'hive', 'shed'];
  const dqAns = id => !!D.items[id] && DQ_CATS.includes(D.items[id].cat);
  const dqDayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  // what this farm can make: origin per good, and the recipes it can run (station built, recipe unlocked, inputs makeable)
  function dqGraph() {
    const P = {}, has = (f) => S.tiles.some(f);
    Object.values(D.crops).forEach(c => { const sd = D.items[c.seed]; if (!sd.requires || unlocked(sd.requires)) P[c.item] = 'crop'; });
    Object.entries(D.gather).forEach(([t, G]) => { if (unlocked(G.needs) && has(T => T.o && T.t === t)) Object.keys(gatherOut(t, G.action)).forEach(k => { if (k !== 'sapling' && !P[k]) P[k] = 'gathered'; }); });
    const recs = Object.entries(D.recipes).filter(([, R]) => unlocked(R.requires) && has(T => T.b && T.b.type === R.station));
    let grew = true;
    while (grew) { grew = false; recs.forEach(([, R]) => { if (Object.keys(R.in).every(k => P[k])) Object.keys(R.out).forEach(k => { if (!P[k]) { P[k] = DQ_ANIM.includes(R.station) ? 'animal' : 'made'; grew = true; } }); }); }
    const RL = recs.filter(([, R]) => Object.keys(R.in).every(k => P[k])).map(([rid, R]) => ({ rid, st: R.station, ins: Object.keys(R.in), out: Object.keys(R.out)[0] })).filter(r => dqAns(r.out));
    return { P, RL, A: Object.keys(P).filter(dqAns).sort() };
  }
  const dqQty = id => Math.max(2, Math.min(10, Math.round(80 / (D.items[id].value || 5))));
  const ORIGIN = { crop: 'a crop from your fields', gathered: 'something you gather from the land', animal: 'something your animals give you', made: 'something made at a station' };
  // every clue that leads from good a to good b; each has a test so we can keep only clues with one possible answer
  function dqLinks(a, G) {
    const N = id => D.items[id].name, SN = s => D.buildings[s].name, L = G.RL, out = [];
    const makesAt = (x, s) => L.some(r => r.out === x && r.st === s);
    const onlyMaker = x => { const st = [...new Set(L.filter(r => r.out === x).map(r => r.st))]; return st.length === 1 && L.filter(r => r.st === st[0]).every(r => r.out === x) ? st[0] : null; };
    // up: b is made from a
    L.filter(r => r.ins.includes(a)).forEach(r => { const b = r.out, o = r.ins.filter(k => k !== a), q = dqQty(b), lead = `Your ${N(a)} is only the beginning.`;
      out.push({ b, kind: 'up', st: r.st, text: `${lead} Take it to the ${SN(r.st)}${o.length ? ` with ${nmList(o.map(N))}` : ''} and bring me ${q} of what comes out.`, test: x => L.some(s => s.out === x && s.st === r.st && s.ins.includes(a) && o.every(k => s.ins.includes(k))) });
      if (o.length) {
        out.push({ b, kind: 'up', st: r.st, hard: 1, text: `Carry your ${N(a)} to the ${SN(r.st)}. Bring me ${q} of something it helps make there.`, test: x => L.some(s => s.out === x && s.st === r.st && s.ins.includes(a)) });
        out.push({ b, kind: 'up', st: r.st, text: `Put your ${N(a)} together with ${nmList(o.map(N))}. Bring me ${q} of what you get.`, test: x => L.some(s => s.out === x && s.ins.includes(a) && o.every(k => s.ins.includes(k))) });
        if (o.length === 1) { const m = onlyMaker(o[0]); if (m) out.push({ b, kind: 'up', st: r.st, hard: 1, text: `Your ${N(a)} needs a partner: whatever the ${SN(m)} makes. Bring them together and bring me ${q} of the result.`, test: x => L.some(s => s.out === x && s.ins.includes(a) && s.ins.some(k => k !== a && makesAt(k, m))) }); }
      } else if (DQ.made[r.st]) out.push({ b, kind: 'up', st: r.st, hard: 1, text: `Bring me ${q} of what your ${N(a)} becomes when it is ${DQ.made[r.st]}.`, test: x => L.some(s => s.out === x && s.st === r.st && s.ins.includes(a)) });
    });
    // down: b goes into a
    L.filter(r => r.out === a).forEach(r => r.ins.forEach(b => { const q = dqQty(b), o = r.ins.filter(k => k !== b), og = G.P[b];
      out.push({ b, kind: 'down', st: null, hard: 1, text: `Go back to where your ${N(a)} started. It is made from ${ORIGIN[og]}. Bring me ${q} of that.`, test: x => G.P[x] === og && L.some(s => s.out === a && s.ins.includes(x)) });
      if (o.length) out.push({ b, kind: 'down', st: null, text: `What else does the ${SN(r.st)} need to make ${N(a)}, besides ${nmList(o.map(N))}? Bring me ${q}.`, test: x => !o.includes(x) && L.some(s => s.out === a && s.st === r.st && s.ins.includes(x) && o.every(k => s.ins.includes(k))) });
    }));
    // side: b is made at the same station as a, from something else
    L.filter(r => r.out === a).forEach(ra => L.filter(r => r.st === ra.st && r.out !== a).forEach(r => { const b = r.out, q = dqQty(b), same = s => s.ins.length === r.ins.length && r.ins.every(k => s.ins.includes(k));
      out.push({ b, kind: 'side', st: r.st, text: `The ${SN(r.st)} that makes your ${N(a)} has another trick: it turns ${nmList(r.ins.map(N))} into something else. Bring me ${q} of it.`, test: x => x !== a && L.some(s => s.out === x && s.st === r.st && same(s)) });
      out.push({ b, kind: 'side', st: r.st, hard: 1, text: `Whatever made your ${N(a)} can also turn ${nmList(r.ins.map(N))} into something. Bring me ${q} of it.`, test: x => x !== a && L.some(s => s.out === x && makesAt(a, s.st) && same(s)) });
    }));
    return out.filter(l => dqAns(l.b));
  }
  function dqMake(day) {
    const G = dqGraph(); if (G.A.length < 6) return null;
    const rnd = raceRng('daily|' + day + '|' + G.A.join(',')), pick = a => a[Math.floor(rnd() * a.length)];
    const n = G.A.length >= DQ.steps.bigAt ? DQ.steps.big : DQ.steps.small;
    const starts = G.A.filter(id => DQ.riddles[id] && G.RL.some(r => r.ins.includes(id)));
    if (!starts.length) return null;
    let best = null;
    for (let tries = 0; tries < 60 && !(best && best.length >= n); tries++) {
      const a0 = pick(starts), chain = [{ id: a0, q: dqQty(a0), text: `${pick(DQ.riddles[a0])} Bring me ${dqQty(a0)}.`, st: null }];
      while (chain.length < n) {
        const a = chain[chain.length - 1].id, used = chain.map(c => c.id), last = chain.length === n - 1;
        // keep clues that point to exactly one good; lean toward making things (up), toward harder wording, and toward
        // finer goods for the last step
        const ok = dqLinks(a, G).filter(l => !used.includes(l.b)).filter(l => { const c = G.A.filter(l.test); return c.length === 1 && c[0] === l.b; })
          .map(l => { const prev = chain[chain.length - 1], kinds = chain.map(c => c.kind);
            return { l, w: rnd() + (l.kind === 'up' ? .8 : l.kind === 'side' ? .1 : .2) + (l.hard ? .35 : 0) // making things, harder wording
              + (last ? (D.items[l.b].value || 0) / 120 : G.RL.some(r => r.ins.includes(l.b)) ? .4 : 0) // finer goods last; otherwise keep the chain going
              - (l.st && l.st === prev.st ? .7 : 0) - (kinds.includes(l.kind) && l.kind !== 'up' ? .9 : 0) }; }) // move between stations; at most one side and one down step
          .sort((x, y) => y.w - x.w);
        if (!ok.length) break;
        const l = ok[0].l; chain.push({ id: l.b, q: dqQty(l.b), text: l.text, st: l.st, kind: l.kind });
      }
      if (!best || chain.length > best.length) best = chain;
    }
    if (!best || best.length < 3) return null;
    const lastStep = best[best.length - 1];
    if (S.maxQ >= 1 && rnd() < .5) { lastStep.minQ = 1; lastStep.text += ` They must be ${QN[1]} quality or better.`; }
    return { day, steps: best.map(c => ({ id: c.id, q: c.q, minQ: c.minQ || 0, text: c.text, st: c.st })), at: 0, wrong: 0, hints: best.map(() => 0), gold: 0, done: false };
  }
  // today's puzzle, made the first time it's asked for each UTC day (and then fixed for the day)
  function dqToday() {
    if (!S || S.race || S.goal < D.goals.length) return null;
    const day = utcDay(); if (S.daily && S.daily.day === day) return S.daily.none ? null : S.daily;
    S.daily = dqMake(day) || { day, none: true }; save(); return S.daily.none ? null : S.daily;
  }
  const dqStreak = () => { const s = S.dqStreak; if (!s) return 0; const d = utcDay(); return s.last === d || s.last === dqDayBefore(d) ? s.n : 0; };
  const dqStepGold = st => Math.round((D.items[st.id].value || 5) * st.q * DQ.reward.stepGold * (st.minQ ? 1.5 : 1));
  const dqHintCost = (st, lv) => Math.max(10, Math.ceil(dqStepGold(st) * DQ.reward.hint[lv]));
  function dqHintText(st, lv) { const og = dqGraph().P[st.id];
    if (lv >= 2) return `The answer is <b>${esc(D.items[st.id].name)}</b>.`;
    return st.st ? `It is made at the ${esc(D.buildings[st.st].name)}.` : og === 'crop' ? 'It grows in your fields.' : og === 'gathered' ? 'You gather it from the land.' : og === 'animal' ? 'Your animals make it.' : 'It is made at one of your stations.'; }
  function dqHint() { const P = dqToday(); if (!P || P.done) return; const st = P.steps[P.at], lv = P.hints[P.at]; if (lv >= 2) return;
    const c = dqHintCost(st, lv); if (S.gold < c) { toast(`A hint costs <b>${c}g</b>.`, 'warn'); return; }
    S.gold -= c; P.hints[P.at] = lv + 1; save(); dirty(); }
  function dqGive(id) { const P = dqToday(); if (!P || P.done) return; const st = P.steps[P.at];
    if (id !== st.id) { P.wrong++; UI.dqPick = false; save(); SND.play('warn'); toast(`<b>${esc(D.items[id].name)}</b> isn’t it. Nothing was taken. Read the clue again${P.hints[P.at] < 2 ? ' or buy a hint' : ''}.`, 'warn'); dirty(); return; }
    if (count(id, st.minQ) < st.q) { toast(`Right answer, but you need ${st.q}${st.minQ ? ` ${QN[st.minQ]}+` : ''} ${esc(D.items[id].name)} and have ${count(id, st.minQ)}.`, 'warn'); return; }
    take(id, st.q, st.minQ, 'low'); const g = dqStepGold(st); S.gold += g; P.gold += g; P.at++; UI.dqPick = false; SND.play('goal');
    if (P.at < P.steps.length) toast(`<b>Daily Puzzle: step ${P.at} solved!</b> +${g}g. A new clue is waiting.`, 'goal');
    else { P.done = true; const name2 = P.hints.some(h => h >= 2), dp = Math.max(1, DQ.reward.dp - (name2 ? 1 : 0) - (P.wrong >= 3 ? 1 : 0));
      const d = utcDay(), s = S.dqStreak || { n: 0, last: null }; s.n = s.last === dqDayBefore(d) ? s.n + 1 : s.last === d ? s.n : 1; s.last = d; S.dqStreak = s;
      const bonus = s.n % DQ.reward.streakEvery === 0 ? DQ.reward.streakDp : 0; S.dp += dp + bonus; P.dp = dp + bonus; gainScore(P.gold);
      SND.play('contract'); toast(`<b>Daily Puzzle solved!</b> +${dp} Discovery${bonus ? ` and +${bonus} for a ${s.n}-day streak` : ''}. ${s.n > 1 ? `Streak: ${s.n} days.` : 'Come back tomorrow for a new one.'}`, 'disc'); }
    save(); dirty(); }
  const dqMenuSub = () => { if (S.race) return 'Off during races and challenges'; if (S.goal < D.goals.length) return 'Opens after the tutorial'; const P = dqToday();
    return !P ? 'Make a few more goods to unlock it' : P.done ? `Solved today${dqStreak() > 1 ? ` · ${dqStreak()}-day streak` : ''}` : `Step ${P.at + 1} of ${P.steps.length}${dqStreak() ? ` · ${dqStreak()}-day streak` : ''}`; };
  function dqLeft() { const n = new Date(Date.now() - (NET.monSkew || 0)), m = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime(), h = Math.floor(m / 36e5), mi = Math.floor(m % 36e5 / 6e4); return h ? `${h}h ${mi}m` : `${mi}m`; }
  function dqDrawer() {
    let h = `<div class="phead"><div><h2>Daily Puzzle</h2><p class="sub">A new riddle chain every day at 00:00 UTC. Solve a clue by handing in the goods it points to; each answer reveals the next clue.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
    if (S.race) return h + '<p class="hint">The Daily Puzzle is off during races and weekly challenges. It waits for you on your own farm.</p>';
    if (S.goal < D.goals.length) return h + '<p class="hint">Finish the tutorial goals first; the Daily Puzzle opens after that.</p>';
    const P = dqToday();
    if (!P) return h + '<p class="hint">Your farm needs a few more goods it can make before a puzzle can be built for it. Build another station or two and check back.</p>';
    const sk = dqStreak();
    h += `<p class="dqmeta">${P.done ? 'Solved' : `Step <b>${P.at + 1}</b> of ${P.steps.length}`} · ${sk ? `streak <b>${sk}</b> day${sk === 1 ? '' : 's'}` : 'no streak yet'} · new puzzle in ${dqLeft()}</p><ol class="dqlist">`;
    P.steps.forEach((st, k) => {
      if (k < P.at) h += `<li class="dqstep done"><p class="dqclue">${esc(st.text)}</p><div class="dqans">${ico(st.id)} <b>${esc(D.items[st.id].name)}</b> ×${st.q} <span class="ok">✓ +${dqStepGold(st)}g</span></div></li>`;
      else if (k === P.at && !P.done) {
        const lv = P.hints[k], have = count(st.id, st.minQ);
        h += `<li class="dqstep now"><p class="dqclue">${esc(st.text)}</p>`;
        for (let j = 0; j < lv; j++) h += `<p class="dqhint">Hint: ${dqHintText(st, j + 1)}</p>`;
        if (lv >= 2) h += `<p class="hint small">You have ${have} of ${st.q}.</p>`;
        h += `<div class="dqbtns"><button class="btn pri" data-dq-pick>${UI.dqPick ? 'Close' : 'Hand in an answer'}<small>Reward ${dqStepGold(st)}g</small></button>${lv < 2 ? `<button class="btn" data-dq-hint ${S.gold < dqHintCost(st, lv) ? 'disabled' : ''}>${lv ? 'Name the answer' : 'Get a hint'}<small>${dqHintCost(st, lv)}g</small></button>` : ''}</div>`;
        if (UI.dqPick) { const ids = Object.keys(S.inv).filter(id => dqAns(id) && count(id, st.minQ) >= st.q).sort((a, b) => D.items[a].name.localeCompare(D.items[b].name));
          h += `<div class="dqpick">${ids.length ? ids.map(id => `<button class="chipf" data-dq-give="${id}">${ico(id)}${esc(D.items[id].name)} <small>${count(id, st.minQ)}</small></button>`).join('') : `<p class="hint small">You don’t have ${st.q}${st.minQ ? ` ${QN[st.minQ]}+` : ''} of any good yet. Work out the answer, make it, then come back.</p>`}</div>
            <p class="hint small">Only goods you have at least ${st.q} of${st.minQ ? ` (${QN[st.minQ]} or better)` : ''} are shown. A wrong guess takes nothing, but three or more lower today’s Discovery reward.</p>`; }
        h += `</li>`; }
      else h += `<li class="dqstep later"><p class="dqclue muted">Solve the clue above to reveal this one.</p></li>`;
    });
    h += '</ol>';
    if (P.done) h += `<div class="dqdone"><b>Solved!</b> You earned ${P.gold}g and ${P.dp || 0} Discovery today${P.wrong ? ` (${P.wrong} wrong guess${P.wrong === 1 ? '' : 'es'})` : ''}. A new puzzle arrives in ${dqLeft()}.</div>`;
    h += `<p class="hint small">Every clue points to exactly one good your farm can make today. Clues often lead from your last answer: what it goes into, what it comes from, or what else the same station makes. Finish for ${DQ.reward.dp} Discovery (less after naming an answer or three wrong guesses), plus ${DQ.reward.streakDp} more every ${DQ.reward.streakEvery} days in a row.</p>`;
    return h; }
  // once a day, a nudge when a fresh puzzle is waiting
  function dqNotice() { if (!S || S.race || UI.title) return; const P = dqToday(); if (!P || P.done || P.at > 0) return;
    const k = 'harvestworks.dqseen', d = utcDay(); if (lsGet(k, '') === d + '|' + (S.fid || '')) return; lsSet(k, d + '|' + (S.fid || ''));
    toast('<b>A new Daily Puzzle is ready.</b> Open it from the Menu.', 'goal'); }

  /* ================= progression ================= */
  /* Weekly challenge rules (see weeklyThemes in data.js). Outside a weekly run every rule is neutral. */
  const wrule = (k, d) => (S && S.race && S.race.rules && S.race.rules[k] != null) ? S.race.rules[k] : d;
  const scoreMult = tags => { const sc = wrule('score', null); if (!sc) return 1; let m = 1; new Set(tags).forEach(t => { if (sc[t]) m *= sc[t]; }); return m; };
  /* ================= seasons and weather =================
     A 28-day year of four 7-day seasons (see seasons in data.js). Each day's weather is rolled from the farm's id and
     the day number, so a reload gives the same day, and kept in S.wx once the day starts. Races and weekly challenge
     runs have no seasons or weather (always a fair spring day), so every racer plays the same game. */
  const SR = D.seasonRules, YEAR = SR.len * D.seasons.length;
  const noSeasons = () => !S || !!S.race;
  const seasonIdx = (d = S.day) => noSeasons() ? 0 : Math.floor(((d - 1) % YEAR) / SR.len);
  const season = d => D.seasons[seasonIdx(d)];
  const seasonDay = (d = S.day) => ((d - 1) % SR.len) + 1;
  const yearOf = (d = S.day) => Math.floor((d - 1) / YEAR) + 1;
  function wxRand(d, salt) { const s = (S.fid || 'farm') + ':' + d + ':' + salt; let a = 2166136261;
    for (let k = 0; k < s.length; k++) { a ^= s.charCodeAt(k); a = Math.imul(a, 16777619); }
    a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function rollWeather(d) {
    if (d <= 1) return 'clear';
    const se = season(d), w = Object.assign({}, se.wx, seasonDay(d) >= 5 && se.late ? se.late : {});
    // while the tutorial is running, keep it gentle so "water the seedlings" never gets rained off
    if (S.goal < D.goals.length) Object.keys(w).forEach(k => { if (!['clear', 'sun', 'mist'].includes(k)) delete w[k]; });
    const keys = Object.keys(w), tot = keys.reduce((n, k) => n + w[k], 0); let x = wxRand(d, 'w') * tot;
    for (const k of keys) { x -= w[k]; if (x <= 0) return k; } return keys[0] || 'clear'; }
  function weatherOn(d = S.day) { if (noSeasons()) return 'clear';
    if (d === S.day) { if (!S.wx || S.wx.d !== d || !D.weather[S.wx.k]) S.wx = { d, k: rollWeather(d) }; return S.wx.k; }
    return rollWeather(d); }
  const wxNow = () => weatherOn(S.day);
  const rainCache = {};
  function rainWin(d) { const k = (S.fid || '') + d; if (!rainCache[k]) { const s = 6 + Math.floor(wxRand(d, 'rs') * 6); rainCache[k] = [s, Math.min(22, s + 5 + Math.floor(wxRand(d, 'rl') * 6))]; } return rainCache[k]; }
  const raining = () => wxNow() === 'rain' && hour() >= rainWin(S.day)[0] && hour() < rainWin(S.day)[1];
  const frosty = () => wxNow() === 'frost' && hour() < SR.frostEnds;
  const cropInSeason = (c, d) => !noSeasons() && season(d).crops.includes(c);
  const inSeason = (id, d) => !noSeasons() && (season(d).goods.includes(id) || season(d).crops.some(c => D.crops[c].item === id));
  const seasonSell = id => inSeason(id) ? SR.sell : 1;
  // Cold Frames make every crop behave as hardy
  const hardy = c => !!D.crops[c].hardy || unlocked('coldframes');
  const snowBlocks = c => wxNow() === 'snow' && !hardy(c);
  function seasonGrow(c) { if (noSeasons()) return 1; const cr = D.crops[c]; let m = 1;
    if (cropInSeason(c)) m *= SR.grow; else if (season().id === 'winter' && !hardy(c)) m *= SR.winterGrow;
    if (wxNow() === 'sun') m *= SR.sunGrow; if (frosty() && !hardy(c)) m *= SR.frostGrow; return m; }
  // what's changing this crop's growth right now, in words (farm plot panel)
  function growNote(c) { if (noSeasons()) return ''; const cr = D.crops[c], o = [];
    if (cropInSeason(c)) o.push(`in season: ${Math.round((SR.grow - 1) * 100)}% faster`); else if (season().id === 'winter' && !hardy(c)) o.push(`winter: ${Math.round((1 - SR.winterGrow) * 100)}% slower`);
    if (wxNow() === 'sun') o.push(`sunny: ${Math.round((SR.sunGrow - 1) * 100)}% faster`);
    if (frosty() && !hardy(c)) o.push(`frost: half speed until ${SR.frostEnds}:00`);
    if (raining()) o.push('the rain is watering it');
    if (wxNow() === 'heat') o.push('heat: the soil dries quickly');
    return o.join(' · '); }
  const wxName = k => D.weather[k].name;
  const nameList = ids => nmList(ids.map(id => D.items[id] ? D.items[id].name : D.crops[id].name));
  const cropList = ids => nmList(ids.map(c => D.crops[c].name));
  function wxLine(d) { const k = weatherOn(d); if (k !== 'rain') return D.weather[k].text; const [a, b] = rainWin(d); return `Rain from ${a}:00 to ${b}:00. While it falls it waters every growing crop, and that counts as watering for quality.`; }
  // ground art and music follow the season; a snow day turns the scenery white
  const sceneKey = () => noSeasons() ? 'spring' : wxNow() === 'snow' ? 'snow' : season().id;
  function gainScore(n, i, ...tags) { n = Math.round(n * (tags.length ? scoreMult(tags) : 1)); if (n <= 0) return; S.score += n; if (i !== undefined) float(i, `+${n}`, '#f6e27a'); }
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
    const g = D.goals[S.goal]; S.goal++; S.gold += g.reward || 0; SND.play('goal');
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
  let PLAYER = (() => { try { let id = localStorage.getItem('harvestworks.player');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('harvestworks.player', id); } return id; } catch (e) { return crypto.randomUUID(); } })();
  async function rpc(fn, body) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(NET.url + fn, { method: 'POST', signal: ctl.signal, headers: { apikey: NET.key, Authorization: 'Bearer ' + NET.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(tm); }
  }
  /* Farm modes: 'online' (Online Valley: shared market prices, ticker, leaderboard) or 'private' (no connection to anyone).
     Races are their own thing. A farm can go from online to private, never back. */
  const online = () => S && S.mode !== 'private' && !S.race;
  const MODES = { online: { name: 'Online Valley', blurb: 'Shared market prices, the valley ticker and the leaderboard' }, private: { name: 'Private farm', blurb: 'Just you, on your own time. No leaderboard, no shared prices' } };
  /* leaderboard: each farm reports its score and day once an in-game day; the board is read when opened */
  const LB_MIN_DAYS = 7;
  function sendScore() { if (!NET.ok || !S.fid || !online()) return;
    rpc('submit_score', { p_farm: S.fid, p_player: PLAYER, p_name: S.name || 'Farmer', p_show: S.lbShow !== false, p_score: Math.floor(S.score), p_days: S.day }).catch(() => {}); }
  // A locked-in name belongs to this device's player and is unique across the valley.
  NET.myName = (() => { try { return localStorage.getItem('harvestworks.lbname') || null; } catch (e) { return null; } })();
  const setMyName = n => { NET.myName = n; try { n ? localStorage.setItem('harvestworks.lbname', n) : localStorage.removeItem('harvestworks.lbname'); } catch (e) { } };
  async function fetchMyName() { try { const r = await rpc('my_name', { p_player: PLAYER }); setMyName(r && r.name || null); dirty(); } catch (e) { } }
  async function claimName(name) {
    UI.claim = { busy: true }; dirty(); if (UI.title) renderTitle();
    if (!NET.ok) await pullMarket();
    if (!NET.ok) { UI.claim = { err: 'Locking a name needs the shared valley connection (web version).' }; dirty(); if (UI.title) renderTitle(); return; }
    try { const r = await rpc('claim_name', { p_player: PLAYER, p_name: name });
      if (r.ok) { setMyName(r.name); UI.claim = { done: r.name }; UI.lbDraft = null; UI.lbEdit = false; sendScore(); toast(`<b>Name locked in:</b> ${esc(r.name)} ✓`, 'goal');
        if (UI.title === 'weekly') rpc('weekly_board', { p_player: PLAYER }).then(b => { UI.wk = b; if (UI.title === 'weekly') renderTitle(); }).catch(() => {}); }
      else if (r.taken) UI.claim = { taken: name, suggestion: r.suggestion };
      else UI.claim = { err: r.error || 'Couldn’t lock that name.' };
    } catch (e) { UI.claim = { err: 'Couldn’t reach the valley. Try again in a moment.' }; }
    dirty(); if (UI.title) renderTitle(); }
  /* cloud backup: the farm (as a compressed save code) is stored on the valley server under a secret 12-letter
     backup code. Typing the code on any device brings the farm back. Backs up on its own every ~10 minutes of play. */
  const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => { const a = new Uint32Array(12); crypto.getRandomValues(a); return Array.from(a, n => CODE_ABC[n % CODE_ABC.length]).join(''); };
  const fmtCode = c => c ? c.match(/.{1,4}/g).join('-') : '';
  const cleanCode = c => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function cloudBackup(manual) {
    if (!S.cloud) S.cloud = { code: newCode(), at: 0, auto: true };
    if (manual) { UI.cloudBusy = true; dirty(); }
    if (!NET.ok) await pullMarket();
    if (!NET.ok) { UI.cloudBusy = false; if (manual) toast('Cloud backup needs the shared valley connection. Use the web version.', 'warn'); dirty(); return; }
    try { const data = await exportCode(); const ok = await rpc('backup_save', { p_code: S.cloud.code, p_data: data, p_name: S.name, p_day: S.day });
      if (ok) { S.cloud.at = Date.now(); S.cloud.day = S.day; save(); linkFarm(S.cloud.code); if (manual) toast(`<b>Backed up.</b> Your code: ${fmtCode(S.cloud.code)}`, 'goal'); }
      else if (manual) toast('Backed up a moment ago. Try again in a few seconds.', 'info');
    } catch (e) { if (manual) toast('Couldn’t reach the valley. Try again in a moment.', 'warn'); }
    UI.cloudBusy = false; dirty(); }
  function autoBackup() { if (S.race) return; if (S.cloud && S.cloud.auto === false) return; if (!NET.ok) return; if (S.cloud && Date.now() - (S.cloud.at || 0) < 10 * 60000) return; cloudBackup(false); }
  async function findBackup(code) {
    code = cleanCode(code); UI.rest = { busy: true, code }; renderTitle();
    if (code.length !== 12) { UI.rest = { err: 'Backup codes are 12 letters and numbers, like ABCD-EFGH-JKMN.', code }; renderTitle(); return; }
    if (!NET.ok) await pullMarket();
    if (!NET.ok) { UI.rest = { err: 'Restoring needs the shared valley connection. Open the web version: zcgrimshaw.github.io/harvestwork', code }; renderTitle(); return; }
    try { const r = await rpc('restore_save', { p_code: code });
      if (!r || !r.data) { const pk = await rpc('player_key_use', { p_code: code }).catch(() => null);
        UI.rest = pk && pk.player ? { pk, code } : { err: 'No backup or player key found for that code. Check it and try again.', code }; renderTitle(); return; }
      const o = await parseCode(r.data); UI.rest = { o, code, saved: r.saved }; }
    catch (e) { UI.rest = { err: 'Couldn’t load that backup. Try again in a moment.', code }; }
    renderTitle(); }
  /* ================= medals and the player key =================
     Medals belong to the player, not a farm: the valley server keeps them, the game caches them here, and any farm
     can put one on show. The player key is one secret code (like a backup code) that carries this player's id,
     locked name, medals and linked farm backups to another device. Nothing to sign up for. */
  const MEDAL = { 1: ['Gold', 'Weekly Challenge champion'], 2: ['Silver', '2nd place in the Weekly Challenge'], 3: ['Bronze', '3rd place in the Weekly Challenge'] };
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  NET.medals = lsGet('harvestworks.medals', []);
  const medalKey = m => `${m.week}-${m.place}`;
  const medalImg = place => ART.get('medal:' + place).toDataURL();
  async function fetchMedals(quiet) {
    try { const list = await rpc('my_medals', { p_player: PLAYER }); if (!Array.isArray(list)) return;
      NET.medals = list; lsSet('harvestworks.medals', list); const seen = lsGet('harvestworks.medalseen', []);
      const fresh = list.filter(m => !seen.includes(medalKey(m)));
      if (quiet) lsSet('harvestworks.medalseen', list.map(medalKey)); else if (fresh.length) UI.medalPend = fresh;
      dirty(); } catch (e) { } }
  function showMedal() { const m = UI.medalPend.shift(); if (!UI.medalPend.length) UI.medalPend = null;
    const seen = lsGet('harvestworks.medalseen', []); seen.push(medalKey(m)); lsSet('harvestworks.medalseen', seen);
    UI.medalShow = m; openTitle('medal'); SND.play('contract'); }
  const placedMedals = () => S.tiles.map((T, i) => T.b && T.b.type === 'medal' ? i : -1).filter(i => i >= 0);
  const medalAt = m => placedMedals().find(i => medalKey(S.tiles[i].b.m) === medalKey(m));
  function copyText(t, done) { const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } ta.remove(); ok ? done() : toast(`Couldn’t copy automatically: <b>${esc(t)}</b>`, 'info'); };
    try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); } }
  NET.pkey = lsGet('harvestworks.pkey', null);
  async function linkFarm(code) { if (!code || !NET.ok) return; const done = lsGet('harvestworks.linked', []); if (done.includes(code)) return;
    try { if (await rpc('link_farm', { p_player: PLAYER, p_code: code })) { done.push(code); lsSet('harvestworks.linked', done); } } catch (e) { } }
  function linkAllFarms() { if (!S.race && S.cloud && S.cloud.at) linkFarm(S.cloud.code);
    [0, 1, 2].forEach(k => { const o = k === SLOT ? null : load(SLOT_KEYS[k]); if (o && o.cloud && o.cloud.at) linkFarm(o.cloud.code); }); }
  async function makePlayerKey() { UI.pkBusy = true; dirty();
    if (!NET.ok) await pullMarket();
    if (!NET.ok) { UI.pkBusy = false; toast('The player key needs the shared valley connection. Use the web version.', 'warn'); dirty(); return; }
    const code = newCode();
    try { if (await rpc('player_key_set', { p_player: PLAYER, p_code: code })) { NET.pkey = code; lsSet('harvestworks.pkey', code); linkAllFarms(); toast(`<b>Player key made:</b> ${fmtCode(code)}. Keep it somewhere safe.`, 'goal'); }
      else toast('Couldn’t make a key just now. Try again.', 'warn'); } catch (e) { toast('Couldn’t reach the valley. Try again in a moment.', 'warn'); }
    UI.pkBusy = false; dirty(); }
  function usePlayerKey(code, pk) { // this device becomes that player
    PLAYER = pk.player; try { localStorage.setItem('harvestworks.player', pk.player); } catch (e) { }
    setMyName(pk.name || null); NET.pkey = code; lsSet('harvestworks.pkey', code); lsSet('harvestworks.linked', []);
    NET.medals = []; lsSet('harvestworks.medals', []); fetchMedals(true); fetchMon(); }
  /* ================= Valley Monuments =================
     Every online farm builds one shared monument together. The valley server keeps the monument, its phases (which
     goods each phase takes and how many points each is worth), everyone's gifts and the daily allowance; it accepts
     as many goods as fit and says how many to take from storage, so nothing leaves storage unless it counted.
     Giving earns no gold: you earn the monument's model (keep_min points), +1 Discovery for your first gift in each
     phase, and +2 when it's finished. Once the tutorial is done, an online farm gets a Valley Green beside its land:
     a 6×6 plaza (never bought or built on) with the monument at full size and the Monument Depot. */
  NET.mon = lsGet('harvestworks.mon', null);
  const MONK = () => NET.mon && NET.mon.id ? NET.mon : null;
  const monKind = m => D.monuments[m && m.kind] || D.monuments.pyramid;
  const monShort = n => String(n || '').replace(/^The /, ''); // "the Great Pyramid model"
  function monTotals(m) { const ph = m.phases || [], cum = [0]; ph.forEach(p => cum.push(cum[cum.length - 1] + (+p.need || 0)));
    const total = cum[cum.length - 1] || 1, pts = Math.min(m.points || 0, total);
    let stage = 0; while (stage < ph.length && pts >= cum[stage + 1]) stage++;
    const phase = Math.min(stage, ph.length - 1);
    return { total, cum, pts, stage: m.finished_at ? ph.length : stage, phase, done: pts - cum[phase], need: ph[phase] ? +ph[phase].need : 1, finished: !!m.finished_at || pts >= total }; }
  const monStageOf = id => { const m = MONK(); if (m && m.id === id) return monTotals(m).stage; const x = m && (m.mine_all || []).find(p => p.id === id); return x ? monTotals(x).stage : (lsGet('harvestworks.monstage', {})[id] || 0); };
  const monLeftToday = m => Math.max(0, (m.cap || 0) - (m.today || 0));
  const utcReset = () => { const n = new Date(Date.now() - (NET.monSkew || 0)), r = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); return r - n.getTime(); };
  const fmtLeftShort = ms => { const h = Math.floor(ms / 3600000), m = Math.max(1, Math.round((ms % 3600000) / 60000)); return h >= 24 ? `${Math.round(h / 24)} days` : h ? `${h}h ${m}m` : `${m} min`; };
  async function fetchMon() { if (!S || !online()) return; NET.monAt = Date.now();
    try { const r = await rpc('mon_state', { p_player: PLAYER }); if (r) setMon(r); } catch (e) { } }
  function setMon(r) { NET.mon = r; NET.monOk = true; lsSet('harvestworks.mon', r); if (r.now) NET.monSkew = Date.now() - Date.parse(r.now);
    const st = lsGet('harvestworks.monstage', {}); (r.mine_all || []).forEach(p => { st[p.id] = monTotals(p).stage; }); if (r.id) st[r.id] = monTotals(r).stage; lsSet('harvestworks.monstage', st);
    checkMonStage(); openGreenIfReady(); dirty(); }
  // a stage crossed since this device last looked: a ceremony card (once per stage)
  function checkMonStage() { const m = MONK(); if (!m || !S || S.race) return; const seen = lsGet('harvestworks.monseen', {}), st = monTotals(m).stage;
    if (seen[m.id] == null) { seen[m.id] = st; lsSet('harvestworks.monseen', seen); return; }
    if (st > seen[m.id] && S.green) UI.monPend = { id: m.id, stage: st }; }
  function showMonStage() { const p = UI.monPend; UI.monPend = null; const m = MONK(); if (!m || m.id !== p.id) return;
    const seen = lsGet('harvestworks.monseen', {}); seen[m.id] = p.stage; lsSet('harvestworks.monseen', seen);
    if (p.stage >= m.phases.length && m.mine > 0) { S.monDone = S.monDone || {}; if (!S.monDone[m.id]) { S.monDone[m.id] = 1; S.dp += 2; toast(`<b>+2 Discovery</b> · you helped finish ${esc(m.name)}`, 'disc'); save(); } }
    UI.monShow = p; openTitle('monstage'); SND.play('contract'); }
  /* The Valley Green: a 6×6 plaza with the monument and the Depot, tucked against one of the four corners of your farm
     (the area diagonal to that corner). You pick the corner, and can move it any time for free. */
  const greenT = i => !!(D.terrain[T_(i).t] && D.terrain[T_(i).t].green);
  const GREEN_CORNERS = [['back', 'Back corner', -1, -1], ['right', 'Right corner', 1, -1], ['left', 'Left corner', -1, 1], ['front', 'Front corner', 1, 1]];
  // the area diagonal to a corner of your starting land, or -1 if it's off the map or you've already surveyed it
  // swap: also accept a corner area you've already surveyed, if nothing at all is built on it (its land is replaced by the Green)
  const regionEmpty = r => regionTiles(r).every(i => !S.tiles[i].b);
  const greenSwapOk = r => r >= 0 && S.regions[r].open && S.regions[r].theme !== 'green';
  function greenSpot(k, swap) { const R = RW(), home = S.regions.map((g, r) => g.theme === 'home' ? r : -1).filter(r => r >= 0), c = GREEN_CORNERS.find(g => g[0] === k); if (!home.length || !c) return -1;
    const xs = home.map(r => r % R), ys = home.map(r => r / R | 0), x = c[2] < 0 ? Math.min(...xs) - 1 : Math.max(...xs) + 1, y = c[3] < 0 ? Math.min(...ys) - 1 : Math.max(...ys) + 1;
    if (x < 0 || y < 0 || x >= R || y >= R) return -1; const r = y * R + x, g = S.regions[r]; return !g.open || g.theme === 'green' || (swap && regionEmpty(r)) ? r : -1; }
  // why a corner can't be used, in words for the button
  function greenWhy(k) { const R = RW(), home = S.regions.map((g, r) => g.theme === 'home' ? r : -1).filter(r => r >= 0), c = GREEN_CORNERS.find(g => g[0] === k);
    const xs = home.map(r => r % R), ys = home.map(r => r / R | 0), x = c[2] < 0 ? Math.min(...xs) - 1 : Math.max(...xs) + 1, y = c[3] < 0 ? Math.min(...ys) - 1 : Math.max(...ys) + 1;
    return x < 0 || y < 0 || x >= R || y >= R ? 'Not available: that corner is off the edge of the map' : 'Not available: that area is part of your land and has something built on it'; }
  // lay the plaza, the monument site and the Depot over area r
  function paveGreen(r, meta) { const R = C.worldRegions, x0 = (r % R) * RS(), y0 = (r / R | 0) * RS(), ctr = idx(x0 + 2, y0 + 2), dep = idx(x0 + 5, y0 + 2); // the Depot sits 3 tiles from the centre, so it never ties the monument's front corner for draw order
    S.regions[r] = { open: true, theme: 'green' };
    for (let y = 0; y < RS(); y++) for (let x = 0; x < RS(); x++) { const i = idx(x0 + x, y0 + y), foot = x >= 1 && x <= 3 && y >= 1 && y <= 3, ring = x <= 4 && y <= 4 && !((x === 0 || x === 4) && (y === 0 || y === 4));
      S.tiles[i] = { t: foot || ring ? 'plaza' : 'lawn', o: true, b: foot ? { type: 'mon_site', c: ctr, p: meta.p, kind: meta.kind } : null, r: null, v: (x * 7 + y * 13) % 3 }; }
    S.tiles[dep].b = { type: 'depot' }; return { c: ctr, d: dep }; }
  function openGreenIfReady() {
    if (!S || S.green || S.race || !online() || !MONK() || S.goal < D.goals.length) return;
    let k = GREEN_CORNERS.map(g => g[0]).find(k => greenSpot(k) >= 0), r = k ? greenSpot(k) : -1;
    if (r < 0) { // all four corners are taken or off the map: fall back to the nearest unsurveyed area beside your land
      const R = C.worldRegions, c = (R - 1) / 2, cand = S.regions.map((Rg, q) => q).filter(q => !S.regions[q].open && regionNbrs(q).some(n => S.regions[n].open && S.regions[n].theme !== 'green'));
      if (!cand.length) return; cand.sort((a, b) => Math.hypot(a % R - c, (a / R | 0) - c) - Math.hypot(b % R - c, (b / R | 0) - c) || a - b); r = cand[0]; k = null; }
    const m = MONK(), p = paveGreen(r, { p: m.id, kind: m.kind });
    S.green = { r, c: p.c, d: p.d, day: S.day, k }; UI.live = null; save();
    if (!UI.title) openTitle('monwelcome'); else UI.monWelcome = true; }
  // move the Green to another corner: the old area goes back to being unsurveyed land
  function moveGreen(k) { if (!S.green || S.race) return; const r = greenSpot(k, true); if (r < 0 || r === S.green.r) return;
    const swap = greenSwapOk(r), ask = UI.greenAsk;
    if (swap && !(ask && ask.k === k && Date.now() - ask.t < 15000)) { UI.greenAsk = { k, t: Date.now() }; dirty(); return; } // surveyed land is replaced: ask first
    UI.greenAsk = null;
    const o = S.tiles[S.green.c].b || {}, old = S.green.r, set = new Set(regionTiles(r));
    if (swap) { S.surveys = Math.max(0, (S.surveys || 0) - 1); S.queue = (S.queue || []).filter(q => !set.has(q.i)); UI.bounds = null; } // one less surveyed area: the old Green spot is unsurveyed again
    regionTiles(old).forEach(i => { S.tiles[i] = { t: 'void', o: false, b: null, r: null, v: 0 }; });
    S.regions[old] = { open: false, theme: themeAt(old % RW(), old / RW() | 0) };
    const p = paveGreen(r, { p: o.p, kind: o.kind }); S.green = { r, c: p.c, d: p.d, day: S.green.day, k }; UI.live = null; save();
    showGreen(); toast(`<b>Valley Green moved</b> to the ${esc(GREEN_CORNERS.find(g => g[0] === k)[1].toLowerCase())} of your farm.`, 'goal'); }
  function greenMoveHTML() { if (!S.green || S.race) return '';
    return `<span class="eyebrow">Where it sits</span><p class="hint small">The Valley Green is tucked against one corner of your farm. Move it to any corner you haven’t built land on. It’s free, and you can change it back any time. Corners are named as the map first appears.</p>
      <div class="modepick">${GREEN_CORNERS.map(([k, nm]) => { const here = S.green.k === k, sp = greenSpot(k, true), ok = here || sp >= 0, swap = !here && greenSwapOk(sp), asking = swap && UI.greenAsk && UI.greenAsk.k === k && Date.now() - UI.greenAsk.t < 15000;
        return `<button class="modeopt ${here ? 'on' : ''}${asking ? ' warn' : ''}" data-green-move="${k}" ${ok ? '' : 'disabled'}><b>${nm}</b><small>${here ? 'Here now' : !ok ? greenWhy(k) : asking ? 'Tap again to confirm: this empty area of your land is replaced by the Green, and the old spot goes back to unsurveyed land' : swap ? 'Empty surveyed land: it will be replaced by the Green. Tap to move' : 'Move it here'}</small></button>`; }).join('')}</div>`; }
  const monTiles = () => S.green ? S.tiles.map((T, i) => T.b && T.b.type === 'mon_site' && T.b.c === S.green.c ? i : -1).filter(i => i >= 0) : [];
  function showGreen() { if (!S.green) return; UI.drawer = null; UI.title && closeTitle(); centerOn(S.green.c); clampCam(); UI.sel = S.green.d; dirty(); }
  // Give goods. Lowest quality goes first, since quality doesn't count here.
  function monMax(id) { const m = MONK(); if (!m) return 0; const t = monTotals(m), v = +(m.phases[t.phase].items || {})[id] || 0; if (!v) return 0;
    return Math.max(0, Math.min(count(id), Math.ceil(monLeftToday(m) / v), Math.ceil((t.need - t.done) / v))); }
  async function monGive(id, n, auto) {
    const m = MONK(); if (!m || UI.monBusy) return;
    n = Math.min(n | 0, count(id)); if (n < 1) { if (!auto) toast(`You have no ${esc(D.items[id].name)} in storage.`, 'warn'); return; }
    UI.monBusy = id; UI.monBusyAt = Date.now(); dirty(); const ph = monTotals(m).phase;
    try { const r = await rpc('mon_give', { p_player: PLAYER, p_name: NET.myName || S.name, p_project: m.id, p_item: id, p_qty: n });
      if (!r || r.error) { const e = r && r.error;
        if (!auto) toast(e === 'cap' ? `<b>That’s your share for today.</b> You’ve given ${(r.today || 0).toLocaleString()} of ${(r.cap || 0).toLocaleString()} points. Your allowance resets at 00:00 UTC (in ${fmtLeftShort(utcReset())}).`
          : e === 'not_needed' ? 'The monument has moved on to its next phase, which needs different goods. Here’s the new list.'
          : e === 'finished' ? `${esc(m.name)} is finished! Nothing more is needed.` : 'The monument couldn’t take that just now. Nothing was taken from storage.', e === 'cap' ? 'info' : 'warn');
        if (e === 'cap' && S.monAuto && Object.keys(S.monAuto).length) { setMon(Object.assign({}, m, { today: r.today || m.cap, cap: r.cap || m.cap })); monAutoCapStop(); }
        fetchMon(); }
      else { const q = Math.min(r.qty, count(id)); if (q > 0) take(id, q, 0, 'low');
        S.monPh = S.monPh || {}; const got = S.monPh[m.id] = S.monPh[m.id] || [];
        const st = r.state || m, t = monTotals(st);
        if (auto) toast(`<b>Auto-gave ${r.qty} ${esc(D.items[id].name)}</b> to ${esc(m.name)}: +${r.points.toLocaleString()} points. Your total: ${(st.mine || 0).toLocaleString()}.`, 'info'); else
        toast(`<b>Gave ${r.qty} ${esc(D.items[id].name)}: +${r.points.toLocaleString()} points.</b> Your total: ${(st.mine || 0).toLocaleString()}. ${t.finished ? `${esc(m.name)} is complete!` : `${Math.max(0, t.cum[t.stage + 1] - t.pts).toLocaleString()} points to the next stage (${esc(monKind(m).stages[t.stage + 1] || '')}).`}${r.qty < n ? ` (${n - r.qty} stayed in storage: ${monLeftToday(st) < 1 ? 'that’s your allowance for today' : t.finished ? 'that finished the monument' : 'that finished this phase'}.)` : ''}`, 'goal');
        if (!got.includes(ph)) { got.push(ph); S.dp += 1; toast(`<b>+1 Discovery</b> · your first gift to the ${esc(m.phases[ph].name)} phase`, 'disc'); }
        if ((m.mine || 0) < m.keep_min && (st.mine || 0) >= m.keep_min) toast(`<b>You earned the ${esc(monShort(m.name))} model!</b> Place it on your farm from the Monument Depot or the Homestead. It always shows the monument’s current stage.`, 'goal');
        if (S.green) UI.cart = { t: 0 };
        SND.play('sell'); setMon(st); save(); monAutoCapStop(st); } }
    catch (e) { if (!auto) toast('Couldn’t reach the valley. Nothing was given, so your goods are still in storage.', 'warn'); }
    UI.monBusy = null; dirty(); }
  /* Auto-give: goods you've ticked go to the monument by themselves, a little at a time (one gift every 20 seconds at
     most), whenever the current phase takes them and today's allowance has room. Per farm, saved with it. */
  // The day's allowance is used up: switch every Auto off and tell the player (they turn them back on after 00:00 UTC)
  function monAutoCapStop(m) { if (!S || !S.monAuto || !Object.keys(S.monAuto).length || monLeftToday(m || MONK() || {}) > 0) return false;
    const n = Object.keys(S.monAuto).length; S.monAuto = {}; save(); dirty();
    toast(`<b>Daily limit reached.</b> You’ve given your full ${((m || MONK()).cap || 0).toLocaleString()} points to the monument today, so Auto-give has been switched off${n > 1 ? ' for all goods' : ''}. Your allowance resets at 00:00 UTC (in ${fmtLeftShort(utcReset())}); turn Auto back on then.`, 'warn'); return true; }
  const monAutoOn = id => !!(S.monAuto && S.monAuto[id]);
  function autoMonGive() { if (!S || S.race || !online() || !S.monAuto || !Object.keys(S.monAuto).length) return;
    if (UI.monBusy && Date.now() - (UI.monBusyAt || 0) > 30000) UI.monBusy = null; // a gift that never answered must not block the rest
    const m = MONK(); if (!m || UI.monBusy) return;
    // Nothing to give right now (allowance used, goods gone, or the phase may have moved on): look again, at most once a minute,
    // so a new day's allowance or a new phase's goods get picked up even though our copy is old.
    const stale = () => { if (Date.now() - (NET.monAt || 0) > 60000) fetchMon(); };
    const t = monTotals(m); if (t.finished) return; if (!monLeftToday(m)) { if (Date.now() - (NET.monAt || 0) > 60000) fetchMon(); else monAutoCapStop(m); return; } // confirm with the valley before switching off
    const items = (m.phases[t.phase] || {}).items || {};
    const id = Object.keys(S.monAuto).filter(k => S.monAuto[k] && items[k] && monMax(k) > 0).sort((a, b) => count(b) * items[b] - count(a) * items[a])[0];
    if (id) monGive(id, monMax(id), true); else stale(); }
  setInterval(() => { try { autoMonGive(); } catch (e) { } }, 20000);
  setTimeout(() => { try { dqNotice(); } catch (e) { } }, 6000); setInterval(() => { try { dqNotice(); } catch (e) { } }, 60000);
  /* Builder's days: on any UTC day you've given to the monument, your quarries, clay banks, iron seams, woods, reeds,
     flowers and ponds refill twice as fast, and digging doesn't wear deposits down, so giving stone never runs you dry. */
  const builderDay = () => { const m = S && !S.race && online() && MONK(); return !!m && !monTotals(m).finished && (m.today || 0) > 0; };
  /* Homestead notices: things players forget, with a glowing "!" over the Homestead until the list is opened. */
  function notices() { const o = [], m = MONK(), hi = homeIdx();
    if (m && online() && !S.race && !monTotals(m).finished && monLeftToday(m) > 0) { const t = monTotals(m), have = Object.keys(m.phases[t.phase].items || {}).filter(id => D.items[id] && count(id) > 0);
      if (have.length) o.push({ k: `mon${m.id}.${t.phase}.${utcDay()}`, html: `<b>${esc(m.name)}</b> needs ${esc((m.phases[t.phase].short || m.phases[t.phase].name).toLowerCase())}, and you have ${esc(nmList(have.slice(0, 3).map(id => D.items[id].name)))} to give.`, act: `<button class="btn sm" data-drawer="valley">Give</button>` }); }
    if (hi >= 0 && !S.race && !checkTask({ a: 'homeup', i: hi })) o.push({ k: `home${S.home}`, html: `You can afford to expand your Homestead’s storage to ${homeCap(S.home + 1)}.`, act: '' });
    return o; }
  const utcDay = () => new Date(Date.now() - (NET.monSkew || 0)).toISOString().slice(0, 10);
  const noticeKey = () => notices().map(n => n.k).join('|');
  async function shareSave() {
    save(); const body = JSON.stringify({ format: 'harvestworks-save', saved: new Date().toISOString(), version: D.updates[0].v, state: S });
    const file = new File([body], saveFileName(), { type: 'application/json' });
    try { await navigator.share({ files: [file], title: 'Harvest Valley save', text: `${S.name}’s farm, day ${S.day}` }); }
    catch (e) { if (e && e.name !== 'AbortError') toast('Sharing didn’t work here. Try Cloud backup instead.', 'warn'); } }
  const canShareFile = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; } };
  /* ================= race mode =================
     Friends race to a target score from the same head start. Each farm runs on its own device; the valley server only
     keeps the lobby, the start time and everyone's score. The race farm lives in its own save slot, so the player's
     real farm is never touched, and races don't affect market prices, the leaderboard or backups. Pausing is off. */
  const RACE_TARGETS = [[500, 'Sprint'], [1000, 'Standard'], [2500, 'Long'], [5000, 'Marathon']];
  const RINFO = 'harvestworks.raceinfo';
  const raceInfo = () => { try { return JSON.parse(localStorage.getItem(RINFO)); } catch (e) { return null; } };
  const raceNow = () => Date.now() - (UI.rskew || 0);
  const fmtTime = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const inviteLink = code => `${location.origin}${location.pathname}?race=${code}`;
  async function raceCall(fn, body) {
    if (!NET.ok) await pullMarket();
    if (!NET.ok) throw new Error('Races need the shared valley connection. Play the web version: zcgrimshaw.github.io/harvestwork');
    const r = await rpc(fn, body); if (!r) throw new Error('No race with that code.'); if (r.error) throw new Error(r.error);
    if (r.now) UI.rskew = Date.now() - Date.parse(r.now); return r; }
  async function hostRace(target) { UI.rerr = null; UI.rbusy = true; renderTitle();
    try { UI.rl = await raceCall('create_race', { p_player: PLAYER, p_name: S.name, p_target: target }); openTitle('racelobby'); pollLobby(); }
    catch (e) { UI.rerr = e.message; } UI.rbusy = false; renderTitle(); }
  async function joinRace(code) { code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); UI.rerr = null; UI.rjoin = code;
    if (code.length !== 5) { UI.rerr = 'Race codes are 5 letters, like K7QPM.'; renderTitle(); return; }
    UI.rbusy = true; renderTitle();
    try { UI.rl = await raceCall('join_race', { p_code: code, p_player: PLAYER, p_name: S.name });
      if (UI.rl.status === 'running') enterRace(); else { openTitle('racelobby'); pollLobby(); } }
    catch (e) { UI.rerr = e.message; } UI.rbusy = false; renderTitle(); }
  function pollLobby() { clearTimeout(UI.rpoll);
    UI.rpoll = setTimeout(async () => { if (UI.title !== 'racelobby' || !UI.rl) return;
      try { UI.rl = await raceCall('race_state', { p_code: UI.rl.code, p_player: PLAYER }); } catch (e) { }
      if (UI.rl && UI.rl.status === 'running') enterRace(); else { renderTitle(); pollLobby(); } }, 2500); }
  async function startRace() { try { UI.rl = await raceCall('start_race', { p_code: UI.rl.code, p_player: PLAYER }); if (UI.rl.status === 'running') enterRace(); } catch (e) { UI.rerr = e.message; renderTitle(); } }
  async function leaveLobby() { clearTimeout(UI.rpoll); if (UI.rl) rpc('leave_race', { p_code: UI.rl.code, p_player: PLAYER }).catch(() => {}); UI.rl = null; openTitle('race'); }
  /* The head start. It's random for every race but identical for everyone in it: the race code seeds the dice.
     Always winnable: the Stove, at least two tilled plots, carrot seeds and gold for more seeds.
     Greed traps: a bargain station kit you can't actually use, and a rich-looking request that pays gold, not points. */
  const RACE_KITS = {
    sawmill:   { unl: ['woodcutting', 'sawmill'], give: { log: 6 } },
    mill:      { unl: ['wheat', 'mill', 'baking'], give: { wheat_seed: 6 } },
    preserver: { unl: ['berries', 'preserver'], give: { berry_seed: 5 } },
    workbench: { unl: ['stonecutting', 'workbench'], give: { plank: 6, stone: 4 } },
    compost:   { unl: ['compost', 'compostbin'], give: { fertilizer: 3 } },
    hive:      { unl: ['berries', 'beekeeping'], give: {} },
    shed:      { unl: ['woodcutting', 'mushrooms'], give: { log: 4 } },
    kiln:      { unl: ['stonecutting', 'woodcutting', 'kiln'], give: { stone: 6 } }
  };
  // bargain kits whose chain can't run in a race (their inputs need discoveries you don't start with)
  const RACE_TRAP_KITS = [['smelter_kit', 'smelter', 'copper ore from Prospecting'], ['loom_kit', 'loom', 'flax'], ['press_kit', 'press', 'apple trees'], ['oven_kit', 'oven', 'bricks to place it']];
  function raceRng(code) { let h = 2166136261; for (const ch of code) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function racePreset(code) {
    const R = raceRng(code), int = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const kit = []; const unl = id => { if (!S.unl.includes(id)) S.unl.push(id); };
    S.home = 1; S.goal = D.goals.length; S.tut = null; S.seenUpdate = latest().v; S.weekly = false;
    S.gold = int(15, 40) * 10; unl('stew'); ['woodcutting', 'fishing', 'stonecutting'].forEach(id => { if (R() < .5) unl(id); });
    const give = (k, n) => { if (n > 0) addItem(k, n, 0, true); };
    give('carrot_seed', int(6, 10) - count('carrot_seed')); give('potato_seed', int(2, 6) - count('potato_seed'));
    // land: 5×5 or 7×7 around the house
    const h = homeIdx(), hx = tx(h), hy = ty(h), rad = R() < .5 ? 2 : 3;
    S.tiles.forEach((T, i) => { if (T.t !== 'void' && Math.max(Math.abs(tx(i) - hx), Math.abs(ty(i) - hy)) <= rad) T.o = true; });
    const free = S.tiles.map((T, i) => i).filter(i => isEmptyGrass(i)).sort((a, b) => (Math.abs(tx(a) - hx) + Math.abs(ty(a) - hy)) - (Math.abs(tx(b) - hx) + Math.abs(ty(b) - hy)) || a - b);
    // one to three stations, ready to run
    const bts = shuffle(Object.keys(RACE_KITS)).slice(0, int(1, 3));
    bts.forEach(bt => { const i = free.shift(); if (i === undefined) return; S.tiles[i].b = makeB(bt); S.built++; RACE_KITS[bt].unl.forEach(unl);
      for (const k in RACE_KITS[bt].give) give(k, RACE_KITS[bt].give[k]);
      if (R() < .35) S.tiles[i].b.lv.speed = 1; kit.push(D.buildings[bt].name + (S.tiles[i].b.lv.speed ? ' (tuned)' : '')); });
    // two to five tilled plots (at least two), sometimes one already sprouting
    S.tiles.forEach(T => { if (T.b && T.b.type === 'farm' && T.b.st === 'raw') T.b.st = 'tilled'; });
    const plots = int(1, 4); for (let k = 0; k < plots; k++) { const i = free.shift(); if (i !== undefined) S.tiles[i].b = { type: 'farm', st: 'tilled' }; }
    if (R() < .5) { const f = S.tiles.find(T => T.b && T.b.type === 'farm' && T.b.st === 'tilled'); if (f) { f.b = { type: 'farm', st: 'growing', crop: 'carrot', last: 'carrot', g: int(4, 12), wet: false, w: [0, 0], half: false, fert: false }; kit.push('a carrot crop already growing'); } }
    const nPlots = S.tiles.filter(T => T.b && T.b.type === 'farm').length;
    // a few odds and ends, and sometimes Discovery to spend
    const extras = shuffle([['stone', int(2, 6)], ['log', int(2, 6)], ['fertilizer', int(1, 3)], ['plank', int(2, 5)], ['fish', int(1, 3)]]).slice(0, int(0, 2));
    extras.forEach(([k, n]) => give(k, n)); S.dp = int(0, 3);
    // greed traps
    const traps = [];
    const tk = shuffle(RACE_TRAP_KITS.filter(([id, bt]) => !S.unl.includes(D.items[id].requires)))[0];
    if (tk && R() < .8) { const [id, bt, need] = tk; unl(D.items[id].requires); S.race.deal = { kit: id, price: Math.round(D.items[id].buy * .4 / 5) * 5, need };
      traps.push('deal'); }
    if (R() < .8) { const pool = ['glazed_carrots', 'baked_potato', 'veggie_stew'].concat(S.unl.includes('baking') ? ['bread'] : []).concat(S.unl.includes('preserver') ? ['jam', 'pickled_carrots'] : []);
      const it = pick(pool), n = int(4, 7);
      S.orders.unshift({ id: S.uid++, kind: 'trap', name: 'Collector’s grand request', need: [[it, n, 0]], gold: Math.round(D.items[it].value * n * 2.2 / 10) * 10, score: int(2, 5) * 5 }); traps.push('order'); }
    S.race.kit = [`${S.gold}g`, `${nPlots} farm plot${nPlots === 1 ? '' : 's'}`, ...kit].concat(S.dp ? [`${S.dp} Discovery to spend`] : []);
    S.race.traps = traps;
  }
  function enterRace() { clearTimeout(UI.rpoll); const L = UI.rl;
    if (!S.race) save();
    const name = (L.players.find(p => p.me) || {}).name || S.name;
    newState(); migrate(); S.name = name;
    S.race = { code: L.code, target: L.target, start: Date.parse(L.started_at), seen: {} }; racePreset(L.code);
    try { localStorage.setItem(RINFO, JSON.stringify({ code: L.code, target: L.target })); } catch (e) { }
    UI.yaw = 0; UI.yawTo = null; UI.tilt = 1; setView(0, 1); centerOn(homeIdx()); UI.sel = -1; UI.drawer = null; UI.html = {}; UI.logOpen = null; UI.hadSave = true;
    save(); UI.rtick = 0; openTitle('racego'); }
  function leaveRace() { clearTimeout(UI.rpoll); try { localStorage.removeItem(RINFO); localStorage.removeItem(RACE_KEY); } catch (e) { }
    const o = load(SLOT_KEYS[SLOT]); UI.rl = null;
    if (o) { S.race = null; adoptState(o); closeTitle(); toast(`<b>Back on your farm.</b> Welcome back, ${esc(S.name)}.`, 'goal'); }
    else { newState(); migrate(); UI.hadSave = false; openTitle('main'); } }
  function resumeRace() { const o = load(RACE_KEY); if (!o || !o.race) return false; S.race = null; adoptState(o); UI.hadSave = true; closeTitle(); return true; }
  /* ================= weekly challenge =================
     Everyone gets the same head start for the week (a theme from data.js, never the same two weeks running, plus
     dice seeded by the week number). One ranked timed run a day (15 minutes in week 2962, 10 minutes from then on), checked by the valley server; practice runs
     after that don't count. Best run of the week wins; the top three get medals when the week closes (Monday
     00:00 UTC). The run farm lives in its own save, like a race, so the player's real farms are never touched. */
  const WEEK_KEY = 'harvestworks.weekly.v1', WEEK0 = 2962;
  const runMins = w => w > 2962 ? 10 : 15, runMs = w => runMins(w) * 60000;
  const weekOf = t => Math.floor((t / 1000 - 345600) / 604800);
  const weekStartMs = w => (w * 604800 + 345600) * 1000;
  const srvNow = () => Date.now() - (NET.skew || 0);
  function weekLabel(w) { const mon = weekStartMs(w), y = new Date(mon + 3 * 864e5).getUTCFullYear(), j4 = Date.UTC(y, 0, 4);
    const wk1 = j4 - ((new Date(j4).getUTCDay() + 6) % 7) * 864e5; return `Week ${Math.round((mon - wk1) / 6048e5) + 1}, ${y}`; }
  // Themes come in shuffled rounds: every theme once per round, and never the same theme two weeks running.
  // Weeks up to 2962 used the first 10 themes; from week 2963 on, every theme (new ones included) is in the rounds.
  const NEW_ROUNDS = 2963, OLD_THEMES = 10;
  function themeRound(T, w0, w, salt, before) { const N = T.length, d = w - w0, c = Math.floor(d / N);
    const perm = c => { const R = raceRng(salt + c), a = T.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const cur = perm(c), prevId = c > 0 ? T[perm(c - 1)[N - 1]].id : before; if (T[cur[0]].id === prevId) [cur[0], cur[1]] = [cur[1], cur[0]];
    return T[cur[d - c * N]]; }
  function weekTheme(w) { const T = D.weeklyThemes;
    if (w < NEW_ROUNDS) return themeRound(T.slice(0, OLD_THEMES), WEEK0, w, 'ROUND', null);
    return themeRound(T, NEW_ROUNDS, w, 'ROUNDB', weekTheme(NEW_ROUNDS - 1).id); }
  const fmtLeft = ms => { const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`; };
  function weeklyPreset(w) {
    const th = weekTheme(w), st = th.start, R = raceRng('WEEKLY' + w), int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const unl = id => { if (!S.unl.includes(id)) S.unl.push(id); }, give = (k, n) => { if (n > 0) addItem(k, n, 0, true); }, kit = [];
    S.home = 1; S.goal = D.goals.length; S.tut = null; S.seenUpdate = latest().v; S.weekly = false;
    S.race.rules = th.rules; S.race.theme = th.id;
    S.gold = int(st.gold[0], st.gold[1]) * 10; unl('stew'); (st.unl || []).forEach(unl);
    for (const k in st.give || {}) give(k, int(st.give[k][0], st.give[k][1]) - count(k));
    give('carrot_seed', 6 - count('carrot_seed'));
    const h = homeIdx(), hx = tx(h), hy = ty(h), rad = int(st.land[0], st.land[1]), ring = i => Math.max(Math.abs(tx(i) - hx), Math.abs(ty(i) - hy));
    S.tiles.forEach((T, i) => { if (T.t !== 'void' && ring(i) <= rad) T.o = true; });
    const free = S.tiles.map((T, i) => i).filter(i => isEmptyGrass(i)).sort((a, b) => (Math.abs(tx(a) - hx) + Math.abs(ty(a) - hy)) - (Math.abs(tx(b) - hx) + Math.abs(ty(b) - hy)) || a - b);
    const fixed = st.stations || [], extra = shuffle(Object.keys(RACE_KITS).filter(bt => !fixed.includes(bt))).slice(0, int(st.extra[0], st.extra[1]));
    fixed.concat(extra).forEach(bt => { const i = free.shift(); if (i === undefined) return; S.tiles[i].b = makeB(bt); S.built++;
      if (RACE_KITS[bt]) { RACE_KITS[bt].unl.forEach(unl); for (const k in RACE_KITS[bt].give) give(k, RACE_KITS[bt].give[k]); }
      if (R() < .3) S.tiles[i].b.lv.speed = 1; kit.push(D.buildings[bt].name + (S.tiles[i].b.lv.speed ? ' (tuned)' : '')); });
    S.tiles.forEach(T => { if (T.b && T.b.type === 'farm' && T.b.st === 'raw') T.b.st = 'tilled'; });
    const want = int(st.plots[0], st.plots[1]) - S.tiles.filter(T => T.b && T.b.type === 'farm').length;
    for (let k = 0; k < want; k++) { const i = free.shift(); if (i !== undefined) S.tiles[i].b = { type: 'farm', st: 'tilled' }; }
    if (st.helper) { S.helper = { x: Math.round(S.av.x), y: Math.round(S.av.y), path: [], dir: [1, -1], cur: null, steps: [], k: 0, idle: 0, on: true }; kit.push('a farmhand'); }
    if (R() < (st.sprout != null ? st.sprout : .4)) { const f = S.tiles.find(T => T.b && T.b.type === 'farm' && T.b.st === 'tilled'); if (f) { f.b = { type: 'farm', st: 'growing', crop: 'carrot', last: 'carrot', g: int(4, 12), wet: false, w: [0, 0], half: false, fert: false }; kit.push('a carrot crop already growing'); } }
    // the theme's terrain, painted onto the far side of your land (ponds only on the outer edge, so paths stay open)
    const outer = shuffle(free.slice(Math.floor(free.length / 2)));
    for (const t in st.terrain || {}) { const n = int(st.terrain[t][0], st.terrain[t][1]); let k = 0;
      for (let j = 0; j < outer.length && k < n; j++) { const i = outer[j]; if (i == null || (t === 'water' && ring(i) < rad)) continue;
        S.tiles[i] = { t, o: true, b: null, r: initRes(t), v: (tx(i) * 7 + ty(i) * 13) % 3 }; outer[j] = null; k++; }
      if (k) kit.push(`${k} ${D.terrain[t].name.toLowerCase()} tile${k === 1 ? '' : 's'}`); }
    shuffle([['stone', int(2, 6)], ['log', int(2, 6)], ['plank', int(2, 5)], ['fish', int(1, 3)]]).slice(0, int(0, 2)).forEach(([k, n]) => give(k, n));
    S.dp = int(0, 2);
    const nPlots = S.tiles.filter(T => T.b && T.b.type === 'farm').length;
    S.race.kit = [`${S.gold}g`, `${nPlots} farm plots`, ...kit].concat(S.dp ? [`${S.dp} Discovery to spend`] : []);
  }
  const weekRun = () => { const o = load(WEEK_KEY); return o && o.race && o.race.weekly ? o : null; };
  async function openWeekly() { UI.wk = { loading: true }; UI.werr = null; openTitle('weekly');
    if (!NET.ok) await pullMarket();
    if (!NET.ok) { UI.wk = { off: true }; renderTitle(); return; }
    try { UI.wk = await rpc('weekly_board', { p_player: PLAYER }); } catch (e) { UI.wk = { off: true }; }
    if (UI.title === 'weekly') renderTitle(); }
  async function startWeekly(practice) { UI.werr = null; UI.wbusy = true; renderTitle();
    let info = { week: weekOf(srvNow()), ranked: false, start: Date.now() + 5000 };
    if (!practice) {
      try { const r = await rpc('weekly_start', { p_player: PLAYER, p_name: NET.myName || S.name });
        if (!r || r.error) throw new Error(); const skew = Date.now() - Date.parse(r.now);
        info = { week: r.week, ranked: !!r.ranked, run: r.run || null, start: r.ranked ? Date.parse(r.started_at) + skew : Date.now() + 5000 };
        if (!r.ranked) toast('Today’s ranked run is already used, so this one is practice.', 'info'); }
      catch (e) { UI.wbusy = false; UI.werr = 'Couldn’t reach the valley. Try again in a moment.'; renderTitle(); return; } }
    UI.wbusy = false; enterWeekly(info); }
  function enterWeekly(info) {
    if (!S.race && UI.hadSave) save();
    const name = NET.myName || S.name || 'Farmer';
    newState(); migrate(); S.name = name; S.fid = null;
    S.race = { weekly: true, code: 'W' + info.week, week: info.week, run: info.run || null, ranked: info.ranked, start: info.start, end: info.start + runMs(info.week), target: 0, seen: {} };
    weeklyPreset(info.week);
    UI.yaw = 0; UI.yawTo = null; UI.tilt = 1; setView(0, 1); centerOn(homeIdx()); UI.sel = -1; UI.drawer = null; UI.html = {}; UI.logOpen = null; UI.hadSave = true;
    save(); UI.rtick = 0; openTitle('weeklygo'); }
  function leaveWeekly() { try { localStorage.removeItem(WEEK_KEY); } catch (e) { }
    const o = load(SLOT_KEYS[SLOT]); UI.wk = null;
    if (o) { S.race = null; adoptState(o); closeTitle(); toast(`<b>Back on your farm.</b> Welcome back, ${esc(S.name)}.`, 'goal'); }
    else { newState(); migrate(); UI.hadSave = false; openTitle('main'); } }
  function resumeWeekly() { const o = weekRun(); if (!o) return false; S.race = null; adoptState(o); UI.hadSave = true;
    if (S.race.done || Date.now() >= S.race.end) finishWeekly(); else closeTitle(); return true; }
  function finishWeekly() { const R = S.race; if (!R.done) { R.done = true; R.final = Math.floor(S.score); save(); SND.play('contract');
      if (R.ranked && R.run) rpc('weekly_score', { p_run: R.run, p_player: PLAYER, p_score: R.final }).catch(() => {}); }
    openTitle('weeklyend'); rpc('weekly_board', { p_player: PLAYER }).then(b => { UI.wk = b; if (UI.title === 'weeklyend') renderTitle(); }).catch(() => {}); }
  function tickWeekly(dt) { const R = S.race;
    if (UI.title === 'weeklygo') { const left = R.start - Date.now(); const el = $('#rcount'); if (el) el.textContent = left > 0 ? Math.ceil(left / 1000) : 'Go!';
      if (left <= -400) { closeTitle(); SND.play('contract'); toast(`<b>Go!</b> ${runMins(R.week)} minutes. ${esc(weekTheme(R.week).blurb)}`, 'goal'); } return; }
    if (R.done || Date.now() < R.start) return;
    if (Date.now() >= R.end) { finishWeekly(); return; }
    UI.rtick = (UI.rtick || 0) - dt;
    if (UI.rtick <= 0) { UI.rtick = 5; if (R.ranked && R.run) rpc('weekly_score', { p_run: R.run, p_player: PLAYER, p_score: Math.floor(S.score) }).catch(() => {}); }
  }
  /* On a phone the race and weekly bars become a small vertical meter on the left edge (v0.45): one column per racer,
     filling upward, with the time above and your score below. Tap it for the full standings. */
  function vMeter(o) { const el = $('#racebar'); el.classList.toggle('vm', !!o); document.body.classList.toggle('has-vm', !!o);
    if (!o) { document.body.style.removeProperty('--vmw'); return false; }
    setHTML('#racebar', `<div class="vmt">${o.time}</div><div class="vmc" role="img" aria-label="${esc(o.label)}">${o.cols.map(c => `<span class="vcol ${c.me ? 'me' : ''} ${c.done ? 'done' : ''}"><i style="height:${c.pct}%"></i></span>`).join('')}</div><div class="vms">${o.score.toLocaleString()}</div>`);
    el.title = o.label; document.body.style.setProperty('--vmw', Math.ceil(el.offsetWidth + 8) + 'px'); return true; }
  function weekFacts() { const R = S.race, th = weekTheme(R.week), left = R.done ? 0 : Math.min(runMs(R.week), R.end - Date.now()); return { R, th, left, pct: (100 - left / runMs(R.week) * 100).toFixed(1), score: Math.floor(S.score) }; }
  function renderWeekBar() { const { R, th, left, pct, score } = weekFacts();
    if (vMeter(isPhone() ? { time: fmtTime(left), cols: [{ pct, me: true }], score, label: `${th.name}: ${fmtTime(left)} left, score ${score.toLocaleString()}` } : null)) return;
    setHTML('#racebar', `<div class="rhead"><b>${esc(th.name)}</b><span>${R.ranked ? 'Ranked run' : 'Practice'} · ${fmtTime(left)} left</span></div>
      <div class="rrow me"><span class="rname">Score</span><span class="rtrack"><i style="width:${pct}%"></i></span><span class="rsc">${score.toLocaleString()}</span></div>`); }
  // every frame during a race: countdown, score reports, everyone's progress, finishing
  function tickRace(dt) { const R = S.race; if (!R) return; if (R.weekly) return tickWeekly(dt);
    if (UI.title === 'racego') { const left = R.start - raceNow(); const el = $('#rcount'); if (el) el.textContent = left > 0 ? Math.ceil(left / 1000) : 'Go!';
      if (left <= -400) { closeTitle(); SND.play('contract'); toast(`<b>Go!</b> First to ${R.target.toLocaleString()} points wins.`, 'goal');
        if (R.deal) setTimeout(() => toast(`<b>Market bargain:</b> ${esc(D.buildings[D.items[R.deal.kit].building].name)} kit only ${R.deal.price}g today!`, 'info'), 2500); } return; }
    if (raceNow() < R.start) return;
    UI.rtick = (UI.rtick || 0) - dt; const reached = S.score >= R.target && !R.done;
    if (UI.rtick <= 0 || reached) { UI.rtick = 4;
      rpc('race_score', { p_code: R.code, p_player: PLAYER, p_score: Math.floor(S.score) }).then(st => { if (!st) return; UI.rl = st; if (st.now) UI.rskew = Date.now() - Date.parse(st.now);
        st.players.forEach(p => { if (p.finished_ms != null && !p.me && !R.seen[p.name]) { R.seen[p.name] = 1; toast(`<b>${esc(p.name)}</b> reached ${R.target.toLocaleString()} in ${fmtTime(p.finished_ms)}!`, 'disc'); } });
        const me = st.players.find(p => p.me); if (me && me.finished_ms != null && !R.done) { R.done = true; R.time = me.finished_ms; save(); SND.play('contract'); openTitle('raceend'); }
        renderRaceBar(); if (UI.title === 'raceend') renderTitle(); }).catch(() => {}); }
  }
  function raceFacts() { const R = S.race, ps = (UI.rl && UI.rl.players) || [{ name: S.name, score: Math.floor(S.score), me: true }], t = R.target;
    return { R, t, ps: ps.map(p => { const sc = p.me ? Math.max(p.score, Math.floor(S.score)) : p.score; return { name: p.name, me: !!p.me, sc, done: p.finished_ms != null, ms: p.finished_ms }; }) }; }
  function renderRaceBar() { const el = $('#racebar'), R = S.race;
    if (!R || UI.title === 'racego' || UI.title === 'weeklygo') { el.hidden = true; document.body.classList.remove('has-vm'); return; } el.hidden = false;
    if (R.weekly) return renderWeekBar();
    const { t, ps } = raceFacts(), time = R.done ? fmtTime(R.time) : fmtTime(raceNow() - R.start);
    if (vMeter(isPhone() ? { time, cols: ps.map(p => ({ pct: Math.min(100, p.sc / t * 100).toFixed(1), me: p.me, done: p.done })), score: (ps.find(p => p.me) || ps[0]).sc,
      label: `Race ${R.code} to ${t.toLocaleString()}: ${ps.slice().sort((a, b) => b.sc - a.sc).map(p => `${p.me ? 'you' : p.name} ${p.sc.toLocaleString()}`).join(', ')}` } : null)) return;
    const rows = ps.map(p => `<div class="rrow ${p.me ? 'me' : ''}"><span class="rname">${esc(p.name)}</span><span class="rtrack"><i style="width:${Math.min(100, p.sc / t * 100).toFixed(1)}%"></i></span><span class="rsc">${p.done ? '✓ ' + fmtTime(p.ms) : p.sc.toLocaleString()}</span></div>`).join('');
    setHTML('#racebar', `<div class="rhead"><b>Race ${esc(R.code)}</b><span>to ${t.toLocaleString()} · ${R.done ? 'finished in ' + fmtTime(R.time) : fmtTime(raceNow() - R.start)}</span></div>${rows}`); }
  // tap the phone meter for the full picture
  $('#racebar').addEventListener('click', () => { if (!S.race || !$('#racebar').classList.contains('vm')) return;
    if (S.race.weekly) { const { R, th, left, score } = weekFacts(); toast(`<b>${esc(th.name)}</b> · ${R.ranked ? 'Ranked run' : 'Practice'} · ${fmtTime(left)} left · score ${score.toLocaleString()}`, 'info'); return; }
    const { R, t, ps } = raceFacts(); toast(`<b>Race ${esc(R.code)}</b> to ${t.toLocaleString()}: ${ps.slice().sort((a, b) => b.sc - a.sc).map(p => `${esc(p.me ? 'You' : p.name)} ${p.done ? '✓ ' + fmtTime(p.ms) : p.sc.toLocaleString()}`).join(' · ')}`, 'info'); });
  async function openBoard() { UI.drawer = 'lb'; UI.lb = { loading: true }; dirty();
    if (!NET.ok) { await pullMarket(); }
    if (!NET.ok) { UI.lb = { off: true }; dirty(); return; }
    try { sendScore(); await new Promise(r => setTimeout(r, 400)); UI.lb = await rpc('get_leaderboard', { p_farm: S.fid }); } catch (e) { UI.lb = { off: true }; } dirty(); }
  /* How many copies of the game are open right now: each page load gets a random id and pings every 30 s
     (background tabs too). The server counts ids seen in the last 2½ minutes. Nothing else is sent. */
  const INST = crypto.randomUUID();
  async function pingPresence() { try { const n = await rpc('presence_ping', { p_inst: INST }); if (typeof n === 'number') { NET.open = Math.max(1, n); renderOpen(); } } catch (e) { } }
  function renderOpen() { const el = $('#online'); if (!el) return; el.hidden = !NET.open; if (!NET.open) return;
    el.innerHTML = `<i></i><b>${NET.open}</b>`; el.title = `${NET.open} cop${NET.open === 1 ? 'y' : 'ies'} of Harvest Valley open right now`; }
  window.addEventListener('pagehide', () => { try { fetch(NET.url + 'presence_leave', { method: 'POST', keepalive: true, headers: { apikey: NET.key, Authorization: 'Bearer ' + NET.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_inst: INST }) }); } catch (e) { } });
  /* Market polling is kept light: one request (prices that differ from normal, the clock and the open-copies count, with
     the presence ping folded in) every 90 s while the tab is showing, a bare presence ping every 90 s while it's hidden,
     and the trade list only when the ticker is open. Older servers without market_sync fall back to get_market. */
  const MARKET_EVERY = 90000;
  const tradesWanted = () => !!(S && S.tick && S.tick.open !== false);
  async function pullMarket() {
    try { let m;
      try { m = await rpc('market_sync', { p_inst: INST }); if (!m || !m.prices) throw new Error('no sync'); NET.sync = true; }
      catch (e) { m = await rpc('get_market'); NET.sync = false; }
      NET.prices = m.prices || {}; NET.active = m.active || 1; NET.recov = m.recovery_hours; NET.ok = true;
      if (m.trades) NET.trades = m.trades;
      if (typeof m.open === 'number') { NET.open = Math.max(1, m.open); renderOpen(); }
      NET.skew = Date.now() - Date.parse(m.now); NET.at = Date.now();
      if (!UI.sentScore) { UI.sentScore = true; sendScore(); fetchMyName(); fetchMedals(); setTimeout(autoBackup, 3000); setTimeout(linkAllFarms, 6000); }
      if (NET.sync && tradesWanted()) { try { const t = await rpc('get_trades', { p_limit: 25 }); if (Array.isArray(t)) NET.trades = t; } catch (e) { } }
      if (online() && Date.now() - (NET.monAt || 0) > 120000) fetchMon(); }
    catch (e) { NET.ok = false; }
    NET.tried = true; UI.tickDirty = true; dirty();
  }
  /* Trade reports are batched: a sale or purchase is added to a queue and sent about 2.5 s later, with the same good and
     side merged (a stack sold in several quality tiers is one entry) and different goods sent together in one request
     (record_trades). Older servers without it get one record_trade call per entry. The queue also goes out when the
     tab is hidden or closed. */
  const TQ = { q: {}, timer: 0 };
  function reportTrade(item, qty, side) { if (!online()) return;
    if (!NET.ok || D.items[item].cat === 'kit') return;
    NET.trades.unshift({ item, qty, side, created_at: new Date(Date.now() - NET.skew).toISOString(), mine: true }); NET.trades.length = Math.min(NET.trades.length, 40);
    UI.tickDirty = true;
    const k = item + '|' + side; TQ.q[k] = (TQ.q[k] || 0) + qty;
    if (!TQ.timer) TQ.timer = setTimeout(flushTrades, 2500); }
  function takeTrades() { const o = []; for (const k in TQ.q) { const [item, side] = k.split('|'); let n = TQ.q[k]; while (n > 0) { o.push({ item, qty: Math.min(50, n), side }); n -= 50; } }
    TQ.q = {}; TQ.timer = 0; return o; }
  const gotPrices = m => { if (m && typeof m === 'object') { for (const it in m) if (typeof m[it] === 'number') NET.prices[it] = m[it]; dirty(); } };
  async function flushTrades() { clearTimeout(TQ.timer); const list = takeTrades(); if (!list.length) return;
    try { if (NET.noBatch) throw new Error('single'); gotPrices(await rpc('record_trades', { p_player: PLAYER, p_trades: list.slice(0, 30) }));
      if (list.length > 30) gotPrices(await rpc('record_trades', { p_player: PLAYER, p_trades: list.slice(30, 60) })); }
    catch (e) { if (/HTTP 404/.test(String(e && e.message))) NET.noBatch = true;
      for (const t of list.slice(0, 20)) { try { const m = await rpc('record_trade', { p_player: PLAYER, p_item: t.item, p_qty: t.qty, p_side: t.side }); if (typeof m === 'number') { NET.prices[t.item] = m; dirty(); } } catch (e2) { } } } }
  function flushTradesBeacon() { if (!TQ.timer) return; clearTimeout(TQ.timer); const list = takeTrades(); if (!list.length) return;
    try { fetch(NET.url + 'record_trades', { method: 'POST', keepalive: true, headers: { apikey: NET.key, Authorization: 'Bearer ' + NET.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_player: PLAYER, p_trades: list.slice(0, 30) }) }).catch(() => { }); } catch (e) { } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushTradesBeacon(); });
  window.addEventListener('pagehide', flushTradesBeacon);
  const mult = id => (online() && NET.ok && D.items[id].cat !== 'kit' && NET.prices[id]) || 1; // races use plain local prices
  // Goods you've made at least once can be bought back from the market at a markup (above even the +50% demand sell price).
  const RESALE = 1.75;
  const buyPrice = id => (S && S.race && S.race.deal && S.race.deal.kit === id) ? S.race.deal.price : Math.max(1, Math.round((D.items[id].buy || (D.items[id].value || 1) * RESALE) * mult(id)));
  const seasonTag = id => { const c = Object.keys(D.crops).find(k => D.crops[k].seed === id);
    return inSeason(id) ? `<span class="ins" title="In season: sells for ${Math.round((SR.sell - 1) * 100)}% more">in season +${Math.round((SR.sell - 1) * 100)}%</span>` : c && cropInSeason(c) ? '<span class="ins" title="Grows faster this season">in season</span>' : ''; };
  function moveTag(id) { const m = mult(id); if (Math.abs(m - 1) < .005) return '';
    const pct = Math.round((m - 1) * 100); return `<span class="mv ${pct > 0 ? 'up' : 'dn'}" title="Shared valley price">${pct > 0 ? '▲' : '▼'}${Math.abs(pct)}%</span>`; }

  const SELLABLE = ['crop', 'gathered', 'good', 'component'];          // what orders and market demand use
  // what the Open Market will sell you: supplies once unlocked, plus any good you've made at least once
  const canBuyItem = id => D.items[id].cat !== 'kit' && (D.items[id].buy ? unlocked(D.items[id].requires) : S.disc.includes(id) && SELLABLE.includes(D.items[id].cat));
  const MARKET_BUYS = SELLABLE.concat(['seed', 'supply']);               // what the market will buy from you
  // A short "how do I use this?" line for items that aren't obvious.
  // stations on Repeat quietly take ingredients from storage; say so wherever the item shows up
  function repeatUsers(id) { const seen = {};
    S.tiles.forEach(T => { const b = T.b; if (b && b.rep && D.recipes[b.rep] && D.recipes[b.rep].in[id]) { const k = D.buildings[b.type].name + ' → ' + (D.recipes[b.rep].label || D.items[Object.keys(D.recipes[b.rep].out)[0]].name); seen[k] = 1; } });
    return Object.keys(seen); }
  function useHint(id) { const it = D.items[id], ru = repeatUsers(id);
    if (ru.length) return `On Repeat, used up automatically by: ${ru.join(', ')}. Turn Repeat off at the station to keep it.`;
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
    const ins = pool.filter(id => inSeason(id)), from = ins.length && Math.random() < SR.demandPick ? ins : pool;
    if (from.length) { const it = from[(Math.random() * from.length) | 0]; S.market.demand = { item: it, pct: Math.random() < .3 ? 50 : 25 }; }
  }
  /* Can this farm actually make the item at Good quality right now? Crops (watering, fertilizer) and anything made
     from them can; gathered things never can; other goods only once one of their stations has a Quality upgrade.
     Orders only ask for Good when it's possible. */
  function canGood(id, depth = 0) { if (depth > 6) return false;
    if (Object.values(D.crops).some(c => c.item === id)) return true;
    return Object.entries(D.recipes).some(([rid, R]) => R.out[id] && (S.tiles.some(T => T.b && T.b.type === R.station && T.b.lv && T.b.lv.quality > 0)
      || (Object.keys(R.in).length && Object.keys(R.in).every(k => canGood(k, depth + 1))))); }
  function genOrder() {
    const pool = S.disc.filter(id => SELLABLE.includes(D.items[id].cat) && !S.orders.some(o => o.need[0][0] === id));
    if (!pool.length) return null;
    const crafted = pool.filter(id => ['good', 'component'].includes(D.items[id].cat));
    const raw = pool.filter(id => !crafted.includes(id));
    const useC = crafted.length && (!raw.length || Math.random() < .55);
    const list = useC ? crafted : raw, id = list[(Math.random() * list.length) | 0];
    const qty = useC ? 1 + ((Math.random() * 2.5) | 0) : 2 + ((Math.random() * 4) | 0);
    const minQ = S.maxQ >= 1 && Math.random() < .25 && canGood(id) ? 1 : 0;
    const gold = Math.round(D.items[id].value * qty * (useC ? 1.6 : 1.35) * (1 + minQ * .6));
    const names = D.orderNames[useC ? 'crafted' : 'raw'];
    return { id: S.uid++, kind: useC ? 'crafted' : 'raw', name: names[(Math.random() * names.length) | 0], need: [[id, qty, minQ]], gold, score: Math.round(gold * (useC ? .9 : .5)) };
  }
  const canFill = need => need.every(([id, n, q]) => count(id, q) >= n);
  /* ================= rock bottom =================
     If the farm can't earn its way out (no gold for seeds, nothing to sell, nothing growing or cooking, no
     resource to work), the valley bank lends 100g once. Stuck again before paying it back: game over. */
  const LOAN = { amount: 100, auto: 200, wait: 8 };
  function cheapestStart() { let m = Infinity; Object.keys(D.items).forEach(id => { const it = D.items[id]; if (it.cat === 'seed' && it.buy && unlocked(it.requires)) m = Math.min(m, buyPrice(id)); }); return m; }
  function stuck() {
    if (S.gold >= cheapestStart()) return false;
    if (Object.keys(S.inv).some(id => MARKET_BUYS.includes(D.items[id].cat) && count(id) > 0)) return false;
    if (S.cur || S.queue.length) return false;
    for (const T of S.tiles) {
      if (T.b && T.b.type === 'farm' && (T.b.st === 'growing' || T.b.st === 'ready')) return false;
      if (T.b && T.b.q && T.b.q.length) return false;
      if (T.b && T.b.q && Object.keys(D.recipes).some(r => D.recipes[r].station === T.b.type && unlocked(D.recipes[r].requires) && !Object.keys(D.recipes[r].in).length)) return false; // e.g. a Beehive
      if (T.o && T.r && D.gather[T.t] && unlocked(D.gather[T.t].needs) && !(T.t === 'forest' && T.r.st === 'stump')) return false;
    }
    if (S.helper && S.helper.cur) return false;
    return true;
  }
  function checkBroke(dt) { if (S.race) return;
    if (S.loan && S.gold >= LOAN.auto) repayLoan(true);
    if (S.over || UI.title) return;
    UI.brokeT = (UI.brokeT || 0) + dt; if (UI.brokeT < 1) return; const waited = UI.brokeT; UI.brokeT = 0;
    if (!stuck()) { UI.stuckFor = 0; return; }
    UI.stuckFor = (UI.stuckFor || 0) + waited; if (UI.stuckFor < LOAN.wait) return; UI.stuckFor = 0;
    if (!S.loan) { S.loan = { owed: LOAN.amount, day: S.day }; S.loans = (S.loans || 0) + 1; S.gold += LOAN.amount; logAct(`Borrowed ${LOAN.amount}g from the valley bank`, 'you'); save(); openTitle('loan'); }
    else { S.over = true; logAct('Out of gold, goods and work, with the loan unpaid', 'you'); save(); openTitle('over'); }
  }
  function repayLoan(auto) { if (!S.loan || S.gold < S.loan.owed) return; S.gold -= S.loan.owed; logAct(`Repaid the valley bank loan · −${S.loan.owed}g`, 'you');
    toast(`<b>Loan repaid.</b> ${auto ? `${S.loan.owed}g went back to the valley bank now that you have the gold. ` : ''}You’re debt-free.`, 'goal'); S.loan = null; save(); dirty(); }
  /* ================= weekly report =================
     A running tally for the current week; every 7 days it becomes a report (unless turned off in Settings). */
  function weekStart() { S.wk = { from: S.day, gold: S.gold, score: S.score, dp: S.dp, tiles: S.tiles.filter(t => t.o).length, ms: S.ms || 0, built: S.built || 0,
    made: {}, harvest: 0, sold: 0, spent: 0, orders: 0 }; }
  const wk = () => { if (!S.wk) weekStart(); return S.wk; };
  function weekReport() { const w = wk(), tiles = S.tiles.filter(t => t.o).length, made = Object.entries(w.made).sort((a, b) => b[1] - a[1]);
    return { n: Math.ceil((S.day - 1) / 7), from: w.from, to: S.day - 1, gold: S.gold - w.gold, score: S.score - w.score, dp: S.dp - w.dp, tiles: tiles - w.tiles, ms: (S.ms || 0) - w.ms,
      built: (S.built || 0) - w.built, made, harvest: w.harvest, sold: w.sold, spent: w.spent, orders: w.orders }; }
  function newDay() {
    sendScore(); autoBackup();
    if (S.day > 1 && (S.day - 1) % 7 === 0) { if (S.weekly !== false && !S.race) UI.pendingWeek = weekReport(); weekStart(); }
    rollMarket(); SND.play('day');
    if (S.moveHeat > 0 && (S.moveCool = (S.moveCool || 0) + 1) >= C.move.coolDays) { S.moveHeat--; S.moveCool = 0; }
    const wx = wxNow(), se = season();
    if (!noSeasons() && seasonDay() === 1) { logAct(`${se.name} begins (year ${yearOf()})`, 'you');
      toast(`<b>${esc(se.name)} is here.</b> ${esc(se.blurb)} In season: ${esc(cropList(se.crops))} grow ${Math.round((SR.grow - 1) * 100)}% faster, and they sell for ${Math.round((SR.sell - 1) * 100)}% more along with ${esc(nameList(se.goods.slice(0, 3)))} and more. Tap the day in the top bar for the details.`, 'goal'); }
    toast(`<b>Day ${S.day}${noSeasons() ? '' : ` · ${esc(se.name)} ${seasonDay()}`}.</b> ${noSeasons() || wx === 'clear' ? '' : `${esc(wxName(wx))}: ${esc(wxLine(S.day))} `}${S.market.demand ? `Market wants ${esc(D.items[S.market.demand.item].name)}: +${S.market.demand.pct}% today.` : ''}`, 'info');
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
  /* building limits: stations and storage are capped per area you own */
  const capFor = bt => { const B = D.buildings[bt]; return B.kind === 'station' || B.kind === 'storage' ? areas() * (B.perArea || 1) : Infinity; };
  const builtCount = bt => S.tiles.reduce((n, T) => n + (T.b && T.b.type === bt ? 1 : 0), 0);
  const kitFor = bt => Object.keys(D.items).find(id => D.items[id].building === bt);
  const capMsg = bt => { const B = D.buildings[bt], n = capFor(bt); return `Limit reached: ${n} ${B.name}${n === 1 ? '' : 's'} with ${areas()} area${areas() === 1 ? '' : 's'}. Survey new land to build more.`; };
  /* moving buildings: expensive, and pricier for each recent move */
  const MOVABLE = ['station', 'storage', 'sprinkler'];
  function moveCost(bt) { const k = kitFor(bt), kit = k && D.items[k], B = D.buildings[bt], heat = Math.pow(C.move.heat, S.moveHeat || 0);
    const c = { gold: Math.round((C.move.gold + (kit && kit.buy || 60)) * heat / 10) * 10 };
    if (B.place && (B.place.brick || 0) > 0) c.brick = Math.max(2, Math.round(B.place.brick / 2)); else c.plank = Math.max(2, Math.round(((B.place && B.place.plank) || 2) / 2) + 1);
    return c; }
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
    if (terrain === 'boulder' && unlocked('prospecting')) o.copper_ore = 1;
    if (terrain === 'water' && unlocked('glassworks')) o.sand = 1; return o; }
  function waterPlot(b) { b.wet = true; b.dry = 0; b.w[b.half ? 1 : 0] = 1; }

  /* station work, shared by the farmer, the farmhand and station automation */
  function loadErr(i, rid) { const b = T_(i).b, R = D.recipes[rid]; if (!b || !b.q || !R || R.station !== b.type) return 'Not a station';
    if (!unlocked(R.requires)) return 'Recipe locked';
    if (b.q.length >= stationSlots(b)) return 'All slots busy';
    for (const k in R.in) if (count(k) < R.in[k]) return `Needs ${R.in[k]} ${D.items[k].name}`; return null; }
  function fillCount(i, rid) { const b = T_(i).b, R = D.recipes[rid]; if (loadErr(i, rid)) return 0;
    let n = stationSlots(b) - b.q.length; for (const k in R.in) n = Math.min(n, Math.floor(count(k) / R.in[k])); return Math.max(0, n); }
  function doLoad(i, rid) { const b = T_(i).b, R = D.recipes[rid]; let q = Object.keys(R.in).length ? 2 : 0;
    for (const k in R.in) q = Math.min(q, take(k, R.in[k], 0, 'high'));
    // The Quality upgrade lifts goods one tier above their ingredients, never more (so cheap Basic inputs can't become
    // Excellent). Master Crafting's second level adds a bonus item to every third batch instead.
    q = Math.min(2, q + D.upgrades.quality.effect[b.lv.quality]);
    let bonus = false; if (b.lv.quality >= 2) { b.qn = (b.qn || 0) + 1; bonus = b.qn % 3 === 0; }
    const ok = Object.keys(R.out)[0];
    b.q.push({ r: rid, t: 0, dur: R.time * D.upgrades.speed.effect[b.lv.speed] / (wrule('craft', {})[b.type] || 1) / (1 + mastPerk(ok, 'speed')), qual: q, done: false, bonus });
    emit('load', { st: b.type }); }
  function collectErr(i) { const b = T_(i).b; const done = b && b.q ? b.q.filter(x => x.done) : [];
    if (!done.length) return 'Nothing ready'; let n = 0; done.forEach(x => { for (const k in D.recipes[x.r].out) if (storable(k)) n += D.recipes[x.r].out[k]; }); return room() >= n ? null : FULL; }
  function doCollect(i) { const b = T_(i).b; const done = b.q.filter(x => x.done); b.q = b.q.filter(x => !x.done);
    done.forEach(x => { const out = Object.assign({}, D.recipes[x.r].out); if (x.bonus) { const k0 = Object.keys(out)[0]; if (D.items[k0].cat !== 'kit') out[k0]++; } for (const k in out) {
      if (isMast(k)) out[k] += mastExtra(k, room() > out[k]);
      addItem(k, out[k], x.qual); mastAdd(k, out[k], i); const d = depth(k); wk().made[k] = (wk().made[k] || 0) + out[k];
      float(i, `+${out[k]} ${D.items[k].name}${x.qual ? ' · ' + QN[x.qual] : ''}`, '#fff');
      gainScore(C.score.craftPerDepth * d * out[k] * (1 + x.qual * .5), i, 'craft', k);
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
        if (snowBlocks(t.p)) return 'Too snowy today: only hardy crops can be planted';
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
        const yl = cr.yield + mastExtra(cr.item, room() > cr.yield);
        addItem(cr.item, yl, q); wk().harvest += yl; float(t.i, `+${yl} ${D.items[cr.item].name}${q ? ' · ' + QN[q] : ''}`, '#fff'); mastAdd(cr.item, yl, t.i);
        if (unlocked('seedsaving') && (S.seedN = (S.seedN || 0) + 1) % 3 === 0 && room() > 0) { addItem(cr.seed, 1, 0, true); setTimeout(() => float(t.i, `+1 ${D.items[cr.seed].name}`, '#b8f08a'), 400); }
        T_(t.i).b = { type: 'farm', st: 'raw', last: b.crop };
        gainScore(C.score.harvest * (1 + q * .5), t.i, 'harvest', cr.item);
        if (!q && !S.qTip) { S.qTip = 1; setTimeout(() => toast(`<b>Tip:</b> that harvest was ${QN[0]}. Water a crop at both growth stages for ${QN[1]}, and add fertilizer too for ${QN[2]}. They sell for more. Storage → “How do I make ${QN[1]} and ${QN[2]} goods?” explains it all.`, 'goal'), 1200); } first('harvest:' + b.crop, C.firsts.harvest, `First ${cr.name.toLowerCase()} harvested`);
        emit('harvest', { item: cr.item }); } },
    chop: { label: () => 'Chop tree', check: t => { const T = T_(t.i); if (!unlocked('woodcutting')) return 'Unlock Woodcutting first'; if (T.r.st !== 'tree') return 'No grown tree'; return outRoom(gatherOut('forest', 'chop')) ? null : FULL; },
      run: t => { const o = gatherOut('forest', 'chop'); for (const k in o) addItem(k, o[k]); T_(t.i).r.st = 'stump';
        float(t.i, `+${o.log} Logs`, '#fff'); gainScore(C.score.chop, t.i, 'chop', 'log'); first('gather:log', C.firsts.gather, 'First logs chopped'); emit('chop'); } },
    replant: { label: () => 'Plant sapling', check: t => T_(t.i).r.st !== 'stump' ? 'Nothing to replant' : count('sapling') < 1 ? 'No sapling' : null,
      run: t => { take('sapling', 1); Object.assign(T_(t.i).r, { st: 'sapling', g: 0 }); gainScore(C.score.replant, t.i); } },
    fish: { label: () => 'Fish', check: t => !unlocked('fishing') ? 'Unlock Fishing first' : T_(t.i).r.stock < 1 ? 'Fish are hiding. Try again soon' : outRoom(gatherOut('water', 'fish')) ? null : FULL,
      run: t => { const o = gatherOut('water', 'fish'), n = o.fish; T_(t.i).r.stock--; for (const k in o) addItem(k, o[k]); float(t.i, `+${n} Fish${o.sand ? ' + sand' : ''}`, '#fff'); if (o.sand) first('gather:sand', C.firsts.gather, 'First sand from the pond'); gainScore(C.score.fish, t.i, 'fish'); first('gather:fish', C.firsts.gather, 'First fish caught'); } },
    mine: { label: () => 'Break stone', check: t => !unlocked('stonecutting') ? 'Unlock Stonecutting first' : worked(T_(t.i)) ? 'Quarried out. Reopen it with Deep Quarrying, or change the land' : T_(t.i).r.stock < 1 ? 'No boulders on the surface. More resurface over time' : outRoom(gatherOut('boulder', 'mine')) ? null : FULL,
      run: t => { const o = gatherOut('boulder', 'mine'), n = o.stone; T_(t.i).r.stock--; useDep(T_(t.i)); for (const k in o) addItem(k, o[k]); float(t.i, `+${n} Stone${o.copper_ore ? ' + ore' : ''}`, '#fff'); if (o.copper_ore) first('gather:ore', C.firsts.gather, 'First copper ore'); gainScore(C.score.mine, t.i, 'mine', 'stone'); first('gather:stone', C.firsts.gather, 'First stone quarried'); } },
    gather: { label: t => (D.gather[T_(t.i).t] || {}).verb || 'Gather',
      check: t => { const T = T_(t.i), G = D.gather[T.t]; if (!G || !T.r) return 'Nothing to gather here';
        if (!unlocked(G.needs)) return `Unlock ${D.discoveries.find(d => d.id === G.needs).name} first`;
        if (worked(T)) return `${D.terrain[T.t].name} is worked out. Reopen it with Deep Quarrying, or change the land`;
        if (T.r.stock < 1) return 'Picked clean. It grows back over time'; return outRoom(G.out) ? null : FULL; },
      run: t => { const T = T_(t.i), G = D.gather[T.t]; T.r.stock--; useDep(T); const got = [];
        for (const k in G.out) { addItem(k, G.out[k]); got.push(`+${G.out[k]} ${D.items[k].name}`); first('gather:' + k, C.firsts.gather, `First ${D.items[k].name.toLowerCase()} gathered`); }
        float(t.i, got.join(' · '), '#fff'); gainScore(C.score.gather, t.i, 'gather', ...Object.keys(G.out)); emit('gather'); } },
    survey: { label: t => `Survey the ${D.regionThemes[S.regions[t.p].theme].name}`,
      check: t => { if (!unlocked('surveying')) return 'Unlock Land Surveying in Discovery'; if (!surveyable(t.p)) return 'Survey land next to an area you already have'; return canPay(surveyCost()); },
      run: t => { pay(surveyCost()); S.regions[t.p].open = true; genRegion(t.p); S.surveys = (S.surveys || 0) + 1; UI.live = null; UI.bounds = null;
        const th = D.regionThemes[S.regions[t.p].theme]; gainScore(C.score.survey, t.i); fixMsOrder(); float(t.i, `New area: ${th.name}`, '#b8f08a');
        first('survey:' + S.regions[t.p].theme, 2, `New area: ${th.name}`);
        if (S.surveys === 1 && !unlocked('chickens')) setTimeout(() => toast('<b>Animals are here.</b> With new land to spare, Chickens, Dairy Cows and Sheep are now in Discovery → Animals.', 'disc'), 2500);
        toast(`<b>${esc(th.name)} surveyed.</b> Buy its tiles from the edge of your land as usual. You now have ${areas()} areas, so you can build ${areas()} of each station.`, 'goal'); } },
    move: { label: t => `Move ${t.nm || 'building'}`,
      check: t => { const b = T_(t.p) && T_(t.p).b; if (!unlocked('rollers')) return 'Unlock Rollers & Skids';
        if (!b || !MOVABLE.includes(D.buildings[b.type].kind)) return 'Nothing to move'; if (t.i === t.p) return 'Pick a different tile';
        if (!isEmptyGrass(t.i)) return 'Pick empty grass you own'; return canPay(moveCost(b.type)); },
      run: t => { const b = T_(t.p).b; pay(moveCost(b.type)); T_(t.i).b = b; T_(t.p).b = null;
        S.queue.forEach(q => { if (q.i === t.p) q.i = t.i; });
        if (S.helper) { S.helper.steps.forEach(st => { if (st.i === t.p) st.i = t.i; }); if (S.helper.cur && S.helper.cur.i === t.p) S.helper.cur = null; }
        S.moveHeat = (S.moveHeat || 0) + 1; S.moveCool = 0; if (UI.sel === t.p) UI.sel = t.i;
        float(t.i, `${D.buildings[b.type].name} moved`, '#b8f08a'); } },
    load: { label: t => `Load ${t.n > 1 ? t.n + '× ' : ''}${D.items[Object.keys(D.recipes[t.p].out)[0]].name}`,
      check: t => loadErr(t.i, t.p), run: t => { const n = Math.max(1, Math.min(t.n || 1, fillCount(t.i, t.p))); for (let k = 0; k < n; k++) doLoad(t.i, t.p); } },
    collect: { label: () => 'Collect', check: t => collectErr(t.i), run: t => doCollect(t.i) },
    buy: { label: t => `Buy ${t.n} ${D.items[t.p].name}`, check: t => { const c = buyPrice(t.p) * t.n, bt = D.items[t.p].building;
        if (bt && builtCount(bt) + count(t.p) + t.n > capFor(bt)) return builtCount(bt) >= capFor(bt) ? capMsg(bt) : 'You already have a kit waiting to be placed';
        if (S.gold < c) return `Needs ${c}g`; if (storable(t.p) && room() < t.n) return FULL; return null; },
      run: t => { const c = buyPrice(t.p) * t.n; S.gold -= c; wk().spent += c; addItem(t.p, t.n, 0, true); float(t.i, `-${c}g`, '#ffb3a0'); reportTrade(t.p, t.n, 'buy'); emit('buy'); } },
    sell: { label: t => `Sell ${t.n} ${D.items[t.p].name}`, check: t => (S.inv[t.p] || [0, 0, 0])[t.q] >= t.n ? null : 'Not enough in storage',
      run: t => { const g = sellPrice(t.p, t.q) * t.n; S.inv[t.p][t.q] -= t.n; S.gold += g; wk().sold += g; float(t.i, `+${g}g`, '#f6e27a'); reportTrade(t.p, t.n, 'sell');
        gainScore(g / C.score.sellPer, t.i, 'sell'); first('sell', C.firsts.sell, 'First sale at the market'); emit('sell'); } },
    deliver: { label: t => t.p === 'ms' ? `Deliver: ${curMs() ? curMs().name : 'contract'}` : 'Deliver order',
      check: t => { const o = t.p === 'ms' ? curMs() : S.orders.find(o => o.id === t.p); if (!o) return 'Order is gone'; return canFill(o.need) ? null : 'Missing goods'; },
      run: t => {
        if (t.p === 'ms') { const m = curMs(); m.need.forEach(([id, n, q]) => take(id, n, q));
          S.gold += m.gold; S.dp += m.dp; S.ms++; fixMsOrder(); gainScore(m.gold, t.i);
          toast(`<b>Contract complete: ${esc(m.name)}</b> · +${m.gold}g · +${m.dp} Discovery`, 'disc');
        } else { const o = S.orders.find(o => o.id === t.p); o.need.forEach(([id, n, q]) => take(id, n, q));
          S.gold += o.gold; gainScore(o.score, t.i, 'order'); S.orders = S.orders.filter(x => x !== o); wk().orders++; S.refill = C.orderRefill;
          float(t.i, `+${o.gold}g`, '#f6e27a');
          if (o.kind === 'crafted') first('orderC', C.firsts.orderCrafted, 'First crafted order filled'); }
        first('order', C.firsts.order, 'First order delivered'); emit('deliver'); } },
    build: { label: () => 'Build Farm Plot', check: t => !isEmptyGrass(t.i) ? 'Tile is not empty grass' : canPay(C.farmPlotCost),
      run: t => { pay(C.farmPlotCost); T_(t.i).b = makeB('farm'); gainScore(C.score.build / 2, t.i); } },
    place: { label: t => `Place ${D.buildings[D.items[t.p].building].name}`,
      check: t => { if (!isEmptyGrass(t.i)) return 'Tile is not empty grass'; if (count(t.p) < 1) return 'No kit in storage'; const bt = D.items[t.p].building;
        if (builtCount(bt) >= capFor(bt)) return capMsg(bt); return canPay(D.buildings[bt].place); },
      run: t => { const bt = D.items[t.p].building; take(t.p, 1); pay(D.buildings[bt].place); T_(t.i).b = makeB(bt); S.built++;
        gainScore(C.score.build, t.i); first('build:' + bt, C.firsts.build, `${D.buildings[bt].name} built`);
        toast(`<b>${esc(D.buildings[bt].name)} is running.</b> ${D.buildings[bt].kind === 'station' ? 'Select it to load recipes.' : D.buildings[bt].kind === 'storage' ? `Storage is now ${cap()}.` : 'It waters the planted plots around it.'}`, 'info'); emit('build', { st: bt }); } },
    expand: { label: t => `Buy ${D.terrain[T_(t.i).t].name}`,
      check: t => { if (T_(t.i).o) return 'Already yours'; if (!nbrs(t.i).some(n => T_(n).o && !greenT(n))) return 'Expand closer first'; return canPay(expCost(t.i)); },
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
    deepen: { label: t => `Reopen the ${D.terrain[T_(t.i).t].name}`,
      check: t => { const T = T_(t.i); if (!unlocked('deepquarry')) return 'Unlock Deep Quarrying in Discovery'; if (!worked(T)) return 'There’s still some left to dig'; return canPay(DEEPEN_COST); },
      run: t => { const T = T_(t.i), G = D.gather[T.t]; pay(DEEPEN_COST); T.r.dep = G.deposit; T.r.stock = 1; T.r.rt = 0;
        float(t.i, `${D.terrain[T.t].name} reopened`, '#b8f08a'); gainScore(C.score.upgrade, t.i); } },
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
        if (T.r && L.deposit != null && T.r.dep != null) { T.r.dep = L.deposit; T.r.stock = Math.min(T.r.stock, L.deposit); }
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
    SND.play(t.a === 'deliver' && t.p === 'ms' ? 'contract' : t.a, who === 'hand' ? 0.55 : 1);
    const res = UI.floats.slice(f0).map(f => f.text).filter(x => !/^\+\d+$/.test(x) && !/g$/.test(x)), dg = S.gold - g0;
    const money = ['sell', 'buy', 'deliver', 'expand', 'build', 'place', 'upgrade', 'toolup', 'homeup', 'hire', 'reshape', 'survey', 'move'].includes(t.a); // goal rewards aren't the action's doing
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
    else if (st.s === 'fish' || st.s === 'mine' || st.s === 'gather') t = { a: st.s };
    if (!t) return null; t.i = st.i;
    if (checkTask(t)) return null;
    const same = x => x && x.a === t.a && x.i === t.i; if (same(S.cur) || S.queue.some(same)) return null; // the farmer has it
    return t;
  }
  function stepLabel(st) {
    if (st.s === 'tend') return `Tend plot · ${D.crops[st.p].name}`;
    if (st.s === 'station') return `Run ${D.buildings[T_(st.i).b ? T_(st.i).b.type : 'stove'].name} · ${D.items[Object.keys(D.recipes[st.p].out)[0]].name}`;
    if (st.s === 'gather') return (D.gather[T_(st.i).t] || {}).verb || 'Gather';
    return { forest: 'Chop and replant a tree', fish: 'Fish the pond', mine: 'Break stone' }[st.s];
  }
  /* Errands: the farmhand walks to the Open Market, buys what a recipe is missing, walks back and loads the station.
     It takes priority over the routine and then picks the routine back up. */
  const marketIdx = () => S.tiles.findIndex(T => T.b && T.b.type === 'market');
  function errandPlan(i, rid, n) { const R = D.recipes[rid], rows = Object.keys(R.in).map(k => { const need = R.in[k] * n, have = count(k), miss = Math.max(0, need - have);
      return { k, need, have, miss, price: canBuyItem(k) ? buyPrice(k) : null }; });
    const cost = rows.reduce((g, r) => g + (r.price || 0) * r.miss, 0), qty = rows.reduce((q, r) => q + r.miss, 0);
    return { rows, cost, qty, missing: rows.filter(r => r.miss), unbuyable: rows.filter(r => r.miss && r.price == null) }; }
  function errandErr(i, rid, n, P) { const b = T_(i).b;
    if (!unlocked('errands')) return 'Unlock Errands in Discovery (after Farmhand)';
    if (!S.helper) return 'Hire a farmhand at the Homestead first';
    if (S.helper.errand) return 'Your farmhand is already out on an errand';
    if (!P.missing.length) return 'You already have everything: just press Load';
    if (P.unbuyable.length) return `${D.items[P.unbuyable[0].k].name} isn’t sold at the market${D.items[P.unbuyable[0].k].buy ? '' : ' until you’ve made it once'}`;
    if (S.gold < P.cost) return `Needs ${P.cost}g`;
    if (room() < P.qty) return FULL;
    if (stationSlots(b) - b.q.length < n) return 'Not enough free batch slots';
    if (marketIdx() < 0) return 'No Open Market';
    return null; }
  function sendErrand(i, rid, n) { const P = errandPlan(i, rid, n), e = errandErr(i, rid, n, P); if (e) { toast(esc(e), 'warn'); return; }
    const F = S.helper; F.errand = { st: i, r: rid, n, ph: 'go', t: 0, set: false }; F.cur = null; F.path = [];
    toast(`<b>Farmhand is off to the market</b> for ${esc(nmList(P.missing.map(r => `${r.miss} ${D.items[r.k].name}`)))} (about ${P.cost}g), then loads ${n > 1 ? n + '× ' : ''}${esc(D.items[Object.keys(D.recipes[rid].out)[0]].name)}.`, 'info'); dirty(); }
  function errandFail(msg) { const F = S.helper; F.errand = null; F.path = []; toast(`<b>Farmhand errand stopped:</b> ${esc(msg)}`, 'warn'); dirty(); }
  function updateErrand(F, dt) { const E = F.errand, spd = F.spd || 1, b = T_(E.st).b;
    if (!b || !b.q) return errandFail('the station is gone.');
    if (E.ph === 'go' || E.ph === 'back') { const tgt = E.ph === 'go' ? marketIdx() : E.st;
      if (!E.set) { const p = findPath(idx(Math.round(F.x), Math.round(F.y)), standGoals(tgt)); if (!p) return errandFail(`they can’t reach the ${E.ph === 'go' ? 'market' : 'station'}.`); F.path = p; E.set = true; }
      if (moveActor(F, dt * spd, unlocked('crew') ? C.walkSpeed : D.farmhand.walkSpeed)) { E.set = false; E.t = 0; E.ph = E.ph === 'go' ? 'shop' : 'load';
        const dx = tx(tgt) - F.x, dy = ty(tgt) - F.y; if (Math.abs(dx) + Math.abs(dy) > .01) F.dir = [dx, dy]; dirty(); }
      return; }
    E.t += dt * spd; if (E.t < 1.4) return;
    const out = D.items[Object.keys(D.recipes[E.r].out)[0]].name;
    if (E.ph === 'shop') { const P = errandPlan(E.st, E.r, E.n);
      if (P.unbuyable.length) return errandFail(`${D.items[P.unbuyable[0].k].name} isn’t sold at the market.`);
      if (S.gold < P.cost) return errandFail(`not enough gold (needs ${P.cost}g).`);
      if (room() < P.qty) return errandFail('storage is full.');
      P.missing.forEach(r => { const c = r.price * r.miss; S.gold -= c; wk().spent += c; addItem(r.k, r.miss, 0, true); reportTrade(r.k, r.miss, 'buy'); });
      const mi = marketIdx(); if (P.cost) float(mi, `-${P.cost}g`, '#ffb3a0'); SND.play('buy', .55);
      logAct(`Errand: bought ${P.missing.map(r => `${r.miss} ${D.items[r.k].name}`).join(', ')} for ${out} · −${P.cost}g`, 'hand');
      E.ph = 'back'; E.t = 0; dirty(); return; }
    let n = 0; for (let k = 0; k < E.n; k++) { if (loadErr(E.st, E.r)) break; doLoad(E.st, E.r); n++; }
    if (n) { float(E.st, `Loaded ${n > 1 ? n + '× ' : ''}${out}`, '#b8f08a'); SND.play('load', .55); logAct(`Errand: loaded ${n > 1 ? n + '× ' : ''}${out}`, 'hand'); }
    else toast(`<b>Farmhand is back</b> but couldn’t load ${esc(out)}: ${esc(loadErr(E.st, E.r) || 'no room')}.`, 'warn');
    F.errand = null; F.path = []; F.idle = 0; dirty(); }
  function updateHelper(dt) {
    const F = S.helper; if (F && F.errand) return updateErrand(F, dt);
    if (!F || !F.on || !F.steps.length) { if (F) F.cur = null; return; }
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
    const rain = raining(), heat = wxNow() === 'heat';
    const bd = builderDay();
    S.tiles.forEach((T, i) => {
      const b = T.b;
      if (b && b.type === 'farm' && b.st === 'growing') {
        if (rain && !b.wet) { waterPlot(b); dirty(); }
        else if (heat && b.wet && (b.dry = (b.dry || 0) + dt) >= SR.heatDry) { b.wet = false; b.dry = 0; dirty(); }
        const cr = D.crops[b.crop]; b.g += dt * (b.wet ? 1 : .45) * (b.fert ? C.fertGrowth : 1) * wrule('grow', 1) * seasonGrow(b.crop) * (1 + mastPerk(cr.item, 'speed'));
        if (!b.half && b.g >= cr.grow / 2) { b.half = true; b.wet = false; dirty(); }
        if (b.g >= cr.grow) { b.st = 'ready'; float(i, 'Ready!', '#b8f08a'); SND.play('ready'); dirty(); }
      } else if (b && b.q) {
        const j = b.q.find(x => !x.done);
        if (j) { j.t += dt; if (j.t >= j.dur) { j.done = true; if (!b.auto) float(i, 'Done!', '#b8f08a'); SND.play('done', b.auto ? 0.5 : 1); dirty(); } }
        if (b.auto && unlocked('autocollect') && !collectErr(i)) { doCollect(i); dirty(); }
        if (b.rep && unlocked('repeat') && !loadErr(i, b.rep)) { doLoad(i, b.rep); dirty();
          b.repDone = (b.repDone || 0) + 1;
          if (b.repN && b.repDone >= b.repN) { { const R = D.recipes[b.rep]; toast(`<b>${esc(D.buildings[b.type].name)}</b> finished its repeats of ${esc(R.label || D.items[Object.keys(R.out)[0]].name)}. Repeat is off.`, 'info'); b.rep = null; b.repN = null; b.repDone = 0; } }
          if (b.repDay !== S.day) { b.repDay = S.day; const R = D.recipes[b.rep]; logAct(`${D.buildings[b.type].name} on Repeat: using ${inTxtPlain(R.in)} for ${R.label || D.items[Object.keys(R.out)[0]].name} (logged once a day)`, 'auto'); } }
      } else if (b && D.buildings[b.type].kind === 'sprinkler') {
        if (b.fx > 0) b.fx -= dt;
        around(i, D.buildings[b.type].radius).forEach(j => { const f = farmAt(j); if (f && f.st === 'growing' && !f.wet) { waterPlot(f); b.fx = 1.4; dirty(); } });
      }
      const R = T.r; if (!R) return;
      if (T.t === 'forest') { if (R.st === 'sapling') { R.g += dt * (bd ? 2 : 1); if (R.g >= D.gather.forest.regrow) { R.st = 'tree'; dirty(); } } }
      else { const G = D.gather[T.t]; if (R.stock < (finite(T) ? Math.min(G.stock, R.dep) : G.stock)) { R.rt += dt * (T.t === 'water' ? wrule('fish', 1) : 1) * (bd ? 2 : 1); if (R.rt >= G.regen) { R.rt = 0; R.stock++; dirty(); } } else R.rt = 0; }
    });
    if (S.orders.length < C.orderSlots) { S.refill -= dt * wrule('orders', 1); if (S.refill <= 0) { const o = genOrder(); if (o) S.orders.push(o); S.refill = C.orderRefill; dirty(); } }
    updateAvatar(dt); updateHelper(dt); checkBroke(dt);
    const g = D.goals[S.goal]; if (g && goalStateDone(g)) completeGoal();
    UI.saveIn -= dt; if (UI.saveIn <= 0) save();
  }

  /* ================= save / load ================= */
  const saveKey = () => (S && S.race) ? (S.race.weekly ? WEEK_KEY : RACE_KEY) : SLOT_KEYS[SLOT];
  function save() { UI.saveIn = 8; try { localStorage.setItem(saveKey(), JSON.stringify(S)); UI.savedAt = Date.now(); } catch (e) { /* storage blocked: play continues */ } }
  function load(key = SLOT_KEYS[SLOT]) { try { const s = localStorage.getItem(key); if (!s) return null; const o = JSON.parse(s); return o && o.v === 1 && o.tiles ? o : null; } catch (e) { return null; } }
  function slotInfo(k) { try { const s = localStorage.getItem(SLOT_KEYS[k]); if (!s) return null; const o = JSON.parse(s); return o && o.tiles ? { name: o.name || 'Farmer', day: o.day, gold: o.gold, score: Math.floor(o.score || 0), mode: o.mode || 'online' } : null; } catch (e) { return null; } }
  const setSlot = k => { SLOT = k; try { localStorage.setItem('harvestworks.slot', k); } catch (e) { } };

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
    if (!inB(x, y)) return -1; const i = idx(x, y);
    if (isVoid(i)) return unlocked('surveying') && surveyable(regionOf(i)) ? i : -1; // only the dashed areas you could survey
    return i;
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
  // Keep the camera over land you can see: the open areas plus a ring of surveyable ones.
  function landBox() {
    if (UI.bounds) return UI.bounds; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    S.regions.forEach((R, r) => { if (!R.open && !(unlocked('surveying') && surveyable(r))) return; const rx = r % RW(), ry = r / RW() | 0;
      x0 = Math.min(x0, rx * RS()); y0 = Math.min(y0, ry * RS()); x1 = Math.max(x1, rx * RS() + RS() - 1); y1 = Math.max(y1, ry * RS() + RS() - 1); });
    return (UI.bounds = [x0, y0, x1, y1]);
  }
  function clampCam() {
    cam.z = Math.max(.5, Math.min(3.2, cam.z));
    const [x0, y0, x1, y1] = landBox(); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([x, y]) => { const [vx, vy] = view(x, y), u = isoU(vx, vy), v = isoV(vx, vy); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    cam.u = Math.max(u0, Math.min(u1, cam.u)); cam.v = Math.max(v0, Math.min(v1, cam.v));
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
    if (e.target.closest('textarea,select,input:not([type=range]):not([type=checkbox])')) return;
    const k = e.key, s = 40 / cam.z * CAM_SPEED;
    if (k === 'ArrowLeft' || k === 'a') cam.u -= s; else if (k === 'ArrowRight' || k === 'd') cam.u += s;
    else if (k === 'ArrowUp' || k === 'w') cam.v -= s / 2; else if (k === 'ArrowDown' || k === 's') cam.v += s / 2;
    else if (k === '+' || k === '=') zoomAt(1.2, W / 2, H / 2); else if (k === '-') zoomAt(1 / 1.2, W / 2, H / 2);
    else if (k === 'q' || k === 'Q') rotateView(-1); else if (k === 'e' || k === 'E') rotateView(1);
    else if (k === 'x' || k === 'X') toggleLabels();
    else if (k === 'm' || k === 'M') { SND.set('mute', !SND.prefs.mute); toast(SND.prefs.mute ? 'Sound off. Press M to turn it back on.' : 'Sound on.', 'info'); dirty(); }
    else if (k === 'Escape') { if (UI.moving != null) UI.moving = null; else if (UI.drawer) UI.drawer = null; else UI.sel = -1; dirty(); }
    else return; clampCam();
  });

  function toggleLabels() { UI.labels = !UI.labels; const b = $('[data-labels]'); if (b) { b.classList.toggle('on', UI.labels); b.setAttribute('aria-pressed', UI.labels); } }
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
    if (D.gather[T.t] && D.gather[T.t].action === 'gather') return { a: 'gather' };
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
  /* Building names: the eye button (or X) labels every building on the map. */
  function drawLabels(p, list) {
    const fs = Math.min(12 * DPR, Math.max(9 * DPR, 3.2 * p)); cx.font = `600 ${fs}px "Lexend", system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    list.sort((m, n) => m.sy - n.sy).forEach(({ sx, sy, name }) => {
      const w = cx.measureText(name).width + fs * .9, h = fs * 1.5, y = sy - h / 2;
      cx.fillStyle = 'rgba(36,22,13,.88)'; cx.beginPath(); cx.roundRect ? cx.roundRect(sx - w / 2, y - h / 2, w, h, h / 2) : cx.rect(sx - w / 2, y - h / 2, w, h); cx.fill();
      cx.strokeStyle = 'rgba(245,197,66,.55)'; cx.lineWidth = Math.max(1, p * .3); cx.stroke();
      cx.fillStyle = '#f6e7c1'; cx.fillText(name, sx, y + fs * .04); });
    cx.textBaseline = 'alphabetic';
  }
  /* ================= weather on screen =================
     Drawn over the farm in screen space: a soft colour grade for the season, then today's weather (rain while it
     falls, snow, morning mist, fog, frost, sunshine, heat). Blossom petals in spring and leaves in autumn drift by.
     With reduced motion on, only the tints are drawn. */
  const FIELD = { spring: '#1e3a30', summer: '#22392a', autumn: '#33281c', winter: '#24303a', snow: '#2a3440' };
  // season colour grades are drawn in soft-light, so they warm or cool the picture without washing it out
  const GRADE = { summer: 'rgba(255,200,90,.14)', autumn: 'rgba(240,130,50,.22)', winter: 'rgba(120,160,220,.28)', snow: 'rgba(170,200,240,.2)' };
  const WX = { t: 0, last: 0, drops: [], flakes: [], drift: [] };
  const calm = () => mq('(prefers-reduced-motion: reduce)');
  // keep a particle list at size n, spawning new ones anywhere on screen (or along the top once settled)
  function fill(list, n, mk) { while (list.length > n) list.pop(); while (list.length < n) list.push(mk(list.length < n * .9 && !list.settled)); list.settled = true; }
  function haze(a, col) { if (a <= 0) return; cx.fillStyle = `rgba(${col},${a})`; cx.fillRect(0, 0, W, H);
    // a few slow drifting banks so it reads as fog rather than a flat tint
    for (let k = 0; k < 5; k++) { const x = ((WX.t * 6 * DPR + k * W * .37) % (W * 1.6)) - W * .3, y = H * (.2 + .17 * k), r = Math.max(W, H) * .32;
      const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a * .9})`); gr.addColorStop(1, `rgba(${col},0)`); cx.fillStyle = gr; cx.fillRect(x - r, y - r, r * 2, r * 2); } }
  function drawWeather() {
    const ms = performance.now(), dt = Math.min(.1, (ms - (WX.last || ms)) / 1000); WX.last = ms; WX.t += dt;
    const sk = sceneKey(), k = wxNow(), hr = hour(), rain = raining(), move = !calm(), A = W * H / (DPR * DPR), D2 = DPR;
    cx.globalCompositeOperation = 'soft-light';
    if (GRADE[sk]) { cx.fillStyle = GRADE[sk]; cx.fillRect(0, 0, W, H); }
    if (k === 'sun' || k === 'heat') { const day = Math.max(0, Math.min(1, (hr - 7) / 3, (20 - hr) / 3)), gr = cx.createRadialGradient(W * .15, 0, 0, W * .15, 0, Math.max(W, H) * 1.1);
      gr.addColorStop(0, `rgba(255,230,150,${(k === 'heat' ? .5 : .32) * day})`); gr.addColorStop(1, `rgba(255,230,150,${(k === 'heat' ? .16 : .04) * day})`); cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
      if (k === 'heat') { cx.fillStyle = `rgba(255,140,60,${.14 * day})`; cx.fillRect(0, 0, W, H); } }
    cx.globalCompositeOperation = 'source-over';
    if (k === 'rain') { cx.fillStyle = `rgba(50,70,95,${rain ? .18 : .07})`; cx.fillRect(0, 0, W, H); }
    if (k === 'fog') haze(.2, '226,230,234');
    if (k === 'mist') haze(hr < 9 ? .24 : hr < 10 ? .24 * (10 - hr) : 0, '232,236,240');
    if (k === 'frost') { const a = hr < 9 ? .22 : hr < 10 ? .22 * (10 - hr) : 0; if (a > 0) { cx.fillStyle = `rgba(210,232,255,${a})`; cx.fillRect(0, 0, W, H); } }
    if (!move) return;
    fill(WX.drops, rain ? Math.round(A / 2600) : 0, any => ({ x: Math.random() * W * 1.2, y: any ? Math.random() * H : -Math.random() * 40 * D2, v: (620 + Math.random() * 240) * D2, l: (9 + Math.random() * 7) * D2 }));
    if (WX.drops.length) { cx.strokeStyle = 'rgba(196,220,244,.55)'; cx.lineWidth = D2; cx.beginPath();
      WX.drops.forEach(q => { q.y += q.v * dt; q.x -= q.v * .22 * dt; if (q.y > H + q.l) { q.y = -q.l; q.x = Math.random() * W * 1.2; } cx.moveTo(q.x, q.y); cx.lineTo(q.x + q.l * .22, q.y - q.l); }); cx.stroke(); }
    fill(WX.flakes, k === 'snow' ? Math.round(A / 3000) : 0, any => ({ x: Math.random() * W, y: any ? Math.random() * H : -8 * D2, v: (28 + Math.random() * 34) * D2, ph: Math.random() * 6.3, s: Math.random() < .3 ? 3 : 2 }));
    if (WX.flakes.length) { cx.fillStyle = 'rgba(250,252,255,.9)';
      WX.flakes.forEach(q => { q.y += q.v * dt; q.x += Math.sin(WX.t * 1.3 + q.ph) * 14 * D2 * dt; if (q.y > H) { q.y = -8 * D2; q.x = Math.random() * W; } cx.fillRect(q.x, q.y, q.s * D2, q.s * D2); }); }
    // spring petals and autumn leaves, a handful at a time on calm days
    const leafy = (sk === 'spring' || sk === 'autumn') && !rain, cols = sk === 'autumn' ? ['#d06a2a', '#e8a03a', '#b8401e', '#c8a040'] : ['#f4a6c6', '#fbd3e3', '#fff0f6'];
    fill(WX.drift, leafy ? Math.max(3, Math.round(A / 70000)) : 0, any => ({ x: Math.random() * W, y: any ? Math.random() * H : -6 * D2, v: (22 + Math.random() * 20) * D2, ph: Math.random() * 6.3, c: (Math.random() * 4) | 0 }));
    WX.drift.forEach(q => { q.y += q.v * dt; q.x += (Math.sin(WX.t * .9 + q.ph) * 26 + 14) * D2 * dt; if (q.y > H || q.x > W + 10) { q.y = -6 * D2; q.x = Math.random() * W * .8; }
      const f = Math.sin(WX.t * 4 + q.ph) > 0; cx.fillStyle = cols[q.c % cols.length]; cx.fillRect(q.x, q.y, (f ? 3 : 2) * D2, (f ? 2 : 3) * D2); });
  }
  function draw() {
    const p = P(), now = S.time;
    cx.imageSmoothingEnabled = false; ART.setScene(sceneKey());
    cx.fillStyle = FIELD[sceneKey()] || FIELD.spring; cx.fillRect(0, 0, W, H);
    if (!UI.live) { UI.live = []; S.tiles.forEach((T, i) => { if (T.t !== 'void') UI.live.push(i); }); }
    const order = UI.live.slice(), vd = {};
    order.forEach(i => { vd[i] = view(tx(i), ty(i)); });
    // the 3×3 monument is drawn once, from whichever of its tiles is nearest the viewer at this angle
    UI.monFront = -1; if (S.green) { let bd = -1e9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = S.green.c + dy * S.w + dx, v = vd[j]; if (!v) continue; const d = v[0] + v[1] + v[0] * 1e-3; if (d > bd) { bd = d; UI.monFront = j; } } }
    order.sort((a, b) => (vd[a][0] + vd[a][1]) - (vd[b][0] + vd[b][1]) || vd[a][0] - vd[b][0]);
    const frontier = new Set(); order.forEach(i => { if (!S.tiles[i].o && nbrs(i).some(n => S.tiles[n].o && !greenT(n))) frontier.add(i); });
    // screen step for one tile along world x and world y at the current angle
    { const o = toScreen(0, 0), ax = toScreen(1, 0), ay = toScreen(0, 1); UI.ex = [ax[0] - o[0], ax[1] - o[1]]; UI.ey = [ay[0] - o[0], ay[1] - o[1]]; }
    // the map's earthen sides, drawn under the tops along its outer edges
    const skirt = 4 * p;
    for (const i of order) { const x = tx(i), y = ty(i);
      N4.forEach(([dx, dy]) => { if (inB(x + dx, y + dy) && !isVoid(idx(x + dx, y + dy))) return;
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
    // areas you could survey: a dashed outline with the area's name
    const survLabels = [];
    if (unlocked('surveying')) S.regions.forEach((R, r) => { if (!surveyable(r)) return;
      const rx = r % RW() * RS(), ry = (r / RW() | 0) * RS(), e = RS() - .5, on = UI.hover >= 0 && isVoid(UI.hover) && regionOf(UI.hover) === r || UI.sel >= 0 && isVoid(UI.sel) && regionOf(UI.sel) === r;
      cx.beginPath(); [[-.5, -.5], [e, -.5], [e, e], [-.5, e]].forEach(([a, b], k) => { const [sx, sy] = toScreen(rx + a, ry + b); k ? cx.lineTo(sx, sy) : cx.moveTo(sx, sy); }); cx.closePath();
      cx.fillStyle = on ? 'rgba(246,226,122,.16)' : 'rgba(246,226,122,.05)'; cx.fill();
      cx.setLineDash([5 * p, 4 * p]); cx.strokeStyle = `rgba(246,226,122,${on ? .9 : .3 + .25 * pulse})`; cx.lineWidth = p * (on ? 1.1 : .7); cx.stroke(); cx.setLineDash([]);
      const [lx, ly] = toScreen(rx + RS() / 2 - .5, ry + RS() / 2 - .5); survLabels.push({ sx: lx, sy: ly, name: `Survey: ${D.regionThemes[R.theme].name}` }); });
    if (survLabels.length) drawLabels(p, survLabels);
    // hover & selection
    if (UI.hover >= 0 && UI.hover !== UI.sel && !isVoid(UI.hover)) { tilePoly(UI.hover); cx.strokeStyle = 'rgba(255,255,255,.45)'; cx.lineWidth = p * .8; cx.stroke(); }
    if (UI.sel >= 0 && S.tiles[UI.sel].b && D.buildings[S.tiles[UI.sel].b.type].kind === 'sprinkler') around(UI.sel, D.buildings[S.tiles[UI.sel].b.type].radius).forEach(j => { if (j === UI.sel) return; tilePoly(j, 1); cx.fillStyle = 'rgba(143,211,239,.18)'; cx.fill(); });
    if (UI.sel >= 0 && !isVoid(UI.sel)) { tilePoly(UI.sel); cx.strokeStyle = '#f6e27a'; cx.lineWidth = p * 1.2; cx.stroke(); }
    if (UI.moving != null && UI.hover >= 0 && !isVoid(UI.hover)) { tilePoly(UI.hover); cx.fillStyle = isEmptyGrass(UI.hover) ? 'rgba(184,240,138,.3)' : 'rgba(224,72,94,.25)'; cx.fill(); }
    // task target markers
    [S.cur, ...S.queue].forEach((t, k) => { if (!t) return; tilePoly(t.i, 3); cx.strokeStyle = k ? 'rgba(143,211,239,.55)' : 'rgba(143,211,239,.9)'; cx.lineWidth = p * .7; cx.stroke(); });
    // objects + avatar, depth sorted
    const labels = [];
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
        } else if (b.type === 'mon_site') {
          if (i === UI.monFront) { const kind = b.kind || 'pyramid', img = ART.get(`mon:${kind}.${monStageOf(b.p)}.${'site'}`), [mx, my] = toScreen(tx(b.c), ty(b.c));
            blit(img, mx, my, p, img.ax, img.ay);
            if (UI.labels) labels.push({ sx: mx, sy: my - (img.ay - 6) * p, name: (D.monuments[kind] || D.monuments.pyramid).name }); }
        } else {
          let key = b.type; const active = b.q && b.q.some(j => !j.done);
          if (b.type === 'depot') { const m = MONK(); key = 'depot:' + (m ? Math.min(5, Math.ceil((m.today || 0) / Math.max(1, (m.cap || 800) / 5))) : 0); }
          if (b.type === 'monument') key = `mon:${b.m.kind || 'pyramid'}.${monStageOf(b.m.id)}.deco`;
          if (b.type === 'stove' && active) key = 'stove_on';
          if (b.type === 'medal') key = 'medal:' + b.m.place;
          if (b.type === 'mill' || b.type === 'sawmill') key += ':' + (active ? ((now * 4) | 0) % 2 : 0);
          if (b.type === 'coop' || b.type === 'dairy' || b.type === 'pasture') key += ':' + (((now * .8) + i * .37) | 0) % 2;
          if (D.buildings[b.type].kind === 'sprinkler') key = (b.type === 'big_sprinkler' ? 'big_sprinkler:' : 'sprinkler:') + (b.fx > 0 ? ((now * 6) | 0) % 2 : 0);
          const img = ART.get(key); if (img.ax != null) blit(img, sx, sy, p, img.ax, img.ay); else blit(img, sx, sy, p, 16, img.height - 4);
          if (UI.labels) labels.push({ sx, sy: sy - (img.height - 1) * p, name: D.buildings[b.type].name });
          if (b.type === 'homestead' && UI.noticeK && S.noticeSeen !== UI.noticeK && !S.race) { // something waiting at the Homestead
            const gy = sy - (img.height + 4) * p, gl = .55 + .45 * Math.sin(now * 4);
            cx.fillStyle = `rgba(246,210,74,${.25 * gl})`; cx.beginPath(); cx.arc(sx, gy - 5 * p, 9 * p, 0, 7); cx.fill();
            cx.fillStyle = '#f6d24a'; cx.strokeStyle = '#3d2617'; cx.lineWidth = p * .8; cx.beginPath(); cx.arc(sx, gy - 5 * p, 5.5 * p, 0, 7); cx.fill(); cx.stroke();
            cx.fillStyle = '#3d2617'; cx.fillRect(sx - p * .8, gy - 9 * p, p * 1.6, 5 * p); cx.fillRect(sx - p * .8, gy - 3 * p, p * 1.6, p * 1.6); }
          if (b.q) { const j = b.q.find(j => !j.done), dn = b.q.find(j => j.done);
            if (dn) bubble(sx, sy - (img.height - 2) * p, p, ART.iconCanvas(Object.keys(D.recipes[dn.r].out)[0], D.items));
            if (j) bar(sx, sy + 3 * p, p, j.t / j.dur, '#f0a030');
            if (['stove', 'kiln', 'oven', 'smokehouse', 'smelter', 'forge', 'glassworks'].includes(b.type) && active && Math.random() < .08) UI.parts.push({ x: sx + 5 * p, y: sy - (img.height - 8) * p, t: 0, vx: (Math.random() - .5) * p * 4 }); }
        }
      } else if (T.r) {
        if (T.t === 'forest') { const img = ART.get(T.r.st); blit(img, sx, sy, p, 16, img.height - 4, a);
          if (T.r.st === 'sapling' && T.o) bar(sx, sy + 4 * p, p, T.r.g / D.gather.forest.regrow, '#7cc04b'); }
        else if (T.t === 'boulder') { const img = ART.get('rocks:' + T.r.stock); blit(img, sx, sy, p, 16, img.height - 4, a); }
        else if (T.t === 'water' && T.v === 1) blit(ART.get('pondreeds'), sx, sy, p, 16, 16, a);
        else if (D.gather[T.t] && D.gather[T.t].sprite) { const img = ART.get(D.gather[T.t].sprite + ':' + T.r.stock); blit(img, sx, sy, p, 16, img.height - 4, a); }
      }
    }
    while (ai < actors.length) drawAv(actors[ai++]);
    if (UI.cart && S.green) { // a little cart carries your gift from the Depot to the monument
      const k = Math.min(1, UI.cart.t / 2.4), a = toScreen(tx(S.green.d), ty(S.green.d)), b2 = toScreen(tx(S.green.c), ty(S.green.c)), x = a[0] + (b2[0] - a[0]) * k, y = a[1] + (b2[1] - a[1]) * k - 2 * p;
      cx.globalAlpha = Math.min(1, (1 - k) * 4); cx.fillStyle = '#7a4b28'; cx.fillRect(x - 5 * p, y - 4 * p, 10 * p, 3 * p); cx.fillStyle = '#c99b5a'; cx.fillRect(x - 4 * p, y - 8 * p, 8 * p, 4 * p);
      cx.fillStyle = '#a8743e'; cx.fillRect(x - 4 * p, y - 8 * p, 8 * p, p); cx.fillStyle = '#3d2617'; cx.fillRect(x - 4 * p, y - p, 2 * p, 2 * p); cx.fillRect(x + 2 * p, y - p, 2 * p, 2 * p); cx.globalAlpha = 1; }
    if (labels.length) drawLabels(p, labels);
    // particles
    UI.parts.forEach(q => { cx.fillStyle = `rgba(230,230,235,${.6 * (1 - q.t)})`; cx.fillRect(q.x + q.vx * q.t * 4, q.y - q.t * 18 * p, 2 * p * (1 + q.t), 2 * p * (1 + q.t)); });
    drawWeather();
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
    if (kind === 'warn') SND.play('warn');
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = html;
    const box = $('#toasts'); box.prepend(el); while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'warn' ? 3200 : 5200);
  }
  const ico = (id, cls = '') => `<img class="ico ${cls}" src="${ART.icon(id, D.items)}" alt="" data-info="${id}">`;
  /* Info cards: right-click (or long-press) anything that names an item (an icon, a recipe, a market row, a kit)
     to see what it is, where it comes from, what it's used for and what it's worth. All generated from data.js. */
  const inTxtPlain = o => Object.entries(o).map(([k, n]) => `${n} ${D.items[k].name}`).join(' + ') || 'nothing';
  const nmList = a => a.length <= 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const inTxt = o => Object.entries(o).map(([k, n]) => `${n} ${esc(D.items[k].name)}`).join(' + ');
  // How quality works, in one place (Storage, stations, the farm plot and info cards all point here)
  const QUALITY_HELP = `<div class="qhelp"><b>Quality: ${QN[0]} → ${QN[1]} → ${QN[2]}</b>
    <p><b>Crops</b> earn +1 tier for being <b>watered at both stages</b> (once after planting, again when the soil dries halfway through) and +1 tier for <b>fertilizer</b> (tick “Use fertilizer” when planting, or Add fertilizer while it grows). Both together give ${QN[2]}. Sprinklers count as watering.</p>
    <p><b>Goods from stations</b> come out as good as their <b>lowest-quality ingredient</b> (stations use your best stock first). A station’s <b>Quality</b> upgrade (Station Tuning in Discovery) adds +1 tier, never more than one above the ingredients, so ${QN[2]} goods need ${QN[1]} ingredients. Things made from nothing, like honey, can reach ${QN[1]} this way. Master Crafting’s second Quality level adds a bonus item to every third batch.</p>
    <p><b>Gathered</b> logs, stone, fish and the like are always ${QN[0]}.</p>
    <p>${QN[1]} sells for ${C.qualityMult[1]}×, ${QN[2]} for ${C.qualityMult[2]}×, and some orders and contracts ask for them.</p></div>`;
  function infoHTML(id) { const it = D.items[id]; if (!it) return '';
    const P = [], B = it.building && D.buildings[it.building], disc = it.requires && D.discoveries.find(d => d.id === it.requires);
    const cats = { seed: 'Seed', supply: 'Farm supply', crop: 'Crop', gathered: 'Gathered resource', good: 'Finished good', component: 'Component', kit: 'Building kit' };
    if (B) { P.push(esc(B.desc));
      if (B.kind === 'sprinkler') P.push(`That’s the ${(B.radius * 2 + 1) ** 2 - 1} tiles around it, so no more watering by hand there. Plots it waters still earn Good quality.`);
      if (B.kind === 'station') { const rs = Object.values(D.recipes).filter(r => r.station === it.building).map(r => D.items[Object.keys(r.out)[0]].name); if (rs.length) P.push(`Makes ${esc(nmList(rs))}.`); }
      if (B.kind === 'storage') P.push(`Adds ${B.storage} storage space.`);
      P.push(`Place the kit on empty grass you own${B.place && Object.keys(B.place).length ? ` (placing also takes ${costTxt(B.place)})` : ''}.`); }
    const crop = Object.values(D.crops).find(c => c.item === id), seedOf = Object.values(D.crops).find(c => c.seed === id);
    if (seedOf) P.push(`Plant on a tilled Farm Plot to grow ${esc(seedOf.name)}: ${seedOf.yield} per harvest after about ${seedOf.grow}s of growing (faster when watered).`);
    if (crop) P.push(`Grown on a Farm Plot from ${esc(D.items[crop.seed].name)}.`);
    const g = Object.entries(D.gather).filter(([t, G]) => G.out[id]).map(([t]) => D.terrain[t].name); if (g.length) P.push(`Gathered from ${esc(nmList(g))} tiles.`);
    Object.values(D.recipes).filter(r => r.out[id]).forEach(r => P.push(`Made at the ${esc(D.buildings[r.station].name)} from ${inTxt(r.in) || 'nothing at all'} (${r.time}s${r.out[id] > 1 ? `, makes ${r.out[id]}` : ''}).`));
    const uses = Object.values(D.recipes).filter(r => r.in[id]).map(r => D.items[Object.keys(r.out)[0]].name); if (uses.length) P.push(`Used to make ${esc(nmList([...new Set(uses)]))}.`);
    if (id === 'fertilizer') P.push('Fertilize a growing crop for +1 quality and faster growth.');
    const ru = repeatUsers(id); if (ru.length) P.push(`<b>Used automatically</b> by ${esc(ru.join(', '))} (Repeat is on), so it may not stay in storage.`);
    { const ck = Object.keys(D.crops).find(k => D.crops[k] === (crop || seedOf)), g = Math.round((SR.grow - 1) * 100), sp = Math.round((SR.sell - 1) * 100);
      const ss = D.seasons.filter(z => (ck && z.crops.includes(ck)) || z.goods.includes(id)).map(z => z.name);
      if (ss.length) P.push(`<b>In season:</b> ${esc(nmList(ss))}${ck ? `: the crop grows ${g}% faster and sells for ${sp}% more` : `: sells for ${sp}% more`}.`);
      if (ck && D.crops[ck].hardy) P.push('Hardy: frost doesn’t slow it, winter doesn’t either, and it can be planted on snow days.');
      else if (ck && hardy(ck)) P.push('Under Cold Frames: frost and winter don’t slow it, and it can be planted on snow days.'); }
    const mastBlk = isMast(id) ? (S.race ? '<p class="hint small">Mastery is off during races and challenges.</p>' : mastRow(id, false)) : '';
    if (crop) P.push(`<b>Quality:</b> water it at both growth stages for ${QN[1]}; add fertilizer too for ${QN[2]}.`);
    else if (Object.values(D.recipes).some(r => r.out[id]) && it.cat !== 'kit') P.push(`<b>Quality:</b> as good as its lowest-quality ingredient; a station Quality upgrade adds one tier on top.`);
    const price = [it.value ? `sells for ${sellPrice(id, 0)}g` : '', it.buy ? `the market sells it for ${buyPrice(id)}g` : ''].filter(Boolean).join(' · ');
    return `<div class="ihead">${ico(id)}<div><b>${esc(it.name)}</b><small>${cats[it.cat] || ''}${price ? ' · ' + price : ''}</small></div></div>
      ${P.map(t => `<p>${t}</p>`).join('')}${mastBlk}${disc && !unlocked(disc.id) ? `<p class="need">Needs <b>${esc(disc.name)}</b> in Discovery.</p>` : ''}`; }
  function infoTarget(t) { for (let n = t, k = 0; n && k < 5 && n !== document.body; n = n.parentElement, k++) {
      if (n.dataset && n.dataset.info && D.items[n.dataset.info]) return n.dataset.info;
      if (n.dataset && 'task' in n.dataset) { const a = n.dataset.a, p = n.dataset.p;
        if (a === 'load' && D.recipes[p]) return Object.keys(D.recipes[p].out)[0];
        if (['buy', 'sell', 'place'].includes(a) && D.items[p]) return p;
        if (a === 'plant' && D.crops[p]) return D.crops[p].item; }
      if (n.querySelector && n !== t && /^(BUTTON|LI|DIV|LABEL|TR)$/.test(n.tagName)) { const im = n.querySelectorAll('img[data-info]'); if (im.length === 1) return im[0].dataset.info; }
      if (n.id === 'panel' || n.id === 'drawer' || (n.classList && n.classList.contains('dbox'))) break; }
    return null; }
  function showInfo(id, x, y) { const el = $('#info'); el.innerHTML = infoHTML(id); el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight; el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 12)) + 'px'; el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 12)) + 'px'; }
  const hideInfo = () => { const el = $('#info'); if (el && !el.hidden) el.hidden = true; };
  document.addEventListener('contextmenu', e => { if (!e.target.closest('#panel, #drawer, #queue, #goals')) return; const id = infoTarget(e.target); if (!id) return; e.preventDefault(); showInfo(id, e.clientX, e.clientY); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#info')) hideInfo(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideInfo(); });
  document.addEventListener('wheel', hideInfo, { passive: true });
  const qtag = q => q ? `<span class="q q${q}">${QN[q]}</span>` : '';
  function setHTML(sel, html) {
    if (UI.html[sel] === html) return; const el = $(sel), a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'number' || a.type === 'range')) && el.contains(a)) return; // don't yank a field mid-typing
    UI.html[sel] = html; el.innerHTML = isTouch() ? html.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : html;
  }
  function btn(t, label, opts = {}) {
    const e = opts.err !== undefined ? opts.err : checkTask(t);
    const data = Object.entries(t).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<button class="btn ${opts.cls || ''}" data-task ${data} ${e ? 'disabled' : ''}>${label}${e ? `<small>${esc(e)}</small>` : opts.sub ? `<small>${opts.sub}</small>` : ''}</button>`;
  }
  const pbar = (key, cls = '') => `<div class="pb ${cls}"><i data-prog="${key}"></i></div>`;

  function renderTop() {
    const canUnlock = D.discoveries.some(d => !unlocked(d.id) && discOk(d) && S.dp >= d.cost);
    const status = paused() ? 'Paused' : S.cur ? `${S.cur.ph === 'walk' ? 'Walking to' : 'Working:'} ${esc(TASKS[S.cur.a].label(S.cur))}` : 'Idle';
    setHTML('#stats', `
      <div class="stat" title="Gold"><span class="coin"></span><b>${S.gold}</b></div>
      ${S.loan ? `<button class="stat loan" data-repay title="Loan from the valley bank. Paid back automatically at ${LOAN.auto}g, or tap to repay now"><span class="lbl">Loan</span><b>${S.loan.owed}g</b></button>` : ''}
      <div class="stat score" title="Score"><span class="lbl">Score</span><b>${S.score}</b></div>
      <button class="stat disc ${canUnlock ? 'ping' : ''}" data-drawer="disc" title="Spend Discovery"><span class="lbl"><span class="lg">Discovery</span><span class="sm">DP</span></span><b>${S.dp}</b></button>
      <button class="stat store" data-drawer="inv" title="Storage"><span class="lbl"><span class="lg">Storage</span><span class="sm">Store</span></span><b>${used()}/${cap()}</b></button>
      ${noSeasons() ? `<div class="stat time"><span class="lbl"><span class="lg">Day ${S.day}</span><span class="sm">D${S.day}</span></span><b>${clock()}</b></div>`
        : `<button class="stat time season ${season().id}" data-drawer="season" title="${esc(`${season().name}, day ${seasonDay()} of ${SR.len}. ${wxName(wxNow())}: ${wxLine(S.day)} Tomorrow: ${wxName(weatherOn(S.day + 1))}.`)}" aria-label="Day ${S.day}, ${season().name}, ${wxName(wxNow())}. Open seasons and weather"><span class="lbl"><span class="lg">Day ${S.day} · ${season().name}</span><span class="sm">D${S.day}</span></span><b>${clock()}</b><span class="wxtag wx-${wxNow()}">${wxName(wxNow())}</span></button>`}
      ${S.goalMin ? (() => { const g = D.goals[S.goal], m = curMs(), t = g ? g.title : m ? m.name : 'All done';
        return `<button class="stat goalbtn" data-goal-restore title="${g ? 'Goal' : 'Contract'}: ${esc(t)}" aria-label="Show ${g ? 'goal' : 'contract'}: ${esc(t)}"><span class="lbl">${g ? 'Goal' : 'Contract'}</span><b>${esc(t)}</b></button>`; })() : ''}
      <div class="status">${status}</div>`);
  }
  // The goal / contract card: full, title only, or minimized into a button in the top bar.
  function renderGoals() {
    const g = D.goals[S.goal], m = curMs();
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
    const fh = F ? `<div class="chip helper ${F.on ? '' : 'off'}"><span>Farmhand: ${F.errand ? `errand for ${esc(D.items[Object.keys(D.recipes[F.errand.r].out)[0]].name)} (${{ go: 'walking to the market', shop: 'shopping', back: 'heading back', load: 'loading' }[F.errand.ph]})` : !F.on ? 'paused' : !F.steps.length ? 'no jobs yet' : F.cur ? esc(TASKS[F.cur.a].label(F.cur)) : 'waiting for work'}</span>
      <button class="fhb" data-fh-toggle aria-label="${F.on ? 'Pause farmhand' : 'Start farmhand'}" title="${F.on ? 'Pause' : 'Start'}">${F.on ? '❚❚' : '▶'}</button>
      <button class="fhb spd" data-fh-speed aria-label="Farmhand speed ${F.spd || 1}×, tap to change" title="Speed">${F.spd || 1}×</button><button class="fhb" data-drawer="hands" aria-label="Manage farmhand jobs" title="Manage jobs">Jobs</button>${F.steps.length ? `<button class="fhb clr ${UI.fhClear ? 'arm' : ''}" data-fh-clear aria-label="${UI.fhClear ? 'Tap again to clear all farmhand jobs' : 'Clear all farmhand jobs'}" title="Clear all jobs">${UI.fhClear ? 'Clear all?' : 'Clear'}</button>` : ''}</div>` : '';
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
    if (minQ && (!ins.length || ins.some(k => !canQ(k)))) node.qnote = minQ >= 2 ? `${QN[2]} needs ${QN[1]} ingredients plus a Quality upgrade on the ${D.buildings[R.station].name}; gathered ingredients only reach ${QN[1]}.` : `For ${QN[minQ]} quality, give the ${D.buildings[R.station].name} a Quality upgrade${ins.some(canQ) ? `, or use ${QN[minQ]} ingredients where you can` : ''}.`;
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
  // The chosen tab is remembered (also across visits). If it's empty right now, 'All' shows instead,
  // but the choice is kept, so the tab comes back once it has something in it again.
  function chips(kind, counts, extra = []) {
    const opts = [['all', 'All', null], ...extra, ...counts], cur = opts.some(o => o[0] === UI.cat[kind]) ? UI.cat[kind] : 'all';
    UI.catShow[kind] = cur;
    return `<div class="chips" role="group" aria-label="Filter by category">${opts.map(([id, name, n]) => `<button class="chipf ${cur === id ? 'on' : ''}" data-cat="${kind}:${id}" aria-pressed="${cur === id}">${esc(name)}${n != null ? `<span>${n}</span>` : ''}</button>`).join('')}</div>`;
  }
  // ways to sort Storage: 'cat' is the usual category headings; the rest are one flat list (the category chips still filter it)
  const INV_SORTS = [['cat', 'Category', 'Grouped under category headings'], ['name', 'A–Z', 'By name'], ['most', 'Most', 'Biggest stacks first'], ['least', 'Fewest', 'Smallest stacks first'],
    ['worth', 'Worth', 'Highest total value first, to see what is worth selling'], ['best', 'Best quality', 'Most Excellent and Good goods first'], ['newest', 'Newest', 'Most recently added to storage first']];
  const catSel = kind => UI.catShow[kind] || UI.cat[kind] || 'all';
  // render ids grouped under category headings, honouring the active chip
  function grouped(ids, kind, row, wrap) {
    const by = {}; ids.forEach(id => (by[groupOf(id)] = by[groupOf(id)] || []).push(id));
    const sel = kind ? catSel(kind) : 'all';
    return D.itemGroups.filter(g => by[g.id] && (sel === 'all' || sel === g.id))
      .map(g => `<div class="grp"><span class="eyebrow">${esc(g.name)}</span>${wrap ? `<div class="${wrap}">` : ''}${by[g.id].map(row).join('')}${wrap ? '</div>' : ''}</div>`).join('');
  }
  const groupCounts = (ids, weigh = () => 1) => { const c = {}; ids.forEach(id => { const g = groupOf(id); c[g] = (c[g] || 0) + weigh(id); }); return D.itemGroups.filter(g => c[g.id]).map(g => [g.id, g.name, c[g.id]]); };
  function head(title, sub) { return `<div class="phead"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="close" data-close aria-label="Close">×</button></div>`; }

  function fhControl(i, kind) {
    const F = S.helper; if (!F) return '';
    const has = F.steps.some(st => st.i === i);
    let h = `<span class="eyebrow">Farmhand</span>`;
    if (has) return h + `<p class="hint">Your farmhand works here. <button class="linkish" data-drawer="hands">Manage farmhand jobs</button></p>`;
    if (F.steps.length >= fhMax()) return h + `<p class="hint">The routine is full (${fhMax()} jobs). <button class="linkish" data-drawer="hands">Remove one in Farmhands</button></p>`;
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
    if (b.st === 'raw') h += `<p class="state">Untilled soil.</p>` + btn({ a: 'till', i }, 'Till soil', { cls: 'pri' }) + `<div class="more">` + btn({ a: 'clearplot', i }, 'Clear plot', { cls: 'ghost', sub: 'Turns it back into grass you can build on. No refund.' }) + `</div>`;
    else if (b.st === 'tilled') {
      h += `<p class="state">Tilled and ready for seeds.</p><p class="hint small">For ${QN[1]} crops, water at both growth stages. Add fertilizer too for ${QN[2]}. <button class="linkish small" data-qhelp-panel>${UI.qhelpP ? 'Less' : 'More about quality'}</button></p>${UI.qhelpP ? QUALITY_HELP : ''}`;
      if (unlocked('compost')) h += `<label class="check"><input type="checkbox" id="fert" ${UI.fert ? 'checked' : ''}> Use fertilizer (${count('fertilizer')} in storage) · grows faster, +1 quality</label>`;
      const seeds = Object.keys(D.crops).filter(k => count(D.crops[k].seed) > 0);
      h += seeds.length ? `<div class="grid2">${seeds.map(k => btn({ a: 'plant', i, p: k, f: UI.fert ? 1 : 0 }, `${ico(D.crops[k].seed)} Plant ${D.crops[k].name}`, { sub: `${count(D.crops[k].seed)} seeds · ${D.crops[k].grow}s${cropInSeason(k) ? ' · in season' : ''}` })).join('')}</div>${wxNow() === 'snow' && seeds.some(snowBlocks) ? `<p class="hint small">Snow day: only hardy crops (carrots, potatoes, wheat, apple trees) can be planted today.</p>` : ''}`
        : `<p class="hint">No seeds. Buy some at the Open Market.</p>`;
    } else {
      const cr = D.crops[b.crop];
      h += `<div class="row">${ico(cr.item)}<div class="grow1"><b>${esc(cr.name)}</b> ${b.st === 'ready' ? '· ready' : `· ${b.wet ? 'soil is wet' : '<span class="warn">needs water</span>'}`}${b.st === 'growing' ? pbar('f:' + i) : ''}</div></div>`;
      const q = Math.min(2, (b.w[0] && b.w[1] ? 1 : 0) + (b.fert ? 1 : 0)), gn = b.st === 'growing' && growNote(b.crop);
      if (gn) h += `<p class="hint small">${esc(gn.charAt(0).toUpperCase() + gn.slice(1))}.</p>`;
      h += `<p class="hint">Quality: <button class="linkish small" data-qhelp-panel>?</button> watered early ${b.w[0] ? '✓' : '—'} · watered late ${b.w[1] ? '✓' : '—'}${b.fert ? ' · fertilized ✓' : ''} → <b>${b.st === 'ready' ? QN[q] : 'aiming ' + QN[Math.min(2, (b.w[0] && (b.w[1] || !b.half) ? 1 : 0) + (b.fert ? 1 : 0))]}</b></p>`;
      if (b.st === 'growing') h += btn({ a: 'water', i }, 'Water', { cls: 'pri', sub: b.half ? 'Second watering: Good quality' : 'Wet soil grows 2× faster' });
      if (b.st === 'growing' && !b.fert && (unlocked('compost') || count('fertilizer') > 0)) h += btn({ a: 'fertilize', i }, 'Add fertilizer', { sub: `Grows ${Math.round((C.fertGrowth - 1) * 100)}% faster · +1 quality · ${count('fertilizer')} in storage` });
      else h += btn({ a: 'harvest', i }, `Harvest ${cr.yield} ${esc(D.items[cr.item].name)}`, { cls: 'pri' });
    }
    return h + fhControl(i, 'tend') + `<p class="tip">Tip: click a selected tile again to repeat its main action.${isPhone() ? '' : ' Right-click anything to see what it does. Drag the title bar to move this menu or an edge to resize it; double-click the title bar to put it back.'}</p>`;
  }
  // Click a recipe to see each ingredient's price and stock, and send the farmhand shopping for what's missing.
  function errandBox(i, rid) { const b = T_(i).b, free = Math.max(1, stationSlots(b) - b.q.length), n = Math.min(Math.max(1, UI.rexpN || 1), free), P = errandPlan(i, rid, n);
    const rows = P.rows.map(r => `<div class="erow ${r.miss ? 'miss' : 'ok'}">${ico(r.k)}<span class="grow1">${esc(D.items[r.k].name)}<small>have ${r.have} · need ${r.need}</small></span>
      <span class="eprice">${r.price != null ? `${r.price}g each` : '<span class="muted">not sold</span>'}${r.miss ? `<small>buy ${r.miss}${r.price != null ? ` = ${r.price * r.miss}g` : ''}</small>` : '<small>✓ in storage</small>'}</span></div>`).join('');
    const e = errandErr(i, rid, n, P);
    return `<div class="errand">${rows || '<p class="hint small">No ingredients needed.</p>'}
      ${free > 1 ? `<div class="chips">${[1, free].filter((v, k, a) => a.indexOf(v) === k).map(v => `<button class="chipf ${n === v ? 'on' : ''}" data-rexp-n="${v}">${v === 1 ? '1 batch' : `Fill ${v} batches`}</button>`).join('')}</div>` : ''}
      ${P.missing.length ? `<p class="hint small">Missing ingredients cost <b>${P.cost}g</b>${P.unbuyable.length ? ' (some aren’t sold at the market)' : ''}.</p>` : ''}
      <button class="btn ${e ? '' : 'pri'}" data-errand="${i}:${rid}:${n}" ${e ? 'disabled' : ''}>Send farmhand shopping${P.missing.length && !P.unbuyable.length ? ` · ${P.cost}g` : ''}<small>${e ? esc(e) : `They buy what’s missing at the Open Market, bring it back and load ${n > 1 ? n + ' batches' : 'it'} here.`}</small></button></div>`; }
  const REP_OPTS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 50]; // 0 = forever
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
    h += `</div><span class="eyebrow">Recipes</span><p class="hint small">Click a recipe to see what each ingredient costs at the market${unlocked('errands') ? ' and send your farmhand shopping for what’s missing' : ''}.</p>`;
    if (unlocked('repeat')) h += `<p class="hint">Repeat keeps one recipe loaded whenever a slot is free and the ingredients are in storage.</p>`;
    const recs = Object.entries(D.recipes).filter(([, R]) => R.station === b.type);
    h += recs.map(([id, R]) => {
      if (!unlocked(R.requires)) { const d = D.discoveries.find(d => d.id === R.requires); return `<div class="recipe locked" data-info="${Object.keys(R.out)[0]}"><span>${ico(Object.keys(R.out)[0], 'dim')} ${esc(D.items[Object.keys(R.out)[0]].name)}</span><small>Unlock “${esc(d.name)}” in Discovery</small></div>`; }
      const ins = Object.entries(R.in).map(([k, n]) => `<span class="in ${count(k) >= n ? '' : 'short'}">${ico(k)}${n}<small>(${count(k)})</small></span>`).join('<span class="plus">+</span>');
      const outs = Object.entries(R.out).map(([k, n]) => `${ico(k)}${n > 1 ? n : ''}`).join('');
      const le = checkTask({ a: 'load', i, p: id });
      const ex = UI.rexp === i + ':' + id;
      return `<div class="recipe ${ex ? 'open' : ''}" data-info="${Object.keys(R.out)[0]}" data-rid="${id}" data-st="${i}"><div class="grow1"><b class="rname">${esc(R.label || D.items[Object.keys(R.out)[0]].name)} <span class="rexp">${ex ? '▾' : '▸'}</span></b><div class="formula">${ins}<span class="arrow">→</span>${outs}<span class="muted">${Math.round(R.time * D.upgrades.speed.effect[b.lv.speed])}s</span></div>${le ? `<small class="why">${esc(le)}</small>` : ''}${unlocked('repeat') ? `<div class="reprow"><button class="toggle sm ${b.rep === id ? 'on' : ''}" data-rep="${i}:${id}" aria-pressed="${b.rep === id}"><i></i>Repeat</button>${b.rep === id ? `<select class="repn" data-repn="${i}" aria-label="How many times to repeat">${REP_OPTS.map(n => `<option value="${n}" ${(b.repN || 0) === n ? 'selected' : ''}>${n ? n + ' times' : 'Forever'}</option>`).join('')}</select><small class="muted">${b.repN ? `${Math.min(b.repDone || 0, b.repN)} of ${b.repN} done` : `${b.repDone || 0} so far`}</small>` : ''}</div>` : ''}</div><div class="ldb">${btn({ a: 'load', i, p: id }, 'Load', { err: le })}${(() => { const n = fillCount(i, id); return n > 1 ? btn({ a: 'load', i, p: id, n }, `Fill ×${n}`, { cls: 'ghost' }) : ''; })()}</div></div>${ex ? errandBox(i, id) : ''}`;
    }).join('');
    h += `<span class="eyebrow">Upgrades</span>`;
    if (!unlocked('tuning')) h += `<p class="hint">Unlock “Station Tuning” in Discovery to improve speed, capacity and quality.</p>`;
    else h += Object.entries(D.upgrades).map(([ax, U]) => { const l = b.lv[ax], max = l >= U.cost.length;
      const e = max ? null : checkTask({ a: 'upgrade', i, p: ax });
      return `<div class="recipe"><div class="grow1"><b class="rname">${U.name} <span class="muted">· now ${U.label(l)}</span></b>${max ? '<small class="why">Fully upgraded</small>' : `<small class="cost">Next: ${U.label(l + 1)} · Cost: ${costTxt(U.cost[l])}</small>${e ? `<small class="why short">${esc(e)}</small>` : ''}`}</div>${max ? '<span class="muted">Max</span>' : btn({ a: 'upgrade', i, p: ax }, 'Upgrade', { err: e })}</div>`; }).join('');
    h += `<p class="hint small">Quality: goods come out as good as their lowest-quality ingredient${b.lv && b.lv.quality ? `, +1 tier from this station’s upgrade${b.lv.quality >= 2 ? ', and every third batch makes one extra' : ''}` : ''}. <button class="linkish small" data-qhelp-panel>${UI.qhelpP ? 'Less' : 'More about quality'}</button></p>${UI.qhelpP ? QUALITY_HELP : ''}`;
    return h + fhControl(i, 'station') + moveSection(i);
  }
  function homePanel(i) {
    let h = head(`${S.name}’s Homestead`, esc(D.buildings.homestead.desc));
    const ns = notices(); if (ns.length) h += `<div class="notices"><span class="eyebrow">Notices</span>${ns.map(n => `<div class="notice"><span>${n.html}</span>${n.act}</div>`).join('')}</div>`;
    if (online() && !S.race) { const m = MONK(), t = m && monTotals(m);
      h += `<span class="eyebrow">Valley Monument</span>` + (m ? `<div class="monmini"><img class="monfloat sm" src="${ART.monPic(m.kind, t.stage)}" alt=""><div class="grow1"><b>${esc(m.name)}</b><div class="pb"><i style="width:${monPct(t)}%"></i></div><small>${t.finished ? 'Finished!' : `Stage ${t.stage} of ${m.phases.length} · ${monPct(t)}% · phase ${t.phase + 1} wants ${esc((m.phases[t.phase].short || m.phases[t.phase].name).toLowerCase())}`} · you’ve given ${(m.mine || 0).toLocaleString()}</small></div></div>`
        : `<p class="hint small">${NET.mon && NET.mon.none ? 'No monument is being built right now.' : 'Every online farm builds a shared monument together. Connecting…'}</p>`) + `<button class="btn" data-drawer="valley">Open the Valley Monument<small>What it needs, giving goods, how it works</small></button>`; }
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
      h += `<p class="state">${F.on ? 'Working' : 'Paused'} · ${F.steps.length}/${fhMax()} jobs</p><button class="btn" data-drawer="hands">Manage farmhands<small>Reorder, remove or clear jobs; pause; speed</small></button>`;
      h += `<small class="why">They walk a little slower than you, skip jobs that have nothing to do, and never take a job you’ve queued yourself.</small>`;
    }
    return h;
  }
  function marketPanel(i) {
    const d = S.market.demand;
    let h = head('Open Market', 'Every trade sends your farmer to the stall.');
    if (!online()) h += `<p class="netline">${S.race ? (S.race.weekly ? `Challenge prices: the same for every farmer this week${wrule('sell', 1) > 1 ? `, plus ${Math.round((wrule('sell', 1) - 1) * 100)}% on everything you sell` : ''}.` : 'Race prices: plain local prices, the same for every racer.') : 'Private farm: plain local prices, untouched by anyone else.'}</p>`;
    else h += `<p class="netline ${NET.ok ? 'on' : ''}">${NET.ok ? `<b>Shared valley prices</b> · ${NET.active} trader${NET.active === 1 ? '' : 's'} this hour · prices settle back over ~${NET.recov >= 1.5 ? Math.round(NET.recov) + 'h' : Math.max(1, Math.round(NET.recov * 60)) + ' min'} · updated ${Math.max(0, Math.round((Date.now() - NET.at) / 1000))}s ago` : NET.tried ? 'Shared prices unavailable here, so this market uses local prices.' : 'Connecting to the valley market…'}</p>`;
    if (S.race && S.race.deal) { const dl = S.race.deal; h += `<div class="demand">${ico(dl.kit)}<span><b>Race-day bargain:</b> ${esc(D.buildings[D.items[dl.kit].building].name)} kit for just <b>${dl.price}g</b> (normally ${D.items[dl.kit].buy}g). Stations tab.</span></div>`; }
    if (d) h += `<div class="demand">${ico(d.item)}<span>Today: <b>${esc(D.items[d.item].name)}</b> sells for <b>+${d.pct}%</b></span></div>`;
    h += `<div class="tabs">${['buy', 'sell', 'stations'].map(t => `<button class="tab ${UI.mtab === t ? 'on' : ''}" data-mtab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`;
    if (UI.mtab === 'buy') {
      const free = room();
      if (free <= 0) h += `<div class="fullbar"><b>Storage is full (${used()}/${cap()}).</b> Anything you buy needs room. Sell something, or expand storage at the Homestead or with a Storage Barn.</div>`;
      else if (free <= 5) h += `<div class="fullbar soft">Storage is nearly full: room for <b>${free}</b> more item${free === 1 ? '' : 's'}.</div>`;
      const list = Object.keys(D.items).filter(canBuyItem);
      h += chips('buy', groupCounts(list));
      h += grouped(list, 'buy', id => `<div class="trade">${ico(id)}<div class="grow1"><b>${esc(D.items[id].name)}</b><small>${buyPrice(id)}g each ${moveTag(id)}${seasonTag(id)} · have ${count(id)}</small>${useHint(id) ? `<small class="use">${esc(useHint(id))}</small>` : ''}</div>${btn({ a: 'buy', i, p: id, n: 1 }, '×1', { cls: 'sm' })}${btn({ a: 'buy', i, p: id, n: 5 }, '×5', { cls: 'sm' })}</div>`);
      h += `<p class="hint">Any good you've made at least once is sold here too, at about ${RESALE}× its normal value, always Normal quality. Every purchase nudges the price up for everyone; every sale nudges it down.</p>`;
      const locked = Object.keys(D.items).filter(id => D.items[id].buy && D.items[id].cat !== 'kit' && !unlocked(D.items[id].requires));
      if (locked.length) h += `<p class="hint">More through Discovery: ${locked.map(id => esc(D.items[id].name)).join(', ')}.</p>`;
    } else if (UI.mtab === 'sell') {
      const ids = Object.keys(S.inv).filter(id => MARKET_BUYS.includes(D.items[id].cat) && count(id) > 0);
      if (ids.length) h += chips('sell', groupCounts(ids));
      const sellRow = id => [0, 1, 2].filter(q => S.inv[id][q] > 0).map(q => { const n = S.inv[id][q], key = `${id}:${q}`, pr = sellPrice(id, q), v = Math.max(1, Math.min(n, UI.sq[key] || 1));
        return `<div class="trade sell">${ico(id)}<div class="grow1"><b>${esc(D.items[id].name)}</b> ${qtag(q)}<small>${pr}g each ${moveTag(id)}${seasonTag(id)} · have ${n}</small></div>
          <div class="sellctl">${btn({ a: 'sell', i, p: id, q, n: 1 }, 'Sell 1', { cls: 'sm' })}${n > 1 ? btn({ a: 'sell', i, p: id, q, n }, `All · ${pr * n}g`, { cls: 'sm' }) : ''}
          <span class="qtybox"><input type="number" class="qty" id="sq-${id}-${q}" data-sq="${key}" data-max="${n}" data-price="${pr}" min="1" max="${n}" step="1" value="${v}" inputmode="numeric" aria-label="How many ${esc(D.items[id].name)} to sell"><button class="btn sm pri" data-sellqty="${key}" data-i="${i}">Sell · <span data-sqtotal="${key}">${pr * v}</span>g</button></span></div></div>`; }).join('');
      h += ids.length ? grouped(ids, 'sell', sellRow) : `<p class="hint">Nothing to sell yet. Harvest or make something first.</p>`;
    } else {
      const list = Object.keys(D.items).filter(id => { const it = D.items[id]; return it.cat === 'kit' && it.buy && unlocked(it.requires); });
      h += `<p class="hint">You can build <b>one of each station per area</b> you own (two Storage Barns per area). You have ${areas()} area${areas() === 1 ? '' : 's'}${unlocked('surveying') ? '; survey new land for more' : ''}. Place a kit on empty grass you own.</p>`;
      // stations you've already built your allowance of go in their own list, so the main one only shows what you can buy
      const atCap = id => { const bt = D.items[id].building; return builtCount(bt) + count(id) >= capFor(bt); };
      const open = list.filter(id => !atCap(id)), full = list.filter(atCap), view = UI.kitView === 'full' && full.length ? 'full' : 'open';
      if (list.length) h += `<div class="chips"><button class="chipf ${view === 'open' ? 'on' : ''}" data-kitview="open">Can build<span>${open.length}</span></button><button class="chipf ${view === 'full' ? 'on' : ''}" data-kitview="full" ${full.length ? '' : 'disabled'}>At your limit<span>${full.length}</span></button></div>`;
      const kitRow = id => { const it = D.items[id], B = D.buildings[it.building], n = builtCount(it.building), c = capFor(it.building);
        return `<div class="trade">${ico(id)}<div class="grow1"><b>${esc(B.name)}</b><small>Built ${n} of ${c}${count(id) ? ` · ${count(id)} kit waiting` : ''} · ${esc(B.desc)} Placing needs: ${costTxt(B.place)}.</small></div>${btn({ a: 'buy', i, p: id, n: 1 }, `${buyPrice(id)}g`, { cls: 'sm' })}</div>`; };
      const fullRow = id => { const it = D.items[id], B = D.buildings[it.building], n = builtCount(it.building), c = capFor(it.building);
        return `<div class="trade capped">${ico(id)}<div class="grow1"><b>${esc(B.name)}</b><small>${count(id) ? `Kit waiting to be placed · ` : ''}Built ${n} of ${c}. ${unlocked('surveying') ? 'Survey a new area to build another.' : 'Unlock Land Surveying, then survey a new area to build another.'}</small></div></div>`; };
      if (view === 'full') h += `<p class="hint">You’ve built as many of these as your ${areas()} area${areas() === 1 ? '' : 's'} allow${areas() === 1 ? 's' : ''}. Each new area you survey lets you build one more of each (two more Storage Barns).</p>` + grouped(full, null, fullRow);
      else if (open.length) h += grouped(open, null, kitRow);
      else if (list.length) h += `<p class="hint">You’ve built everything you can for now. See <b>At your limit</b>, and survey new land to build more.</p>`;
      if (!list.length) h += `<p class="hint">No station kits yet. Unlock Sawmill (after Woodcutting) in Discovery.</p>`;
    }
    return h;
  }
  function boardPanel(i) {
    let h = head('Order Board', 'Requests use goods you know, plus one contract pointing to what’s next.');
    const m = curMs();
    if (m) h += `<div class="order ms"><div class="otop"><span class="eyebrow">Contract</span><b>${esc(m.name)}</b></div>${needRow(m.need)}
      <p class="hint">${esc(m.hint)}</p>${isComplex(m.need) ? `<button class="btn ghost sm treebtn" data-tree="ms">See everything it takes</button>` : ''}<div class="oreward">+${m.gold}g · +${m.dp} Discovery</div>${btn({ a: 'deliver', i, p: 'ms' }, 'Deliver', { cls: 'pri' })}</div>`;
    h += S.orders.map(o => `<div class="order"><div class="otop"><span class="eyebrow">${o.kind === 'trap' ? 'Special request' : o.kind === 'crafted' ? 'Crafted delivery' : 'Delivery'}</span><b>${esc(o.name)}</b></div>${needRow(o.need)}
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
    }
    if (T.r && T.r.dep != null && !S.race) { const unit = Object.keys(G.out)[0], per = G.out[unit], left = T.r.dep * per, full = G.deposit * per;
      h += `<div class="row"><div class="grow1">${T.r.dep > 0 ? `Deposit: about <b>${left}</b> of ${full} ${esc(D.items[unit].name.toLowerCase())} left${builderDay() ? '. <b>Builder’s day:</b> digging today doesn’t use it up' : ''}` : `<b>Worked out.</b> Nothing left to dig here.`}<div class="pb thin"><i style="width:${Math.round(T.r.dep / G.deposit * 100)}%"></i></div></div></div>`;
      if (worked(T)) h += btn({ a: 'deepen', i }, `Reopen with Deep Quarrying`, { cls: 'pri', sub: unlocked('deepquarry') ? `${costTxt(DEEPEN_COST)} · a full deposit again` : 'Unlock Deep Quarrying in Discovery (after Prospecting)' })
        + `<p class="hint small">Or change the land below. The market also sells ${esc(D.items[unit].name.toLowerCase())}${D.items[unit].buy ? '' : ' once you’ve dug some'}; a new ${T.t === 'clay' ? 'Clay Banks area' : 'Iron Hills area'} brings fresh deposits.</p>`; }
    if (T.t === 'forest') {} else if (G.action === 'gather') {
      h += `<div class="row"><div class="grow1">${esc(G.what)} available: <b>${T.r.stock}/${G.stock}</b>${T.r.stock < G.stock ? pbar('r:' + i, 'thin') : ''}</div></div>`;
      h += btn({ a: 'gather', i }, G.verb, { cls: 'pri', sub: Object.entries(G.out).map(([k, n]) => `+${n} ${D.items[k].name}`).join(' · ') });
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
    return `<div class="more"><span class="eyebrow">Change this land</span>` + opts.map(k => { const L = D.landShape[k], to = k.split('>')[1];
      const back = Object.entries(L.back).filter(([id, n]) => n && !(T.t === 'forest' && id === 'log' && T.r && T.r.st !== 'tree'));
      return btn({ a: 'reshape', i, p: k }, `${esc(L.verb)} → ${esc(D.terrain[to].name)}`, { cls: 'ghost', sub: `${costTxt(L.cost)}${back.length ? ' · get back ' + costTxt(Object.fromEntries(back)) : ''}. ${esc(L.note)}` }); }).join('')+ '</div>';
  }
  function storagePanel(i) {
    const B = D.buildings[T_(i).b.type];
    return head(B.name, esc(B.desc)) + `<p class="state">Adds <b>${B.storage}</b> to your storage. Total now: ${used()} of ${cap()} used.</p><p class="hint">Everything lives in shared storage, so it doesn’t matter where on your land you build these.</p>` + moveSection(i);
  }
  function medalPanel(i) { const m = T_(i).b.m;
    return head(`${MEDAL[m.place][0]} medal`, `${MEDAL[m.place][1]} · ${weekLabel(m.week)}`) + `<div class="medalbig"><img src="${medalImg(m.place)}" alt=""><p class="state">${esc(NET.myName || S.name)} won ${m.place === 1 ? 'the Weekly Challenge' : `${m.place === 2 ? 'second' : 'third'} place in the Weekly Challenge`} in ${weekLabel(m.week)} (${esc(weekTheme(m.week).name)}) with <b>${m.score.toLocaleString()}</b> points.</p></div>
      <button class="btn ghost" data-medal-away="${i}">Put it away</button><p class="hint small">It goes back to your trophy case (Menu → Medals). Place it again any time, on any farm.</p>`; }
  /* ---------- Valley Monument panels (Depot, the monument's tiles, the Homestead drawer) ---------- */
  function monHelpHTML(m) { const k = monKind(m), cap = m ? m.cap : 800, km = m ? m.keep_min : 150;
    return `<div class="qhelp monhelp"><b>How Valley Monuments work</b>
      <p><b>Built together.</b> Every online farm in the valley builds the same monument. There’s no race and no ranking; the contributor roll is just a thank-you.</p>
      <p><b>Four stages.</b> It rises at 25%, 50%, 75% and 100%. Each stage is a phase that asks for different goods${m && m.phases ? ` (${esc(nmList(m.phases.map(p => (p.short || p.name).toLowerCase())))})` : ''}, so every kind of farm gets its turn. Only the current phase’s goods are taken.</p>
      <p><b>Points.</b> Every good counts for a set number of points; finer goods count for more. Quality doesn’t change the points, so your lowest-quality goods go first.</p>
      <p><b>Daily allowance.</b> You can give up to ${cap.toLocaleString()} points a day (it resets at 00:00 UTC), so no single farm can finish it alone and everyone gets a share of the work. Goods can’t be split, so if you have less than one item’s worth left, you can still give one last item and go a little over.</p>
      <p><b>Rewards.</b> Giving earns no gold. Give ${km.toLocaleString()} points in total to earn a small model of ${esc(k.name)} for your farm (it shows the monument’s current stage). You also get +1 Discovery for your first gift in each phase, and +2 when it’s finished.</p>
      <p><b>Target date.</b> Each monument has one. If the valley hasn’t finished by then, building simply carries on until it’s done.</p>
      <p><b>Where.</b> At the Monument Depot on your Valley Green, or from the Homestead (Valley Monument). Goods come out of your storage, and buying goods at the market to give is fine.</p></div>`; }
  const monPct = t => Math.floor(t.pts / t.total * 1000) / 10;
  function monWhen(m, t) { const now = Date.now() - (NET.monSkew || 0);
    if (t.finished) return m.finished_at ? `finished ${new Date(m.finished_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'finished';
    const end = Date.parse(m.ends_at); return end > now ? `target date in ${fmtLeftShort(end - now)}` : 'past its target date, so building carries on until it’s finished'; }
  function modelLine(m) { const id = m.id, km = m.keep_min || 0, K = monKind(m);
    if ((m.mine || 0) < km) return `<p class="hint small">Give <b>${(km - (m.mine || 0)).toLocaleString()} more points</b> to earn a model of ${esc(m.name)} for your farm.</p>`;
    if (S.race) return '';
    const at = modelAt(id); return at !== undefined ? `<p class="state">Your ${esc(monShort(m.name))} model is on show on this farm ✓</p><button class="btn ghost sm" data-goto="${at}">Show me the model</button>`
      : `<p class="state">You’ve earned the ${esc(monShort(m.name))} model ✓</p><button class="btn ${UI.placeMon === id ? 'pri' : ''}" data-mon-place="${id}">Place the model on this farm<small>Free · it shows the monument’s current stage</small></button>`; }
  const placedModels = () => S.tiles.map((T, i) => T.b && T.b.type === 'monument' ? i : -1).filter(i => i >= 0);
  const modelAt = id => placedModels().find(i => S.tiles[i].b.m.id === id);
  const earnedModels = () => { const all = (NET.mon && NET.mon.mine_all) || []; return all.filter(p => p.mine >= (p.keep_min || 0)); };
  function monHTML(where) {
    if (S.race) return `<p class="hint">Valley Monuments aren’t part of races or challenge runs. Head back to your own farm to help.</p>`;
    if (!online()) return `<p class="hint">Valley Monuments are built together by every <b>online</b> farm, so this private farm can’t take part. Your online farms can, and models you earn there can be placed on any farm.</p>`;
    const m = MONK();
    if (!m) return NET.mon && NET.mon.none ? `<p class="hint">No monument is being built right now. The next one will appear here, so check back soon.</p>` : `<p class="hint">${NET.tried && !NET.ok ? 'Valley Monuments need the shared valley connection (web version).' : 'Fetching the monument from the valley…'}</p>`;
    const K = monKind(m), t = monTotals(m), ph = m.phases[t.phase] || {}, left = monLeftToday(m), n = m.phases.length;
    let h = `<div class="monhero"><img class="monfloat" src="${ART.monPic(m.kind, t.stage)}" alt=""><div class="grow1"><b class="monname">${esc(m.name)}</b><small>Stage ${t.stage} of ${n}: <b>${esc(K.stages[t.stage])}</b>. ${esc(K.stageText[t.stage])}</small></div></div>`;
    h += `<div class="monbar"><i style="width:${monPct(t)}%"></i>${t.cum.slice(1, -1).map(c => `<s style="left:${c / t.total * 100}%"></s>`).join('')}</div>
      <small class="monline">${t.pts.toLocaleString()} of ${t.total.toLocaleString()} points (${monPct(t)}%) · ${m.givers} farm${m.givers === 1 ? '' : 's'} helping · ${monWhen(m, t)}</small>`;
    if (!t.finished) {
      h += `<span class="eyebrow">Phase ${t.phase + 1} of ${n}: ${esc(ph.name)}</span>${ph.blurb ? `<p class="hint small">${esc(ph.blurb)}</p>` : ''}
        <div class="pb"><i style="width:${Math.min(100, t.done / t.need * 100)}%"></i></div><small>${Math.max(0, t.done).toLocaleString()} of ${t.need.toLocaleString()} points for this phase. When it fills, the monument reaches ${esc(K.stages[t.phase + 1])}.</small>`;
      const rank = (m.top || []).findIndex(x => x.me);
      h += `<div class="monyou"><b>Your part:</b> ${(m.mine || 0).toLocaleString()} points given${rank >= 0 ? ` (#${rank + 1} on the roll)` : ''}. Today: ${(m.today || 0).toLocaleString()} of ${m.cap.toLocaleString()} points${left ? `, so you can give <b>${left.toLocaleString()}</b> more` : ', all used'}. Resets at 00:00 UTC, in ${fmtLeftShort(utcReset())}.</div>`;
      const items = Object.entries(ph.items || {}).filter(([id]) => D.items[id]).sort((a, b) => a[1] - b[1] || D.items[a[0]].name.localeCompare(D.items[b[0]].name));
      h += `<span class="eyebrow">Give goods</span><div class="givelist">${items.map(([id, v]) => { const have = count(id), mx = monMax(id), busy = UI.monBusy;
        const why = !have ? 'none in storage' : !left ? 'today’s allowance is used up' : left < v ? `worth more than the ${left} left today, but your last gift can go a little over` : '';
        return `<div class="trade give ${mx ? '' : 'off'}">${ico(id, mx ? '' : 'dim')}<div class="grow1"><b>${esc(D.items[id].name)}</b><small>counts as <b>${v}</b> point${v === 1 ? '' : 's'} each · have ${have}${why ? ` · ${why}` : ''}</small></div>${mx ? `<span class="qtybox"><input type="number" class="qty" id="mg-${id}" data-mq="${id}" min="1" max="${mx}" step="1" value="${Math.max(1, Math.min(mx, UI.mq[id] || mx))}" inputmode="numeric" aria-label="How many ${esc(D.items[id].name)} to give"><button class="btn sm pri" data-mon-give="${id}" ${busy ? 'disabled' : ''}>${busy === id ? 'Giving…' : 'Give'}</button></span>` : ''}<button class="autog ${monAutoOn(id) ? 'on' : ''}" data-mon-auto="${id}" aria-pressed="${monAutoOn(id)}" title="Give ${esc(D.items[id].name)} automatically">${monAutoOn(id) ? 'Auto ✓' : 'Auto'}</button></div>`; }).join('')}</div>
        <p class="hint small"><b>Auto</b> gives that good by itself whenever you have some, a batch every 20 seconds or so, until today’s allowance is used. It gives every one you have, so leave it off for goods you need for building. It works while the game is open, and switches itself off (with a heads-up) when today’s allowance is used up.</p>
        <div class="monyou bday">${builderDay() ? '<b>Builder’s day:</b> because you’ve given today, your quarries, clay banks, iron seams, woods, reeds, flowers and ponds refill twice as fast, and digging doesn’t wear deposits down. It lasts until 00:00 UTC.' : '<b>Builder’s day:</b> give anything today and, until 00:00 UTC, your quarries, clay banks, iron seams, woods, reeds, flowers and ponds refill twice as fast, and digging doesn’t wear deposits down.'}</div>
        <p class="hint small">Giving takes the goods from your storage and earns no gold. The box starts at the most that counts: what you have, what’s left of today’s allowance (the last item may go a little over), or what’s left of this phase.</p>`;
    } else h += `<p class="state">Finished, with ${m.givers} farm${m.givers === 1 ? '' : 's'} helping. Thank you! It stays on your Valley Green for good, and the next monument will appear here when it starts.</p>`;
    h += modelLine(m);
    if ((m.top || []).length) h += `<span class="eyebrow">Contributors</span><ol class="monroll">${m.top.map(x => `<li class="${x.me ? 'me' : ''}"><span>${esc(x.name)}${x.me ? ' (you)' : ''}</span><b>${x.points.toLocaleString()}</b></li>`).join('')}</ol>${m.givers > m.top.length ? `<p class="hint small">…and ${m.givers - m.top.length} more farm${m.givers - m.top.length === 1 ? '' : 's'}.</p>` : ''}`;
    else h += `<p class="hint small">No one has given anything yet. Be the first name on the roll!</p>`;
    if (where === 'drawer' && S.green) h += `<button class="btn ghost" data-mon-show>See it on your Valley Green<small>The full-size build, at a corner of your farm</small></button>`;
    else if (!S.green && S.goal < D.goals.length) h += `<p class="hint small">When you finish the tutorial, a Valley Green opens at a corner of your farm with the monument at full size.</p>`;
    h += `<button class="linkish small" data-mon-help>${UI.monHelp ? 'Hide: how' : 'How'} do monuments work?</button>${UI.monHelp ? monHelpHTML(m) : ''}`;
    return h; }
  function monPanel(i) { const b = T_(i).b, depot = b.type === 'depot';
    return head(depot ? 'Monument Depot' : (MONK() ? MONK().name : 'Valley Monument'), depot ? 'Give goods to the monument the whole valley is building.' : 'Built together by every online farm in the valley.') + monHTML('depot') + greenMoveHTML(); }
  function greenPanel(i) {
    return head('Valley Green', esc(D.terrain[T_(i).t].desc)) + `<p class="hint">The Valley Green opened at the edge of your farm for the valley’s monuments. It never cost you land, nothing can be built on it, and it doesn’t count toward your building limits. Finished monuments stay here at full size.</p>
      ${S.green ? `<button class="btn pri" data-goto="${S.green.d}">Open the Monument Depot<small>See what the monument needs and give goods</small></button>` : ''}
      ${greenMoveHTML()}`; }
  function modelPanel(i) { const mm = T_(i).b.m, K = D.monuments[mm.kind] || D.monuments.pyramid, x = earnedModels().find(p => p.id === mm.id) || { name: K.name }, st = monStageOf(mm.id), fin = !!x.finished_at || st >= 4;
    return head(`${monShort(x.name)} model`, 'A Valley Monument you helped build.') + `<div class="medalbig"><img src="${ART.monPic(mm.kind || 'pyramid', st)}" alt="" style="width:84px;height:auto"><p class="state">${fin ? `The valley finished ${esc(x.name)}${x.mine ? `, and you gave ${x.mine.toLocaleString()} points to it` : ''}.` : `The valley is building ${esc(x.name)}. This model shows its current stage: <b>${esc(K.stages[st])}</b>.`}</p></div>
      ${fin ? '' : '<button class="btn" data-drawer="valley">Open the monument<small>Give goods and watch it grow</small></button>'}<button class="btn ghost" data-mon-away="${i}">Put it away</button><p class="hint small">Place it again any time from the Monument Depot or Menu → Valley Monument.</p>`; }
  function sprinklerPanel(i) {
    const B = D.buildings[T_(i).b.type], n = around(i, B.radius).filter(j => j !== i && farmAt(j)).length, max = (B.radius * 2 + 1) ** 2 - 1;
    return head(B.name, esc(B.desc)) + `<p class="state">Covering ${n} farm plot${n === 1 ? '' : 's'}.</p><p class="hint">Plots it waters still earn Good quality when they’re watered at both growth stages. Place it among your plots to cover up to ${max}.</p>` + moveSection(i);
  }
  function emptyPanel(i) {
    let h = head('Empty grassland', 'Build a farm plot or place a station kit here.');
    if (UI.moving != null && T_(UI.moving).b) { const b = T_(UI.moving).b, nm = D.buildings[b.type].name;
      h += btn({ a: 'move', i, p: UI.moving, nm }, `Move the ${esc(nm)} here`, { cls: 'pri', sub: costTxt(moveCost(b.type)) }) + `<button class="btn ghost" data-move-cancel>Cancel moving</button>`; }
    if (!S.race) NET.medals.filter(m => medalAt(m) === undefined).forEach(m => { h += `<button class="btn ${UI.placeMedal === medalKey(m) ? 'pri' : 'ghost'}" data-medal-put="${medalKey(m)}" data-i="${i}">Place medal here<small>${MEDAL[m.place][0]} · ${weekLabel(m.week)}</small></button>`; });
    if (!S.race) earnedModels().filter(p => modelAt(p.id) === undefined).forEach(p => { h += `<button class="btn ${UI.placeMon === p.id ? 'pri' : 'ghost'}" data-mon-put="${p.id}" data-i="${i}">Place the ${esc(monShort(p.name))} model here<small>Free · it shows the monument’s current stage</small></button>`; });
    h += btn({ a: 'build', i }, 'Build Farm Plot', { cls: UI.placeMedal || UI.placeMon ? '' : 'pri', sub: costTxt(C.farmPlotCost) });
    const kits = Object.keys(S.inv).filter(id => D.items[id].cat === 'kit' && count(id) > 0);
    h += kits.length ? kits.map(id => { const B = D.buildings[D.items[id].building]; return btn({ a: 'place', i, p: id }, `Place ${esc(B.name)}`, { sub: `Kit + ${costTxt(B.place)}` }); }).join('')
      : `<p class="hint">Station kits are sold at the Open Market once unlocked.</p>`;
    return h + reshapeSection(i);
  }
  function surveyPanel(i) {
    const r = regionOf(i), R = S.regions[r], th = D.regionThemes[R.theme], hi = homeIdx();
    const finds = Object.keys(th.mix).filter(k => k !== 'grass').map(k => D.terrain[k].name);
    let h = head(`Unsurveyed: ${th.name}`, esc(th.desc));
    h += `<p class="state">A 6×6 area. Surveyors report: ${esc(finds.join(', '))}.</p>`;
    h += `<span class="eyebrow">What it takes</span>${costList(surveyCost())}` + btn({ a: 'survey', i: hi, p: r }, `Survey the ${esc(th.name)}`, { cls: 'pri', sub: costTxt(surveyCost()) });
    h += `<p class="hint">Surveying opens the area; then buy its tiles one by one from the edge of your land, as usual. Each new area also lets you build one more of each station and two more Storage Barns (you have ${areas()} area${areas() === 1 ? '' : 's'} now). Every survey costs more than the last.</p>`;
    const res = Object.keys(th.mix).find(k => D.gather[k] && D.gather[k].action === 'gather');
    if (res) { const G = D.gather[res], d = D.discoveries.find(x => x.id === G.needs); if (!unlocked(G.needs)) h += `<p class="hint">Working its ${esc(D.terrain[res].name)} tiles needs <b>${esc(d.name)}</b> in Discovery.</p>`; }
    return h;
  }
  function moveSection(i) {
    const b = T_(i).b; if (!b || !MOVABLE.includes(D.buildings[b.type].kind)) return '';
    if (!unlocked('rollers')) return '';
    return `<div class="more"><span class="eyebrow">Move this building</span><p class="hint">Keeps its upgrades, batches and farmhand jobs. Costs ${costTxt(moveCost(b.type))}${(S.moveHeat || 0) > 0 ? ' (higher after recent moves; the surcharge eases every few days)' : ''}.</p><button class="btn ghost" data-move-start="${i}">Pick a new spot</button></div>`;
  }
  function lockedPanel(i, T) {
    const Tr = D.terrain[T.t], adj = nbrs(i).some(n => S.tiles[n].o);
    let h = head(Tr.name, `${esc(Tr.desc)}`);
    if (adj) { const c = expCost(i); h += `<p class="state">Unclaimed land at your border.</p><span class="eyebrow">What it takes</span>${costList(c)}` + btn({ a: 'expand', i }, `Buy this tile`, { cls: 'pri', sub: costTxt(c) });
      if (S.exp < C.expandStoneAt) h += `<p class="hint">From your ${C.expandStoneAt + 1}th tile, land also costs stone; from the ${C.expandFenceAt + 1}th, a Land Kit (made at the Workbench). Boulder Fields only ever cost gold.</p>`; }
    else h += `<p class="hint">Too far away. Buy the land between here and your homestead first.</p>`;
    const G = D.gather[T.t]; if (G && !unlocked(G.needs)) h += `<p class="hint">Working it needs <b>${esc(D.discoveries.find(d => d.id === G.needs).name)}</b>.</p>`;
    return h + `<p class="tip">${esc(Tr.future)}</p>`;
  }
  function renderMoveBar() { const el = $('#movebar'), b = UI.moving != null && T_(UI.moving).b;
    if (!b) { UI.moving = null; el.hidden = true; return; } el.hidden = false;
    setHTML('#movebar', `<span><b>Moving the ${esc(D.buildings[b.type].name)}.</b> ${isTouch() ? 'Tap' : 'Click'} empty grass you own, then choose “Move here”.</span><button class="btn ghost sm" data-move-cancel>Cancel</button>`); }
  /* On larger screens the action panel floats beside the selected tile (right of it, or left if there's no room)
     and follows it as the view moves. Phones keep the bottom sheet. */
  /* Computers can also pin the panel: right-click it → Move and resize, drag it where you like, and it opens there
     from then on (saved in this browser). "Open beside the tile again" goes back to floating. */
  const PP_KEY = 'harvestworks.panelpos';
  UI.pp = (() => { try { return JSON.parse(localStorage.getItem(PP_KEY)); } catch (e) { return null; } })();
  function placePanel() { const el = $('#panel'), fr = $('#pframe');
    if (el.hidden || UI.sel < 0 || isPhone()) { fr.hidden = true;
      if (el.dataset.fl) { el.style.left = el.style.top = el.style.right = el.style.width = el.style.height = el.style.maxHeight = el.style.boxSizing = ''; delete el.dataset.fl; } return; }
    const topMin = $('#top').getBoundingClientRect().bottom + 8, W = innerWidth, H = innerHeight, P = UI.pp;
    let left, top, w, h;
    if (P) { w = Math.max(280, Math.min(W - 20, P.w));
      const sw = Math.round(w) + 'px', sh = P.h ? Math.round(Math.max(180, Math.min(H - topMin - 10, P.h))) + 'px' : '', mh = P.h ? 'none' : (H - topMin - 10) + 'px';
      if (el.style.width !== sw || el.style.height !== sh || el.style.maxHeight !== mh) { el.style.boxSizing = 'border-box'; el.style.width = sw; el.style.height = sh; el.style.maxHeight = mh; }
      h = el.offsetHeight; left = Math.max(10, Math.min(W - w - 10, P.x)); top = Math.max(topMin, Math.min(H - h - 10, P.y)); }
    else { if (el.style.width) { el.style.width = el.style.height = el.style.maxHeight = el.style.boxSizing = ''; }
      const [x, y] = toScreen(tx(UI.sel), ty(UI.sel)), sx = x / DPR, sy = y / DPR, gap = 44 * cam.z; w = el.offsetWidth; h = el.offsetHeight;
      const off = Math.max(34, gap) + w * .2; // 20% of the panel's width further out, so it clears the tile's neighbours
      left = sx + off; if (left + w > W - 10) left = sx - off - w;
      left = Math.max(10, Math.min(W - w - 10, left)); top = Math.max(topMin, Math.min(H - h - 64, sy - h / 2)); }
    const L = Math.round(left) + 'px', T = Math.round(top) + 'px';
    if (el.style.left !== L || el.style.top !== T) { el.style.left = L; el.style.top = T; el.style.right = 'auto'; el.dataset.fl = 1; }
    fr.hidden = false; const r = el.getBoundingClientRect(); Object.assign(fr.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  /* Window-style handling on computers: drag the title bar to move the panel, drag an edge or corner to resize it
     (handles live in #pframe, a frame that sits on the panel's border), double-click the title bar to send it back
     beside the tile. Moved/resized panels open in the same spot from then on (saved in this browser). */
  const savePP = () => { try { UI.pp ? localStorage.setItem(PP_KEY, JSON.stringify(UI.pp)) : localStorage.removeItem(PP_KEY); } catch (e) { } };
  (() => { const pn = $('#panel'), fr = $('#pframe'); let drag = null;
    const begin = (e, mode) => { const r = pn.getBoundingClientRect(); e.preventDefault();
      drag = { mode, x: e.clientX, y: e.clientY, r: { x: r.left, y: r.top, w: r.width, h: r.height }, keepH: UI.pp && UI.pp.h };
      (e.target).setPointerCapture(e.pointerId); document.body.classList.add('pdrag'); };
    pn.addEventListener('pointerdown', e => { if (isPhone() || e.button !== 0 || !e.target.closest('.phead') || e.target.closest('button, a, input')) return; begin(e, 'move'); });
    fr.addEventListener('pointerdown', e => { const h = e.target.closest('[data-rs]'); if (!h || e.button !== 0) return; begin(e, h.dataset.rs); });
    const move = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, r = drag.r, m = drag.mode;
      if (m === 'move') { UI.pp = { x: r.x + dx, y: r.y + dy, w: r.w, h: drag.keepH || null }; return; }
      let { x, y, w, h } = r;
      if (m.includes('e')) w = r.w + dx; if (m.includes('s')) h = r.h + dy;
      if (m.includes('w')) { w = r.w - dx; x = r.x + dx; } if (m.includes('n')) { h = r.h - dy; y = r.y + dy; }
      if (w < 280) { if (m.includes('w')) x -= 280 - w; w = 280; } if (h < 180) { if (m.includes('n')) y -= 180 - h; h = 180; }
      UI.pp = { x, y, w, h }; };
    const end = () => { if (!drag) return; drag = null; document.body.classList.remove('pdrag'); savePP(); };
    pn.addEventListener('pointermove', move); fr.addEventListener('pointermove', move);
    pn.addEventListener('pointerup', end); fr.addEventListener('pointerup', end); pn.addEventListener('pointercancel', end); fr.addEventListener('pointercancel', end);
    pn.addEventListener('dblclick', e => { if (isPhone() || !e.target.closest('.phead') || e.target.closest('button')) return; UI.pp = null; savePP(); toast('The menu opens beside the tile you pick again.', 'info'); });
  })();
  function renderPanel() {
    const i = UI.sel; const el = $('#panel');
    document.body.classList.toggle('sheet-open', i >= 0);
    if (i < 0) { el.hidden = true; UI.html['#panel'] = ''; return; }
    el.hidden = false; const T = S.tiles[i];
    if (UI.lastSel !== i) { const a = document.activeElement; if (a && el.contains(a)) a.blur(); UI.lastSel = i; // new tile: let the panel redraw
      const bk = T.b && D.buildings[T.b.type] ? D.buildings[T.b.type].kind : ''; UI.pfull = ['station', 'market', 'home', 'storage', 'board'].includes(bk) || (T.b && T.b.type === 'board'); } // phone sheet: short by default, tools that are mostly lists open full
    el.classList.toggle('full', !!UI.pfull);
    let h;
    if (T.t === 'void') h = surveyPanel(i);
    else if (!T.o) h = lockedPanel(i, T);
    else if (T.b) { const k = D.buildings[T.b.type].kind;
      h = k === 'farm' ? farmPanel(i, T.b) : k === 'station' ? stationPanel(i, T.b) : k === 'home' ? homePanel(i) : k === 'market' ? marketPanel(i) : k === 'sprinkler' ? sprinklerPanel(i) : k === 'storage' ? storagePanel(i) : k === 'decor' ? (T.b.type === 'monument' ? modelPanel(i) : medalPanel(i)) : k === 'depot' || k === 'monsite' ? monPanel(i) : boardPanel(i);
      if (k === 'home') S.noticeSeen = UI.noticeK; }
    else if (T.r) h = gatherPanel(i, T);
    else if (greenT(i)) h = greenPanel(i);
    else h = emptyPanel(i);
    setHTML('#panel', `<button class="pmore" data-pmore aria-label="${UI.pfull ? 'Show less' : 'Show more'}">${UI.pfull ? '▴ Less' : '▾ More'}</button>` + h);
  }
  // Your player name: locked to this player (not a farm) and used on the leaderboard, the weekly challenge and medals.
  function nameHTML() { const c = UI.claim || {};
          if (NET.myName && !UI.lbEdit) return `<p class="state">Locked in as <b>${esc(NET.myName)}</b> ✓ No one else in the valley can use it.</p><button class="btn ghost sm" data-lb-edit>Change it</button>`;
          let h = `<p class="hint small">Lock in a name so it’s yours alone across the valley. If it’s taken, you’ll get the next free number (Name1, Name2…).</p>
            <div class="fhrow"><input id="lbname" maxlength="14" value="${esc(UI.lbDraft != null ? UI.lbDraft : (NET.myName || S.name || ''))}" autocomplete="off" aria-label="Leaderboard name"><button class="btn pri sm" data-lb-claim ${c.busy ? 'disabled' : ''}>${c.busy ? 'Checking…' : 'Lock in name'}</button>${UI.lbEdit ? '<button class="btn ghost sm" data-lb-edit-cancel>Cancel</button>' : ''}</div>`;
          if (c.taken) h += `<p class="hint">“${esc(c.taken)}” is already taken. How about <b>${esc(c.suggestion)}</b>?</p><button class="btn sm" data-lb-take="${esc(c.suggestion)}">Use ${esc(c.suggestion)}</button>`;
          if (c.err) h += `<p class="hint err">${esc(c.err)}</p>`;
          return h; }
  /* Seasons and weather: today, tomorrow, what's in season now and next, and the year at a glance. */
  function seasonDrawer() {
    const close = `<button class="close" data-close-drawer aria-label="Close">×</button>`;
    if (noSeasons()) return `<div class="phead"><div><h2>No seasons in races</h2><p class="sub">Races and weekly challenges always run on a fair spring day, so everyone plays the same game.</p></div>${close}</div>`;
    const se = season(), si = seasonIdx(), nx = D.seasons[(si + 1) % D.seasons.length], left = SR.len - seasonDay() + 1;
    const g = Math.round((SR.grow - 1) * 100), sp = Math.round((SR.sell - 1) * 100);
    const items = ids => `<div class="sitems">${ids.map(id => { const it = D.items[id] ? id : D.crops[id].item;
      return `<span class="sitem ${S.disc.includes(it) ? '' : 'unk'}" title="${S.disc.includes(it) ? '' : 'Not made yet'}">${ico(it, S.disc.includes(it) ? '' : 'dim')}${esc(D.items[it].name)}</span>`; }).join('')}</div>`;
    const wxBox = (d, label) => { const k = weatherOn(d), dse = season(d), newSe = seasonDay(d) === 1 && d !== S.day;
      return `<div class="wxcard wx-${k}"><span class="eyebrow">${label} · Day ${d}${newSe ? ` · ${esc(dse.name)} begins` : ''}</span><b>${esc(wxName(k))}</b><p>${esc(wxLine(d))}</p></div>`; };
    let h = `<div class="phead"><div><h2>${esc(se.name)}, day ${seasonDay()} of ${SR.len}</h2><p class="sub">Year ${yearOf()} · ${esc(se.blurb)}</p></div>${close}</div>`;
    h += `<div class="wxrow">${wxBox(S.day, 'Today')}${wxBox(S.day + 1, 'Tomorrow')}</div>`;
    h += `<span class="eyebrow">In season now</span><p class="hint small">Grow ${g}% faster and sell for ${sp}% more:</p>${items(se.crops)}
      <p class="hint small">Sell for ${sp}% more, and the market often wants them:</p>${items(se.goods)}`;
    if (se.id === 'winter' && unlocked('coldframes')) h += '<p class="hint small">Winter: your Cold Frames keep every crop growing as usual.</p>';
    else if (se.id === 'winter') h += `<p class="hint small">Winter: tender crops (${esc(cropList(Object.keys(D.crops).filter(k => !D.crops[k].hardy)))}) grow ${Math.round((1 - SR.winterGrow) * 100)}% slower. Hardy crops grow as usual.</p>`;
    h += `<span class="eyebrow">Next: ${esc(nx.name)}, in ${left} day${left === 1 ? '' : 's'}</span><p class="hint small">${esc(nx.blurb)} In season: ${esc(cropList(nx.crops))}, plus ${esc(nameList(nx.goods))}.</p>`;
    h += `<span class="eyebrow">The year</span><div class="yearbar">${D.seasons.map((z, k) => `<div class="ys ${z.id} ${k === si ? 'on' : ''}"><b>${esc(z.name)}</b><small>Days ${k * SR.len + 1}–${(k + 1) * SR.len}</small>${k === si ? `<i style="width:${(seasonDay() - 1 + (S.time % C.dayLength) / C.dayLength) / SR.len * 100}%"></i>` : ''}</div>`).join('')}</div>`;
    h += `<p class="hint small">A year is ${YEAR} days, so each season lines up with a weekly report. Weather comes out the same however often you reload. Rain waters crops for you; heat dries soil out; snow days only let hardy crops be planted; mist and fog are just for looks.</p>`;
    return h; }
  function renderDrawer() {
    const el = $('#drawer');
    if (!UI.drawer) { el.hidden = true; UI.html['#drawer'] = ''; return; }
    el.hidden = false; let h = '';
    if (UI.drawer === 'disc') {
      h = `<div class="phead"><div><h2>Discovery</h2><p class="sub">Earned from firsts, deeper chains, quality and contracts. Never from repeating cheap work. You have <b>${S.dp}</b>.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      const rank = d => unlocked(d.id) ? 3 : discOk(d) ? (S.dp >= d.cost ? 0 : 1) : 2;
      const branchOf = d => (D.discoveryBranches.find(b => b.ids.includes(d.id)) || D.discoveryBranches[0]).id;
      const avail = D.discoveries.filter(d => !unlocked(d.id) && discOk(d));
      h += chips('disc', D.discoveryBranches.map(b => [b.id, b.name, D.discoveries.filter(d => branchOf(d) === b.id && !unlocked(d.id)).length || null]), avail.length ? [['avail', 'Ready to unlock', avail.length]] : []);
      const sel = catSel('disc'), card = d => { const own = unlocked(d.id), reqOk = discOk(d);
        const st = own ? 'own' : reqOk ? (S.dp >= d.cost ? 'can' : 'short') : 'lock';
        return `<div class="card ${st}"><div class="ctop"><img class="dimg" src="${ART.discPic(d.pic, D.items)}" alt=""><div class="ctxt"><b>${esc(d.name)}</b><span class="cost">${own ? 'Unlocked' : d.cost + ' DP'}</span></div></div><p>${esc(d.text)}</p><p class="where">${esc(d.where)}</p>
          ${own ? '' : !reqOk ? `<small>Needs ${[...d.req.filter(r => !unlocked(r)).map(r => esc(D.discoveries.find(x => x.id === r).name)), ...(d.survey && !(S.surveys > 0) ? ['your first new area surveyed'] : [])].join(', ')}</small>` : `<button class="btn ${st === 'can' ? 'pri' : ''}" data-unlock="${d.id}" ${st === 'can' ? '' : 'disabled'}>Unlock${st === 'short' ? `<small>Need ${d.cost - S.dp} more</small>` : ''}</button>`}</div>`; };
      if (sel === 'avail') h += `<div class="cards">${[...avail].sort((a, b) => rank(a) - rank(b)).map(card).join('')}</div>`;
      else h += D.discoveryBranches.filter(b => sel === 'all' || sel === b.id).map(b => {
        const ds = D.discoveries.filter(d => branchOf(d) === b.id).sort((x, y) => rank(x) - rank(y));
        return `<div class="grp"><span class="eyebrow">${esc(b.name)} · ${ds.filter(d => unlocked(d.id)).length}/${ds.length}</span><div class="cards">${ds.map(card).join('')}</div></div>`; }).join('');
    } else if (UI.drawer === 'inv') {
      h = `<div class="phead"><div><h2>Storage</h2><p class="sub">${used()} of ${cap()} items. Stations draw from here; station kits don’t count.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>
        <button class="linkish small" data-qhelp>${UI.qhelp ? 'Hide' : 'How do I make'} ${QN[1]} and ${QN[2]} goods?</button>${UI.qhelp ? QUALITY_HELP : ''}`;
      const ids = Object.keys(S.inv).filter(id => count(id) > 0);
      if (ids.length) h += chips('inv', groupCounts(ids, count));
      const sortK = INV_SORTS.some(s => s[0] === UI.cat.invsort) ? UI.cat.invsort : 'cat', worth = id => (D.items[id].value || 0) * count(id);
      if (ids.length > 1) h += `<div class="chips sortbar" role="group" aria-label="Sort storage"><span class="sortlbl">Sort by</span>${INV_SORTS.map(([k, nm, tip]) => `<button class="chipf ${sortK === k ? 'on' : ''}" data-cat="invsort:${k}" aria-pressed="${sortK === k}" title="${esc(tip)}">${esc(nm)}</button>`).join('')}</div>`;
      const slot = id => `<div class="slot" title="${esc(D.items[id].name)}">${ico(id, 'big')}<div><b>${esc(D.items[id].name)}${mastBadge(id)}</b><small>${[0, 1, 2].filter(q => S.inv[id][q]).map(q => `${S.inv[id][q]} ${QN[q]}`).join(' · ')}</small>${sortK === 'worth' ? `<small class="use">worth about ${worth(id).toLocaleString()}g in all</small>` : useHint(id) ? `<small class="use">${esc(useHint(id))}</small>` : ''}</div></div>`;
      if (!ids.length) h += '<p class="hint">Storage is empty.</p>';
      else if (sortK === 'cat') h += grouped(ids, 'inv', slot, 'invgrid');
      else { const sel = catSel('inv'), nm = id => D.items[id].name, order = Object.keys(S.inv), inv = id => S.inv[id];
        const key = { name: (a, b) => nm(a).localeCompare(nm(b)), most: (a, b) => count(b) - count(a), least: (a, b) => count(a) - count(b), worth: (a, b) => worth(b) - worth(a),
          best: (a, b) => inv(b)[2] - inv(a)[2] || inv(b)[1] - inv(a)[1] || count(b) - count(a), newest: (a, b) => order.indexOf(b) - order.indexOf(a) }[sortK];
        const list = ids.filter(id => sel === 'all' || groupOf(id) === sel).sort((a, b) => key(a, b) || nm(a).localeCompare(nm(b)));
        h += `<div class="invgrid">${list.map(slot).join('')}</div>`; }
    } else if (UI.drawer === 'tree') {
      const m = curMs();
      if (!m) h = `<div class="phead"><div><h2>All contracts complete</h2></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      else { const roots = m.need.map(([id, n, q]) => tree(id, n, q)), tot = {}; roots.forEach(r => leaves(r, tot));
        const done = roots.every(r => r.short === 0);
        h = `<div class="phead"><div><h2>${esc(m.name)}</h2><p class="sub">${done ? 'You have everything. Deliver it at the Order Board.' : 'Everything this contract needs, traced back to raw materials. Amounts already account for what’s in storage.'}</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
        if (!done && Object.keys(tot).length) h += `<span class="eyebrow">Raw materials still to get</span><div class="shop">${Object.entries(tot).map(([id, n]) => `<div class="need">${ico(id)}<span>${n}× ${esc(D.items[id].name)}</span></div>`).join('')}</div>`;
        h += `<span class="eyebrow">Production tree</span><ul class="ptree">${roots.map(r => `<li>${treeHTML(r)}</li>`).join('')}</ul>`;
        h += `<p class="hint">Reward: +${m.gold}g · +${m.dp} Discovery.</p>`; }
    } else if (UI.drawer === 'daily') {
      h = dqDrawer();
    } else if (UI.drawer === 'mastery') {
      const done = MAS.items.filter(id => mastTierRaw(id) > 0).length;
      h = `<div class="phead"><div><h2>Mastery</h2><p class="sub">Every crop and animal good you produce counts toward its mastery. Each tier gives that good a small perk and some Discovery. ${done} of ${MAS.items.length} started.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      if (S.race) h += '<p class="hint">Mastery is off during races and weekly challenges, so every run stays fair. It picks up again on your own farm.</p>';
      h += `<button class="linkish small" data-mhelp>${UI.mhelp ? 'Hide the tiers' : 'What do the tiers give?'}</button>`;
      if (UI.mhelp) h += `<div class="mhelp">${MAS.tiers.map((T, k) => `<p><span class="mtier ${T.id}">${k >= 3 ? '★' : ''}${T.name}</span> sells for ${Math.round(T.sell * 100)}% more${T.speed ? `, grows or is made ${Math.round(T.speed * 100)}% faster` : ''}${T.extra ? `, every ${extraWord(T.extra)} harvest or batch gives one extra` : ''} · +${T.dp} Discovery</p>`).join('')}<p class="hint small">Only what you harvest or collect counts; buying and trading don’t. Cheaper goods need more to reach each tier. Perks apply to that good only.</p></div>`;
      const ord = [...MAS.items].sort((a, b) => (S.disc.includes(b) - S.disc.includes(a)) || mastTierRaw(b) - mastTierRaw(a) || mastN(b) * D.items[b].value - mastN(a) * D.items[a].value);
      h += `<div class="mlist">${ord.map(id => S.disc.includes(id) ? mastRow(id, true) : `<div class="mrow locked">${ico(id)}<div class="grow1"><b>${esc(D.items[id].name)}</b><small>Not produced on this farm yet. Make one to start.</small></div></div>`).join('')}</div>`;
    } else if (UI.drawer === 'valley') {
      h = `<div class="phead"><div><h2>Valley Monument</h2><p class="sub">Built together by every online farm in the valley.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>` + monHTML('drawer');
    } else if (UI.drawer === 'season') {
      h = seasonDrawer();
    } else if (UI.drawer === 'support') {
      h = `<div class="phead"><div></div><button class="close" data-close-drawer aria-label="Close">×</button></div><div class="supportbox">${supportHTML()}<div class="menu"><button class="btn ghost" data-drawer="menu">Back to the menu</button></div></div>`;
    } else if (UI.drawer === 'medals') {
      h = `<div class="phead"><div><h2>Medals</h2><p class="sub">The top three in each week’s Weekly Challenge win a medal. Put yours on show on any of your farms.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      if (!NET.medals.length) h += `<p class="hint">No medals yet. Finish in the top three of a Weekly Challenge to win one.</p><div class="menu"><button class="btn pri" data-weekly-open>Weekly challenge<small>This week: ${esc(weekTheme(weekOf(srvNow())).name)}</small></button></div>`;
      else h += `<div class="medals">${NET.medals.map(m => { const at = S.race ? undefined : medalAt(m);
        return `<div class="medalrow"><img src="${medalImg(m.place)}" alt=""><div class="grow1"><b>${MEDAL[m.place][0]} · ${MEDAL[m.place][1]}</b><small>${weekLabel(m.week)} · ${m.score.toLocaleString()} points</small></div>
          ${S.race ? '' : at !== undefined ? `<button class="btn ghost sm" data-medal-show="${at}">On show ✓</button>` : `<button class="btn ${UI.placeMedal === medalKey(m) ? 'pri' : ''} sm" data-medal-place="${medalKey(m)}">Place on this farm</button>`}</div>`; }).join('')}</div>
        <p class="hint small">${S.race ? 'Medals can’t be placed during a race or challenge run.' : 'Placing a medal is free. Select it on the farm to put it away again.'}</p>`;
    } else if (UI.drawer === 'hands') {
      const hands = S.helper ? [S.helper] : [], hi = homeIdx();
      h = `<div class="phead"><div><h2>Farmhands</h2><p class="sub">Each farmhand loops through their jobs in order, skipping any with nothing to do. Add jobs from any farm plot, station, tree, pond, boulder field or resource tile.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      if (!unlocked('farmhand')) h += `<p class="hint">Unlock <b>Farmhand</b> in Discovery (after Repeat Recipes) to hire help.</p>`;
      else if (!hands.length) h += btn({ a: 'hire', i: hi }, 'Hire a farmhand', { cls: 'pri', sub: `${costTxt(D.farmhand.hire)} · works a loop of up to ${fhMax()} jobs` });
      hands.forEach((F, n) => {
        const status = !F.on ? 'Paused' : !F.steps.length ? 'No jobs yet' : F.cur ? `Working: ${esc(TASKS[F.cur.a].label(F.cur))}` : 'Waiting for work';
        h += `<div class="handcard"><div class="handhead"><b>Farmhand ${n + 1}</b><span class="muted">${status}</span></div>
          <div class="handctl"><button class="toggle ${F.on ? 'on' : ''}" data-fh-toggle aria-pressed="${F.on}"><i></i>${F.on ? 'Working' : 'Paused'}</button>
          <div class="chips">${D.farmhand.speeds.map(sp => `<button class="chipf ${(F.spd || 1) === sp ? 'on' : ''}" data-fh-setspd="${sp}">${sp}×</button>`).join('')}</div></div>
          <span class="eyebrow">Jobs ${F.steps.length}/${fhMax()}</span>`;
        h += F.steps.length ? `<ol class="routine jobs">${F.steps.map((st, k) => `<li class="${F.cur && F.cur.si === k ? 'now' : ''}"><button class="linkish" data-goto="${st.i}" title="Show on the map">${esc(stepLabel(st))}</button>
            <span class="jobbtns"><button class="x mv" data-fh-up="${k}" ${k ? '' : 'disabled'} aria-label="Move up">↑</button><button class="x mv" data-fh-down="${k}" ${k < F.steps.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="x" data-fh-del="${k}" aria-label="Remove job">×</button></span></li>`).join('')}</ol>`
          : `<p class="hint">No jobs yet. Select a farm plot, station or resource tile and choose “Add to farmhand”.</p>`;
        if (F.steps.length) h += `<button class="btn ${UI.fhClear ? 'danger' : 'ghost'} sm" data-fh-clear>${UI.fhClear ? 'Tap again to clear all ' + F.steps.length + ' jobs' : 'Clear all jobs'}</button>`;
        h += `</div>`; });
      if (hands.length) h += `<p class="hint small">${unlocked('crew') ? 'Seasoned farmhand: 8 jobs, full speed.' : 'Unlock Seasoned Farmhand in Discovery for 8 jobs and full walking speed.'} Only one farmhand for now.</p>`;
    } else if (UI.drawer === 'lb') {
      const L = UI.lb || {}, tab = UI.lbTab || 'top', fmt = n => Number(n).toLocaleString();
      h = `<div class="phead"><div><h2>Leaderboard</h2><p class="sub">Every farm in the valley. <b>Top score</b> is total score; <b>Best pace</b> is score per day played, for farms at least ${LB_MIN_DAYS} days old.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>`;
      if (L.loading) h += `<p class="hint">Fetching the valley’s scores…</p>`;
      else if (L.off) h += `<p class="hint">The leaderboard needs the shared valley connection, which isn’t available here. Play the web version at zcgrimshaw.github.io/harvestwork to see it.</p>`;
      else { const me = L.me, pace = Math.round(S.score / Math.max(1, S.day) * 10) / 10;
        h += `<div class="wgrid lbme">${[['Your score', fmt(Math.floor(S.score))], ['Days played', S.day], ['Your pace', pace + '/day']].map(([a, b]) => `<div class="wstat"><b>${b}</b><span>${a}</span></div>`).join('')}</div>`;
        h += `<p class="hint">${me ? `You’re <b>#${me.rank}</b> of ${L.farms} by score${me.pace_rank ? ` and <b>#${me.pace_rank}</b> of ${L.paced} by pace` : `; you join the pace board on day ${LB_MIN_DAYS}`}.` : 'Your farm will appear after its next day starts.'}</p>`;
        h += `<div class="tabs">${[['top', 'Top score'], ['pace', 'Best pace']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-lbtab="${k}">${n}</button>`).join('')}</div>`;
        const rows = (L[tab] || []);
        h += rows.length ? `<table class="lbt"><thead><tr><th>#</th><th>Farmer</th><th>Score</th><th>Days</th><th>Pace</th></tr></thead><tbody>${rows.map((r, k) => `<tr class="${r.me ? 'me' : ''}"><td>${k + 1}</td><td>${esc(r.name)}${r.locked ? ' <span class="lock" title="Locked-in name">✓</span>' : ''}${r.me ? ' <span class="you">you</span>' : ''}</td><td>${fmt(r.score)}</td><td>${r.days}</td><td>${r.pace}</td></tr>`).join('')}</tbody></table>`
          : `<p class="hint">${tab === 'pace' ? `No farms are ${LB_MIN_DAYS} days old yet.` : 'No scores yet.'}</p>`;
        h += `<p class="hint small">${S.lbShow !== false ? (NET.myName ? `Shown as <b>${esc(NET.myName)}</b> ✓ (locked in).` : `Shown as <b>${esc(S.name)}</b>. Lock in a name that’s yours alone in Settings.`) : 'You’re hidden: others see “A farmer”. Change this in Settings.'}</p>`; }
      h += `<div class="menu"><button class="btn ghost" data-lb-refresh>Refresh</button><button class="btn ghost" data-drawer="menu">Back to the menu</button></div>`;
    } else if (UI.drawer === 'settings') {
      h = `<div class="phead"><div><h2>Settings</h2><p class="sub">Saved with this farm, except sound, which is remembered on this device.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>
        <span class="eyebrow">Pausing</span><div class="opts">
        <button class="toggle ${S.menuPause !== false ? 'on' : ''}" data-menupause aria-pressed="${S.menuPause !== false}"><i></i>Pause the game while the Menu or Settings is open</button>
        <button class="toggle ${S.bgPause !== false ? 'on' : ''}" data-bgpause aria-pressed="${S.bgPause !== false}"><i></i>Pause the game when you switch to another tab or app</button>
        <p class="hint small">${S.bgPause !== false ? 'Your farm waits for you while you’re away.' : `Your farm keeps working while you’re away: when you come back it catches up on up to ${CATCHUP_MAX / 3600} hours. Time doesn’t pass while the game is closed.`}</p>
        <span class="optlabel">Pause when I haven’t done anything for</span>
        <div class="chips">${IDLE_OPTS.map(m => `<button class="chipf ${idleSecs() === m ? 'on' : ''}" data-idle="${m}" aria-pressed="${idleSecs() === m}">${idleLabel(m)}</button>`).join('')}</div>
        <p class="hint small">${idleSecs() ? `If you don’t tap, click, scroll or press a key for ${idleLabel(idleSecs())}, the game pauses until you’re back.` : 'The game keeps running even when you step away from the screen.'}</p></div>
        <span class="eyebrow">Notifications</span><div class="opts">
        <button class="toggle ${S.weekly !== false ? 'on' : ''}" data-weekly aria-pressed="${S.weekly !== false}"><i></i>Show a progress report every 7 days</button>
        <p class="hint small">A short look back at the week: gold, harvests, goods made, sales and contracts.</p>
        ${online() ? `<button class="toggle ${S.tick && S.tick.open ? 'on' : ''}" data-tick-toggle aria-pressed="${!!(S.tick && S.tick.open)}"><i></i>Show the valley market ticker at the top</button>
        <p class="hint small">The scrolling list of recent trades. Hiding it gives the map more room, especially on a phone.</p>` : ''}
        ${online() ? `<button class="toggle ${S.lbShow !== false ? 'on' : ''}" data-lbshow aria-pressed="${S.lbShow !== false}"><i></i>Show my farmer’s name on the leaderboard</button>
        <p class="hint small">${S.lbShow !== false ? `Other players see ${NET.myName ? `your locked name <b>${esc(NET.myName)}</b> ✓` : 'your farmer’s name'} and your score.` : 'Your score still counts, but others see “A farmer”.'}</p>` : ''}</div>
        <span class="eyebrow">Your player name</span><div class="opts">${nameHTML()}<p class="hint small">Shown on the leaderboard, in the weekly challenge and on your medals, on every farm you play.</p></div>
        ${S.race ? '' : `<span class="eyebrow">This farm</span><div class="opts"><p class="state">${S.mode === 'private' ? '<b>Private farm.</b> No leaderboard and no shared prices. Private farms can’t join the Online Valley later.' : '<b>Online Valley farm.</b> Shared market prices, the valley ticker and the leaderboard.'}</p>
          ${S.mode !== 'private' ? `<button class="btn ${UI.goPrivate ? 'danger' : 'ghost'} sm" data-go-private>${UI.goPrivate ? 'Tap again: this can’t be undone' : 'Make this farm private'}</button><p class="hint small">It leaves the leaderboard and stops sharing prices. A private farm can’t come back to the Online Valley.</p>` : ''}</div>`}
        <span class="eyebrow">Sound</span><div class="opts">
        <button class="toggle ${SND.prefs.mute ? '' : 'on'}" data-sound-mute aria-pressed="${!SND.prefs.mute}"><i></i>Sound ${isTouch() ? '' : '<span class="muted">(M)</span>'}</button>
        ${[['sfx', 'Effects', 'Chimes when things finish, and the sounds of work'], ['amb', 'Ambience', 'A breeze, birds by day, crickets at dusk, rain and summer cicadas'], ['mus', 'Music', 'A different tune for each season, never the same twice']].map(([k, n, d]) =>
          `<label class="slider"><span><b>${n}</b><small>${d}</small></span><input type="range" min="0" max="100" step="5" value="${Math.round(SND.prefs[k] * 100)}" data-vol="${k}" aria-label="${n} volume" ${SND.prefs.mute ? 'disabled' : ''}></label>`).join('')}
        </div>
        <div class="menu"><button class="btn ghost" data-drawer="menu">Back to the menu</button></div>`;
    } else if (UI.drawer === 'menu') {
      h = `<div class="phead"><div><h2>Harvest Valley</h2><p class="sub">${S.menuPause !== false ? '<b>Game paused.</b> ' : ''}${S.race ? (S.race.weekly ? 'Weekly challenge: the clock keeps running. ' : 'Racing: the clock keeps running. ') : ''}Progress saves in this browser<span id="savedago"></span>.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>
        ${S.race && S.race.weekly ? `<div class="demand"><span><b>${esc(weekTheme(S.race.week).name)}</b> · ${S.race.ranked ? 'ranked run' : 'practice run'}, ${fmtTime(Math.max(0, S.race.end - Date.now()))} left. ${esc(weekTheme(S.race.week).blurb)}</span></div><div class="menu"><button class="btn" data-week-end>End this run now<small>${S.race.ranked ? 'Your score so far counts' : 'Practice doesn’t count'}</small></button></div>`
        : S.race ? `<div class="demand"><span><b>Racing in ${esc(S.race.code)}</b> to ${S.race.target.toLocaleString()} points. No pausing in a race.</span></div><div class="menu"><button class="btn" data-race-leave>Leave the race<small>Back to your own farm</small></button></div>` : ''}
        <div class="menu"><button class="btn" data-drawer="settings">Settings<small>Pausing, weekly report, sound</small></button><button class="btn" data-race-open>Race with friends<small>Host or join a race</small></button><button class="btn" data-weekly-open>Weekly challenge<small>This week: ${esc(weekTheme(weekOf(srvNow())).name)}</small></button><button class="btn" data-drawer="medals">Medals<small>${NET.medals.length ? `${NET.medals.length} won` : 'Win one in the weekly challenge'}</small></button><button class="btn" data-drawer="daily">Daily Puzzle<small>${dqMenuSub()}</small></button><button class="btn" data-drawer="mastery">Mastery<small>${(() => { const n = MAS.items.filter(id => mastTierRaw(id) > 0).length; return n ? `${n} of ${MAS.items.length} goods started` : 'Grow and raise goods to master them'; })()}</small></button>${online() || earnedModels().length ? `<button class="btn" data-drawer="valley">Valley Monument<small>${MONK() ? esc(MONK().name) + ' · ' + monPct(monTotals(MONK())) + '%' : 'Built together by the valley'}</small></button>` : ''}${unlocked('farmhand') ? '<button class="btn" data-drawer="hands">Farmhands<small>Manage their jobs</small></button>' : ''}${online() ? '<button class="btn" data-lb-open>Leaderboard<small>How your farm compares</small></button>' : ''}</div>
        <div class="menu"><button class="btn pri" data-save>Save now</button><button class="btn ghost" data-farms-open>Your farms<small>Switch or start a new one</small></button></div>
        <span class="eyebrow">Cloud backup</span>${S.cloud && S.cloud.at ? `
        <div class="coderow"><span class="codechip">${fmtCode(S.cloud.code)}</span><button class="btn ${UI.cloudCopied ? 'pri' : 'ghost'} sm" data-copy-cloud>${UI.cloudCopied ? 'Copied ✓' : 'Copy code'}</button></div>
        <p class="sub">This code brings your farm back on any phone or computer: Main menu → Restore from a backup code.</p>
        <p class="hint small">Last backed up ${Math.max(1, Math.round((Date.now() - S.cloud.at) / 60000))} min ago (day ${S.cloud.day}). ${S.cloud.auto !== false ? 'It backs up again by itself every 10 minutes or so while you play.' : 'Automatic backups are off.'} Write the code down or take a screenshot. Anyone with the code can load a copy of your farm.</p>` : `
        <p class="sub">Back up your farm to the valley and get a short code that brings it back on any phone or computer.</p>`}
        <div class="menu"><button class="btn pri" data-cloud-backup ${UI.cloudBusy ? 'disabled' : ''}>${UI.cloudBusy ? 'Backing up…' : S.cloud && S.cloud.at ? 'Back up now' : 'Back up my farm'}</button><button class="btn ghost" data-restore-open>Restore from a backup code</button>
        ${S.cloud && S.cloud.at ? `<button class="toggle ${S.cloud.auto !== false ? 'on' : ''}" data-cloud-auto aria-pressed="${S.cloud.auto !== false}"><i></i>Back up automatically</button>` : ''}</div>
        <span class="eyebrow">Player key</span>${NET.pkey ? `
        <div class="coderow"><span class="codechip">${fmtCode(NET.pkey)}</span><button class="btn ${UI.pkCopied ? 'pri' : 'ghost'} sm" data-copy-pkey>${UI.pkCopied ? 'Copied ✓' : 'Copy key'}</button></div>
        <p class="sub">Your key carries you to another phone or computer: your locked name, your medals and every farm you’ve backed up. Main menu → Restore, then type the key.</p>
        <p class="hint small">Keep it private: anyone with the key can play as you.</p>`
        : `<p class="sub">One code for <i>you</i>, not just this farm: your locked name, your medals and every farm you back up. Nothing to sign up for.</p>
        <div class="menu"><button class="btn" data-pkey-make ${UI.pkBusy ? 'disabled' : ''}>${UI.pkBusy ? 'Making…' : 'Make my player key'}</button></div>`}
        <span class="eyebrow">Move your farm</span>
        <p class="sub">Or save your farm as a file and load it on another device. Loading replaces the farm on that page.</p>
        <div class="menu">${canShareFile() ? '<button class="btn" data-share-save>Share save file<small>Save to Files, AirDrop, email…</small></button>' : ''}<button class="btn ${canShareFile() ? 'ghost' : 'pri'}" data-download-save>Download save file</button><button class="btn ghost" data-load-file>Load a save file</button></div>
        <button class="linkish small" data-toggle-code>${UI.showCode ? 'Hide save codes' : 'Or copy and paste a save code instead'}</button>
        ${UI.showCode ? `<div class="menu"><button class="btn ghost" data-export>${UI.exportCode ? 'Refresh save code' : 'Export save code'}</button><button class="btn ghost" data-import-open>Paste a save code</button></div>` : ''}
        ${UI.showCode && UI.exportCode ? `<label class="eyebrow" for="expcode">Your save code · ${Math.ceil(UI.exportCode.length / 1024)} KB of text</label><textarea id="expcode" class="code" readonly rows="4">${esc(UI.exportCode)}</textarea>
          <div class="menu"><button class="btn pri" data-copy-code>${UI.copied ? 'Copied ✓' : 'Copy save code'}</button></div>` : ''}
        ${UI.fileInfo || UI.fileErr ? `<div id="filestatus">${UI.fileErr ? `<p class="hint err">${esc(UI.fileErr)}</p>` : `<p class="hint">${UI.fileInfo}</p><div class="menu"><button class="btn ${UI.confirmImport ? 'danger' : 'pri'}" data-import>${UI.confirmImport ? 'Tap again to replace this farm' : 'Load this farm'}</button><button class="btn ghost" data-file-cancel>Cancel</button></div>`}</div>` : ''}
        ${UI.showCode && UI.importOpen ? `<label class="eyebrow" for="impcode">Paste a save code</label><textarea id="impcode" class="code" rows="4" placeholder="HWZ1:…">${esc(UI.importText || '')}</textarea>
          <div id="impstatus">${UI.importErr ? `<p class="hint err">${esc(UI.importErr)}</p>` : UI.importInfo ? `<p class="hint">${UI.importInfo}</p>` : ''}</div>
          <div class="menu"><button class="btn ${UI.confirmImport ? 'danger' : 'pri'}" data-import ${UI.importInfo ? '' : 'disabled'}>${UI.confirmImport ? 'Tap again to replace this farm' : 'Import this farm'}</button></div>` : ''}
        <span class="eyebrow">Show your support</span>
        <p class="sub">Harvest Valley is free to play. If you’re enjoying your farm, a show of support helps keep new updates coming.</p>
        <div class="menu"><button class="btn pri" data-drawer="support">Show your support</button></div>
        <div class="menu"><button class="btn ghost" data-title-open>Main menu</button><button class="btn ghost" data-tut-replay>Replay the tutorial</button></div>
        <span class="eyebrow">Controls</span>${isTouch() ? `<ul class="help"><li>Tap a tile to select it; tap it again to repeat its main action.</li><li>Drag with one finger to move around. Pinch to zoom.</li><li>Twist two fingers to turn the world; slide two fingers up or down together to tilt the view.</li><li>⟲ ⟳ turn a quarter; ⌂ recentres and resets the tilt.</li><li>The eye button shows the name of every building.</li><li>Your farmer works through queued tasks in order. Cancel with ×.</li></ul>` : ''}<ul class="help ${isTouch() ? 'desk' : ''}"><li>Click a tile to select it; the panel lists its actions.</li><li>Click a selected tile again to repeat its main action.</li><li>Hold the right mouse button and push the mouse away from where you pressed, like a thumbstick: left and right turn the world, up and down tilt the view. The further you push, the faster it moves. ⌂ recentres and resets the tilt. Q / E or the ⟲ ⟳ buttons glide a quarter turn. Left- or middle-drag to pan. Scroll or pinch to zoom. Arrow keys and +/− work too.</li><li>The eye button or X shows the name of every building.</li><li>Your farmer walks to each queued task in order. Cancel with ×.</li><li>Later, Discovery unlocks tool upgrades, repeating recipes, auto-collect, sprinklers and a farmhand.</li></ul>
        <span class="eyebrow">Your record</span><p class="sub">Score <b>${S.score}</b> · Day ${S.day} · ${S.tiles.filter(t => t.o).length} tiles · ${S.disc.length} goods discovered</p>`;
    }
    setHTML('#drawer', `<div class="dbox">${h}</div>`);
    const sa = UI.drawer === 'menu' && $('#savedago');
    if (sa) { const t = UI.savedAt ? `; last saved ${Math.round((Date.now() - UI.savedAt) / 1000)}s ago` : ''; if (sa.textContent !== t) sa.textContent = t; }
  }
  // Show your support: a big QR code to scan with a phone, and a link that opens Ko-fi.
  const supportHTML = () => `<h2>Show your support</h2>
    <p class="sub">Harvest Valley is free to play and made by one person. If you’re enjoying your farm, a show of support helps keep new updates coming. $1 is plenty; anything is appreciated.</p>
    <div class="bigqr"><img class="qr big" src="${D.support.qr}" alt="QR code for the Harvest Valley Ko-fi page"><span>Scan with your phone’s camera</span></div>
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
      h += S.log.length ? `<ol class="loglist">${S.log.map(e => `<li><span class="when">Day ${e.d} ${e.c}</span><span class="what">${e.who === 'hand' ? '<em>Farmhand</em> ' : e.who === 'auto' ? '<em>Auto</em> ' : ''}${esc(e.text)}</span></li>`).join('')}</ol>`
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
    const T = S.tick || (S.tick = { open: !isPhone(), spd: 'slow' }), el = $('#ticker');
    el.hidden = !online(); document.body.classList.toggle('tick-off', isPhone() && (!online() || !T.open)); // on a phone a closed ticker takes no room at all
    if (!online()) { UI.tickShell = null; return; }
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
  function tickTicker(dt) { if (!online()) return;
    const T = S.tick; if (!T || !T.open) return; const tr = document.querySelector('#ticker .tktrack'), c = tr && tr.firstElementChild; if (!c) return;
    const w = c.offsetWidth; if (!w) return;
    if (!mq('(prefers-reduced-motion: reduce)')) UI.tickX = ((UI.tickX || 0) + TICK_SPEED[T.spd] * dt) % w;
    tr.style.transform = `translateX(${-(UI.tickX || 0)}px)`;
  }
  function renderUI() {
    UI.noticeK = S.race ? '' : noticeKey();
    { const b = $('#zoom [data-mon-show]'); if (b) b.hidden = !S.green || !!S.race; }
    renderLogs(); renderTicker();
    renderTop(); renderGoals(); renderQueue(); renderPanel(); renderDrawer(); renderCoach(); renderMoveBar(); renderRaceBar();
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
  $('#panel').addEventListener('click', e => { if (e.target.closest('button, input, label, select, .errand')) return; const r = e.target.closest('.recipe[data-rid]'); if (!r) return;
    const k = r.dataset.st + ':' + r.dataset.rid; UI.rexp = UI.rexp === k ? null : k; UI.rexpN = 1; dirty(); });
  document.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el) return;
    const ds = el.dataset;
    if ('task' in ds) { const t = { a: ds.a, i: +ds.i }; if (ds.p !== undefined) t.p = isNaN(+ds.p) || ds.p === '' ? ds.p : (ds.a === 'deliver' ? +ds.p : ds.p);
      if (ds.n !== undefined) t.n = +ds.n; if (ds.q !== undefined) t.q = +ds.q; if (ds.f !== undefined) t.f = +ds.f; if (ds.nm) t.nm = ds.nm;
      if (t.a === 'move' || t.a === 'survey') t.p = +ds.p; queueTask(t); if (t.a === 'move') UI.moving = null; }
    else if ('close' in ds) UI.sel = -1;
    else if ('closeDrawer' in ds) { UI.drawer = null; UI.confirmReset = false; }
    else if (ds.moveStart) { UI.moving = +ds.moveStart; UI.sel = -1; }
    else if ('moveCancel' in ds) { UI.moving = null; }
    else if ('titleOpen' in ds) { save(); UI.drawer = null; UI.hadSave = true; openTitle('main'); }
    else if ('tutReplay' in ds) { UI.drawer = null; startTut(); }
    else if ('tutNext' in ds) { tutAdvance(); }
    else if ('tutSkip' in ds) { endTut(true); }
    else if (ds.drawer) { UI.drawer = UI.drawer === ds.drawer ? null : ds.drawer; UI.confirmReset = false; }
    else if (ds.tree) UI.drawer = 'tree';
    else if (ds.log) { const was = UI.logOpen; UI.logOpen = was === ds.log ? null : ds.log;
      if (was === 'upd' && UI.logOpen !== 'upd') { S.seenUpdate = latest().v; save(); } } // closing Updates marks it as read
    else if ('tickToggle' in ds) { S.tick.open = !S.tick.open; save(); if (S.tick.open && online() && Date.now() - (NET.at || 0) > 15000) pullMarket(); }
    else if ('tickSpeed' in ds) { S.tick.spd = S.tick.spd === 'slow' ? 'fast' : 'slow'; save(); }
    else if (ds.mtab) UI.mtab = ds.mtab;
    else if (ds.cat) { const [k, v] = ds.cat.split(':'); UI.cat[k] = v; try { localStorage.setItem('harvestworks.tabs', JSON.stringify(UI.cat)); } catch (e) { } }
    else if (ds.cancel) { S.queue = S.queue.filter(t => t.id !== +ds.cancel); }
    else if (ds.pass) { S.orders = S.orders.filter(o => o.id !== +ds.pass); S.refill = C.orderRefill; }
    else if (ds.unlock) { const d = D.discoveries.find(x => x.id === ds.unlock);
      if (d && !unlocked(d.id) && discOk(d) && S.dp >= d.cost) { S.dp -= d.cost; S.unl.push(d.id); logAct(`Unlocked ${d.name} · −${d.cost} Discovery`, 'you');
        const kit = Object.keys(D.items).find(k => D.items[k].cat === 'kit' && D.items[k].buy && D.items[k].requires === d.id);
        if (kit && !S.market.offers.includes(kit)) { S.market.offers.unshift(kit); S.market.offers = S.market.offers.slice(0, C.marketOffers); }
        UI.bounds = null; SND.play('discover');
        toast(`<b>Unlocked ${esc(d.name)}.</b> ${esc(d.text)} <span class="where">${esc(d.where)}</span>`, 'disc'); emit('unlock'); save(); } }
    else if (ds.sellqty) { const [id, q] = ds.sellqty.split(':'), inp = document.querySelector(`[data-sq="${ds.sellqty}"]`);
      const max = +inp.dataset.max, n = Math.max(1, Math.min(max, parseInt(inp.value, 10) || 1)); UI.sq[ds.sellqty] = n; inp.blur();
      queueTask({ a: 'sell', i: +ds.i, p: id, q: +q, n }); }
    else if (ds.rep) { const [ti, rid] = ds.rep.split(':'), b = S.tiles[+ti].b; b.rep = b.rep === rid ? null : rid; b.repN = null; b.repDone = 0; }
    else if (ds.auto) { const b = S.tiles[+ds.auto].b; b.auto = !b.auto; }
    else if (ds.fhAdd) { const i = +ds.i, st = { s: ds.fhAdd, i };
      if (st.s === 'tend') st.p = ($('#hcrop') || {}).value; if (st.s === 'station') st.p = ($('#hrec') || {}).value;
      if (S.helper && S.helper.steps.length < fhMax() && (st.p || !['tend', 'station'].includes(st.s))) { S.helper.steps.push(st); toast(`Farmhand job added: ${esc(stepLabel(st))}.`, 'info'); } }
    else if (ds.fhDel !== undefined) { S.helper.steps.splice(+ds.fhDel, 1); S.helper.cur = null; S.helper.k = 0; }
    else if (ds.fhUp !== undefined || ds.fhDown !== undefined) { const st = S.helper.steps, a = +(ds.fhUp !== undefined ? ds.fhUp : ds.fhDown), b = ds.fhUp !== undefined ? a - 1 : a + 1;
      if (b >= 0 && b < st.length) { [st[a], st[b]] = [st[b], st[a]]; S.helper.cur = null; S.helper.k = 0; } }
    else if (ds.fhSetspd) { S.helper.spd = +ds.fhSetspd; }
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
    else if ('bgpause' in ds) { S.bgPause = S.bgPause === false; save(); }
    else if (ds.idle !== undefined) { S.idleSec = +ds.idle; save(); }
    else if ('goPrivate' in ds) { if (!UI.goPrivate) { UI.goPrivate = true; clearTimeout(UI.goPrivT); UI.goPrivT = setTimeout(() => { UI.goPrivate = false; dirty(); }, 4000); }
      else { UI.goPrivate = false; S.mode = 'private'; save(); toast('<b>This farm is now private.</b> No leaderboard, no shared prices.', 'info'); } }
    else if ('weekly' in ds) { S.weekly = S.weekly === false; save(); }
    else if ('lbshow' in ds) { S.lbShow = S.lbShow === false; save(); sendScore(); }
    else if ('lbOpen' in ds) { closeTitle(); openBoard(); return; }
    else if ('lbRefresh' in ds) { openBoard(); return; }
    else if (ds.lbtab) { UI.lbTab = ds.lbtab; }
    else if (ds.kitview) { UI.kitView = ds.kitview; }
    else if ('lbClaim' in ds) { const v = (($('#lbname') || {}).value || '').trim(); claimName(v); return; }
    else if (ds.lbTake) { claimName(ds.lbTake); return; }
    else if ('lbEdit' in ds) { UI.lbEdit = true; UI.claim = null; if (UI.title) renderTitle(); }
    else if ('lbEditCancel' in ds) { UI.lbEdit = false; UI.claim = null; UI.lbDraft = null; if (UI.title) renderTitle(); }
    else if ('repay' in ds) { if (S.loan && S.gold >= S.loan.owed) repayLoan(false); else toast(`You need ${S.loan ? S.loan.owed : 0}g to repay the loan.`, 'warn'); }
    else if ('soundMute' in ds) { SND.unlock(); SND.set('mute', !SND.prefs.mute); }
    else if ('save' in ds) { save(); toast('Saved.', 'info'); }
    else if ('downloadSave' in ds) { downloadSave(); }
    else if ('shareSave' in ds) { shareSave(); return; }
    else if ('cloudBackup' in ds) { cloudBackup(true); return; }
    else if ('cloudAuto' in ds) { S.cloud.auto = S.cloud.auto === false; save(); }
    else if ('copyCloud' in ds) { const t = fmtCode(S.cloud.code), done = () => { UI.cloudCopied = true; dirty(); clearTimeout(UI.cloudCopiedT); UI.cloudCopiedT = setTimeout(() => { UI.cloudCopied = false; dirty(); }, 2500); };
      const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } ta.remove(); ok ? done() : toast(`Couldn’t copy automatically. Your code: <b>${t}</b>`, 'info'); };
      try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); } return; }
    else if ('raceOpen' in ds) { if (!S.race) save(); UI.drawer = null; UI.hadSave = true; UI.rerr = null; openTitle('race'); return; }
    else if ('qhelp' in ds) { UI.qhelp = !UI.qhelp; }
    else if ('mhelp' in ds) { UI.mhelp = !UI.mhelp; }
    else if ('pmore' in ds) { UI.pfull = !UI.pfull; dirty(); }
    else if ('dqPick' in ds) { UI.dqPick = !UI.dqPick; }
    else if ('dqHint' in ds) { dqHint(); }
    else if (ds.dqGive) { dqGive(ds.dqGive); }
    else if (ds.rexpN) { UI.rexpN = +ds.rexpN; }
    else if (ds.errand) { const [i, rid, n] = ds.errand.split(':'); sendErrand(+i, rid, +n); }
    else if ('qhelpPanel' in ds) { UI.qhelpP = !UI.qhelpP; }
    else if ('raceLeave' in ds) { UI.drawer = null; leaveRace(); return; }
    else if ('weeklyOpen' in ds) { if (!S.race) save(); UI.drawer = null; UI.hadSave = true; openWeekly(); return; }
    else if ('weekEnd' in ds) { UI.drawer = null; finishWeekly(); return; }
    else if ('pkeyMake' in ds) { makePlayerKey(); return; }
    else if ('copyPkey' in ds) { copyText(fmtCode(NET.pkey), () => { UI.pkCopied = true; dirty(); setTimeout(() => { UI.pkCopied = false; dirty(); }, 2500); }); return; }
    else if ('medalPlace' in ds) { UI.placeMedal = ds.medalPlace; UI.drawer = null; toast('Select any empty grass you own, then press <b>Place medal</b>.', 'info'); }
    else if ('medalPut' in ds) { const m = NET.medals.find(x => medalKey(x) === ds.medalPut), i = +ds.i;
      if (m && isEmptyGrass(i) && medalAt(m) === undefined) { T_(i).b = { type: 'medal', m: { week: m.week, place: m.place, score: m.score } }; UI.placeMedal = null; save(); SND.play('contract');
        float(i, `${MEDAL[m.place][0]} medal on show`, '#f6e27a'); } }
    else if ('medalAway' in ds) { const i = +ds.medalAway; if (T_(i).b && T_(i).b.type === 'medal') { T_(i).b = null; save(); toast('Medal put back in your trophy case (Menu → Medals).', 'info'); } }
    else if (ds.monAuto) { const id = ds.monAuto; S.monAuto = S.monAuto || {}; S.monAuto[id] = !S.monAuto[id]; if (!S.monAuto[id]) delete S.monAuto[id];
      toast(S.monAuto[id] ? `<b>Auto-give on</b> for ${esc(D.items[id].name)}. It goes to the monument by itself while there’s allowance left today.` : `Auto-give off for ${esc(D.items[id].name)}.`, 'info'); save(); dirty(); if (S.monAuto[id]) setTimeout(autoMonGive, 600); return; }
    else if (ds.monGive) { const inp = $('#mg-' + ds.monGive); monGive(ds.monGive, inp ? Math.max(1, parseInt(inp.value, 10) || 1) : 1); return; }
    else if ('monShow' in ds) { showGreen(); }
    else if (ds.greenMove) { moveGreen(ds.greenMove); }
    else if ('monHelp' in ds) { UI.monHelp = !UI.monHelp; }
    else if (ds.monPlace) { UI.placeMon = ds.monPlace; UI.drawer = null; UI.sel = -1; toast('Select any empty grass you own, then press <b>Place the model here</b>.', 'info'); }
    else if (ds.monPut) { const p = earnedModels().find(x => x.id === ds.monPut), i = +ds.i;
      if (p && isEmptyGrass(i) && modelAt(p.id) === undefined) { T_(i).b = { type: 'monument', m: { id: p.id, kind: p.kind } }; UI.placeMon = null; save(); SND.play('contract'); float(i, `${monShort(p.name)} model on show`, '#f6e27a'); } }
    else if ('monAway' in ds) { const i = +ds.monAway; if (T_(i).b && T_(i).b.type === 'monument') { T_(i).b = null; UI.sel = -1; save(); toast('Model put away. Place it again from the Monument Depot or Menu → Valley Monument.', 'info'); } }
    else if ('medalShow' in ds) { const i = +ds.medalShow; UI.drawer = null; UI.sel = i; centerOn(i); clampCam(); }
    else if ('farmsOpen' in ds) { save(); UI.drawer = null; UI.hadSave = true; UI.slotWipe = null; openTitle('slots'); return; }
    else if ('restoreOpen' in ds) { save(); UI.drawer = null; UI.hadSave = true; UI.rest = null; openTitle('restore'); return; }
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
    else if ('reset' in ds) { if (!UI.confirmReset) UI.confirmReset = true; else { try { localStorage.removeItem(saveKey()); } catch (e) { } newState(); migrate(); UI.yaw = 0; UI.yawTo = null; centerOn(homeIdx()); UI.sel = -1; UI.drawer = null; UI.confirmReset = false; toast('A fresh homestead. Good luck!', 'goal'); } }
    else if ('labels' in ds) toggleLabels();
    else if (ds.rot) rotateView(+ds.rot);
    else if (ds.zoom) { ds.zoom === 'home' ? (setView(UI.yaw, 1), centerOn(homeIdx())) : zoomAt(ds.zoom === 'in' ? 1.25 : .8, W / 2, H / 2); }
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
    if (e.target.dataset && e.target.dataset.repn) { const b = S.tiles[+e.target.dataset.repn].b; if (b) { const n = +e.target.value; b.repN = n > 0 ? n : null;
      if (b.repN && (b.repDone || 0) >= b.repN) { b.rep = null; b.repN = null; b.repDone = 0; toast('Already repeated that many times, so Repeat is off.', 'info'); } save(); dirty(); } return; }
    if (id === 'fert') { UI.fert = e.target.checked; dirty(); } else if (id === 'hcrop') UI.hcrop = e.target.value; else if (id === 'hrec') UI.hrec = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lbname') { claimName(e.target.value.trim()); return; } if (e.key === 'Enter' && e.target.dataset && e.target.dataset.mq) { const b = document.querySelector(`[data-mon-give="${e.target.dataset.mq}"]`); if (b) b.click(); return; } if (e.key === 'Enter' && e.target.dataset && e.target.dataset.sq) { const b = document.querySelector(`[data-sellqty="${e.target.dataset.sq}"]`); if (b) b.click(); } });
  document.addEventListener('input', e => {
    if (e.target.id === 'lbname') { UI.lbDraft = e.target.value; if (UI.claim && UI.claim.taken) UI.claim = null; return; }
    if (e.target.dataset && e.target.dataset.vol) { SND.unlock(); SND.set(e.target.dataset.vol, (+e.target.value) / 100); return; }
    if (e.target.id === 'impcode') { UI.importText = e.target.value; UI.confirmImport = false; UI.importData = null; UI.importErr = UI.importInfo = null;
      const v = e.target.value.trim();
      if (v) parseCode(v).then(o => { if (UI.importText !== e.target.value) return; UI.importData = o;
          UI.importInfo = `Found <b>${esc(o.name || 'Farmer')}</b>’s farm: day ${o.day}, ${o.gold}g, ${o.tiles.filter(t => t.o).length} tiles, score ${o.score}.`; showImportStatus(); })
        .catch(err => { if (UI.importText !== e.target.value) return; UI.importErr = err.message; showImportStatus(); });
      showImportStatus();
      return; } if (e.target.id === 'pname') { S.name = e.target.value.trim() || 'Farmer'; renderTop(); }
    if (e.target.dataset && e.target.dataset.mq) { UI.mq[e.target.dataset.mq] = Math.max(1, parseInt(e.target.value, 10) || 1); return; }
    const sq = e.target.dataset && e.target.dataset.sq; if (sq) { const max = +e.target.dataset.max, n = Math.max(1, Math.min(max, parseInt(e.target.value, 10) || 1));
      UI.sq[sq] = n; const out = document.querySelector(`[data-sqtotal="${sq}"]`); if (out) out.textContent = n * +e.target.dataset.price; } });
  function centerOn(i) { const [vx, vy] = view(tx(i), ty(i)); cam.u = isoU(vx, vy); cam.v = isoV(vx, vy); }

  /* ================= loop ================= */
  // The menu pauses the world (crops, stations, farmer, farmhand, clock) unless the player turns that off.
  // Idle pause: no tap, click, scroll or key for the chosen number of minutes.
  // seconds; older saves stored minutes in S.idlePause (anything longer than 2 min becomes 2 min)
  const IDLE_OPTS = [0, 5, 10, 15, 30, 120];
  const idleSecs = () => S.idleSec !== undefined ? S.idleSec : S.idlePause !== undefined ? (S.idlePause ? 120 : 0) : 120;
  const idleLabel = n => !n ? 'Never' : n < 60 ? n + ' sec' : (n / 60) + ' min';
  UI.lastInput = performance.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { UI.lastInput = performance.now(); if (UI.idle) { UI.idle = false; $('#idlebar').hidden = true; dirty(); } }, { capture: true, passive: true }));
  function checkIdle(now) { if (S.race || UI.idle || !idleSecs() || UI.title || UI.catchup) return;
    if (now - UI.lastInput > idleSecs() * 1000) { UI.idle = true; save(); const el = $('#idlebar'); el.innerHTML = `<span><b>Paused while you were away.</b> Tap anywhere or press any key to carry on.</span>`; el.hidden = false; dirty(); } }
  const paused = () => S.race ? !!UI.title : !!UI.title || UI.idle || (UI.drawer === 'menu' || UI.drawer === 'settings' || UI.drawer === 'lb') && S.menuPause !== false;
  let last = performance.now(), uiT = 0;
  /* catching up after time away: simulated in half-second steps, spread over a few frames so the page stays responsive */
  const CATCHUP_MAX = 2 * 3600, CATCHUP_STEP = .5, CATCHUP_PER_FRAME = 300;
  function startCatchUp(sec) { UI.catchup = { left: sec, total: sec, gold: S.gold }; }
  function tickCatchUp() { const c = UI.catchup; SND.quiet = !!c; if (!c) return;
    for (let k = 0; k < CATCHUP_PER_FRAME && c.left > 0; k++) { const d = Math.min(CATCHUP_STEP, c.left); update(d); c.left -= d; }
    UI.floats = []; dirty();
    if (c.left <= 0) { UI.catchup = null; const m = Math.round(c.total / 60), dg = S.gold - c.gold;
      toast(`<b>Welcome back.</b> Your farm kept working for ${m >= 1 ? m + ' min' : Math.round(c.total) + 's'} while you were away${dg ? ` (${dg > 0 ? '+' : '−'}${Math.abs(dg)}g)` : ''}.`, 'goal'); save(); } }
  function frame(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now;
    tickCatchUp(); SND.setHour(hour()); checkIdle(now); tickRace(dt);
    { const sc = (noSeasons() ? 'spring' : season().id) + '|' + wxNow() + '|' + raining(); if (sc !== UI.sndScene || (SND.ready && !UI.sndReady)) { UI.sndScene = sc; UI.sndReady = SND.ready; SND.setScene(...sc.split('|').map((v, k) => k === 2 ? v === 'true' : v)); } }
    if (UI.medalPend && !UI.title && !UI.catchup && !S.race) showMedal();
    else if (UI.monWelcome && !UI.title && !UI.catchup && !S.race) { UI.monWelcome = false; openTitle('monwelcome'); }
    else if (UI.monPend && !UI.title && !UI.catchup && !S.race) showMonStage();
    if (UI.pendingWeek && !UI.title && !UI.catchup) { UI.week = UI.pendingWeek; UI.pendingWeek = null; openTitle('week'); SND.play('day'); } if (!paused()) update(dt); tickYaw(dt); tickTicker(dt); tutTick();
    UI.floats.forEach(f => f.t += dt); UI.floats = UI.floats.filter(f => f.t < 1.6);
    UI.parts.forEach(q => q.t += dt); UI.parts = UI.parts.filter(q => q.t < 1);
    if (UI.cart && (UI.cart.t += dt) > 2.4) UI.cart = null;
    draw(); placePanel();
    uiT -= dt; if (UI.dirty || uiT <= 0) { renderUI(); UI.dirty = false; uiT = .5; }
    document.querySelectorAll('[data-prog]').forEach(el => { el.style.width = (Math.min(1, progress(el.dataset.prog)) * 100).toFixed(1) + '%'; });
    requestAnimationFrame(frame);
  }

  /* ================= update notice =================
     When hosted as static files, a newer build may go live while someone is playing. Every few minutes
     the game reads version.json next to it; if the build differs, a banner offers a reload. It never
     reloads on its own, and saving first means nothing is lost. Missing file or offline = silently skip. */
  const BUILD = '20261019-183903';
  async function checkForUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json(); if (!v || !v.build || !(v.build > BUILD)) return;   // ids are timestamps, so newer sorts later
      UI.newBuild = v.build;
      let later = null; try { later = sessionStorage.getItem('hw.later'); } catch (e) { }
      if (later !== v.build) $('#update').hidden = false;
    } catch (e) { /* not hosted, offline, or blocked: nothing to do */ }
  }
  document.addEventListener('click', e => {
    // Reload to an address that names the new build, so neither the browser nor GitHub's cache can hand back the old files.
    if (e.target.closest('[data-reload]')) { save(); try { sessionStorage.setItem('infinifarm.skipTitle', '1'); } catch (er) { }
      location.replace(location.pathname + '?v=' + encodeURIComponent(UI.newBuild || Date.now()) + location.hash); }
    else if (e.target.closest('[data-later]')) { $('#update').hidden = true; try { sessionStorage.setItem('hw.later', UI.newBuild || ''); } catch (er) { } }
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
    else throw new Error('That isn’t a Harvest Valley save code. It should start with HWZ1: or HW1:.');
    return validState(JSON.parse(json), 'The save code is damaged or incomplete. Copy it again in full.');
  }
  function validState(o, msg) {
    if (!o || o.v !== 1 || !Array.isArray(o.tiles) || o.tiles.length !== o.w * o.h || !o.inv) throw new Error(msg);
    return o;
  }
  // A save file is plain JSON: { format, saved, state }. Older save codes pasted into a .txt file also load.
  async function parseSaveText(text) {
    text = (text || '').trim();
    if (text.startsWith('{')) { let o; try { o = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a readable Harvest Valley save.'); }
      return validState(/^(harvestworks|infinifarm)-save$/.test(o.format) ? o.state : o, 'That file isn’t a Harvest Valley save, or it’s damaged.'); }
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(); UI.awayAt = Date.now(); return; }
      // Browsers stop the game in a background tab. With "keep running" on, make up the missed time on return.
      if (UI.awayAt && (S.bgPause === false || S.race) && !UI.title) { const sec = Math.min(CATCHUP_MAX, (Math.min(Date.now(), S.race && S.race.weekly ? S.race.end : Infinity) - UI.awayAt) / 1000); if (sec > 2) startCatchUp(sec); }
      UI.awayAt = null; });
    requestAnimationFrame(t => { last = t; frame(t); });
    setTimeout(checkForUpdate, 5000); setInterval(checkForUpdate, 120000);
    pullMarket(); setInterval(() => { if (document.hidden) pingPresence(); else pullMarket(); }, MARKET_EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (NET.at || 0) > 30000) pullMarket(); });
    let skip = false; try { skip = sessionStorage.getItem('infinifarm.skipTitle') === '1'; sessionStorage.removeItem('infinifarm.skipTitle'); } catch (e) { }
    if (!(snap && snap.tiles) && !skip) { let seen = false; try { seen = localStorage.getItem('infinifarm.seen') === '1'; } catch (e) { } openTitle(seen || UI.hadSave ? 'main' : 'splash'); }
    if (S.tut) startTut(S.tut.n);
    const rq = new URLSearchParams(location.search).get('race');
    if (rq) { try { history.replaceState(null, '', location.pathname); } catch (e) { } UI.rjoin = rq.toUpperCase(); UI.rerr = null; openTitle('race'); }
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
    if (t === 'splash') h = `<div class="tcard splash"><img class="tart" src="title-art.webp" alt=""><h1 class="vh">Welcome to Harvest Valley</h1>
        <p class="sub">Grow, craft and trade your way from one patch of dirt to a farm that never stops growing.</p>
        <button class="btn pri big" data-t="main" autofocus>Let’s go</button></div>`;
    else if (t === 'main') { const f = UI.tFile;
      h = `<div class="tcard main"><img class="tart" src="title-art.webp" alt=""><h1 class="vh">Harvest Valley</h1><div class="tmenu">
        ${UI.hadSave && !S.race ? `<button class="btn pri big" data-t="continue">Continue<small>${esc(S.name)}’s farm · ${MODES[S.mode || 'online'].name} · Day ${S.day} · ${S.gold}g</small></button>` : ''}
        <div class="modegrid">
          <button class="btn ${UI.hadSave ? '' : 'pri'} big" data-t="mode" data-m="online">Online Valley<small>Shared prices and the leaderboard</small></button>
          <button class="btn big" data-t="mode" data-m="private">Private farm<small>Just you, on your own time</small></button>
          <button class="btn big" data-t="race">Race<small>Race friends to a target score</small></button>
          <button class="btn big" data-t="weekly">Weekly challenge<small>${esc(weekTheme(weekOf(srvNow())).name)}</small></button></div>
        ${(() => { const o = weekRun(); return o && !o.race.done && Date.now() < o.race.end ? `<button class="btn pri big" data-t="wresume">Back to your weekly run<small>${esc(weekTheme(o.race.week).name)} · ${fmtTime(o.race.end - Date.now())} left</small></button>` : ''; })()}
        ${raceInfo() && load(RACE_KEY) ? `<button class="btn pri big" data-t="rresume">Back to your race<small>Race ${esc(raceInfo().code)} to ${raceInfo().target.toLocaleString()}</small></button>` : ''}
        ${UI.hadSave ? '<button class="btn ghost big" data-t="slots">All your farms<small>Switch farms or start a new one (3 slots)</small></button>' : ''}
        <button class="btn big" data-t="restore">Restore from a backup code<small>The 12-letter code from Menu → Cloud backup</small></button>
        <button class="btn big" data-t="load">Load a save file<small>A .json file downloaded from the Menu</small></button>
        <button class="btn ghost big" data-t="support">Show your support</button></div>
        ${f ? `<div class="tfile">${f.busy ? `<p class="hint">Reading ${esc(f.busy)}…</p>` : f.err ? `<p class="hint err">${esc(f.err)}</p>`
          : `<p class="hint"><b>${esc(f.name)}</b>: ${esc(f.o.name || 'Farmer')}’s farm, day ${f.o.day}, ${f.o.gold}g.${UI.hadSave ? ` This replaces ${esc(S.name)}’s farm in this browser.` : ''}</p>
             <div class="menu"><button class="btn pri" data-t="loadgo">Load this farm</button><button class="btn ghost" data-t="filecancel">Cancel</button></div>`}</div>` : ''}
        <p class="tver">v${esc(D.updates[0].v)}</p></div>`; }
    else if (t === 'race') { const busy = UI.rbusy, sel = UI.rtarget || 1000;
      h = `<div class="tcard"><h2>Race with friends</h2><p class="sub">Everyone starts the same head-start farm. First to the target score wins. Your own farm stays safe while you race.</p>
        <span class="eyebrow">Host a race</span><div class="chips">${RACE_TARGETS.map(([n, l]) => `<button class="chipf ${sel === n ? 'on' : ''}" data-t="rtarget" data-n="${n}">${l} · ${n.toLocaleString()}</button>`).join('')}</div>
        <div class="tmenu"><button class="btn pri big" data-t="rhost" ${busy ? 'disabled' : ''}>Host a race to ${sel.toLocaleString()} points</button></div>
        <span class="eyebrow">Join a race</span>
        <div class="fhrow"><input id="rjoin" maxlength="7" placeholder="Race code" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(UI.rjoin || '')}"><button class="btn sm" data-t="rjoin" ${busy ? 'disabled' : ''}>Join</button></div>
        ${UI.rerr ? `<p class="hint err">${esc(UI.rerr)}</p>` : busy ? '<p class="hint">Connecting…</p>' : ''}
        <p class="hint small">No pausing during a race, and races don’t change valley market prices or the leaderboard. Up to 8 farmers.</p>
        <div class="tmenu"><button class="btn ghost" data-t="main">Back</button></div></div>`; }
    else if (t === 'racelobby') { const L = UI.rl || { players: [] };
      h = `<div class="tcard"><span class="twel">Race to ${(L.target || 0).toLocaleString()} points</span><h2>Race code</h2><div class="racecode">${esc(L.code || '')}</div>
        <div class="tmenu"><button class="btn" data-t="rinvite">${UI.rcopied ? 'Invite link copied ✓' : 'Copy invite link'}</button></div>
        <span class="eyebrow">Farmers here (${L.players.length}/8)</span><ul class="rlist">${L.players.map(p => `<li>${esc(p.name)}${p.me ? ' <span class="you">you</span>' : ''}</li>`).join('')}</ul>
        ${L.host ? `<div class="tmenu"><button class="btn pri big" data-t="rstart">Start the race</button></div><p class="hint small">Everyone gets a 5-second countdown when you start.</p>` : '<p class="hint">Waiting for the host to start the race…</p>'}
        ${UI.rerr ? `<p class="hint err">${esc(UI.rerr)}</p>` : ''}
        <div class="tmenu"><button class="btn ghost" data-t="rleave">Leave</button></div></div>`; }
    else if (t === 'racego') { const R = S.race || {};
      h = `<div class="tcard"><span class="twel">Race ${esc(R.code || '')} · first to ${(R.target || 0).toLocaleString()}</span><h2>Get ready…</h2><div class="racecount" id="rcount">5</div>
        <span class="eyebrow">This race’s head start (the same for everyone)</span><p class="sub">${esc((R.kit || []).join(' · '))}</p>
        <p class="hint small">Score comes from harvests, crafting, sales, orders and contracts. Not every offer is worth taking.</p></div>`; }
    else if (t === 'raceend') { const R = S.race || {}, L = UI.rl || { players: [] };
      h = `<div class="tcard"><span class="twel">Race ${esc(R.code || '')}</span><h2>You reached ${(R.target || 0).toLocaleString()} in ${fmtTime(R.time)}!</h2>
        <ol class="rresults">${L.players.map(p => `<li class="${p.me ? 'me' : ''}"><b>${esc(p.name)}</b><span>${p.finished_ms != null ? fmtTime(p.finished_ms) : p.score.toLocaleString() + ' pts, still racing'}</span></li>`).join('')}</ol>
        <div class="tmenu"><button class="btn pri big" data-t="rhome">Back to my farm</button><button class="btn big" data-t="continue">Keep playing this race farm</button></div></div>`; }
    else if (t === 'weekly') { const W = UI.wk || {}, wk = W.week != null ? W.week : weekOf(srvNow()), th = weekTheme(wk), o = weekRun(), live = o && !o.race.done && Date.now() < o.race.end;
      const rows = (W.top || []).slice(0, 10).map(p => `<li class="${p.me ? 'me' : ''}"><b>${esc(p.name)}</b><span>${p.score.toLocaleString()}</span></li>`).join('');
      const nextDay = (() => { const n = new Date(srvNow()); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - srvNow(); })();
      h = `<div class="tcard"><span class="twel">Weekly challenge · ${weekLabel(wk)}</span><h2>${esc(th.name)}</h2><p class="sub">${esc(th.blurb)}</p>
        <p class="hint small">Everyone gets the same head start this week. One ranked ${runMins(wk)}-minute run a day, no pausing; your best run counts. The top three win medals when the week closes${W.ends_at ? `, in ${fmtLeft(Date.parse(W.ends_at) - Date.parse(W.now))}` : ''}.</p>
        ${W.loading ? '<p class="hint">Loading this week’s board…</p>' : W.off ? '<p class="hint err">The weekly challenge needs the shared valley connection. Play the web version: zcgrimshaw.github.io/harvestwork</p>'
          : `<span class="eyebrow">This week’s best${W.players ? ` · ${W.players} farmer${W.players === 1 ? '' : 's'}` : ''}</span>${rows ? `<ol class="rresults wboard">${rows}</ol>` : '<p class="hint">No ranked runs yet this week. Be the first!</p>'}
            ${W.mine && W.mine.rank > 10 ? `<p class="hint">You: #${W.mine.rank} with ${W.mine.score.toLocaleString()}.</p>` : ''}
            ${(W.last || []).length ? `<span class="eyebrow">Last week’s medals</span><div class="wlast">${W.last.map(m => `<span><img src="${medalImg(m.place)}" alt="">${esc(m.name)} · ${m.score.toLocaleString()}</span>`).join('')}</div>` : ''}
            <div class="tmenu">${live ? `<button class="btn pri big" data-t="wresume">Back to your run<small>${fmtTime(o.race.end - Date.now())} left</small></button>` : ''}
            ${W.used_today ? `<button class="btn ${live ? '' : 'pri'} big" data-t="wpractice" ${UI.wbusy ? 'disabled' : ''}>Practice run<small>Doesn’t count. Your next ranked run opens in ${fmtLeft(nextDay)}</small></button>`
              : `<button class="btn ${live ? '' : 'pri'} big" data-t="wstart" ${UI.wbusy ? 'disabled' : ''}>${UI.wbusy ? 'Starting…' : 'Start today’s ranked run'}<small>${runMins(wk)} minutes on the clock after a 5-second countdown. Your own farms stay safe.</small></button>`}</div>`}
        ${W.off || W.loading ? '' : `<span class="eyebrow">Playing as</span><div class="opts tname">${nameHTML()}</div>`}
        ${UI.werr ? `<p class="hint err">${esc(UI.werr)}</p>` : ''}
        <div class="tmenu"><button class="btn ghost" data-t="main">Back</button></div></div>`; }
    else if (t === 'weeklygo') { const R = S.race || {}, th = weekTheme(R.week);
      h = `<div class="tcard"><span class="twel">${R.ranked ? 'Ranked run' : 'Practice run'} · ${weekLabel(R.week)}</span><h2>${esc(th.name)}</h2><div class="racecount" id="rcount">5</div>
        <p class="sub">${esc(th.blurb)}</p><span class="eyebrow">This week’s head start (the same for everyone)</span><p class="sub">${esc((R.kit || []).join(' · '))}</p>
        <p class="hint small">${runMins(R.week)} minutes. Score comes from harvests, crafting, sales, orders and contracts; this week’s bonus makes some worth much more.</p></div>`; }
    else if (t === 'weeklyend') { const R = S.race || {}, W = UI.wk || {}, th = weekTheme(R.week);
      h = `<div class="tcard"><span class="twel">${esc(th.name)} · ${weekLabel(R.week)}</span><h2>Time! ${(R.final || 0).toLocaleString()} points</h2>
        <p class="sub">${R.ranked ? (W.mine ? `Your best this week is <b>${W.mine.score.toLocaleString()}</b>, #${W.mine.rank} of ${W.players}. ${W.mine.rank <= 3 ? 'Medal position! Hold on to it until the week closes.' : 'The top three win medals when the week closes.'}` : 'Your ranked score is in.') : 'Practice run: this one doesn’t count, but it’s the same farm everyone gets this week.'}</p>
        ${(W.top || []).length ? `<ol class="rresults wboard">${W.top.slice(0, 5).map(p => `<li class="${p.me ? 'me' : ''}"><b>${esc(p.name)}</b><span>${p.score.toLocaleString()}</span></li>`).join('')}</ol>` : ''}
        <div class="tmenu"><button class="btn pri big" data-t="wleave">Back to my farm</button><button class="btn big" data-t="weekly">This week’s board</button></div></div>`; }
    else if (t === 'monwelcome' && MONK()) { const m = MONK(), K = monKind(m), st = monTotals(m).stage;
      h = `<div class="tcard moncard"><span class="twel">New in the valley</span><img class="monheroimg" src="${ART.monPic(m.kind, st)}" alt="">
        <h2>The valley is building ${esc(m.name)}!</h2><p class="sub">Every online farm builds it together. A <b>Valley Green</b> has opened at a corner of your land, with the monument at full size and a <b>Monument Depot</b> where you give goods.</p>
        <div class="monstrip">${[0, 1, 2, 3, 4].map(k => `<span class="${k <= st ? 'on' : ''}"><img src="${ART.monPic(m.kind, k)}" alt=""><small>${k ? k * 25 + '%' : 'Start'}</small></span>`).join('')}</div>
        <ul class="monpts"><li><b>Four stages.</b> It rises at 25, 50, 75 and 100%. Each phase asks for different goods: ${esc(nmList(m.phases.map(p => (p.short || p.name).toLowerCase())))}.</li>
          <li><b>Points.</b> Finer goods count for more. You can give up to ${m.cap.toLocaleString()} points a day, so every farm gets a share of the work.</li>
          <li><b>Rewards.</b> No gold, but a model of ${esc(K.name)} for your farm (from ${m.keep_min.toLocaleString()} points), +1 Discovery for your first gift in each phase, and +2 when it’s finished.</li></ul>
        <div class="tmenu"><button class="btn pri big" data-t="monshow">Show me the Valley Green</button><button class="btn big" data-t="continue">Later<small>Homestead → Valley Monument, any time</small></button></div></div>`; }
    else if (t === 'monstage' && MONK()) { const m = MONK(), K = monKind(m), st = UI.monShow.stage, n = m.phases.length, nx = m.phases[st];
      h = `<div class="tcard moncard"><span class="twel">${esc(m.name)} · stage ${st} of ${n}</span><img class="monheroimg" src="${ART.monPic(m.kind, st)}" alt="">
        <h2>${st >= n ? `${esc(m.name)} is finished!` : `${esc(m.name)} reached ${esc(K.stages[st])}!`}</h2><p class="sub">${esc(K.stageText[st])} ${m.mine > 0 ? `You’ve given ${m.mine.toLocaleString()} points. Thank you!` : 'Lend a hand at the Monument Depot.'}</p>
        ${nx ? `<p class="hint">Next phase: <b>${esc(nx.name)}</b>${nx.blurb ? `. ${esc(nx.blurb)}` : ''}</p>` : `<p class="hint">It stays on your Valley Green for good.${m.mine > 0 ? ' +2 Discovery for helping finish it.' : ''}</p>`}
        <div class="tmenu">${S.green ? '<button class="btn pri big" data-t="monshow">See it on the Valley Green</button>' : ''}<button class="btn big" data-t="continue">Continue</button></div></div>`; }
    else if (t === 'medal') { const m = UI.medalShow;
      h = `<div class="tcard medalcard"><span class="twel">Weekly Challenge · ${weekLabel(m.week)}</span><img class="medalhero" src="${medalImg(m.place)}" alt="">
        <h2>You won a ${MEDAL[m.place][0].toLowerCase()} medal!</h2><p class="sub">${MEDAL[m.place][1]}, with ${m.score.toLocaleString()} points in ${esc(weekTheme(m.week).name)}.</p>
        <div class="tmenu">${UI.hadSave && !S.race ? `<button class="btn pri big" data-t="medalplace">Put it on show on this farm</button>` : ''}<button class="btn big" data-t="continue">Keep it in my trophy case<small>Menu → Medals, any time</small></button></div></div>`; }
    else if (t === 'slots') {
      const fm = UI.slotMode;
      h = `<div class="tcard"><h2>${fm ? MODES[fm].name : 'Your farms'}</h2><p class="sub">${fm ? esc(MODES[fm].blurb) + '. Pick a farm to play, or start one in an empty slot.' : 'Three farms can live side by side in this browser. Each keeps its own land, progress and backups.'}</p><div class="slots">${
        [0, 1, 2].map(k => { const f = k === SLOT && UI.hadSave && !S.race ? { name: S.name, day: S.day, gold: S.gold, score: Math.floor(S.score), mode: S.mode } : slotInfo(k), cur = k === SLOT && UI.hadSave && !S.race;
          const other = f && fm && (f.mode || 'online') !== fm;
          return `<div class="slot ${cur ? 'cur' : ''} ${other ? 'other' : ''}"><div class="grow1"><span class="eyebrow">Farm ${k + 1}${cur ? ' · playing now' : ''}</span>${f ? `<b>${esc(f.name)}’s farm <span class="mbadge ${f.mode || 'online'}">${(f.mode || 'online') === 'private' ? 'Private' : 'Online'}</span></b><small>Day ${f.day} · ${f.gold}g · score ${f.score}</small>` : '<b class="muted">Empty</b>'}</div>
            <div class="slotbtns">${f ? `${cur ? (fm && !other ? `<button class="btn pri sm" data-t="continue">Keep playing</button>` : '') : `<button class="btn ${other ? 'ghost' : 'pri'} sm" data-t="slotplay" data-k="${k}">Play</button>`}<button class="btn ${UI.slotWipe === k ? 'danger' : 'ghost'} sm" data-t="slotnew" data-k="${k}">${UI.slotWipe === k ? 'Tap again to replace' : 'New farm here'}</button>`
              : `<button class="btn pri sm" data-t="slotnew" data-k="${k}">${fm ? `Start ${fm === 'private' ? 'a private' : 'an Online Valley'} farm` : 'Start a farm here'}</button>`}</div></div>`; }).join('')}</div>
        <p class="hint small">Starting a new farm in a slot that has one replaces it. Download a save file or note its backup code first if you might want it back.</p>
        <div class="tmenu"><button class="btn ghost" data-t="main">Back</button></div></div>`; }
    else if (t === 'confirm') h = `<div class="tcard"><h2>Start a new farm?</h2>
        <p class="sub">This replaces <b>${esc(S.name)}’s farm</b> (day ${S.day}, ${S.gold}g) in this browser. Download a save file first if you might want it back.</p>
        <div class="tmenu"><button class="btn big" data-t="dl">Download save file</button><button class="btn danger big" data-t="name">Replace it and start fresh</button>${back}</div></div>`;
    else if (t === 'name') { const first = firstOnline(); h = `<div class="tcard"><h2>${first ? 'What’s your name?' : 'Name your farmer'}</h2>
        <label class="field tname">${first ? 'Your name' : 'Name'} <input id="tname" maxlength="14" placeholder="${first ? 'Pick a name' : 'Farmer'}" autocomplete="off" value="${esc(UI.tnameDraft || '')}"></label>
        ${first ? `<p class="hint small ${UI.nameErr ? 'err' : ''}">${UI.nameErr ? 'Please type a name to play in the Online Valley. ' : ''}It’s locked to you, so no one else in the valley can use it. It shows on the leaderboard, in the weekly challenge and on your medals, on every farm you play. If it’s taken you’ll get the next free number (Name1, Name2…).</p>` : ''}
        <div class="modepick">${['online', 'private'].map(m => `<button class="modeopt ${(UI.newMode || 'online') === m ? 'on' : ''}" data-t="pickmode" data-m="${m}"><b>${MODES[m].name}</b><small>${MODES[m].blurb}</small></button>`).join('')}</div>
        <div class="tmenu"><button class="btn pri big" data-t="go-tut">Start with a quick tutorial<small>About two minutes. Skip any time.</small></button>
        <button class="btn big" data-t="go">Start without the tutorial</button>${back}</div></div>`; }
    else if (t === 'support') h = `<div class="tcard">${supportHTML()}<div class="tmenu">${back}</div></div>`;
    else if (t === 'restore') { const R = UI.rest || {};
      const slotPick = (o, act) => `<span class="eyebrow">Load it into</span><div class="slots">${[0, 1, 2].map(k => { const f = k === SLOT && UI.hadSave && !S.race ? { name: S.name, day: S.day } : slotInfo(k);
          return `<button class="btn ${f ? (UI.restWipe === k ? 'danger' : 'ghost') : 'pri'} sm" data-t="${act}" data-k="${k}">${UI.restWipe === k ? 'Tap again to replace' : `Farm ${k + 1}`}<small>${f ? `Replaces ${esc(f.name)}’s farm (day ${f.day})` : 'Empty'}</small></button>`; }).join('')}</div>`;
      h = `<div class="tcard"><h2>Restore from a code</h2>
        <p class="sub">Type a farm’s 12-letter backup code (Menu → Cloud backup) or your player key (Menu → Player key).</p>
        <label class="field tname">Code <input id="rcode" maxlength="16" placeholder="ABCD-EFGH-JKMN" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(R.code ? fmtCode(R.code) : '')}"></label>
        ${R.err ? `<p class="hint err">${esc(R.err)}</p>` : ''}
        ${R.o ? `<p class="hint">Found <b>${esc(R.o.name || 'Farmer')}’s farm</b>: day ${R.o.day}, ${R.o.gold}g, score ${Math.floor(R.o.score)}.</p>${slotPick(R.o, 'restorego')}`
        : R.pk ? `<p class="hint">That’s a <b>player key</b>${R.pk.name ? ` for <b>${esc(R.pk.name)}</b>` : ''}: ${R.pk.medals} medal${R.pk.medals === 1 ? '' : 's'}, ${R.pk.farms.length} backed-up farm${R.pk.farms.length === 1 ? '' : 's'}.</p>
          ${R.used || R.pk.player === PLAYER ? '<p class="state">✓ This device now plays as you: your name and medals are here.</p>' : `<div class="tmenu"><button class="btn pri big" data-t="pkeyuse">Play as this player on this device<small>Brings your locked name and medals here${NET.myName && NET.myName !== R.pk.name ? `, replacing ${esc(NET.myName)} on this device` : ''}</small></button></div>`}
          ${R.pk.farms.length ? `<span class="eyebrow">Your backed-up farms</span><div class="slots">${R.pk.farms.map(f => `<div class="slot"><div class="grow1"><b>${esc(f.name || 'Farmer')}’s farm</b><small>Day ${f.day} · backed up ${new Date(f.saved).toLocaleDateString()}</small></div><div class="slotbtns"><button class="btn sm" data-t="pkfarm" data-c="${esc(f.code)}">Restore</button></div></div>`).join('')}</div>` : ''}` : `<div class="tmenu"><button class="btn pri big" data-t="restorefind" ${R.busy ? 'disabled' : ''}>${R.busy ? 'Looking…' : 'Find my farm'}</button></div>`}
        <div class="tmenu"><button class="btn ghost" data-t="main">Back</button></div></div>`; }
    else if (t === 'week') { const r = UI.week, sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
      const stat = (label, val) => `<div class="wstat"><b>${val}</b><span>${label}</span></div>`;
      const top = r.made.slice(0, 4).map(([k, n]) => `<span class="wmade">${ico(k)} ${n} ${esc(D.items[k].name)}</span>`).join('');
      const m = curMs();
      h = `<div class="tcard week"><span class="twel">Week ${r.n} · days ${r.from}–${r.to}</span><h2>${esc(S.name)}’s week on the farm</h2>
        <div class="wgrid">${stat('gold', sg(r.gold) + 'g')}${stat('score', sg(r.score))}${stat('Discovery earned', sg(Math.max(0, r.dp)))}${stat('sales', r.sold + 'g')}${stat('harvested', r.harvest)}${stat('orders filled', r.orders + r.ms)}</div>
        ${top ? `<span class="eyebrow">Made this week</span><div class="wmades">${top}</div>` : ''}
        <p class="sub">${[r.tiles > 0 ? `You claimed ${r.tiles} new tile${r.tiles === 1 ? '' : 's'}.` : '', r.built > 0 ? `You built ${r.built} new building${r.built === 1 ? '' : 's'}.` : '', r.ms > 0 ? `${r.ms} contract${r.ms === 1 ? '' : 's'} done.` : ''].filter(Boolean).join(' ') || 'A quiet week.'}${m ? ` Next contract: <b>${esc(m.name)}</b>.` : ''}</p>
        <div class="tmenu"><button class="btn pri big" data-t="continue">Back to the farm</button>${online() ? '<button class="btn big" data-lb-open>See the leaderboard</button>' : ''}</div>
        <button class="linkish small" data-t="weekoff">Turn off weekly reports</button></div>`; }
    else if (t === 'loan') h = `<div class="tcard"><h2>Wow, you really did yourself in…</h2>
        <p class="sub">No gold for seeds, nothing to sell, and no work left that brings in goods. The valley bank is lending you <b>${LOAN.amount}g</b> to get going again.</p>
        <p class="sub">It must be paid back. It comes out of your gold automatically once you have ${LOAN.auto}g, or tap <b>Loan</b> in the top bar to repay early. Get stuck again before it’s paid back and that’s the end of this farm.</p>
        <div class="tmenu"><button class="btn pri big" data-t="continue">Take the ${LOAN.amount}g and carry on</button></div></div>`;
    else if (t === 'over') h = `<div class="tcard"><h2>You need to revisit your choices in this game.</h2>
        <p class="sub">Out of gold, goods and work again, with the valley bank still waiting on its ${S.loan ? S.loan.owed : LOAN.amount}g. This farm has run its course. Thanks for playing!</p>
        <div class="tmenu"><button class="btn pri big" data-t="name">Start a new farm</button><button class="btn big" data-t="look">Look at my farm</button></div></div>`;
    titleEl.className = 'title-' + t; titleEl.innerHTML = h; titleEl.hidden = false;
    const inp = $('#tname'); if (inp) inp.focus();
  }
  // Your first Online Valley farm asks for a name and locks it to this player (a taken name gets the next free number).
  const firstOnline = () => (UI.newMode || 'online') !== 'private' && !NET.myName;
  async function lockFirstName(name) {
    await claimName(name); const c = UI.claim || {};
    if (c.taken && c.suggestion) { await claimName(c.suggestion);
      if (UI.claim && UI.claim.done) toast(`<b>${esc(name)} was already taken</b>, so you’re <b>${esc(UI.claim.done)}</b> in the valley.`, 'info'); }
    if (NET.myName && S && S.name !== NET.myName && online()) { S.name = NET.myName; save(); dirty(); } }
  function startNewFarm(name, tut) {
    const lock = (UI.newMode || 'online') !== 'private' && !NET.myName && name;
    if (UI.newSlot != null) { if (!S.race) save(); setSlot(UI.newSlot); UI.newSlot = null; }
    if (S.race) { if (!S.race.weekly) try { localStorage.removeItem(RINFO); localStorage.removeItem(RACE_KEY); } catch (e) { } S.race = null; }
    try { localStorage.removeItem(saveKey()); } catch (e) { }
    newState(); S.mode = UI.newMode || 'online'; migrate(); S.name = name || 'Farmer'; S.seenUpdate = latest().v; UI.tnameDraft = '';
    UI.yaw = 0; UI.yawTo = null; UI.tilt = 1; setView(0, 1); centerOn(homeIdx()); UI.sel = -1; UI.drawer = null; UI.html = {}; UI.logOpen = null;
    UI.hadSave = true; closeTitle(); save();
    if (tut) startTut(); else toast(`<b>Welcome to Harvest Valley, ${esc(S.name)}.</b> Follow the goal card at the top left to get your homestead going.`, 'goal');
    if (lock) lockFirstName(name);
  }
  titleEl.addEventListener('click', e => {
    const el = e.target.closest('[data-t]'); if (!el) return; const a = el.dataset.t;
    if (a === 'main') { UI.newSlot = null; openTitle('main'); }
    else if (a === 'continue') closeTitle();
    else if (a === 'monshow') { closeTitle(); showGreen(); }
    else if (a === 'race') { UI.rerr = null; openTitle('race'); }
    else if (a === 'rtarget') { UI.rtarget = +el.dataset.n; renderTitle(); }
    else if (a === 'rhost') hostRace(UI.rtarget || 1000);
    else if (a === 'rjoin') joinRace(($('#rjoin') || {}).value);
    else if (a === 'rstart') startRace();
    else if (a === 'rleave') leaveLobby();
    else if (a === 'rinvite') { const t = inviteLink(UI.rl.code), done = () => { UI.rcopied = true; renderTitle(); setTimeout(() => { UI.rcopied = false; if (UI.title === 'racelobby') renderTitle(); }, 2500); };
      try { navigator.clipboard.writeText(t).then(done, () => toast(`Invite link: ${esc(t)}`, 'info')); } catch (e) { toast(`Invite link: ${esc(t)}`, 'info'); } }
    else if (a === 'rhome') leaveRace();
    else if (a === 'rresume') { if (!resumeRace()) { try { localStorage.removeItem(RINFO); } catch (e) { } renderTitle(); } }
    else if (a === 'slots') { UI.slotWipe = null; UI.slotMode = null; openTitle(UI.hadSave ? 'slots' : 'name'); }
    else if (a === 'mode') { UI.slotWipe = null; UI.slotMode = el.dataset.m; UI.newMode = el.dataset.m;
      if (!UI.hadSave && ![0, 1, 2].some(k => slotInfo(k))) { openTitle('name'); return; } openTitle('slots'); }
    else if (a === 'slotplay') { const k = +el.dataset.k, o = load(SLOT_KEYS[k]); if (!o) return; if (!S.race) save(); setSlot(k); adoptState(o); UI.hadSave = true; closeTitle(); toast(`<b>Welcome back, ${esc(S.name)}.</b> Day ${S.day}, ${S.gold}g.`, 'goal'); }
    else if (a === 'slotnew') { const k = +el.dataset.k, f = slotInfo(k) || (k === SLOT && UI.hadSave);
      if (f && UI.slotWipe !== k) { UI.slotWipe = k; renderTitle(); return; } UI.slotWipe = null; UI.newSlot = k; UI.newMode = UI.slotMode || UI.newMode || 'online'; openTitle('name'); }
    else if (a === 'restore') { UI.rest = null; UI.restWipe = null; openTitle('restore'); }
    else if (a === 'restorefind') findBackup(($('#rcode') || {}).value);
    else if (a === 'weekly') openWeekly();
    else if (a === 'wstart') startWeekly(false);
    else if (a === 'wpractice') startWeekly(true);
    else if (a === 'wleave') leaveWeekly();
    else if (a === 'wresume') { if (S.race && S.race.weekly && !S.race.done) { if (Date.now() >= S.race.end) finishWeekly(); else closeTitle(); } else if (!resumeWeekly()) renderTitle(); }
    else if (a === 'medalplace') { UI.placeMedal = medalKey(UI.medalShow); closeTitle(); toast('Select any empty grass you own, then press <b>Place medal here</b>.', 'info'); }
    else if (a === 'pkeyuse' && UI.rest && UI.rest.pk) { usePlayerKey(UI.rest.code, UI.rest.pk); UI.rest.used = true; renderTitle(); toast(`<b>Welcome back${UI.rest.pk.name ? ', ' + esc(UI.rest.pk.name) : ''}.</b> This device now plays as you.`, 'goal'); }
    else if (a === 'pkfarm') { UI.restWipe = null; findBackup(el.dataset.c); }
    else if (a === 'restorego' && UI.rest && UI.rest.o) { const k = +el.dataset.k, f = k === SLOT && UI.hadSave && !S.race ? true : slotInfo(k);
      if (f && UI.restWipe !== k) { UI.restWipe = k; renderTitle(); return; } UI.restWipe = null;
      if (!S.race && UI.hadSave) save(); if (S.race) S.race = null; setSlot(k);
      const code = UI.rest.code; adoptState(UI.rest.o); S.cloud = Object.assign({}, S.cloud || {}, { code, at: Date.now(), auto: S.cloud ? S.cloud.auto : true }); save();
      UI.hadSave = true; UI.rest = null; closeTitle(); toast(`<b>Farm restored.</b> Welcome back, ${esc(S.name)}: day ${S.day}, ${S.gold}g. It keeps backing up to the same code.`, 'goal'); logAct('Restored this farm from a cloud backup', 'you'); }
    else if (a === 'weekoff') { S.weekly = false; save(); closeTitle(); toast('Weekly reports are off. Turn them back on in Menu → Settings.', 'info'); }
    else if (a === 'look') { closeTitle(); toast('Your farm is out of options. Start a new one any time from Menu → Start a new farm.', 'info'); }
    else if (a === 'new') openTitle(UI.hadSave ? 'confirm' : 'name');
    else if (a === 'name') openTitle('name');
    else if (a === 'dl') downloadSave();
    else if (a === 'support') openTitle('support');
    else if (a === 'load') { fileIn.value = ''; fileIn.click(); }
    else if (a === 'filecancel') { UI.tFile = null; renderTitle(); }
    else if (a === 'loadgo' && UI.tFile && UI.tFile.o) { const o = UI.tFile.o; adoptState(o); UI.hadSave = true; closeTitle();
      toast(`<b>Farm loaded.</b> Welcome back, ${esc(S.name)}: day ${S.day}, ${S.gold}g.`, 'goal'); logAct('Loaded this farm from a save file', 'you'); }
    else if (a === 'pickmode') { UI.tnameDraft = ($('#tname') || {}).value || ''; UI.newMode = el.dataset.m; renderTitle(); }
    else if (a === 'go' || a === 'go-tut') { const n = (($('#tname') || {}).value || '').trim();
      if (firstOnline() && !n) { UI.nameErr = true; UI.tnameDraft = ''; renderTitle(); const f = $('#tname'); if (f) f.focus(); return; }
      UI.nameErr = false; startNewFarm(n, a === 'go-tut'); }
  });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'rjoin') { e.preventDefault(); joinRace(e.target.value); } });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'rcode') { e.preventDefault(); findBackup(e.target.value); } });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tname') { e.preventDefault(); startNewFarm(e.target.value.trim(), true); } });

  /* ================= tutorial =================
     A short hands-on coach: each step waits for the player to actually do the thing, then moves on.
     Gameplay beyond planting is handed to the goal card, which already walks through it. */
  const farmIdx = () => { const f = D.map.structures.find(st => st[0] === 'farm'); return idx(f[1] + startOff(), f[2] + startOff()); };
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

  // Browsers only allow sound after the player interacts, so the audio starts on the first tap or key.
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => SND.unlock(), { capture: true }));
  document.addEventListener('click', e => { if (e.target.closest('button, a.btn')) SND.play('tap'); }, true);
  window.HW = { daily: { make: d => dqMake(d), today: () => dqToday(), give: id => dqGive(id), hint: () => dqHint(), graph: () => dqGraph(), streak: () => dqStreak() }, cap: () => cap(), mast: { tier: id => mastTier(id), need: (id, t) => mastNeed(id, t), perk: (id, k) => mastPerk(id, k), add: (id, n) => mastAdd(id, n), get n() { return S.mast || {}; } }, info: id => infoHTML(id), genOrder: () => genOrder(), canGood: id => canGood(id), weekTest(w) { newState(); migrate(); S.race = { weekly: true, week: w, code: 'W' + w, target: 0, start: 0, end: 0, seen: {} }; weeklyPreset(w); return S; }, weekTheme: w => weekTheme(w).id, weekLabel: w => weekLabel(w), raceTest(code) { newState(); migrate(); S.race = { code, target: 500, start: 0, seen: {} }; racePreset(code); return S; }, get state() { return S; }, select(i) { UI.sel = i; dirty(); }, focus(i) { centerOn(i); clampCam(); }, screenOf(i) { const [x, y] = toScreen(tx(i), ty(i)); return [x / DPR, y / DPR]; }, get sel() { return UI.sel; }, season: () => ({ id: season().id, day: seasonDay(), year: yearOf(), wx: wxNow(), rain: raining(), scene: sceneKey(), grow: c => seasonGrow(c) }), weatherOn: d => weatherOn(d), sellPrice: (id, q) => sellPrice(id, q || 0), rollMarket: () => rollMarket(), drawer(d) { UI.drawer = d; dirty(); }, mon: { age: () => { NET.monAt = 0; }, flush: () => flushTrades(), auto: () => autoMonGive(), builder: () => builderDay(), set: r => setMon(r), get: () => NET.mon, totals: m => monTotals(m || MONK()), give: (id, n) => monGive(id, n), notices: () => notices(), show: () => showGreen(), get green() { return S.green; } }, TASKS, checkTask, queueTask, update, newState: () => newState() };
  const h = window.claude && window.claude.hot;
  if (h && h.ready) h.ready(d => boot(d)); else boot(h && h.data);
})();
