(() => {
  const canvas = document.getElementById("floor");
  const ctx = canvas.getContext("2d");

  const LS_KEY = "arw-architect-v1";

  let state = emptyState(30, 40, 36);
  let tool = "select";
  let selected = null; // { kind: 'wall'|'entity', key|id }
  let hover = null;
  let cam = { x: 80, y: 80, zoom: 64 };
  let dragging = null;
  let panning = false;
  let panFrom = null;
  let paintMode = null; // 'add' | 'remove'
  let spacePan = false;
  let history = [];
  let future = [];
  let anim = { t: 0, walls: null };
  let show = { grid: true, snap: true };
  const pointers = new Map();
  let pinch = null;
  let suppressTap = false;
  let longPressTimer = null;

  function emptyState(w, h, budget) {
    const cols = cellsFromFeet(w);
    const rows = cellsFromFeet(h);
    return {
      seed: 0,
      name: "UNASSIGNED",
      cols, rows,
      widthFt: w,
      heightFt: h,
      wallBudget: budget,
      gridShiftX: 0.5,
      gridShiftY: 0.5,
      walls: {},
      entities: [],
      rooms: [{ id: 0, name: "Open floor", x: 0, y: 0, w: cols, h: rows, role: "Open" }],
      openings: [],
      entry: null,
      connections: [],
    };
  }

  function gridOffset() { return FloorView.gridOffset(state); }

  function isOpening(key) {
    return (state.openings || []).indexOf(key) !== -1;
  }

  function setOpening(key, on) {
    if (!inBoundsEdge(key, state.cols, state.rows)) return false;
    state.openings = state.openings || [];
    if (on) {
      if (state.walls[key]) delete state.walls[key];
      if (!isOpening(key)) state.openings.push(key);
      if (!state.entry || !state.entry.edges || !state.entry.edges.length) {
        const e = parseEdge(key);
        state.entry = { side: e.kind === "h" ? (e.y === 0 ? "N" : "S") : (e.x === 0 ? "W" : "E"), edges: [key] };
      }
      refreshRooms();
      return true;
    }
    state.openings = state.openings.filter((k) => k !== key);
    if (state.entry && state.entry.edges) {
      state.entry.edges = state.entry.edges.filter((k) => k !== key);
    }
    state.walls[key] = true;
    refreshRooms();
    return true;
  }

  function cloneState(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function pushHist() {
    history.push(cloneState(state));
    if (history.length > 80) history.shift();
    future = [];
    persist();
  }

  function undo() {
    if (!history.length) return;
    future.push(cloneState(state));
    state = history.pop();
    selected = null;
    persist();
    syncHud();
  }

  function redo() {
    if (!future.length) return;
    history.push(cloneState(state));
    state = future.pop();
    selected = null;
    persist();
    syncHud();
  }

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ state, tool, show, cam: { zoom: cam.zoom } }));
    } catch (_) { /* ignore quota */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.state && data.state.cols) state = data.state;
      if (data.tool) tool = data.tool;
      if (data.show) show = { grid: true, snap: true, ...data.show };
      if (state.gridShiftX == null) state.gridShiftX = 0.5;
      if (state.gridShiftY == null) state.gridShiftY = 0.5;
      if (data.cam && data.cam.zoom) cam.zoom = data.cam.zoom;
    } catch (_) { /* ignore */ }
  }

  function readConfig() {
    return {
      widthFt: +document.getElementById("spaceW").value,
      heightFt: +document.getElementById("spaceH").value,
      wallCount: +document.getElementById("wallCount").value,
      roomCount: +document.getElementById("roomCount").value,
      openingStyle: document.getElementById("openingStyle").value,
      entrySide: document.getElementById("entrySide").value,
      doorWidth: +document.getElementById("doorWidth").value,
      perimeter: document.getElementById("perimeter").checked,
      coverWalls: document.getElementById("coverWalls").checked,
      hostageScenario: document.getElementById("hostageScenario").checked,
      hangingCount: +document.getElementById("hangingCount").value,
      standCount: +document.getElementById("standCount").value,
      drumCount: +document.getElementById("drumCount").value,
      hostageCount: +document.getElementById("hostageCount").value,
      threatCount: +document.getElementById("threatCount").value,
      instructorCount: +document.getElementById("instructorCount").value,
      optTargets: document.getElementById("optTargets").checked,
      optInstructor: document.getElementById("optInstructor").checked,
    };
  }

  function writeConfigFromState() {
    document.getElementById("spaceW").value = state.widthFt;
    document.getElementById("spaceH").value = state.heightFt;
    document.getElementById("wallCount").value = state.wallBudget;
    document.getElementById("snapGrid").checked = show.snap;
    document.getElementById("showGrid").checked = show.grid;
    const gx = Math.round((state.gridShiftX == null ? 0.5 : state.gridShiftX) * 100);
    const gy = Math.round((state.gridShiftY == null ? 0.5 : state.gridShiftY) * 100);
    document.getElementById("gridShiftX").value = gx;
    document.getElementById("gridShiftY").value = gy;
    document.getElementById("gridShiftXVal").textContent = gx === 50 ? "C" : gx;
    document.getElementById("gridShiftYVal").textContent = gy === 50 ? "C" : gy;
  }

  function applySpace() {
    const cfg = readConfig();
    pushHist();
    const cols = cellsFromFeet(cfg.widthFt);
    const rows = cellsFromFeet(cfg.heightFt);
    state.widthFt = cfg.widthFt;
    state.heightFt = cfg.heightFt;
    state.wallBudget = cfg.wallCount;
    state.cols = cols;
    state.rows = rows;
    if (state.gridShiftX == null) state.gridShiftX = 0.5;
    if (state.gridShiftY == null) state.gridShiftY = 0.5;
    const nextWalls = {};
    for (const k of Object.keys(state.walls)) {
      if (inBoundsEdge(k, cols, rows)) nextWalls[k] = true;
    }
    state.walls = nextWalls;
    state.openings = (state.openings || []).filter((k) => inBoundsEdge(k, cols, rows) && !nextWalls[k]);
    state.entities = state.entities.filter((e) => e.x >= 0 && e.y >= 0 && e.x <= cols && e.y <= rows);
    fitCamera();
    syncHud();
    persist();
  }

  function generate(showBrief) {
    const cfg = readConfig();
    pushHist();
    const shiftX = state.gridShiftX == null ? 0.5 : state.gridShiftX;
    const shiftY = state.gridShiftY == null ? 0.5 : state.gridShiftY;
    const next = generateLayout(cfg);
    state = next;
    state.gridShiftX = shiftX;
    state.gridShiftY = shiftY;
    selected = null;
    tool = "select";
    anim = { t: performance.now(), walls: Object.keys(state.walls) };
    fitCamera();
    syncHud();
    persist();
    if (showBrief !== false) openBriefing();
  }

  function shuffle() {
    const cfg = readConfig();
    pushHist();
    state = shuffleProps(state, cfg);
    selected = null;
    tool = "select";
    syncHud();
    persist();
  }

  function openBriefing() {
    const used = wallCount(state.walls);
    const actualW = feetFromCells(state.cols).toFixed(1);
    const actualH = feetFromCells(state.rows).toFixed(1);
    document.getElementById("briefTitle").textContent = state.name;
    document.getElementById("briefBody").textContent =
      `Centurion Invictus · ${used} American Range Wall panels on a ${actualW}′ × ${actualH}′ grid ` +
      `(requested ${state.widthFt}′ × ${state.heightFt}′). ${state.rooms.length} rooms, ` +
      `${state.entities.filter((e) => e.type === "hanging" || e.type === "stand").length} targets, ` +
      `${state.entities.filter((e) => e.type === "drum").length} drums. ` +
      `Entry on the ${state.entry ? state.entry.side : "?"} side. ` +
      `Click entryways to slide them along a wall. Drag drums and targets freely — they stop against walls.`;
    document.getElementById("briefing").classList.remove("hidden");
    document.getElementById("missionName").value = state.name;
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 1200px)").matches;
  }
  function isCoarse() {
    return window.matchMedia("(pointer: coarse)").matches || isMobileLayout();
  }
  function edgeSlop() { return isCoarse() ? 0.38 : 0.22; }
  function openDrawer(side) {
    closeDrawers();
    document.body.classList.add("drawer-open", "drawer-" + side);
  }
  function closeDrawers() {
    document.body.classList.remove("drawer-open", "drawer-left", "drawer-right");
  }

  function fitCamera() {
    const rect = canvas.getBoundingClientRect();
    const pad = isMobileLayout() ? 36 : 80;
    const g = gridOffset();
    const zx = (rect.width - pad * 2) / Math.max(1, g.spaceC);
    const zy = (rect.height - pad * 2) / Math.max(1, g.spaceR);
    cam.zoom = clamp(Math.min(zx, zy), 18, 96);
    cam.x = (rect.width - g.spaceC * cam.zoom) / 2;
    cam.y = (rect.height - g.spaceR * cam.zoom) / 2;
  }

  function worldFromEvent(ev) {
    const r = canvas.getBoundingClientRect();
    const g = gridOffset();
    const sx = (ev.clientX - r.left);
    const sy = (ev.clientY - r.top);
    const spaceX = (sx - cam.x) / cam.zoom;
    const spaceY = (sy - cam.y) / cam.zoom;
    return { x: spaceX - g.ox, y: spaceY - g.oy, sx, sy, spaceX, spaceY };
  }

  function nearestEdge(wx, wy) {
    const cols = state.cols, rows = state.rows;
    const cx = clamp(wx, 0, cols);
    const cy = clamp(wy, 0, rows);
    const fx = cx - Math.floor(cx);
    const fy = cy - Math.floor(cy);
    const distH = Math.min(fy, 1 - fy);
    const distV = Math.min(fx, 1 - fx);
    if (distH <= distV) {
      const y = fy < 0.5 ? Math.floor(cy) : Math.ceil(cy);
      const x = clamp(Math.floor(cx), 0, cols - 1);
      const yClamped = clamp(y, 0, rows);
      return { key: edgeKey("h", x, yClamped), dist: distH };
    }
    const x = fx < 0.5 ? Math.floor(cx) : Math.ceil(cx);
    const y = clamp(Math.floor(cy), 0, rows - 1);
    const xClamped = clamp(x, 0, cols);
    return { key: edgeKey("v", xClamped, y), dist: distV };
  }

  function entityAt(wx, wy) {
    const extra = isCoarse() ? 0.38 : 0.22;
    let best = null, bestD = isCoarse() ? 0.85 : 0.5;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      const r = (ENTITY_META[e.type] || {}).r || 0.22;
      const dx = e.x - wx, dy = e.y - wy;
      const d = Math.hypot(dx, dy);
      if (d < r + extra && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  function refreshRooms() {
    state.rooms = detectRooms(state.walls, state.cols, state.rows, state.openings);
    const entryEdges = (state.entry && state.entry.edges) || [];
    state.rooms.forEach((r) => {
      const hostHere = state.entities.some((e) => e.type === "hostage" && roomContains(r, Math.floor(e.x), Math.floor(e.y)));
      const entryHere = entryEdges.some((k) =>
        cellsTouchingEdge(k, state.cols, state.rows).some((c) => roomContains(r, c.x, c.y))
      );
      if (hostHere) r.role = "Hostage room";
      else if (entryHere) r.role = "Entry / staging";
      else r.role = r.area <= 4 ? "Closet / problem" : "Interior";
    });
  }

  function usedWalls() { return wallCount(state.walls); }

  function setWall(key, on) {
    if (on) {
      if (state.walls[key]) return false;
      if (!inBoundsEdge(key, state.cols, state.rows)) return false;
      state.walls[key] = true;
      if (state.openings) state.openings = state.openings.filter((k) => k !== key);
      refreshRooms();
      return true;
    }
    if (!state.walls[key]) return false;
    delete state.walls[key];
    state.entities = state.entities.filter((e) => e.attached !== key);
    if (selected && selected.kind === "wall" && selected.key === key) selected = null;
    refreshRooms();
    return true;
  }

  /* ---------- rendering ---------- */

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function revealWalls() {
    if (!anim.walls) return new Set(Object.keys(state.walls));
    const dt = (performance.now() - anim.t) / 18;
    const n = Math.min(anim.walls.length, Math.floor(dt));
    if (n >= anim.walls.length) { const all = new Set(anim.walls); anim.walls = null; return all; }
    return new Set(anim.walls.slice(0, n));
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    FloorView.drawBackdrop(ctx, r.width, r.height);
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);
    FloorView.drawWorld(ctx, state, {
      zoom: cam.zoom,
      showGrid: show.grid,
      selected,
      hover,
      interactive: true,
      wallKeys: revealWalls(),
    });
    const g = gridOffset();
    ctx.translate(g.ox, g.oy);
    drawHover();
    drawRotateHandle();
    ctx.restore();
    FloorView.drawCompass(ctx, r.width - 48, 54);
    FloorView.drawScale(ctx, 16, r.height - 64, cam.zoom);
    requestAnimationFrame(draw);
  }

  function rotateHandlePos(e) {
    const rad = ((e.rot || 0) * Math.PI) / 180;
    const dist = ((ENTITY_META[e.type] || {}).r || 0.24) + 0.28;
    return { x: e.x + Math.sin(rad) * dist, y: e.y - Math.cos(rad) * dist };
  }

  function drawRotateHandle() {
    if (!selected || selected.kind !== "entity") return;
    const e = state.entities.find((x) => x.id === selected.id);
    if (!e || !canRotateType(e.type)) return;
    const h = rotateHandlePos(e);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(h.x, h.y);
    ctx.strokeStyle = "rgba(232,168,56,0.75)";
    ctx.lineWidth = 2 / cam.zoom;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.x, h.y, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = hover && hover.kind === "rotate" ? "#f6d36a" : "#e8a838";
    ctx.fill();
    ctx.strokeStyle = "#1a1206";
    ctx.lineWidth = 1.2 / cam.zoom;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.x, h.y, 0.055, -0.8, 2.2);
    ctx.strokeStyle = "#1a1206";
    ctx.stroke();
  }

  function rotateHandleAt(wx, wy) {
    if (!selected || selected.kind !== "entity") return null;
    const e = state.entities.find((x) => x.id === selected.id);
    if (!e || !canRotateType(e.type)) return null;
    const h = rotateHandlePos(e);
    if (Math.hypot(wx - h.x, wy - h.y) < (isCoarse() ? 0.34 : 0.18)) return e;
    return null;
  }

  function drawHover() {
    if (!hover) return;
    if (hover.kind === "edge" || hover.kind === "entry") {
      const p = edgeEndpoints(hover.key);
      ctx.strokeStyle = hover.kind === "entry" || tool === "entry"
        ? "rgba(61,186,124,0.95)"
        : (tool === "erase" || (tool === "wall" && state.walls[hover.key])
          ? "rgba(212,82,62,0.9)" : "rgba(232,168,56,0.9)");
      ctx.lineWidth = 0.12;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (hover.kind === "cell") {
      ctx.fillStyle = "rgba(232,168,56,0.18)";
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- HUD ---------- */

  function syncHud() {
    const used = usedWalls();
    document.getElementById("wallsUsed").textContent = used;
    document.getElementById("sizePill").textContent =
      `${state.widthFt}′ × ${state.heightFt}′ space  ·  ${state.cols}×${state.rows} panel grid`;
    const nameEl = document.getElementById("missionName");
    if (document.activeElement !== nameEl) nameEl.value = state.name || "UNASSIGNED";
    const actualW = feetFromCells(state.cols);
    const actualH = feetFromCells(state.rows);
    document.getElementById("gridHint").textContent =
      `Building is ${state.widthFt}′ × ${state.heightFt}′. Panel grid is ${state.cols} × ${state.rows} ` +
      `(${actualW.toFixed(2)}′ × ${actualH.toFixed(2)}′). Sliders slide the grid inside the space.`;

    const hanging = state.entities.filter((e) => e.type === "hanging").length;
    const stands = state.entities.filter((e) => e.type === "stand").length;
    const drums = state.entities.filter((e) => e.type === "drum").length;
    const host = state.entities.filter((e) => e.type === "hostage").length;
    const thr = state.entities.filter((e) => e.type === "threat").length;
    const inst = state.entities.filter((e) => e.type === "instructor").length;
    const stats = [
      ["Wall panels", used],
      ["Hanging targets", hanging],
      ["Target stands", stands],
      ["Drums", drums],
      ["Non-combatants", host],
      ["Enemy combatants", thr],
      ["Instructors", inst],
    ];
    document.getElementById("statsList").innerHTML = stats.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join("");
    renderInspector();
    highlightHotbar();
  }

  function paintInspector(el, idPrefix) {
    const pfx = idPrefix || "";
    if (!selected) {
      el.innerHTML = `<p class="muted">Drag walls, drums, and targets. Gold knob rotates people and stands. Hanging targets stick to a wall face.</p>`;
      return;
    }
    if (selected.kind === "wall") {
      const orient = parseEdge(selected.key).kind === "h" ? "East–West" : "North–South";
      el.innerHTML = `
        <div class="inspector-title"><span class="swatch" style="background:#c4a06a"></span>Range wall</div>
        <p class="muted">Drag to move this panel. Tool 3 punches an entryway.</p>
        <ul class="stats">
          <li><span>Orientation</span><span>${orient}</span></li>
        </ul>
        <button class="btn block" id="${pfx}inspDoor">Make entryway</button>
        <button class="btn danger block" id="${pfx}inspRemove">Remove wall</button>`;
      el.querySelector(`#${pfx}inspDoor`).onclick = () => { pushHist(); setOpening(selected.key, true); selected = { kind: "entry", key: selected.key }; syncHud(); };
      el.querySelector(`#${pfx}inspRemove`).onclick = () => { pushHist(); setWall(selected.key, false); selected = null; syncHud(); };
      return;
    }
    if (selected.kind === "entry") {
      const orient = parseEdge(selected.key).kind === "h" ? "East–West" : "North–South";
      const isMain = state.entry && (state.entry.edges || []).indexOf(selected.key) !== -1;
      el.innerHTML = `
        <div class="inspector-title"><span class="swatch" style="background:#3dba7c"></span>Entryway</div>
        <p class="muted">A 54¼″ hole in the wall. Drag to slide it along the wall line.</p>
        <ul class="stats">
          <li><span>Orientation</span><span>${orient}</span></li>
          <li><span>Main entry</span><span>${isMain ? "Yes" : "No"}</span></li>
        </ul>
        <button class="btn block" id="${pfx}inspMain">${isMain ? "Already main entry" : "Set as main entry"}</button>
        <button class="btn danger block" id="${pfx}inspRemove">Close with a wall</button>`;
      el.querySelector(`#${pfx}inspMain`).onclick = () => {
        const e = parseEdge(selected.key);
        state.entry = { side: e.kind === "h" ? (e.y === 0 ? "N" : e.y === state.rows ? "S" : "N") : (e.x === 0 ? "W" : "E"), edges: [selected.key] };
        persist(); syncHud();
      };
      el.querySelector(`#${pfx}inspRemove`).onclick = () => { pushHist(); setOpening(selected.key, false); selected = { kind: "wall", key: selected.key }; syncHud(); };
      return;
    }
    const e = state.entities.find((x) => x.id === selected.id);
    if (!e) { selected = null; el.innerHTML = `<p class="muted">Nothing selected.</p>`; return; }
    const meta = ENTITY_META[e.type];
    el.innerHTML = `
      <div class="inspector-title"><span class="swatch" style="background:${meta.color}"></span>${meta.label}</div>
      <p class="muted">${canRotateType(e.type) ? "Drag the gold knob to face any direction." : e.type === "hanging" ? "Snaps to the side of a wall you drop it on." : "Drag to move. Stops against walls."}</p>
      <label>Facing (deg)
        <input type="number" id="${pfx}inspRot" step="1" value="${Math.round(e.rot || 0)}" />
      </label>
      <label class="check"><input type="checkbox" id="${pfx}inspLock" ${e.locked ? "checked" : ""} /> Lock in place (shuffle-safe)</label>
      <button class="btn danger block" id="${pfx}inspRemove">Remove</button>`;
    el.querySelector(`#${pfx}inspRot`).onchange = (ev) => { pushHist(); e.rot = +ev.target.value; persist(); };
    el.querySelector(`#${pfx}inspLock`).onchange = (ev) => { e.locked = ev.target.checked; persist(); };
    el.querySelector(`#${pfx}inspRemove`).onclick = () => {
      pushHist();
      state.entities = state.entities.filter((x) => x.id !== e.id);
      selected = null; syncHud(); persist();
    };
  }

  function renderInspector() {
    const main = document.getElementById("inspector");
    const mob = document.getElementById("mobileInspector");
    if (main) paintInspector(main, "");
    if (mob) {
      mob.classList.toggle("hidden", !selected);
      paintInspector(mob, "m");
    }
  }

  function highlightHotbar() {
    document.querySelectorAll(".hotkey").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
  }

  function buildHotbar() {
    const bar = document.getElementById("hotbar");
    const icons = {
      select: `<svg viewBox="0 0 24 24" fill="none" stroke="#e7ece8" stroke-width="2"><path d="M4 4l8 16 2-7 7-2z"/></svg>`,
      wall: `<svg viewBox="0 0 24 24" fill="#c4a06a"><rect x="3" y="6" width="18" height="12" rx="1"/></svg>`,
      entry: `<svg viewBox="0 0 24 24" fill="none" stroke="#3dba7c" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18"/></svg>`,
      erase: `<svg viewBox="0 0 24 24" fill="none" stroke="#d4523e" stroke-width="2"><path d="M4 16l8-8 6 6-8 8H4z"/><path d="M13 9l4 4"/></svg>`,
      hanging: `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="3" fill="#9a7544"/><ellipse cx="12" cy="14" rx="4" ry="6" fill="#e8d44d"/></svg>`,
      stand: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="8" rx="4" ry="5.5" fill="#e8d44d"/><rect x="11" y="13" width="2" height="8" fill="#888"/></svg>`,
      drum: `<svg viewBox="0 0 24 24" fill="#2b6cb0"><ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v9c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/></svg>`,
      hostage: `<svg viewBox="0 0 24 24" fill="#4aa3df"><circle cx="12" cy="8" r="4"/><path d="M6 20c1-4 4-6 6-6s5 2 6 6"/><rect x="8" y="12" width="8" height="2" fill="#fff"/></svg>`,
      threat: `<svg viewBox="0 0 24 24" fill="#d4523e"><circle cx="12" cy="8" r="4"/><path d="M6 20c1-4 4-6 6-6s5 2 6 6"/><path d="M15 12l7-4" stroke="#1a1a1a" stroke-width="2"/></svg>`,
      instructor: `<svg viewBox="0 0 24 24" fill="#3dba7c"><circle cx="12" cy="8" r="4"/><path d="M6 20c1-4 4-6 6-6s5 2 6 6"/><path d="M9 11h6" stroke="#fff" stroke-width="2"/></svg>`,
    };
    bar.innerHTML = TOOLS.map((t) =>
      `<button class="hotkey ${t.id === tool ? "active" : ""}" data-tool="${t.id}" title="${t.name} (${t.key})">
        <span class="n">${t.key}</span>${icons[t.id] || ""}<span>${t.name}</span>
      </button>`
    ).join("");
    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".hotkey");
      if (!b) return;
      tool = b.dataset.tool;
      selected = null;
      syncHud();
    });
  }

  /* ---------- input ---------- */

  function wallHalf() {
    return (ARW.PANEL_T_IN / ARW.PANEL_W_IN) * 0.5;
  }

  function resolveAgainstWalls(x, y, r) {
    const need = r + wallHalf() + 0.01;
    for (let iter = 0; iter < 10; iter++) {
      let pushed = false;
      for (const key of Object.keys(state.walls)) {
        const p = edgeEndpoints(key);
        const d = distToSegment(x, y, p.x1, p.y1, p.x2, p.y2);
        if (d >= need || d < 1e-6) continue;
        const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((x - p.x1) * dx + (y - p.y1) * dy) / len2;
        t = clamp(t, 0, 1);
        const qx = p.x1 + t * dx, qy = p.y1 + t * dy;
        const nx = (x - qx) / d, ny = (y - qy) / d;
        x = qx + nx * need;
        y = qy + ny * need;
        pushed = true;
      }
      if (!pushed) break;
    }
    const g = gridOffset();
    x = clamp(x, 0.12 - g.ox, g.spaceC - g.ox - 0.12);
    y = clamp(y, 0.12 - g.oy, g.spaceR - g.oy - 0.12);
    return { x, y };
  }

  function snapEntityPos(wx, wy, type) {
    if (type === "hanging") {
      let key = nearestEdge(wx, wy).key;
      if (!state.walls[key]) {
        let best = null, bestD = 1e9;
        for (const k of Object.keys(state.walls)) {
          const p = edgeEndpoints(k);
          const d = distToSegment(wx, wy, p.x1, p.y1, p.x2, p.y2);
          if (d < bestD) { bestD = d; best = k; }
        }
        key = best;
      }
      if (key) return hangingSnap(key, wx, wy);
    }
    const step = show.snap ? 0.125 : 0.02;
    let x = Math.round(wx / step) * step;
    let y = Math.round(wy / step) * step;
    const r = (ENTITY_META[type] || {}).r || 0.22;
    return resolveAgainstWalls(x, y, r);
  }

  function moveWall(fromKey, toKey) {
    if (!fromKey || fromKey === toKey) return false;
    if (!inBoundsEdge(toKey, state.cols, state.rows)) return false;
    if (state.walls[toKey] || isOpening(toKey)) return false;
    delete state.walls[fromKey];
    state.walls[toKey] = true;
    for (const e of state.entities) {
      if (e.type === "hanging" && e.attached === fromKey) {
        const pose = hangingSnap(toKey, e.x, e.y);
        e.x = pose.x; e.y = pose.y;
        e.attached = pose.attached;
        e.side = pose.side;
        e.rot = pose.rot;
      }
    }
    refreshRooms();
    return true;
  }

  function placeProp(type, wx, wy) {
    pushHist();
    const p = snapEntityPos(wx, wy, type);
    const extra = {};
    if (p.attached) extra.attached = p.attached;
    if (p.side) extra.side = p.side;
    state.entities.push({ id: id(), type, x: p.x, y: p.y, rot: p.rot || 0, locked: false, ...extra });
    selected = { kind: "entity", id: state.entities[state.entities.length - 1].id };
    tool = "select";
    syncHud();
  }

  function pointerPt(ev) { return { x: ev.clientX, y: ev.clientY }; }
  function pointerDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pointerMid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function clearLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  function armLongPress(ev) {
    clearLongPress();
    if (!isCoarse() || pointers.size !== 1) return;
    const w0 = worldFromEvent(ev);
    if (tool !== "select" && tool !== "erase") {
      const ent0 = entityAt(w0.x, w0.y);
      const edge0 = nearestEdge(w0.x, w0.y);
      if (!ent0 && edge0.dist >= edgeSlop()) return;
    }
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (pinch || (dragging && dragging.kind !== "maybePan")) return;
      const ent = entityAt(w0.x, w0.y);
      const edge = nearestEdge(w0.x, w0.y);
      if (ent) {
        pushHist();
        state.entities = state.entities.filter((e) => e.id !== ent.id);
        selected = null;
      } else if (edge.dist < edgeSlop()) {
        pushHist();
        if (isOpening(edge.key)) setOpening(edge.key, false);
        else setWall(edge.key, false);
        selected = null;
      } else return;
      suppressTap = true;
      dragging = null;
      try { navigator.vibrate?.(15); } catch (_) { /* ignore */ }
      syncHud();
      persist();
    }, 520);
  }

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.focus();
    ev.preventDefault();
    pointers.set(ev.pointerId, pointerPt(ev));
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }

    if (pointers.size >= 2) {
      clearLongPress();
      const pts = [...pointers.values()];
      pinch = {
        dist0: Math.max(1, pointerDist(pts[0], pts[1])),
        mid0: pointerMid(pts[0], pts[1]),
        zoom0: cam.zoom,
        cx: cam.x,
        cy: cam.y,
      };
      dragging = null;
      panning = false;
      panFrom = null;
      paintMode = null;
      suppressTap = true;
      return;
    }

    const w = worldFromEvent(ev);
    if (ev.button === 1 || spacePan || ev.altKey) {
      panning = true;
      panFrom = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y };
      return;
    }
    if (ev.button !== 0 && ev.pointerType !== "touch") return;
    armLongPress(ev);

    const rotEnt = rotateHandleAt(w.x, w.y);
    if (rotEnt && tool !== "erase") {
      selected = { kind: "entity", id: rotEnt.id };
      dragging = { kind: "rotate", id: rotEnt.id };
      pushHist();
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }

    const ent = entityAt(w.x, w.y);
    if (ent && tool === "erase") {
      pushHist();
      state.entities = state.entities.filter((e) => e.id !== ent.id);
      selected = null;
      syncHud();
      persist();
      return;
    }
    if (ent) {
      selected = { kind: "entity", id: ent.id };
      dragging = { kind: "entity", id: ent.id, dx: w.x - ent.x, dy: w.y - ent.y };
      tool = "select";
      pushHist();
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = "grabbing";
      syncHud();
      return;
    }

    const edge = nearestEdge(w.x, w.y);
    const onEdge = edge.dist < edgeSlop();

    if (tool === "entry") {
      if (!onEdge) return;
      pushHist();
      if (state.walls[edge.key] || isOpening(edge.key)) {
        if (state.walls[edge.key]) setOpening(edge.key, true);
        selected = { kind: "entry", key: edge.key };
        dragging = { kind: "entry", key: edge.key };
        canvas.setPointerCapture(ev.pointerId);
      } else {
        setOpening(edge.key, true);
        selected = { kind: "entry", key: edge.key };
      }
      syncHud();
      return;
    }

    if (tool === "select") {
      if (onEdge && isOpening(edge.key) && !state.walls[edge.key]) {
        selected = { kind: "entry", key: edge.key };
        dragging = { kind: "entry", key: edge.key };
        pushHist();
        canvas.style.cursor = "grabbing";
      } else if (onEdge && state.walls[edge.key]) {
        selected = { kind: "wall", key: edge.key };
        dragging = { kind: "wall", key: edge.key };
        pushHist();
        canvas.style.cursor = "grabbing";
      } else {
        dragging = { kind: "maybePan", x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y };
      }
      syncHud();
      return;
    }

    if (tool === "wall" || tool === "erase") {
      if (edge.dist > (isCoarse() ? 0.42 : 0.28)) return;
      pushHist();
      if (tool === "erase") {
        paintMode = "remove";
        if (isOpening(edge.key)) {
          state.openings = state.openings.filter((k) => k !== edge.key);
          refreshRooms();
        } else setWall(edge.key, false);
        dragging = { kind: "paint" };
      } else if (state.walls[edge.key]) {
        selected = { kind: "wall", key: edge.key };
        dragging = { kind: "wall", key: edge.key };
        canvas.style.cursor = "grabbing";
      } else {
        paintMode = "add";
        setWall(edge.key, true);
        selected = { kind: "wall", key: edge.key };
        dragging = { kind: "paint" };
      }
      canvas.setPointerCapture(ev.pointerId);
      syncHud();
      return;
    }

    if (["hanging", "stand", "drum", "hostage", "threat", "instructor"].includes(tool)) {
      if (ent && tool === "select") return;
      placeProp(tool, w.x, w.y);
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, pointerPt(ev));
    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = Math.max(1, pointerDist(pts[0], pts[1]));
      const mid = pointerMid(pts[0], pts[1]);
      const r = canvas.getBoundingClientRect();
      const worldX = (pinch.mid0.x - r.left - pinch.cx) / pinch.zoom0;
      const worldY = (pinch.mid0.y - r.top - pinch.cy) / pinch.zoom0;
      cam.zoom = clamp(pinch.zoom0 * (dist / pinch.dist0), 18, 160);
      cam.x = (mid.x - r.left) - worldX * cam.zoom;
      cam.y = (mid.y - r.top) - worldY * cam.zoom;
      return;
    }
    if (dragging && dragging.kind === "maybePan") {
      const dx = ev.clientX - dragging.x;
      const dy = ev.clientY - dragging.y;
      if (Math.hypot(dx, dy) > 8) {
        clearLongPress();
        panning = true;
        panFrom = { x: dragging.x, y: dragging.y, cx: dragging.cx, cy: dragging.cy };
        dragging = { kind: "pan" };
        canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (panning && panFrom) {
      if (Math.hypot(ev.clientX - panFrom.x, ev.clientY - panFrom.y) > 8) clearLongPress();
      cam.x = panFrom.cx + (ev.clientX - panFrom.x);
      cam.y = panFrom.cy + (ev.clientY - panFrom.y);
      return;
    }
    const w = worldFromEvent(ev);
    if (dragging && Math.hypot(ev.movementX || 0, ev.movementY || 0) > 2) clearLongPress();
    if (dragging && dragging.kind === "rotate") {
      const e = state.entities.find((x) => x.id === dragging.id);
      if (e) {
        e.rot = Math.atan2(w.x - e.x, -(w.y - e.y)) * 180 / Math.PI;
      }
      hover = { kind: "rotate" };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (dragging && dragging.kind === "entity") {
      const e = state.entities.find((x) => x.id === dragging.id);
      if (e) {
        const p = snapEntityPos(w.x - dragging.dx, w.y - dragging.dy, e.type);
        e.x = p.x;
        e.y = p.y;
        if (p.attached) e.attached = p.attached;
        if (p.side) e.side = p.side;
        if (p.rot != null && e.type === "hanging") e.rot = p.rot;
      }
      hover = { kind: "entity", id: dragging.id };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (dragging && dragging.kind === "wall") {
      const edge = nearestEdge(w.x, w.y);
      if (edge.key !== dragging.key && moveWall(dragging.key, edge.key)) {
        dragging.key = edge.key;
        selected = { kind: "wall", key: edge.key };
      }
      hover = { kind: "edge", key: dragging.key };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (dragging && dragging.kind === "entry") {
      const edge = nearestEdge(w.x, w.y);
      const from = parseEdge(dragging.key);
      const to = parseEdge(edge.key);
      const sameLine = from.kind === to.kind && (from.kind === "h" ? from.y === to.y : from.x === to.x);
      if (sameLine && edge.key !== dragging.key && inBoundsEdge(edge.key, state.cols, state.rows)) {
        if (state.entry && state.entry.edges) {
          state.entry.edges = state.entry.edges.map((k) => (k === dragging.key ? edge.key : k));
        }
        state.openings = (state.openings || []).filter((k) => k !== dragging.key);
        state.walls[dragging.key] = true;
        delete state.walls[edge.key];
        if (!isOpening(edge.key)) state.openings.push(edge.key);
        dragging.key = edge.key;
        selected = { kind: "entry", key: edge.key };
        refreshRooms();
      }
      hover = { kind: "entry", key: dragging.key };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (dragging && dragging.kind === "paint") {
      const edge = nearestEdge(w.x, w.y);
      if (edge.dist < (isCoarse() ? 0.42 : 0.3)) setWall(edge.key, paintMode === "add");
      syncHud();
      hover = { kind: "edge", key: edge.key };
      return;
    }

    if (rotateHandleAt(w.x, w.y)) {
      hover = { kind: "rotate" };
      canvas.style.cursor = "grab";
      return;
    }
    const ent = entityAt(w.x, w.y);
    if (ent) {
      hover = { kind: "entity", id: ent.id };
      canvas.style.cursor = tool === "erase" ? "not-allowed" : "grab";
      return;
    }
    const edge = nearestEdge(w.x, w.y);
    if (edge.dist < edgeSlop() && isOpening(edge.key) && !state.walls[edge.key]) {
      hover = { kind: "entry", key: edge.key };
      canvas.style.cursor = "grab";
      return;
    }
    if (tool === "wall" || tool === "erase" || tool === "hanging" || tool === "entry") {
      hover = { kind: "edge", key: edge.key };
      canvas.style.cursor = "crosshair";
    } else if (tool === "select") {
      if (edge.dist < edgeSlop() && state.walls[edge.key]) {
        hover = { kind: "edge", key: edge.key };
        canvas.style.cursor = "grab";
      } else {
        hover = null;
        canvas.style.cursor = "default";
      }
    } else {
      hover = { kind: "cell", ...snapEntityPos(w.x, w.y, tool) };
      canvas.style.cursor = "copy";
    }
  });

  function endPointer(ev) {
    clearLongPress();
    if (ev) pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    if (dragging && dragging.kind === "maybePan" && !suppressTap) selected = null;
    dragging = null;
    panning = false;
    panFrom = null;
    paintMode = null;
    suppressTap = false;
    persist();
    syncHud();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType !== "touch") hover = null;
  });

  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const w = worldFromEvent(ev);
    const old = cam.zoom;
    cam.zoom = clamp(cam.zoom * (ev.deltaY > 0 ? 0.92 : 1.08), 22, 140);
    cam.x = w.sx - w.spaceX * cam.zoom;
    cam.y = w.sy - w.spaceY * cam.zoom;
    void old;
  }, { passive: false });

  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const w = worldFromEvent(ev);
    const ent = entityAt(w.x, w.y);
    pushHist();
    if (ent) {
      state.entities = state.entities.filter((e) => e.id !== ent.id);
      selected = null;
    } else {
      const edge = nearestEdge(w.x, w.y);
      if (edge.dist < 0.25) setWall(edge.key, false);
    }
    syncHud();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.target.matches("input, select, textarea")) return;
    if (ev.code === "Space") { spacePan = true; canvas.style.cursor = "grab"; ev.preventDefault(); }
    if (ev.key === "z" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); undo(); return; }
    if (ev.key === "y" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); redo(); return; }
    if (ev.key === "Escape") {
      if (!document.getElementById("sheetOverlay").classList.contains("hidden")) {
        closeSheet();
        return;
      }
      if (document.body.classList.contains("drawer-open")) { closeDrawers(); return; }
      selected = null; tool = "select"; syncHud(); return;
    }
    if ((ev.key === "p" || ev.key === "P") && !ev.ctrlKey && !ev.metaKey) {
      openSheet();
      return;
    }
    if (ev.key === "Delete" || ev.key === "Backspace") {
      if (!selected) return;
      pushHist();
      if (selected.kind === "wall") setWall(selected.key, false);
      else if (selected.kind === "entry") setOpening(selected.key, false);
      else state.entities = state.entities.filter((e) => e.id !== selected.id);
      selected = null; syncHud(); persist();
      return;
    }
    if (ev.key === "r" || ev.key === "R") {
      if (selected && selected.kind === "entity") {
        const e = state.entities.find((x) => x.id === selected.id);
        if (e && canRotateType(e.type)) { pushHist(); e.rot = ((e.rot || 0) + 15) % 360; syncHud(); persist(); }
      }
      return;
    }
    if (ev.key === "g" || ev.key === "G") { generate(true); return; }
    if (ev.key === "n" || ev.key === "N") {
      if (ev.ctrlKey || ev.metaKey) return;
      pushHist();
      const cfg = readConfig();
      state = emptyState(cfg.widthFt, cfg.heightFt, cfg.wallCount);
      selected = null; syncHud(); persist();
      return;
    }
    const t = TOOLS.find((x) => x.key === ev.key);
    if (t) { tool = t.id; selected = null; syncHud(); }
  });

  window.addEventListener("keyup", (ev) => {
    if (ev.code === "Space") { spacePan = false; canvas.style.cursor = "crosshair"; }
  });

  /* ---------- chrome ---------- */

  function bindRange(id, valId) {
    const a = document.getElementById(id);
    const b = document.getElementById(valId);
    const sync = () => { b.textContent = a.value; };
    a.addEventListener("input", sync);
    sync();
  }
  ["roomCount", "hangingCount", "standCount", "drumCount", "hostageCount", "threatCount", "instructorCount"]
    .forEach((id) => bindRange(id, id + "Val"));

  document.getElementById("btnApplySpace").onclick = () => { applySpace(); closeDrawers(); };
  document.getElementById("btnGenerate").onclick = () => { generate(true); closeDrawers(); };
  document.getElementById("btnRandom").onclick = () => { generate(true); closeDrawers(); };
  document.getElementById("btnShuffle").onclick = () => { shuffle(); closeDrawers(); };
  document.getElementById("btnSetup").onclick = () => {
    if (document.body.classList.contains("drawer-left")) closeDrawers();
    else openDrawer("left");
  };
  document.getElementById("btnInspect").onclick = () => {
    if (document.body.classList.contains("drawer-right")) closeDrawers();
    else openDrawer("right");
  };
  document.getElementById("drawerBackdrop").onclick = closeDrawers;
  document.querySelectorAll("[data-close-drawer]").forEach((b) => { b.onclick = closeDrawers; });
  document.addEventListener("touchmove", (e) => {
    if (e.target.closest(".rail, .overlay, .mobile-inspector, input, select, textarea, .top-actions, .hotbar")) return;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); }, { passive: false });
  document.getElementById("btnNew").onclick = () => {
    pushHist();
    const cfg = readConfig();
    state = emptyState(cfg.widthFt, cfg.heightFt, cfg.wallCount);
    selected = null; syncHud(); persist();
  };
  document.getElementById("btnUndo").onclick = undo;
  document.getElementById("btnRedo").onclick = redo;
  document.getElementById("briefDismiss").onclick = () => document.getElementById("briefing").classList.add("hidden");

  document.getElementById("snapGrid").onchange = (e) => { show.snap = e.target.checked; persist(); };
  document.getElementById("showGrid").onchange = (e) => { show.grid = e.target.checked; persist(); };

  function shiftLabel(v) { return +v === 50 ? "C" : String(v); }
  document.getElementById("gridShiftX").addEventListener("input", (e) => {
    state.gridShiftX = +e.target.value / 100;
    document.getElementById("gridShiftXVal").textContent = shiftLabel(e.target.value);
    persist();
  });
  document.getElementById("gridShiftY").addEventListener("input", (e) => {
    state.gridShiftY = +e.target.value / 100;
    document.getElementById("gridShiftYVal").textContent = shiftLabel(e.target.value);
    persist();
  });
  document.getElementById("btnCenterGrid").onclick = () => {
    pushHist();
    state.gridShiftX = 0.5;
    state.gridShiftY = 0.5;
    writeConfigFromState();
    persist();
  };

  const nameEl = document.getElementById("missionName");
  nameEl.addEventListener("input", () => {
    state.name = nameEl.value.trim() || "UNASSIGNED";
    persist();
  });
  nameEl.addEventListener("blur", () => {
    state.name = (nameEl.value.trim() || "UNASSIGNED").toUpperCase();
    nameEl.value = state.name;
    persist();
  });

  document.getElementById("btnSave").onclick = () => {
    if (typeof saveLayoutLesson === "function") saveLayoutLesson(state);
    const blob = new Blob([JSON.stringify({ version: 1, state, config: readConfig() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.name || "layout").toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById("btnLoad").onclick = () => document.getElementById("fileLoad").click();
  document.getElementById("fileLoad").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        pushHist();
        state = data.state || data;
        selected = null;
        writeConfigFromState();
        fitCamera();
        syncHud();
        persist();
      } catch (err) {
        alert("Could not read that layout file.");
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  document.getElementById("btnPng").onclick = () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${(state.name || "layout").toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  async function openSheet() {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) { /* ignore */ }
    }
    const logo = document.getElementById("brandLogo");
    if (logo && !logo.complete) {
      await new Promise((resolve) => {
        logo.addEventListener("load", resolve, { once: true });
        logo.addEventListener("error", resolve, { once: true });
      });
    }
    const cv = document.getElementById("sheetCanvas");
    LayoutSheet.render(cv, state);
    document.getElementById("sheetOverlay").classList.remove("hidden");
  }
  function closeSheet() {
    document.getElementById("sheetOverlay").classList.add("hidden");
  }
  document.getElementById("btnPrint").onclick = openSheet;
  document.getElementById("sheetClose").onclick = closeSheet;
  document.getElementById("sheetPrint").onclick = () => {
    LayoutSheet.render(document.getElementById("sheetCanvas"), state);
    requestAnimationFrame(() => window.print());
  };
  document.getElementById("sheetPdf").onclick = () => {
    const cv = document.getElementById("sheetCanvas");
    LayoutSheet.render(cv, state);
    if (typeof saveLayoutLesson === "function") saveLayoutLesson(state);
    LayoutSheet.downloadPdf(cv, state.name || "layout");
  };
  document.getElementById("sheetOverlay").addEventListener("click", (e) => {
    if (e.target.id === "sheetOverlay") closeSheet();
  });

  const PRESETS = {
    sample: { w: 16, h: 16, walls: 3, rooms: 1, hang: 1, stand: 1, drum: 0, host: 0, thr: 0, inst: 1 },
    25: { w: 24, h: 24, walls: 25, rooms: 3, hang: 4, stand: 3, drum: 3, host: 0, thr: 0, inst: 1 },
    36: { w: 30, h: 40, walls: 36, rooms: 4, hang: 6, stand: 4, drum: 4, host: 1, thr: 1, inst: 1 },
    42: { w: 36, h: 36, walls: 42, rooms: 5, hang: 8, stand: 5, drum: 5, host: 1, thr: 2, inst: 1 },
    63: { w: 40, h: 50, walls: 63, rooms: 6, hang: 10, stand: 6, drum: 6, host: 2, thr: 2, inst: 2 },
    84: { w: 50, h: 56, walls: 84, rooms: 8, hang: 12, stand: 8, drum: 8, host: 2, thr: 3, inst: 2 },
  };
  document.querySelectorAll(".preset").forEach((b) => {
    b.onclick = () => {
      const p = PRESETS[b.dataset.preset];
      if (!p) return;
      document.getElementById("spaceW").value = p.w;
      document.getElementById("spaceH").value = p.h;
      document.getElementById("wallCount").value = p.walls;
      document.getElementById("roomCount").value = p.rooms;
      document.getElementById("roomCountVal").textContent = p.rooms;
      document.getElementById("hangingCount").value = p.hang;
      document.getElementById("hangingCountVal").textContent = p.hang;
      document.getElementById("standCount").value = p.stand;
      document.getElementById("standCountVal").textContent = p.stand;
      document.getElementById("drumCount").value = p.drum;
      document.getElementById("drumCountVal").textContent = p.drum;
      document.getElementById("hostageCount").value = p.host;
      document.getElementById("hostageCountVal").textContent = p.host;
      document.getElementById("threatCount").value = p.thr;
      document.getElementById("threatCountVal").textContent = p.thr;
      document.getElementById("instructorCount").value = p.inst;
      document.getElementById("instructorCountVal").textContent = p.inst;
      generate(true);
    };
  });

  window.addEventListener("resize", () => { resize(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { resize(); });
  }
  window.addEventListener("orientationchange", () => {
    setTimeout(() => { resize(); fitCamera(); }, 250);
  });
  const hint = document.getElementById("stageHint");
  if (hint && isCoarse()) {
    hint.textContent = "Drag to move · empty drag pans · pinch zoom · long-press removes";
  }

  buildHotbar();
  restore();
  writeConfigFromState();
  resize();
  if (!localStorage.getItem(LS_KEY)) generate(false);
  requestAnimationFrame(() => { resize(); fitCamera(); syncHud(); });
  requestAnimationFrame(draw);
  if (/[?&]sheet=1\b/.test(location.search)) {
    setTimeout(() => openSheet(), 700);
  }
})();
