/* American Range Wall geometry + random shoot-house generator.
   Panel: 78" tall × 54.25" wide × ~8" thick. Grid = one panel width. */

const ARW = {
  PANEL_W_IN: 54.25,
  PANEL_H_IN: 78,
  PANEL_T_IN: 8,
  PRICE: 99,
  WEIGHT_LB: 20,
};

const TOOLS = [
  { id: "select", name: "Select", key: "1" },
  { id: "wall", name: "Wall", key: "2" },
  { id: "entry", name: "Entry", key: "3" },
  { id: "erase", name: "Erase", key: "4" },
  { id: "hanging", name: "Hang", key: "5" },
  { id: "stand", name: "Stand", key: "6" },
  { id: "drum", name: "Drum", key: "7" },
  { id: "hostage", name: "Non-com", key: "8" },
  { id: "threat", name: "Enemy", key: "9" },
  { id: "instructor", name: "Instructor", key: "0" },
];

const ENTITY_META = {
  hanging: { label: "Wall-hanging target", color: "#e8d44d", r: 0.2 },
  stand: { label: "Target stand", color: "#f0c14a", r: 0.26 },
  drum: { label: "55-gal plastic drum", color: "#2b6cb0", r: 0.28 },
  hostage: { label: "Non-combatant", color: "#4aa3df", r: 0.24 },
  threat: { label: "Enemy combatant", color: "#d4523e", r: 0.24 },
  instructor: { label: "Instructor", color: "#3dba7c", r: 0.24 },
};

const DOOR_CLEAR = 0.82;

const OPS = [
  "IRON THRESHOLD", "STACK AND CLEAR", "NIGHTHAWK", "BREACH POINT",
  "HOLLOW ROOM", "SILENT HALL", "BLACK CORNER", "RED DOOR",
  "PAPER FORTRESS", "DRYWALL GHOST", "LAST ROOM", "CROSSWALK",
  "LONG GUN ALLEY", "FATAL FUNNEL", "SOFT WALL", "YELLOW HALL",
];

