"""Draws the placeholder PWA icons into public/.

Run from src/web:  uv run --with pillow python scripts/make-icons.py

A dark table with a faint grid and a candle-gold d20 outline. Replace with
real artwork whenever there is some; the file names are what the manifest uses.
"""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

TABLE = (20, 22, 27, 255)  # --color-table
LINE = (44, 48, 57, 255)  # --color-line
CANDLE = (224, 173, 79, 255)  # --color-candle
SS = 4  # supersampling factor for smooth edges

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def hexagon(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    # Pointy-top hexagon, the usual silhouette of a d20.
    return [(cx + r * cos(pi / 2 + k * pi / 3), cy - r * sin(pi / 2 + k * pi / 3)) for k in range(6)]


def draw_icon(size: int, *, full_bleed: bool, content_scale: float) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if full_bleed:
        d.rectangle((0, 0, s, s), fill=TABLE)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s * 0.22, fill=TABLE)

    # Faint 4x4 battle grid inside the content area.
    c = s / 2
    half = s * content_scale / 2
    grid_w = max(1, round(s * 0.008))
    for i in range(5):
        p = c - half + i * (2 * half / 4)
        d.line((p, c - half, p, c + half), fill=LINE, width=grid_w)
        d.line((c - half, p, c + half, p), fill=LINE, width=grid_w)

    # d20 outline: hexagon (vertices from the top, counter-clockwise), the front
    # triangle, and the edges joining them.
    r = half * 0.82
    hx = hexagon(c, c, r)
    tri = [(c, c - r * 0.5), (c - r * 0.55, c + r * 0.38), (c + r * 0.55, c + r * 0.38)]
    stroke = max(2, round(s * 0.026))
    thin = max(1, round(stroke * 0.6))

    def segment(a: tuple[float, float], b: tuple[float, float], w: int) -> None:
        d.line((a, b), fill=CANDLE, width=w)
        for x, y in (a, b):
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=CANDLE)

    for i in range(6):
        segment(hx[i], hx[(i + 1) % 6], stroke)
    for i in range(3):
        segment(tri[i], tri[(i + 1) % 3], stroke)
    for t, h in ((0, 0), (0, 1), (0, 5), (1, 1), (1, 2), (1, 3), (2, 5), (2, 4), (2, 3)):
        segment(tri[t], hx[h], thin)

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    draw_icon(192, full_bleed=False, content_scale=0.78).save(PUBLIC / "pwa-192x192.png")
    draw_icon(512, full_bleed=False, content_scale=0.78).save(PUBLIC / "pwa-512x512.png")
    # Maskable: full bleed, artwork kept inside the 80 % safe circle.
    draw_icon(512, full_bleed=True, content_scale=0.56).save(PUBLIC / "maskable-icon-512x512.png")
    # iOS rounds the corners itself and ignores transparency.
    draw_icon(180, full_bleed=True, content_scale=0.7).save(PUBLIC / "apple-touch-icon-180x180.png")
    print("Icons written to", PUBLIC)


if __name__ == "__main__":
    main()
