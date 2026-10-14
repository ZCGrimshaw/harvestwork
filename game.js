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
               floats: [], parts: [], labels: false, sq: {}, hcrop: null, hrec: null, dirty: true, saveIn: 8, savedAt: 0, html: {}, goalsOpen: true, smokeT: 0 };
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
    if (D.gather[t] && D.gather[t].stock) return { stock: D.gather[t].stock, rt: 0 };
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
  const surveyable = r => r >= 0 && S.regions[r] && !S.regions[r].open && regionNbrs(r).some(n => S.regions[n].open);
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
    if (n >= V.roofFrom) c.roof_tile = V.roof + V.roofStep * (n - V.roofFrom);
    return c; }
  const homeIdx = () => S.tiles.findIndex(T => T.b && T.b.type === 'homestead');
  const startOff = () => (S.w - D.map.rows[0].length) / 2;
  // Bring older saves up to date: new fields get defaults, nothing existing changes.
  function migrate() {
    S.tools = Object.assign(Object.fromEntries(Object.keys(D.tools).map(k => [k, 0])), S.tools || {});
    if (S.helper === undefined) S.helper = null;
    if (!S.log) S.log = [];
    if (!S.tick) S.tick = { open: true, spd: 'slow' };
    if (!S.wk) weekStart();
    if (!S.mode) S.mode = 'online'; // farms from before modes existed were all part of the valley
    if (!S.fid) S.fid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
    expandWorld(); UI.live = null;
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
  // every ingredient of a price, with what you have: ✓ when covered, the shortfall when not
  function costList(cost) {
    return `<ul class="costlist">${Object.entries(cost).map(([k, n]) => { const have = k === 'gold' ? S.gold : count(k), ok = have >= n;
      return `<li class="${ok ? 'ok' : 'short'}">${k === 'gold' ? '<span class="coin"></span>' : ico(k)}<b>${n}${k === 'gold' ? 'g' : ' ' + esc(D.items[k].name)}</b><span>${ok ? '✓ have ' + have : `have ${have}, need ${n - have} more`}</span></li>`; }).join('')}</ul>`; }
  function costTxt(cost) { return Object.entries(cost).map(([k, n]) => k === 'gold' ? `${n}g` : `${n} ${D.items[k].name}`).join(' + ') || 'Free'; }
  // Seeds and supplies sell back for half their market price.
  const baseValue = id => D.items[id].value || Math.max(1, Math.floor((D.items[id].buy || 2) / 2));
  function sellPrice(id, q) { const d = S.market.demand; return Math.max(1, Math.round(baseValue(id) * QM[q] * (d && d.item === id ? 1 + d.pct / 100 : 1) * mult(id) * wrule('sell', 1))); }

  /* ================= progression ================= */
  /* Weekly challenge rules (see weeklyThemes in data.js). Outside a weekly run every rule is neutral. */
  const wrule = (k, d) => (S && S.race && S.race.rules && S.race.rules[k] != null) ? S.race.rules[k] : d;
  const scoreMult = tags => { const sc = wrule('score', null); if (!sc) return 1; let m = 1; new Set(tags).forEach(t => { if (sc[t]) m *= sc[t]; }); return m; };
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
    NET.medals = []; lsSet('harvestworks.medals', []); fetchMedals(true); }
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
     dice seeded by the week number). One ranked 15-minute run a day, checked by the valley server; practice runs
     after that don't count. Best run of the week wins; the top three get medals when the week closes (Monday
     00:00 UTC). The run farm lives in its own save, like a race, so the player's real farms are never touched. */
  const WEEK_KEY = 'harvestworks.weekly.v1', WEEK_RUN = 15 * 60000, WEEK0 = 2962;
  const weekOf = t => Math.floor((t / 1000 - 345600) / 604800);
  const weekStartMs = w => (w * 604800 + 345600) * 1000;
  const srvNow = () => Date.now() - (NET.skew || 0);
  function weekLabel(w) { const mon = weekStartMs(w), y = new Date(mon + 3 * 864e5).getUTCFullYear(), j4 = Date.UTC(y, 0, 4);
    const wk1 = j4 - ((new Date(j4).getUTCDay() + 6) % 7) * 864e5; return `Week ${Math.round((mon - wk1) / 6048e5) + 1}, ${y}`; }
  // Themes come in shuffled rounds: every theme once per round, and never the same theme two weeks running.
  function weekTheme(w) { const T = D.weeklyThemes, N = T.length, d = w - WEEK0, c = Math.floor(d / N);
    const perm = c => { const R = raceRng('ROUND' + c), a = T.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const cur = perm(c); if (cur[0] === perm(c - 1)[N - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
    return T[cur[d - c * N]]; }
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
    S.race = { weekly: true, code: 'W' + info.week, week: info.week, run: info.run || null, ranked: info.ranked, start: info.start, end: info.start + WEEK_RUN, target: 0, seen: {} };
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
      if (left <= -400) { closeTitle(); SND.play('contract'); toast(`<b>Go!</b> 15 minutes. ${esc(weekTheme(R.week).blurb)}`, 'goal'); } return; }
    if (R.done || Date.now() < R.start) return;
    if (Date.now() >= R.end) { finishWeekly(); return; }
    UI.rtick = (UI.rtick || 0) - dt;
    if (UI.rtick <= 0) { UI.rtick = 5; if (R.ranked && R.run) rpc('weekly_score', { p_run: R.run, p_player: PLAYER, p_score: Math.floor(S.score) }).catch(() => {}); }
  }
  function renderWeekBar() { const R = S.race, th = weekTheme(R.week), left = R.done ? 0 : Math.min(WEEK_RUN, R.end - Date.now());
    setHTML('#racebar', `<div class="rhead"><b>${esc(th.name)}</b><span>${R.ranked ? 'Ranked run' : 'Practice'} · ${fmtTime(left)} left</span></div>
      <div class="rrow me"><span class="rname">Score</span><span class="rtrack"><i style="width:${(100 - left / WEEK_RUN * 100).toFixed(1)}%"></i></span><span class="rsc">${Math.floor(S.score).toLocaleString()}</span></div>`); }
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
  function renderRaceBar() { const el = $('#racebar'), R = S.race;
    if (!R || UI.title === 'racego' || UI.title === 'weeklygo') { el.hidden = true; return; } el.hidden = false;
    if (R.weekly) return renderWeekBar();
    const ps = (UI.rl && UI.rl.players) || [{ name: S.name, score: Math.floor(S.score), me: true }], t = R.target;
    const rows = ps.map(p => { const sc = p.me ? Math.max(p.score, Math.floor(S.score)) : p.score;
      return `<div class="rrow ${p.me ? 'me' : ''}"><span class="rname">${esc(p.name)}</span><span class="rtrack"><i style="width:${Math.min(100, sc / t * 100).toFixed(1)}%"></i></span><span class="rsc">${p.finished_ms != null ? '✓ ' + fmtTime(p.finished_ms) : sc.toLocaleString()}</span></div>`; }).join('');
    setHTML('#racebar', `<div class="rhead"><b>Race ${esc(R.code)}</b><span>to ${t.toLocaleString()} · ${R.done ? 'finished in ' + fmtTime(R.time) : fmtTime(raceNow() - R.start)}</span></div>${rows}`); }
  async function openBoard() { UI.drawer = 'lb'; UI.lb = { loading: true }; dirty();
    if (!NET.ok) { await pullMarket(); }
    if (!NET.ok) { UI.lb = { off: true }; dirty(); return; }
    try { sendScore(); await new Promise(r => setTimeout(r, 400)); UI.lb = await rpc('get_leaderboard', { p_farm: S.fid }); } catch (e) { UI.lb = { off: true }; } dirty(); }
  /* How many copies of the game are open right now: each page load gets a random id and pings every 30 s
     (background tabs too). The server counts ids seen in the last 2½ minutes. Nothing else is sent. */
  const INST = crypto.randomUUID();
  async function pingPresence() { try { const n = await rpc('presence_ping', { p_inst: INST }); if (typeof n === 'number') { NET.open = Math.max(1, n); renderOpen(); } } catch (e) { } }
  function renderOpen() { const el = $('#online'); if (!el) return; el.hidden = !NET.open; if (!NET.open) return;
    el.innerHTML = `<i></i><b>${NET.open}</b><span class="lg">&nbsp;playing</span>`; el.title = `${NET.open} cop${NET.open === 1 ? 'y' : 'ies'} of Harvest Valley open right now`; }
  window.addEventListener('pagehide', () => { try { fetch(NET.url + 'presence_leave', { method: 'POST', keepalive: true, headers: { apikey: NET.key, Authorization: 'Bearer ' + NET.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_inst: INST }) }); } catch (e) { } });
  async function pullMarket() {
    try { const m = await rpc('get_market'); NET.prices = m.prices || {}; NET.trades = m.trades || []; NET.active = m.active || 1; NET.recov = m.recovery_hours; NET.ok = true;
      if (!UI.sentScore) { UI.sentScore = true; sendScore(); fetchMyName(); fetchMedals(); setTimeout(autoBackup, 3000); setTimeout(linkAllFarms, 6000); }
      NET.skew = Date.now() - Date.parse(m.now); NET.at = Date.now(); }
    catch (e) { NET.ok = false; }
    NET.tried = true; UI.tickDirty = true; dirty();
  }
  function reportTrade(item, qty, side) { if (!online()) return;
    if (!NET.ok || D.items[item].cat === 'kit') return;
    NET.trades.unshift({ item, qty, side, created_at: new Date(Date.now() - NET.skew).toISOString(), mine: true }); NET.trades.length = Math.min(NET.trades.length, 40);
    UI.tickDirty = true;
    rpc('record_trade', { p_player: PLAYER, p_item: item, p_qty: qty, p_side: side }).then(m => { if (typeof m === 'number') { NET.prices[item] = m; dirty(); } }).catch(() => {});
  }
  const mult = id => (online() && NET.ok && D.items[id].cat !== 'kit' && NET.prices[id]) || 1; // races use plain local prices
  // Goods you've made at least once can be bought back from the market at a markup (above even the +50% demand sell price).
  const RESALE = 1.75;
  const buyPrice = id => (S && S.race && S.race.deal && S.race.deal.kit === id) ? S.race.deal.price : Math.max(1, Math.round((D.items[id].buy || (D.items[id].value || 1) * RESALE) * mult(id)));
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
    b.q.push({ r: rid, t: 0, dur: R.time * D.upgrades.speed.effect[b.lv.speed] / (wrule('craft', {})[b.type] || 1), qual: q, done: false });
    emit('load', { st: b.type }); }
  function collectErr(i) { const b = T_(i).b; const done = b && b.q ? b.q.filter(x => x.done) : [];
    if (!done.length) return 'Nothing ready'; let n = 0; done.forEach(x => { for (const k in D.recipes[x.r].out) if (storable(k)) n += D.recipes[x.r].out[k]; }); return room() >= n ? null : FULL; }
  function doCollect(i) { const b = T_(i).b; const done = b.q.filter(x => x.done); b.q = b.q.filter(x => !x.done);
    done.forEach(x => { const out = D.recipes[x.r].out; for (const k in out) {
      addItem(k, out[k], x.qual); const d = depth(k); wk().made[k] = (wk().made[k] || 0) + out[k];
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
        addItem(cr.item, cr.yield, q); wk().harvest += cr.yield; float(t.i, `+${cr.yield} ${D.items[cr.item].name}${q ? ' · ' + QN[q] : ''}`, '#fff');
        T_(t.i).b = { type: 'farm', st: 'raw', last: b.crop };
        gainScore(C.score.harvest * (1 + q * .5), t.i, 'harvest', cr.item); first('harvest:' + b.crop, C.firsts.harvest, `First ${cr.name.toLowerCase()} harvested`);
        emit('harvest', { item: cr.item }); } },
    chop: { label: () => 'Chop tree', check: t => { const T = T_(t.i); if (!unlocked('woodcutting')) return 'Unlock Woodcutting first'; if (T.r.st !== 'tree') return 'No grown tree'; return outRoom(gatherOut('forest', 'chop')) ? null : FULL; },
      run: t => { const o = gatherOut('forest', 'chop'); for (const k in o) addItem(k, o[k]); T_(t.i).r.st = 'stump';
        float(t.i, `+${o.log} Logs`, '#fff'); gainScore(C.score.chop, t.i, 'chop', 'log'); first('gather:log', C.firsts.gather, 'First logs chopped'); emit('chop'); } },
    replant: { label: () => 'Plant sapling', check: t => T_(t.i).r.st !== 'stump' ? 'Nothing to replant' : count('sapling') < 1 ? 'No sapling' : null,
      run: t => { take('sapling', 1); Object.assign(T_(t.i).r, { st: 'sapling', g: 0 }); gainScore(C.score.replant, t.i); } },
    fish: { label: () => 'Fish', check: t => !unlocked('fishing') ? 'Unlock Fishing first' : T_(t.i).r.stock < 1 ? 'Fish are hiding. Try again soon' : outRoom(gatherOut('water', 'fish')) ? null : FULL,
      run: t => { const n = gatherOut('water', 'fish').fish; T_(t.i).r.stock--; addItem('fish', n); float(t.i, `+${n} Fish`, '#fff'); gainScore(C.score.fish, t.i, 'fish'); first('gather:fish', C.firsts.gather, 'First fish caught'); } },
    mine: { label: () => 'Break stone', check: t => !unlocked('stonecutting') ? 'Unlock Stonecutting first' : T_(t.i).r.stock < 1 ? 'No boulders left. They resurface over time' : outRoom(gatherOut('boulder', 'mine')) ? null : FULL,
      run: t => { const o = gatherOut('boulder', 'mine'), n = o.stone; T_(t.i).r.stock--; for (const k in o) addItem(k, o[k]); float(t.i, `+${n} Stone${o.copper_ore ? ' + ore' : ''}`, '#fff'); if (o.copper_ore) first('gather:ore', C.firsts.gather, 'First copper ore'); gainScore(C.score.mine, t.i, 'mine', 'stone'); first('gather:stone', C.firsts.gather, 'First stone quarried'); } },
    gather: { label: t => (D.gather[T_(t.i).t] || {}).verb || 'Gather',
      check: t => { const T = T_(t.i), G = D.gather[T.t]; if (!G || !T.r) return 'Nothing to gather here';
        if (!unlocked(G.needs)) return `Unlock ${D.discoveries.find(d => d.id === G.needs).name} first`;
        if (T.r.stock < 1) return 'Picked clean. It grows back over time'; return outRoom(G.out) ? null : FULL; },
      run: t => { const T = T_(t.i), G = D.gather[T.t]; T.r.stock--; const got = [];
        for (const k in G.out) { addItem(k, G.out[k]); got.push(`+${G.out[k]} ${D.items[k].name}`); first('gather:' + k, C.firsts.gather, `First ${D.items[k].name.toLowerCase()} gathered`); }
        float(t.i, got.join(' · '), '#fff'); gainScore(C.score.gather, t.i, 'gather', ...Object.keys(G.out)); emit('gather'); } },
    survey: { label: t => `Survey the ${D.regionThemes[S.regions[t.p].theme].name}`,
      check: t => { if (!unlocked('surveying')) return 'Unlock Land Surveying in Discovery'; if (!surveyable(t.p)) return 'Survey land next to an area you already have'; return canPay(surveyCost()); },
      run: t => { pay(surveyCost()); S.regions[t.p].open = true; genRegion(t.p); S.surveys = (S.surveys || 0) + 1; UI.live = null; UI.bounds = null;
        const th = D.regionThemes[S.regions[t.p].theme]; gainScore(C.score.survey, t.i); float(t.i, `New area: ${th.name}`, '#b8f08a');
        first('survey:' + S.regions[t.p].theme, 2, `New area: ${th.name}`);
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
    deliver: { label: t => t.p === 'ms' ? `Deliver: ${D.milestones[S.ms] ? D.milestones[S.ms].name : 'contract'}` : 'Deliver order',
      check: t => { const o = t.p === 'ms' ? D.milestones[S.ms] : S.orders.find(o => o.id === t.p); if (!o) return 'Order is gone'; return canFill(o.need) ? null : 'Missing goods'; },
      run: t => {
        if (t.p === 'ms') { const m = D.milestones[S.ms]; m.need.forEach(([id, n, q]) => take(id, n, q));
          S.gold += m.gold; S.dp += m.dp; S.ms++; gainScore(m.gold, t.i);
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
        const cr = D.crops[b.crop]; b.g += dt * (b.wet ? 1 : .45) * (b.fert ? C.fertGrowth : 1) * wrule('grow', 1);
        if (!b.half && b.g >= cr.grow / 2) { b.half = true; b.wet = false; dirty(); }
        if (b.g >= cr.grow) { b.st = 'ready'; float(i, 'Ready!', '#b8f08a'); SND.play('ready'); dirty(); }
      } else if (b && b.q) {
        const j = b.q.find(x => !x.done);
        if (j) { j.t += dt; if (j.t >= j.dur) { j.done = true; if (!b.auto) float(i, 'Done!', '#b8f08a'); SND.play('done', b.auto ? 0.5 : 1); dirty(); } }
        if (b.auto && unlocked('autocollect') && !collectErr(i)) { doCollect(i); dirty(); }
        if (b.rep && unlocked('repeat') && !loadErr(i, b.rep)) { doLoad(i, b.rep); dirty(); }
      } else if (b && D.buildings[b.type].kind === 'sprinkler') {
        if (b.fx > 0) b.fx -= dt;
        around(i, D.buildings[b.type].radius).forEach(j => { const f = farmAt(j); if (f && f.st === 'growing' && !f.wet) { waterPlot(f); b.fx = 1.4; dirty(); } });
      }
      const R = T.r; if (!R) return;
      if (T.t === 'forest') { if (R.st === 'sapling') { R.g += dt; if (R.g >= D.gather.forest.regrow) { R.st = 'tree'; dirty(); } } }
      else { const G = D.gather[T.t]; if (R.stock < G.stock) { R.rt += dt * (T.t === 'water' ? wrule('fish', 1) : 1); if (R.rt >= G.regen) { R.rt = 0; R.stock++; dirty(); } } else R.rt = 0; }
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
  function draw() {
    const p = P(), now = S.time;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#1e3a30'; cx.fillRect(0, 0, W, H);
    if (!UI.live) { UI.live = []; S.tiles.forEach((T, i) => { if (T.t !== 'void') UI.live.push(i); }); }
    const order = UI.live.slice(), vd = {};
    order.forEach(i => { vd[i] = view(tx(i), ty(i)); });
    order.sort((a, b) => (vd[a][0] + vd[a][1]) - (vd[b][0] + vd[b][1]) || vd[a][0] - vd[b][0]);
    const frontier = new Set(); order.forEach(i => { if (!S.tiles[i].o && nbrs(i).some(n => S.tiles[n].o)) frontier.add(i); });
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
        } else {
          let key = b.type; const active = b.q && b.q.some(j => !j.done);
          if (b.type === 'stove' && active) key = 'stove_on';
          if (b.type === 'medal') key = 'medal:' + b.m.place;
          if (b.type === 'mill' || b.type === 'sawmill') key += ':' + (active ? ((now * 4) | 0) % 2 : 0);
          if (D.buildings[b.type].kind === 'sprinkler') key = (b.type === 'big_sprinkler' ? 'big_sprinkler:' : 'sprinkler:') + (b.fx > 0 ? ((now * 6) | 0) % 2 : 0);
          const img = ART.get(key); blit(img, sx, sy, p, 16, img.height - 4);
          if (UI.labels) labels.push({ sx, sy: sy - (img.height - 1) * p, name: D.buildings[b.type].name });
          if (b.q) { const j = b.q.find(j => !j.done), dn = b.q.find(j => j.done);
            if (dn) bubble(sx, sy - (img.height - 2) * p, p, ART.iconCanvas(Object.keys(D.recipes[dn.r].out)[0], D.items));
            if (j) bar(sx, sy + 3 * p, p, j.t / j.dur, '#f0a030');
            if (['stove', 'kiln', 'oven', 'smokehouse', 'smelter'].includes(b.type) && active && Math.random() < .08) UI.parts.push({ x: sx + 5 * p, y: sy - (img.height - 8) * p, t: 0, vx: (Math.random() - .5) * p * 4 }); }
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
    if (labels.length) drawLabels(p, labels);
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
    if (kind === 'warn') SND.play('warn');
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = html;
    const box = $('#toasts'); box.prepend(el); while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'warn' ? 3200 : 5200);
  }
  const ico = (id, cls = '') => `<img class="ico ${cls}" src="${ART.icon(id, D.items)}" alt="">`;
  const qtag = q => q ? `<span class="q q${q}">${QN[q]}</span>` : '';
  function setHTML(sel, html) {
    if (UI.html[sel] === html) return; const el = $(sel), a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'number' || a.type === 'range')) && el.contains(a)) return; // don't yank a field mid-typing
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
      ${S.loan ? `<button class="stat loan" data-repay title="Loan from the valley bank. Paid back automatically at ${LOAN.auto}g, or tap to repay now"><span class="lbl">Loan</span><b>${S.loan.owed}g</b></button>` : ''}
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
  // The chosen tab is remembered (also across visits). If it's empty right now, 'All' shows instead,
  // but the choice is kept, so the tab comes back once it has something in it again.
  function chips(kind, counts, extra = []) {
    const opts = [['all', 'All', null], ...extra, ...counts], cur = opts.some(o => o[0] === UI.cat[kind]) ? UI.cat[kind] : 'all';
    UI.catShow[kind] = cur;
    return `<div class="chips" role="group" aria-label="Filter by category">${opts.map(([id, name, n]) => `<button class="chipf ${cur === id ? 'on' : ''}" data-cat="${kind}:${id}" aria-pressed="${cur === id}">${esc(name)}${n != null ? `<span>${n}</span>` : ''}</button>`).join('')}</div>`;
  }
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
    return h + fhControl(i, 'tend') + `<p class="tip">Tip: click a selected tile again to repeat its main action.${isPhone() ? '' : ' Right-click this menu to move or resize it.'}</p>`;
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
    return h + fhControl(i, 'station') + moveSection(i);
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
    const m = D.milestones[S.ms];
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
    } else if (G.action === 'gather') {
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
    return `<span class="eyebrow">Change this land</span>` + opts.map(k => { const L = D.landShape[k], to = k.split('>')[1];
      const back = Object.entries(L.back).filter(([id, n]) => n && !(T.t === 'forest' && id === 'log' && T.r && T.r.st !== 'tree'));
      return btn({ a: 'reshape', i, p: k }, `${esc(L.verb)} → ${esc(D.terrain[to].name)}`, { cls: 'ghost', sub: `${costTxt(L.cost)}${back.length ? ' · get back ' + costTxt(Object.fromEntries(back)) : ''}. ${esc(L.note)}` }); }).join('');
  }
  function storagePanel(i) {
    const B = D.buildings[T_(i).b.type];
    return head(B.name, esc(B.desc)) + `<p class="state">Adds <b>${B.storage}</b> to your storage. Total now: ${used()} of ${cap()} used.</p><p class="hint">Everything lives in shared storage, so it doesn’t matter where on your land you build these.</p>` + moveSection(i);
  }
  function medalPanel(i) { const m = T_(i).b.m;
    return head(`${MEDAL[m.place][0]} medal`, `${MEDAL[m.place][1]} · ${weekLabel(m.week)}`) + `<div class="medalbig"><img src="${medalImg(m.place)}" alt=""><p class="state">${esc(NET.myName || S.name)} won ${m.place === 1 ? 'the Weekly Challenge' : `${m.place === 2 ? 'second' : 'third'} place in the Weekly Challenge`} in ${weekLabel(m.week)} (${esc(weekTheme(m.week).name)}) with <b>${m.score.toLocaleString()}</b> points.</p></div>
      <button class="btn ghost" data-medal-away="${i}">Put it away</button><p class="hint small">It goes back to your trophy case (Menu → Medals). Place it again any time, on any farm.</p>`; }
  function sprinklerPanel(i) {
    const B = D.buildings[T_(i).b.type], n = around(i, B.radius).filter(j => j !== i && farmAt(j)).length, max = (B.radius * 2 + 1) ** 2 - 1;
    return head(B.name, esc(B.desc)) + `<p class="state">Covering ${n} farm plot${n === 1 ? '' : 's'}.</p><p class="hint">Plots it waters still earn Good quality when they’re watered at both growth stages. Place it among your plots to cover up to ${max}.</p>` + moveSection(i);
  }
  function emptyPanel(i) {
    let h = head('Empty grassland', 'Build a farm plot or place a station kit here.');
    if (UI.moving != null && T_(UI.moving).b) { const b = T_(UI.moving).b, nm = D.buildings[b.type].name;
      h += btn({ a: 'move', i, p: UI.moving, nm }, `Move the ${esc(nm)} here`, { cls: 'pri', sub: costTxt(moveCost(b.type)) }) + `<button class="btn ghost" data-move-cancel>Cancel moving</button>`; }
    if (!S.race) NET.medals.filter(m => medalAt(m) === undefined).forEach(m => { h += `<button class="btn ${UI.placeMedal === medalKey(m) ? 'pri' : 'ghost'}" data-medal-put="${medalKey(m)}" data-i="${i}">Place medal here<small>${MEDAL[m.place][0]} · ${weekLabel(m.week)}</small></button>`; });
    h += btn({ a: 'build', i }, 'Build Farm Plot', { cls: UI.placeMedal ? '' : 'pri', sub: costTxt(C.farmPlotCost) });
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
    return `<span class="eyebrow">Move this building</span><p class="hint">Keeps its upgrades, batches and farmhand jobs. Costs ${costTxt(moveCost(b.type))}${(S.moveHeat || 0) > 0 ? ' (higher after recent moves; the surcharge eases every few days)' : ''}.</p><button class="btn ghost" data-move-start="${i}">Pick a new spot</button>`;
  }
  function lockedPanel(i, T) {
    const Tr = D.terrain[T.t], adj = nbrs(i).some(n => S.tiles[n].o);
    let h = head(Tr.name, `${esc(Tr.desc)}`);
    if (adj) { const c = expCost(i); h += `<p class="state">Unclaimed land at your border.</p><span class="eyebrow">What it takes</span>${costList(c)}` + btn({ a: 'expand', i }, `Buy this tile`, { cls: 'pri', sub: costTxt(c) });
      if (S.exp < C.expandStoneAt) h += `<p class="hint">From your ${C.expandStoneAt + 1}th tile, land also costs stone; from the ${C.expandFenceAt + 1}th, a fence kit. Boulder Fields only ever cost gold.</p>`; }
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
  function placePanel() { const el = $('#panel'), ed = $('#pedit');
    if (el.hidden || UI.sel < 0 || isPhone()) { if (UI.pedit) endPanelEdit(true);
      if (el.dataset.fl) { el.style.left = el.style.top = el.style.right = el.style.width = el.style.height = el.style.maxHeight = el.style.boxSizing = ''; delete el.dataset.fl; } return; }
    const topMin = $('#top').getBoundingClientRect().bottom + 8, W = innerWidth, H = innerHeight, P = UI.ppDraft || UI.pp;
    let left, top, w, h;
    if (P) { w = Math.max(280, Math.min(W - 20, P.w)); h = Math.max(180, Math.min(H - topMin - 10, P.h));
      left = Math.max(10, Math.min(W - w - 10, P.x)); top = Math.max(topMin, Math.min(H - h - 10, P.y));
      const sw = Math.round(w) + 'px', sh = Math.round(h) + 'px';
      if (el.style.width !== sw || el.style.height !== sh) { el.style.boxSizing = 'border-box'; el.style.width = sw; el.style.height = sh; el.style.maxHeight = 'none'; } }
    else { if (el.style.width) { el.style.width = el.style.height = el.style.maxHeight = el.style.boxSizing = ''; }
      const [x, y] = toScreen(tx(UI.sel), ty(UI.sel)), sx = x / DPR, sy = y / DPR, gap = 44 * cam.z; w = el.offsetWidth; h = el.offsetHeight;
      const off = Math.max(34, gap) + w * .2; // 20% of the panel's width further out, so it clears the tile's neighbours
      left = sx + off; if (left + w > W - 10) left = sx - off - w;
      left = Math.max(10, Math.min(W - w - 10, left)); top = Math.max(topMin, Math.min(H - h - 64, sy - h / 2)); }
    const L = Math.round(left) + 'px', T = Math.round(top) + 'px';
    if (el.style.left !== L || el.style.top !== T) { el.style.left = L; el.style.top = T; el.style.right = 'auto'; el.dataset.fl = 1; }
    if (UI.pedit) { const r = el.getBoundingClientRect(); Object.assign(ed.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); } }
  function startPanelEdit() { const r = $('#panel').getBoundingClientRect(); UI.ppDraft = { x: r.left, y: r.top, w: r.width, h: Math.max(r.height, 320) };
    UI.pedit = true; $('#pedit').hidden = false; }
  function endPanelEdit(keep) { if (keep && UI.ppDraft) { UI.pp = UI.ppDraft; try { localStorage.setItem(PP_KEY, JSON.stringify(UI.pp)); } catch (e) { } }
    UI.ppDraft = null; UI.pedit = false; $('#pedit').hidden = true; }
  function hidePctx() { const m = $('#pctx'); if (m) m.hidden = true; }
  $('#panel').addEventListener('contextmenu', e => { if (isPhone()) return; e.preventDefault(); const m = $('#pctx');
    m.innerHTML = `<button data-pctx="edit">Move and resize this menu<small>It opens in that spot from then on</small></button>${UI.pp ? '<button data-pctx="reset">Open beside the tile again</button>' : ''}<button data-pctx="cancel">Cancel</button>`;
    m.hidden = false; m.style.left = Math.min(e.clientX, innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - m.offsetHeight - 8) + 'px'; });
  $('#pctx').addEventListener('click', e => { const b = e.target.closest('[data-pctx]'); if (!b) return; e.stopPropagation(); hidePctx();
    const a = b.dataset.pctx; if (a === 'edit') startPanelEdit();
    else if (a === 'reset') { UI.pp = null; try { localStorage.removeItem(PP_KEY); } catch (e) { } toast('The menu opens beside the tile you pick again.', 'info'); } });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#pctx')) hidePctx(); }, true);
  // dragging the edit frame moves the panel; the corner grip resizes it
  (() => { const ed = $('#pedit'); let drag = null;
    ed.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('button')) return; e.preventDefault();
      drag = { mode: e.target.closest('.grip') ? 'size' : 'move', x: e.clientX, y: e.clientY, P: Object.assign({}, UI.ppDraft) }; ed.setPointerCapture(e.pointerId); });
    ed.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, P = drag.P;
      UI.ppDraft = drag.mode === 'move' ? { x: P.x + dx, y: P.y + dy, w: P.w, h: P.h } : { x: P.x, y: P.y, w: Math.max(280, P.w + dx), h: Math.max(180, P.h + dy) }; });
    ed.addEventListener('pointerup', () => { drag = null; });
    ed.addEventListener('click', e => { const b = e.target.closest('[data-pedit]'); if (!b) return; e.stopPropagation();
      if (b.dataset.pedit === 'done') { endPanelEdit(true); toast('<b>Menu spot saved.</b> It opens there from now on. Right-click it to change it again.', 'info'); }
      else if (b.dataset.pedit === 'reset') { endPanelEdit(false); UI.pp = null; try { localStorage.removeItem(PP_KEY); } catch (e) { } }
      else endPanelEdit(false); }); })();
  function renderPanel() {
    const i = UI.sel; const el = $('#panel');
    document.body.classList.toggle('sheet-open', i >= 0);
    if (i < 0) { el.hidden = true; UI.html['#panel'] = ''; return; }
    if (UI.lastSel !== i) { const a = document.activeElement; if (a && el.contains(a)) a.blur(); UI.lastSel = i; } // new tile: let the panel redraw
    el.hidden = false; const T = S.tiles[i];
    let h;
    if (T.t === 'void') h = surveyPanel(i);
    else if (!T.o) h = lockedPanel(i, T);
    else if (T.b) { const k = D.buildings[T.b.type].kind;
      h = k === 'farm' ? farmPanel(i, T.b) : k === 'station' ? stationPanel(i, T.b) : k === 'home' ? homePanel(i) : k === 'market' ? marketPanel(i) : k === 'sprinkler' ? sprinklerPanel(i) : k === 'storage' ? storagePanel(i) : k === 'decor' ? medalPanel(i) : boardPanel(i); }
    else if (T.r) h = gatherPanel(i, T);
    else h = emptyPanel(i);
    setHTML('#panel', h);
  }
  // Your player name: locked to this player (not a farm) and used on the leaderboard, the weekly challenge and medals.
  function nameHTML() { const c = UI.claim || {};
          if (NET.myName && !UI.lbEdit) return `<p class="state">Locked in as <b>${esc(NET.myName)}</b> ✓ No one else in the valley can use it.</p><button class="btn ghost sm" data-lb-edit>Change it</button>`;
          let h = `<p class="hint small">Lock in a name so it’s yours alone across the valley. If it’s taken, you’ll get the next free number (Name1, Name2…).</p>
            <div class="fhrow"><input id="lbname" maxlength="14" value="${esc(UI.lbDraft != null ? UI.lbDraft : (NET.myName || S.name || ''))}" autocomplete="off" aria-label="Leaderboard name"><button class="btn pri sm" data-lb-claim ${c.busy ? 'disabled' : ''}>${c.busy ? 'Checking…' : 'Lock in name'}</button>${UI.lbEdit ? '<button class="btn ghost sm" data-lb-edit-cancel>Cancel</button>' : ''}</div>`;
          if (c.taken) h += `<p class="hint">“${esc(c.taken)}” is already taken. How about <b>${esc(c.suggestion)}</b>?</p><button class="btn sm" data-lb-take="${esc(c.suggestion)}">Use ${esc(c.suggestion)}</button>`;
          if (c.err) h += `<p class="hint err">${esc(c.err)}</p>`;
          return h; }
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
      const sel = catSel('disc'), card = d => { const own = unlocked(d.id), reqOk = d.req.every(unlocked);
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
        ${online() ? `<button class="toggle ${S.lbShow !== false ? 'on' : ''}" data-lbshow aria-pressed="${S.lbShow !== false}"><i></i>Show my farmer’s name on the leaderboard</button>
        <p class="hint small">${S.lbShow !== false ? `Other players see ${NET.myName ? `your locked name <b>${esc(NET.myName)}</b> ✓` : 'your farmer’s name'} and your score.` : 'Your score still counts, but others see “A farmer”.'}</p>` : ''}</div>
        <span class="eyebrow">Your player name</span><div class="opts">${nameHTML()}<p class="hint small">Shown on the leaderboard, in the weekly challenge and on your medals, on every farm you play.</p></div>
        ${S.race ? '' : `<span class="eyebrow">This farm</span><div class="opts"><p class="state">${S.mode === 'private' ? '<b>Private farm.</b> No leaderboard and no shared prices. Private farms can’t join the Online Valley later.' : '<b>Online Valley farm.</b> Shared market prices, the valley ticker and the leaderboard.'}</p>
          ${S.mode !== 'private' ? `<button class="btn ${UI.goPrivate ? 'danger' : 'ghost'} sm" data-go-private>${UI.goPrivate ? 'Tap again: this can’t be undone' : 'Make this farm private'}</button><p class="hint small">It leaves the leaderboard and stops sharing prices. A private farm can’t come back to the Online Valley.</p>` : ''}</div>`}
        <span class="eyebrow">Sound</span><div class="opts">
        <button class="toggle ${SND.prefs.mute ? '' : 'on'}" data-sound-mute aria-pressed="${!SND.prefs.mute}"><i></i>Sound ${isTouch() ? '' : '<span class="muted">(M)</span>'}</button>
        ${[['sfx', 'Effects', 'Chimes when things finish, and the sounds of work'], ['amb', 'Ambience', 'A breeze, birds by day and crickets at dusk'], ['mus', 'Music', 'Soft, slow and never the same twice']].map(([k, n, d]) =>
          `<label class="slider"><span><b>${n}</b><small>${d}</small></span><input type="range" min="0" max="100" step="5" value="${Math.round(SND.prefs[k] * 100)}" data-vol="${k}" aria-label="${n} volume" ${SND.prefs.mute ? 'disabled' : ''}></label>`).join('')}
        </div>
        <div class="menu"><button class="btn ghost" data-drawer="menu">Back to the menu</button></div>`;
    } else if (UI.drawer === 'menu') {
      h = `<div class="phead"><div><h2>Harvest Valley</h2><p class="sub">${S.menuPause !== false ? '<b>Game paused.</b> ' : ''}${S.race ? (S.race.weekly ? 'Weekly challenge: the clock keeps running. ' : 'Racing: the clock keeps running. ') : ''}Progress saves in this browser<span id="savedago"></span>.</p></div><button class="close" data-close-drawer aria-label="Close">×</button></div>
        ${S.race && S.race.weekly ? `<div class="demand"><span><b>${esc(weekTheme(S.race.week).name)}</b> · ${S.race.ranked ? 'ranked run' : 'practice run'}, ${fmtTime(Math.max(0, S.race.end - Date.now()))} left. ${esc(weekTheme(S.race.week).blurb)}</span></div><div class="menu"><button class="btn" data-week-end>End this run now<small>${S.race.ranked ? 'Your score so far counts' : 'Practice doesn’t count'}</small></button></div>`
        : S.race ? `<div class="demand"><span><b>Racing in ${esc(S.race.code)}</b> to ${S.race.target.toLocaleString()} points. No pausing in a race.</span></div><div class="menu"><button class="btn" data-race-leave>Leave the race<small>Back to your own farm</small></button></div>` : ''}
        <div class="menu"><button class="btn" data-drawer="settings">Settings<small>Pausing, weekly report, sound</small></button><button class="btn" data-race-open>Race with friends<small>Host or join a race</small></button><button class="btn" data-weekly-open>Weekly challenge<small>This week: ${esc(weekTheme(weekOf(srvNow())).name)}</small></button><button class="btn" data-drawer="medals">Medals<small>${NET.medals.length ? `${NET.medals.length} won` : 'Win one in the weekly challenge'}</small></button>${unlocked('farmhand') ? '<button class="btn" data-drawer="hands">Farmhands<small>Manage their jobs</small></button>' : ''}${online() ? '<button class="btn" data-lb-open>Leaderboard<small>How your farm compares</small></button>' : ''}</div>
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
    el.hidden = !online(); if (!online()) { UI.tickShell = null; return; }
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
    else if ('tickToggle' in ds) { S.tick.open = !S.tick.open; save(); }
    else if ('tickSpeed' in ds) { S.tick.spd = S.tick.spd === 'slow' ? 'fast' : 'slow'; save(); }
    else if (ds.mtab) UI.mtab = ds.mtab;
    else if (ds.cat) { const [k, v] = ds.cat.split(':'); UI.cat[k] = v; try { localStorage.setItem('harvestworks.tabs', JSON.stringify(UI.cat)); } catch (e) { } }
    else if (ds.cancel) { S.queue = S.queue.filter(t => t.id !== +ds.cancel); }
    else if (ds.pass) { S.orders = S.orders.filter(o => o.id !== +ds.pass); S.refill = C.orderRefill; }
    else if (ds.unlock) { const d = D.discoveries.find(x => x.id === ds.unlock);
      if (d && !unlocked(d.id) && S.dp >= d.cost) { S.dp -= d.cost; S.unl.push(d.id); logAct(`Unlocked ${d.name} · −${d.cost} Discovery`, 'you');
        const kit = Object.keys(D.items).find(k => D.items[k].cat === 'kit' && D.items[k].buy && D.items[k].requires === d.id);
        if (kit && !S.market.offers.includes(kit)) { S.market.offers.unshift(kit); S.market.offers = S.market.offers.slice(0, C.marketOffers); }
        UI.bounds = null; SND.play('discover');
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
    if (id === 'fert') { UI.fert = e.target.checked; dirty(); } else if (id === 'hcrop') UI.hcrop = e.target.value; else if (id === 'hrec') UI.hrec = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lbname') { claimName(e.target.value.trim()); return; } if (e.key === 'Enter' && e.target.dataset && e.target.dataset.sq) { const b = document.querySelector(`[data-sellqty="${e.target.dataset.sq}"]`); if (b) b.click(); } });
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
    if (UI.medalPend && !UI.title && !UI.catchup && !S.race) showMedal();
    if (UI.pendingWeek && !UI.title && !UI.catchup) { UI.week = UI.pendingWeek; UI.pendingWeek = null; openTitle('week'); SND.play('day'); } if (!paused()) update(dt); tickYaw(dt); tickTicker(dt); tutTick();
    UI.floats.forEach(f => f.t += dt); UI.floats = UI.floats.filter(f => f.t < 1.6);
    UI.parts.forEach(q => q.t += dt); UI.parts = UI.parts.filter(q => q.t < 1);
    draw(); placePanel();
    uiT -= dt; if (UI.dirty || uiT <= 0) { renderUI(); UI.dirty = false; uiT = .5; }
    document.querySelectorAll('[data-prog]').forEach(el => { el.style.width = (Math.min(1, progress(el.dataset.prog)) * 100).toFixed(1) + '%'; });
    requestAnimationFrame(frame);
  }

  /* ================= update notice =================
     When hosted as static files, a newer build may go live while someone is playing. Every few minutes
     the game reads version.json next to it; if the build differs, a banner offers a reload. It never
     reloads on its own, and saving first means nothing is lost. Missing file or offline = silently skip. */
  const BUILD = '20261014-202718';
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
    pullMarket(); setInterval(() => { if (!document.hidden) pullMarket(); }, 30000);
    pingPresence(); setInterval(pingPresence, 30000);
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
        <p class="hint small">Everyone gets the same head start this week. One ranked 15-minute run a day, no pausing; your best run counts. The top three win medals when the week closes${W.ends_at ? `, in ${fmtLeft(Date.parse(W.ends_at) - Date.parse(W.now))}` : ''}.</p>
        ${W.loading ? '<p class="hint">Loading this week’s board…</p>' : W.off ? '<p class="hint err">The weekly challenge needs the shared valley connection. Play the web version: zcgrimshaw.github.io/harvestwork</p>'
          : `<span class="eyebrow">This week’s best${W.players ? ` · ${W.players} farmer${W.players === 1 ? '' : 's'}` : ''}</span>${rows ? `<ol class="rresults wboard">${rows}</ol>` : '<p class="hint">No ranked runs yet this week. Be the first!</p>'}
            ${W.mine && W.mine.rank > 10 ? `<p class="hint">You: #${W.mine.rank} with ${W.mine.score.toLocaleString()}.</p>` : ''}
            ${(W.last || []).length ? `<span class="eyebrow">Last week’s medals</span><div class="wlast">${W.last.map(m => `<span><img src="${medalImg(m.place)}" alt="">${esc(m.name)} · ${m.score.toLocaleString()}</span>`).join('')}</div>` : ''}
            <div class="tmenu">${live ? `<button class="btn pri big" data-t="wresume">Back to your run<small>${fmtTime(o.race.end - Date.now())} left</small></button>` : ''}
            ${W.used_today ? `<button class="btn ${live ? '' : 'pri'} big" data-t="wpractice" ${UI.wbusy ? 'disabled' : ''}>Practice run<small>Doesn’t count. Your next ranked run opens in ${fmtLeft(nextDay)}</small></button>`
              : `<button class="btn ${live ? '' : 'pri'} big" data-t="wstart" ${UI.wbusy ? 'disabled' : ''}>${UI.wbusy ? 'Starting…' : 'Start today’s ranked run'}<small>15 minutes on the clock after a 5-second countdown. Your own farms stay safe.</small></button>`}</div>`}
        ${W.off || W.loading ? '' : `<span class="eyebrow">Playing as</span><div class="opts tname">${nameHTML()}</div>`}
        ${UI.werr ? `<p class="hint err">${esc(UI.werr)}</p>` : ''}
        <div class="tmenu"><button class="btn ghost" data-t="main">Back</button></div></div>`; }
    else if (t === 'weeklygo') { const R = S.race || {}, th = weekTheme(R.week);
      h = `<div class="tcard"><span class="twel">${R.ranked ? 'Ranked run' : 'Practice run'} · ${weekLabel(R.week)}</span><h2>${esc(th.name)}</h2><div class="racecount" id="rcount">5</div>
        <p class="sub">${esc(th.blurb)}</p><span class="eyebrow">This week’s head start (the same for everyone)</span><p class="sub">${esc((R.kit || []).join(' · '))}</p>
        <p class="hint small">15 minutes. Score comes from harvests, crafting, sales, orders and contracts; this week’s bonus makes some worth much more.</p></div>`; }
    else if (t === 'weeklyend') { const R = S.race || {}, W = UI.wk || {}, th = weekTheme(R.week);
      h = `<div class="tcard"><span class="twel">${esc(th.name)} · ${weekLabel(R.week)}</span><h2>Time! ${(R.final || 0).toLocaleString()} points</h2>
        <p class="sub">${R.ranked ? (W.mine ? `Your best this week is <b>${W.mine.score.toLocaleString()}</b>, #${W.mine.rank} of ${W.players}. ${W.mine.rank <= 3 ? 'Medal position! Hold on to it until the week closes.' : 'The top three win medals when the week closes.'}` : 'Your ranked score is in.') : 'Practice run: this one doesn’t count, but it’s the same farm everyone gets this week.'}</p>
        ${(W.top || []).length ? `<ol class="rresults wboard">${W.top.slice(0, 5).map(p => `<li class="${p.me ? 'me' : ''}"><b>${esc(p.name)}</b><span>${p.score.toLocaleString()}</span></li>`).join('')}</ol>` : ''}
        <div class="tmenu"><button class="btn pri big" data-t="wleave">Back to my farm</button><button class="btn big" data-t="weekly">This week’s board</button></div></div>`; }
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
    else if (t === 'name') h = `<div class="tcard"><h2>Name your farmer</h2>
        <label class="field tname">Name <input id="tname" maxlength="14" placeholder="Farmer" autocomplete="off" value="${esc(UI.tnameDraft || '')}"></label>
        <div class="modepick">${['online', 'private'].map(m => `<button class="modeopt ${(UI.newMode || 'online') === m ? 'on' : ''}" data-t="pickmode" data-m="${m}"><b>${MODES[m].name}</b><small>${MODES[m].blurb}</small></button>`).join('')}</div>
        <div class="tmenu"><button class="btn pri big" data-t="go-tut">Start with a quick tutorial<small>About two minutes. Skip any time.</small></button>
        <button class="btn big" data-t="go">Start without the tutorial</button>${back}</div></div>`;
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
      const m = D.milestones[S.ms];
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
  function startNewFarm(name, tut) {
    if (UI.newSlot != null) { if (!S.race) save(); setSlot(UI.newSlot); UI.newSlot = null; }
    if (S.race) { if (!S.race.weekly) try { localStorage.removeItem(RINFO); localStorage.removeItem(RACE_KEY); } catch (e) { } S.race = null; }
    try { localStorage.removeItem(saveKey()); } catch (e) { }
    newState(); S.mode = UI.newMode || 'online'; migrate(); S.name = name || 'Farmer'; S.seenUpdate = latest().v; UI.tnameDraft = '';
    UI.yaw = 0; UI.yawTo = null; UI.tilt = 1; setView(0, 1); centerOn(homeIdx()); UI.sel = -1; UI.drawer = null; UI.html = {}; UI.logOpen = null;
    UI.hadSave = true; closeTitle(); save();
    if (tut) startTut(); else toast(`<b>Welcome to Harvest Valley, ${esc(S.name)}.</b> Follow the goal card at the top left to get your homestead going.`, 'goal');
  }
  titleEl.addEventListener('click', e => {
    const el = e.target.closest('[data-t]'); if (!el) return; const a = el.dataset.t;
    if (a === 'main') { UI.newSlot = null; openTitle('main'); }
    else if (a === 'continue') closeTitle();
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
    else if (a === 'go' || a === 'go-tut') { const n = ($('#tname') || {}).value; startNewFarm((n || '').trim(), a === 'go-tut'); }
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
  window.HW = { weekTest(w) { newState(); migrate(); S.race = { weekly: true, week: w, code: 'W' + w, target: 0, start: 0, end: 0, seen: {} }; weeklyPreset(w); return S; }, weekTheme: w => weekTheme(w).id, weekLabel: w => weekLabel(w), raceTest(code) { newState(); migrate(); S.race = { code, target: 500, start: 0, seen: {} }; racePreset(code); return S; }, get state() { return S; }, select(i) { UI.sel = i; dirty(); }, focus(i) { centerOn(i); clampCam(); }, screenOf(i) { const [x, y] = toScreen(tx(i), ty(i)); return [x / DPR, y / DPR]; }, get sel() { return UI.sel; }, TASKS, checkTask, queueTask, update, newState: () => newState() };
  const h = window.claude && window.claude.hot;
  if (h && h.ready) h.ready(d => boot(d)); else boot(h && h.data);
})();