function rand(rng) { return rng(); }
function irand(rng, n) { return Math.floor(rng() * n); }
function pick(rng, arr) { return arr[irand(rng, arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function id() { return Math.random().toString(36).slice(2, 9); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function cellsFromFeet(ft) {
  return Math.max(2, Math.floor((ft * 12) / ARW.PANEL_W_IN));
}

function feetFromCells(n) {
  return (n * ARW.PANEL_W_IN) / 12;
}

function edgeKey(kind, x, y) { return `${kind}:${x}:${y}`; }

function parseEdge(key) {
  const [kind, xs, ys] = key.split(":");
  return { kind, x: +xs, y: +ys };
}

function edgeEndpoints(key) {
  const e = parseEdge(key);
  if (e.kind === "h") return { x1: e.x, y1: e.y, x2: e.x + 1, y2: e.y };
  return { x1: e.x, y1: e.y, x2: e.x, y2: e.y + 1 };
}

function edgeMid(key) {
  const p = edgeEndpoints(key);
  return { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
}

function hangingSnap(key, wx, wy) {
  const p = edgeEndpoints(key);
  const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((wx - p.x1) * dx + (wy - p.y1) * dy) / len2;
  t = clamp(t, 0.18, 0.82);
  const px = p.x1 + t * dx, py = p.y1 + t * dy;
  const len = Math.sqrt(len2);
  const nx = -dy / len, ny = dx / len;
  let side = Math.sign((wx - p.x1) * nx + (wy - p.y1) * ny);
  if (!side) side = 1;
  const off = (ARW.PANEL_T_IN / ARW.PANEL_W_IN) * 0.5 + 0.1;
  return {
    x: px + nx * side * off,
    y: py + ny * side * off,
    attached: key,
    side,
    rot: Math.atan2(nx * side, -ny * side) * 180 / Math.PI,
  };
}

function canRotateType(type) {
  return type === "stand" || type === "instructor" || type === "hostage" || type === "threat";
}

function inBoundsEdge(key, cols, rows) {
  const e = parseEdge(key);
  if (e.kind === "h") return e.x >= 0 && e.x < cols && e.y >= 0 && e.y <= rows;
  return e.x >= 0 && e.x <= cols && e.y >= 0 && e.y < rows;
}

function roomContains(room, cx, cy) {
  if (room.cells) return room.cells.some((c) => c.x === cx && c.y === cy);
  return cx >= room.x && cx < room.x + room.w && cy >= room.y && cy < room.y + room.h;
}

function sharedWallSegments(a, b) {
  const segs = [];
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const x = a.x + a.w === b.x ? a.x + a.w : b.x + b.w;
    const y0 = Math.max(a.y, b.y);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    for (let y = y0; y < y1; y++) segs.push(edgeKey("v", x, y));
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const y = a.y + a.h === b.y ? a.y + a.h : b.y + b.h;
    const x0 = Math.max(a.x, b.x);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    for (let x = x0; x < x1; x++) segs.push(edgeKey("h", x, y));
  }
  return segs;
}

function perimeterEdges(room) {
  const segs = [];
  for (let x = room.x; x < room.x + room.w; x++) {
    segs.push(edgeKey("h", x, room.y));
    segs.push(edgeKey("h", x, room.y + room.h));
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    segs.push(edgeKey("v", room.x, y));
    segs.push(edgeKey("v", room.x + room.w, y));
  }
  return segs;
}

function bspRooms(cols, rows, n, rng, minSize) {
  minSize = minSize || 2;
  const rooms = [{ x: 0, y: 0, w: cols, h: rows }];
  let guard = 0;
  while (rooms.length < n && guard++ < 80) {
    rooms.sort((a, b) => b.w * b.h - a.w * a.h);
    let split = false;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const canH = r.w >= minSize * 2;
      const canV = r.h >= minSize * 2;
      if (!canH && !canV) continue;
      let horizontal;
      if (canH && canV) horizontal = r.w === r.h ? rng() > 0.5 : r.w > r.h;
      else horizontal = canH;
      if (horizontal) {
        const lo = minSize;
        const hi = r.w - minSize;
        const cut = lo + irand(rng, hi - lo + 1);
        const a = { x: r.x, y: r.y, w: cut, h: r.h };
        const b = { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h };
        rooms.splice(i, 1, a, b);
      } else {
        const lo = minSize;
        const hi = r.h - minSize;
        const cut = lo + irand(rng, hi - lo + 1);
        const a = { x: r.x, y: r.y, w: r.w, h: cut };
        const b = { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut };
        rooms.splice(i, 1, a, b);
      }
      split = true;
      break;
    }
    if (!split) break;
  }
  rooms.forEach((r, i) => { r.id = i; r.name = `Room ${i + 1}`; });
  return rooms;
}

function pickOpeningOn(segs, style, doorW, rng) {
  if (!segs.length) return [];
  const w = Math.min(doorW, segs.length);
  let start;
  if (style === "center") start = Math.max(0, Math.floor((segs.length - w) / 2));
  else if (style === "corner") start = rng() < 0.5 ? 0 : segs.length - w;
  else start = irand(rng, segs.length - w + 1);
  return segs.slice(start, start + w);
}

function openingStyleFor(globalStyle, rng) {
  if (globalStyle === "mixed") return rng() < 0.5 ? "corner" : "center";
  if (globalStyle === "random") return pick(rng, ["corner", "center"]);
  return globalStyle;
}

function sideOfRoom(room, edge) {
  const e = parseEdge(edge);
  if (e.kind === "h") {
    if (e.y === room.y) return "N";
    if (e.y === room.y + room.h) return "S";
  } else {
    if (e.x === room.x) return "W";
    if (e.x === room.x + room.w) return "E";
  }
  return null;
}

function opposite(dir) {
  return { N: "S", S: "N", E: "W", W: "E" }[dir];
}

function inwardNormal(dir) {
  return { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, W: { x: 1, y: 0 }, E: { x: -1, y: 0 } }[dir];
}

function cellsTouchingEdge(key, cols, rows) {
  const e = parseEdge(key);
  const cells = [];
  if (e.kind === "h") {
    if (e.y > 0) cells.push({ x: e.x, y: e.y - 1, side: "S" });
    if (e.y < rows) cells.push({ x: e.x, y: e.y, side: "N" });
  } else {
    if (e.x > 0) cells.push({ x: e.x - 1, y: e.y, side: "E" });
    if (e.x < cols) cells.push({ x: e.x, y: e.y, side: "W" });
  }
  return cells;
}

function sharesVertex(a, b) {
  const p = edgeEndpoints(a), q = edgeEndpoints(b);
  return (p.x1 === q.x1 && p.y1 === q.y1) || (p.x1 === q.x2 && p.y1 === q.y2)
    || (p.x2 === q.x1 && p.y2 === q.y1) || (p.x2 === q.x2 && p.y2 === q.y2);
}

function addInteriorCover(walls, rooms, extra, rng, cols, rows) {
  const used = new Set(Object.keys(walls));
  let added = 0;
  const shuffled = rooms.slice().sort(() => rng() - 0.5);
  for (const room of shuffled) {
    if (added >= extra) break;
    if (room.w < 3 && room.h < 3) continue;
    const candidates = [];
    for (const k of perimeterEdges(room)) {
      if (!used.has(k)) continue;
      const e = parseEdge(k);
      if (e.kind === "h") {
        const y = e.y === room.y ? e.y + 1 : e.y - 1;
        if (y > room.y && y < room.y + room.h) candidates.push(edgeKey("v", e.x, Math.min(e.y, y)));
        if (y > room.y && y < room.y + room.h) candidates.push(edgeKey("v", e.x + 1, Math.min(e.y, y)));
      } else {
        const x = e.x === room.x ? e.x + 1 : e.x - 1;
        if (x > room.x && x < room.x + room.w) candidates.push(edgeKey("h", Math.min(e.x, x), e.y));
        if (x > room.x && x < room.x + room.w) candidates.push(edgeKey("h", Math.min(e.x, x), e.y + 1));
      }
    }
    const opts = candidates.filter((k) => !used.has(k) && inBoundsEdge(k, cols, rows)
      && [...used].some((u) => sharesVertex(k, u)));
    while (added < extra && opts.length) {
      const k = opts.splice(irand(rng, opts.length), 1)[0];
      if (used.has(k)) continue;
      walls[k] = true;
      used.add(k);
      added++;
    }
  }
  return added;
}

function isPerimeterEdge(key, cols, rows) {
  const e = parseEdge(key);
  if (e.kind === "h") return e.y === 0 || e.y === rows;
  return e.x === 0 || e.x === cols;
}

function prioritizeEdges(keys, budget, rng, cols, rows) {
  if (keys.length <= budget) return keys;
  const shuffle = (arr) => arr.map((k) => ({ k, s: rng() })).sort((a, b) => a.s - b.s).map((s) => s.k);
  const peri = shuffle(keys.filter((k) => isPerimeterEdge(k, cols, rows)));
  const inner = shuffle(keys.filter((k) => !isPerimeterEdge(k, cols, rows)));
  const picked = peri.slice(0, budget);
  const have = new Set(picked);
  const rest = inner.filter((k) => !have.has(k));
  const connected = (k) => [...have].some((u) => sharesVertex(k, u));
  while (picked.length < budget) {
    const idx = rest.findIndex(connected);
    if (idx < 0) break;
    const k = rest.splice(idx, 1)[0];
    picked.push(k);
    have.add(k);
  }
  return picked;
}

function roomsOnOuterSide(rooms, side, cols, rows) {
  return rooms.filter((r) => {
    if (side === "N") return r.y === 0;
    if (side === "S") return r.y + r.h === rows;
    if (side === "W") return r.x === 0;
    if (side === "E") return r.x + r.w === cols;
    return false;
  });
}

function outerSegsForRoom(room, side, cols, rows) {
  return perimeterEdges(room).filter((k) => isPerimeterEdge(k, cols, rows) && sideOfRoom(room, k) === side);
}

function spanningTree(connections, startId, rng) {
  const adj = new Map();
  for (const c of connections) {
    if (!adj.has(c.a)) adj.set(c.a, []);
    if (!adj.has(c.b)) adj.set(c.b, []);
    adj.get(c.a).push(c);
    adj.get(c.b).push(c);
  }
  const seen = new Set([startId]);
  const tree = [];
  const frontier = (adj.get(startId) || []).slice().sort(() => rng() - 0.5);
  while (frontier.length) {
    const c = frontier.shift();
    const nxt = seen.has(c.a) && !seen.has(c.b) ? c.b : seen.has(c.b) && !seen.has(c.a) ? c.a : null;
    if (nxt == null) continue;
    seen.add(nxt);
    tree.push(c);
    const more = (adj.get(nxt) || []).filter((x) => {
      const o = x.a === nxt ? x.b : x.a;
      return !seen.has(o);
    });
    for (const m of more.sort(() => rng() - 0.5)) frontier.push(m);
  }
  return tree;
}

function bfsRooms(rooms, connections, startId) {
  const dist = new Map([[startId, 0]]);
  const q = [startId];
  while (q.length) {
    const cur = q.shift();
    for (const c of connections) {
      const nxt = c.a === cur ? c.b : c.b === cur ? c.a : null;
      if (nxt == null || dist.has(nxt)) continue;
      dist.set(nxt, dist.get(cur) + 1);
      q.push(nxt);
    }
  }
  return dist;
}

function cellCenter(x, y) { return { x: x + 0.5, y: y + 0.5 }; }

function occupiedNear(entities, x, y, r, skip) {
  return entities.some((e) => {
    if (skip && e === skip) return false;
    const dx = e.x - x, dy = e.y - y;
    return dx * dx + dy * dy < r * r;
  });
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function inDoorway(x, y, openings, minDist) {
  const d = minDist == null ? DOOR_CLEAR : minDist;
  for (const key of openings) {
    const p = edgeEndpoints(key);
    if (distToSegment(x, y, p.x1, p.y1, p.x2, p.y2) < d) return true;
  }
  return false;
}

function nearestDoorDist(x, y, openings) {
  let best = Infinity;
  for (const key of openings) {
    const p = edgeEndpoints(key);
    best = Math.min(best, distToSegment(x, y, p.x1, p.y1, p.x2, p.y2));
  }
  return best;
}

function roomSpots(room, openings, entities, minDist) {
  const spots = [];
  for (const c of roomCells(room)) {
    const candidates = [
      { x: c.x + 0.5, y: c.y + 0.5 },
      { x: c.x + 0.28, y: c.y + 0.28 },
      { x: c.x + 0.72, y: c.y + 0.28 },
      { x: c.x + 0.28, y: c.y + 0.72 },
      { x: c.x + 0.72, y: c.y + 0.72 },
    ];
    for (const p of candidates) {
      if (p.x < room.x + 0.2 || p.y < room.y + 0.2) continue;
      if (p.x > room.x + room.w - 0.2 || p.y > room.y + room.h - 0.2) continue;
      if (inDoorway(p.x, p.y, openings, minDist)) continue;
      if (occupiedNear(entities, p.x, p.y, 0.42)) continue;
      spots.push(p);
    }
  }
  spots.sort((a, b) => nearestDoorDist(b.x, b.y, openings) - nearestDoorDist(a.x, a.y, openings));
  return spots;
}

function nudgeOutOfDoorways(entities, openings, cols, rows) {
  const kicks = [
    [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9],
    [0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75],
    [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2],
  ];
  for (const e of entities) {
    if (e.type === "hanging") continue;
    if (!inDoorway(e.x, e.y, openings)) continue;
    for (const [dx, dy] of kicks) {
      const nx = clamp(e.x + dx, 0.22, cols - 0.22);
      const ny = clamp(e.y + dy, 0.22, rows - 0.22);
      if (!inDoorway(nx, ny, openings) && !occupiedNear(entities, nx, ny, 0.38, e)) {
        e.x = nx;
        e.y = ny;
        break;
      }
    }
  }
}

function roomCells(room) {
  if (room.cells && room.cells.length) return room.cells;
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
  }
  return cells;
}

function placeEntity(entities, type, x, y, rot, extra) {
  const e = { id: id(), type, x, y, rot: rot || 0, locked: false, ...extra };
  entities.push(e);
  return e;
}

function detectRooms(walls, cols, rows, openings) {
  const door = new Set(openings || []);
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const rooms = [];
  const edgeBlocked = (key) => !!walls[key] || door.has(key);
  const blocked = (x1, y1, x2, y2) => {
    if (x2 === x1 + 1) return edgeBlocked(edgeKey("v", x1 + 1, y1));
    if (x2 === x1 - 1) return edgeBlocked(edgeKey("v", x1, y1));
    if (y2 === y1 + 1) return edgeBlocked(edgeKey("h", x1, y1 + 1));
    if (y2 === y1 - 1) return edgeBlocked(edgeKey("h", x1, y1));
    return true;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (seen[y][x]) continue;
      const q = [{ x, y }];
      seen[y][x] = true;
      const cells = [];
      while (q.length) {
        const c = q.pop();
        cells.push(c);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx, ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny][nx]) continue;
          if (blocked(c.x, c.y, nx, ny)) continue;
          seen[ny][nx] = true;
          q.push({ x: nx, y: ny });
        }
      }
      const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
      const minx = Math.min(...xs), miny = Math.min(...ys);
      const maxx = Math.max(...xs), maxy = Math.max(...ys);
      const top = cells.filter((c) => c.y === miny);
      rooms.push({
        id: rooms.length,
        name: `Room ${rooms.length + 1}`,
        x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1,
        cx: top.reduce((s, c) => s + c.x + 0.5, 0) / top.length,
        cy: miny + (cells.length <= 6 ? 0.38 : 0.55),
        cells,
        area: cells.length,
      });
    }
  }
  rooms.sort((a, b) => b.area - a.area);
  rooms.forEach((r, i) => { r.id = i; r.name = `Room ${i + 1}`; });
  return rooms;
}

