(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stemEl = document.getElementById("stem");
  const leavesEl = document.getElementById("leaves");
  const flowerEl = document.getElementById("flower");
  const dropsEl = document.getElementById("drops");
  const soilEl = document.getElementById("soil");
  const plantWrapEl = document.getElementById("plant-wrap");
  const plantEl = document.getElementById("plant");
  const cmEl = document.getElementById("cm");
  const stageEl = document.getElementById("stage");
  const hintEl = document.getElementById("hint");
  const recordEl = document.getElementById("record");
  const btn = document.getElementById("water-btn");

  // Wurzelpunkt der Pflanze im viewBox-Koordinatensystem
  const CX = 180;
  const BASE_Y = 332;

  const MIN_GROWTH = 5;
  const MAX_GROWTH = 100;
  const GROWTH_PER_DROP = 4;
  const DECAY_PER_SEC = 2.2;    // Schrumpfen pro Sekunde ohne Gießen
  const GRACE_MS = 1400;        // Schonfrist nach dem letzten Tropfen

  let target = MIN_GROWTH;      // Ziel-Wachstum (0–100)
  let disp = MIN_GROWTH;        // angezeigtes, geglättetes Wachstum
  let droop = 0;                // 0–1: Blätter hängen lassen bei Durst
  let lastWater = -Infinity;
  let lastTick = performance.now();
  let currentStage = "";
  let soilTimer = null;
  let record = Number(localStorage.getItem("pflanzen-rekord") || 0);

  const STAGES = [
    [88, "In voller Blüte"],
    [62, "Prachtpflanze"],
    [35, "Jungpflanze"],
    [12, "Sprössling"],
    [0, "Keimling"],
  ];

  // ---------- Blätter anlegen ----------

  const BLADE_PATH = "M0 0 C 8 -18, 30 -30, 52 -26 C 54 -10, 36 4, 12 4 C 5 4, 1 2, 0 0 Z";
  const VEIN_PATH = "M3 -1 C 18 -12, 34 -20, 48 -23";

  const leaves = [];

  function makeLeaf(config) {
    const g = document.createElementNS(SVG_NS, "g");
    const blade = document.createElementNS(SVG_NS, "path");
    blade.setAttribute("d", BLADE_PATH);
    blade.setAttribute("fill", "url(#leafGrad)");
    const vein = document.createElementNS(SVG_NS, "path");
    vein.setAttribute("d", VEIN_PATH);
    vein.setAttribute("fill", "none");
    vein.setAttribute("stroke", "rgba(255,255,255,0.22)");
    vein.setAttribute("stroke-width", "1.4");
    vein.setAttribute("stroke-linecap", "round");
    g.append(blade, vein);
    leavesEl.append(g);
    leaves.push({ el: g, ...config });
  }

  for (let i = 0; i < 12; i++) {
    makeLeaf({
      t: 0.16 + i * 0.064,                 // Position entlang des Stängels
      side: i % 2 === 0 ? 1 : -1,          // rechts / links, abwechselnd
      threshold: 5 + i * 7,                // ab welchem Wachstum das Blatt erscheint
      size: 0.72 + (1 - i / 11) * 0.42,    // untere Blätter sind größer
      angle: 16 + (i / 11) * 34,           // obere Blätter zeigen steiler nach oben
    });
  }

  // junger Trieb an der Spitze, damit der Stängel nie kahl endet
  makeLeaf({ t: 0.99, side: 1, threshold: 0, size: 0.34, angle: 58 });
  makeLeaf({ t: 0.99, side: -1, threshold: 0, size: 0.34, angle: 58 });

  // ---------- Blüte anlegen ----------

  const petals = [];
  for (let i = 0; i < 6; i++) {
    const p = document.createElementNS(SVG_NS, "ellipse");
    p.setAttribute("cx", "0");
    p.setAttribute("cy", "-11");
    p.setAttribute("rx", "5.5");
    p.setAttribute("ry", "11");
    p.setAttribute("fill", "#F4C978");
    p.setAttribute("transform", `rotate(${i * 60})`);
    petals.push(p);
  }
  const flowerCenter = document.createElementNS(SVG_NS, "circle");
  flowerCenter.setAttribute("r", "6");
  flowerCenter.setAttribute("fill", "#E8964B");
  const flowerInner = document.createElementNS(SVG_NS, "g");
  flowerInner.append(...petals, flowerCenter);
  flowerEl.append(flowerInner);

  // ---------- Geometrie ----------

  function stemHeight(g) {
    return 22 + g * 2.7;
  }

  // Punkt auf der quadratischen Stängelkurve bei t (0 = Wurzel, 1 = Spitze)
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

  // ---------- Rendern ----------

  function render(now) {
    const sway = reducedMotion ? 3 : Math.sin(now * 0.0009) * (2 + disp * 0.05) + disp * 0.04;
    const h = stemHeight(disp);
    const p1 = stemPoint(0.5, disp, sway);
    const tip = stemPoint(1, disp, sway);

    stemEl.setAttribute(
      "d",
      `M ${CX} ${BASE_Y} Q ${p1.x * 2 - (CX + tip.x) / 2} ${p1.y * 2 - (BASE_Y + tip.y) / 2} ${tip.x} ${tip.y}`
    );
    stemEl.setAttribute("stroke-width", (3 + disp * 0.05).toFixed(2));

    for (const leaf of leaves) {
      const s = Math.min(1, Math.max(0, (disp - leaf.threshold) / 16)) * leaf.size;
      if (s <= 0.01) {
        leaf.el.setAttribute("display", "none");
        continue;
      }
      leaf.el.removeAttribute("display");
      const pt = stemPoint(leaf.t, disp, sway);
      const angle = -(leaf.angle) + droop * 42; // positive Drehung = hängen lassen
      leaf.el.setAttribute(
        "transform",
        `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) scale(${(s * leaf.side).toFixed(3)} ${s.toFixed(3)}) rotate(${angle.toFixed(1)})`
      );
    }

    const bloom = Math.min(1, Math.max(0, (disp - 86) / 12));
    if (bloom <= 0.01) {
      flowerEl.setAttribute("display", "none");
    } else {
      flowerEl.removeAttribute("display");
      const spin = reducedMotion ? 0 : now * 0.004;
      flowerEl.setAttribute("transform", `translate(${tip.x.toFixed(1)} ${(tip.y - 2).toFixed(1)}) scale(${bloom.toFixed(3)})`);
      flowerInner.setAttribute("transform", `rotate(${(spin % 360).toFixed(1)})`);
    }
  }

  // ---------- HUD ----------

  function updateHud(wilting) {
    const cm = Math.round(disp * 1.5);
    cmEl.textContent = cm;

    if (cm > record) {
      record = cm;
      localStorage.setItem("pflanzen-rekord", String(record));
    }
    recordEl.textContent = `Rekord: ${record} cm`;

    const stage = STAGES.find(([min]) => disp >= min)[1];
    if (stage !== currentStage) {
      currentStage = stage;
      stageEl.textContent = stage;
      stageEl.classList.remove("pulse");
      void stageEl.offsetWidth;
      stageEl.classList.add("pulse");
    }

    if (disp >= 99) {
      hintEl.textContent = "Größer geht’s nicht!";
      hintEl.classList.remove("thirsty");
    } else if (wilting) {
      hintEl.textContent = "Dein Pflänzchen dürstet …";
      hintEl.classList.add("thirsty");
    } else {
      hintEl.textContent = "Tippe, um zu gießen";
      hintEl.classList.remove("thirsty");
    }
  }

  // ---------- Spiel-Loop ----------

  function tick(now) {
    const dt = Math.min(100, now - lastTick);
    lastTick = now;

    const wilting = now - lastWater > GRACE_MS && target > MIN_GROWTH;
    if (wilting) {
      target = Math.max(MIN_GROWTH, target - (DECAY_PER_SEC / 1000) * dt);
    }

    disp += (target - disp) * Math.min(1, dt * 0.008);
    droop += ((wilting ? 1 : 0) - droop) * Math.min(1, dt * 0.002);

    render(now);
    updateHud(wilting);
    requestAnimationFrame(tick);
  }

  // ---------- Gießen ----------

  function water() {
    target = Math.min(MAX_GROWTH, target + GROWTH_PER_DROP);
    lastWater = performance.now();

    soilEl.classList.add("wet");
    clearTimeout(soilTimer);
    soilTimer = setTimeout(() => soilEl.classList.remove("wet"), 500);

    plantWrapEl.classList.remove("boing");
    void plantWrapEl.getBBox();
    plantWrapEl.classList.add("boing");
  }

  function splash(x, y) {
    for (let i = 0; i < 5; i++) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("r", (1.4 + Math.random() * 1.4).toFixed(1));
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("fill", "url(#dropGrad)");
      dropsEl.append(c);
      const dx = (Math.random() - 0.5) * 44;
      const dy = -(6 + Math.random() * 18);
      c.animate(
        [
          { transform: "translate(0,0)", opacity: 0.9 },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
        ],
        { duration: 320 + Math.random() * 120, easing: "cubic-bezier(.2,.6,.6,1)" }
      ).onfinish = () => c.remove();
    }
  }

  function spawnDrop() {
    const tip = stemPoint(1, disp, 0);
    const x = tip.x + (Math.random() - 0.5) * 34;
    const endY = tip.y + 6 + Math.random() * 10;

    if (reducedMotion) {
      splash(x, endY);
      water();
      return;
    }

    const drop = document.createElementNS(SVG_NS, "path");
    drop.setAttribute(
      "d",
      "M0 -7 C 0 -7, 4.6 -1.4, 4.6 1.6 A 4.6 4.6 0 1 1 -4.6 1.6 C -4.6 -1.4, 0 -7, 0 -7 Z"
    );
    drop.setAttribute("fill", "url(#dropGrad)");
    dropsEl.append(drop);

    drop.animate(
      [
        { transform: `translate(${x}px, 14px) scale(0.7)`, opacity: 0 },
        { transform: `translate(${x}px, 26px) scale(1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${x}px, ${endY}px) scale(1)`, opacity: 1 },
      ],
      { duration: 400 + Math.random() * 90, easing: "cubic-bezier(.55,0,.9,.4)" }
    ).onfinish = () => {
      drop.remove();
      splash(x, endY);
      water();
    };
  }

  btn.addEventListener("click", () => {
    if (navigator.vibrate) navigator.vibrate(8);
    spawnDrop();
  });

  // ---------- Start ----------

  recordEl.textContent = `Rekord: ${record} cm`;
  requestAnimationFrame(tick);
})();
