#!/usr/bin/env node
// draw.mjs <spec.mjs> <output-prefix>
// Hand-laid-out diagrams -> <prefix>.excalidraw, <prefix>.svg, <prefix>.png
// PNG needs the `sharp` package. Point SHARP_FROM at any package.json whose node_modules has it (see README.md);
// without it the .excalidraw and .svg are still written.
// Clean look: sans-serif font (Excalidraw fontFamily 2), roughness 0, arrows routed at right angles and bound to boxes.

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomInt } from "node:crypto";

const SHARP_FROM = process.env.SHARP_FROM || new URL("./package.json", import.meta.url).pathname;

const PALETTE = {
  blue: { bg: "#d0ebff", stroke: "#1971c2" },
  green: { bg: "#d3f9d8", stroke: "#2f9e44" },
  orange: { bg: "#ffe8cc", stroke: "#e8590c" },
  red: { bg: "#ffe3e3", stroke: "#e03131" },
  purple: { bg: "#e5dbff", stroke: "#7048e8" },
  yellow: { bg: "#fff3bf", stroke: "#f08c00" },
  gray: { bg: "#f1f3f5", stroke: "#495057" },
  white: { bg: "#ffffff", stroke: "#495057" },
};
const INK = "#1e1e1e";
const ARROW = "#343a40";
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const LH = 1.25;
const PAD = 16;

const [specPath, outPrefix] = process.argv.slice(2);
if (!specPath || !outPrefix) {
  console.error("Usage: node draw.mjs <spec.mjs> <output-prefix>");
  process.exit(1);
}
const spec = (await import(pathToFileURL(specPath).href)).default;

const nodes = new Map(spec.nodes.map((n) => [n.id, n]));
const seed = () => randomInt(1, 2147483647);
const base = (type, id, x, y, w, h, extra) => ({
  id, type, x, y, width: w, height: h, angle: 0,
  strokeColor: INK, backgroundColor: "transparent", fillStyle: "solid",
  strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
  seed: seed(), version: 1, versionNonce: seed(), isDeleted: false,
  groupIds: [], frameId: null, roundness: null, boundElements: [],
  updated: Date.now(), link: null, locked: false, ...extra,
});
const textEl = (id, text, x, y, w, size, color, align, groupIds, bg = "transparent") =>
  base("text", id, x, y, w, text.split("\n").length * size * LH, {
    strokeColor: color, backgroundColor: bg, strokeWidth: 1,
    text, originalText: text, fontSize: size, fontFamily: 2, textAlign: align,
    verticalAlign: "top", containerId: null, autoResize: true, lineHeight: LH, groupIds,
  });

const textW = (s, size) => Math.max(...s.split("\n").map((l) => l.length)) * size * 0.56;

// ---- anchors and routing ----
function anchor(n, side, off = 0) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  if (side === "L") return [n.x, cy + off];
  if (side === "R") return [n.x + n.w, cy + off];
  if (side === "T") return [cx + off, n.y];
  return [cx + off, n.y + n.h];
}
const horiz = (s) => s === "L" || s === "R";
function route(e, a, b) {
  const fs = e.fs, ts = e.ts;
  if (e.via) return [a, ...e.via, b];
  if (horiz(fs) && horiz(ts)) {
    if (Math.abs(a[1] - b[1]) < 0.5) return [a, b];
    const mx = e.mid ?? (a[0] + b[0]) / 2;
    return [a, [mx, a[1]], [mx, b[1]], b];
  }
  if (!horiz(fs) && !horiz(ts)) {
    if (Math.abs(a[0] - b[0]) < 0.5) return [a, b];
    const my = e.mid ?? (a[1] + b[1]) / 2;
    return [a, [a[0], my], [b[0], my], b];
  }
  return horiz(fs) ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b];
}
function labelPos(pts, label, size) {
  let best = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
    if (len > best) { best = len; bi = i; }
  }
  const [p, q] = [pts[bi], pts[bi + 1]];
  const w = textW(label, size) + 10, h = size * LH + 4;
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  if (Math.abs(p[1] - q[1]) < 0.5) return { x: mx - w / 2, y: my - h - 3, w, h }; // above a horizontal run
  return { x: mx + 8, y: my - h / 2, w, h }; // right of a vertical run
}

const els = [];
const svg = { rects: [], texts: [], arrows: [], labels: [] };
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const grow = (x, y, w = 0, h = 0) => {
  minX = Math.min(minX, x); minY = Math.min(minY, y);
  maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
};

// ---- nodes ----
const arrowsOf = new Map();
spec.edges.forEach((e, i) => {
  e.id = `arrow-${i}`;
  for (const k of [e.from, e.to]) arrowsOf.set(k, [...(arrowsOf.get(k) || []), e.id]);
});
for (const n of spec.nodes) {
  const c = PALETTE[n.color || "gray"];
  const gid = `g-${n.id}`;
  const tSize = n.titleSize || 18, lSize = n.size || 14;
  const lines = n.lines || [];
  const align = n.align || "left";
  const titleH = tSize * LH, bodyH = lines.length * lSize * LH;
  const gap = lines.length ? 8 : 0;
  const total = titleH + gap + bodyH;
  const top = align === "center" || n.valign === "middle" ? n.y + (n.h - total) / 2 : n.y + 14;
  const tx = align === "center" ? n.x : n.x + PAD, tw = align === "center" ? n.w : n.w - PAD * 2;
  const rect = base(n.shape === "diamond" ? "diamond" : "rectangle", `rect-${n.id}`, n.x, n.y, n.w, n.h, {
    strokeColor: c.stroke, backgroundColor: c.bg, groupIds: [gid],
    roundness: n.shape === "diamond" ? { type: 2 } : { type: 3 },
    boundElements: (arrowsOf.get(n.id) || []).map((id) => ({ id, type: "arrow" })),
  });
  els.push(rect);
  els.push(textEl(`title-${n.id}`, n.title, tx, top, tw, tSize, INK, align, [gid]));
  svg.rects.push({ n, c });
  svg.texts.push({ x: tx, y: top, w: tw, text: n.title, size: tSize, align, fill: INK });
  if (lines.length) {
    const ly = top + titleH + gap;
    els.push(textEl(`body-${n.id}`, lines.join("\n"), tx, ly, tw, lSize, INK, align, [gid]));
    svg.texts.push({ x: tx, y: ly, w: tw, text: lines.join("\n"), size: lSize, align, fill: "#495057" });
  }
  grow(n.x, n.y, n.w, n.h);
}