const LEARN_KEY = "arw-learn-v1";

function loadLessons() {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY) || "[]"); } catch (_) { return []; }
}

function nearestOpeningDist(x, y, openings) {
  let best = Infinity, mid = null;
  for (const k of openings || []) {
    const m = edgeMid(k);
    const d = Math.hypot(x - m.x, y - m.y);
    if (d < best) { best = d; mid = m; }
  }
  return { dist: best, mid };
}

function extractLesson(state) {
  const openings = state.openings || [];
  const drums = (state.entities || []).filter((e) => e.type === "drum");
  const inst = (state.entities || []).filter((e) => e.type === "instructor");
  const stands = (state.entities || []).filter((e) => e.type === "stand");
  const drumDists = drums.map((e) => nearestOpeningDist(e.x, e.y, openings).dist).filter((d) => d < 20);
  const standDists = stands.map((e) => nearestOpeningDist(e.x, e.y, openings).dist).filter((d) => d < 20);
  let instAlong = [];
  if (state.entry && state.entry.edges && state.entry.edges.length && inst.length) {
    const mid = edgeMid(state.entry.edges[0]);
    const n = inwardNormal(state.entry.side || "S");
    const t = { x: -n.y, y: n.x };
    instAlong = inst.map((e) => ({
      along: (e.x - mid.x) * t.x + (e.y - mid.y) * t.y,
      depth: (e.x - mid.x) * n.x + (e.y - mid.y) * n.y,
    }));
  }
  const occ = new Set();
  for (const k of Object.keys(state.walls || {})) {
    const cells = cellsTouchingEdge(k, state.cols, state.rows);
    for (const c of cells) occ.add(`${c.x},${c.y}`);
  }
  const area = occ.size || 1;
  const xs = [...occ].map((s) => +s.split(",")[0]);
  const ys = [...occ].map((s) => +s.split(",")[1]);
  const bw = xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : 1;
  const bh = ys.length ? Math.max(...ys) - Math.min(...ys) + 1 : 1;
  return {
    drumDist: drumDists.length ? drumDists.reduce((a, b) => a + b, 0) / drumDists.length : 1.3,
    standDist: standDists.length ? standDists.reduce((a, b) => a + b, 0) / standDists.length : 1.2,
    instAlong: instAlong.length ? Math.abs(instAlong[0].along) : 1.15,
    instDepth: instAlong.length ? instAlong[0].depth : 0.4,
    fill: area / (bw * bh),
    walls: wallCount(state.walls),
  };
}

function saveLayoutLesson(state) {
  const lessons = loadLessons();
  lessons.push({ t: Date.now(), ...extractLesson(state) });
  while (lessons.length > 48) lessons.shift();
  try { localStorage.setItem(LEARN_KEY, JSON.stringify(lessons)); } catch (_) { /* ignore */ }
}

function lessonBias() {
  const L = loadLessons();
  const avg = (key, fallback) => {
    const v = L.map((x) => x[key]).filter((n) => typeof n === "number" && !isNaN(n));
    if (!v.length) return fallback;
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  return {
    drumDist: avg("drumDist", 1.35),
    standDist: avg("standDist", 1.15),
    instAlong: clamp(avg("instAlong", 1.15), 0.85, 1.6),
    instDepth: clamp(avg("instDepth", 0.4), 0.28, 0.7),
    fill: avg("fill", 0.75),
    learned: L.length >= 2,
  };
}

function occupancyWalls(rooms, cols, rows) {
  const owner = new Map();
  rooms.forEach((r) => {
    r.cells = r.cells || roomCells(r);
    for (const c of r.cells) owner.set(`${c.x},${c.y}`, r.id);
  });
  const walls = {};
  const shared = new Map();
  const consider = (x, y, nx, ny, key) => {
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
      walls[key] = true;
      return;
    }
    const a = owner.get(`${x},${y}`);
    const b = owner.get(`${nx},${ny}`);
    if (a == null) return;
    if (b === a) return;
    if (b == null) { walls[key] = true; return; }
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const pk = `${lo}|${hi}`;
    if (!shared.has(pk)) shared.set(pk, { a: lo, b: hi, segs: [] });
    if (shared.get(pk).segs.indexOf(key) === -1) {
      shared.get(pk).segs.push(key);
      walls[key] = true;
    }
  };
  for (const [ck] of owner) {
    const [x, y] = ck.split(",").map(Number);
    consider(x, y, x, y - 1, edgeKey("h", x, y));
    consider(x, y, x, y + 1, edgeKey("h", x, y + 1));
    consider(x, y, x - 1, y, edgeKey("v", x, y));
    consider(x, y, x + 1, y, edgeKey("v", x + 1, y));
  }
  return { walls, shared: [...shared.values()] };
}

