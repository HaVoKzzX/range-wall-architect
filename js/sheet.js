/* One-page light field sheet + PDF. Item icons match the live floor view. */

const LayoutSheet = (() => {
  const PAGE_W = 11;
  const PAGE_H = 8.5;
  const DPI = 240;
  const PT = DPI / 72;

  const INK = "#1c1914";
  const MUTED = "#5c564c";
  const RULE = "#c4b8a4";
  const RULE_DK = "#3d3428";
  const PAPER = "#f7f2e8";
  const PANEL = "#fffdf8";
  const ACCENT = "#8a5a12";

  function packingList(state) {
    const used = wallCount(state.walls);
    return {
      walls: used,
      requestedW: state.widthFt,
      requestedH: state.heightFt,
      name: state.name || "UNASSIGNED",
    };
  }

  function today() {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function render(canvas, state) {
    const W = Math.round(PAGE_W * DPI);
    const H = Math.round(PAGE_H * DPI);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const pack = packingList(state);

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = RULE_DK;
    ctx.lineWidth = 1.1 * PT;
    ctx.strokeRect(10 * PT, 10 * PT, W - 20 * PT, H - 20 * PT);
    ctx.lineWidth = 0.4 * PT;
    ctx.strokeRect(13 * PT, 13 * PT, W - 26 * PT, H - 26 * PT);

    const m = 24 * PT;
    const headerH = 40 * PT;
    const headerY = 22 * PT;
    ctx.fillStyle = "#2a241c";
    ctx.fillRect(m, headerY, W - m * 2, headerH);
    const logo = document.getElementById("brandLogo");
    let nameX = m + 14 * PT;
    if (logo && logo.naturalWidth) {
      const logoH = 30 * PT;
      const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
      ctx.drawImage(logo, m + 8 * PT, headerY + (headerH - logoH) / 2, logoW, logoH);
      nameX = m + 8 * PT + logoW + 10 * PT;
    }
    ctx.fillStyle = "#f3e6c8";
    ctx.font = `800 ${16 * PT}px Barlow Condensed, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText((pack.name || "UNASSIGNED").toUpperCase(), nameX, headerY + headerH / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e8a838";
    ctx.font = `800 ${18 * PT}px Barlow Condensed, sans-serif`;
    ctx.fillText(String(pack.walls) + " WALLS", W - m - 14 * PT, headerY + headerH / 2);

    const legendH = 86 * PT;
    const planX = m;
    const planY = headerY + headerH + 10 * PT;
    const planW = W - m * 2;
    const planH = H - planY - legendH - 20 * PT;

    roundRect(ctx, planX, planY, planW, planH, 4 * PT);
    ctx.save();
    ctx.clip();
    FloorView.drawInRect(ctx, state, {
      x: planX, y: planY, w: planW, h: planH,
    }, { showGrid: true, interactive: false, pad: 22, theme: "print", chrome: false });
    ctx.restore();
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 0.7 * PT;
    roundRect(ctx, planX, planY, planW, planH, 4 * PT);
    ctx.stroke();

    const key = [
      ["hanging", "Hanging target"],
      ["stand", "Target stand"],
      ["drum", "55-gal drum"],
      ["instructor", "Instructor"],
      ["hostage", "Non-combatant"],
      ["threat", "Enemy combatant"],
    ];
    const keyY = planY + planH + 32 * PT;
    const slot = planW / key.length;
    const iconScale = 116;
    key.forEach(([kind, label], i) => {
      const cx = planX + slot * i + slot / 2;
      ctx.save();
      ctx.translate(cx, keyY);
      ctx.scale(iconScale, iconScale);
      FloorView.drawEntity(ctx, { type: kind, x: 0, y: 0, rot: 0 }, iconScale, {});
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.font = `600 ${10 * PT}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, cx, keyY + 28 * PT);
    });

    ctx.fillStyle = MUTED;
    ctx.font = `500 ${7.5 * PT}px IBM Plex Sans, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText("© 2026 Centurion Invictus LLC. All rights reserved.", m, H - 16 * PT);
    ctx.textAlign = "right";
    ctx.fillText("www.centurioninvictus.com", W - m, H - 16 * PT);

    return pack;
  }

  function downloadPdf(canvas, name) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const jpeg = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const pageW = 792;
    const pageH = 612;
    const enc = new TextEncoder();
    const parts = [];
    let pos = 0;
    function pushStr(s) {
      const b = enc.encode(s);
      parts.push(b);
      pos += b.length;
    }
    function pushBytes(b) {
      parts.push(b);
      pos += b.length;
    }
    const offsets = [];
    pushStr("%PDF-1.4\n");
    offsets[1] = pos;
    pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets[2] = pos;
    pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    offsets[3] = pos;
    pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
    offsets[4] = pos;
    pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    pushBytes(jpeg);
    pushStr("\nendstream\nendobj\n");
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
    offsets[5] = pos;
    pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
    const xrefPos = pos;
    pushStr("xref\n0 6\n0000000000 65535 f \n");
    for (let i = 1; i <= 5; i++) {
      pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    const title = (name || "Shoot House Layout").replace(/[()\\]/g, "");
    pushStr(`trailer\n<< /Size 6 /Root 1 0 R /Info << /Title (${title}) /Author (Centurion Invictus LLC) /Creator (Range Wall Architect) /Producer (Centurion Invictus LLC) >> >>\nstartxref\n${xrefPos}\n%%EOF`);
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    const blob = new Blob([out], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || "layout").toLowerCase().replace(/\s+/g, "-")}-layout.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  return { render, downloadPdf, packingList };
})();
