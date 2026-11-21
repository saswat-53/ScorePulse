---
title: Diagram generator
date: 2026-11-21
tags: [diagram, tooling]
---

# Diagram generator

`draw.mjs` turns a hand-written layout (a "spec") into three files: an editable `.excalidraw`, an `.svg` and a `.png`. It exists because the stock Excalidraw plugin generator draws in a hand-written font and routes arrows straight through boxes. This one uses a plain sans-serif font, square-cornered rounded boxes, and arrows that attach to a box edge and turn at right angles.

## Run it

From `docs/diagrams/`:

```
node tools/draw.mjs tools/specs/02-request-path.mjs 02-request-path
```

The first argument is the spec, the second is the output name without an extension. The `.excalidraw` and `.svg` need nothing installed. The `.png` needs the `sharp` package: either run `npm install sharp` in this folder, or point `SHARP_FROM` at a `package.json` whose `node_modules` already has it:

```
SHARP_FROM=/path/to/some/package.json node tools/draw.mjs ...
```

Without `sharp` the script still writes the other two files and says the PNG was skipped.

## Write a spec

A spec is a JavaScript module whose default export has `nodes`, `edges` and `texts`. Positions are in pixels and you place everything yourself, which is what keeps the arrows clean. Copy [specs/02-request-path.mjs](specs/02-request-path.mjs) and change it.

- **Node:** `{ id, x, y, w, h, color, title, lines }`. Colours: `blue green orange red purple yellow gray`. Optional: `align: "center"`, `shape: "diamond"`, `size`, `titleSize`.
- **Edge:** `{ from, to, fs, ts, label }`. `fs` and `ts` are the side the arrow leaves and enters: `L R T B`. `o1` and `o2` slide the start and end along that side in pixels, so two arrows between the same boxes do not overlap. `dashed: true` draws a dashed arrow. `mid` moves the bend. `via: [[x, y], ...]` gives your own corners. `labelAt: { x, y }` moves the label.
- **Text:** `{ x, y, text, size, color }` for headings and legends.

Two arrows that leave opposite sides at the same height come out as one straight line. If an arrow ends at the same height it starts, give both ends the same absolute y (see how `01-database.mjs` computes row offsets).

Related: [diagrams index](../INDEX.md)
