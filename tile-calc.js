/* ════════════════════════════════════════════
   ГРАНИТ PRO — Калькулятор раскладки плитки
   Vanilla JS — no dependencies
   Все размеры — в миллиметрах.
   Система координат: начало — левый нижний угол поверхности,
   X — вправо, Y — вверх (как на схеме).
════════════════════════════════════════════ */

const TileCore = (() => {
  const EPS = 0.01;
  const MIN_PIECE = 1;        // куски тоньше 1 мм закрываются затиркой
  const MAX_TILES = 20000;    // защита от зависания

  // Позиция в диапазоне (-p, 0]
  const norm = (x, p) => {
    let r = ((x % p) + p) % p;
    if (r > EPS) r -= p;
    return r;
  };

  // Ширины кусков вдоль одной оси при старте раскладки в x0
  const axisPieces = (len, tile, gap, x0) => {
    const out = [];
    for (let s = x0; s < len - EPS; s += tile + gap) {
      const w = Math.min(s + tile, len) - Math.max(s, 0);
      if (w > EPS) out.push(w);
    }
    return out;
  };

  const ALIGN_MODES = ['start', 'center-tile', 'center-joint', 'end'];

  const alignStart = (len, tile, gap, mode) => {
    const p = tile + gap;
    switch (mode) {
      case 'end':          return norm(len - tile, p);
      case 'center-tile':  return norm(len / 2 - tile / 2, p);
      case 'center-joint': return norm(len / 2 + gap / 2, p);
      case 'auto': {
        // Меньше всего резов, но без подрезок уже половины плитки.
        // Если так не выходит — вариант с самой широкой крайней подрезкой.
        let best = null;
        for (const m of ALIGN_MODES) {
          const x0 = alignStart(len, tile, gap, m);
          const pieces = axisPieces(len, tile, gap, x0);
          const min = Math.min(...pieces);
          const cand = {
            x0, min,
            ok: min >= tile / 2 - 0.5,
            cuts: pieces.filter(w => w < tile - 0.5).length,
          };
          const better = !best
            || (cand.ok && !best.ok)
            || (cand.ok && best.ok && (cand.cuts < best.cuts || (cand.cuts === best.cuts && cand.min > best.min + 1)))
            || (!cand.ok && !best.ok && cand.min > best.min + 1);
          if (better) best = cand;
        }
        return best.x0;
      }
      default:             return 0;
    }
  };

  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x;
    const h = Math.min(a.y + a.h, b.y + b.h) - y;
    return (w > EPS && h > EPS) ? { x, y, w, h } : null;
  };

  const uniqSorted = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.filter((v, i) => i === 0 || v - s[i - 1] > EPS);
  };

  const r1 = (v) => Math.round(v);

  /*
   * Кусок плитки (прямоугольник P) минус прямоугольные препятствия.
   * Возвращает связные области: bbox, площадь, вырезы в локальных координатах.
   */
  const splitByObstacles = (P, clips) => {
    if (!clips.length) {
      return [{ ...P, area: P.w * P.h, cutouts: [], lx: P.x + P.w / 2, ly: P.y + P.h / 2 }];
    }
    const xs = uniqSorted([P.x, P.x + P.w, ...clips.flatMap(c => [c.x, c.x + c.w])]);
    const ys = uniqSorted([P.y, P.y + P.h, ...clips.flatMap(c => [c.y, c.y + c.h])]);
    const nx = xs.length - 1, ny = ys.length - 1;
    const free = [];
    for (let i = 0; i < nx; i++) {
      free[i] = [];
      for (let j = 0; j < ny; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
        free[i][j] = !clips.some(c => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h);
      }
    }
    const seen = free.map(col => col.map(() => false));
    const comps = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (!free[i][j] || seen[i][j]) continue;
        let i0 = i, i1 = i, j0 = j, j1 = j, area = 0, bestCell = 0, lx = 0, ly = 0;
        const stack = [[i, j]];
        seen[i][j] = true;
        while (stack.length) {
          const [a, b] = stack.pop();
          const cw = xs[a + 1] - xs[a], ch = ys[b + 1] - ys[b];
          area += cw * ch;
          if (cw * ch > bestCell) {
            bestCell = cw * ch;
            lx = (xs[a] + xs[a + 1]) / 2;
            ly = (ys[b] + ys[b + 1]) / 2;
          }
          i0 = Math.min(i0, a); i1 = Math.max(i1, a);
          j0 = Math.min(j0, b); j1 = Math.max(j1, b);
          for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const na = a + da, nb = b + db;
            if (na >= 0 && na < nx && nb >= 0 && nb < ny && free[na][nb] && !seen[na][nb]) {
              seen[na][nb] = true;
              stack.push([na, nb]);
            }
          }
        }
        const box = { x: xs[i0], y: ys[j0], w: xs[i1 + 1] - xs[i0], h: ys[j1 + 1] - ys[j0] };
        const cutouts = [];
        if (box.w * box.h - area > EPS) {
          for (const c of clips) {
            const k = intersect(c, box);
            if (k) cutouts.push({ x: k.x - box.x, y: k.y - box.y, w: k.w, h: k.h });
          }
        }
        comps.push({ ...box, area, cutouts, lx, ly });
      }
    }
    return comps;
  };

  const circleHitsRect = (c, R) => {
    const dx = Math.max(R.x - c.x, 0, c.x - (R.x + R.w));
    const dy = Math.max(R.y - c.y, 0, c.y - (R.y + R.h));
    return dx * dx + dy * dy < c.r * c.r - EPS;
  };

  const circleCoversRect = (c, R) =>
    [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]]
      .every(([x, y]) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r);

  const letter = (n) => {
    let s = '';
    n += 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  /*
   * Раскрой резаных кусков из целых плиток (гильотинная упаковка).
   * Позволяет посчитать, сколько плиток реально уйдёт на подрезку
   * с учётом использования обрезков.
   */
  const packPieces = (items, tw, th, kerf, allowRotate) => {
    const bins = [];
    const sorted = [...items].sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
    const fits = (fr, w, h) => w <= fr.w + EPS && h <= fr.h + EPS;

    for (const it of sorted) {
      let best = null;
      const tryBin = (bin, bi) => {
        bin.free.forEach((fr, fi) => {
          const orients = [[it.w, it.h, false]];
          if (allowRotate && Math.abs(it.w - it.h) > EPS) orients.push([it.h, it.w, true]);
          for (const [w, h, rot] of orients) {
            if (!fits(fr, w, h)) continue;
            const score = fr.w * fr.h - w * h;
            const side = Math.min(fr.w - w, fr.h - h);
            if (!best || score < best.score - EPS || (Math.abs(score - best.score) <= EPS && side < best.side)) {
              best = { bi, fi, w, h, rot, score, side };
            }
          }
        });
      };
      bins.forEach(tryBin);
      if (!best) {
        bins.push({ free: [{ x: 0, y: 0, w: tw, h: th }], placed: [] });
        tryBin(bins[bins.length - 1], bins.length - 1);
      }
      if (!best) continue; // не должно случаться: кусок всегда меньше плитки

      const bin = bins[best.bi];
      const fr = bin.free.splice(best.fi, 1)[0];
      bin.placed.push({ x: fr.x, y: fr.y, w: best.w, h: best.h, rot: best.rot, label: it.label });
      const rw = fr.w - best.w - kerf, rh = fr.h - best.h - kerf;
      let right, top;
      if (rw < rh) {
        top   = { x: fr.x, y: fr.y + best.h + kerf, w: fr.w, h: rh };
        right = { x: fr.x + best.w + kerf, y: fr.y, w: rw, h: best.h };
      } else {
        right = { x: fr.x + best.w + kerf, y: fr.y, w: rw, h: fr.h };
        top   = { x: fr.x, y: fr.y + best.h + kerf, w: best.w, h: rh };
      }
      for (const r of [right, top]) if (r.w > MIN_PIECE && r.h > MIN_PIECE) bin.free.push(r);
    }
    return bins;
  };

  const validate = (s) => {
    const errors = [];
    const pos = (v, name) => { if (!(v > 0)) errors.push(`Укажите ${name} (больше нуля).`); };
    pos(s.surface.w, 'ширину поверхности');
    pos(s.surface.h, s.surface.type === 'wall' ? 'высоту стены' : 'длину поверхности');
    pos(s.tile.w, 'ширину плитки');
    pos(s.tile.h, 'высоту плитки');
    if (!(s.tile.gap >= 0)) errors.push('Ширина шва не может быть отрицательной.');
    if (!(s.surface.edge >= 0)) errors.push('Отступ от края не может быть отрицательным.');
    if (errors.length) return errors;
    if (2 * s.surface.edge >= Math.min(s.surface.w, s.surface.h)) {
      errors.push('Отступ от края больше половины поверхности.');
    }
    const est = ((s.surface.w / (s.tile.w + s.tile.gap)) + 2) * ((s.surface.h / (s.tile.h + s.tile.gap)) + 2);
    if (est > MAX_TILES) {
      errors.push('Слишком много плиток для расчёта — проверьте единицы измерения (все размеры в миллиметрах).');
    }
    return errors;
  };

  const calculate = (s) => {
    const errors = validate(s);
    if (errors.length) return { errors };

    const W = s.surface.w, H = s.surface.h, e = s.surface.edge;
    const tw = s.tile.w, th = s.tile.h, g = s.tile.gap;
    const px = tw + g, py = th + g;
    const R = { x: e, y: e, w: W - 2 * e, h: H - 2 * e };

    const rects = [], circles = [];
    for (const o of s.obstacles) {
      if (o.kind === 'circle') {
        if (o.d > 0) circles.push({ ...o, x: o.x, y: o.y, r: o.d / 2 });
      } else if (o.w > 0 && o.h > 0) {
        rects.push(o);
      }
    }

    const ax = norm(alignStart(R.w, tw, g, s.layout.x) + (s.layout.shiftX || 0), px);
    const ay = norm(alignStart(R.h, th, g, s.layout.y) + (s.layout.shiftY || 0), py);
    const frac = s.layout.offset || 0;

    const pieces = [];
    for (let j = 0, y = ay; y < R.h - EPS; j++, y += py) {
      const xs = norm(ax + j * frac * px, px);
      for (let x = xs; x < R.w - EPS; x += px) {
        const P = intersect({ x: R.x + x, y: R.y + y, w: tw, h: th }, R);
        if (!P) continue;
        const clips = rects.map(o => intersect(o, P)).filter(Boolean);
        for (const c of splitByObstacles(P, clips)) {
          if (c.w < MIN_PIECE || c.h < MIN_PIECE) continue;
          const holes = [];
          let covered = false;
          for (const ci of circles) {
            if (!circleHitsRect(ci, c)) continue;
            if (!c.cutouts.length && circleCoversRect(ci, c)) { covered = true; break; }
            holes.push({ cx: ci.x - c.x, cy: ci.y - c.y, d: ci.d });
          }
          if (covered) continue;
          const w = r1(c.w), h = r1(c.h);
          const full = Math.abs(c.w - tw) < 0.5 && Math.abs(c.h - th) < 0.5 && !c.cutouts.length && !holes.length;
          pieces.push({
            x: c.x, y: c.y, w: c.w, h: c.h, rw: w, rh: h, area: c.area, full, lx: c.lx, ly: c.ly,
            cutouts: c.cutouts.map(k => ({ x: r1(k.x), y: r1(k.y), w: r1(k.w), h: r1(k.h) })),
            holes: holes.map(k => ({ cx: r1(k.cx), cy: r1(k.cy), d: r1(k.d) })),
          });
        }
      }
    }

    // Группировка одинаковых резов
    const groupsMap = new Map();
    for (const p of pieces) {
      if (p.full) continue;
      const key = [
        `${p.rw}x${p.rh}`,
        p.cutouts.map(k => `${k.x},${k.y},${k.w},${k.h}`).sort().join(';'),
        p.holes.map(k => `${k.cx},${k.cy},${k.d}`).sort().join(';'),
      ].join('|');
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { w: p.rw, h: p.rh, cutouts: p.cutouts, holes: p.holes, count: 0, pieces: [] });
      }
      const grp = groupsMap.get(key);
      grp.count++;
      grp.pieces.push(p);
    }
    const groups = [...groupsMap.values()]
      .sort((a, b) => b.w * b.h - a.w * a.h || b.count - a.count);
    groups.forEach((grp, i) => {
      grp.label = letter(i);
      grp.figure = grp.cutouts.length > 0 || grp.holes.length > 0;
      grp.pieces.forEach(p => { p.label = grp.label; });
    });

    const fullCount = pieces.filter(p => p.full).length;
    const cutCount = pieces.length - fullCount;

    const items = groups.flatMap(grp =>
      Array.from({ length: grp.count }, () => ({ w: grp.w, h: grp.h, label: grp.label })));
    const bins = packPieces(items, tw, th, s.material.kerf || 0, s.material.rotate);

    // Одинаковые схемы раскроя — одной строкой
    const binGroups = new Map();
    for (const b of bins) {
      const key = b.placed.map(p => `${p.label}@${r1(p.x)},${r1(p.y)},${r1(p.w)},${r1(p.h)}`).sort().join('|');
      if (!binGroups.has(key)) binGroups.set(key, { placed: b.placed, count: 0 });
      binGroups.get(key).count++;
    }

    const tilesForCuts = s.material.reuse ? bins.length : cutCount;
    const need = fullCount + tilesForCuts;
    const buy = Math.ceil(need * (1 + (s.material.reserve || 0) / 100) - 1e-9);
    const perPack = s.material.perPack || 0;
    const packs = perPack > 0 ? Math.ceil(buy / perPack) : 0;
    const tileArea = tw * th / 1e6;
    const buyArea = (packs ? packs * perPack : buy) * tileArea;
    const cost = s.material.price > 0 ? buyArea * s.material.price : 0;

    const netArea = pieces.reduce((sum, p) => sum + p.area, 0) / 1e6;
    const holesArea = circles.reduce((sum, c) => {
      const inside = c.x - c.r >= R.x && c.x + c.r <= R.x + R.w && c.y - c.r >= R.y && c.y + c.r <= R.y + R.h;
      return sum + (inside ? Math.PI * c.r * c.r : 0);
    }, 0) / 1e6;

    // Предупреждения
    const warnings = [];
    const narrowLimit = Math.max(30, Math.min(tw, th) * 0.2);
    const narrow = pieces.filter(p => !p.full && Math.min(p.w, p.h) < narrowLimit);
    if (narrow.length) {
      const minW = Math.min(...narrow.map(p => Math.min(p.w, p.h)));
      warnings.push(`Есть узкие подрезки: ${narrow.length} шт., самая узкая — ${Math.max(1, r1(minW))} мм. ` +
        'Их трудно резать и они заметны. Попробуйте раскладку «Авто», «По центру» или сдвиг.');
    }
    for (const o of s.obstacles) {
      const inR = o.kind === 'circle'
        ? circleHitsRect({ x: o.x, y: o.y, r: (o.d || 0) / 2 }, { x: 0, y: 0, w: W, h: H })
        : intersect(o, { x: 0, y: 0, w: W, h: H });
      if (!inR) warnings.push(`Островок «${o.name || 'без названия'}» находится за пределами поверхности.`);
    }

    return {
      errors: [],
      warnings,
      pieces,
      groups,
      binGroups: [...binGroups.values()],
      totals: {
        fullCount, cutCount, bins: bins.length, need, buy, packs, cost,
        noReuse: fullCount + cutCount,
        area: netArea - holesArea,
      },
      geom: { W, H, R, tw, th, rects, circles },
    };
  };

  return { calculate, alignStart, axisPieces, packPieces, letter };
})();