function expectedPanels(rooms, cols, rows, doorW) {
  const raw = Object.keys(occupancyWalls(rooms, cols, rows).walls).length;
  const doors = (Math.max(0, rooms.length - 1) + 1) * (doorW || 1);
  return Math.max(0, raw - doors);
}

function structureFromRooms(rooms, cols, rows, doorW, openingStyle, entrySide, rng) {
  const occ = occupancyWalls(rooms, cols, rows);
  const walls = occ.walls;
  const connections = occ.shared;
  const entrySegs = clusterSideSegs(rooms, entrySide);
  const entryRoom = rooms.find((r) => {
    const cells = r.cells || roomCells(r);
    const set = new Set(entrySegs);
    if (entrySide === "N") return cells.some((c) => set.has(edgeKey("h", c.x, c.y)));
    if (entrySide === "S") return cells.some((c) => set.has(edgeKey("h", c.x, c.y + 1)));
    if (entrySide === "W") return cells.some((c) => set.has(edgeKey("v", c.x, c.y)));
    return cells.some((c) => set.has(edgeKey("v", c.x + 1, c.y)));
  }) || rooms[0];

  const openings = [];
  const tree = spanningTree(connections, entryRoom.id, rng);
  for (const c of connections) {
    const onTree = tree.indexOf(c) !== -1;
    if (!onTree) { c.opening = []; continue; }
    const cut = pickOpeningOn(c.segs, openingStyleFor(openingStyle, rng), doorW, rng);
    c.opening = cut;
    openings.push(...cut);
  }
  const entryCuts = pickOpeningOn(entrySegs, openingStyleFor(openingStyle, rng), doorW, rng);
  openings.push(...entryCuts);
  if (rooms.length > 1 && rng() < 0.55) {
    const others = rooms.filter((r) => r.id !== entryRoom.id);
    if (others.length) {
      const xr = pick(rng, others);
      const segs = clusterSideSegs([xr], pick(rng, ["N", "S", "E", "W"]))
        .filter((k) => openings.indexOf(k) === -1 && walls[k]);
      if (segs.length) openings.push(...pickOpeningOn(segs, openingStyleFor(openingStyle, rng), doorW, rng));
    }
  }
  const openSet = new Set(openings);
  for (const k of openings) delete walls[k];
  return { rooms, connections, walls, openings, entryCuts, entryRoom };
}

function clusterSideSegs(rooms, side) {
  const cells = [];
  for (const r of rooms) for (const c of (r.cells || roomCells(r))) cells.push(c);
  if (!cells.length) return [];
  const segs = [];
  if (side === "N") {
    const m = Math.min(...cells.map((c) => c.y));
    for (const c of cells) if (c.y === m) segs.push(edgeKey("h", c.x, c.y));
  } else if (side === "S") {
    const m = Math.max(...cells.map((c) => c.y));
    for (const c of cells) if (c.y === m) segs.push(edgeKey("h", c.x, c.y + 1));
  } else if (side === "W") {
    const m = Math.min(...cells.map((c) => c.x));
    for (const c of cells) if (c.x === m) segs.push(edgeKey("v", c.x, c.y));
  } else {
    const m = Math.max(...cells.map((c) => c.x));
    for (const c of cells) if (c.x === m) segs.push(edgeKey("v", c.x + 1, c.y));
  }
  return segs;
}

function roomsOverlap(rooms) {
  const seen = new Set();
  for (const r of rooms) {
    for (const c of (r.cells || roomCells(r))) {
      const k = `${c.x},${c.y}`;
      if (seen.has(k)) return true;
      seen.add(k);
    }
  }
  return false;
}

function attachPlacements(host, side, nw, nh, cols, rows) {
  const out = [];
  if (side === "N") {
    const y = host.y - nh;
    if (y < 0) return out;
    const x0 = host.x - nw + 1, x1 = host.x + host.w - 1;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x + nw > cols) continue;
      const overlap = Math.min(x + nw, host.x + host.w) - Math.max(x, host.x);
      if (overlap < 1) continue;
      out.push({ x, y, w: nw, h: nh });
    }
  } else if (side === "S") {
    const y = host.y + host.h;
    if (y + nh > rows) return out;
    const x0 = host.x - nw + 1, x1 = host.x + host.w - 1;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x + nw > cols) continue;
      const overlap = Math.min(x + nw, host.x + host.w) - Math.max(x, host.x);
      if (overlap < 1) continue;
      out.push({ x, y, w: nw, h: nh });
    }
  } else if (side === "W") {
    const x = host.x - nw;
    if (x < 0) return out;
    const y0 = host.y - nh + 1, y1 = host.y + host.h - 1;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y + nh > rows) continue;
      const overlap = Math.min(y + nh, host.y + host.h) - Math.max(y, host.y);
      if (overlap < 1) continue;
      out.push({ x, y, w: nw, h: nh });
    }
  } else {
    const x = host.x + host.w;
    if (x + nw > cols) return out;
    const y0 = host.y - nh + 1, y1 = host.y + host.h - 1;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y + nh > rows) continue;
      const overlap = Math.min(y + nh, host.y + host.h) - Math.max(y, host.y);
      if (overlap < 1) continue;
      out.push({ x, y, w: nw, h: nh });
    }
  }
  return out;
}

