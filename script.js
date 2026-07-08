(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  const stemEl = $("stem");
  const leavesEl = $("leaves");
  const cactusEl = $("cactus");
  const flowerEl = $("flower");
  const dropsEl = $("drops");
  const soilEl = $("soil");
  const plantWrapEl = $("plant-wrap");
  const stageAreaEl = $("stage-area");
  const cmEl = $("cm");
  const stageEl = $("stage");
  const hintEl = $("hint");
  const btn = $("water-btn");
  const ringEl = $("btn-ring");
  const progressEl = $("progress");
  const faceEl = $("face");
  const eyesOpenEl = $("eyes-open");
  const eyesHappyEl = $("eyes-happy");
  const mouthEl = $("mouth");
  const welcomeEl = $("welcome");
  const finishEl = $("finish");

  // Wurzelpunkt der Pflanze im viewBox-Koordinatensystem
  const CX = 180;
  const BASE_Y = 332;

  const MIN_GROWTH = 5;
  const MAX_GROWTH = 100;
  const GROWTH_PER_DROP = 4;
  const DECAY_PER_SEC = 2.2;    // Schrumpfen pro Sekunde ohne Gießen
  const GRACE_MS = 1400;        // Schonfrist nach dem letzten Tropfen

  const HEART_PATH =
    "M0 4.6 C -5.8 -0.8 -11.5 -3.8 -11.5 -8.6 C -11.5 -12.6 -8.4 -15 -5.4 -15 " +
    "C -2.9 -15 -0.7 -13.3 0 -10.8 C 0.7 -13.3 2.9 -15 5.4 -15 " +
    "C 8.4 -15 11.5 -12.6 11.5 -8.6 C 11.5 -3.8 5.8 -0.8 0 4.6 Z";

  // ---------- Blattformen ----------

  const LEAF_ROUND = {
    blade: "M0 0 C 8 -18, 30 -30, 52 -26 C 54 -10, 36 4, 12 4 C 5 4, 1 2, 0 0 Z",
    vein: "M3 -1 C 18 -12, 34 -20, 48 -23",
  };
  const LEAF_WIDE = {
    blade: "M0 0 C 10 -24, 38 -34, 58 -22 C 58 -4, 38 8, 12 6 C 4 4, 0 2, 0 0 Z",
    vein: "M3 -1 C 20 -14, 38 -22, 52 -21",
  };
  const LEAF_BLADE = {
    blade: "M0 0 C 7 -28, 11 -58, 4 -86 C -1 -58, -6 -28, 0 0 Z",
    vein: "M1 -8 C 4 -34, 6 -56, 3 -76",
  };

  function stdLeaves({ count, t0, dt, thr0, dthr, size0, spread, ang0, angSpread, shoots = true, shootSize = 0.34 }) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const f = count > 1 ? i / (count - 1) : 0;
      list.push({
        t: t0 + i * dt,
        side: i % 2 === 0 ? 1 : -1,
        threshold: thr0 + i * dthr,
        size: size0 + (1 - f) * spread,
        angle: ang0 + f * angSpread,
      });
    }
    if (shoots) {
      list.push({ t: 0.99, side: 1, threshold: 0, size: shootSize, angle: 58 });
      list.push({ t: 0.99, side: -1, threshold: 0, size: shootSize, angle: 58 });
    }
    return list;
  }

  // ---------- Blüten-Bauer (geben eine Update-Funktion zurück) ----------

  function el(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function makeDaisy(group, { petals, petalFill, centerFill, prx, pry, centerR, scale, spin }) {
    const inner = el("g");
    for (let i = 0; i < petals; i++) {
      const p = el("ellipse", { cy: -pry, rx: prx, ry: pry, fill: petalFill });
      p.setAttribute("transform", `rotate(${(i * 360) / petals})`);
      inner.append(p);
    }
    inner.append(el("circle", { r: centerR, fill: centerFill }));
    group.append(inner);
    return (tip, bloom, now) => {
      if (bloom <= 0.01) { group.setAttribute("display", "none"); return; }
      group.removeAttribute("display");
      group.setAttribute("transform", `translate(${tip.x.toFixed(1)} ${(tip.y - 2).toFixed(1)}) scale(${(bloom * scale).toFixed(3)})`);
      if (spin && !reducedMotion) {
        inner.setAttribute("transform", `rotate(${((now * 0.004) % 360).toFixed(1)})`);
      }
    };
  }

  function makeTulip(group) {
    const cup = el("path", {
      d: "M-13 2 C -15 -12, -9 -23, 0 -23 C 9 -23, 15 -12, 13 2 C 8 7, -8 7, -13 2 Z",
      fill: "#E0558C",
    });
    const mid = el("path", {
      d: "M-6 0 C -7 -12, -3 -21, 0 -22 C 3 -21, 7 -12, 6 0 C 3 4, -3 4, -6 0 Z",
      fill: "#F58FB4",
    });
    group.append(cup, mid);
    return (tip, bloom) => {
      if (bloom <= 0.01) { group.setAttribute("display", "none"); return; }
      group.removeAttribute("display");
      group.setAttribute("transform", `translate(${tip.x.toFixed(1)} ${(tip.y + 2).toFixed(1)}) scale(${(bloom * 1.15).toFixed(3)})`);
    };
  }

  function makeHeartBloom(group) {
    const left = el("path", { d: HEART_PATH, fill: "#F58FB4" });
    const right = el("path", { d: HEART_PATH, fill: "#F58FB4" });
    const big = el("path", { d: HEART_PATH, fill: "#E0558C" });
    group.append(left, right, big);
    return (tip, bloom, now) => {
      if (bloom <= 0.01) { group.setAttribute("display", "none"); return; }
      group.removeAttribute("display");
      group.setAttribute("transform", `translate(${tip.x.toFixed(1)} ${(tip.y - 2).toFixed(1)})`);
      const beat = reducedMotion ? 1 : 1 + 0.05 * Math.sin(now * 0.006);
      big.setAttribute("transform", `translate(0 -6) scale(${(bloom * 1.2 * beat).toFixed(3)})`);
      left.setAttribute("transform", `translate(-16 3) rotate(-20) scale(${(bloom * 0.6).toFixed(3)})`);
      right.setAttribute("transform", `translate(16 3) rotate(20) scale(${(bloom * 0.6).toFixed(3)})`);
    };
  }

  // ---------- Die fünf Pflanzen ----------

  const PLANTS = [
    {
      name: "Grüni",
      mode: "stem",
      stem: "#57A863",
      widthMul: 1,
      pot: ["#CE7550", "#9E4F34", "#DE8760", "#B25B3C"],
      leafColors: ["#3F8A4E", "#9AD46F"],
      leafShape: LEAF_ROUND,
      leaves: stdLeaves({ count: 12, t0: 0.16, dt: 0.064, thr0: 5, dthr: 7, size0: 0.72, spread: 0.42, ang0: 16, angSpread: 34 }),
      bloomAt: 86,
      bloomRange: 12,
      flower: (g) => makeDaisy(g, { petals: 6, petalFill: "#F4C978", centerFill: "#E8964B", prx: 5.5, pry: 11, centerR: 6, scale: 1, spin: true }),
    },
    {
      name: "Sunny",
      mode: "stem",
      stem: "#4F8F45",
      widthMul: 1.3,
      pot: ["#E9C46A", "#C79A3E", "#F2D488", "#D4A94F"],
      leafColors: ["#4E8A3F", "#A8D46F"],
      leafShape: LEAF_WIDE,
      leaves: stdLeaves({ count: 7, t0: 0.16, dt: 0.09, thr0: 6, dthr: 11, size0: 0.8, spread: 0.35, ang0: 14, angSpread: 30, shootSize: 0.28 }),
      bloomAt: 74,
      bloomRange: 16,
      flower: (g) => makeDaisy(g, { petals: 12, petalFill: "#FFC94D", centerFill: "#6B4226", prx: 5, pry: 14, centerR: 9, scale: 1.5, spin: false }),
    },
    {
      name: "Karlchen",
      mode: "cactus",
      pot: ["#8FC9A8", "#5FA07E", "#A5D8BA", "#74B190"],
      leafColors: ["#3E7D4E", "#7CC96B"],
      bloomAt: 78,
      bloomRange: 14,
      flower: (g) => makeDaisy(g, { petals: 5, petalFill: "#F27EA9", centerFill: "#FFD9E4", prx: 4.5, pry: 8.5, centerR: 4, scale: 1, spin: false }),
    },
    {
      name: "Tulpi",
      mode: "stem",
      stem: "#4E9B57",
      widthMul: 1,
      pot: ["#B79FD4", "#8A6DB0", "#C9B4E2", "#9B7FC2"],
      leafColors: ["#3E8A6B", "#7FCFA0"],
      leafShape: LEAF_BLADE,
      leaves: [
        { t: 0.04, side: 1, threshold: 5, size: 1.0, angle: 26 },
        { t: 0.06, side: -1, threshold: 10, size: 1.1, angle: 20 },
        { t: 0.09, side: 1, threshold: 15, size: 0.85, angle: 34 },
        { t: 0.11, side: -1, threshold: 20, size: 0.9, angle: 30 },
      ],
      bloomAt: 50,
      bloomRange: 35,
      flower: makeTulip,
    },
    {
      name: "Herzi",
      mode: "stem",
      stem: "#3E8A50",
      widthMul: 1,
      pot: ["#E8A0B4", "#C56F8B", "#F2B7C8", "#D4839D"],
      leafColors: ["#2F7D4A", "#8CD48F"],
      leafShape: LEAF_ROUND,
      leaves: stdLeaves({ count: 10, t0: 0.15, dt: 0.075, thr0: 5, dthr: 8.4, size0: 0.7, spread: 0.4, ang0: 16, angSpread: 36 }),
      bloomAt: 82,
      bloomRange: 14,
      flower: makeHeartBloom,
    },
  ];

  const STAGES = [
    [88, "In voller Blüte"],
    [62, "Prachtpflanze"],
    [35, "Jungpflanze"],
    [12, "Sprössling"],
    [0, "Keimling"],
  ];

  // ---------- Zustand ----------

  let state = "welcome"; // welcome | playing | celebrating | finished
  let plantIndex = 0;
  let completedCount = 0;
  let plant = PLANTS[0];
  let leaves = [];
  let cactus = null;
  let flowerUpdate = null;

  let target = MIN_GROWTH;
  let disp = MIN_GROWTH;
  let droop = 0;
  let lastWater = -Infinity;
  let lastTick = performance.now();
  let currentStage = "";
  let soilTimer = null;

  // ---------- Fortschritts-Herzen ----------

  const progressHearts = [];
  for (let i = 0; i < PLANTS.length; i++) {
    const svg = el("svg", { class: "p-heart", viewBox: "-14 -18 28 25" });
    svg.append(el("path", { d: HEART_PATH }));
    progressEl.append(svg);
    progressHearts.push(svg);
  }

  function updateProgress() {
    progressHearts.forEach((h, i) => {
      h.classList.toggle("done", i < completedCount);
      h.classList.toggle("current", i === plantIndex && i >= completedCount && state !== "finished");
    });
  }

  // ---------- Pflanze aufbauen ----------

  const SPINES = [
    [-0.55, 0.15], [0.45, 0.2], [-0.2, 0.32], [0.6, 0.42], [-0.65, 0.5],
    [0.15, 0.55], [-0.35, 0.68], [0.55, 0.72], [-0.1, 0.82], [0.3, 0.9],
    [-0.5, 0.88], [0.05, 0.12], [0.68, 0.6], [-0.68, 0.35],
  ];

  function buildCactus() {
    const body = el("path", { fill: "url(#cactusGrad)" });
    const armL = el("path", {
      d: "M0 0 H -18 V -22", fill: "none", stroke: "url(#cactusGrad)",
      "stroke-width": 15, "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    const armR = el("path", {
      d: "M0 0 H 18 V -22", fill: "none", stroke: "url(#cactusGrad)",
      "stroke-width": 15, "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    cactusEl.append(armL, armR, body);
    const spines = SPINES.map(() => {
      const g = el("g");
      g.append(
        el("line", { x1: -3, y1: -1.6, x2: 3, y2: 1.6, stroke: "#EAF7DC", "stroke-width": 1.3, "stroke-linecap": "round" }),
        el("line", { x1: -3, y1: 1.6, x2: 3, y2: -1.6, stroke: "#EAF7DC", "stroke-width": 1.3, "stroke-linecap": "round" })
      );
      cactusEl.append(g);
      return g;
    });
    cactus = { body, armL, armR, spines };
  }

  function applyPlant(i) {
    plantIndex = i;
    plant = PLANTS[i];

    const [p0, p1, r0, r1] = plant.pot;
    const potStops = document.querySelectorAll("#potGrad stop");
    const rimStops = document.querySelectorAll("#rimGrad stop");
    potStops[0].setAttribute("stop-color", p0);
    potStops[1].setAttribute("stop-color", p1);
    rimStops[0].setAttribute("stop-color", r0);
    rimStops[1].setAttribute("stop-color", r1);

    const leafStops = document.querySelectorAll("#leafGrad stop");
    leafStops[0].setAttribute("stop-color", plant.leafColors[0]);
    leafStops[1].setAttribute("stop-color", plant.leafColors[1]);

    leavesEl.innerHTML = "";
    cactusEl.innerHTML = "";
    leaves = [];
    cactus = null;

    if (plant.mode === "cactus") {
      stemEl.setAttribute("display", "none");
      buildCactus();
    } else {
      stemEl.removeAttribute("display");
      stemEl.setAttribute("stroke", plant.stem);
      for (const config of plant.leaves) {
        const g = el("g");
        const blade = el("path", { d: plant.leafShape.blade, fill: "url(#leafGrad)" });
        const vein = el("path", {
          d: plant.leafShape.vein, fill: "none", stroke: "rgba(255,255,255,0.22)",
          "stroke-width": 1.4, "stroke-linecap": "round",
        });
        g.append(blade, vein);
        leavesEl.append(g);
        leaves.push({ el: g, ...config });
      }
    }

    flowerEl.innerHTML = "";
    flowerUpdate = plant.flower(flowerEl);

    currentStage = "";
    updateProgress();
  }

  // ---------- Geometrie ----------

  function stemHeight(g) {
    return 22 + g * 2.7;
  }

  function stemPoint(t, g, sway) {
    const h = stemHeight(g);
    const p0 = { x: CX, y: BASE_Y };
    const p1 = { x: CX + sway * 0.35, y: BASE_Y - h * 0.55 };
    const p2 = { x: CX + sway, y: BASE_Y - h };
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  function cactusSize(g) {
    return { bw: 22 + g * 0.42, bh: 26 + g * 1.7 };
  }

  function plantTip() {
    if (plant.mode === "cactus") {
      const { bh } = cactusSize(disp);
      return { x: CX, y: BASE_Y - bh };
    }
    return stemPoint(1, disp, 0);
  }

  // ---------- Rendern ----------

  function renderStemPlant(now) {
    const sway = reducedMotion ? 3 : Math.sin(now * 0.0009) * (2 + disp * 0.05) + disp * 0.04;
    const p1 = stemPoint(0.5, disp, sway);
    const tip = stemPoint(1, disp, sway);

    stemEl.setAttribute(
      "d",
      `M ${CX} ${BASE_Y} Q ${p1.x * 2 - (CX + tip.x) / 2} ${p1.y * 2 - (BASE_Y + tip.y) / 2} ${tip.x} ${tip.y}`
    );
    stemEl.setAttribute("stroke-width", ((3 + disp * 0.05) * plant.widthMul).toFixed(2));

    for (const leaf of leaves) {
      const s = Math.min(1, Math.max(0, (disp - leaf.threshold) / 16)) * leaf.size;
      if (s <= 0.01) {
        leaf.el.setAttribute("display", "none");
        continue;
      }
      leaf.el.removeAttribute("display");
      const pt = stemPoint(leaf.t, disp, sway);
      const angle = -leaf.angle + droop * 42;
      leaf.el.setAttribute(
        "transform",
        `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) scale(${(s * leaf.side).toFixed(3)} ${s.toFixed(3)}) rotate(${angle.toFixed(1)})`
      );
    }
    return tip;
  }

  function renderCactus() {
    const { bw, bh } = cactusSize(disp);
    cactus.body.setAttribute(
      "d",
      `M ${CX - bw} ${BASE_Y + 8} L ${CX - bw} ${BASE_Y - bh + bw} A ${bw} ${bw} 0 0 1 ${CX + bw} ${BASE_Y - bh + bw} L ${CX + bw} ${BASE_Y + 8} Z`
    );

    const sL = Math.min(1, Math.max(0, (disp - 42) / 20));
    if (sL <= 0.01) cactus.armL.setAttribute("display", "none");
    else {
      cactus.armL.removeAttribute("display");
      cactus.armL.setAttribute("transform", `translate(${CX - bw + 4} ${BASE_Y - bh * 0.48}) scale(${sL.toFixed(3)})`);
    }
    const sR = Math.min(1, Math.max(0, (disp - 62) / 20));
    if (sR <= 0.01) cactus.armR.setAttribute("display", "none");
    else {
      cactus.armR.removeAttribute("display");
      cactus.armR.setAttribute("transform", `translate(${CX + bw - 4} ${BASE_Y - bh * 0.34}) scale(${sR.toFixed(3)})`);
    }

    cactus.spines.forEach((g, i) => {
      const [u, v] = SPINES[i];
      const o = Math.min(1, Math.max(0, (disp - (8 + v * 75)) / 12));
      if (o <= 0.01) { g.setAttribute("display", "none"); return; }
      g.removeAttribute("display");
      g.setAttribute("opacity", o.toFixed(2));
      g.setAttribute("transform", `translate(${(CX + u * bw * 0.8).toFixed(1)} ${(BASE_Y - 6 - v * (bh - 14)).toFixed(1)})`);
    });

    return { x: CX, y: BASE_Y - bh };
  }

  function render(now) {
    const tip = plant.mode === "cactus" ? renderCactus() : renderStemPlant(now);
    const bloom = Math.min(1, Math.max(0, (disp - plant.bloomAt) / plant.bloomRange));
    if (flowerUpdate) flowerUpdate(tip, bloom, now);
  }

  // ---------- Gesicht ----------

  const MOUTH_SMILE = "M175 386 Q180 390.5 185 386";
  const MOUTH_BIG = "M174 385 Q180 392 186 385";
  const MOUTH_SAD = "M175 389 Q180 384.5 185 389";

  function updateFace(now) {
    const happy = state === "celebrating" || state === "finished" || now - lastWater < 1100;
    const sad = state === "playing" && droop > 0.45;
    eyesOpenEl.setAttribute("display", happy ? "none" : "");
    eyesHappyEl.setAttribute("display", happy ? "" : "none");
    mouthEl.setAttribute("d", happy ? MOUTH_BIG : sad ? MOUTH_SAD : MOUTH_SMILE);
    faceEl.classList.toggle("happy", happy);
  }

  // ---------- HUD ----------

  function updateHud(wilting) {
    cmEl.textContent = Math.round(disp * 1.5);

    const stage = STAGES.find(([min]) => disp >= min)[1];
    const label = `${plant.name} · ${stage}`;
    if (label !== currentStage) {
      currentStage = label;
      stageEl.textContent = label;
      stageEl.classList.remove("pulse");
      void stageEl.offsetWidth;
      stageEl.classList.add("pulse");
    }

    ringEl.style.setProperty("--p", (((disp - MIN_GROWTH) / (MAX_GROWTH - MIN_GROWTH)) * 100).toFixed(1));

    if (state === "celebrating") {
      hintEl.textContent = "Geschafft! ♥︎";
      hintEl.classList.add("love");
      hintEl.classList.remove("thirsty");
    } else if (wilting) {
      hintEl.textContent = "Dein Pflänzchen dürstet …";
      hintEl.classList.add("thirsty");
      hintEl.classList.remove("love");
    } else {
      hintEl.textContent = "Tippe, um zu gießen";
      hintEl.classList.remove("thirsty", "love");
    }
  }

  // ---------- Spiel-Loop ----------

  function tick(now) {
    const dt = Math.min(100, now - lastTick);
    lastTick = now;

    const wilting = state === "playing" && now - lastWater > GRACE_MS && target > MIN_GROWTH;
    if (wilting) {
      target = Math.max(MIN_GROWTH, target - (DECAY_PER_SEC / 1000) * dt);
    }

    disp += (target - disp) * Math.min(1, dt * 0.008);
    droop += ((wilting ? 1 : 0) - droop) * Math.min(1, dt * 0.002);

    if (state === "playing" && disp >= 96) {
      celebrate();
    }

    render(now);
    updateFace(now);
    updateHud(wilting);
    requestAnimationFrame(tick);
  }

  // ---------- Gießen ----------

  function water() {
    if (state !== "playing") return;
    target = Math.min(MAX_GROWTH, target + GROWTH_PER_DROP);
    lastWater = performance.now();

    soilEl.classList.add("wet");
    clearTimeout(soilTimer);
    soilTimer = setTimeout(() => soilEl.classList.remove("wet"), 500);

    plantWrapEl.classList.remove("boing");
    void plantWrapEl.getBBox();
    plantWrapEl.classList.add("boing");
  }

  // Animiert ein Deko-Element und entfernt es danach garantiert —
  // onfinish allein ist in gedrosselten Hintergrund-Tabs unzuverlässig.
  function animateAndRemove(node, frames, opts) {
    dropsEl.append(node);
    const done = () => node.remove();
    const anim = node.animate(frames, opts);
    anim.onfinish = done;
    setTimeout(done, (opts.duration || 0) + 1500);
    return anim;
  }

  function splash(x, y) {
    for (let i = 0; i < 5; i++) {
      const c = el("circle", {
        r: (1.4 + Math.random() * 1.4).toFixed(1), cx: x, cy: y, fill: "url(#dropGrad)",
      });
      const dx = (Math.random() - 0.5) * 44;
      const dy = -(6 + Math.random() * 18);
      animateAndRemove(
        c,
        [
          { transform: "translate(0,0)", opacity: 0.9 },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
        ],
        { duration: 320 + Math.random() * 120, easing: "cubic-bezier(.2,.6,.6,1)" }
      );
    }
  }

  function spawnDrop() {
    const tip = plantTip();
    const x = tip.x + (Math.random() - 0.5) * 34;
    const endY = tip.y + 6 + Math.random() * 10;

    if (reducedMotion) {
      splash(x, endY);
      return;
    }

    const drop = el("path", {
      d: "M0 -7 C 0 -7, 4.6 -1.4, 4.6 1.6 A 4.6 4.6 0 1 1 -4.6 1.6 C -4.6 -1.4, 0 -7, 0 -7 Z",
      fill: "url(#dropGrad)",
    });

    const anim = animateAndRemove(
      drop,
      [
        { transform: `translate(${x}px, 14px) scale(0.7)`, opacity: 0 },
        { transform: `translate(${x}px, 26px) scale(1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${x}px, ${endY}px) scale(1)`, opacity: 1 },
      ],
      { duration: 400 + Math.random() * 90, easing: "cubic-bezier(.55,0,.9,.4)" }
    );
    anim.onfinish = () => {
      drop.remove();
      splash(x, endY);
    };
  }

  // ---------- Herzen ----------

  function spawnHearts(x, y, count) {
    const colors = ["#F27EA9", "#E0558C", "#FFB3C7"];
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const p = el("path", { d: HEART_PATH, fill: colors[i % colors.length] });
        const dx = (Math.random() - 0.5) * 160;
        const dy = -(60 + Math.random() * 130);
        const rot = (Math.random() - 0.5) * 70;
        const s = 0.6 + Math.random() * 0.9;
        const frames = reducedMotion
          ? [
              { transform: `translate(${x}px,${y}px) scale(${s})`, opacity: 0 },
              { transform: `translate(${x}px,${y}px) scale(${s})`, opacity: 1, offset: 0.3 },
              { transform: `translate(${x}px,${y}px) scale(${s})`, opacity: 0 },
            ]
          : [
              { transform: `translate(${x}px,${y}px) scale(0.2) rotate(0deg)`, opacity: 0 },
              { transform: `translate(${x + dx * 0.3}px,${y + dy * 0.35}px) scale(${s}) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.25 },
              { transform: `translate(${x + dx}px,${y + dy}px) scale(${s * 0.9}) rotate(${rot}deg)`, opacity: 0 },
            ];
        animateAndRemove(p, frames, {
          duration: 1000 + Math.random() * 500,
          easing: "cubic-bezier(.2,.5,.4,1)",
        });
      }, i * 55);
    }
  }

  // ---------- Spielfluss ----------

  function celebrate() {
    state = "celebrating";
    btn.disabled = true;
    completedCount++;
    updateProgress();

    if (navigator.vibrate) navigator.vibrate([12, 60, 12]);
    const tip = plantTip();
    spawnHearts(tip.x, tip.y - 10, 16);

    setTimeout(() => {
      if (plantIndex === PLANTS.length - 1) {
        state = "finished";
        updateProgress();
        finishEl.classList.remove("hidden");
      } else {
        swapToPlant(plantIndex + 1);
      }
    }, 2000);
  }

  function swapToPlant(i) {
    stageAreaEl.classList.add("swap-out");
    setTimeout(() => {
      applyPlant(i);
      target = MIN_GROWTH;
      disp = MIN_GROWTH;
      droop = 0;
      lastWater = performance.now();

      stageAreaEl.style.transition = "none";
      stageAreaEl.classList.remove("swap-out");
      stageAreaEl.classList.add("swap-in");
      void stageAreaEl.offsetWidth;
      stageAreaEl.style.transition = "";
      stageAreaEl.classList.remove("swap-in");

      state = "playing";
      btn.disabled = false;
    }, 480);
  }

  function startGame() {
    welcomeEl.classList.add("hidden");
    lastWater = performance.now();
    state = "playing";
  }

  function restartGame() {
    finishEl.classList.add("hidden");
    completedCount = 0;
    state = "playing";
    applyPlant(0);
    target = MIN_GROWTH;
    disp = MIN_GROWTH;
    droop = 0;
    lastWater = performance.now();
    btn.disabled = false;
  }

  // ---------- Events ----------

  btn.addEventListener("click", () => {
    if (state !== "playing") return;
    if (navigator.vibrate) navigator.vibrate(8);
    water();
    spawnDrop();
  });

  $("start-btn").addEventListener("click", startGame);
  $("restart-btn").addEventListener("click", restartGame);

  // ---------- Start ----------

  applyPlant(0);
  requestAnimationFrame(tick);
})();
