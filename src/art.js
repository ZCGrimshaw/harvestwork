/* Harvestworks — placeholder pixel art.
   Every sprite is drawn in code at native pixel size and cached. The renderer only calls
   HW_ART.get(key) / HW_ART.icon(itemId), so a final asset pack can replace this file
   with image-backed sprites using the same keys and sizes. */
window.HW_ART = (function () {
  const cache = {};
  function mk(w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const r = (col, x, y, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x | 0, y | 0, ww, hh); };
    fn(g, r); return c;
  }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hwAt = y => (y < 8 ? (y + 1) * 2 : (16 - y) * 2);
  function ell(r, col, cx, cy, rx, ry) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx + .01) + (y * y) / (ry * ry + .01) <= 1.08) r(col, cx + x, cy + y);
  }
  function line(r, col, x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) r(col, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n));
  }

  /* ---------- ground tiles: 32×20 (16px diamond top + 4px skirt) ---------- */
  function ground(top, specks, s1, s2, seed, extra) {
    return mk(32, 20, (g, r) => {
      for (let y = 0; y < 16; y++) { const hw = hwAt(y); r(s1, 16 - hw, y + 4, hw, 1); r(s2, 16, y + 4, hw, 1); }
      for (let y = 0; y < 16; y++) { const hw = hwAt(y); r(top, 16 - hw, y, hw * 2, 1); }
      const R = rng(seed);
      for (let k = 0; k < 18; k++) {
        const y = 1 + ((R() * 14) | 0), hw = hwAt(y);
        const x = 16 - hw + 1 + ((R() * (hw * 2 - 2)) | 0);
        r(specks[k % specks.length], x, y, R() < .4 ? 2 : 1, 1);
      }
      if (extra) extra(g, r, R);
    });
  }
  function furrows(dark, light) {
    return (g, r) => {
      for (let y = 1; y < 15; y++) { const hw = hwAt(y) - 2;
        for (let x = 16 - hw; x < 16 + hw; x++) {
          const k = Math.floor(y - x / 2 + 40) % 4;
          if (k === 0) r(dark, x, y); else if (k === 1 && light) r(light, x, y);
        } }
    };
  }
  const SIDE = ['#8a5a32', '#6e4425'];
  const G = {
    grass: s => ground('#7cc04b', ['#93d35c', '#5fa23a', '#a6dc6a', '#6fb440'], SIDE[0], SIDE[1], 11 + s,
      (g, r, R) => { if (s === 2) { r('#f6e27a', 9, 9); r('#f2f2f2', 22, 6); r('#f6e27a', 18, 11); } }),
    forest: s => ground('#5f9e3c', ['#4c8a30', '#73b34a', '#3f7a2a'], SIDE[0], SIDE[1], 31 + s),
    water: s => ground('#4aa3d8', ['#7cc4ea', '#3a8cc4', '#9ad6f2'], '#2f6f9a', '#265c80', 51 + s),
    boulder: s => ground('#b3a37a', ['#9c8c66', '#c7b98f', '#8a7a58'], '#7a6a4a', '#60523a', 71 + s),
    flowers: s => ground('#8ccc58', ['#e86aa8', '#9bd462', '#f6e27a', '#6fb440', '#b48ae8', '#f2f2f2', '#e86aa8', '#f6e27a'], SIDE[0], SIDE[1], 111 + s),
    clay:    s => ground('#c98a5a', ['#b5764a', '#d8a06e', '#a8683e', '#7cc04b'], '#9a5e3a', '#7e4a2c', 121 + s),
    reeds:   s => ground('#6a9a5a', ['#5a8a4c', '#4a8aa8', '#7aaa62', '#3f7aa0'], '#4a6a3a', '#3a5a2e', 131 + s),
    ore:     s => ground('#9a8a7a', ['#86766a', '#b0a090', '#a8603a', '#6e5e52'], '#6e5e4e', '#56483c', 141 + s),
    farm_raw: () => ground('#a87444', ['#946238', '#bb8652', '#7cc04b'], SIDE[0], SIDE[1], 91),
    farm_tilled: () => ground('#80502b', ['#8e5c33'], SIDE[0], SIDE[1], 92, furrows('#5e3519', '#966238')),
    farm_wet: () => ground('#5c3820', ['#4c2e1a'], SIDE[0], SIDE[1], 93, furrows('#432612', '#6b4426')),
    // the Valley Green: a mown lawn (stripes) and sandstone paving
    lawn: s => ground('#7cc04b', ['#93d35c', '#6fb440'], SIDE[0], SIDE[1], 151 + s,
      (g, r) => { for (let y = 1; y < 15; y++) { const hw = hwAt(y) - 1; for (let x = 16 - hw; x < 16 + hw; x++) if (Math.floor((x + 2 * y) / 6) % 2) r('#6fb440', x, y); } }),
    plaza: s => ground('#dccb9c', ['#e8daae', '#cdb985'], '#a8916a', '#8a7552', 161 + s,
      (g, r) => { for (let y = 1; y < 15; y++) { const hw = hwAt(y) - 1; for (let x = 16 - hw; x < 16 + hw; x++) { const u = x / 2 + y, v = x / 2 - y + 40;
        if (Math.abs(u % 4) < .5 || Math.abs(v % 4) < .5) r('#c4ae7c', x, y); } } })
  };

  /* ---------- structures: 32 wide, bottom row sits 4px below tile centre ---------- */
  function shadow(r, h, rx = 11) { ell(r, 'rgba(30,20,10,.28)', 16, h - 5, rx, 3); }
  const OBJ = {
    homestead: () => mk(32, 38, (g, r) => {
      shadow(r, 38, 13);
      r('#f0d6a0', 6, 19, 10, 15); r('#d7b57c', 16, 19, 10, 15);
      r('#c9a36b', 6, 33, 20, 1);
      for (let i = 0; i < 13; i++) { const hw = Math.min(4 + i, 13); r('#d4553f', 16 - hw, 7 + i, hw, 1); r('#b0402f', 16, 7 + i, hw, 1); }
      r('#e87a5a', 15, 7, 2, 1); r('#e87a5a', 14, 8, 2, 1);
      r('#8a5a3a', 21, 3, 3, 7); r('#6b4226', 21, 3, 3, 1);
      r('#7a4a26', 9, 25, 5, 9); r('#5e3519', 9, 25, 5, 1); r('#f6e27a', 12, 29);
      r('#5e3a20', 18, 23, 6, 5); r('#9fd8f0', 19, 24, 4, 3); r('#d8f2fb', 19, 24, 1, 1);
      r('#5aa83f', 4, 31, 3, 3); r('#d6334a', 5, 31);
    }),
    stove: () => mk(32, 32, (g, r) => {
      shadow(r, 32, 11);
      r('#b5523b', 8, 13, 8, 15); r('#97412e', 16, 13, 8, 15);
      for (let y = 15; y < 28; y += 3) r('#7e3426', 8, y, 16, 1);
      r('#8a8a94', 7, 11, 18, 3); r('#b0b0b8', 7, 11, 18, 1);
      r('#7a7a84', 19, 2, 4, 9); r('#5c5c66', 19, 2, 4, 1);
      r('#2a1a14', 11, 18, 7, 7); r('#3d2618', 11, 18, 7, 1);
    }),
    stove_on: () => mk(32, 32, (g, r) => {
      g.drawImage(OBJ.stove(), 0, 0);
      r('#f0a030', 12, 21, 5, 4); r('#f6e27a', 13, 22, 3, 2); r('#d6334a', 12, 24, 5, 1);
    }),
    market: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 13);
      r('#7a4b28', 6, 12, 2, 20); r('#5e3519', 24, 12, 2, 20);
      r('#c98a4a', 5, 24, 22, 5); r('#a8703a', 5, 28, 22, 2);
      for (let i = 0; i < 8; i++) r(i % 2 ? '#f6efd8' : '#d6334a', 4 + i * 3, 8, 3, 6);
      for (let i = 0; i < 8; i++) r(i % 2 ? '#f6efd8' : '#d6334a', 5 + i * 3, 14, 2, 1);
      r('#a8323f', 4, 7, 24, 1);
      ell(r, '#f08a24', 9, 22, 2, 1); ell(r, '#5aa83f', 15, 22, 2, 1); ell(r, '#d6334a', 21, 22, 2, 1);
      r('#e8c04a', 11, 23, 2, 1); r('#f6e27a', 18, 22);
    }),
    board: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 10);
      r('#6b4220', 9, 18, 2, 14); r('#55331a', 21, 18, 2, 14);
      r('#7a4b28', 6, 6, 20, 15); r('#b07a42', 7, 7, 18, 13);
      r('#f6efd8', 9, 9, 5, 5); r('#f6efd8', 16, 8, 6, 4); r('#fff6e0', 15, 13, 5, 5); r('#f6efd8', 21, 14, 3, 4);
      r('#d6334a', 11, 9); r('#d6334a', 18, 8); r('#4aa3d8', 17, 13); r('#e8c04a', 22, 14);
      r('#c9b48a', 10, 11, 3, 1); r('#c9b48a', 17, 10, 4, 1); r('#c9b48a', 16, 15, 3, 1);
      r('#5e3519', 6, 5, 20, 1);
    }),
    mill: f => mk(32, 42, (g, r) => {
      shadow(r, 42, 10);
      for (let y = 0; y < 20; y++) { const hw = 5 + (y / 4 | 0); r('#e2d8c6', 16 - hw, 18 + y, hw, 1); r('#c4b9a4', 16, 18 + y, hw, 1); }
      for (let i = 0; i < 7; i++) { r('#7a4b28', 16 - (6 - i), 12 + i, (6 - i) * 2, 1); }
      r('#8a5a2e', 9, 18, 14, 1);
      r('#7a4a26', 14, 30, 4, 8); r('#9fd8f0', 15, 22, 2, 2);
      const C = [16, 16];
      const arms = f ? [[-8, -8], [8, 8], [-8, 8], [8, -8]] : [[0, -10], [0, 10], [-10, 0], [10, 0]];
      arms.forEach(([dx, dy]) => { line(r, '#6b4226', C[0], C[1], C[0] + dx, C[1] + dy); line(r, '#f2ead8', C[0] + (dy ? 1 : 0), C[1] + (dx ? 1 : 0), C[0] + dx + (dy ? 1 : 0), C[1] + dy + (dx ? 1 : 0)); });
      r('#3d2618', 15, 15, 2, 2);
    }),
    sawmill: f => mk(32, 34, (g, r) => {
      shadow(r, 34, 13);
      r('#b07a42', 5, 16, 11, 14); r('#94622f', 16, 16, 11, 14);
      for (let x = 6; x < 27; x += 3) r('#7a4b28', x, 17, 1, 13);
      for (let i = 0; i < 6; i++) r(i < 3 ? '#8a8a94' : '#6e6e78', 3 + i * 0, 10 + i, 26, 1);
      r('#b0b0b8', 3, 10, 26, 1);
      ell(r, '#c8ccd4', 21, 24, 4, 4); ell(r, '#9aa0aa', 21, 24, 2, 2); r('#3d3d46', 21, 24);
      const t = f ? 0 : 1; for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4 + t * .4; r('#e8ecf2', 21 + Math.round(Math.cos(ang) * 5), 24 + Math.round(Math.sin(ang) * 5)); }
      ell(r, '#8a5a2e', 8, 30, 2, 2); ell(r, '#e2bf86', 8, 30, 1, 1); ell(r, '#8a5a2e', 12, 31, 2, 2); ell(r, '#e2bf86', 12, 31, 1, 1);
    }),
    preserver: () => mk(32, 32, (g, r) => {
      shadow(r, 32, 12);
      r('#8a5a2e', 5, 16, 9, 13); r('#6e4425', 10, 16, 4, 13); r('#4a4a52', 5, 19, 9, 1); r('#4a4a52', 5, 25, 9, 1); r('#a8703a', 5, 15, 9, 1);
      r('#7a4b28', 15, 13, 13, 2); r('#7a4b28', 15, 22, 13, 2); r('#5e3519', 15, 13, 1, 16); r('#5e3519', 27, 13, 1, 16);
      [['#c22a44', 17], ['#f08a24', 21], ['#6fb33a', 25]].forEach(([c, x]) => { r('#e8e0d0', x - 1, 16, 3, 1); r(c, x - 1, 17, 3, 5); r('#ffffff', x - 1, 17); });
      [['#e8c04a', 17], ['#c22a44', 22]].forEach(([c, x]) => { r(c, x - 1, 25, 3, 4); r('#e8e0d0', x - 1, 24, 3, 1); });
    }),
    workbench: () => mk(32, 30, (g, r) => {
      shadow(r, 30, 12);
      r('#7a4b28', 7, 18, 2, 8); r('#5e3519', 23, 18, 2, 8); r('#7a4b28', 12, 20, 2, 6);
      r('#d09a58', 5, 15, 22, 3); r('#a8703a', 5, 18, 22, 1);
      r('#6e6e78', 8, 12, 6, 2); r('#7a4b28', 10, 14, 1, 1); r('#9aa0aa', 16, 13, 8, 1); r('#7a4b28', 23, 12, 2, 2);
      r('#e2bf86', 6, 21, 4, 1); r('#e2bf86', 18, 22, 6, 1);
    }),
    tree: () => mk(32, 40, (g, r) => {
      shadow(r, 40, 9);
      r('#7a4b28', 15, 24, 3, 12); r('#5e3519', 17, 24, 1, 12);
      ell(r, '#3f7a2a', 16, 17, 10, 9); ell(r, '#4c8a30', 15, 15, 8, 7); ell(r, '#5aa83f', 13, 12, 5, 4); ell(r, '#7cc04b', 12, 10, 2, 2);
      r('#d6334a', 20, 18); r('#d6334a', 10, 19);
    }),
    stump: () => mk(32, 24, (g, r) => {
      shadow(r, 24, 6);
      r('#7a4b28', 13, 13, 6, 6); r('#5e3519', 17, 13, 2, 6); ell(r, '#e2bf86', 16, 13, 3, 1); r('#b08050', 16, 13);
      r('#5aa83f', 20, 17, 2, 1); r('#5aa83f', 11, 18);
    }),
    sapling: () => mk(32, 24, (g, r) => {
      r('#7a4b28', 16, 12, 1, 7); ell(r, '#5aa83f', 14, 11, 2, 1); ell(r, '#7cc04b', 18, 9, 2, 1); r('#4c8a30', 16, 7, 1, 2);
    }),
    rocks: n => mk(32, 28, (g, r) => {
      shadow(r, 28, 11);
      const spots = [[16, 18, 7, 5], [9, 21, 4, 3], [23, 21, 4, 3], [13, 23, 3, 2]].slice(0, Math.max(1, n));
      if (n === 0) { ell(r, '#8a8a92', 12, 22, 2, 1); ell(r, '#8a8a92', 19, 21, 2, 1); return; }
      spots.forEach(([x, y, rx, ry]) => { ell(r, '#6e6e78', x + 1, y + 1, rx, ry); ell(r, '#a3a3ab', x, y, rx, ry); ell(r, '#c8c8ce', x - (rx / 3 | 0), y - (ry / 2 | 0), (rx / 2 | 0) || 1, (ry / 2 | 0) || 1); });
    }),
    sprinkler: f => mk(32, 30, (g, r) => {
      shadow(r, 30, 6);
      r('#7a7a84', 14, 16, 4, 10); r('#5c5c66', 16, 16, 2, 10); r('#9aa0aa', 12, 24, 8, 2);
      r('#c8ccd4', 13, 13, 6, 3); r('#4aa3d8', 15, 12, 2, 1);
      if (f) { // spray arcs
        [[-1, 1], [1, 1]].forEach(([sx]) => { for (let k = 0; k < 6; k++) r(k % 2 ? '#bfe6f8' : '#8fd3ef', 16 + sx * (3 + k * 2), 11 + Math.round(k * k / 5)); });
        r('#bfe6f8', 16, 8); r('#8fd3ef', 16, 6);
      }
    }),
    /* animal buildings: f is the animation frame (0/1) so the animals shuffle about */
    coop: f => mk(32, 32, (g, r) => { f = f | 0;
      shadow(r, 32, 12);
      r('#c98a4a', 9, 14, 8, 11); r('#a8703a', 17, 14, 7, 11);
      for (let i = 0; i < 7; i++) { r('#c8483a', 16 - (3 + i), 7 + i, 3 + i, 1); r('#a8323f', 16, 7 + i, 3 + i, 1); }
      r('#2a1a14', 12, 18, 3, 4); line(r, '#7a4b28', 12, 22, 8, 27); r('#f2ead8', 19, 16, 3, 2);
      const hen = (x, y, peck) => { ell(r, '#f8f6ee', x, y, 2, 2); r('#f8f6ee', x + 2, y - 2 - (peck ? -1 : 0), 2, 2); r('#c22a2a', x + 2, y - 3 - (peck ? -1 : 0), 1, 1); r('#f0a030', x + 4, y - 1 - (peck ? -1 : 0)); r('#f0a030', x, y + 2, 1, 1); };
      hen(f ? 5 : 6, 27, f); hen(f ? 21 : 20, 28, !f);
    }),
    dairy: f => mk(32, 36, (g, r) => { f = f | 0;
      shadow(r, 36, 13);
      r('#c8483a', 9, 18, 9, 12); r('#a8323f', 18, 18, 9, 12);
      for (let i = 0; i < 9; i++) { r('#6b4226', 18 - (3 + i), 9 + i, 3 + i, 1); r('#55331a', 18, 9 + i, 3 + i, 1); }
      r('#f2ead8', 12, 22, 5, 8); r('#c8483a', 13, 23, 3, 7); line(r, '#f2ead8', 13, 23, 15, 29);
      // a cow beside the barn, grazing on frame 1
      r('#f8f6ee', 2, 26, 8, 5); r('#2a2a30', 3, 27, 2, 2); r('#2a2a30', 7, 26, 2, 2); r('#f8f6ee', 2, 31, 1, 2); r('#f8f6ee', 8, 31, 1, 2);
      r('#f8f6ee', f ? 0 : 0, f ? 29 : 24, 3, 3); r('#e8a0a0', 0, f ? 31 : 26, 2, 1); r('#2a2a30', 1, f ? 28 : 23, 1, 1);
    }),
    pasture: f => mk(32, 32, (g, r) => { f = f | 0;
      // a rail fence along the back edges of the tile, a corner post at the front, and three sheep grazing
      const rail = (x0, y0, x1, y1) => { line(r, '#dcaa68', x0, y0 - 3, x1, y1 - 3); line(r, '#c99a5a', x0, y0 - 1, x1, y1 - 1); };
      rail(3, 27, 16, 20); rail(16, 20, 29, 27);
      [[3, 27], [9, 24], [16, 20], [23, 24], [29, 27]].forEach(([x, y]) => r('#7a4b28', x, y - 5, 1, 5));
      const sheep = (x, y) => { ell(r, '#d8d0c0', x, y + 1, 3, 2); ell(r, '#f8f4ea', x, y, 3, 2); r('#3a3a40', x + 3, y - 1, 2, 2); r('#3a3a40', x - 2, y + 2, 1, 2); r('#3a3a40', x + 2, y + 2, 1, 2); };
      sheep(f ? 10 : 11, 25); sheep(f ? 21 : 20, 26); sheep(15, f ? 29 : 28);
    }),
    creamery: () => mk(32, 32, (g, r) => {
      shadow(r, 32, 12);
      r('#f2ece0', 7, 15, 9, 13); r('#d8d0c0', 16, 15, 9, 13);
      for (let i = 0; i < 8; i++) { r('#5a8ab8', 16 - (3 + i), 7 + i, 3 + i, 1); r('#4a7aa8', 16, 7 + i, 3 + i, 1); }
      r('#7a4b28', 10, 20, 4, 8); r('#8ab8d8', 18, 18, 4, 3);
      r('#a8743e', 24, 22, 5, 7); r('#7a4b28', 24, 21, 5, 1); r('#7a4b28', 26, 18, 1, 3); r('#f6dc6a', 25, 23, 3, 1);
    }),
    // a Weekly Challenge medal on a little wooden stand: 1 gold, 2 silver, 3 bronze
    medal: place => mk(32, 32, (g, r) => {
      const C = { 1: ['#f6d24a', '#c99a1e', '#fff3b0'], 2: ['#d8dde4', '#9aa2ae', '#ffffff'], 3: ['#d98a4a', '#9a5a2a', '#f4c08a'] }[place] || ['#f6d24a', '#c99a1e', '#fff3b0'];
      shadow(r, 32, 9);
      r('#7a4b28', 10, 25, 12, 3); r('#5e3519', 10, 27, 12, 1); r('#9a6a3c', 15, 13, 2, 12);
      r('#3d6fb8', 12, 4, 3, 9); r('#c23a3a', 17, 4, 3, 9); r('#2c528a', 13, 4, 1, 9); r('#962a2a', 18, 4, 1, 9);
      ell(r, C[1], 16, 15, 5, 5); ell(r, C[0], 16, 15, 4, 4); r(C[2], 14, 13, 2, 1); r(C[2], 13, 14, 1, 2);
      r(C[1], 15, 14, 2, 3); r(C[1], 16, 13, 1, 1);
    }),
    big_sprinkler: f => mk(32, 32, (g, r) => {
      shadow(r, 32, 7);
      r('#9a5a2e', 14, 15, 4, 12); r('#7a4a26', 16, 15, 2, 12); r('#d9824a', 11, 25, 10, 3);
      r('#e8a070', 12, 12, 8, 3); r('#4aa3d8', 15, 11, 2, 1); r('#d9824a', 10, 13, 2, 1); r('#d9824a', 20, 13, 2, 1);
      if (f) { [-1, 1].forEach(sx => { for (let k = 0; k < 8; k++) r(k % 2 ? '#bfe6f8' : '#8fd3ef', 16 + sx * (3 + k * 2), 10 + Math.round(k * k / 6)); });
        r('#bfe6f8', 16, 7); r('#8fd3ef', 16, 5); r('#bfe6f8', 16, 3); }
    }),
    compost: () => mk(32, 28, (g, r) => {
      shadow(r, 28, 11);
      r('#8a5a2e', 6, 13, 20, 12); r('#6e4425', 16, 13, 10, 12);
      for (let x = 7; x < 26; x += 4) r('#5e3519', x, 13, 1, 12);
      ell(r, '#4f6a24', 16, 13, 9, 2); r('#7a9a3a', 10, 12, 3, 1); r('#f08a24', 18, 12, 2, 1); r('#c99b5a', 14, 13, 2, 1);
    }),
    kiln: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 11);
      for (let y = 0; y < 16; y++) { const hw = 10 - (y / 3 | 0); r('#b5523b', 16 - hw, 14 + y, hw, 1); r('#97412e', 16, 14 + y, hw, 1); }
      for (let y = 16; y < 30; y += 3) r('#7e3426', 7, y, 18, 1);
      r('#8a8a94', 13, 4, 6, 11); r('#6e6e78', 16, 4, 3, 11); r('#5c5c66', 13, 4, 6, 1);
      r('#2a1a14', 12, 22, 8, 7); r('#f0a030', 13, 25, 6, 3); r('#f6e27a', 15, 26, 2, 1);
    }),
    oven: () => mk(32, 34, (g, r) => {
      shadow(r, 34, 12);
      for (let y = 0; y < 14; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 196 - (14 - y) * (14 - y))) * .8); r('#c9a07a', 16 - hw, 10 + y, hw, 1); r('#b0886a', 16, 10 + y, hw, 1); }
      r('#c9a07a', 5, 24, 11, 6); r('#b0886a', 16, 24, 11, 6); r('#8a6a4a', 5, 29, 22, 1);
      ell(r, '#2a1a14', 16, 23, 4, 3); r('#f0a030', 13, 24, 7, 2); r('#7a7a84', 21, 6, 3, 7);
    }),
    press: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 11);
      r('#7a4b28', 7, 6, 3, 26); r('#5e3519', 22, 6, 3, 26); r('#9a6a3c', 7, 6, 18, 3);
      r('#c8ccd4', 15, 9, 2, 8); r('#9aa0aa', 11, 17, 10, 2);
      r('#a8743e', 9, 20, 14, 9); r('#4a4a52', 9, 23, 14, 1); r('#4a4a52', 9, 27, 14, 1);
      ell(r, '#d23a3a', 13, 19, 1, 1); ell(r, '#7cc04b', 18, 19, 1, 1); r('#e8c060', 23, 28, 3, 3);
    }),
    loom: () => mk(32, 34, (g, r) => {
      shadow(r, 34, 12);
      r('#7a4b28', 5, 8, 2, 24); r('#5e3519', 25, 8, 2, 24); r('#9a6a3c', 5, 8, 22, 2); r('#9a6a3c', 5, 22, 22, 2);
      for (let x = 8; x < 25; x += 2) r('#efe6cf', x, 10, 1, 12);
      r('#d8c49a', 8, 14, 17, 4); r('#c9b48a', 8, 17, 17, 1); r('#7a4b28', 8, 26, 16, 2);
    }),
    hive: () => mk(32, 30, (g, r) => {
      shadow(r, 30, 9);
      r('#7a4b28', 12, 22, 2, 5); r('#7a4b28', 19, 22, 2, 5);
      for (let k = 0; k < 4; k++) { const w = 7 - Math.abs(k - 1.5) * 1.2 | 0; r(k % 2 ? '#d89a2a' : '#e8b040', 16 - w, 8 + k * 3.5, w * 2, 4); }
      r('#4a3a1a', 15, 18, 3, 2); r('#2a1a14', 22, 9); r('#2a1a14', 9, 13); r('#f6e27a', 23, 8); r('#f6e27a', 8, 12);
    }),
    shed: () => mk(32, 32, (g, r) => {
      shadow(r, 32, 12);
      r('#6e4425', 6, 14, 10, 14); r('#5e3519', 16, 14, 10, 14);
      for (let i = 0; i < 8; i++) { r('#3f5a24', 16 - (4 + i), 6 + i, 4 + i, 1); r('#2e4a1a', 16, 6 + i, 4 + i, 1); }
      r('#2a1a14', 9, 20, 5, 8); ell(r, '#8a5a2e', 22, 27, 3, 1);
      ell(r, '#c9a07a', 20, 25, 2, 1); ell(r, '#d8b48a', 24, 25, 1, 1); r('#f2ead8', 20, 26); r('#f2ead8', 24, 26);
    }),
    smokehouse: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 11);
      r('#8a6a4a', 8, 16, 8, 14); r('#6e5238', 16, 16, 8, 14);
      for (let y = 18; y < 30; y += 3) r('#5a4030', 8, y, 16, 1);
      for (let i = 0; i < 7; i++) { r('#5c5c66', 16 - (3 + i), 9 + i, 3 + i, 1); r('#4a4a52', 16, 9 + i, 3 + i, 1); }
      r('#7a7a84', 19, 3, 3, 8); r('#a8703a', 11, 21, 2, 4); r('#a8703a', 14, 21, 2, 4); r('#a8703a', 18, 21, 2, 4);
    }),
    brewhouse: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 12);
      // a brick firebox under a copper kettle with a tall flue, and a barrel beside it
      r('#b5523b', 6, 22, 16, 9); r('#97412e', 14, 22, 8, 9); for (let y = 24; y < 31; y += 3) r('#7e3426', 6, y, 16, 1);
      r('#2a1a14', 9, 26, 5, 4); r('#f06a20', 10, 27, 3, 2);
      ell(r, '#d9824a', 14, 18, 8, 5); ell(r, '#b8642e', 17, 19, 5, 3); r('#f0b080', 9, 16, 3, 1); r('#9a5a2e', 6, 21, 16, 1);
      r('#d9824a', 12, 9, 4, 4); r('#b8642e', 14, 9, 2, 4); r('#c8ccd4', 18, 3, 3, 12); r('#9aa0aa', 20, 3, 1, 12); r('#7a7a84', 18, 3, 3, 1);
      ell(r, '#8a5a2e', 26, 28, 3, 4); r('#5e3519', 23, 26, 7, 1); r('#5e3519', 23, 30, 7, 1); r('#e0a030', 25, 25, 2, 1);
    }),
    smelter: () => mk(32, 38, (g, r) => {
      shadow(r, 38, 12);
      r('#8a8a94', 6, 18, 20, 14); r('#6e6e78', 16, 18, 10, 14); r('#b5523b', 6, 17, 20, 2);
      r('#7a7a84', 18, 2, 5, 16); r('#5c5c66', 21, 2, 2, 16); r('#4a4a52', 18, 2, 5, 1);
      r('#2a1a14', 9, 22, 8, 7); r('#f06a20', 10, 24, 6, 4); r('#f6e27a', 12, 25, 2, 2); r('#d9824a', 19, 28, 5, 2);
    }),
    barn: () => mk(32, 36, (g, r) => {
      shadow(r, 36, 13);
      r('#c8483a', 5, 18, 11, 14); r('#a8323f', 16, 18, 11, 14);
      for (let i = 0; i < 10; i++) { r('#6b4226', 16 - (3 + i), 8 + i, 3 + i, 1); r('#55331a', 16, 8 + i, 3 + i, 1); }
      r('#f2ead8', 9, 22, 6, 10); r('#c8483a', 10, 23, 4, 8); line(r, '#f2ead8', 10, 23, 13, 30); line(r, '#f2ead8', 13, 23, 10, 30);
      r('#f2ead8', 19, 21, 4, 3); r('#2a1a14', 20, 22, 2, 1); r('#e8c04a', 6, 31, 3, 1);
    }),
    warehouse: () => mk(32, 38, (g, r) => {
      shadow(r, 38, 14);
      r('#b5523b', 3, 16, 13, 18); r('#97412e', 16, 16, 13, 18);
      for (let y = 18; y < 34; y += 3) r('#7e3426', 3, y, 26, 1);
      r('#6e6e78', 2, 12, 28, 4); r('#8a8a94', 2, 12, 28, 1);
      r('#5c5c66', 7, 24, 8, 10); for (let y = 25; y < 34; y += 2) r('#6e6e78', 7, y, 8, 1);
      r('#d9824a', 20, 20, 5, 4); r('#9fd8f0', 21, 21, 3, 2); r('#d9824a', 13, 9, 6, 3); r('#9a5a2e', 15, 10, 2, 1);
    }),
    // resources in surveyed areas, drawn by how much is left (0–4)
    blooms: n => mk(32, 26, (g, r) => {
      const spots = [[10, 15], [21, 13], [16, 19], [25, 19], [7, 20], [17, 10], [12, 22], [23, 23]].slice(0, n * 2);
      const C = ['#e86aa8', '#f6e27a', '#b48ae8', '#f2f2f2', '#f08a24', '#e86aa8', '#f6e27a', '#b48ae8'];
      if (!n) { r('#4c8a30', 12, 17, 1, 3); r('#4c8a30', 20, 15, 1, 3); r('#4c8a30', 16, 20, 1, 2); return; }
      spots.forEach(([x, y], k) => { r('#3f7a2a', x, y, 1, 4); r('#5aa83f', x - 1, y + 2); r('#5aa83f', x + 1, y + 1);
        r(C[k], x - 1, y - 2, 3, 3); r(C[k], x - 2, y - 1); r(C[k], x + 2, y - 1); r(C[k], x, y - 3); r('#fff6d0', x, y - 1); });
    }),
    claypit: n => mk(32, 24, (g, r) => {
      ell(r, '#8a4e2c', 16, 17, 8, 3); ell(r, '#a8683e', 16, 16, 7, 2);
      const lumps = [[11, 14], [20, 13], [15, 12], [22, 16]].slice(0, n);
      lumps.forEach(([x, y]) => { ell(r, '#9a5e3a', x + 1, y + 1, 3, 2); ell(r, '#d0905e', x, y, 3, 2); r('#e8b080', x - 1, y - 1, 2, 1); });
      if (n) { r('#7a4b28', 25, 9, 1, 7); r('#9aa0aa', 24, 15, 3, 2); }
    }),
    reedbed: n => mk(32, 28, (g, r) => {
      const cols = [[9, 22], [13, 24], [17, 21], [21, 24], [25, 22], [11, 26]].slice(0, Math.max(1, n * 2));
      cols.forEach(([x, y], k) => { const h = n ? 9 + (k % 3) * 2 : 3; r('#6f9a3a', x, y - h, 1, h); r('#8ab04a', x + 1, y - h + 2, 1, h - 2);
        if (n) { r('#7a4b28', x, y - h - 2, 1, 3); r('#5e3519', x, y - h - 2); } });
    }),
    orevein: n => mk(32, 28, (g, r) => {
      shadow(r, 28, 10);
      const spots = [[16, 18, 6, 4], [9, 21, 4, 3], [23, 21, 4, 3]].slice(0, Math.max(1, Math.min(3, n)));
      if (!n) { ell(r, '#7a6e66', 14, 21, 3, 1); return; }
      spots.forEach(([x, y, rx, ry]) => { ell(r, '#5e5650', x + 1, y + 1, rx, ry); ell(r, '#8a827a', x, y, rx, ry); ell(r, '#a8a098', x - 1, y - 1, (rx / 2 | 0) || 1, (ry / 2 | 0) || 1);
        r('#b0603a', x - 1, y, 2, 1); r('#c8783e', x + 1, y - 1); r('#8a4a2a', x, y + 1); });
    }),
    // stations found in new areas
    dyevat: () => mk(32, 28, (g, r) => {
      shadow(r, 28, 11);
      ell(r, '#5e3519', 16, 21, 9, 3); r('#7a4b28', 7, 13, 18, 8); r('#5e3519', 7, 13, 18, 1); for (let x = 9; x < 25; x += 4) r('#6b4220', x, 14, 1, 7);
      ell(r, '#4a2a6a', 16, 13, 8, 2); ell(r, '#9a4ac8', 16, 13, 7, 1); r('#c890e8', 13, 12, 2, 1);
      r('#9aa0aa', 6, 16, 2, 2); r('#9aa0aa', 24, 16, 2, 2); r('#7a4b28', 21, 4, 1, 9); r('#e86aa8', 24, 18); r('#f6e27a', 8, 20);
    }),
    potter: () => mk(32, 28, (g, r) => {
      shadow(r, 28, 10);
      r('#7a4b28', 8, 17, 2, 7); r('#7a4b28', 22, 17, 2, 7); r('#9a6a3c', 7, 15, 18, 3); r('#7a4b28', 7, 17, 18, 1);
      ell(r, '#6e6e78', 16, 15, 6, 1); ell(r, '#9aa0aa', 16, 14, 5, 1);
      r('#b5642e', 13, 8, 6, 6); r('#d0803e', 14, 7, 4, 1); r('#8a4a26', 13, 13, 6, 1); r('#e8a070', 14, 9, 1, 3);
      ell(r, '#c8703a', 26, 22, 2, 2); r('#8a4a26', 25, 20, 3, 1);
    }),
    forge: () => mk(32, 32, (g, r) => {
      shadow(r, 32, 12);
      r('#7a7a84', 6, 15, 20, 12); r('#5c5c66', 16, 15, 10, 12); for (let y = 17; y < 27; y += 3) r('#4a4a52', 6, y, 20, 1);
      r('#4a4a52', 18, 3, 5, 12); r('#3a3a42', 21, 3, 2, 12); r('#2a2a30', 18, 3, 5, 1);
      r('#2a1a14', 9, 19, 7, 6); r('#f06a20', 10, 21, 5, 4); r('#f6e27a', 12, 22, 2, 2);
      r('#3d3d46', 21, 22, 6, 2); r('#5c5c66', 22, 24, 4, 3); r('#9aa0aa', 21, 22, 6, 1);
    }),
    silo: () => mk(32, 46, (g, r) => {
      shadow(r, 46, 10);
      // a tall round silo with hoops, a domed metal cap, a ladder and a little hatch
      r('#d8d0b4', 9, 12, 14, 30); r('#bfb594', 16, 12, 7, 30); r('#ece6cf', 10, 12, 2, 30);
      for (let y = 15; y < 42; y += 5) { r('#9a9078', 9, y, 14, 1); }
      ell(r, '#8a8a94', 16, 12, 7, 4); ell(r, '#a8a8b2', 15, 11, 5, 3); r('#6e6e78', 15, 6, 2, 3); r('#5c5c66', 15, 5, 2, 1);
      for (let y = 14; y < 41; y += 2) r('#6b4226', 20, y, 3, 1); r('#55331a', 20, 14, 1, 27); r('#55331a', 22, 14, 1, 27);
      r('#7a4b28', 11, 33, 5, 8); r('#5e3519', 11, 33, 5, 1); r('#e8c04a', 15, 37, 1, 1);
      r('#e8c04a', 5, 40, 3, 2); r('#c99a2e', 6, 39, 1, 1); r('#e8c04a', 25, 41, 2, 1);
    }),
    coldcellar: () => mk(32, 30, (g, r) => {
      shadow(r, 30, 13);
      // a grassy earth mound with a stone arch, a heavy plank door and a vent pipe
      ell(r, '#6b4a2e', 16, 21, 13, 8); ell(r, '#4f8a3a', 16, 18, 12, 7); ell(r, '#62a548', 14, 16, 8, 4);
      r('#8a8a94', 9, 16, 14, 10); r('#a8a8b2', 9, 16, 14, 1); ell(r, '#8a8a94', 16, 16, 7, 4); ell(r, '#a8a8b2', 16, 15, 6, 2);
      r('#6e6e78', 10, 18, 1, 1); r('#6e6e78', 20, 20, 1, 1); r('#6e6e78', 12, 23, 1, 1);
      r('#5e3519', 12, 17, 8, 9); ell(r, '#5e3519', 16, 17, 4, 2); r('#7a4b28', 13, 17, 6, 9); r('#5e3519', 16, 17, 1, 9); r('#4a4a52', 13, 20, 6, 1); r('#e8c04a', 18, 22, 1, 1);
      r('#7a7a84', 23, 6, 3, 9); r('#5c5c66', 25, 6, 1, 9); r('#4a4a52', 22, 5, 5, 1);
      r('#bfe6ee', 4, 24, 1, 1); r('#ffffff', 27, 23, 1, 1);
    }),
    yard: () => mk(32, 30, (g, r) => {
      shadow(r, 30, 14);
      // a fenced yard: stacked logs, a stone heap and a crate of parts
      r('#7a4b28', 2, 22, 28, 1); r('#7a4b28', 2, 26, 28, 1); for (const x of [2, 9, 16, 23, 29]) { r('#5e3519', x, 20, 2, 9); r('#8a5a32', x, 20, 1, 1); }
      for (let k = 0; k < 3; k++) { ell(r, '#8a5a32', 7 + k * 4, 17, 2, 2); ell(r, '#c8a070', 7 + k * 4, 17, 1, 1); }
      for (let k = 0; k < 2; k++) { ell(r, '#8a5a32', 9 + k * 4, 14, 2, 2); ell(r, '#c8a070', 9 + k * 4, 14, 1, 1); }
      ell(r, '#7a7a84', 22, 18, 5, 3); ell(r, '#9a9aa4', 21, 17, 3, 2); ell(r, '#8a8a94', 24, 15, 3, 2); r('#b5b5bd', 20, 16, 1, 1);
      r('#9a6a3a', 13, 21, 6, 5); r('#7a4b28', 13, 21, 6, 1); r('#7a4b28', 15, 21, 1, 5); r('#d9824a', 17, 23, 1, 1);
    }),
    glassworks: () => mk(32, 34, (g, r) => {
      shadow(r, 34, 12);
      // brick beehive furnace with a glowing mouth, a chimney, and finished glass on a shelf
      ell(r, '#8a3e1e', 14, 21, 10, 9); ell(r, '#b5523b', 13, 20, 9, 8); ell(r, '#c8643e', 11, 17, 4, 3);
      for (let y = 15; y < 29; y += 3) r('#8a3e1e', 5, y, 18, 1);
      r('#7a7a84', 18, 4, 4, 10); r('#5c5c66', 20, 4, 2, 10); r('#4a4a52', 18, 4, 4, 1);
      ell(r, '#2a1a14', 13, 24, 4, 3); ell(r, '#f06a20', 13, 25, 3, 2); r('#f6e27a', 12, 25, 2, 1);
      r('#7a4b28', 23, 20, 7, 1); r('#5e3519', 24, 21, 1, 7); r('#5e3519', 29, 21, 1, 7);
      r('#bfe6ee', 24, 16, 2, 4); r('#7fb8c8', 24, 16, 2, 1); r('#e86aa8', 27, 15, 2, 5); r('#4aa3d8', 27, 17, 2, 1); r('#ffffff', 24, 17);
    }),
    carpenter: () => mk(32, 30, (g, r) => {
      shadow(r, 30, 12);
      // a long bench with a vice, a saw and planks, and a finished chair beside it
      r('#6b4220', 5, 18, 2, 9); r('#6b4220', 19, 18, 2, 9); r('#b07a42', 3, 15, 20, 3); r('#8a5a2e', 3, 17, 20, 1); r('#d8a868', 3, 15, 20, 1);
      r('#5e3519', 6, 23, 14, 1); r('#7a7a84', 3, 12, 3, 3); r('#5c5c66', 3, 14, 3, 1);
      r('#dcaa68', 8, 13, 9, 2); r('#9a6a3c', 8, 14, 9, 1); r('#c8ccd4', 17, 10, 4, 4); r('#7a4b28', 20, 9, 2, 2); for (let x = 17; x < 21; x += 2) r('#8a8f9a', x, 14);
      r('#c98a4a', 25, 13, 2, 14); r('#c98a4a', 25, 20, 6, 2); r('#8a5a2e', 25, 22, 6, 1); r('#8a5a2e', 29, 23, 2, 4); r('#8a5a2e', 26, 15, 1, 4); r('#8a5a2e', 25, 23, 2, 4);
      ell(r, '#e2bf86', 12, 27, 3, 1); r('#c8a070', 14, 26);
    }),
    house: () => mk(2, 2, () => {}), // real house sprites come from house() below; this entry lets snow days cap their roofs
    pondreeds: () => mk(32, 24, (g, r) => {
      r('#4c8a30', 6, 12, 1, 6); r('#5aa83f', 8, 13, 1, 5); r('#7a4b28', 6, 11, 1, 2);
      ell(r, '#5aa83f', 22, 16, 3, 1); r('#f2f2f2', 22, 15);
    })
  };

  /* ---------- crops: 32×24, ground diamond spans rows 8–24 ---------- */
  const SPOTS = [[16, 12], [10, 16], [22, 16], [16, 20]];
  function crop(kind, stage) {
    return mk(32, 26, (g, r) => {
      SPOTS.forEach(([x, y]) => {
        if (stage === 0) { r('#7cc04b', x, y - 1); r('#5aa83f', x - 1, y - 2); r('#5aa83f', x + 1, y - 2); return; }
        if (kind === 'carrot') {
          if (stage === 2) { r('#f08a24', x - 1, y - 1, 3, 2); r('#d06a1a', x + 1, y, 1, 1); }
          r('#4caf3a', x - 2, y - 4, 1, 3); r('#5ec24a', x, y - 5, 1, 4); r('#4caf3a', x + 2, y - 4, 1, 3);
          if (stage === 2) { r('#7cd05a', x - 1, y - 6); r('#7cd05a', x + 1, y - 6); }
        } else if (kind === 'potato') {
          ell(r, '#4c8a30', x, y - 3, 3, 2); ell(r, '#5aa83f', x - 1, y - 4, 2, 1);
          if (stage === 2) { r('#f2f2f2', x - 2, y - 5); r('#f2f2f2', x + 2, y - 4); r('#f6e27a', x, y - 6); r('#c99b5a', x + 2, y, 2, 1); }
        } else if (kind === 'wheat') {
          const c = stage === 2 ? '#e8c04a' : '#8ac04a', c2 = stage === 2 ? '#c99a2a' : '#6fa83a';
          for (let k = -2; k <= 2; k += 2) { r(c2, x + k, y - 6, 1, 6); r(c, x + k, y - (stage === 2 ? 9 : 7), 1, stage === 2 ? 4 : 2); }
        } else if (kind === 'tomatoes') {
          r('#6fa83a', x, y - 7, 1, 7); ell(r, '#4c8a30', x, y - 4, 2, 2);
          if (stage === 2) { r('#e0402a', x - 2, y - 3, 2, 2); r('#e0402a', x + 1, y - 5, 2, 2); r('#f06a50', x - 2, y - 3); }
        } else if (kind === 'pumpkins') {
          r('#5aa83f', x - 3, y - 1, 6, 1); ell(r, '#4c8a30', x - 2, y - 2, 2, 1);
          if (stage >= 1) ell(r, stage === 2 ? '#f08a24' : '#a8c04a', x + 1, y - 2, stage === 2 ? 3 : 2, 2);
          if (stage === 2) { r('#c96a1a', x + 1, y - 3, 1, 2); r('#5e3519', x + 1, y - 5, 1, 1); }
        } else if (kind === 'apples') {
          r('#7a4b28', x, y - 5, 1, 5); ell(r, '#3f7a2a', x, y - 7, 3, 3); ell(r, '#5aa83f', x - 1, y - 8, 2, 1);
          if (stage === 2) { r('#d23a3a', x - 2, y - 7); r('#d23a3a', x + 2, y - 6); r('#d23a3a', x, y - 9); }
        } else if (kind === 'flax') {
          for (let k = -1; k <= 1; k++) { r('#6f9a3a', x + k * 2, y - 6, 1, 6); if (stage === 2) r('#8aa0e8', x + k * 2, y - 7, 1, 1); }
        } else if (kind === 'pears' || kind === 'cherries' || kind === 'plums') {
          // small fruit trees like the apples, each with its own leaf shade and fruit
          const leaf = { pears: ['#4a8a2e', '#6ab84a'], cherries: ['#3a7a2a', '#5aa83f'], plums: ['#3f6a2a', '#5a9a3a'] }[kind];
          r('#7a4b28', x, y - 5, 1, 5); ell(r, leaf[0], x, y - 7, 3, 3); ell(r, leaf[1], x - 1, y - 8, 2, 1);
          if (stage === 2) {
            if (kind === 'pears') { r('#d8d050', x - 2, y - 7, 1, 2); r('#d8d050', x + 2, y - 6, 1, 2); r('#c8c040', x, y - 9); }
            else if (kind === 'cherries') { r('#b0182a', x - 2, y - 6); r('#b0182a', x - 1, y - 6); r('#c8203a', x + 2, y - 7); r('#b0182a', x + 1, y - 9); }
            else { r('#6a2a7a', x - 2, y - 7, 1, 2); r('#7a3a8a', x + 2, y - 6, 1, 2); r('#6a2a7a', x, y - 9); }
          }
        } else if (kind === 'corn') {
          const st = stage === 2 ? '#7aa83a' : '#8ac04a';
          for (let k = -1; k <= 1; k += 2) { r(st, x + k, y - (stage === 2 ? 9 : 6), 1, stage === 2 ? 9 : 6); r('#5a9a2a', x + k - 1, y - 4, 1, 1); r('#5a9a2a', x + k + 1, y - 5, 1, 1); }
          if (stage === 2) { r('#f2c832', x - 2, y - 6, 1, 3); r('#f2c832', x + 2, y - 7, 1, 3); r('#e8d8a0', x - 1, y - 10); r('#e8d8a0', x + 1, y - 10); }
        } else if (kind === 'onions') {
          r('#5ec24a', x - 1, y - 5, 1, 4); r('#4caf3a', x + 1, y - 6, 1, 5);
          if (stage === 2) { ell(r, '#c87aa8', x, y - 1, 2, 1); r('#e8b0d0', x - 1, y - 1); }
        } else if (kind === 'peppers') {
          r('#5a9a2a', x, y - 6, 1, 6); ell(r, '#4c8a30', x, y - 5, 2, 2);
          if (stage === 2) { r('#d8301e', x - 2, y - 4, 1, 2); r('#e8c020', x + 2, y - 5, 1, 2); r('#3f8a3a', x + 1, y - 2, 1, 2); }
        } else if (kind === 'cabbage') {
          ell(r, '#4c8a30', x, y - 2, stage === 2 ? 3 : 2, 2); ell(r, '#8ac05a', x, y - 3, stage === 2 ? 2 : 1, stage === 2 ? 2 : 1);
          if (stage === 2) r('#b8e08a', x - 1, y - 4);
        } else if (kind === 'hops') {
          r('#7a5a38', x, y - (stage === 2 ? 10 : 7), 1, stage === 2 ? 10 : 7); r('#5aa83f', x - 1, y - 5); r('#5aa83f', x + 1, y - 7);
          if (stage === 2) { r('#b8d870', x - 1, y - 8, 1, 2); r('#b8d870', x + 1, y - 5, 1, 2); r('#a8c860', x - 1, y - 3, 1, 2); }
        } else if (kind === 'berries') {
          ell(r, '#3f7a2a', x, y - 3, 3, 3); ell(r, '#4c8a30', x - 1, y - 4, 2, 2);
          if (stage === 2) { r('#d6334a', x - 2, y - 3); r('#d6334a', x + 1, y - 5); r('#e8506a', x + 2, y - 2); r('#d6334a', x, y - 1); }
        }
      });
    });
  }

  /* ---------- avatar: 12×20 ---------- */
  const SHIRTS = ['#d6334a', '#4aa3d8', '#5aa83f', '#e8c04a', '#9a5ad6', '#f08a24'];
  const HATS = ['#e8c04a', '#7a4b28', '#d6334a', '#3d5a9a'];
  function avatar(shirt, hat, frame, work) {
    return mk(12, 20, (g, r) => {
      ell(r, 'rgba(30,20,10,.3)', 6, 19, 4, 1);
      const lo = frame ? 1 : 0;
      r('#3d5a9a', 4, 14, 2, 4 - lo); r('#3d5a9a', 7, 14, 2, 3 + lo);
      r('#4a2a1a', 4, 18 - lo, 2, 1); r('#4a2a1a', 7, 17 + lo, 2, 1);
      r(SHIRTS[shirt], 3, 9, 7, 6); r('rgba(0,0,0,.18)', 8, 9, 2, 6);
      if (work) { r('#f2c79a', 10, 8, 1, 3); r('#f2c79a', 2, 10, 1, 3); }
      else { r('#f2c79a', 2, 10, 1, 3); r('#f2c79a', 10, 10, 1, 3); }
      r('#f2c79a', 4, 4, 5, 5); r('#6b3a1e', 4, 4, 1, 3); r('#2a1a14', 5, 6); r('#2a1a14', 7, 6); r('#e8907a', 8, 7);
      r(HATS[hat], 2, 3, 9, 1); r(HATS[hat], 4, 1, 5, 2); r('rgba(0,0,0,.2)', 4, 2, 5, 1);
    });
  }

  /* ---------- item icons: 16×16 ---------- */
  function icon(shape, a, b) {
    return mk(16, 16, (g, r) => {
      switch (shape) {
        case 'seed': r('#7a4b28', 4, 4, 8, 1); r(b, 3, 5, 10, 9); r('#a8865a', 3, 13, 10, 1); r('#5e3519', 6, 3, 4, 1); ell(r, a, 8, 9, 2, 2); r('#fff', 7, 8); break;
        case 'sapling': r('#7a4b28', 5, 11, 6, 4); r('#5e3519', 5, 11, 6, 1); r('#5e3519', 8, 6, 1, 5); ell(r, a, 6, 6, 2, 1); ell(r, '#7cc04b', 10, 4, 2, 1); break;
        case 'sack': ell(r, a, 8, 10, 5, 5); r(b, 6, 3, 4, 3); r('#7a4b28', 6, 5, 4, 1); ell(r, 'rgba(255,255,255,.35)', 6, 9, 1, 2); break;
        case 'root': for (let i = 0; i < 8; i++) r(a, 5 + (i / 3 | 0), 6 + i, Math.max(1, 5 - (i / 2 | 0)), 1); r('#d06a1a', 7, 9, 2, 1); r('#d06a1a', 8, 12); r(b, 6, 2, 1, 4); r(b, 8, 1, 1, 5); r(b, 10, 3, 1, 3); break;
        case 'tuber': ell(r, a, 8, 9, 5, 4); r(b, 6, 8); r(b, 10, 10); r(b, 9, 7); ell(r, 'rgba(255,255,255,.25)', 6, 7, 2, 1); break;
        case 'grain': r(b, 7, 6, 1, 9); r(b, 9, 7, 1, 8); for (let y = 1; y < 7; y++) { r(a, 6, y, 1, 1); r(a, 8, y + 1); } r(a, 10, 3, 1, 4); r(a, 5, 2, 1, 3); break;
        case 'berry': r(b, 7, 2, 2, 3); ell(r, a, 5, 9, 2, 2); ell(r, a, 10, 9, 2, 2); ell(r, a, 8, 12, 2, 2); r('#fff', 5, 8); r('#fff', 10, 8); break;
        case 'log': r(a, 2, 5, 12, 7); r('#7a4b28', 2, 11, 12, 1); ell(r, b, 13, 8, 2, 3); r('#9a6a3c', 13, 8); r('#7a4b28', 5, 7, 4, 1); break;
        case 'plank': r(a, 1, 6, 14, 3); r(b, 1, 9, 14, 1); r(a, 2, 10, 12, 3); r(b, 2, 13, 12, 1); r(b, 5, 7, 3, 1); r(b, 9, 11, 2, 1); break;
        case 'stone': ell(r, b, 8, 10, 6, 4); ell(r, a, 7, 9, 5, 4); ell(r, '#d0d0d6', 5, 7, 2, 1); break;
        case 'fish': ell(r, a, 7, 8, 5, 3); r(a, 12, 6, 1, 5); r(a, 13, 5, 2, 7); r(b, 4, 10, 6, 1); r('#1a2a3a', 4, 7); r('#fff', 4, 6); break;
        case 'plate': ell(r, '#d8ccb4', 8, 11, 7, 3); ell(r, b, 8, 10, 6, 2); ell(r, a, 8, 9, 3, 2); ell(r, 'rgba(255,255,255,.4)', 7, 8, 1, 1); break;
        case 'bowl': ell(r, a, 8, 7, 5, 2); for (let y = 0; y < 5; y++) r(b, 3 + y / 2, 8 + y, 10 - y, 1); r('#f08a24', 6, 6); r('#5aa83f', 10, 7); r('#f2f2f2', 7, 3, 1, 2); r('#f2f2f2', 10, 2, 1, 2); break;
        case 'loaf': ell(r, a, 8, 9, 6, 4); r(b, 3, 12, 11, 1); r('#f2d09a', 5, 7, 2, 1); r('#f2d09a', 8, 6, 2, 1); r('#f2d09a', 11, 7, 1, 1); break;
        case 'jar': r(b, 5, 2, 6, 2); r('#7a7a84', 5, 4, 6, 1); r(a, 4, 5, 8, 9); r('rgba(255,255,255,.45)', 5, 6, 1, 5); r('#f6efd8', 6, 9, 4, 2); break;
        case 'fence': r(a, 3, 3, 2, 11); r(a, 11, 3, 2, 11); r(a, 1, 6, 14, 2); r(a, 1, 10, 14, 2); r('#9a6a3c', 1, 7, 14, 1); r(b, 3, 3, 2, 1); r(b, 11, 3, 2, 1); break;
        case 'crate': r(a, 2, 4, 12, 10); r(b, 2, 4, 12, 1); r(b, 2, 13, 12, 1); r(b, 2, 4, 1, 10); r(b, 13, 4, 1, 10); line(r, b, 3, 5, 12, 12); break;
        case 'sprinkler': r(a, 7, 6, 2, 8); r('#6e6e78', 5, 13, 6, 2); r(a, 6, 4, 4, 2); r(b, 3, 2); r(b, 12, 2); r(b, 4, 4); r(b, 11, 4); r(b, 7, 1, 2, 1); break;
        case 'mushroom': ell(r, a, 6, 7, 4, 3); ell(r, a, 11, 9, 3, 2); r(b, 5, 9, 2, 5); r(b, 10, 11, 2, 4); r('#fff', 5, 6); r('#fff', 11, 8); break;
        case 'brick': r(a, 2, 6, 12, 6); r(b, 2, 11, 12, 1); r(b, 8, 6, 1, 6); r('#d06a50', 3, 7, 4, 1); break;
        case 'ingot': for (let y = 0; y < 5; y++) r(y ? a : '#f0b080', 3 + y, 6 + y, 10 - y * 2 + 2, 1); r(b, 3, 11, 12, 1); break;
        case 'gear': ell(r, a, 8, 8, 5, 5); [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [13, 3], [3, 13], [13, 13]].forEach(([x, y]) => r(a, x - 1, y - 1, 2, 2)); ell(r, b, 8, 8, 2, 2); r('#2a1a14', 8, 8); break;
        case 'cloth': r(a, 2, 4, 12, 9); r(b, 2, 12, 12, 1); for (let x = 3; x < 14; x += 2) r(b, x, 4, 1, 8); r(a, 10, 12, 4, 2); break;
        case 'pie': ell(r, b, 8, 10, 7, 3); ell(r, a, 8, 9, 5, 2); r(b, 5, 8, 6, 1); r(b, 4, 10, 8, 1); r('#f2d09a', 6, 7, 1, 1); break;
        case 'tool': line(r, '#7a4b28', 3, 13, 11, 5); line(r, '#7a4b28', 4, 13, 12, 5); r(a, 9, 2, 5, 3); r(b, 13, 2, 1, 3); line(r, '#5e3519', 13, 13, 5, 5); r(a, 2, 3, 3, 4); r('#c8ccd4', 2, 3, 1, 4); break;
        case 'loop': for (let k = 0; k < 20; k++) { const t = k / 20 * Math.PI * 1.7 + .4; r(k > 16 ? b : a, 8 + Math.round(Math.cos(t) * 5), 8 + Math.round(Math.sin(t) * 5), 2, 2); } r(a, 12, 2, 3, 1); r(a, 13, 3, 2, 2); break;
        case 'star': [[7, 1, 2, 4], [1, 5, 14, 2], [3, 7, 10, 2], [4, 9, 8, 2], [3, 11, 3, 2], [10, 11, 3, 2], [2, 13, 2, 2], [12, 13, 2, 2]].forEach(([x, y, w, h]) => r(a, x, y, w, h)); r(b, 7, 9, 2, 2); r('#fff6d0', 7, 2, 1, 2); break;
        case 'kit': r(a, 2, 5, 12, 9); r('#7a4b28', 2, 13, 12, 1); r(b, 2, 8, 12, 2); r('#f6efd8', 6, 3, 4, 2); r('#5e3519', 7, 3, 2, 1); break;
        case 'egg': ell(r, b, 8, 10, 4, 5); ell(r, a, 8, 9, 4, 5); r('#fff', 6, 6, 2, 2); break;
        case 'bottle': r(b, 6, 1, 4, 2); r('#c9c4b4', 6, 3, 4, 1); r(a, 5, 4, 6, 11); r(b, 5, 8, 6, 3); r('rgba(255,255,255,.7)', 6, 5, 1, 3); break;
        case 'wool': ell(r, b, 8, 9, 6, 5); ell(r, a, 6, 8, 3, 3); ell(r, a, 10, 7, 3, 3); ell(r, a, 9, 11, 3, 2); ell(r, a, 5, 11, 2, 2); break;
        case 'block': for (let y = 0; y < 4; y++) r('#fff3b0', 4 + y, 4 + y, 9, 1); r(a, 3, 8, 9, 6); r(b, 12, 8, 2, 6); r(b, 3, 13, 11, 1); break;
        case 'wedge': for (let y = 0; y < 8; y++) r(a, 2 + y, 5 + y, 13 - y, 1); r(b, 2, 12, 13, 2); ell(r, b, 7, 9, 1, 1); ell(r, b, 11, 11, 1, 1); break;
        case 'cake': r(b, 3, 4, 10, 2); r(a, 3, 6, 10, 7); r(b, 3, 9, 10, 1); r('#a8662a', 2, 13, 12, 1); r('#c22a44', 7, 2, 2, 2); r('#fff', 4, 5, 1, 2); r('#fff', 8, 5, 1, 3); r('#fff', 11, 5, 1, 2); break;
        case 'yarn': ell(r, a, 8, 9, 5, 5); line(r, b, 4, 7, 11, 13); line(r, b, 5, 5, 12, 11); line(r, b, 3, 10, 9, 14); line(r, b, 13, 13, 15, 15); break;
        // home decor
        case 'chair': r(a, 4, 1, 2, 14); r(a, 10, 1, 2, 7); r(b, 6, 2, 4, 1); r(b, 6, 4, 4, 1); r(b, 6, 6, 4, 1); r(a, 3, 8, 11, 2); r(b, 3, 10, 11, 1); r(a, 12, 11, 2, 4); r(b, 10, 11, 1, 3); r('rgba(255,255,255,.3)', 4, 8, 9, 1); break;
        case 'table': r(a, 1, 5, 14, 2); r(b, 1, 7, 14, 1); r(b, 2, 8, 2, 7); r(b, 12, 8, 2, 7); r(b, 5, 8, 6, 1); r('rgba(255,255,255,.3)', 2, 5, 12, 1); r('#f2ece0', 6, 3, 4, 2); r('#c22a44', 7, 2, 2, 1); break;
        case 'trophy': r(b, 1, 3, 14, 10); r('#5e3519', 1, 12, 14, 1); r('#5e3519', 14, 3, 1, 10); r('#b07a42', 2, 3, 12, 1);
          ell(r, a, 7, 8, 4, 2); r(a, 11, 7, 1, 3); r(a, 12, 5, 2, 7); r('#3d7fa8', 4, 9, 6, 1); r('#1a2a3a', 4, 7); r('#fff', 4, 6); r('#e8c04a', 6, 13, 4, 2); break;
        case 'vase': r('#4c8a30', 7, 3, 1, 5); r('#4c8a30', 9, 2, 1, 6); r('#4c8a30', 5, 4, 1, 4); ell(r, b, 7, 2, 1, 1); ell(r, '#f6e27a', 10, 2, 1, 1); ell(r, b, 5, 3, 1, 1);
          r(a, 6, 7, 4, 2); ell(r, a, 8, 11, 4, 4); r('rgba(255,255,255,.35)', 6, 9, 1, 3); r('#8a4a26', 5, 14, 6, 1); break;
        case 'shelf': r(a, 2, 1, 12, 14); r('#3d2617', 3, 2, 10, 12); r(a, 3, 5, 10, 1); r(a, 3, 9, 10, 1);
          [[b, 3], ['#4aa3d8', 5], ['#e8c04a', 6], ['#5aa83f', 8], [b, 10]].forEach(([c, x], k) => { r(c, x, k % 2 ? 3 : 2, 1, k % 2 ? 2 : 3); r(c, x + 1, 6, 1, 3); }); r('#efe6cf', 4, 11, 4, 2); r('#4aa3d8', 9, 10, 2, 3); break;
        case 'frame': r(a, 2, 2, 12, 11); r(b, 3, 3, 10, 9); r('#5aa83f', 3, 9, 10, 3); ell(r, '#4c8a30', 6, 9, 3, 1); r('#f6e27a', 10, 4, 2, 2); r('#8a6a1a', 2, 12, 12, 1); r('#8a6a1a', 13, 2, 1, 11); r('#fff3b0', 2, 2, 12, 1); break;
        case 'rug': r(a, 1, 5, 14, 8); r(b, 1, 5, 14, 1); r(b, 1, 12, 14, 1); r(b, 1, 5, 1, 8); r(b, 14, 5, 1, 8); r(b, 7, 7, 2, 4); r(b, 6, 8, 4, 2); r('#f2ece0', 7, 8, 2, 2);
          for (let x = 1; x < 15; x += 2) { r('#efe6cf', x, 4); r('#efe6cf', x, 13); } break;
        case 'curtain': r('#7a4b28', 1, 2, 14, 1); r('#bfe6ee', 6, 3, 4, 11); r('#ffffff', 7, 4, 1, 3); r(a, 2, 3, 4, 11); r(a, 10, 3, 4, 11);
          r(b, 3, 3, 1, 11); r(b, 12, 3, 1, 11); r('rgba(0,0,0,.2)', 5, 3, 1, 11); r('rgba(0,0,0,.2)', 10, 3, 1, 11); r('#e8c04a', 2, 9, 4, 1); r('#e8c04a', 10, 9, 4, 1); break;
        case 'lamp': r(a, 4, 13, 8, 2); r('#9a5a2e', 4, 14, 8, 1); r(a, 7, 10, 2, 3); r(a, 5, 9, 6, 1); r('#d4f0f6', 6, 3, 4, 6); r('rgba(255,255,255,.7)', 6, 4, 1, 3); ell(r, b, 8, 6, 1, 2); r('#f06a20', 8, 7); r(a, 6, 2, 4, 1); break;
        case 'pear': r(b, 8, 1, 1, 3); r('#5aa83f', 9, 2, 2, 1); ell(r, a, 8, 7, 2, 3); ell(r, a, 8, 11, 4, 3); r('rgba(255,255,255,.35)', 6, 9, 1, 2); r('rgba(0,0,0,.12)', 10, 11, 2, 2); break;
        case 'cob': for (let y = 0; y < 10; y++) r(a, 6 + (y > 1 && y < 8 ? 0 : 1), 3 + y, y > 1 && y < 8 ? 5 : 3, 1); for (let y = 4; y < 12; y += 2) r('#d8a820', 7, y, 3, 1);
          line(r, b, 4, 14, 6, 6); line(r, b, 12, 14, 10, 6); r(b, 5, 13, 7, 2); break;
        case 'onion': ell(r, a, 8, 10, 5, 4); r(a, 7, 5, 2, 2); r(b, 7, 3, 1, 2); r(b, 9, 2, 1, 3); r('rgba(255,255,255,.35)', 5, 9, 1, 3); r('rgba(0,0,0,.15)', 8, 7, 1, 7); r('#e8d8c0', 6, 14, 4, 1); break;
        case 'pepper': r(b, 7, 1, 2, 3); r(b, 6, 3, 4, 1); ell(r, a, 8, 9, 4, 5); r(a, 6, 13, 4, 2); r('rgba(255,255,255,.35)', 6, 7, 1, 4); r('rgba(0,0,0,.15)', 10, 7, 1, 6); break;
        case 'cabbage': ell(r, b, 8, 9, 6, 5); ell(r, a, 8, 9, 4, 4); line(r, b, 8, 6, 8, 12); r('#c8e8a0', 6, 7, 1, 1); r('#c8e8a0', 10, 8, 1, 1); break;
        case 'hop': r('#7a5a38', 8, 1, 1, 3); for (let y = 0; y < 9; y++) { const w = y < 2 ? 2 : y < 6 ? 4 : y < 8 ? 3 : 1; r(y % 2 ? b : a, 8 - w + 1, 4 + y, w * 2 - 1, 1); } r(b, 11, 3, 3, 2); break;
        case 'gem': for (let y = 0; y < 3; y++) r('#e8fffc', 5 - y + 1, 3 + y, 4 + y * 2, 1); r(a, 3, 6, 10, 2); for (let y = 0; y < 6; y++) r(y % 2 ? b : a, 4 + y, 8 + y, 8 - y * 2, 1); r(b, 3, 6, 10, 1); r('#ffffff', 6, 4); break;
        case 'ring': ell(r, a, 8, 10, 5, 4); ell(r, 'rgba(0,0,0,0)', 8, 10, 3, 2); r('#2a1a14', 6, 9, 5, 3); r(a, 5, 8, 1, 1); for (let y = 0; y < 3; y++) r(b, 7 - y, 2 + y, 2 + y * 2, 1); r('#ffffff', 7, 2); break;
        case 'necklace': for (let k = 0; k < 14; k++) { const t = k / 13 * Math.PI; r(a, Math.round(8 - Math.cos(t) * 6), Math.round(2 + Math.sin(t) * 8)); } ell(r, b, 8, 12, 2, 2); r('#ffffff', 7, 11); r(b, 4, 8); r(b, 12, 8); break;
        case 'mug': r(b, 3, 3, 9, 3); ell(r, b, 5, 3, 2, 1); ell(r, b, 9, 2, 2, 1); r(a, 3, 6, 9, 8); r('rgba(255,255,255,.3)', 4, 6, 1, 7); r('#7a4b28', 12, 7, 2, 1); r('#7a4b28', 13, 7, 1, 5); r('#7a4b28', 12, 11, 2, 1); r('#7a4b28', 3, 13, 9, 1); break;
        case 'pizza': ell(r, '#c08040', 8, 9, 7, 5); ell(r, a, 8, 9, 6, 4); [[5, 8], [10, 7], [8, 11], [11, 10], [6, 11]].forEach(([x, y]) => ell(r, b, x, y, 1, 1)); r('#5aa83f', 9, 9); r('#5aa83f', 6, 9); break;
        case 'jbox': r('#4a1a2a', 2, 7, 12, 7); r(a, 2, 4, 12, 4); r(a, 3, 3, 10, 1); r('#e8c040', 2, 7, 12, 1); r('#e8c040', 7, 8, 2, 2); r(b, 5, 5, 2, 1); r(b, 9, 5, 2, 1); r('#ffffff', 5, 5); r('rgba(0,0,0,.25)', 2, 13, 12, 1); break;
        default: r(a, 4, 4, 8, 8);
      }
    });
  }

  /* ---------- your house ----------
     A true isometric box on a footprint of A×B tiles (A runs down-right on screen, B down-left) at level L: 0 Cottage
     (thatch, timber), 1 House (shingles, chimney), 2 Farmhouse (brick, clay tiles), 3 Manor (stone, slate). It is drawn with
     the roof ridge along the longer side; when B is longer it is drawn the other way and mirrored, with the wall and roof
     shades swapped so the light still falls from the left. Anchor (ax, ay) is the footprint's centre on the ground. */
  const HOUSE = [
    { wl: '#f0d6a0', wr: '#d7b57c', tr: '#7a4b28', rl: '#d8b45a', rr: '#b8923a', rd: '#8a6a24', ln: '#a8822e', wh: 13, rh: 9, timber: true },
    { wl: '#f2e2c0', wr: '#d8c49a', tr: '#6b4226', rl: '#d4553f', rr: '#b0402f', rd: '#8a3226', ln: '#9a3a2a', wh: 14, rh: 10, chim: true },
    { wl: '#c8664a', wr: '#a8503a', tr: '#efe2c8', rl: '#d0703a', rr: '#a8562a', rd: '#7e3e1e', ln: '#9a4e26', wh: 15, rh: 11, chim: true, brick: true },
    { wl: '#dcd6cc', wr: '#b8b0a4', tr: '#f2ece0', rl: '#5e6e8e', rr: '#4a5872', rd: '#343e52', ln: '#46546e', wh: 18, rh: 12, chim: true, stone: true }
  ];
  function house(A, B, L) {
    const flip = B > A; if (flip) [A, B] = [B, A];
    const P0 = HOUSE[Math.max(0, Math.min(3, L | 0))], P = flip ? Object.assign({}, P0, { wl: P0.wr, wr: P0.wl, rl: P0.rr, rr: P0.rl }) : P0;
    const e = .14, o = .12, wh = P.wh, rh = P.rh, top = wh + rh + (P.chim ? 7 : 2);
    const oy = Math.max(2, Math.ceil(top - (B / 2 + e - o) * 8) + 1), ox = 16 * B + 1, w = 16 * (A + B) + 2, h = oy + 8 * (A + B) + 3;
    const S = (x, y, z) => [ox + (x - y) * 16, oy + (x + y) * 8 - z];
    const c = mk(w, h, (g, r) => {
      const poly = (pts, col) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) if (inPoly(pts, x + .5, y + .5)) r(col, x, y); };
      const ln = (col, a, b) => line(r, col, Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]));
      const onY = (yp, x0, x1, z0, z1, col) => poly([S(x0, yp, z0), S(x1, yp, z0), S(x1, yp, z1), S(x0, yp, z1)], col); // a patch on the front-left wall
      const onX = (xp, y0, y1, z0, z1, col) => poly([S(xp, y0, z0), S(xp, y1, z0), S(xp, y1, z1), S(xp, y0, z1)], col); // a patch on the front-right wall
      const xa = e, xb = A - e, ya = e, yb = B - e, ym = B / 2, x0 = e - o, x1 = A - e + o, ze = wh - 1, zr = wh + rh;
      poly([S(0, 0, 0), S(A, 0, 0), S(A + .06, B + .06, 0), S(0, B, 0)].map(([x, y]) => [x + 2, y]), 'rgba(30,20,10,.22)'); // shadow, a little to the right
      // back roof slope (the visible sliver behind the ridge)
      poly([S(x0, ya - o, ze), S(x1, ya - o, ze), S(x1, ym, zr), S(x0, ym, zr)], P.rd);
      // walls and the gable end
      onY(yb, xa, xb, 0, wh, P.wl); onX(xb, ya, yb, 0, wh, P.wr);
      poly([S(xb, ya, wh), S(xb, yb, wh), S(xb, ym, zr - 1)], P.wr);
      if (P.brick || P.stone) { const step = P.stone ? 4 : 3, dk = P.stone ? '#a49c90' : '#8a3e2a', dk2 = P.stone ? '#948c80' : '#7a3424';
        for (let z = step; z < wh; z += step) { ln(dk, S(xa, yb, z), S(xb, yb, z)); ln(dk2, S(xb, ya, z), S(xb, yb, z)); } }
      if (P.stone) for (let z = 0; z < wh; z += 4) { const k = (z / 4) % 2; onY(yb, xb - (k ? .16 : .1), xb, z, z + 3, '#f2ece0'); onX(xb, yb - (k ? .1 : .16), yb, z, z + 3, '#e2dcd2'); }
      ln('#7a6a58', S(xa, yb, 0), S(xb, yb, 0)); ln('#6a5a4a', S(xb, ya, 0), S(xb, yb, 0)); // footing
      if (P.timber) { ln(P.tr, S(xb, yb, 0), S(xb, yb, wh)); ln(P.tr, S(xa, yb, 0), S(xa, yb, wh)); ln(P.tr, S(xa, yb, wh - 1), S(xb, yb, wh - 1)); ln(P.tr, S(xb, ya, wh - 1), S(xb, yb, wh - 1));
        for (let k = 1; k < A; k++) ln(P.tr, S(k, yb, 0), S(k, yb, wh)); ln(P.tr, S(xb, ym, wh), S(xb, ym, zr - 2)); }
      // a window: a trim frame, glass and a glint
      const winY = (x, z0, z1, ww) => { onY(yb, x - .02, x + ww + .02, z0 - 1, z1 + 1, P.tr); onY(yb, x, x + ww, z0, z1, '#9fd8f0'); onY(yb, x, x + .05, z1 - 2, z1, '#e6f6fc'); };
      const winX = (y, z0, z1, ww) => { onX(xb, y - .02, y + ww + .02, z0 - 1, z1 + 1, P.tr); onX(xb, y, y + ww, z0, z1, '#8cc6de'); onX(xb, y, y + .05, z1 - 2, z1, '#d6eef8'); };
      const wz0 = Math.round(wh * .42), wz1 = Math.round(wh * .78), door = Math.max(0, Math.floor(A / 2) - (A > 1 ? 1 : 0));
      for (let k = 0; k < A; k++) { if (k === door) { // the front door, with a lamp and a step
          onY(yb, k + .3, k + .62, 0, Math.round(wh * .68) + 1, P.tr); onY(yb, k + .34, k + .58, 0, Math.round(wh * .68), '#7a4a26'); onY(yb, k + .52, k + .55, 3, 5, '#f6e27a');
          onY(yb + .06, k + .26, k + .66, 0, 1, '#9a8a76'); if (A === 1 && L >= 1) winY(k + .7, wz0, wz1, .14); }
        else winY(k + .32, wz0, wz1, .36); }
      for (let k = 0; k < B; k++) winX(k + (B === 1 ? .34 : .3), wz0, wz1, B === 1 ? .32 : .4);
      if (L >= 3) for (let k = 0; k < A; k++) if (k !== door) onY(yb, k + .32, k + .68, wh - 4, wh - 3, P.tr); // manor: stone lintels
      // chimney on the back slope, near the right end
      if (P.chim) { const cx0 = A - e - .55, cx1 = cx0 + .2, cy0 = ym - .32, cy1 = ym - .12, zt = zr + 5;
        poly([S(cx0, cy1, wh), S(cx1, cy1, wh), S(cx1, cy1, zt), S(cx0, cy1, zt)], '#9a5a3a'); poly([S(cx1, cy0, wh), S(cx1, cy1, wh), S(cx1, cy1, zt), S(cx1, cy0, zt)], '#7e4430');
        poly([S(cx0, cy0, zt), S(cx1, cy0, zt), S(cx1, cy1, zt), S(cx0, cy1, zt)], '#4a2e22'); }
      // front roof slope, with shingle rows and the ridge
      poly([S(x0, yb + o, ze), S(x1, yb + o, ze), S(x1, ym, zr), S(x0, ym, zr)], P.rl);
      const rows = Math.floor((rh + 1) / 3); for (let k = 1; k <= rows; k++) { const t = k / (rows + 1), y = ym + t * (yb + o - ym), z = zr - t * (rh + 1); ln(P.ln, S(x0, y, z), S(x1, y, z)); }
      for (let k = 1; k <= Math.floor(rows / 2); k++) { const t = k / (Math.floor(rows / 2) + 1), y = ym - t * (ym - ya + o), z = zr - t * (rh + 1); ln('rgba(0,0,0,.18)', S(x0, y, z), S(x1, y, z)); }
      ln(P.rr, S(x1, ya - o, ze), S(x1, ym, zr)); ln(P.rr, S(x1, ym, zr), S(x1, yb + o, ze)); // barge boards at the visible end
      ln(P.rd, S(x0, yb + o, ze), S(x1, yb + o, ze)); // eave edge
      ln(P.timber ? '#f0d890' : 'rgba(255,255,255,.35)', S(x0, ym, zr), S(x1, ym, zr)); // ridge
      if (L === 0) { r('#5aa83f', Math.round(S(xa + .12, yb + .1, 0)[0]), Math.round(S(xa + .12, yb + .1, 0)[1]) - 2, 3, 2); r('#d6334a', Math.round(S(xa + .12, yb + .1, 0)[0]) + 1, Math.round(S(xa + .12, yb + .1, 0)[1]) - 2); } // flowers by the wall
    });
    const g = flip ? (() => { const m = document.createElement('canvas'); m.width = w; m.height = h; const x = m.getContext('2d'); x.translate(w, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return m; })() : c;
    const [ax, ay] = S(A / 2, B / 2, 0); g.ax = flip ? w - ax : ax; g.ay = ay; return g;
  }

  /* ---------- Valley Monuments ----------
     A monument is drawn at one of five stages (0 surveyed plot, 1 base, 2 body, 3 detail, 4 complete) and three sizes:
     'deco' the one-tile model on your farm, 'site' the full-size build on the Valley Green (3×3 tiles, on a plinth),
     'big' the floating monument in the Homestead and Depot panels. Each canvas carries its anchor (ax, ay): the
     point that sits on the tile centre. */
  function inPoly(p, x, y) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pyramid(stage, mode) {
    const S = mode === 'deco' ? 1 : 3, fine = S > 1, P = 1;
    const f = [0, .3, .55, .72, 1][stage];
    const W = (mode === 'deco' ? 13 : 14) * S, Hh = (mode === 'deco' ? 18 : 19) * S, M = 13 * S, cx = Math.max(W + 3 * S, mode === 'deco' ? 0 : 16 * S + 1), by = M + Hh;
    const w = cx * 2, h = by + W / 2 + (mode === 'big' ? 12 * S : mode === 'site' ? 5 * S : 4);
    const c = mk(w, h, (g, r0) => {
      const R = rng(7 + stage), r = (col, x, y, ww = 1, hh = 1) => r0(col, Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh)));
      const ln = (col, x0, y0, x1, y1, t = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) r(col, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t, t); };
      const each = fn => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(x, y, x + .5, y + .5); };
      const dia = (x, y, hw, yc) => Math.abs(x - cx) / hw + Math.abs(y - yc) / (hw / 2);
      if (mode === 'big') { // floating plinth, gold trim, shadow far below
        each((x, y, px, py) => { const dx = (px - cx) / (13 * S), dy = (py - (h - 3 * S)) / (2.5 * S); if (dx * dx + dy * dy <= 1) r('rgba(0,0,0,.3)', x, y); });
        each((x, y, px, py) => { const hw = 16 * S;
          if (dia(px, py, hw, by) <= 1) r((x * 7 + y * 13) % 13 === 0 ? '#e6d3a0' : '#d9c48e', x, y);
          else if (py > by && dia(px, py - 3 * S, hw, by) <= 1) r(px < cx ? '#b39a64' : '#8f7a4c', x, y);
          else if (py > by && dia(px, py - 4 * S, hw, by) <= 1 && Math.abs(px - cx) < 14 * S && (x >> 1) % 3) r('#f6d24a', x, y); });
      } else if (mode === 'site') { // a low stone plinth filling the 3×3 footprint
        each((x, y, px, py) => { const hw = 16 * S - 2;
          if (dia(px, py, hw, by) <= 1) r((x * 5 + y * 11) % 17 === 0 ? '#e6d6a6' : dia(px, py, hw, by) > .9 ? '#c9b483' : '#d9c79a', x, y);
          else if (py > by && dia(px, py - 3, hw, by) <= 1) r(px < cx ? '#a8916a' : '#8a7552', x, y); });
      } else each((x, y, px, py) => { const dx = (px - cx - 2) / (13 * S), dy = (py - by - S) / (4.5 * S); if (dx * dx + dy * dy <= 1) r('rgba(30,20,10,.25)', x, y); });
      const Wt = W * (1 - f), ty = by - Hh * f, ch = fine ? 1.5 * S : 3, jw = fine ? 2.5 * S : 5, goldZ = .82 * Hh;
      if (stage === 0) { // the surveyed site: stakes, string and a sign
        const pts = [[cx - W, by], [cx, by + W / 2], [cx + W, by], [cx, by - W / 2]];
        for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; ln('#f2ece0', a[0], a[1] - 3 * S, b[0], b[1] - 3 * S); }
        pts.forEach(p => { r('#7a4b28', p[0], p[1] - 6 * S, Math.max(1, S * .7), 7 * S); r('#c23a3a', p[0] - 1, p[1] - 6 * S, 3 * Math.max(1, S * .7), 2 * Math.max(1, S * .7)); });
        r('#7a4b28', cx - S, by + 1 * S, Math.max(1, S * .7), 5 * S); r('#d8b070', cx - 5 * S, by - 4 * S, 10 * S, 6 * S); r('#7a4b28', cx - 5 * S, by - 4 * S, 10 * S, Math.max(1, S * .6));
        ln('#7a4b28', cx - 3 * S, by - 2 * S, cx + 3 * S, by - 2 * S); ln('#7a4b28', cx - 3 * S, by, cx + S, by);
        for (let k = 0; k < 5; k++) { r('#c4b894', cx - 8 * S + k * 3 * S, by + 4 * S - (k % 2) * S, 2 * S, 2 * S); r('#9a9078', cx - 8 * S + k * 3 * S, by + 5 * S - (k % 2) * S, 2 * S, Math.max(1, S * .6)); }
        return; }
      const polL = [[cx - W, by], [cx, by + W / 2], [cx, ty + Wt / 2], [cx - Wt, ty]], polR = [[cx + W, by], [cx, by + W / 2], [cx, ty + Wt / 2], [cx + Wt, ty]];
      const polT = [[cx - Wt, ty], [cx, ty - Wt / 2], [cx + Wt, ty], [cx, ty + Wt / 2]];
      each((x, y, px, py) => { const inL = inPoly(polL, px, py), inR = inPoly(polR, px, py), inT = f < 1 && inPoly(polT, px, py);
        if (!inL && !inR && !inT) return; let col;
        if (inT) { col = R() < .12 ? '#e8d598' : '#f3e3ac'; if (Math.abs(px - cx) / Wt + Math.abs(py - ty) / (Wt / 2) > .82) col = '#dcc98a'; }
        else { const left = inL, yb = left ? by + (px - (cx - W)) * .5 : by + ((cx + W) - px) * .5, z = yb - py, u = left ? px - (cx - W) : (cx + W) - px, course = Math.floor(z / ch), odd = course & 1;
          col = left ? (odd ? '#e0c682' : '#ecd596') : (odd ? '#bb9858' : '#c9a866');
          if (z % ch < 1 || Math.floor((u + (odd ? jw / 2 : 0)) / jw) !== Math.floor((u - 1 + (odd ? jw / 2 : 0)) / jw)) col = left ? '#c4a864' : '#a38449';
          else if (R() < .08) col = left ? '#f3e0a8' : '#b8975a';
          if (Math.abs(px - cx) < P) col = left ? '#d5b872' : '#9c7d46';
          if (stage >= 3 && z > 9 * S && z < 11 * S && !(stage === 4 && z > goldZ)) col = Math.floor(u / (3 * S)) % 2 === 0 ? (left ? '#e8a070' : '#c47a52') : (left ? '#b5523b' : '#97412e');
          if (stage === 4 && z > goldZ) col = z % ch < 1 ? (left ? '#c99a1e' : '#a87c12') : (left ? '#f6d24a' : '#d8a82a'); }
        r(col, x, y); });
      if (stage >= 3) { const dx = cx - 7 * S, dw = 5 * S, yb0 = by + (dx - (cx - W)) * .5; // the entrance
        for (let x = 0; x < dw; x++) { const yb = by + (dx + x - (cx - W)) * .5, top = 6 * S - (x < S || x >= dw - S ? S : 0); for (let z = 0; z < top; z++) r(z < 1 ? '#4a3524' : '#2a1c12', dx + x, yb - z - 1); }
        r('#f3e0a8', dx - 1, yb0 - 7 * S, dw + 2, Math.max(1, S * .7)); }
      const topZ = f * Hh, T = Math.max(1, Math.round(S * .7));
      if (stage >= 1 && stage <= 3) { // scaffolding, and a crane while the body goes up
        const hh = (stage === 3 ? .35 : 1) * (topZ + 5 * S), poles = [[cx - W - 1.5 * S, by + .5 * S], [cx, by + W / 2 + 1.5 * S], [cx + W + 1.5 * S, by + .5 * S]];
        poles.forEach(p => r('#7a4b28', p[0], p[1] - hh, T, hh));
        for (let z = 3 * S; z < hh; z += 6 * S) { ln('#c99b5a', poles[0][0], poles[0][1] - z, poles[1][0], poles[1][1] - z, T); ln('#a8743e', poles[1][0], poles[1][1] - z, poles[2][0], poles[2][1] - z, T); }
        if (stage < 3) { const ax = cx - S, ay = ty - S;
          r('#7a4b28', ax, ay - 9 * S, T + (fine ? 1 : 0), 9 * S); ln('#9a6a3c', ax, ay - 9 * S, ax + 9 * S, ay - 6 * S, T); ln('#f2ece0', ax + 8 * S, ay - 6 * S, ax + 8 * S, ay - S, 1);
          r('#c4b894', ax + 6.5 * S, ay - S, 3 * S, 2 * S); r('#9a9078', ax + 6.5 * S, ay + .5 * S, 3 * S, T); }
        const sx = cx + W - 2 * S, sy = by + W / 2 - 3 * S; // stone waiting to go up
        [[0, 0], [3, 0], [1.5, -2], [6, 1]].forEach(([a, b]) => { r('#c4b894', sx + a * S, sy + b * S, 3 * S, 2 * S); r('#9a9078', sx + a * S, sy + (b + 1.5) * S, 3 * S, T); }); }
      if (stage === 4) { // banners and a glint on the capstone
        [[cx - W + 1.2 * S, by + .6 * S, '#c23a3a'], [cx + W - 1.2 * S, by + .6 * S, '#3d6fb8']].forEach(([x, y, col]) => {
          r('#7a4b28', x, y - 10 * S, T, 10 * S); for (let i = 0; i < 4 * S; i++) r(col, x + T, y - 10 * S + i, Math.max(1, (4 * S - i) * 1.1), 1); });
        for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28, rr = (6 + R() * 5) * S; r(k % 3 ? '#fff3b0' : '#f6d24a', cx + Math.cos(a) * rr * 1.3, by - Hh + 3 * S + Math.sin(a) * rr * .7, T, T); }
        r('#fff3b0', cx - T / 2, by - Hh - 2 * S, T, 3 * S); r('#fff3b0', cx - 2 * S, by - Hh + .5 * S, 5 * S, T); }
    });
    c.ax = cx; c.ay = by; return c;
  }
  const MONUMENTS = { pyramid };
  function monument(kind, stage, mode) { return (MONUMENTS[kind] || pyramid)(Math.max(0, Math.min(4, stage | 0)), mode); }
  // the Monument Depot: an open wooden shed with an awning; crates pile up in front as you give
  OBJ.depot = n => mk(32, 34, (g, r) => {
    shadow(r, 34, 12);
    r('#9a6a3c', 6, 14, 10, 16); r('#7a4b28', 16, 14, 10, 16); r('#3a2414', 8, 18, 7, 12); r('#5e3519', 6, 29, 20, 1);
    for (let x = 6; x < 26; x += 4) r('#5e3519', x, 14, 1, 16);
    for (let i = 0; i < 8; i++) { const hw = 4 + i * 1.6 | 0; for (let x = 16 - hw; x < 16 + hw; x++) r(Math.floor((x + 1) / 3) % 2 ? '#3d6fb8' : '#f2ece0', x, 6 + i); }
    for (let x = 4; x < 28; x += 3) { r('#3d6fb8', x, 14, 2, 2); r('#2c528a', x + 2, 14, 1, 1); }
    r('#7a4b28', 15, 1, 2, 6); r('#f6d24a', 17, 1, 5, 3); r('#c99a1e', 17, 3, 5, 1); // pennant
    r('#d8b070', 19, 18, 6, 5); r('#7a4b28', 19, 18, 6, 1); r('#c9a866', 21, 19, 2, 2); r('#e0c682', 20, 21, 4, 1); // sign with a little pyramid
    const crates = [[3, 25], [24, 25], [7, 27], [21, 27], [12, 28]];
    for (let k = 0; k < Math.min(5, n | 0); k++) { const [x, y] = crates[k]; r('#c99b5a', x, y, 5, 4); r('#a8743e', x, y, 5, 1); r('#7a4b28', x + 2, y, 1, 4); r('#8a5a2e', x, y + 3, 5, 1); }
  });

  const urls = {};
  // A small scene for a discovery card: a ground tile, an object on it, and an optional item badge.
  const picCache = {};
  function discPic(pic, items, get) {
    const key = JSON.stringify(pic); if (picCache[key]) return picCache[key];
    const [gk, ok, ic] = pic || ['grass:0', null, null];
    const c = mk(48, 56, (g) => {
      g.drawImage(get(gk), 8, 34 - 8);
      if (ok) { const o = get(ok);
        if (ok.startsWith('crop:')) g.drawImage(o, 8, 34 - 16 + 8 - 8);
        else if (ok.startsWith('avatar:')) g.drawImage(o, 24 - 6, 34 + 4 - 19 - 4);
        else g.drawImage(o, 8, Math.max(0, 34 + 4 - o.height)); }
      if (ic) { const spec = Array.isArray(ic) ? ic : items[ic].icon, ico = icon(...spec);
        g.fillStyle = '#24160d'; g.fillRect(29, 37, 18, 18); g.fillStyle = '#fff6e0'; g.fillRect(30, 38, 16, 16); g.drawImage(ico, 30, 38); }
    });
    return (picCache[key] = c.toDataURL());
  }
  /* ---------- buildings drawn 25% shorter ----------
     Rather than scaling (which smears pixel art), whole pixel rows are removed from the part of each
     building above its footing: the rows most like the row above them go first, so long walls and roofs
     get shorter while 1-pixel details (trim, windows, sails) survive. Animated frames share one row set. */
  const SHRINK = .25, FOOT = 8;
  const SHORT = new Set(['homestead', 'stove', 'stove_on', 'market', 'board', 'mill', 'sawmill', 'preserver', 'workbench', 'compost', 'kiln', 'oven', 'press', 'loom', 'hive', 'shed', 'smokehouse', 'smelter', 'brewhouse', 'barn', 'warehouse']);
  const FRAMES = { mill: [0, 1], sawmill: [0, 1] };
  const rowSets = {};
  function shortRows(k) {
    if (rowSets[k]) return rowSets[k];
    const imgs = (FRAMES[k] || [undefined]).map(f => OBJ[k](f)), w = imgs[0].width, h = imgs[0].height;
    const px = imgs.map(c => c.getContext('2d').getImageData(0, 0, w, h).data);
    let top = 0; find: for (; top < h - FOOT; top++) for (const d of px) for (let x = 0; x < w; x++) if (d[(top * w + x) * 4 + 3]) break find;
    const diff = (a, b) => { let t = 0; for (const d of px) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) t += Math.abs(d[(a * w + x) * 4 + c] - d[(b * w + x) * 4 + c]); return t; };
    // runs of identical rows (a chimney, a plain wall) may each lose at most ~40%, so no feature vanishes
    const run = {}, runLen = {}; let rid = 0;
    for (let y = top; y < h - FOOT; y++) { if (y > top && diff(y, y - 1) > 0) rid++; run[y] = rid; runLen[rid] = (runLen[rid] || 0) + 1; }
    const taken = {}, cap = r => Math.floor(runLen[r] * .4);
    const keep = []; for (let y = top; y < h - FOOT; y++) keep.push(y);
    const drop = new Set(); let n = Math.round((h - FOOT - top) * SHRINK);
    while (n-- > 0 && keep.length > 2) { let best = 1, bc = Infinity;
      for (let j = 1; j < keep.length; j++) { const r = run[keep[j]], c = diff(keep[j], keep[j - 1]) + ((taken[r] || 0) >= cap(r) ? 1e6 * (1 + (taken[r] || 0)) : 0);
        if (c < bc) { bc = c; best = j; } }
      const r = run[keep[best]]; taken[r] = (taken[r] || 0) + 1; drop.add(keep[best]); keep.splice(best, 1); }
    return (rowSets[k] = drop);
  }
  function dropRows(c, drop) {
    if (!drop.size) return c; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height - drop.size;
    const g = o.getContext('2d'); let y2 = 0;
    for (let y = 0; y < c.height; y++) if (!drop.has(y)) g.drawImage(c, 0, y, c.width, 1, 0, y2++, c.width, 1);
    return o;
  }
  /* ---------- seasons ----------
     Spring is the art as drawn. Other seasons recolour the ground and plants pixel by pixel (exact colour swaps), so
     every tile and tree keeps its shape: lush deep greens in summer, gold and russet in autumn, frosted muted greens
     in winter, and white ground with snow on every roof and treetop on a snow day. Spring trees get blossom. */
  let scene = 'spring';
  const GROUND = new Set(['grass', 'forest', 'water', 'boulder', 'flowers', 'clay', 'reeds', 'ore', 'farm_raw', 'lawn', 'plaza']);
  const PLANT = new Set(['tree', 'stump', 'sapling', 'blooms', 'reedbed', 'pondreeds']);
  const SCENES = {
    summer: {
      ground: { '#7cc04b': '#84bf3c', '#93d35c': '#9ccc48', '#5fa23a': '#6a9a30', '#a6dc6a': '#c8c860', '#6fb440': '#78ac38',
        '#5f9e3c': '#5a9432', '#4c8a30': '#467e28', '#73b34a': '#7eac3c', '#3f7a2a': '#3a6e24', '#8ccc58': '#90c44a', '#9bd462': '#a6cc50',
        '#6a9a5a': '#6e9a4c', '#7aaa62': '#86a854', '#4aa3d8': '#44a0d8', '#9ad6f2': '#b8e6fa' },
      plant: { '#3f7a2a': '#346c22', '#4c8a30': '#427e26', '#5aa83f': '#52a032', '#7cc04b': '#74b83c' } },
    autumn: {
      ground: { '#7cc04b': '#a8a64a', '#93d35c': '#bcb456', '#5fa23a': '#8e8a3a', '#a6dc6a': '#d49a3a', '#6fb440': '#c0602a',
        '#5f9e3c': '#8a8a3c', '#4c8a30': '#a8642a', '#73b34a': '#d08a30', '#3f7a2a': '#7a5a2a', '#8ccc58': '#a4a848', '#9bd462': '#b8b050',
        '#6a9a5a': '#8a8a4a', '#5a8a4c': '#7a7a40', '#7aaa62': '#a89a50', '#4aa3d8': '#4a98c8' },
      plant: { '#3f7a2a': '#a0401e', '#4c8a30': '#c85a24', '#5aa83f': '#e0882a', '#7cc04b': '#f0b83a', '#73b34a': '#d8a040', '#6fb440': '#b85a2a',
        '#6f9a3a': '#a8904a', '#8ab04a': '#c8a85a' } },
    winter: {
      ground: { '#7cc04b': '#9cae8c', '#93d35c': '#b4c4a6', '#5fa23a': '#7e9272', '#a6dc6a': '#dfe8ec', '#6fb440': '#8a9e7c',
        '#5f9e3c': '#7e9276', '#4c8a30': '#5e7258', '#73b34a': '#a0b096', '#3f7a2a': '#4e6248', '#8ccc58': '#a0b090', '#9bd462': '#b4c0a4',
        '#e86aa8': '#b8a0b0', '#f6e27a': '#d8d4b0', '#b48ae8': '#a8a0c0', '#6a9a5a': '#8a9a80', '#5a8a4c': '#6e7e66', '#7aaa62': '#a0aa90',
        '#4aa3d8': '#4a8ebc', '#7cc4ea': '#b8d8ea', '#9ad6f2': '#e4f2f8' },
      plant: { '#3f7a2a': '#2e5040', '#4c8a30': '#3a6050', '#5aa83f': '#4e7262', '#7cc04b': '#6a8a7a', '#d6334a': '#3a6050',
        '#e86aa8': '#b8a0b0', '#f6e27a': '#d8d4b0', '#b48ae8': '#a8a0c0', '#f08a24': '#c8a890', '#6f9a3a': '#a89a6a', '#8ab04a': '#c4b88a' } }
  };
  SCENES.snow = {
    ground: Object.assign({}, SCENES.winter.ground, { '#7cc04b': '#eef3f6', '#93d35c': '#ffffff', '#5fa23a': '#9cae8c', '#a6dc6a': '#dce6ec', '#6fb440': '#c8d6de',
      '#5f9e3c': '#e4ecf0', '#4c8a30': '#7e9276', '#73b34a': '#ffffff', '#3f7a2a': '#c4d2da', '#8ccc58': '#eaf0f2', '#9bd462': '#ffffff',
      '#e86aa8': '#e8c8d8', '#f6e27a': '#ffffff', '#b48ae8': '#dce6ec', '#f2f2f2': '#ffffff',
      '#6a9a5a': '#e2eaee', '#5a8a4c': '#a8b49a', '#7aaa62': '#ffffff',
      '#b3a37a': '#e6ebee', '#9c8c66': '#b8c0c4', '#c7b98f': '#ffffff', '#8a7a58': '#9aa4aa',
      '#c98a5a': '#ecf0f2', '#b5764a': '#c8a08a', '#d8a06e': '#ffffff', '#a8683e': '#dde4e8',
      '#9a8a7a': '#e8edf0', '#86766a': '#b0b8bc', '#b0a090': '#ffffff',
      '#a87444': '#e8eef1', '#946238': '#c0a080', '#bb8652': '#ffffff',
      '#dccb9c': '#eef2f4', '#e8daae': '#ffffff', '#cdb985': '#dfe6ea', '#c4ae7c': '#c8d2d8' }),
    plant: SCENES.winter.plant
  };
  // Untilled farm plots keep a patch of dark frozen earth in winter and on snow days, so the player can still tell which tiles can be tilled
  SCENES.winter.raw = { '#a87444': '#8c7358', '#946238': '#6e5642', '#bb8652': '#b4a287', '#7cc04b': '#9cae8c' };
  SCENES.snow.raw = { '#a87444': '#85705f', '#946238': '#64524a', '#bb8652': '#c4ccd2', '#7cc04b': '#d4dde2' };
  const hexOf = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
  function seasonize(src, k) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data, w = c.width, h = c.height, S = SCENES[scene];
    const map = S ? (k === 'farm_raw' && S.raw ? S.raw : GROUND.has(k) ? S.ground : PLANT.has(k) ? S.plant : null) : null;
    const set = (i, col) => { d[i] = parseInt(col.slice(1, 3), 16); d[i + 1] = parseInt(col.slice(3, 5), 16); d[i + 2] = parseInt(col.slice(5, 7), 16); };
    if (map) for (let i = 0; i < d.length; i += 4) { if (d[i + 3] !== 255) continue; const to = map[hexOf(d, i)]; if (to) set(i, to); }
    if (scene === 'spring' && k === 'tree') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, hx = hexOf(d, i), n = (x * 7 + y * 13) % 9;
      if (d[i + 3] === 255 && (hx === '#4c8a30' || hx === '#5aa83f') && (n === 0 || n === 5)) set(i, n ? '#fbd3e3' : '#f4a6c6'); }
    // snow day: a white cap on every upward-facing edge (roofs, treetops, rocks, fences)
    if (scene === 'snow' && !GROUND.has(k)) { const top = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] === 255 && (y === 0 || d[i - w * 4 + 3] < 200)) top[y * w + x] = 1; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!top[y * w + x]) continue; const i = (y * w + x) * 4; set(i, '#f4f8fb');
        const j = i + w * 4; if (y + 1 < h && d[j + 3] === 255 && !top[(y + 1) * w + x] && (x + y) % 2 === 0) set(j, '#d8e4ec'); } }
    g.putImageData(img, 0, 0); c.ax = src.ax; c.ay = src.ay; return c;
  }
  // which sprites change with the scene: ground and plants always; trees in spring (blossom); everything but crops and people on a snow day
  const seasonal = (k, objs) => scene === 'spring' ? k === 'tree' : GROUND.has(k) || PLANT.has(k) || (scene === 'snow' && objs);
  /* ---------- inside the house: a corner room (floor + two back walls), drawn crisp at native size ----------
     The floor is n×n cells of the map's 32×16 diamond; the left wall rises along the x = 0 edge and the right wall along
     y = 0, each n spots of 16 px wide. game.js does the layout and hit testing with the same numbers (roomGeom). */
  const RWH = 60, RPAD = 10;
  function roomGeom(n) { const ox = n * 16 + RPAD, oy = RWH + RPAD;
    return { n, w: n * 32 + RPAD * 2, h: RWH + n * 16 + RPAD * 2 + 4, ox, oy, wh: RWH,
      cell: (x, y) => [ox + (x - y) * 16, oy + (x + y) * 8 + 8],         // centre of floor cell (x, y)
      floorAt(px, py) { const dx = px - ox, dy = py - oy, u = (dx / 16 + dy / 8) / 2, v = (dy / 8 - dx / 16) / 2;
        return u >= 0 && v >= 0 && u < n && v < n ? [Math.floor(u), Math.floor(v)] : null; },
      wallAt(px, py) { const dx = px - ox; if (Math.abs(dx) < .5) return null; const t = Math.abs(dx) / 16, base = oy + t * 8;
        if (t >= n || py > base || py < base - RWH) return null; return [dx < 0 ? 'l' : 'r', Math.floor(t)]; } }; }
  const hex2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function shade(h, f) { if (!h || h[0] !== '#') return h; const c = hex2(h).map(v => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
  function mixc(a, b, t) { const A = hex2(a), B = hex2(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  // crisp polygon fill (scanlines through pixel centres), so shapes stay pixel art when the room is scaled up
  function poly(r, col, pts) { let y0 = 1e9, y1 = -1e9; pts.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) { const yc = y + .5, xs = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((p, q) => p - q); for (let k = 0; k + 1 < xs.length; k += 2) { const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]); if (xb > xa) r(col, xa, y, xb - xa, 1); } } }
  // a box standing on a floor cell: u, v in cell units from the cell centre (−.5….5; negative = toward the back walls), z in pixels up
  function isoBox(r, cx, cy, sw, u0, u1, v0, v1, z0, z1, col) {
    if (sw) [u0, u1, v0, v1] = [v0, v1, u0, u1];
    const P = (u, v, z) => [cx + (u - v) * 16, cy + (u + v) * 8 - z];
    poly(r, shade(col, .78), [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)]);   // front-left face
    poly(r, shade(col, .62), [P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)]);   // front-right face
    poly(r, col, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)]); }              // top
  // sky seen through a window: s = { h: hour 6…22, season, rain, snow }
  function skyRows(s, rows) { const h = s.h, night = h >= 20.5 || h < 6.5, dusk = !night && (h >= 18.5 || h < 8);
    const top = night ? '#17213f' : dusk ? (h < 12 ? '#6f86c0' : '#5a5f9e') : s.rain ? '#8d9aa8' : s.snow ? '#b9c6d2' : '#6fb2e6';
    const low = night ? '#2b3a62' : dusk ? (h < 12 ? '#f0b87a' : '#f08a5a') : s.rain ? '#aeb8c2' : s.snow ? '#dfe6ec' : '#bfe3f6';
    return Array.from({ length: rows }, (_, i) => mixc(top, low, rows > 1 ? i / (rows - 1) : 0)); }
  const SEASON_GROUND = { spring: '#7cc04b', summer: '#9cbc3e', autumn: '#c98a3a', winter: '#eef3f6' };
  function drawRoom(g, R) {
    const G = roomGeom(R.n), n = R.n, wh = RWH;
    const r = (col, x, y, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x | 0, y | 0, ww, hh); };
    g.clearRect(0, 0, G.w, G.h);
    // wall-space pixel: side 'l'/'r', t = px along the wall from the back corner, v = px up from the floor
    const wpx = (side, t, v) => [side === 'l' ? G.ox - 1 - t : G.ox + t, G.oy + Math.floor((t + (side === 'l' ? 1 : 0)) / 2) - 1 - v];
    const wr = (side, t0, v0, w, h, col) => { for (let t = t0; t < t0 + w; t++) { const [x, y] = wpx(side, t, v0 + h - 1); r(col, x, y, 1, h); } };
    const W = R.wall, F = R.floor;
    ['l', 'r'].forEach(side => { const dim = side === 'r' ? .9 : 1, base = shade(W.base, dim), alt = shade(W.alt, dim);
      for (let t = 0; t < n * 16; t++) for (let v = 0; v < wh; v++) { let col = base;
        if (W.pat === 'stripe' && t % 8 < 3) col = alt;
        else if (W.pat === 'dots' && t % 6 === 2 && v % 7 === 3) col = alt;
        else if (W.pat === 'boards' && (t % 8 === 0 || ((t / 8 | 0) * 13 + v) % 29 === 0)) col = alt;
        else if (W.pat === 'bricks' && (v % 6 === 0 || (t + ((v / 6 | 0) % 2) * 5) % 10 === 0)) col = alt;
        if (v < 5) col = shade('#6e4628', dim); else if (v === 5) col = shade('#4e301a', dim);          // skirting board
        if (v >= wh - 3) col = v === wh - 1 ? shade('#f2e8d2', dim) : shade('#c9b48a', dim);        // top trim
        const [x, y] = wpx(side, t, v); r(col, x, y); } });
    r('#4e301a', G.ox - 1, G.oy - wh - 1, 2, wh + 1);                                               // back corner post
    // wall pieces
    const sky = R.sky || { h: 12, season: 'spring' };
    function glass(side, t0, v0, w, h) { const rows = skyRows(sky, h);
      for (let k = 0; k < h; k++) wr(side, t0, v0 + k, w, 1, rows[h - 1 - k]);
      wr(side, t0, v0, w, 2, SEASON_GROUND[sky.season] || SEASON_GROUND.spring);                     // the ground outside
      const night = sky.h >= 20.5 || sky.h < 6.5;
      for (let k = 0; k < w; k++) { const sd = (t0 * 7 + k * 13) % 11;
        if (night && sd === 3) wr(side, t0 + k, v0 + h - 3 - (k % 3), 1, 1, '#f6f0c8');
        if (sky.rain && sd % 3 === 0) wr(side, t0 + k, v0 + 3 + (k * 5) % (h - 5), 1, 2, '#dfe9f2');
        if (sky.snow && sd % 4 === 1) wr(side, t0 + k, v0 + 3 + (k * 7) % (h - 5), 1, 1, '#ffffff'); }
      if (!night && !sky.rain && !sky.snow && w > 6) wr(side, t0 + w - 4, v0 + h - 5, 2, 2, sky.h < 8 || sky.h > 18.5 ? '#f6a04a' : '#fff2a8'); }
    (R.wallPieces || []).forEach(p => { const side = p.at, t0 = p.x * 16, a = p.a, b = p.b;
      if (p.k === 'window' || p.k === 'curtains') {
        wr(side, t0 + 2, 18, 12, 30, '#efe6cf'); glass(side, t0 + 3, 19, 10, 28);
        wr(side, t0 + 7, 19, 2, 28, '#efe6cf'); wr(side, t0 + 3, 32, 10, 1, '#efe6cf');               // glazing bars
        wr(side, t0 + 1, 16, 14, 2, '#8a5a2e'); if (sky.snow || sky.season === 'winter') wr(side, t0 + 2, 18, 12, 1, '#ffffff');
        if (p.k === 'curtains') { wr(side, t0, 49, 16, 1, '#5e3519');
          for (let k = 0; k < 4; k++) { wr(side, t0 + 1 + k, 20 - k, 1, 29 + k, k % 2 ? shade(a, .85) : a); wr(side, t0 + 11 + k, 17 + k, 1, 32 - k, k % 2 ? a : shade(a, .85)); } }
        if (p.hi) wr(side, t0 + 1, 15, 14, 1, p.hi);
      } else if (p.k === 'painting') {
        wr(side, t0 + 2, 22, 12, 22, a); wr(side, t0 + 3, 23, 10, 20, shade(a, .7));
        const rows = skyRows({ h: 12, season: 'summer' }, 18); for (let k = 0; k < 18; k++) wr(side, t0 + 4, 24 + k, 8, 1, rows[17 - k]);
        wr(side, t0 + 4, 24, 8, 5, '#6aa84a'); wr(side, t0 + 6, 29, 4, 2, '#5a9a3e'); wr(side, t0 + 9, 36, 2, 2, b || '#fff2a8');
      } else { wr(side, t0 + 3, 24, 10, 16, a || '#c99a1e'); }
      if (p.ring) { wr(side, t0, 12, 16, 1, p.ring); wr(side, t0, 52, 16, 1, p.ring); wr(side, t0, 12, 1, 41, p.ring); wr(side, t0 + 15, 12, 1, 41, p.ring); } });
    // floor
    const R0 = rng(7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [cx, cy] = G.cell(x, y), X = cx - 16, Y = cy - 8;
      let base = F.base; if (F.pat === 'check' && (x + y) % 2) base = F.alt;
      for (let yy = 0; yy < 16; yy++) { const hw = hwAt(yy); r(base, X + 16 - hw, Y + yy, hw * 2, 1); }
      if (F.pat === 'boards') for (let yy = 1; yy < 16; yy += 4) { const hw = hwAt(yy); for (let k = -hw; k < hw; k += 2) r(F.alt, X + 16 + k, Y + yy + Math.floor((k + hw) / 4) % 2, 1, 1); }
      for (let k = 0; k < 4; k++) { const yy = 2 + ((R0() * 12) | 0), hw = hwAt(yy); r(shade(base, .9), X + 16 - hw + 2 + ((R0() * Math.max(1, hw * 2 - 4)) | 0), Y + yy); } }
    // floor edge (the room's front lip)
    for (let t = 0; t < n * 16; t++) { r('#3d2617', G.ox - n * 16 + t, G.oy + n * 8 + Math.floor(t / 2) - 0, 1, 3); r('#2e1c10', G.ox + t, G.oy + n * 16 - Math.floor(t / 2) - 1, 1, 3); }
    // rugs
    (R.rugs || []).forEach(p => { const P = (u, v) => [G.ox + (u - v) * 16, G.oy + (u + v) * 8], x = p.x, y = p.y;
      poly(r, p.b || '#e8c04a', [P(x + .08, y + .08), P(x + 1.92, y + .08), P(x + 1.92, y + 1.92), P(x + .08, y + 1.92)]);
      poly(r, p.a, [P(x + .25, y + .25), P(x + 1.75, y + .25), P(x + 1.75, y + 1.75), P(x + .25, y + 1.75)]);
      poly(r, p.b || '#e8c04a', [P(x + 1, y + .55), P(x + 1.45, y + 1), P(x + 1, y + 1.45), P(x + .55, y + 1)]);
      if (p.ring) { poly(r, p.ring, [P(x, y), P(x + 2, y), P(x + 2, y + .06), P(x, y + .06)]); poly(r, p.ring, [P(x, y + 1.94), P(x + 2, y + 1.94), P(x + 2, y + 2), P(x, y + 2)]); } });
    // highlights for open cells / wall spots (drawn under furniture)
    (R.hiCells || []).forEach(([x, y, col]) => { const [cx, cy] = G.cell(x, y);
      for (let yy = 0; yy < 16; yy++) { const hw = hwAt(yy); r(col, cx - 16 + 16 - hw, cy - 8 + yy, 1, 1); r(col, cx - 16 + 16 + hw - 1, cy - 8 + yy, 1, 1); } });
    (R.hiWalls || []).forEach(([side, k, col]) => { wr(side, k * 16 + 1, 8, 14, 1, col); wr(side, k * 16 + 1, wh - 6, 14, 1, col); wr(side, k * 16 + 1, 8, 1, wh - 13, col); wr(side, k * 16 + 14, 8, 1, wh - 13, col); });
    // furniture, back to front
    const glows = [];
    (R.floorPieces || []).slice().sort((p, q) => (p.x + p.y) - (q.x + q.y) || (p.z || 0) - (q.z || 0)).forEach(p => {
      const [cx, cy] = G.cell(p.x, p.y), sw = !!p.f, a = p.a, b = p.b, z = p.z || 0, B = (u0, u1, v0, v1, z0, z1, col) => isoBox(r, cx, cy, sw, u0, u1, v0, v1, z + z0, z + z1, col);
      if (p.ring) { for (let yy = 0; yy < 16; yy++) { const hw = hwAt(yy); r(p.ring, cx - hw, cy - 8 + yy, 1, 1); r(p.ring, cx + hw - 1, cy - 8 + yy, 1, 1); } }
      if (!z) poly(r, 'rgba(0,0,0,.18)', [[cx - 12, cy], [cx, cy - 6], [cx + 12, cy], [cx, cy + 6]]);
      if (p.k === 'chair') { [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(([u, v]) => B(u - .04, u + .04, v - .04, v + .04, 0, 9, b));
        B(-.26, .26, -.26, .26, 9, 11, a); B(-.26, .26, -.28, -.2, 11, 22, a); B(-.26, .26, -.28, -.2, 22, 24, b); }
      else if (p.k === 'table') { [[-.34, -.34], [.34, -.34], [-.34, .34], [.34, .34]].forEach(([u, v]) => B(u - .05, u + .05, v - .05, v + .05, 0, 12, b)); B(-.44, .44, -.44, .44, 12, 15, a); }
      else if (p.k === 'bookshelf') { B(-.45, .45, -.46, -.12, 0, 32, a); B(-.42, .42, -.13, -.11, 2, 30, '#3d2617');
        const pal = [b, '#4aa3d8', '#e8c04a', '#7cc04b', '#efe6cf', '#9a4ac8'];
        [3, 13, 23].forEach((z0, row) => { for (let u = -.4, k = row; u < .38; u += .085, k++) B(u, u + .06, -.13, -.1, z0, z0 + 6 + (k % 3 === 0 ? 1 : 0), pal[(k * 5 + row) % pal.length]); B(-.44, .44, -.13, -.1, z0 - 1, z0, shade(a, .8)); }); }
      else if (p.k === 'lamp') { B(-.11, .11, -.11, .11, 0, 2, a); B(-.07, .07, -.07, .07, 2, 9, b || '#f6e27a'); B(-.04, .04, -.04, .04, 6, 8, '#fff6c0'); B(-.08, .08, -.08, .08, 9, 10, shade(a, .8));
        glows.push([cx, cy - z - 6]); }
      else if (p.k === 'vase') { B(-.1, .1, -.1, .1, 0, 7, a); B(-.06, .06, -.06, .06, 7, 9, shade(a, .85)); B(-.015, .015, -.015, .015, 9, 13, '#4a8a3a');
        [[-3, 13], [2, 14], [0, 16], [-1, 12]].forEach(([dx, dz], k) => r(k % 2 ? '#f6e27a' : (b || '#e86aa8'), cx + dx, cy - z - dz, 2, 2)); }
      else if (p.k === 'jewel_box') { B(-.17, .17, -.12, .12, 0, 4, a); B(-.18, .18, -.13, .13, 4, 5, '#e8c040'); B(-.17, .17, -.12, .12, 5, 7, shade(a, 1.2)); r(b || '#3ae0d0', cx - 1, cy - z - 8, 2, 1); }
      else B(-.2, .2, -.2, .2, 0, 10, a || '#c98a4a'); });
    if (R.night) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,24,60,.2)'; g.fillRect(0, 0, G.w, G.h); g.restore();
      glows.forEach(([x, y]) => { g.fillStyle = 'rgba(255,214,120,.14)'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }); }
  }
  function base(key) {
      if (cache[key]) return cache[key];
      const [k, a] = key.split(':');
      let c;
      if (G[k]) c = G[k](+a || 0);
      else if (k === 'crop') { const [kind, st] = a.split('.'); c = crop(kind, +st); }
      else if (k === 'avatar') { const [s, h, f, w] = a.split('.').map(Number); c = avatar(s, h, f, w); }
      else if (k === 'mon') { const [kind, st, mode] = a.split('.'); c = monument(kind, +st, mode); }
      else if (k === 'house') { const [A, B, L] = a.split('.').map(Number); c = house(A || 1, B || 1, L || 0); }
      else if (OBJ[k]) c = OBJ[k](a === undefined ? undefined : +a);
      else c = mk(2, 2, () => {});
      if (SHORT.has(k)) c = dropRows(c, shortRows(k === 'stove_on' ? 'stove' : k));
      return (cache[key] = c);
  }
  return {
    SHIRTS, HATS,
    get(key) {
      const k = key.split(':')[0];
      if (!seasonal(k, !!OBJ[k])) return base(key);
      const sk = scene + '|' + key; return cache[sk] || (cache[sk] = seasonize(base(key), k));
    },
    setScene(s) { if (s !== scene && (s === 'spring' || SCENES[s])) scene = s; },
    get scene() { return scene; },
    icon(id, items) {
      if (urls[id]) return urls[id];
      const it = items[id]; const c = icon(...it.icon);
      return (urls[id] = c.toDataURL());
    },
    discPic(pic, items) { return discPic(pic, items, base); }, // discovery cards keep the spring look
    monPic(kind, stage) { const k = 'monpic:' + kind + stage; return urls[k] || (urls[k] = base(`mon:${kind}.${stage}.big`).toDataURL()); },
    roomGeom, drawRoom,
    iconCanvas(id, items) { const k = 'icon:' + id; if (!cache[k]) cache[k] = icon(...items[id].icon); return cache[k]; }
  };
})();