function growHouse(cols, rows, budget, nRooms, doorW, openingStyle, entrySide, rng) {
  const rw = clamp(2 + irand(rng, 3), 2, Math.max(2, cols));
  const rh = clamp(2 + irand(rng, 3), 2, Math.max(2, rows));
  let x = clamp(Math.floor((cols - rw) / 2) + irand(rng, 3) - 1, 0, Math.max(0, cols - rw));
  let y = clamp(Math.floor((rows - rh) / 2) + irand(rng, 3) - 1, 0, Math.max(0, rows - rh));
  if (entrySide === "S") y = clamp(y + 1, 0, Math.max(0, rows - rh));
  if (entrySide === "N") y = clamp(y - 1, 0, Math.max(0, rows - rh));
  if (entrySide === "E") x = clamp(x + 1, 0, Math.max(0, cols - rw));
  if (entrySide === "W") x = clamp(x - 1, 0, Math.max(0, cols - rw));

  let rooms = [{ id: 0, x, y, w: rw, h: rh, cells: roomCells({ x, y, w: rw, h: rh }) }];
  const tally = (list) => expectedPanels(list, cols, rows, doorW);

  while (tally(rooms) > budget && (rooms[0].w > 2 || rooms[0].h > 2)) {
    if (rooms[0].w >= rooms[0].h && rooms[0].w > 2) rooms[0].w--;
    else if (rooms[0].h > 2) rooms[0].h--;
    else break;
    rooms[0].cells = roomCells(rooms[0]);
  }
  if (tally(rooms) > budget) return null;

  let guard = 0;
  while (rooms.length < nRooms && guard++ < 50) {
    const tries = [];
    for (let s = 2; s <= 4; s++) {
      for (let t = 2; t <= 4; t++) {
        if (s > cols || t > rows) continue;
        tries.push({ nw: s, nh: t });
      }
    }
    tries.sort(() => rng() - 0.5);
    let added = false;
    outer: for (const sz of tries) {
      const hosts = rooms.slice().sort(() => rng() - 0.5);
      const sides = ["N", "S", "E", "W"].sort(() => rng() - 0.5);
      for (const host of hosts) {
        for (const side of sides) {
          const opts = attachPlacements(host, side, sz.nw, sz.nh, cols, rows).sort(() => rng() - 0.5);
          for (const p of opts) {
            const next = rooms.concat([{ id: rooms.length, x: p.x, y: p.y, w: p.w, h: p.h, cells: roomCells(p) }]);
            if (roomsOverlap(next)) continue;
            if (tally(next) <= budget) {
              rooms = next;
              added = true;
              break outer;
            }
          }
        }
      }
    }
    if (!added) break;
  }

  guard = 0;
  while (tally(rooms) < budget - 1 && guard++ < 16) {
    const host = pick(rng, rooms);
    const side = pick(rng, ["N", "S", "E", "W"]);
    let nx = host.x, ny = host.y, nw = host.w, nh = host.h;
    if (side === "N" && host.y > 0) { ny--; nh++; }
    else if (side === "S" && host.y + host.h < rows) nh++;
    else if (side === "W" && host.x > 0) { nx--; nw++; }
    else if (side === "E" && host.x + host.w < cols) nw++;
    else continue;
    const grown = rooms.map((r) => r.id === host.id
      ? { ...r, x: nx, y: ny, w: nw, h: nh, cells: roomCells({ x: nx, y: ny, w: nw, h: nh }) }
      : r);
    if (roomsOverlap(grown)) continue;
    const n = tally(grown);
    if (n > budget) continue;
    if (n <= tally(rooms)) continue;
    rooms = grown;
  }

  rooms.forEach((r, i) => { r.id = i; r.name = `Room ${i + 1}`; });
  return structureFromRooms(rooms, cols, rows, doorW, openingStyle, entrySide, rng);
}

function offsetKey(key, ox, oy) {
  const e = parseEdge(key);
  return edgeKey(e.kind, e.x + ox, e.y + oy);
}

function buildCluster(w, h, nRooms, doorW, openingStyle, entrySide, rng) {
  const rooms = bspRooms(w, h, nRooms, rng, 2);
  const connections = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const segs = sharedWallSegments(rooms[i], rooms[j]);
      if (segs.length) connections.push({ a: rooms[i].id, b: rooms[j].id, segs });
    }
  }
  const interior = new Set();
  for (const c of connections) {
    for (const k of c.segs) interior.add(k);
  }
  const peri = perimeterEdges({ x: 0, y: 0, w, h });
  const onSide = roomsOnOuterSide(rooms, entrySide, w, h);
  const entryRoom = onSide.length ? pick(rng, onSide) : rooms[0];

  const openings = [];
  const tree = spanningTree(connections, entryRoom.id, rng);
  for (const c of connections) {
    const onTree = tree.indexOf(c) !== -1;
    if (!onTree) { c.opening = []; continue; }
    const style = openingStyleFor(openingStyle, rng);
    const cut = pickOpeningOn(c.segs, style, doorW, rng);
    c.opening = cut;
    c.style = style;
    openings.push(...cut);
  }

  const entrySegs = outerSegsForRoom(entryRoom, entrySide, w, h);
  const fallback = peri.filter((k) => sideOfRoom({ x: 0, y: 0, w, h }, k) === entrySide);
  const entryCuts = pickOpeningOn(entrySegs.length ? entrySegs : fallback, openingStyleFor(openingStyle, rng), doorW, rng);
  openings.push(...entryCuts);

  if (rooms.length > 1 && rng() < 0.7) {
    const exitRooms = rooms.filter((r) => r.id !== entryRoom.id
      && perimeterEdges(r).some((k) => isPerimeterEdge(k, w, h)));
    if (exitRooms.length) {
      const xr = pick(rng, exitRooms);
      const exitSegs = perimeterEdges(xr).filter((k) => isPerimeterEdge(k, w, h) && openings.indexOf(k) === -1);
      if (exitSegs.length) {
        openings.push(...pickOpeningOn(exitSegs, openingStyleFor(openingStyle, rng), doorW, rng));
      }
    }
  }

  const openSet = new Set(openings);
  const walls = {};
  for (const k of peri) {
    if (!openSet.has(k)) walls[k] = true;
  }
  for (const k of interior) {
    if (!openSet.has(k)) walls[k] = true;
  }
  return { rooms, connections, walls, openings, entryCuts, entryRoom, w, h };
}

function generateLayout(cfg) {
  const seed = cfg.seed == null ? (Math.random() * 1e9) | 0 : cfg.seed;
  const rng = mulberry32(seed);
  const cols = cellsFromFeet(cfg.widthFt);
  const rows = cellsFromFeet(cfg.heightFt);
  const budget = Math.max(1, cfg.wallCount | 0);
  const roomTarget = clamp(cfg.roomCount | 0, 1, Math.max(1, Math.floor((cols * rows) / 4)));
  const doorW = cfg.doorWidth === 2 ? 2 : 1;

  let entrySide = cfg.entrySide;
  if (!entrySide || entrySide === "auto") entrySide = pick(rng, ["S", "N", "W", "E"]);

  let grown = growHouse(cols, rows, budget, roomTarget, doorW, cfg.openingStyle, entrySide, rng);
  if (!grown || !Object.keys(grown.walls).length) {
    grown = growHouse(cols, rows, budget, Math.max(1, roomTarget - 1), doorW, cfg.openingStyle, entrySide, mulberry32(seed + 17));
  }
  if (!grown || !Object.keys(grown.walls).length) {
    const localRng = mulberry32((seed + 1) >>> 0);
    const cluster = buildCluster(Math.min(3, cols), Math.min(3, rows), 1, doorW, cfg.openingStyle, entrySide, localRng);
    const ox = clamp(Math.floor((cols - cluster.w) / 2), 0, Math.max(0, cols - cluster.w));
    const oy = clamp(Math.floor((rows - cluster.h) / 2), 0, Math.max(0, rows - cluster.h));
    grown = {
      rooms: cluster.rooms.map((r) => ({ ...r, x: r.x + ox, y: r.y + oy, cells: roomCells({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }) })),
      connections: cluster.connections.map((c) => ({
        ...c,
        segs: c.segs.map((k) => offsetKey(k, ox, oy)),
        opening: (c.opening || []).map((k) => offsetKey(k, ox, oy)),
      })),
      walls: Object.fromEntries(Object.keys(cluster.walls).map((k) => [offsetKey(k, ox, oy), true])),
      openings: cluster.openings.map((k) => offsetKey(k, ox, oy)),
      entryCuts: cluster.entryCuts.map((k) => offsetKey(k, ox, oy)),
      entryRoom: null,
    };
  }

  const rooms = grown.rooms;
  const connections = grown.connections;
  const walls = grown.walls;
  const openings = grown.openings;
  const entryCuts = grown.entryCuts;
  const entryRoom = grown.entryRoom || rooms[0];
  const openSet = new Set(openings);

  if (Object.keys(walls).length > budget) {
    const keys = Object.keys(walls);
    while (keys.length > budget) {
      const k = keys.pop();
      delete walls[k];
    }
  }

  if (cfg.coverWalls) {
    const extra = Math.max(0, budget - Object.keys(walls).length);
    if (extra > 0) addInteriorCover(walls, rooms, extra, rng, cols, rows);
    const extras = Object.keys(walls);
    while (extras.length > budget) {
      const k = extras.pop();
      if (openSet.has(k)) continue;
      delete walls[k];
    }
  }

  const dist = bfsRooms(rooms, connections, entryRoom.id);
  rooms.forEach((r) => { r.dist = dist.has(r.id) ? dist.get(r.id) : 99; });
  rooms.sort((a, b) => a.id - b.id);
  const deepRoom = rooms.slice().sort((a, b) => b.dist - a.dist || b.w * b.h - a.w * a.h)[0];

  const entities = placeAllProps({
    cfg, rooms, walls, openings: [...openSet], entryCuts, entrySide,
    connections, cols, rows, rng, entryRoom, deepRoom,
  });

  const visual = detectRooms(walls, cols, rows, [...openSet]);
  visual.forEach((r) => {
    const hostHere = entities.some((e) => e.type === "hostage" && roomContains(r, Math.floor(e.x), Math.floor(e.y)));
    const threatHere = entities.some((e) => e.type === "threat" && roomContains(r, Math.floor(e.x), Math.floor(e.y)));
    const entryHere = (entryCuts || []).some((k) =>
      cellsTouchingEdge(k, cols, rows).some((c) => roomContains(r, c.x, c.y))
    );
    if (hostHere && threatHere) r.role = "Holding";
    else if (entryHere) r.role = "Entry / staging";
    else r.role = r.area <= 4 ? "Closet / problem" : "Interior";
  });

  return {
    seed,
    name: pick(rng, OPS),
    cols, rows,
    widthFt: cfg.widthFt,
    heightFt: cfg.heightFt,
    wallBudget: budget,
    walls,
    entities,
    rooms: visual,
    openings: [...openSet],
    entry: { side: entrySide, edges: entryCuts },
    connections,
  };
}

