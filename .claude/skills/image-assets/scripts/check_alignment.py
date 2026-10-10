# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Make a review sheet that shows how well a generated map follows its guide.

Writes one PNG with three panels: the guide, the result with the grid drawn
on top, and the result blended 40 % with the guide. Look at it (Read the
file) to spot walls, water or features that drifted out of their cells.

    uv run check_alignment.py guide.png result.png --cell 96 --out review.png

Runs with `uv run`, which installs Pillow on the fly. Without uv:
`pip install pillow` and use python.
"""
import argparse

from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("guide")
    p.add_argument("result")
    p.add_argument("--cell", type=int, required=True, help="pixels per cell in the guide (cell_px from render_guide.py)")
    p.add_argument("--out", required=True)
    p.add_argument("--panel-width", type=int, default=900, help="width of each panel in the sheet")
    a = p.parse_args()

    guide = Image.open(a.guide).convert("RGB")
    result = Image.open(a.result).convert("RGB")
    if result.size != guide.size:
        print(f"note: result {result.size} differs from guide {guide.size}; resizing result to compare")
        result = result.resize(guide.size, Image.LANCZOS)

    gridded = result.copy()
    d = ImageDraw.Draw(gridded)
    w, h = guide.size
    for x in range(0, w + 1, a.cell):
        d.line([(x, 0), (x, h)], fill=(255, 255, 0), width=2)
    for y in range(0, h + 1, a.cell):
        d.line([(0, y), (w, y)], fill=(255, 255, 0), width=2)
    blend = Image.blend(result, guide, 0.4)

    scale = a.panel_width / w
    panels = [im.resize((a.panel_width, round(h * scale)), Image.LANCZOS) for im in (guide, gridded, blend)]
    sheet = Image.new("RGB", (a.panel_width * 3 + 20, panels[0].height), (32, 32, 32))
    for i, im in enumerate(panels):
        sheet.paste(im, (i * (a.panel_width + 10), 0))
    sheet.save(a.out)
    print(a.out)


if __name__ == "__main__":
    main()
