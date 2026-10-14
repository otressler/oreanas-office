#!/usr/bin/env python3
"""Render a battle map layout as a colour-coded guide image for an image edit.

Standard library only. Input is either a battle map JSON document
(width, height, layout.cells / features / entrances, see
knowledge/domain/battle-map.md) or an ASCII grid, one character per cell:

    .  floor        ,  difficult      ~  water
    #  wall         (space or _)  void

Features in ASCII come from repeated --feature "kind:x,y,w,h[:label]" flags.

The image is exactly width*cell x height*cell pixels with cell a multiple of
16, so the model can be asked for that exact size and the result lines up
with the grid without cropping. Prints JSON with the size to request, the
cell size and a legend to paste into the prompt.

    python render_guide.py map.json --out guide.png
    python render_guide.py layout.txt --feature "bridge:5,3,3,1:rope bridge" --out guide.png
"""
import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

MAX_EDGE = 3840
MAX_RATIO = 3.0
MIN_PIXELS = 655_360    # model rejects smaller images
MAX_PIXELS = 8_294_400  # 3840x2160

TERRAIN = {
    "floor": ((150, 150, 150), "grey", "walkable ground (floor, path, earth, flagstones as fits the scene)"),
    "difficult": ((170, 150, 60), "ochre", "difficult terrain (rubble, undergrowth, mud, shallow scree)"),
    "water": ((40, 90, 200), "blue", "water"),
    "wall": ((0, 0, 0), "black", "solid walls or impassable rock"),
    "void": ((90, 40, 110), "dark purple", "outside the play area, where nobody can stand: scenery that fits (cliff drop, solid bedrock, darkness, dense forest), never open water or walkable floor"),
}
ASCII = {".": "floor", ",": "difficult", "~": "water", "#": "wall", " ": "void", "_": "void"}

# Distinct colours for features; well-known kinds get a fixed one.
FEATURE_COLOURS = {
    "bridge": ((140, 90, 40), "brown"),
    "door": ((230, 120, 20), "orange"),
    "stairs": ((240, 220, 40), "yellow"),
    "pillar": ((255, 255, 255), "white"),
    "tree": ((30, 110, 40), "dark green"),
    "table": ((200, 80, 160), "pink"),
}
SPARE = [((220, 40, 40), "red"), ((40, 200, 200), "cyan"), ((130, 220, 90), "light green"),
         ((120, 70, 200), "violet"), ((250, 170, 170), "salmon"), ((90, 60, 30), "dark brown")]
ENTRANCE = ((255, 0, 255), "magenta")


def parse_feature(spec):
    parts = spec.split(":")
    kind, box = parts[0], parts[1]
    x, y, w, h = (int(v) for v in box.split(","))
    return {"kind": kind, "x": x, "y": y, "w": w, "h": h, "label": parts[2] if len(parts) > 2 else kind}


def load(path, feature_specs):
    text = Path(path).read_text(encoding="utf-8")
    if path.lower().endswith(".json"):
        doc = json.loads(text)
        w, h = doc["width"], doc["height"]
        layout = doc.get("layout", doc)
        # Cells missing from the layout are void (knowledge/domain/battle-map.md).
        grid = [["void"] * w for _ in range(h)]
        for c in layout.get("cells", []):
            grid[c["y"]][c["x"]] = c.get("terrain", "floor")
        return grid, layout.get("features", []), layout.get("entrances", []), doc
    lines = [l.rstrip("\n") for l in text.splitlines() if l.strip("\n") != ""]
    w = max(len(l) for l in lines)
    grid = []
    for l in lines:
        row = []
        for ch in l.ljust(w):
            if ch not in ASCII:
                sys.exit(f"Unknown layout character {ch!r}; use . , ~ # or space.")
            row.append(ASCII[ch])
        grid.append(row)
    return grid, [parse_feature(s) for s in feature_specs], [], {}