function placeAllProps(ctx) {
  const {
    cfg, walls, cols, rows, rng, entrySide,
  } = ctx;
  let { rooms, openings, entryCuts, connections, entryRoom, deepRoom } = ctx;
  rooms = (rooms || []).map((r) => ({ ...r, cells: r.cells || roomCells(r) }));
  openings = openings || [];
  entryCuts = entryCuts || [];
  connections = connections || [];
  const openSet = new Set(openings);
  if (!entryRoom) entryRoom = rooms[0];
  if (!deepRoom) deepRoom = rooms[0];
  if (!rooms.length) return [];

  const entities = [];
  const bias = lessonBias();
  const entryMid = edgeMid(entryCuts[Math.floor(entryCuts.length / 2)] || edgeKey("h", 0, 0));
  const inN = inwardNormal(entrySide || "S");
  const tangent = { x: -inN.y, y: inN.x };

  if ((cfg.instructorCount | 0) > 0) {
    const cand = [];
    for (const sign of [1, -1]) {
      for (const along of [bias.instAlong, 0.95, 1.2, 1.45]) {
        for (const depth of [bias.instDepth, 0.3, 0.5]) {
          cand.push({
            x: entryMid.x + tangent.x * sign * along + inN.x * depth,
            y: entryMid.y + tangent.y * sign * along + inN.y * depth,
          });
        }
      }
    }
    const ranked = cand.map((p) => {
      if (inDoorway(p.x, p.y, openSet, 0.8)) return { p, s: -999 };
      const along = (p.x - entryMid.x) * tangent.x + (p.y - entryMid.y) * tangent.y;
      const depth = (p.x - entryMid.x) * inN.x + (p.y - entryMid.y) * inN.y;
      if (Math.abs(along) < 0.75) return { p, s: -400 };
      let wallDist = 9;
      for (const k of Object.keys(walls)) {
        const e = edgeEndpoints(k);
        wallDist = Math.min(wallDist, distToSegment(p.x, p.y, e.x1, e.y1, e.x2, e.y2));
      }
      return { p, s: Math.abs(along) * 0.4 + depth * 0.35 - wallDist * 1.4, along };
    }).sort((a, b) => b.s - a.s);
    const placedAt = [];
    for (let i = 0; i < (cfg.instructorCount | 0); i++) {
      const wantSign = i % 2 === 0 ? 1 : -1;
      const hit = ranked.find((r) => r.s > -200
        && Math.sign(r.along || 1) === wantSign
        && placedAt.every((u) => Math.hypot(u.x - r.p.x, u.y - r.p.y) > 0.55))
        || ranked.find((r) => r.s > -200
          && placedAt.every((u) => Math.hypot(u.x - r.p.x, u.y - r.p.y) > 0.55));
      const p = hit ? hit.p : {
        x: entryMid.x + tangent.x * wantSign * (1.1 + i * 0.45) + inN.x * 0.4,
        y: entryMid.y + tangent.y * wantSign * (1.1 + i * 0.45) + inN.y * 0.4,
      };
      const pos = {
        x: clamp(p.x, 0.22, cols - 0.22),
        y: clamp(p.y, 0.22, rows - 0.22),
      };
      placedAt.push(pos);
      placeEntity(entities, "instructor", pos.x, pos.y, rotToward(pos, { x: entryMid.x + inN.x * 1.2, y: entryMid.y + inN.y * 1.2 }));
    }
  }

  function roomsAtOpening(k) {
    const seen = [];
    for (const c of cellsTouchingEdge(k, cols, rows)) {
      const r = rooms.find((rm) => roomContains(rm, c.x, c.y));
      if (r && seen.indexOf(r) < 0) seen.push(r);
    }
    return seen;
  }

  const assaultOrigin = (entryCuts && entryCuts.length)
    ? edgeMid(entryCuts[Math.floor(entryCuts.length / 2)])
    : null;

  const flow = new Map();
  if (rooms.length) {
    const start = entryRoom || rooms[0];
    const startKey = (entryCuts && entryCuts[0])
      || openings.find((k) => roomsAtOpening(k).indexOf(start) >= 0)
      || null;
    if (startKey) {
      const side = sideOfRoom(start, startKey) || entrySide || "S";
      flow.set(start.id, {
        dist: 0,
        inKey: startKey,
        inMid: edgeMid(startKey),
        inSide: side,
        inN: inwardNormal(side),
      });
    } else {
      flow.set(start.id, {
        dist: 0,
        inKey: null,
        inMid: { x: start.x + start.w / 2, y: start.y + start.h / 2 },
        inSide: entrySide || "S",
        inN: inwardNormal(entrySide || "S"),
      });
    }
    const q = [start];
    const seenR = new Set([start.id]);
    while (q.length) {
      const cur = q.shift();
      for (const k of openings) {
        const rs = roomsAtOpening(k);
        if (rs.indexOf(cur) < 0) continue;
        for (const nxt of rs) {
          if (nxt.id === cur.id || seenR.has(nxt.id)) continue;
          const side = sideOfRoom(nxt, k) || "S";
          flow.set(nxt.id, {
            dist: (flow.get(cur.id) || { dist: 0 }).dist + 1,
            inKey: k,
            inMid: edgeMid(k),
            inSide: side,
            inN: inwardNormal(side),
            parent: cur.id,
          });
          seenR.add(nxt.id);
          q.push(nxt);
        }
      }
    }
    rooms.forEach((r) => { r.dist = flow.has(r.id) ? flow.get(r.id).dist : 99; });
  }

  function flowOf(room) {
    return room ? flow.get(room.id) : null;
  }

  function hangingOnOppositeWall(room, fromDir) {
    const want = opposite(fromDir) || pick(rng, ["N", "S", "E", "W"]);
    const segs = perimeterEdges(room).filter((k) => walls[k] && sideOfRoom(room, k) === want);
    return segs.length ? pick(rng, segs) : perimeterEdges(room).filter((k) => walls[k])[0];
  }

  function sideTowardPoint(room, pt) {
    if (!pt) return entrySide || "S";
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const dx = pt.x - cx, dy = pt.y - cy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
    return dy > 0 ? "S" : "N";
  }

  function facePoint(room) {
    if (assaultOrigin) return assaultOrigin;
    const f = flowOf(room);
    if (f && f.inMid) return f.inMid;
    return null;
  }

  function doorDirForRoom(room) {
    if (assaultOrigin) return sideTowardPoint(room, assaultOrigin);
    const f = flowOf(room);
    if (f && f.inSide) return f.inSide;
    if (entryRoom && room.id === entryRoom.id) return entrySide;
    return pick(rng, ["N", "S", "E", "W"]);
  }

  function inboundMid(room) {
    const f = flowOf(room);
    if (f && f.inMid) return f.inMid;
    if (entryRoom && room.id === entryRoom.id && entryCuts.length) {
      return edgeMid(entryCuts[Math.floor(entryCuts.length / 2)]);
    }
    for (const k of openings) {
      const cells = cellsTouchingEdge(k, cols, rows);
      if (cells.some((c) => roomContains(room, c.x, c.y))) return edgeMid(k);
    }
    return null;
  }

  function doorMidForRoom(room) {
    return facePoint(room) || inboundMid(room);
  }

  function rotToward(from, to) {
    if (!to) return 0;
    return Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI;
  }

  const hangingN = cfg.hangingCount | 0;
  const standN = cfg.standCount | 0;
  const drumN = cfg.drumCount | 0;

  function takeSpot(spots, minSep) {
    minSep = minSep == null ? 0.8 : minSep;
    while (spots.length) {
      const s = spots.shift();
      if (inDoorway(s.x, s.y, openSet)) continue;
      if (occupiedNear(entities, s.x, s.y, minSep)) continue;
      return s;
    }
    return null;
  }

  function occupantsInRoom(room) {
    return entities.filter((e) =>
      (e.type === "stand" || e.type === "hostage" || e.type === "threat" || e.type === "instructor")
      && roomContains(room, Math.floor(e.x), Math.floor(e.y))
    ).length;
  }

  function clutterInRoom(room) {
    return entities.filter((e) =>
      e.type !== "hanging" && roomContains(room, Math.floor(e.x), Math.floor(e.y))
    ).length;
  }

  function spaceBonus(p) {
    let minD = 8;
    for (const e of entities) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < minD) minD = d;
    }
    if (minD < 0.75) return -700;
    return Math.min(minD, 1.8) * 1.4;
  }

  function targetsInRoom(room) {
    return entities.filter((e) =>
      (e.type === "hanging" || e.type === "stand") && roomContains(room, Math.floor(e.x), Math.floor(e.y))
    ).length;
  }

  function placeHangingIn(room) {
    const ddir = doorDirForRoom(room);
    const edge = hangingOnOppositeWall(room, ddir);
    if (!edge || openSet.has(edge)) return false;
    const mid = edgeMid(edge);
    const n = inwardNormal(sideOfRoom(room, edge) || "N");
    const pose = hangingSnap(edge, mid.x + n.x * 0.4, mid.y + n.y * 0.4);
    if (inDoorway(pose.x, pose.y, openSet, 0.45)) return false;
    if (occupiedNear(entities, pose.x, pose.y, 0.7)) return false;
    placeEntity(entities, "hanging", pose.x, pose.y, pose.rot, { attached: pose.attached, side: pose.side });
    return true;
  }

  function scoreOffDoor(room, p, wantDist, blocking) {
    const doorMid = inboundMid(room);
    const f = flowOf(room);
    const ddir = (f && f.inSide) || doorDirForRoom(room);
    const n = inwardNormal(ddir);
    const tan = { x: -n.y, y: n.x };
    if (!doorMid) return rng();
    const dx = p.x - doorMid.x, dy = p.y - doorMid.y;
    const along = dx * tan.x + dy * tan.y;
    const depth = dx * n.x + dy * n.y;
    if (depth < 0.55) return -999;
    if (Math.abs(along) < blocking && depth < 1.15) return -999;
    const dist = Math.hypot(dx, dy);
    return -Math.abs(dist - wantDist) * 2 + Math.min(Math.abs(along), 1.3) * 0.9 + (depth > 0.7 && depth < 2.2 ? 0.4 : 0);
  }

  function placeStandIn(room) {
    if (occupantsInRoom(room) >= 2) return false;
    const spots = roomSpots(room, openSet, entities);
    spots.sort((a, b) =>
      (scoreOffDoor(room, b, bias.standDist, 0.35) + spaceBonus(b))
      - (scoreOffDoor(room, a, bias.standDist, 0.35) + spaceBonus(a))
    );
    const s = takeSpot(spots, 0.9);
    if (!s) return false;
    placeEntity(entities, "stand", s.x, s.y, rotToward(s, facePoint(room)));
    return true;
  }

  function placeDrumIn(room) {
    const spots = roomSpots(room, openSet, entities);
    spots.sort((a, b) =>
      (scoreOffDoor(room, b, bias.drumDist, 0.5) + spaceBonus(b))
      - (scoreOffDoor(room, a, bias.drumDist, 0.5) + spaceBonus(a))
    );
    const p = takeSpot(spots, 0.85);
    if (!p) return false;
    placeEntity(entities, "drum", p.x, p.y, 0);
    return true;
  }

  function spreadItems(types) {
    if (!types.length || !rooms.length) return;
    types.forEach((type) => {
      const prefer = rooms.slice().sort((a, b) => {
        if (type === "drum") {
          const drumsA = entities.filter((e) => e.type === "drum" && roomContains(a, Math.floor(e.x), Math.floor(e.y))).length;
          const drumsB = entities.filter((e) => e.type === "drum" && roomContains(b, Math.floor(e.x), Math.floor(e.y))).length;
          return drumsA - drumsB
            || occupantsInRoom(b) - occupantsInRoom(a)
            || clutterInRoom(a) - clutterInRoom(b);
        }
        return occupantsInRoom(a) - occupantsInRoom(b)
          || targetsInRoom(a) - targetsInRoom(b)
          || (a.dist || 0) - (b.dist || 0)
          || rng() - 0.5;
      });
      for (const room of prefer) {
        const ok = type === "hanging" ? placeHangingIn(room)
          : type === "stand" ? placeStandIn(room)
          : placeDrumIn(room);
        if (ok) break;
      }
    });
  }

  function peopleInRoom(room, type) {
    return entities.filter((e) => e.type === type && roomContains(room, Math.floor(e.x), Math.floor(e.y)));
  }

  function placePersonIn(room, type) {
    if (occupantsInRoom(room) >= 2 && peopleInRoom(room, type === "threat" ? "hostage" : "threat").length === 0) return false;
    const spots = roomSpots(room, openSet, entities);
    spots.sort((a, b) =>
      (scoreOffDoor(room, b, 1.15, 0.5) + spaceBonus(b))
      - (scoreOffDoor(room, a, 1.15, 0.5) + spaceBonus(a))
    );
    const s = takeSpot(spots, 0.85);
    if (!s) return false;
    placeEntity(entities, type, s.x, s.y, rotToward(s, facePoint(room)));
    return true;
  }

  function spreadPeople(type, n) {
    for (let i = 0; i < n; i++) {
      const prefer = rooms.slice().sort((a, b) =>
        occupantsInRoom(a) - occupantsInRoom(b)
        || peopleInRoom(a, type).length - peopleInRoom(b, type).length
        || (b.dist || 0) - (a.dist || 0)
        || rng() - 0.5
      );
      for (const room of prefer) {
        if (placePersonIn(room, type)) break;
      }
    }
  }

  spreadPeople("hostage", cfg.hostageCount | 0);
  spreadPeople("threat", cfg.threatCount | 0);

  const targetTypes = [];
  for (let i = 0; i < hangingN; i++) targetTypes.push("hanging");
  for (let i = 0; i < standN; i++) targetTypes.push("stand");
  targetTypes.sort(() => rng() - 0.5);
  const drumTypes = [];
  for (let i = 0; i < drumN; i++) drumTypes.push("drum");
  spreadItems(targetTypes);
  spreadItems(drumTypes);

  if (cfg.hostageScenario !== false && (cfg.hostageCount | 0) > 0 && (cfg.threatCount | 0) > 0) {
    const paired = rooms.some((r) => peopleInRoom(r, "hostage").length && peopleInRoom(r, "threat").length);
    if (!paired) {
      const nc = entities.find((e) => e.type === "hostage");
      const ec = entities.find((e) => e.type === "threat");
      const room = rooms.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0))[0] || deepRoom;
      if (nc && ec && room) {
        const spots = roomSpots(room, openSet, entities.filter((e) => e !== nc && e !== ec));
        const s = takeSpot(spots.slice()) || { x: room.x + room.w / 2, y: room.y + room.h / 2 };
        nc.x = s.x; nc.y = s.y;
        ec.x = s.x; ec.y = s.y;
      }
    }
  }

  function holdPairInRoom(room) {
    const ncs = peopleInRoom(room, "hostage");
    const ecs = peopleInRoom(room, "threat");
    if (!ncs.length || !ecs.length) return;
    const door = facePoint(room);
    const n = Math.min(ncs.length, ecs.length);
    for (let i = 0; i < n; i++) {
      const nc = ncs[i], ec = ecs[i];
      const spots = roomSpots(room, openSet, entities.filter((e) => e !== nc && e !== ec));
      spots.sort((a, b) => scoreOffDoor(room, b, 1.2, 0.5) - scoreOffDoor(room, a, 1.2, 0.5));
      const base = takeSpot(spots.slice()) || { x: nc.x, y: nc.y };
      let fx = 0, fy = -1;
      if (door) {
        const len = Math.hypot(door.x - base.x, door.y - base.y) || 1;
        fx = (door.x - base.x) / len;
        fy = (door.y - base.y) / len;
      }
      nc.x = base.x + fx * 0.14;
      nc.y = base.y + fy * 0.14;
      nc.rot = rotToward(nc, door);
      ec.x = base.x - fx * 0.2;
      ec.y = base.y - fy * 0.2;
      ec.rot = rotToward(ec, door);
    }
  }

  rooms.forEach(holdPairInRoom);

  nudgeOutOfDoorways(entities, openSet, cols, rows);
  rooms.forEach(holdPairInRoom);

  function snapIntoHouse(e) {
    if (e.type === "hanging") {
      if (e.attached && walls[e.attached]) return true;
      return false;
    }
    const others = entities.filter((o) => o !== e);
    const free = (x, y) => !occupiedNear(others, x, y, 0.45);
    if (rooms.some((r) => roomContains(r, Math.floor(e.x), Math.floor(e.y))) && free(e.x, e.y)) return true;
    let best = null, bestD = 1e9;
    for (const r of rooms) {
      for (const c of roomCells(r)) {
        const x = c.x + 0.45, y = c.y + 0.45;
        if (!free(x, y)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (!best) return false;
    e.x = best.x;
    e.y = best.y;
    return true;
  }

  return entities.filter(snapIntoHouse);
}

function shuffleProps(state, cfg) {
  const seed = (Math.random() * 1e9) | 0;
  const rng = mulberry32(seed);
  const rooms = detectRooms(state.walls, state.cols, state.rows, state.openings || []);
  rooms.forEach((r) => { r.cells = r.cells || roomCells(r); });
  const entryCuts = (state.entry && state.entry.edges) || [];
  const entrySide = (state.entry && state.entry.side) || "S";
  const entryRoom = rooms.find((r) =>
    entryCuts.some((k) => cellsTouchingEdge(k, state.cols, state.rows).some((c) => roomContains(r, c.x, c.y)))
  ) || rooms[0];
  const locked = (state.entities || []).filter((e) => e.locked);
  const entities = placeAllProps({
    cfg,
    rooms,
    walls: state.walls,
    openings: state.openings || [],
    entryCuts,
    entrySide,
    connections: state.connections || [],
    cols: state.cols,
    rows: state.rows,
    rng,
    entryRoom,
    deepRoom: rooms.slice().sort((a, b) => (b.area || 0) - (a.area || 0))[0] || rooms[0],
  });
  if (locked.length) {
    const skip = new Set(locked.map((l) => l.type));
    const kept = entities.filter((e) => !skip.has(e.type));
    locked.forEach((e) => kept.push({ ...e }));
    return {
      ...state,
      seed,
      entities: kept,
    };
  }
  return {
    ...state,
    seed,
    entities,
  };
}

function junctionTypes(walls, cols, rows) {
  const nodes = new Map();
  const add = (x, y, dir) => {
    const k = `${x},${y}`;
    if (!nodes.has(k)) nodes.set(k, { x, y, dirs: new Set() });
    nodes.get(k).dirs.add(dir);
  };
  for (const key of Object.keys(walls)) {
    const p = edgeEndpoints(key);
    if (parseEdge(key).kind === "h") {
      add(p.x1, p.y1, "E"); add(p.x2, p.y2, "W");
    } else {
      add(p.x1, p.y1, "S"); add(p.x2, p.y2, "N");
    }
  }
  const counts = { end: 0, I: 0, L: 0, T: 0, X: 0, unused: 0 };
  for (const n of nodes.values()) {
    const d = n.dirs.size;
    if (d === 1) counts.end++;
    else if (d === 2) {
      const arr = [...n.dirs];
      const opp = (arr[0] === opposite(arr[1]));
      if (opp) counts.I++; else counts.L++;
    } else if (d === 3) counts.T++;
    else if (d >= 4) counts.X++;
  }
  return { counts, nodes };
}

function wallCount(walls) {
  return Object.keys(walls || {}).length;
}