// ---- free text ----
for (const [i, t] of (spec.texts || []).entries()) {
  const size = t.size || 16, w = t.w || textW(t.text, size) + 4;
  els.push(textEl(`free-${i}`, t.text, t.x, t.y, w, size, t.color || INK, t.align || "left", []));
  svg.texts.push({ x: t.x, y: t.y, w, text: t.text, size, align: t.align || "left", fill: t.color || INK });
  grow(t.x, t.y, w, t.text.split("\n").length * size * LH);
}

// ---- arrows ----
for (const e of spec.edges) {
  const from = nodes.get(e.from), to = nodes.get(e.to);
  if (!from || !to) throw new Error(`edge ${e.from} -> ${e.to}: unknown node`);
  const a = anchor(from, e.fs, e.o1 || 0), b = anchor(to, e.ts, e.o2 || 0);
  const pts = route(e, a, b);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const dashed = !!e.dashed;
  els.push(base("arrow", e.id, a[0], a[1], Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
    strokeColor: ARROW, strokeStyle: dashed ? "dashed" : "solid", roundness: null,
    points: pts.map((p) => [p[0] - a[0], p[1] - a[1]]), lastCommittedPoint: null, elbowed: false,
    startBinding: { elementId: `rect-${e.from}`, focus: 0, gap: 1 },
    endBinding: { elementId: `rect-${e.to}`, focus: 0, gap: 1 },
    startArrowhead: e.bidir ? "arrow" : null, endArrowhead: "arrow",
  }));
  svg.arrows.push({ pts, dashed, bidir: !!e.bidir });
  pts.forEach((p) => grow(p[0], p[1]));
  if (e.label) {
    const size = 12;
    const lp = e.labelAt ? { ...e.labelAt, w: textW(e.label, size) + 10, h: size * LH + 4 } : labelPos(pts, e.label, size);
    els.push(textEl(`label-${e.id}`, e.label, lp.x + 5, lp.y + 2, lp.w - 10, size, "#495057", "center", [], "#ffffff"));
    svg.labels.push({ ...lp, text: e.label, size });
    grow(lp.x, lp.y, lp.w, lp.h);
  }
}

writeFileSync(`${outPrefix}.excalidraw`, JSON.stringify({
  type: "excalidraw", version: 2, source: "scorepulse-draw",
  elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {},
}, null, 2));

// ---- SVG ----
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const M = 40;
const vx = minX - M, vy = minY - M, vw = maxX - minX + M * 2, vh = maxY - minY + M * 2;
const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" font-family="${FONT}">`,
  `<defs><marker id="ah" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4 L0,8 z" fill="${ARROW}"/></marker>` +
  `<marker id="ahs" markerWidth="9" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4 L0,8 z" fill="${ARROW}"/></marker></defs>`,
  `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>`];
for (const { n, c } of svg.rects) {
  if (n.shape === "diamond") {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    out.push(`<polygon points="${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}" fill="${c.bg}" stroke="${c.stroke}" stroke-width="2" stroke-linejoin="round"/>`);
  } else {
    out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${c.bg}" stroke="${c.stroke}" stroke-width="2"/>`);
  }
}
for (const a of svg.arrows) {
  out.push(`<polyline points="${a.pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${ARROW}" stroke-width="2" stroke-linejoin="round"${a.dashed ? ' stroke-dasharray="7 5"' : ""} marker-end="url(#ah)"${a.bidir ? ' marker-start="url(#ahs)"' : ""}/>`);
}
for (const l of svg.labels) {
  out.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="#ffffff"/>`);
  out.push(`<text x="${l.x + l.w / 2}" y="${l.y + l.h / 2 + l.size * 0.35}" font-size="${l.size}" fill="#495057" text-anchor="middle">${esc(l.text)}</text>`);
}
for (const t of svg.texts) {
  const ax = t.align === "center" ? t.x + t.w / 2 : t.x, anchorName = t.align === "center" ? "middle" : "start";
  const lh = t.size * LH;
  const spans = t.text.split("\n").map((line, i) => `<tspan x="${ax}" dy="${i === 0 ? 0 : lh}">${esc(line) || "&#160;"}</tspan>`).join("");
  out.push(`<text x="${ax}" y="${t.y + t.size * 0.95}" font-size="${t.size}" fill="${t.fill}" text-anchor="${anchorName}">${spans}</text>`);
}
out.push("</svg>");
writeFileSync(`${outPrefix}.svg`, out.join("\n"));

// ---- PNG ----
try {
  const sharp = createRequire(SHARP_FROM)("sharp");
  await sharp(Buffer.from(out.join("\n")), { density: 192 }).png().toFile(`${outPrefix}.png`);
  console.log(`wrote ${outPrefix}.{excalidraw,svg,png}  (${Math.round(vw)}x${Math.round(vh)})`);
} catch (err) {
  console.warn(`PNG skipped (sharp not found; set SHARP_FROM): ${err.message}`);
  console.log(`wrote ${outPrefix}.{excalidraw,svg}`);
}