def pick_cell(cols, rows, target):
    cell = max(16, (target // max(cols, rows)) // 16 * 16)
    while cols * rows * cell * cell < MIN_PIXELS:
        cell += 16
    while cell > 16 and (max(cols, rows) * cell > MAX_EDGE or cols * rows * cell * cell > MAX_PIXELS):
        cell -= 16
    return cell


def write_png(path, pixels, w, h):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pixels[y]
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("layout", help="battle map .json or ASCII .txt")
    p.add_argument("--out", required=True)
    p.add_argument("--feature", action="append", default=[], help='ASCII input only: "kind:x,y,w,h[:label]"')
    p.add_argument("--target", type=int, default=1536, help="aim for this long edge in pixels (default 1536)")
    p.add_argument("--cell", type=int, help="force pixels per cell (multiple of 16)")
    a = p.parse_args()

    grid, features, entrances, doc = load(a.layout, a.feature)
    rows, cols = len(grid), len(grid[0])
    if max(cols, rows) / min(cols, rows) > MAX_RATIO:
        sys.exit(f"Grid {cols}x{rows} is wider than 3:1, the model's limit. Pad it with void cells or split it into tiles.")
    cell = a.cell or pick_cell(cols, rows, a.target)
    if cell % 16:
        sys.exit("--cell must be a multiple of 16.")
    W, H = cols * cell, rows * cell
    if max(W, H) > MAX_EDGE or W * H > MAX_PIXELS:
        sys.exit(f"{W}x{H} exceeds the model's limit ({MAX_EDGE} px edge, {MAX_PIXELS} px total); lower --cell or --target.")
    if W * H < MIN_PIXELS:
        sys.exit(f"{W}x{H} is below the model's minimum of {MIN_PIXELS} px; raise --cell.")

    # Void that can't reach the map edge through other void cells is enclosed by the map, like
    # the solid rock between a dungeon's corridors. Shown in the outside colour, the model paints
    # it as an extra room or pool, so it is drawn as wall instead.
    outside = set()
    todo = [(x, y) for y in range(rows) for x in range(cols)
            if grid[y][x] == "void" and (x in (0, cols - 1) or y in (0, rows - 1))]
    while todo:
        x, y = todo.pop()
        if (x, y) in outside:
            continue
        outside.add((x, y))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < cols and 0 <= ny < rows and grid[ny][nx] == "void" and (nx, ny) not in outside:
                todo.append((nx, ny))
    grid = [["wall" if t == "void" and (x, y) not in outside else t for x, t in enumerate(row)]
            for y, row in enumerate(grid)]

    colour = [[TERRAIN.get(t, TERRAIN["floor"])[0] for t in row] for row in grid]
    used = {t for row in grid for t in row}
    legend = [f"{TERRAIN[t][1]} = {TERRAIN[t][2]}" for t in TERRAIN if t in used]

    spare = iter(SPARE)
    kind_colour = {}
    for f in features:
        kind = f["kind"].lower()
        if kind not in kind_colour:
            kind_colour[kind] = FEATURE_COLOURS.get(kind) or next(spare, ((255, 255, 0), "yellow"))
        rgb, name = kind_colour[kind]
        for y in range(f["y"], min(rows, f["y"] + f["h"])):
            for x in range(f["x"], min(cols, f["x"] + f["w"])):
                colour[y][x] = rgb
        span = lambda start, size: f"{start + 1}" if size == 1 else f"{start + 1}-{start + size}"
        legend.append(f"{name} at column {span(f['x'], f['w'])}, row {span(f['y'], f['h'])} "
                      f"= {f['kind']}" + (f' ("{f["label"]}")' if f.get("label") and f["label"] != f["kind"] else ""))
    for e in entrances:
        for x, y in e.get("cells", []):
            colour[y][x] = ENTRANCE[0]
    if entrances:
        legend.append(f"{ENTRANCE[1]} = openings at the map edge, painted as the path, doorway or stairs that leads away: " + ", ".join(e.get("label", e["kind"]) for e in entrances))

    pixels = []
    for y in range(H):
        row = bytearray()
        for c in colour[y // cell]:
            row += bytes(c) * cell
        pixels.append(row)
    write_png(a.out, pixels, W, H)

    print(json.dumps({
        "guide": a.out, "size": f"{W}x{H}", "cell_px": cell, "grid": f"{cols}x{rows}",
        "legend": legend,
        "scene": doc.get("scene"), "vibe": doc.get("vibe"), "lighting": doc.get("lighting"),
    }, indent=2))


if __name__ == "__main__":
    main()
