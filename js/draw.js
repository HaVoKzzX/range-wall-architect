/* Shared floor drawing used by the live view and the print/PDF sheet. */

const FloorView = (() => {
  function gridOffset(state) {
    const cellFt = ARW.PANEL_W_IN / 12;
    const spaceC = state.widthFt / cellFt;
    const spaceR = state.heightFt / cellFt;
    const sx = state.gridShiftX == null ? 0.5 : state.gridShiftX;
    const sy = state.gridShiftY == null ? 0.5 : state.gridShiftY;
    return {
      ox: Math.max(0, spaceC - state.cols) * sx,
      oy: Math.max(0, spaceR - state.rows) * sy,
      spaceC, spaceR, cellFt,
    };
  }

  function drawBackdrop(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#14181c");
    g.addColorStop(1, "#0b0e11");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function palette(theme) {
    if (theme === "print") {
      return {
        space: "#f4efe6",
        spaceTint: "transparent",
        spaceStroke: "#3d3428",
        spaceInner: "#b7aa94",
        floor: "#e7dfd0",
        floorAlt: "rgba(90,70,40,0.05)",
        floorStroke: "rgba(138,90,18,0.45)",
        grid: "rgba(107,75,46,0.2)",
      };
    }
    return {
      space: "#1a1f24",
      spaceTint: "rgba(232,168,56,0.04)",
      spaceStroke: "#c4cdd4",
      spaceInner: "#6b7580",
      floor: "#2a3036",
      floorAlt: "rgba(255,255,255,0.03)",
      floorStroke: "rgba(232,168,56,0.55)",
      grid: "rgba(196,160,106,0.18)",
    };
  }

  function drawSpace(ctx, g, zoom, theme) {
    const p = palette(theme);
    ctx.fillStyle = p.space;
    ctx.fillRect(0, 0, g.spaceC, g.spaceR);
    if (p.spaceTint !== "transparent") {
      ctx.fillStyle = p.spaceTint;
      ctx.fillRect(0, 0, g.spaceC, g.spaceR);
    }
    ctx.strokeStyle = p.spaceStroke;
    ctx.lineWidth = 5 / zoom;
    ctx.strokeRect(0, 0, g.spaceC, g.spaceR);
    ctx.strokeStyle = p.spaceInner;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(3 / zoom, 3 / zoom, g.spaceC - 6 / zoom, g.spaceR - 6 / zoom);
  }

  function drawFloor(ctx, state, zoom, theme) {
    const p = palette(theme);
    const w = state.cols, h = state.rows;
    ctx.fillStyle = p.floor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.floorAlt;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = p.floorStroke;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([0.12, 0.1]);
    ctx.strokeRect(0, 0, w, h);
    ctx.setLineDash([]);
  }

  function drawGrid(ctx, state, zoom, theme) {
    const p = palette(theme);
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = 0; x <= state.cols; x++) {
      ctx.moveTo(x, 0); ctx.lineTo(x, state.rows);
    }
    for (let y = 0; y <= state.rows; y++) {
      ctx.moveTo(0, y); ctx.lineTo(state.cols, y);
    }
    ctx.stroke();
  }

  function drawWalls(ctx, state, zoom, extras) {
    const t = ARW.PANEL_T_IN / ARW.PANEL_W_IN;
    const shown = extras.wallKeys || new Set(Object.keys(state.walls || {}));
    const keys = Object.keys(state.walls || {}).filter((k) => shown.has(k));
    const selected = extras.selected;
    const { nodes } = junctionTypes(state.walls, state.cols, state.rows);

    for (const key of keys) {
      const p = edgeEndpoints(key);
      const sel = selected && selected.kind === "wall" && selected.key === key;
      ctx.save();
      ctx.strokeStyle = sel ? "#f3d39a" : "#c4a06a";
      ctx.lineWidth = t;
      ctx.lineCap = "butt";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 6 / zoom;
      ctx.shadowOffsetY = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(90,60,30,0.35)";
      ctx.lineWidth = t * 0.15;
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * t * 0.18, ny = dx / len * t * 0.18;
      for (let i = 1; i <= 4; i++) {
        const f = i / 5;
        ctx.beginPath();
        ctx.moveTo(p.x1 + dx * f - nx, p.y1 + dy * f - ny);
        ctx.lineTo(p.x1 + dx * f + nx, p.y1 + dy * f + ny);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const n of nodes.values()) {
      if (!shown.size) continue;
      ctx.fillStyle = "#6b4b2e";
      ctx.strokeStyle = "#3e2b18";
      ctx.lineWidth = 1 / zoom;
      const s = t * 1.15;
      ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s);
      ctx.strokeRect(n.x - s / 2, n.y - s / 2, s, s);
    }
  }

  function drawOpenings(ctx, state, zoom, extras) {
    const t = ARW.PANEL_T_IN / ARW.PANEL_W_IN;
    const main = new Set((state.entry && state.entry.edges) || []);
    const selected = extras.selected;
    for (const key of state.openings || []) {
      if (state.walls[key]) continue;
      const p = edgeEndpoints(key);
      const mid = edgeMid(key);
      const sel = selected && selected.kind === "entry" && selected.key === key;
      const isMain = main.has(key);
      ctx.save();
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      ctx.fillStyle = sel ? "rgba(61,186,124,0.28)" : "rgba(61,186,124,0.12)";
      ctx.beginPath();
      ctx.moveTo(p.x1 + nx * 0.18, p.y1 + ny * 0.18);
      ctx.lineTo(p.x2 + nx * 0.18, p.y2 + ny * 0.18);
      ctx.lineTo(p.x2 - nx * 0.18, p.y2 - ny * 0.18);
      ctx.lineTo(p.x1 - nx * 0.18, p.y1 - ny * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = sel ? "#8af0b8" : "#3dba7c";
      ctx.lineWidth = (sel ? 3 : 2) / zoom;
      ctx.setLineDash([0.1, 0.08]);
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#6b4b2e";
      const js = t * 1.15;
      ctx.fillRect(p.x1 - js / 2, p.y1 - js / 2, js, js);
      ctx.fillRect(p.x2 - js / 2, p.y2 - js / 2, js, js);
      if (isMain) {
        ctx.fillStyle = "#3dba7c";
        ctx.font = `${10 / zoom}px Barlow Condensed`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("ENTRY", mid.x + nx * 0.22, mid.y + ny * 0.22);
      }
      ctx.restore();
    }
  }

  function drawEntity(ctx, e, zoom, extras) {
    const meta = ENTITY_META[e.type] || { color: "#fff", r: 0.2 };
    const r = meta.r;
    const selected = extras.selected;
    const hover = extras.hover;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.rot || 0) * Math.PI / 180);
    const sel = extras.interactive && selected && selected.kind === "entity" && selected.id === e.id;
    const hovered = extras.interactive && hover && hover.kind === "entity" && hover.id === e.id;
    if (sel || hovered) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 0.1, 0, Math.PI * 2);
      ctx.strokeStyle = sel ? "#e8a838" : "rgba(232,168,56,0.7)";
      ctx.lineWidth = (sel ? 3 : 2) / zoom;
      ctx.setLineDash(sel ? [] : [0.06, 0.05]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.type === "drum") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#1e5a96";
      ctx.fill();
      ctx.strokeStyle = "#0f3358";
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(180,210,240,0.45)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = "#0f3358";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.28, r * 0.22, r * 0.1, 0, Math.PI * 2);
      ctx.arc(r * 0.28, r * 0.22, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = "#163f6a";
      ctx.fill();
    } else if (e.type === "hanging") {
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(-0.28, -0.11, 0.56, 0.13);
      ctx.strokeStyle = "#6b5010";
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(-0.28, -0.11, 0.56, 0.13);
      ctx.fillStyle = "#e8d44d";
      ctx.fillRect(-0.18, -0.08, 0.36, 0.07);
    } else if (e.type === "stand") {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = "#3a3a3a";
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "#6a6a6a";
      ctx.fill();
      ctx.strokeStyle = "#e0b43a";
      ctx.lineWidth = 4 / zoom;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 0.15);
      ctx.lineTo(r * 0.55, -r * 0.15);
      ctx.stroke();
    } else {
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.12, r * 0.72, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -r * 0.28, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.28, -r * 0.42);
      ctx.lineTo(-r * 0.28, -r * 0.42);
      ctx.closePath();
      ctx.fill();
      if (e.type === "threat") {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 3 / zoom;
        ctx.beginPath();
        ctx.moveTo(r * 0.45, 0);
        ctx.lineTo(r * 1.05, -r * 0.4);
        ctx.stroke();
      }
      if (e.type === "hostage") {
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, r * 0.2);
        ctx.lineTo(r * 0.4, r * 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWorld(ctx, state, extras) {
    extras = extras || {};
    const zoom = extras.zoom || 64;
    const theme = extras.theme || "screen";
    const g = gridOffset(state);
    drawSpace(ctx, g, zoom, theme);
    ctx.save();
    ctx.translate(g.ox, g.oy);
    drawFloor(ctx, state, zoom, theme);
    if (extras.showGrid !== false) drawGrid(ctx, state, zoom, theme);
    drawOpenings(ctx, state, zoom, extras);
    drawWalls(ctx, state, zoom, extras);
    for (const e of state.entities || []) drawEntity(ctx, e, zoom, extras);
    ctx.restore();
  }

  function cameraForRect(state, rect, pad) {
    pad = pad == null ? 24 : pad;
    const g = gridOffset(state);
    const zx = (rect.w - pad * 2) / Math.max(1, g.spaceC);
    const zy = (rect.h - pad * 2) / Math.max(1, g.spaceR);
    const zoom = Math.max(8, Math.min(zx, zy));
    return {
      zoom,
      x: rect.x + (rect.w - g.spaceC * zoom) / 2,
      y: rect.y + (rect.h - g.spaceR * zoom) / 2,
      g,
    };
  }

  function drawCompass(ctx, px, py) {
    ctx.save();
    ctx.fillStyle = "rgba(12,16,18,0.85)";
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8a838";
    ctx.beginPath();
    ctx.moveTo(px, py - 16); ctx.lineTo(px + 6, py + 2); ctx.lineTo(px - 6, py + 2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8b97a3";
    ctx.font = "11px IBM Plex Sans";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("N", px, py + 18);
    ctx.restore();
  }

  function drawScale(ctx, x, y, zoom) {
    ctx.save();
    ctx.fillStyle = "rgba(12,16,18,0.85)";
    ctx.fillRect(x, y, zoom + 24, 28);
    ctx.strokeStyle = "#c4a06a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 18);
    ctx.lineTo(x + 8 + zoom, y + 18);
    ctx.moveTo(x + 8, y + 12);
    ctx.lineTo(x + 8, y + 24);
    ctx.moveTo(x + 8 + zoom, y + 12);
    ctx.lineTo(x + 8 + zoom, y + 24);
    ctx.stroke();
    ctx.fillStyle = "#c4a06a";
    ctx.font = "11px IBM Plex Mono";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("54¼″  ·  1 panel", x + 8, y + 12);
    ctx.restore();
  }

  function drawInRect(ctx, state, rect, extras) {
    extras = extras || {};
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.translate(rect.x, rect.y);
    if (extras.theme === "print") {
      ctx.fillStyle = "#f7f2e8";
      ctx.fillRect(0, 0, rect.w, rect.h);
    } else {
      drawBackdrop(ctx, rect.w, rect.h);
    }
    const cam = cameraForRect(state, { x: 0, y: 0, w: rect.w, h: rect.h }, extras.pad);
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);
    drawWorld(ctx, state, { ...extras, zoom: cam.zoom });
    ctx.restore();
    if (extras.chrome !== false) {
      drawCompass(ctx, rect.w - 48, 40);
      drawScale(ctx, 16, rect.h - 44, cam.zoom);
    }
    ctx.restore();
    return cam;
  }

  return { gridOffset, drawWorld, drawBackdrop, drawCompass, drawScale, drawInRect, drawEntity, cameraForRect };
})();
