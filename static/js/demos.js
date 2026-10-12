// Interactive stage demos. Every number drawn here comes from the recorded
// pipeline traces in static/data (built by scripts/build_demo_data.py).
(() => {
  "use strict";

  const COL = {
    x: "#d4582a", y: "#2a78d6", z: "#158f63", drop: "#c3c8ce",
    ink: "#15191e", ink2: "#48505a", muted: "#6b737c", rule: "#e2e5e8",
    map: "#b4bac1", faint: "#e9ecef", pale: "#a9c6ea", accent: "#2a78d6",
  };
  const DEG = 180 / Math.PI;
  const S = { data: {}, map: null, key: "b", psi: null };
  const demos = [];

  // ------------------------------------------------------------ helpers ---
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, html = "") => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (html) e.innerHTML = html;
    return e;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  const fmt = (v, d = 2) => (v >= 0 ? "" : "−") + Math.abs(v).toFixed(d);
  const fmtDeg = (rad, d = 1) => fmt(rad * DEG, d) + "°";
  const yawDeg = (rad) => { let v = Math.round(wrapPi(rad) * DEG); if (v === -180) v = 180; return (v === 0 ? 0 : v) + "°"; };
  const C = () => S.data[S.key];

  // Canvas whose height follows its width; redraws on resize at device pixel ratio.
  function panel(parent, aspect, draw, minH = 160, maxH = 560) {
    const cv = el("canvas");
    parent.appendChild(cv);
    const ctx = cv.getContext("2d");
    const p = { cv, ctx, w: 0, h: 0, draw };
    p.redraw = () => {
      const w = cv.clientWidth || parent.clientWidth;
      if (!w) return;
      const h = Math.round(clamp(w * aspect, minH, maxH));
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.height = h + "px";
      }
      p.w = w; p.h = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
    };
    new ResizeObserver(() => p.redraw()).observe(cv);
    return p;
  }

  // Equal-aspect world→pixel transform (y up).
  function fit(x0, y0, w, h, X0, X1, Y0, Y1, pad = 6) {
    const s = Math.min((w - 2 * pad) / (X1 - X0), (h - 2 * pad) / (Y1 - Y0));
    const ox = x0 + (w - s * (X1 - X0)) / 2, oy = y0 + (h - s * (Y1 - Y0)) / 2;
    return {
      s, X: (x) => ox + (x - X0) * s, Y: (y) => oy + (Y1 - y) * s,
      inv: (px, py) => [(px - ox) / s + X0, Y1 - (py - oy) / s],
      box: [ox, oy, s * (X1 - X0), s * (Y1 - Y0)],
    };
  }
  // Independent linear axes.
  function lin(d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    f.inv = (r) => d0 + ((r - r0) / (r1 - r0)) * (d1 - d0);
    return f;
  }

  function seg(parent, labels, active, onPick) {
    const box = el("div", { class: "seg" });
    labels.forEach((lab, i) => {
      const b = el("button", { type: "button" }, lab);
      if (i === active) b.classList.add("on");
      b.addEventListener("click", () => {
        [...box.children].forEach((c) => c.classList.remove("on"));
        b.classList.add("on");
        onPick(i);
      });
      box.appendChild(b);
    });
    parent.appendChild(box);
    box.set = (i) => [...box.children].forEach((c, j) => c.classList.toggle("on", i === j));
    box.relabel = (labs) => labs.forEach((l, j) => (box.children[j].innerHTML = l));
    return box;
  }
  function slider(parent, label, min, max, step, value, onInput, cls = "") {
    const lab = el("label", cls ? { class: cls } : {});
    const txt = el("span", {}, label);
    const inp = el("input", { type: "range", min, max, step, value });
    lab.append(txt, inp);
    parent.appendChild(lab);
    inp.addEventListener("input", () => onInput(+inp.value));
    return inp;
  }
  function row(parent) { const r = el("div", { class: "row" }); parent.appendChild(r); return r; }
  function readout(parent) { const r = el("div", { class: "readout" }); parent.appendChild(r); return r; }
  function legend(parent, items) {
    const lg = el("div", { class: "legend" });
    for (const [color, text, shape] of items) {
      const sp = el("span");
      const i = el("i");
      i.style.background = color;
      if (shape === "line") { i.style.height = "2px"; i.style.width = "14px"; i.style.borderRadius = "0"; }
      if (shape === "ring") { i.style.background = "transparent"; i.style.border = `2px solid ${color}`; }
      sp.append(i, document.createTextNode(text));
      lg.appendChild(sp);
    }
    parent.appendChild(lg);
    return lg;
  }
  function psiLabels() {
    return C().stages.map((s) => `yaw ${fmt(s.yaw * DEG, 1)}°`);
  }

  function rotXY(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [c * x - s * y, s * x + c * y]; }
  function place(p, pose) {
    const [x, y] = rotXY(p[0], p[1], pose[3]);
    return [x + pose[0], y + pose[1], p[2] + pose[2]];
  }

  function heightColor(t) { // t in [0,1] → perceptual blue-teal-yellow ramp
    const stops = [[45, 30, 110], [40, 110, 170], [30, 160, 140], [130, 195, 80], [240, 205, 50]];
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function scoreColor(s) { // light → dark blue
    const t = clamp((s - 0.3) / 0.6, 0, 1);
    const a = [214, 228, 243], b = [12, 60, 130];
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * t)).join(",")})`;
  }

  function drawMap(ctx, T, bounds) {
    const m = S.map, g = m.grid, xy = m.xy, s = Math.max(1, g * T.s);
    const [bx0, bx1, by0, by1] = bounds || [-1e9, 1e9, -1e9, 1e9];
    ctx.fillStyle = COL.map;
    for (let i = 0; i < xy.length; i += 2) {
      const x = xy[i], y = xy[i + 1];
      if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
      ctx.fillRect(T.X(x) - s / 2, T.Y(y) - s / 2, s, s);
    }
  }
  function ring(ctx, x, y, r, color = COL.ink, lw = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }
  function dot(ctx, x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); }
  function robot(ctx, T, pose, color, size = 1.2) {
    const [x, y] = [pose[0], pose[1]], a = pose[3];
    const pts = [[size, 0], [-size * 0.6, size * 0.55], [-size * 0.6, -size * 0.55]].map(([u, v]) => {
      const [rx, ry] = rotXY(u, v, a); return [T.X(x + rx), T.Y(y + ry)];
    });
    ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  }
  function text(ctx, s, x, y, { color = COL.ink2, size = 12, align = "left", base = "alphabetic", weight = "" } = {}) {
    ctx.font = `${weight} ${size}px "IBM Plex Sans", "Noto Sans KR", system-ui, sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
  }
  function vline(ctx, x, y0, y1, color, dash = [], lw = 1) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
  }
  function hline(ctx, y, x0, x1, color, dash = [], lw = 1) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
  }
  function axisTicks(ctx, sx, lo, hi, step, y, unit = "") {
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const px = sx(v);
      vline(ctx, px, y, y + 4, COL.muted);
      text(ctx, `${+v.toFixed(2)}${unit}`, px, y + 15, { size: 11, align: "center", color: COL.muted });
    }
  }
  // Drag (or tap) on a canvas → callback with canvas-local px.
  function draggable(cv, onDrag) {
    let down = false;
    const go = (e) => { const r = cv.getBoundingClientRect(); onDrag(e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); go(e); });
    cv.addEventListener("pointermove", (e) => { if (down) go(e); });
    cv.addEventListener("pointerup", () => (down = false));
    cv.addEventListener("pointercancel", () => (down = false));
    cv.style.cursor = "ew-resize";
  }
  function player(btn, step, done) { // simple rAF loop; step(dt) returns false to stop
    let raf = 0, last = 0;
    const stop = () => { cancelAnimationFrame(raf); raf = 0; btn.textContent = "▶ 재생"; };
    const loop = (t) => {
      const dt = last ? (t - last) / 1000 : 0; last = t;
      if (step(dt) === false) { stop(); if (done) done(); return; }
      raf = requestAnimationFrame(loop);
    };
    btn.addEventListener("click", () => {
      if (raf) return stop();
      last = 0; btn.textContent = "❚❚ 일시정지"; raf = requestAnimationFrame(loop);
    });
    return { stop, running: () => !!raf };
  }

  // =================================================== 1 · input scan ===
  demos.push(function input(root) {
    let view = 0, reveal = 1;
    const r = row(root);
    seg(r, ["위에서 본 모습", "옆에서 본 모습"], 0, (i) => { view = i; P.redraw(); });
    const btn = el("button", { class: "pill", type: "button" }, "↻ 스윕 다시 보기");
    r.appendChild(btn);
    const P = panel(root, 0.62, draw);
    const out = readout(root);
    let order = null, ang = null;
    function prep() {
      const sc = C().scan;
      ang = sc.map((p) => Math.atan2(p[1], p[0]));
      order = sc.map((_, i) => i).sort((a, b) => ang[a] - ang[b]);
    }
    function draw(ctx, w, h) {
      const sc = C().scan;
      if (!order) prep();
      const ext = 14;
      const T = view === 0 ? fit(0, 0, w, h, -ext, ext, -ext * 0.62, ext * 0.62) : fit(0, 0, w, h, -ext, ext, -2.2, 4.2);
      // range rings / ground line
      if (view === 0) {
        for (const rr of [5, 10]) { ctx.beginPath(); ctx.arc(T.X(0), T.Y(0), rr * T.s, 0, 2 * Math.PI); ctx.strokeStyle = COL.faint; ctx.lineWidth = 1; ctx.stroke(); text(ctx, `${rr} m`, T.X(rr) + 3, T.Y(0) - 3, { size: 10.5, color: COL.muted }); }
      } else {
        hline(ctx, T.Y(0), 0, w, COL.faint);
        text(ctx, "센서 높이", 6, T.Y(0) - 4, { size: 10.5, color: COL.muted });
      }
      const n = Math.round(order.length * reveal);
      const r0 = Math.max(1.3, T.s * 0.09);
      for (let k = 0; k < n; k++) {
        const p = sc[order[k]];
        ctx.fillStyle = heightColor((p[2] + 1.5) / 4);
        const px = T.X(p[0]), py = view === 0 ? T.Y(p[1]) : T.Y(p[2]);
        ctx.fillRect(px - r0 / 2, py - r0 / 2, r0, r0);
      }
      if (view === 0 && reveal < 1) { // sweep line
        const a = ang[order[Math.max(0, n - 1)]] || -Math.PI;
        ctx.beginPath(); ctx.moveTo(T.X(0), T.Y(0)); ctx.lineTo(T.X(20 * Math.cos(a)), T.Y(20 * Math.sin(a)));
        ctx.strokeStyle = "rgba(42,120,214,.6)"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      dot(ctx, T.X(0), view === 0 ? T.Y(0) : T.Y(0), 5, COL.ink);
      // colour bar
      for (let i = 0; i < 100; i++) { ctx.fillStyle = heightColor(i / 99); ctx.fillRect(w - 128 + i, 10, 1.2, 8); }
      text(ctx, "−1.5 m", w - 128, 31, { size: 10.5, color: COL.muted });
      text(ctx, "+2.5 m", w - 28, 31, { size: 10.5, color: COL.muted, align: "right" });
      text(ctx, "높이", w - 136, 18, { size: 10.5, color: COL.muted, align: "right" });
      const c = C();
      out.innerHTML = `스캔 <b>${c.name}</b> · 원본 <b>${c.raw_points.toLocaleString()}</b>점 → 0.1 m 복셀 <b>${c.scan.length.toLocaleString()}</b>점 · 자세 모름`;
    }
    let anim = 0;
    function sweep() {
      cancelAnimationFrame(anim);
      const t0 = performance.now();
      const tick = (t) => { reveal = clamp((t - t0) / 2200, 0, 1); P.redraw(); if (reveal < 1) anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    }
    btn.addEventListener("click", sweep);
    new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { sweep(); ob.disconnect(); } }, { threshold: 0.4 }).observe(root);
    return { update() { order = null; P.redraw(); } };
  });

  // ==================================================== 2 · yaw vote ===
  demos.push(function yaw(root) {
    let alpha = 0, apply = false;
    const r = row(root);
    const sl = slider(r, "센서 방향", -180, 180, 1, 0, (v) => { alpha = v / DEG; lab.textContent = `${v}°`; P.redraw(); }, "grow");
    const lab = el("span", { class: "mono" }, "0°"); r.appendChild(lab);
    const r2 = row(root);
    const cb = el("label", {}, `<input type="checkbox"> 첫 번째 yaw 가설 적용 (벽을 좌표축에 맞춰 회전)`);
    r2.appendChild(cb);
    cb.querySelector("input").addEventListener("change", (e) => { apply = e.target.checked; P.redraw(); });
    const P = panel(root, 0.42, draw, 220);
    legend(root, [[COL.ink2, "벽 점 (거의 수직인 면)"], [COL.x, "주된 벽 방향", "line"], [COL.ink, "평균 방향 화살표", "line"]]);
    const out = readout(root);
    let walls = null;
    function draw(ctx, w, h) {
      const c = C();
      if (!walls) walls = c.scan.filter((p, i) => Math.abs(c.normals[i][2]) < 0.2);
      const th = c.wall_headings.map((t) => t + alpha);
      let sc = 0, ss = 0;
      for (const t of th) { sc += Math.cos(4 * t); ss += Math.sin(4 * t); }
      const phi = Math.atan2(ss, sc) / 4, strength = Math.hypot(sc, ss) / th.length;
      const psi = [0, 1, 2, 3].map((k) => wrapPi(-phi + (k * Math.PI) / 2));
      const third = w / 3;
      // (a) scan
      const rot = alpha + (apply ? psi[0] : 0);
      const T = fit(0, 18, third, h - 18, -12, 12, -12, 12, 4);
      ctx.strokeStyle = COL.faint; ctx.lineWidth = 1;
      for (let g = -12; g <= 12; g += 3) { hline(ctx, T.Y(g), T.X(-12), T.X(12), COL.faint); vline(ctx, T.X(g), T.Y(12), T.Y(-12), COL.faint); }
      ctx.fillStyle = COL.ink2;
      for (const p of walls) { const [x, y] = rotXY(p[0], p[1], rot); if (Math.abs(x) < 12 && Math.abs(y) < 12) ctx.fillRect(T.X(x) - 0.8, T.Y(y) - 0.8, 1.6, 1.6); }
      robot(ctx, T, [0, 0, 0, rot], COL.ink, 0.8);
      text(ctx, apply ? "첫 번째 가설만큼 회전: 벽이 격자와 나란함" : "스캔 (벽만), 위에서 본 모습", 4, 12, { size: 12, color: COL.ink });
      // polar histograms
      const polar = (cx, cy, R, angles, color, title, spokes, arrow) => {
        const nb = 90, hist = new Array(nb).fill(0);
        for (const a of angles) hist[Math.floor(((wrapPi(a) + Math.PI) / (2 * Math.PI)) * nb) % nb]++;
        const mx = Math.max(...hist);
        ctx.strokeStyle = COL.faint; ctx.lineWidth = 1;
        for (const rr of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * rr, 0, 2 * Math.PI); ctx.stroke(); }
        hline(ctx, cy, cx - R, cx + R, COL.faint); vline(ctx, cx, cy - R, cy + R, COL.faint);
        ctx.fillStyle = color;
        for (let i = 0; i < nb; i++) {
          if (!hist[i]) continue;
          const a0 = -Math.PI + (i / nb) * 2 * Math.PI, a1 = a0 + (2 * Math.PI) / nb, rr = R * Math.sqrt(hist[i] / mx);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, -a1, -a0); ctx.closePath(); ctx.fill();
        }
        for (const a of spokes) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * 1.06 * Math.cos(a), cy - R * 1.06 * Math.sin(a)); ctx.strokeStyle = COL.x; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
        if (arrow) {
          const [a, len] = arrow, ex = cx + R * len * Math.cos(a), ey = cy - R * len * Math.sin(a);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.4; ctx.stroke();
          const hd = 9; ctx.beginPath(); ctx.moveTo(ex, ey);
          ctx.lineTo(ex - hd * Math.cos(a - 0.4), ey + hd * Math.sin(a - 0.4)); ctx.lineTo(ex - hd * Math.cos(a + 0.4), ey + hd * Math.sin(a + 0.4));
          ctx.closePath(); ctx.fillStyle = COL.ink; ctx.fill();
        }
        text(ctx, title, cx - R, 12, { size: 12, color: COL.ink });
        text(ctx, "0°", cx + R + 3, cy + 4, { size: 10.5, color: COL.muted });
        text(ctx, "90°", cx, cy - R - 3, { size: 10.5, color: COL.muted, align: "center" });
      };
      const R = Math.min(third / 2 - 22, (h - 40) / 2);
      const dom = [0, 1, 2, 3].map((k) => phi + (k * Math.PI) / 2);
      polar(third * 1.5, 18 + (h - 18) / 2, R, th, COL.y, "벽 방향: 봉우리 4개", dom, null);
      polar(third * 2.5, 18 + (h - 18) / 2, R, th.map((t) => 4 * t), "#7b5cc4", "방향 ×4: 하나로 겹침", [], [4 * phi, strength]);
      out.innerHTML = `주된 벽 방향 <b>${fmtDeg(phi, 2)}</b> · 투표 강도 <b>${strength.toFixed(2)}</b> (벽 점 ${th.length.toLocaleString()}개)<br>` +
        `yaw 가설 ${psi.map((p) => `<b>${fmtDeg(p, 1)}</b>`).join(", ")}` +
        (alpha === 0 ? ` · 실제 실행 기록: ${C().stages.map((s) => fmtDeg(s.yaw, 1)).join(", ")}` : "");
    }
    return { update() { walls = null; P.redraw(); } };
  });

  // ========================================== 3 · axis classification ===
  demos.push(function classify(root) {
    let thr = 0.85;
    const show = { x: true, y: true, z: true, drop: true };
    const r = row(root);
    const sg = seg(r, psiLabels(), S.psi, (k) => setPsi(k));
    const r2 = row(root);
    const sl = slider(r2, "축 정렬 기준", 0.5, 0.99, 0.01, thr, (v) => { thr = v; tl.textContent = v.toFixed(2); P.redraw(); }, "grow");
    const tl = el("span", { class: "mono" }, thr.toFixed(2)); r2.appendChild(tl);
    const P = panel(root, 0.62, draw);
    const lg = el("div", { class: "legend" });
    const chips = {};
    for (const [k, color, label] of [["x", COL.x, "X 향"], ["y", COL.y, "Y 향"], ["z", COL.z, "Z 향"], ["drop", COL.drop, "버림"]]) {
      const sp = el("span", { class: "chip" }, `<i style="background:${color}"></i>${label}`);
      sp.addEventListener("click", () => { show[k] = !show[k]; sp.classList.toggle("off", !show[k]); P.redraw(); });
      chips[k] = sp; lg.appendChild(sp);
    }
    root.appendChild(lg);
    const out = readout(root);
    function draw(ctx, w, h) {
      const c = C(), a = c.stages[S.psi].yaw;
      const T = fit(0, 0, w, h, -13, 13, -13 * 0.62, 13 * 0.62);
      const cnt = { x: 0, y: 0, z: 0, drop: 0 };
      const groups = { drop: [], z: [], y: [], x: [] };
      c.scan.forEach((p, i) => {
        const n = c.normals[i];
        const [nx, ny] = rotXY(n[0], n[1], a);
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(n[2]), m = Math.max(ax, ay, az);
        const k = m < thr ? "drop" : m === ax ? "x" : m === ay ? "y" : "z";
        cnt[k]++;
        const [x, y] = rotXY(p[0], p[1], a);
        groups[k].push(x, y);
      });
      const sz = Math.max(1.6, T.s * 0.1);
      for (const k of ["drop", "z", "y", "x"]) {
        if (!show[k]) continue;
        ctx.fillStyle = k === "z" ? "rgba(21,143,99,.55)" : COL[k];
        const g = groups[k];
        for (let i = 0; i < g.length; i += 2) ctx.fillRect(T.X(g[i]) - sz / 2, T.Y(g[i + 1]) - sz / 2, sz, sz);
      }
      robot(ctx, T, [0, 0, 0, a], COL.ink, 0.55);
      text(ctx, "x →", w - 30, h - 8, { size: 11, color: COL.muted });
      text(ctx, psiLabels()[S.psi] + "만큼 회전한 뒤 위에서 본 모습", 4, 13, { size: 12, color: COL.ink });
      const tot = c.scan.length;
      out.innerHTML = `<span class="cx">X ${cnt.x.toLocaleString()}</span> · <span class="cy">Y ${cnt.y.toLocaleString()}</span> · <span class="cz">Z ${cnt.z.toLocaleString()}</span> · 버림 ${cnt.drop.toLocaleString()} (${((100 * cnt.drop) / tot).toFixed(0)}%) / 전체 ${tot.toLocaleString()}점`;
    }
    return { update() { sg.relabel(psiLabels()); sg.set(S.psi); P.redraw(); }, psi() { sg.set(S.psi); P.redraw(); } };
  });

  // ====================================== 4 · cross-section voting ===
  demos.push(function cross(root) {
    let axis = "y", t = null;
    const RANGE = { y: [-4, 38], z: [-3.5, 24] };
    const r = row(root);
    seg(r, ["y (폭 방향)", "z (높이)"], 0, (i) => { axis = i ? "z" : "y"; t = null; redraw(); });
    const sg = seg(r, psiLabels(), S.psi, (k) => setPsi(k));
    const r2 = row(root);
    const jump = el("span"); r2.append(el("span", {}, "남긴 후보:"), jump);
    const sub1 = el("div", { class: "sub-label" }, "평면 위치: 지도 평면(회색)과 현재 이동량만큼 옮긴 스캔 평면(색, 굵기 = 점 수)");
    root.appendChild(sub1);
    const P1 = panel(root, 0.16, drawStrip, 92, 130);
    const sub2 = el("div", { class: "sub-label" }, "모든 (스캔 평면, 지도 평면) 짝이 낸 이동량 투표 (점 수만큼 가중, 0.1 m 칸)");
    root.appendChild(sub2);
    const P2 = panel(root, 0.36, drawHist, 170, 300);
    legend(root, [[COL.ink, "남긴 후보 (순위)", ""], [COL.ink, "정답", "line"], ["#e0a526", "현재 이동량", "line"]]);
    const out = readout(root);
    const PAD = 14;
    const sx = (w) => lin(RANGE[axis][0], RANGE[axis][1], PAD, w - PAD);
    const st = () => C().stages[S.psi];
    const local = () => st()[axis + "_local"];
    const mapPlanes = () => (axis === "y" ? S.map.y_planes : S.map.z_planes);
    const truthVal = () => C().truth[axis === "y" ? 1 : 2];
    function votes() {
      const v = [];
      for (const [o, n] of local()) for (const m of mapPlanes()) v.push([m - o, n]);
      return v;
    }
    function supportAt(tt) { let s = 0; for (const [v, n] of votes()) if (Math.abs(v - tt) <= 0.15) s += n; return s; }
    function drawStrip(ctx, w, h) {
      if (t === null) t = st()[axis + "_options"][0];
      const X = sx(w);
      for (const m of mapPlanes()) if (m > RANGE[axis][0] && m < RANGE[axis][1]) vline(ctx, X(m), 8, h - 22, COL.map, [], 2);
      const mx = Math.max(...local().map((l) => l[1]));
      let matched = 0;
      for (const [o, n] of local()) {
        const pos = o + t, hit = mapPlanes().some((m) => Math.abs(m - pos) < 0.15);
        if (hit) matched++;
        const lw = 1.5 + 5 * Math.sqrt(n / mx);
        vline(ctx, X(pos), 14, h - 28, axis === "y" ? COL.y : COL.z, [], lw);
        if (hit) dot(ctx, X(pos), 10, 4, "#e0a526");
      }
      axisTicks(ctx, X, RANGE[axis][0], RANGE[axis][1], axis === "y" ? 5 : 5, h - 20, " m");
      P1.matched = matched;
    }
    function drawHist(ctx, w, h) {
      if (t === null) t = st()[axis + "_options"][0];
      const X = sx(w), lo = RANGE[axis][0], hi = RANGE[axis][1];
      const nb = Math.round((hi - lo) / 0.1), hist = new Array(nb).fill(0);
      for (const [v, n] of votes()) { const b = Math.floor((v - lo) / 0.1); if (b >= 0 && b < nb) hist[b] += n; }
      const mx = Math.max(...hist, 1), top = 26, base = h - 24, Y = lin(0, mx, base, top);
      ctx.fillStyle = axis === "y" ? COL.y : COL.z;
      const bw = Math.max(1, X(lo + 0.1) - X(lo));
      hist.forEach((v, b) => { if (v) ctx.fillRect(X(lo + b * 0.1), Y(v), bw, base - Y(v)); });
      hline(ctx, base, PAD, w - PAD, COL.rule);
      axisTicks(ctx, X, lo, hi, 5, base, " m");
      vline(ctx, X(truthVal()), top - 6, base, COL.ink, [3, 3], 1.4);
      st()[axis + "_options"].forEach((v, i) => {
        if (v < lo || v > hi) return;
        const px = X(v);
        ctx.beginPath(); ctx.moveTo(px - 5, 6); ctx.lineTo(px + 5, 6); ctx.lineTo(px, 14); ctx.closePath(); ctx.fillStyle = COL.ink; ctx.fill();
        text(ctx, String(i + 1), px, 25, { size: 11, align: "center", color: COL.ink, weight: "600" });
      });
      vline(ctx, X(t), top - 6, base, "#e0a526", [], 2);
    }
    function redraw() {
      P1.redraw(); P2.redraw();
      jump.innerHTML = "";
      st()[axis + "_options"].forEach((v, i) => {
        const b = el("button", { class: "pill", type: "button" }, `${i + 1}: ${fmt(v, 2)}`);
        b.addEventListener("click", () => { t = v; P1.redraw(); P2.redraw(); info(); });
        jump.appendChild(b);
      });
      info();
    }
    function info() {
      const opts = st()[axis + "_options"], tv = truthVal();
      const rank = opts.findIndex((v) => Math.abs(v - tv) < 0.3);
      out.innerHTML = `이동량 ${axis} = <b>${fmt(t, 2)} m</b> · 득표 (±0.15 m) <b>${supportAt(t)}</b> · 지도 평면과 겹친 스캔 평면 <b>${P1.matched} / ${local().length}</b><br>` +
        `스캔 평면 ${local().length}개 × 지도 평면 ${mapPlanes().length}개 = 투표 ${local().length * mapPlanes().length}개 · 정답 ${axis} = ${fmt(tv, 2)} m → ` +
        (rank >= 0 ? `후보 <b>${rank + 1}위</b> (차이 ${Math.abs(opts[rank] - tv).toFixed(2)} m, 7단계 ICP가 메움)` : "이 yaw 가설에서는 <b>남긴 후보에 없음</b>");
    }
    for (const P of [P1, P2]) draggable(P.cv, (px) => { t = clamp(sx(P.w).inv(px), RANGE[axis][0], RANGE[axis][1]); P1.redraw(); P2.redraw(); info(); });
    return { update() { sg.relabel(psiLabels()); sg.set(S.psi); t = null; redraw(); }, psi() { sg.set(S.psi); t = null; redraw(); }, init: redraw };
  });

  // ============================================ 5 · longitudinal NCC ===
  demos.push(function ncc(root) {
    let prior = true, x = null, curve = null;
    const r = row(root);
    const sg = seg(r, psiLabels(), S.psi, (k) => setPsi(k));
    seg(r, ["구획 사전 정보 켬", "끔 (선박 전체)"], 0, (i) => { prior = i === 0; x = null; redraw(); });
    const r2 = row(root);
    const btn = el("button", { class: "pill", type: "button" }, "▶ 재생"); r2.appendChild(btn);
    r2.appendChild(el("span", { class: "sub-label", style: "margin:0" }, "그래프를 드래그해 스캔 바코드를 밀어 보세요"));
    root.appendChild(el("div", { class: "sub-label" }, "선박 바코드 (지도 x 시그니처, 격벽 봉우리는 줄여서 표시)와 현재 x에 놓인 스캔 바코드(회색)"));
    const P1 = panel(root, 0.26, drawSig, 130, 220);
    root.appendChild(el("div", { class: "sub-label" }, "후보 센서 x에 따른 정규화 상호상관(NCC)"));
    const P2 = panel(root, 0.32, drawCurve, 160, 260);
    legend(root, [[COL.x, "x 후보 (봉우리)"], [COL.ink, "정답 x", "line"], ["rgba(42,120,214,.25)", "구획 c = 2"]]);
    const out = readout(root);
    const PAD = 14;
    const range = () => {
      const [lo, hi] = C().compartments[C().compartment];
      return prior ? [lo - 4, hi + 4] : [-8, 198];
    };
    function compute() {
      const st = C().stages[S.psi], m = S.map, G = m.sig_bins, L = st.sig_bins, n = L.length;
      const mean = L.reduce((a, b) => a + b, 0) / n, Lc = L.map((v) => v - mean);
      const nl = Math.sqrt(Lc.reduce((a, b) => a + b * b, 0));
      const pos = [], sc = [];
      for (let s = 0; s + n <= G.length; s++) {
        let num = 0, s1 = 0, s2 = 0;
        for (let i = 0; i < n; i++) { const g = G[s + i]; num += g * Lc[i]; s1 += g; s2 += g * g; }
        const gd = Math.sqrt(Math.max(s2 - (s1 * s1) / n, 0));
        pos.push(m.sig_origin + s * m.sig_res - st.sig_origin);
        sc.push(gd < 1e-9 ? 0 : num / Math.max(nl * gd, 1e-12));
      }
      // whole-ship top 5, 1 m apart (what the method uses without the prior)
      const idx = sc.map((_, i) => i).sort((a, b) => sc[b] - sc[a]), top = [];
      for (const i of idx) { if (top.length >= 5) break; if (top.every((j) => Math.abs(pos[j] - pos[i]) >= 1)) top.push(i); }
      curve = { pos, sc, top5: top.map((i) => [pos[i], sc[i]]) };
    }
    const peaks = () => (prior ? C().stages[S.psi].x_peaks : curve.top5);
    function scoreAt(xx) {
      const { pos, sc } = curve; const i = clamp(Math.round((xx - pos[0]) / S.map.sig_res), 0, pos.length - 1); return sc[i];
    }
    function drawSig(ctx, w, h) {
      const m = S.map, [lo, hi] = range(), X = lin(lo, hi, PAD, w - PAD), base = h - 22;
      const [c0, c1] = C().compartments[C().compartment];
      ctx.fillStyle = "rgba(42,120,214,.08)"; ctx.fillRect(X(c0), 0, X(c1) - X(c0), base);
      const G = m.sig_bins, gmax = Math.sqrt(Math.max(...G)), Y = lin(0, gmax, base, 8);
      ctx.fillStyle = COL.x;
      const bw = Math.max(1, X(lo + m.sig_res) - X(lo));
      G.forEach((v, i) => { const xx = m.sig_origin + i * m.sig_res; if (v && xx >= lo && xx <= hi) ctx.fillRect(X(xx), Y(Math.sqrt(v)), bw, base - Y(Math.sqrt(v))); });
      // scan barcode at current x
      const st = C().stages[S.psi], L = st.sig_bins, lmax = Math.sqrt(Math.max(...L, 1));
      const Yl = lin(0, lmax, base, base - (base - 8) * 0.75);
      ctx.fillStyle = "rgba(21,25,30,.38)";
      L.forEach((v, i) => { const xx = x + st.sig_origin + i * m.sig_res; if (v && xx >= lo && xx <= hi) ctx.fillRect(X(xx), Yl(Math.sqrt(v)), Math.max(1.5, bw), base - Yl(Math.sqrt(v))); });
      const a = X(x + st.sig_origin), b = X(x + st.sig_origin + L.length * m.sig_res);
      ctx.strokeStyle = "rgba(21,25,30,.5)"; ctx.lineWidth = 1; ctx.strokeRect(a, 4, b - a, base - 4);
      vline(ctx, X(x), 4, base, COL.ink, [], 1.5);
      hline(ctx, base, PAD, w - PAD, COL.rule);
      axisTicks(ctx, X, lo, hi, prior ? 3 : 20, base, "");
    }
    function drawCurve(ctx, w, h) {
      const [lo, hi] = range(), X = lin(lo, hi, PAD, w - PAD), base = h - 22, Y = lin(-0.2, 1, base, 10);
      const [c0, c1] = C().compartments[C().compartment];
      ctx.fillStyle = "rgba(42,120,214,.08)"; ctx.fillRect(X(c0), 0, X(c1) - X(c0), base);
      hline(ctx, Y(0), PAD, w - PAD, COL.rule);
      const { pos, sc } = curve;
      const path = (filter, color, lw) => {
        ctx.beginPath(); let started = false;
        for (let i = 0; i < pos.length; i++) {
          if (pos[i] < lo || pos[i] > hi || !filter(pos[i])) { started = false; continue; }
          const px = X(pos[i]), py = Y(Math.max(-0.2, sc[i]));
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
      };
      path(() => true, "#cfd4d9", 1);
      path((p) => p <= x, COL.accent, 1.6);
      vline(ctx, X(C().truth[0]), 6, base, COL.ink, [3, 3], 1.4);
      for (const [px, s] of peaks()) if (px >= lo && px <= hi) { dot(ctx, X(px), Y(s), 4.5, COL.x); ring(ctx, X(px), Y(s), 4.5, "#fff", 1); }
      vline(ctx, X(x), 6, base, COL.ink, [], 1.2);
      dot(ctx, X(x), Y(scoreAt(x)), 4, COL.ink);
      hline(ctx, base, PAD, w - PAD, COL.rule);
      axisTicks(ctx, X, lo, hi, prior ? 3 : 20, base, "");
      text(ctx, "1.0", 2, Y(1) + 4, { size: 10.5, color: COL.muted }); text(ctx, "0", 2, Y(0) + 4, { size: 10.5, color: COL.muted });
    }
    function info() {
      const pk = peaks(), tx = C().truth[0];
      const best = pk.reduce((a, b) => (b[1] > a[1] ? b : a), pk[0]);
      const near = pk.reduce((a, b) => (Math.abs(b[0] - tx) < Math.abs(a[0] - tx) ? b : a), pk[0]);
      const hit = Math.abs(near[0] - tx) < 0.5;
      out.innerHTML = `x = <b>${fmt(x, 2)} m</b> · NCC <b>${scoreAt(x).toFixed(3)}</b><br>` +
        (prior ? `c = ${C().compartment} 안의 봉우리 <b>${pk.length}</b>개 → 전부 x 후보` : `선박 전체 상위 <b>5</b>개 봉우리`) +
        ` · 최고 봉우리 ${fmt(best[0], 1)} m (${best[1].toFixed(2)}) · 정답 ${fmt(tx, 1)} m ` +
        (hit ? `→ ${fmt(near[0], 1)} m 봉우리 (${near[1].toFixed(2)})가 정답을 포함` : `→ <b>정답 근처에 후보 없음</b>`);
    }
    function redraw() {
      compute();
      if (x === null) { const [lo] = range(); x = prior ? C().compartments[C().compartment][0] : lo + 4; }
      P1.redraw(); P2.redraw(); info();
    }
    for (const P of [P1, P2]) draggable(P.cv, (px) => { const [lo, hi] = range(); x = clamp(lin(lo, hi, PAD, P.w - PAD).inv(px), lo, hi); P1.redraw(); P2.redraw(); info(); });
    player(btn, (dt) => {
      const [lo, hi] = range(); x += dt * (prior ? 5 : 30);
      if (x > hi) { x = hi; P1.redraw(); P2.redraw(); info(); return false; }
      P1.redraw(); P2.redraw(); info();
    }, null);
    btn.addEventListener("click", () => { const [lo, hi] = range(); if (x >= hi - 0.01) x = lo; }, true);
    return { update() { sg.relabel(psiLabels()); sg.set(S.psi); x = null; redraw(); }, psi() { sg.set(S.psi); x = null; redraw(); }, init: redraw };
  });

  // ================================================= 6 · screening ===
  demos.push(function screen(root) {
    let step = 0, hover = null;
    const r = row(root);
    const sg = seg(r, ["", "", ""], 0, (i) => { step = i; hover = null; P.redraw(); });
    const P = panel(root, 0.86, draw, 260, 620);
    legend(root, [[scoreColor(0.35), "낮은 점수"], [scoreColor(0.88), "높은 점수"], [COL.ink, "정답", "ring"], [COL.ink2, "마우스 위치 후보에 놓은 스캔"]]);
    root.appendChild(el("div", { class: "sub-label" }, "지도까지 거리에 따른 점 점수: 부드러운 커널(사용) vs 딱 잘리는 인라이어 판정"));
    const K = panel(root, 0.2, drawKernel, 90, 130);
    const out = readout(root);
    const list = () => [C().screened, C().rescored, C().modes][step];
    let T = null;
    function draw(ctx, w, h) {
      const c = C(), [vx0, vx1, vy0, vy1] = S.map.view;
      sg.relabel([`전체 ${c.screened.length.toLocaleString()}`, `상위 ${c.rescored.length}`, `서로 다른 ${c.modes.length}`]);
      T = fit(0, 0, w, h, vx0, vx1, vy0, vy1, 4);
      drawMap(ctx, T);
      if (hover) {
        ctx.fillStyle = COL.ink2;
        for (const p of c.scored_points) { if (p[2] < S.map.band[0] || p[2] > S.map.band[1]) continue; const q = place(p, hover); ctx.fillRect(T.X(q[0]) - 1, T.Y(q[1]) - 1, 2, 2); }
      }
      const L = [...list()].sort((a, b) => a[4] - b[4]);
      const rr = step === 2 ? 5.5 : step === 1 ? 4.5 : 3.2;
      for (const hp of L) { dot(ctx, T.X(hp[0]), T.Y(hp[1]), rr, scoreColor(hp[4])); }
      ring(ctx, T.X(c.truth[0]), T.Y(c.truth[1]), 10, COL.ink, 2);
      if (hover) { robot(ctx, T, hover, "#e0a526", 1.1); }
      text(ctx, `구획 c = ${c.compartment}, 위에서 본 모습 (후보의 z는 생략)`, 6, 14, { size: 12, color: COL.ink });
      const best = list().reduce((a, b) => (b[4] > a[4] ? b : a));
      out.innerHTML = (hover ? `선택한 후보 (${fmt(hover[0], 2)}, ${fmt(hover[1], 2)}, ${fmt(hover[2], 2)}) yaw ${yawDeg(hover[3])} · 점수 <b>${hover[4].toFixed(3)}</b><br>` : "후보 위에 마우스를 올리면 스캔이 그 자리에 놓입니다<br>") +
        `자세 ${list().length.toLocaleString()}개, 스캔 점 ${step === 0 ? c.config.screen_points : c.config.score_points}개로 점수 · 최고 ${best[4].toFixed(3)} (${fmt(best[0], 1)}, ${fmt(best[1], 1)}), yaw ${yawDeg(best[3])}`;
    }
    function drawKernel(ctx, w, h) {
      const X = lin(0, 0.45, 40, w - 12), Y = lin(0, 1, h - 20, 8), tau = 0.25;
      hline(ctx, Y(0), 40, w - 12, COL.rule);
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const d = (0.45 * i) / 100; const v = Math.max(0, 1 - (d * d) / (tau * tau)); i ? ctx.lineTo(X(d), Y(v)) : ctx.moveTo(X(d), Y(v)); }
      ctx.strokeStyle = COL.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(tau), Y(1)); ctx.lineTo(X(tau), Y(0)); ctx.lineTo(X(0.45), Y(0));
      ctx.strokeStyle = COL.muted; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      for (const d of [0, 0.1, 0.2, 0.25, 0.3, 0.4]) { vline(ctx, X(d), Y(0), Y(0) + 4, COL.muted); text(ctx, d + " m", X(d), h - 4, { size: 10.5, align: "center", color: COL.muted }); }
      text(ctx, "1", 26, Y(1) + 4, { size: 10.5, color: COL.muted }); text(ctx, "0", 26, Y(0) + 4, { size: 10.5, color: COL.muted });
      text(ctx, "부드러운 점수 (사용)", X(0.12), Y(0.55), { size: 11.5, color: COL.accent });
      text(ctx, "인라이어 판정", X(0.3), Y(0.9), { size: 11.5, color: COL.muted });
    }
    P.cv.addEventListener("pointermove", (e) => {
      if (!T) return;
      const rc = P.cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
      let best = null, bd = 14 * 14;
      for (const hp of list()) { const dx = T.X(hp[0]) - mx, dy = T.Y(hp[1]) - my, d = dx * dx + dy * dy; if (d < bd || (d === bd && best && hp[4] > best[4])) { bd = d; best = hp; } }
      if (best !== hover) { hover = best; P.redraw(); }
    });
    P.cv.addEventListener("pointerleave", () => { hover = null; P.redraw(); });
    return { update() { hover = null; P.redraw(); } };
  });

  // ======================================================= 7 · ICP ===
  demos.push(function icp(root) {
    let sel = 0, it = 0;
    const r = row(root);
    const prev = el("button", { class: "pill", type: "button" }, "◀"), next = el("button", { class: "pill", type: "button" }, "▶");
    const lab = el("span", { class: "mono" });
    r.append(el("span", {}, "후보"), prev, lab, next);
    const btn = el("button", { class: "pill", type: "button" }, "▶ 재생"); r.appendChild(btn);
    const r2 = row(root);
    const sl = slider(r2, "반복", 0, 10, 1, 0, (v) => { it = v; redraw(); }, "grow");
    const il = el("span", { class: "mono" }, "0 / 10"); r2.appendChild(il);
    const box = el("div", { class: "two", style: "gap:10px" }); root.appendChild(box);
    const left = el("div"), right = el("div"); box.append(left, right);
    left.appendChild(el("div", { class: "sub-label" }, "후보 25개: 시작 ○ → 현재 ●"));
    const P1 = panel(left, 0.95, drawAll, 220, 420);
    right.appendChild(el("div", { class: "sub-label" }, "선택한 후보: 지도(회색) 위의 스캔(파랑)"));
    const P2 = panel(right, 0.95, drawZoom, 220, 420);
    const out = readout(root);
    let T1 = null;
    const paths = () => C().refine_paths;
    function pickDefault() {
      const t = C().truth; let best = 0, bd = 1e9;
      paths().forEach((p, i) => { const e = p[p.length - 1], d = Math.hypot(e[0] - t[0], e[1] - t[1]); if (d < bd) { bd = d; best = i; } });
      sel = best;
    }
    function drawAll(ctx, w, h) {
      const [vx0, vx1, vy0, vy1] = S.map.view;
      T1 = fit(0, 0, w, h, vx0, vx1, vy0, vy1, 4);
      drawMap(ctx, T1);
      paths().forEach((p, i) => {
        if (i === sel) return;
        const s = p[0], c = p[Math.min(it, p.length - 1)];
        ring(ctx, T1.X(s[0]), T1.Y(s[1]), 3.5, "#8aa9cc", 1.2);
        ctx.beginPath(); p.slice(0, it + 1).forEach((q, j) => (j ? ctx.lineTo(T1.X(q[0]), T1.Y(q[1])) : ctx.moveTo(T1.X(q[0]), T1.Y(q[1]))));
        ctx.strokeStyle = "#8aa9cc"; ctx.lineWidth = 1; ctx.stroke();
        dot(ctx, T1.X(c[0]), T1.Y(c[1]), 3, "#5f87b8");
      });
      const p = paths()[sel], c = p[Math.min(it, p.length - 1)];
      ring(ctx, T1.X(p[0][0]), T1.Y(p[0][1]), 5, "#e0a526", 2);
      robot(ctx, T1, c, "#e0a526", 1.4);
      ring(ctx, T1.X(C().truth[0]), T1.Y(C().truth[1]), 10, COL.ink, 1.6);
    }
    function drawZoom(ctx, w, h) {
      const p = paths()[sel], c = p[Math.min(it, p.length - 1)], cx = p[p.length - 1][0], cy = p[p.length - 1][1], R = 7;
      const T = fit(0, 0, w, h, cx - R, cx + R, cy - R, cy + R, 2);
      drawMap(ctx, T, [cx - R - 1, cx + R + 1, cy - R - 1, cy + R + 1]);
      ctx.fillStyle = "rgba(42,120,214,.85)";
      const sz = Math.max(1.6, T.s * 0.08);
      for (const q of C().scored_points) {
        if (q[2] < S.map.band[0] || q[2] > S.map.band[1]) continue;
        const v = place(q, c);
        if (Math.abs(v[0] - cx) > R || Math.abs(v[1] - cy) > R) continue;
        ctx.fillRect(T.X(v[0]) - sz / 2, T.Y(v[1]) - sz / 2, sz, sz);
      }
      robot(ctx, T, c, "#e0a526", 0.6);
      const t = C().truth;
      if (Math.abs(t[0] - cx) < R && Math.abs(t[1] - cy) < R) ring(ctx, T.X(t[0]), T.Y(t[1]), 9, COL.ink, 1.4);
      text(ctx, `센서 높이 주변 벽만 표시 (z ${fmt(S.map.band[0], 2)} … +${S.map.band[1].toFixed(1)} m)`, 6, h - 8, { size: 11, color: COL.muted });
    }
    function redraw() {
      const p = paths()[sel], s = p[0], c = p[Math.min(it, p.length - 1)], e = p[p.length - 1], t = C().truth;
      lab.textContent = `${sel + 1} / ${paths().length}`; il.textContent = `${it} / ${p.length - 1}`; sl.value = it;
      P1.redraw(); P2.redraw();
      const err = Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]);
      out.innerHTML = `자세 (${fmt(c[0], 2)}, ${fmt(c[1], 2)}, ${fmt(c[2], 2)}) yaw ${fmtDeg(c[3], 2)} · 시작점 대비 이동: ` +
        `Δx ${fmt(c[0] - s[0], 2)}, Δy ${fmt(c[1] - s[1], 2)}, Δz ${fmt(c[2] - s[2], 2)} m, Δyaw ${fmtDeg(wrapPi(c[3] - s[3]), 2)}<br>` +
        `최종 자세와 정답의 거리 ${err.toFixed(2)} m` + (err < 0.5 ? " → <b>정답 위치</b>" : ` → 닮은꼴 위치 (Δx ${fmt(e[0] - t[0], 1)} m${Math.abs(wrapPi(e[3] - t[3])) > 1 ? ", yaw 뒤집힘" : ""})`);
    }
    prev.addEventListener("click", () => { sel = (sel + paths().length - 1) % paths().length; redraw(); });
    next.addEventListener("click", () => { sel = (sel + 1) % paths().length; redraw(); });
    P1.cv.addEventListener("click", (e) => {
      if (!T1) return;
      const rc = P1.cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
      let bd = 1e9;
      paths().forEach((p, i) => { const q = p[Math.min(it, p.length - 1)], d = Math.hypot(T1.X(q[0]) - mx, T1.Y(q[1]) - my); if (d < bd) { bd = d; sel = i; } });
      redraw();
    });
    let acc = 0;
    player(btn, (dt) => {
      acc += dt;
      if (acc > 0.35) { acc = 0; if (it >= 10) return false; it++; redraw(); }
    });
    btn.addEventListener("click", () => { if (it >= 10) { it = 0; redraw(); } }, true);
    return { update() { pickDefault(); it = 0; redraw(); }, init() { pickDefault(); redraw(); } };
  });

  // ================================================== 8 · paired z ===
  demos.push(function paired(root) {
    let rival = "tie", margin = 0.2;
    const r = row(root);
    const sg = seg(r, ["", ""], 0, (i) => { rival = ["tie", "rejected"][i]; redraw(); });
    const r2 = row(root);
    slider(r2, "점 색칠 기준 (점수 차이)", 0.05, 0.5, 0.01, margin, (v) => { margin = v; ml.textContent = v.toFixed(2); redraw(); }, "grow");
    const ml = el("span", { class: "mono" }, margin.toFixed(2)); r2.appendChild(ml);
    const box = el("div", { class: "two", style: "gap:10px" }); root.appendChild(box);
    const left = el("div"), right = el("div"); box.append(left, right);
    left.appendChild(el("div", { class: "sub-label" }, "정밀화한 후보 전체의 1등 대비 paired z (12에서 자름)"));
    const P1 = panel(left, 1.05, drawBars, 240, 460);
    right.appendChild(el("div", { class: "sub-label" }, "1등 자세에 놓은 스캔: 점마다 어느 자세를 지지하는가"));
    const P2 = panel(right, 1.05, drawVotes, 240, 460);
    legend(root, [[COL.accent, "유지 / 1등 지지"], [COL.pale, "z < 3이지만 최대 10개 제한으로 제외"], [COL.drop, "탈락 / 차이 없음"], [COL.x, "경쟁 가설 지지"]]);
    const out = readout(root);
    const R = () => C().rivals[rival];
    const best = () => C().hypotheses[0];
    function stats() {
      const a = C().best_terms, b = R().terms, n = a.length;
      let m = 0; const d = a.map((v, i) => v - b[i]); for (const v of d) m += v; m /= n;
      let v2 = 0; for (const v of d) v2 += (v - m) * (v - m); const sd = Math.sqrt(v2 / (n - 1));
      return { d, n, m, sd, z: sd > 0 ? m / (sd / Math.sqrt(n)) : 0 };
    }
    function drawBars(ctx, w, h) {
      const z = C().paired_z, kept = C().kept, n = z.length, X = lin(0, 12, 34, w - 24), Y = (i) => 8 + ((h - 30) * (i + 0.5)) / n, bh = Math.max(3, ((h - 30) / n) * 0.72);
      const rz = R().z;
      z.forEach((v, i) => {
        const col = kept[i] ? COL.accent : v < 3 && i > 0 ? COL.pale : COL.drop;
        ctx.fillStyle = col; ctx.fillRect(X(0), Y(i) - bh / 2, Math.max(i === 0 ? 0 : 1.5, X(Math.min(v, 12)) - X(0)), bh);
        text(ctx, `#${i + 1}`, 30, Y(i) + 4, { size: 10, align: "right", color: COL.muted });
        if (v > 12) text(ctx, v.toFixed(0), X(12) - 3, Y(i) + 4, { size: 10, align: "right", color: COL.ink });
        if (Math.abs(v - rz) < 0.002) { ctx.strokeStyle = COL.x; ctx.lineWidth = 2; ctx.strokeRect(X(0) - 2, Y(i) - bh / 2 - 2, Math.max(4, X(Math.min(v, 12)) - X(0)) + 4, bh + 4); }
      });
      vline(ctx, X(3), 4, h - 22, COL.x, [], 2);
      text(ctx, "z = 3", X(3) + 4, h - 26, { size: 11.5, color: COL.x });
      for (const t of [0, 3, 6, 9, 12]) text(ctx, String(t), X(t), h - 6, { size: 10.5, align: "center", color: COL.muted });
    }
    function drawVotes(ctx, w, h) {
      const b = best(), st = stats(), Rr = 11;
      const T = fit(0, 0, w, h, b[0] - Rr, b[0] + Rr, b[1] - Rr, b[1] + Rr, 2);
      drawMap(ctx, T, [b[0] - Rr - 1, b[0] + Rr + 1, b[1] - Rr - 1, b[1] + Rr + 1]);
      const sp = C().scored_points, order = sp.map((_, i) => i).sort((i, j) => Math.abs(st.d[i]) - Math.abs(st.d[j]));
      for (const i of order) {
        const p = sp[i]; if (p[2] < S.map.band[0] || p[2] > S.map.band[1]) continue;
        const q = place(p, b), d = st.d[i];
        const col = d > margin ? COL.accent : d < -margin ? COL.x : COL.drop, s = Math.abs(d) > margin ? 3.6 : 1.8;
        ctx.fillStyle = col; ctx.fillRect(T.X(q[0]) - s / 2, T.Y(q[1]) - s / 2, s, s);
      }
      robot(ctx, T, b, COL.ink, 0.8);
    }
    function redraw() {
      const c = C(), b = best();
      sg.relabel(["tie", "rejected"].map((k) => `경쟁 가설 Δx ${fmt(c.rivals[k].pose[0] - b[0], 1)} m`));
      P1.redraw(); P2.redraw();
      const st = stats(), forBest = st.d.filter((v) => v > margin).length, forRival = st.d.filter((v) => v < -margin).length;
      const keptN = c.kept.filter(Boolean).length;
      out.innerHTML = `Δx = <b>${fmt(R().pose[0] - b[0], 1)} m</b> 경쟁 가설: 1등 지지 ${forBest}점, 경쟁 가설 지지 ${forRival}점 (점수 차이 ${margin.toFixed(2)} 초과)<br>` +
        `비교한 점 ${st.n.toLocaleString()}개 · 점수 차이 평균 ${st.m.toFixed(4)} · 흩어짐 ${st.sd.toFixed(3)} → z = <b>${st.z.toFixed(2)}</b> ` +
        `(기록값 ${R().z.toFixed(2)}) → <b>${st.z >= c.z_threshold ? "탈락" : "유지"}</b><br>` +
        `후보 ${c.paired_z.length}개 중 ${keptN}개 유지 → ${keptN === 1 ? "<b>확정 (decisive)</b>" : "모호함, 전부 보고"}`;
    }
    return { update: redraw, init: redraw };
  });

  // ==================================================== 9 · output ===
  demos.push(function output(root) {
    const P = panel(root, 0.86, draw, 260, 600);
    root.appendChild(el("div", { class: "sub-label" }, "선박 전체 (x): 구획 사전 정보가 있을 때(파랑)와 없을 때(주황)의 가설"));
    const P2 = panel(root, 0.13, drawShip, 70, 100);
    legend(root, [[COL.accent, "가설 (면적 ∝ 가중치)"], [COL.ink, "정답", "ring"], [COL.x, "구획 사전 정보 없음"]]);
    const tbl = el("div", { class: "table-wrap" }); root.appendChild(tbl);
    function draw(ctx, w, h) {
      const c = C(), [vx0, vx1, vy0, vy1] = S.map.view;
      const T = fit(0, 0, w, h, vx0, vx1, vy0, vy1, 4);
      drawMap(ctx, T);
      const hs = c.hypotheses, maxW = Math.max(...hs.map((x) => x[5]));
      hs.forEach((hp, i) => {
        const rr = Math.max(5, T.s * (0.4 + 1.3 * Math.sqrt(hp[5] / maxW)));
        ctx.beginPath(); ctx.arc(T.X(hp[0]), T.Y(hp[1]), rr, 0, 2 * Math.PI); ctx.fillStyle = "rgba(42,120,214,.28)"; ctx.fill();
        ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5; ctx.stroke();
        robot(ctx, T, hp, COL.accent, 0.9);
        text(ctx, String(i + 1), T.X(hp[0]) + rr * 0.75, T.Y(hp[1]) - rr * 0.75, { size: 11.5, color: COL.ink, weight: "600" });
      });
      ring(ctx, T.X(c.truth[0]), T.Y(c.truth[1]), 12, COL.ink, 2);
      text(ctx, c.decisive ? "확정 (decisive): 가설 정확히 1개" : `가설 ${hs.length}개 유지 (확정 아님)`, 6, 15, { size: 12.5, color: COL.ink, weight: "600" });
    }
    function drawShip(ctx, w, h) {
      const c = C(), X = lin(-25, 215, 10, w - 10), mid = h / 2 - 4;
      c.compartments.forEach(([a, b], i) => {
        ctx.fillStyle = i === c.compartment ? "rgba(42,120,214,.12)" : "#f3f5f7";
        ctx.fillRect(X(a) + 1, mid - 14, X(b) - X(a) - 2, 28);
        text(ctx, `c=${i}`, (X(a) + X(b)) / 2, mid + 27, { size: 10.5, align: "center", color: COL.muted });
      });
      for (const hp of c.hypotheses) dot(ctx, X(hp[0]), mid - 5, 4, COL.accent);
      for (const hp of c.whole_ship) dot(ctx, X(hp[0]), mid + 6, 4, COL.x);
      ring(ctx, X(c.truth[0]), mid, 9, COL.ink, 1.6);
    }
    function table() {
      const c = C(), t = c.truth;
      let html = `<table class="hyp"><tr><th>#</th><th>x [m]</th><th>y [m]</th><th>yaw</th><th>1등 대비 z</th><th>가중치</th><th></th></tr>`;
      c.hypotheses.forEach((hp, i) => {
        const gt = Math.abs(hp[0] - t[0]) < 0.5 && Math.abs(hp[1] - t[1]) < 0.5 && Math.abs(wrapPi(hp[3] - t[3])) < 5 / DEG;
        const dx = hp[0] - t[0];
        const note = gt ? "← 정답" : Math.abs(wrapPi(hp[3] - t[3])) > 1 ? "대칭 위치 (yaw 180°)" : `Δx ${fmt(dx, 1)} m (늑판 ${Math.round(Math.abs(dx) / 3)}칸)`;
        html += `<tr class="${gt ? "gt" : ""}"><td>${i + 1}</td><td>${hp[0].toFixed(2)}</td><td>${hp[1].toFixed(2)}</td><td>${yawDeg(hp[3])}</td><td>${c.paired_z[i] !== undefined && c.kept[i] ? c.paired_z[i].toFixed(2) : "–"}</td><td>${(100 * hp[5]).toFixed(1)}%</td><td style="text-align:left">${note}</td></tr>`;
      });
      tbl.innerHTML = html + "</table>";
    }
    const upd = () => { P.redraw(); P2.redraw(); table(); };
    return { update: upd, init: upd };
  });


  // ======================================== 0 · Manhattan normal sphere ===
  demos.push(function sphere(root) {
    let az = -0.75, elv = 0.42, auto = true, visible = false;
    const P = panel(root, 0.86, draw, 240, 440);
    legend(root, [[COL.x, "X 향"], [COL.y, "Y 향"], [COL.z, "Z 향"], [COL.drop, "어느 축과도 안 맞음"]]);
    function proj(x, y, z) { // turntable view: yaw by az, then tilt by elv
      const xr = Math.cos(az) * x - Math.sin(az) * y, yr = Math.sin(az) * x + Math.cos(az) * y;
      return [xr, z * Math.cos(elv) - yr * Math.sin(elv), yr * Math.cos(elv) + z * Math.sin(elv)];
    }
    function draw(ctx, w, h) {
      const c = C(), R = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = "#f6f8fa"; ctx.fill();
      ctx.strokeStyle = COL.rule; ctx.lineWidth = 1; ctx.stroke();
      const axes = [[1, 0, 0, COL.x, "x"], [0, 1, 0, COL.y, "y"], [0, 0, 1, COL.z, "z"]];
      const front = [], back = [];
      c.normals.forEach((n) => {
        const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], m = Math.max(...a);
        const col = m < 0.85 ? COL.drop : m === a[0] ? COL.x : m === a[1] ? COL.y : COL.z;
        for (const sg of [1, -1]) { // normals are unoriented: plot both n and −n
          const q = proj(sg * n[0], sg * n[1], sg * n[2]);
          (q[2] >= 0 ? front : back).push([q[0], q[1], col]);
        }
      });
      const put = (list, alpha, r) => { ctx.globalAlpha = alpha; for (const [x, y, col] of list) { ctx.fillStyle = col; ctx.fillRect(cx + x * R - r / 2, cy - y * R - r / 2, r, r); } ctx.globalAlpha = 1; };
      put(back, 0.12, 2);
      for (const [x, y, z, col, lab] of axes) {
        for (const sg of [1, -1]) {
          const q = proj(sg * x, sg * y, sg * z);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + q[0] * R * 1.12, cy - q[1] * R * 1.12);
          ctx.strokeStyle = col; ctx.globalAlpha = q[2] >= 0 ? 0.9 : 0.3; ctx.lineWidth = 1.3; ctx.setLineDash(sg > 0 ? [] : [3, 3]); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          if (sg > 0) text(ctx, lab, cx + q[0] * R * 1.2, cy - q[1] * R * 1.2 + 4, { size: 13, color: col, align: "center", weight: "600" });
        }
      }
      put(front, 0.35, 2.4);
      text(ctx, "드래그해서 돌려 보기", 8, h - 8, { size: 11, color: COL.muted });
    }
    let down = false, lx = 0, ly = 0;
    P.cv.style.cursor = "grab";
    P.cv.addEventListener("pointerdown", (e) => { down = true; auto = false; lx = e.clientX; ly = e.clientY; P.cv.setPointerCapture(e.pointerId); });
    P.cv.addEventListener("pointermove", (e) => {
      if (!down) return;
      az += (e.clientX - lx) * 0.01; elv = clamp(elv + (e.clientY - ly) * 0.01, -1.4, 1.4);
      lx = e.clientX; ly = e.clientY; P.redraw();
    });
    P.cv.addEventListener("pointerup", () => (down = false));
    new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(root);
    let last = 0;
    const spin = (t) => {
      if (auto && visible && last) { az += ((t - last) / 1000) * 0.25; P.redraw(); }
      last = t; requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
    return { update() { P.redraw(); } };
  });

  // ------------------------------------------------------------- wiring ---
  const instances = [];
  function setPsi(k) { S.psi = k; for (const d of instances) if (d.psi) d.psi(); }
  function setCase(key) {
    S.key = key;
    S.psi = C().true_stage;
    document.querySelectorAll("#case-switch button").forEach((b) => b.classList.toggle("on", b.dataset.case === key));
    for (const d of instances) d.update();
  }

  function stepHighlight() {
    const links = [...document.querySelectorAll("#steps a")];
    const ob = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll(".stage").forEach((s) => ob.observe(s));
  }

  async function main() {
    const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p + ": " + r.status); return r.json(); });
    try {
      const [a, b, m] = await Promise.all([get("static/data/case_a.json"), get("static/data/case_b.json"), get("static/data/map.json")]);
      S.data = { a, b }; S.map = m;
    } catch (err) {
      $("#loading").textContent = "데모 데이터를 불러오지 못했습니다 (" + err.message + "). HTTP로 페이지를 열어 주세요 (예: python3 -m http.server).";
      return;
    }
    // Canvas text does not trigger web-font loading, so load the Korean face before drawing.
    try { await Promise.all([document.fonts.load('12px "Noto Sans KR"'), document.fonts.load('600 12px "Noto Sans KR"')]); } catch (e) { /* fall back to system fonts */ }
    $("#loading").remove();
    S.psi = C().true_stage;
    const ids = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d0"];
    demos.forEach((make, i) => {
      const inst = make($("#" + ids[i]));
      instances.push(inst);
      if (inst.init) inst.init();
    });
    document.querySelectorAll("#case-switch button").forEach((b) => b.addEventListener("click", () => setCase(b.dataset.case)));
    stepHighlight();
    document.fonts.ready.then(() => instances.forEach((d) => d.update()));
  }
  main();
})();