if (typeof module !== 'undefined') module.exports = TileCore;


/* ════════════════════════════════════════════
   UI
════════════════════════════════════════════ */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'granit-tile-calc-v1';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const DEFAULT_STATE = () => ({
      surface:  { type: 'floor', w: 2400, h: 1800, edge: 0 },
      tile:     { w: 600, h: 300, gap: 2 },
      layout:   { x: 'auto', y: 'auto', offset: 0, shiftX: 0, shiftY: 0 },
      obstacles: [
        { id: 1, kind: 'rect',   name: 'Короб стояка', x: 0,    y: 1500, w: 250, h: 300 },
        { id: 2, kind: 'circle', name: 'Трап',         x: 1200, y: 900,  d: 110 },
      ],
      material: { reserve: 10, kerf: 2, reuse: true, rotate: true, perPack: 0, price: 0 },
    });

    let state = DEFAULT_STATE();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.surface && saved.tile) state = { ...DEFAULT_STATE(), ...saved };
    } catch (_) { /* нет доступа к хранилищу — работаем с примером */ }

    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    };

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const fmt = (n, d = 0) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ── Навигация ── */
    const burger = $('.burger');
    const mobileMenu = $('#mobileMenu');
    burger.addEventListener('click', () => {
      const open = !mobileMenu.classList.contains('open');
      mobileMenu.classList.toggle('open', open);
      burger.classList.toggle('active', open);
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    $$('a', mobileMenu).forEach(a => a.addEventListener('click', () => burger.click()));

    /* ── Привязка полей к state ── */
    const getPath = (path) => path.split('.').reduce((o, k) => o[k], state);
    const setPath = (path, v) => {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => o[k], state)[last] = v;
    };
    const readInput = (el) => {
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'number') return el.value === '' ? 0 : parseFloat(el.value.replace(',', '.'));
      if (el.dataset.num !== undefined) return parseFloat(el.value);
      return el.value;
    };

    const syncForm = () => {
      $$('[data-k]').forEach(el => {
        const v = getPath(el.dataset.k);
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'radio') el.checked = el.value === String(v);
        else el.value = v;
      });
      renderObstacleList();
      updateSurfaceLabels();
    };

    const updateSurfaceLabels = () => {
      const wall = state.surface.type === 'wall';
      $('#lblSurfaceH').textContent = wall ? 'Высота стены' : 'Длина';
      $('#lblAlignY').textContent = wall ? 'По вертикали' : 'По длине';
      $('#optYStart').textContent = wall ? 'От пола (снизу)' : 'От нижнего края';
      $('#optYEnd').textContent = wall ? 'От потолка (сверху)' : 'От верхнего края';
    };

    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.k) {
        if (el.type === 'radio' && !el.checked) return;
        setPath(el.dataset.k, readInput(el));
        if (el.dataset.k === 'surface.type') updateSurfaceLabels();
        update();
      } else if (el.dataset.obs) {
        const o = state.obstacles.find(ob => ob.id === +el.dataset.obs);
        if (o) { o[el.dataset.f] = readInput(el); update(); }
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target.matches('select[data-k], input[type=checkbox][data-k], input[type=radio][data-k]')) {
        e.target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    /* ── Островки ── */
    const nextId = () => state.obstacles.reduce((m, o) => Math.max(m, o.id), 0) + 1;

    $('#addRect').addEventListener('click', () => {
      state.obstacles.push({ id: nextId(), kind: 'rect', name: 'Короб', x: 0, y: 0, w: 300, h: 300 });
      renderObstacleList(); update();
    });
    $('#addCircle').addEventListener('click', () => {
      state.obstacles.push({ id: nextId(), kind: 'circle', name: 'Труба', x: 300, y: 300, d: 50 });
      renderObstacleList(); update();
    });
    $('#obstacleList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      state.obstacles = state.obstacles.filter(o => o.id !== +btn.dataset.del);
      renderObstacleList(); update();
    });

    const field = (o, f, label, unit = 'мм') => `
      <label class="tc-field tc-field-sm">
        <span>${label}</span>
        <span class="tc-input-wrap">
          <input type="number" inputmode="decimal" min="0" step="1" data-obs="${o.id}" data-f="${f}" value="${esc(o[f])}">
          <em>${unit}</em>
        </span>
      </label>`;

    const renderObstacleList = () => {
      const list = $('#obstacleList');
      if (!state.obstacles.length) {
        list.innerHTML = '<p class="tc-empty">Островков нет — поверхность ровная.</p>';
        return;
      }
      list.innerHTML = state.obstacles.map(o => `
        <div class="tc-obstacle">
          <div class="tc-obstacle-head">
            <span class="tc-obstacle-icon" aria-hidden="true">${o.kind === 'circle' ? '◯' : '▭'}</span>
            <input type="text" class="tc-obstacle-name" data-obs="${o.id}" data-f="name" value="${esc(o.name)}" aria-label="Название">
            <button type="button" class="tc-del" data-del="${o.id}" aria-label="Удалить">×</button>
          </div>
          <div class="tc-grid-4">
            ${o.kind === 'circle'
              ? field(o, 'x', 'Центр от лев.') + field(o, 'y', 'Центр от низа') + field(o, 'd', 'Диаметр')
              : field(o, 'x', 'От левого края') + field(o, 'y', 'От нижнего края') + field(o, 'w', 'Ширина') + field(o, 'h', 'Высота')}
          </div>
        </div>`).join('');
    };

    /* ── Кнопки ── */
    $('#rotateTile').addEventListener('click', () => {
      [state.tile.w, state.tile.h] = [state.tile.h, state.tile.w];
      syncForm(); update();
    });
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Сбросить все размеры к примеру?')) return;
      state = DEFAULT_STATE();
      syncForm(); update();
    });
    $('#printBtn').addEventListener('click', () => window.print());

    /* ── Отрисовка схемы ── */
    const el = (tag, attrs = {}, text) => {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };

    const describe = (grp) => {
      const parts = [];
      if (grp.figure) {
        grp.cutouts.forEach(k => parts.push(
          `вырез ${k.w}×${k.h} мм — ${k.x} мм от левого края, ${k.y} мм от нижнего`));
        grp.holes.forEach(k => {
          const inside = k.cx - k.d / 2 >= 0 && k.cx + k.d / 2 <= grp.w && k.cy - k.d / 2 >= 0 && k.cy + k.d / 2 <= grp.h;
          parts.push(inside
            ? `отверстие Ø${k.d} мм — центр в ${k.cx} мм от левого края и ${k.cy} мм от нижнего`
            : `вырез по дуге Ø${k.d} мм — центр окружности в ${k.cx} мм от левого края и ${k.cy} мм от нижнего (центр за краем куска)`);
        });
      }
      return parts;
    };

    const pieceTitle = (p, tw, th) => {
      if (p.full) return `Целая плитка ${tw}×${th}`;
      return `${p.label}: ${p.rw}×${p.rh} мм`;
    };

    const renderScheme = (res) => {
      const svg = $('#scheme');
      svg.innerHTML = '';
      const { W, H, R, tw, th, rects, circles } = res.geom;
      const big = Math.max(W, H);
      const pad = big * 0.07;
      const fs = big / 42;
      svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + pad * 1.4} ${H + pad * 2}`);
      const Y = (y, h = 0) => H - y - h; // перевод в координаты SVG (ось Y вниз)

      const defs = el('defs');
      const hatch = el('pattern', { id: 'hatch', width: big / 60, height: big / 60, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      hatch.appendChild(el('rect', { width: big / 60, height: big / 60, class: 'sc-obst-bg' }));
      hatch.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: big / 60, class: 'sc-hatch' , 'stroke-width': big / 300 }));
      defs.appendChild(hatch);
      svg.appendChild(defs);

      svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, class: 'sc-surface' }));
      if (R.x > 0) {
        svg.appendChild(el('rect', { x: R.x, y: R.x, width: R.w, height: R.h, class: 'sc-edge', 'stroke-width': big / 600 }));
      }

      const sw = big / 900;
      for (const p of res.pieces) {
        const g = el('g');
        g.appendChild(el('title', {}, pieceTitle(p, tw, th)));
        g.appendChild(el('rect', {
          x: p.x, y: Y(p.y, p.h), width: p.w, height: p.h,
          class: p.full ? 'sc-full' : (p.cutouts.length || p.holes.length ? 'sc-fig' : 'sc-cut'),
          'stroke-width': sw,
        }));
        if (!p.full) {
          const size = Math.min(fs, Math.min(p.w, p.h) * 0.6);
          if (size > fs * 0.25) {
            g.appendChild(el('text', {
              x: p.lx, y: Y(p.ly), 'font-size': size, class: 'sc-label',
              'text-anchor': 'middle', 'dominant-baseline': 'central',
            }, p.label));
          }
        }
        svg.appendChild(g);
      }

      for (const o of rects) {
        const g = el('g');
        g.appendChild(el('title', {}, `${o.name}: ${o.w}×${o.h} мм`));
        g.appendChild(el('rect', { x: o.x, y: Y(o.y, o.h), width: o.w, height: o.h, fill: 'url(#hatch)', class: 'sc-obst', 'stroke-width': big / 400 }));
        if (o.name && Math.min(o.w, o.h) > fs * 1.2) {
          g.appendChild(el('text', {
            x: o.x + o.w / 2, y: Y(o.y + o.h / 2), 'font-size': Math.min(fs * 0.8, o.w / Math.max(o.name.length, 1) * 1.6),
            class: 'sc-obst-label', 'text-anchor': 'middle', 'dominant-baseline': 'central',
          }, o.name));
        }
        svg.appendChild(g);
      }
      for (const c of circles) {
        const g = el('g');
        g.appendChild(el('title', {}, `${c.name}: Ø${c.d} мм`));
        g.appendChild(el('circle', { cx: c.x, cy: Y(c.y), r: c.r, fill: 'url(#hatch)', class: 'sc-obst', 'stroke-width': big / 400 }));
        svg.appendChild(g);
      }

      // Размеры поверхности
      const dimY = -pad * 0.45;
      svg.appendChild(el('line', { x1: 0, y1: dimY, x2: W, y2: dimY, class: 'sc-dim', 'stroke-width': big / 500 }));
      svg.appendChild(el('text', { x: W / 2, y: dimY - fs * 0.35, 'font-size': fs, class: 'sc-dim-text', 'text-anchor': 'middle' }, `${fmt(W)} мм`));
      const dimX = W + pad * 0.35;
      svg.appendChild(el('line', { x1: dimX, y1: 0, x2: dimX, y2: H, class: 'sc-dim', 'stroke-width': big / 500 }));
      svg.appendChild(el('text', {
        x: dimX + fs * 0.4, y: H / 2, 'font-size': fs, class: 'sc-dim-text', 'text-anchor': 'middle',
        transform: `rotate(90 ${dimX + fs * 0.4} ${H / 2})`,
      }, `${fmt(H)} мм`));
      svg.appendChild(el('text', { x: 0, y: H + fs * 1.3, 'font-size': fs * 0.8, class: 'sc-origin' }, '↖ начало отсчёта (0; 0)'));
    };

    const renderBins = (res) => {
      const wrap = $('#binList');
      const { tw, th } = res.geom;
      if (!res.binGroups.length) {
        wrap.innerHTML = '<p class="tc-empty">Резать ничего не нужно — только целые плитки.</p>';
        return;
      }
      const fs = Math.max(tw, th) / 6;
      wrap.innerHTML = res.binGroups.map(b => {
        const rects = b.placed.map(p => `
          <rect x="${p.x}" y="${th - p.y - p.h}" width="${p.w}" height="${p.h}" class="sc-cut" stroke-width="${Math.max(tw, th) / 100}"/>
          <text x="${p.x + p.w / 2}" y="${th - p.y - p.h / 2}" font-size="${Math.min(fs, Math.min(p.w, p.h) * 0.7)}"
                class="sc-label" text-anchor="middle" dominant-baseline="central">${p.label}</text>`).join('');
        const names = b.placed.map(p => p.label + (p.rot ? '↻' : '')).join(' + ');
        return `
          <div class="tc-bin">
            <svg viewBox="0 0 ${tw} ${th}" class="tc-bin-svg" role="img" aria-label="Раскрой: ${names}">
              <rect x="0" y="0" width="${tw}" height="${th}" class="sc-waste"/>
              ${rects}
            </svg>
            <div class="tc-bin-cap"><strong>${names}</strong><span>× ${b.count} шт.</span></div>
          </div>`;
      }).join('');
    };

    const renderCutList = (res) => {
      const body = $('#cutBody');
      const { tw, th } = res.geom;
      const rows = [];
      if (res.totals.fullCount) {
        rows.push(`<tr><td><span class="tc-tag tc-tag-full">—</span></td><td>${tw}×${th}</td><td>${res.totals.fullCount}</td><td>Целая плитка, без реза</td></tr>`);
      }
      for (const g of res.groups) {
        const details = describe(g);
        let what;
        if (g.figure) what = `<strong>Фигурный рез.</strong> Заготовка ${g.w}×${g.h}, затем:<ul>${details.map(d => `<li>${d}</li>`).join('')}</ul>`;
        else if (g.w < tw && g.h < th) what = `Отрезать по ширине до ${g.w} и по высоте до ${g.h}`;
        else if (g.w < tw) what = `Отрезать по ширине до ${g.w} мм`;
        else what = `Отрезать по высоте до ${g.h} мм`;
        rows.push(`<tr>
          <td><span class="tc-tag ${g.figure ? 'tc-tag-fig' : ''}">${g.label}</span></td>
          <td class="tc-nowrap">${g.w}×${g.h}</td>
          <td>${g.count}</td>
          <td>${what}</td>
        </tr>`);
      }
      body.innerHTML = rows.join('');
    };

    const renderSummary = (res) => {
      const t = res.totals;
      const cards = [
        ['Целых плиток', fmt(t.fullCount), 'кладутся без реза'],
        ['Резаных кусков', fmt(t.cutCount), `${res.groups.length} разных размеров`],
        ['Уйдёт плиток', fmt(t.need), state.material.reuse
          ? `с обрезками; без них — ${fmt(t.noReuse)}`
          : 'каждый кусок из новой плитки'],
        ['Купить с запасом', fmt(t.buy) + ' шт.', `запас ${fmt(state.material.reserve)}%` + (t.packs ? ` · ${fmt(t.packs)} упак.` : ''), true],
        ['Площадь облицовки', fmt(t.area, 2) + ' м²', 'за вычетом островков'],
      ];
      if (t.cost) cards.push(['Стоимость плитки', fmt(Math.round(t.cost)) + ' ₽', t.packs ? 'по целым упаковкам' : 'по штукам с запасом']);
      $('#summary').innerHTML = cards.map(([k, v, sub, hl]) => `
        <div class="tc-stat${hl ? ' tc-stat-hl' : ''}">
          <span class="tc-stat-k">${k}</span>
          <strong class="tc-stat-v">${v}</strong>
          <span class="tc-stat-sub">${sub}</span>
        </div>`).join('');
    };

    const update = () => {
      save();
      const res = TileCore.calculate(state);
      const errBox = $('#errors');
      const results = $('#results');
      if (res.errors.length) {
        errBox.innerHTML = res.errors.map(e => `<p>${esc(e)}</p>`).join('');
        errBox.hidden = false;
        results.classList.add('tc-dim');
        return;
      }
      errBox.hidden = true;
      results.classList.remove('tc-dim');
      const warnBox = $('#warnings');
      warnBox.innerHTML = res.warnings.map(w => `<p>⚠ ${esc(w)}</p>`).join('');
      warnBox.hidden = !res.warnings.length;
      renderSummary(res);
      renderScheme(res);
      renderCutList(res);
      renderBins(res);
    };

    syncForm();
    update();
  });
}
