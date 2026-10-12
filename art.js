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
    farm_raw: () => ground('#a87444', ['#946238', '#bb8652', '#7cc04b'], SIDE[0], SIDE[1], 91),
    farm_tilled: () => ground('#80502b', ['#8e5c33'], SIDE[0], SIDE[1], 92, furrows('#5e3519', '#966238')),
    farm_wet: () => ground('#5c3820', ['#4c2e1a'], SIDE[0], SIDE[1], 93, furrows('#432612', '#6b4426'))
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
    smelter: () => mk(32, 38, (g, r) => {
      shadow(r, 38, 12);
      r('#8a8a94', 6, 18, 20, 14); r('#6e6e78', 16, 18, 10, 14); r('#b5523b', 6, 17, 20, 2);
      r('#7a7a84', 18, 2, 5, 16); r('#5c5c66', 21, 2, 2, 16); r('#4a4a52', 18, 2, 5, 1);
      r('#2a1a14', 9, 22, 8, 7); r('#f06a20', 10, 24, 6, 4); r('#f6e27a', 12, 25, 2, 2); r('#d9824a', 19, 28, 5, 2);
    }),
    reeds: () => mk(32, 24, (g, r) => {
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
        default: r(a, 4, 4, 8, 8);
      }
    });
  }

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
  return {
    SHIRTS, HATS,
    get(key) {
      if (cache[key]) return cache[key];
      const [k, a] = key.split(':');
      let c;
      if (G[k]) c = G[k](+a || 0);
      else if (k === 'crop') { const [kind, st] = a.split('.'); c = crop(kind, +st); }
      else if (k === 'avatar') { const [s, h, f, w] = a.split('.').map(Number); c = avatar(s, h, f, w); }
      else if (OBJ[k]) c = OBJ[k](a === undefined ? undefined : +a);
      else c = mk(2, 2, () => {});
      return (cache[key] = c);
    },
    icon(id, items) {
      if (urls[id]) return urls[id];
      const it = items[id]; const c = icon(...it.icon);
      return (urls[id] = c.toDataURL());
    },
    discPic(pic, items) { return discPic(pic, items, k => this.get(k)); },
    iconCanvas(id, items) { const k = 'icon:' + id; if (!cache[k]) cache[k] = icon(...items[id].icon); return cache[k]; }
  };
})();
