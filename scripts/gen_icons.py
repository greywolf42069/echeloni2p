#!/usr/bin/env python3
"""
Generate Echelon PWA icons with PIL (no SVG rasterizer needed).

Renders the same "echelon formation" mark as public/icon.svg:
  - rounded-rect dark background
  - three offset gradient bars descending (staggered relay chain)
  - two teal node dots at the endpoints

Outputs (into public/icons/):
  - icon-192.png       (Android home screen, "any" purpose)
  - icon-512.png       (splash / store listing, "any" purpose)
  - icon-192-maskable.png  (Android adaptive, safe-zone padded)
  - icon-512-maskable.png
  - apple-touch-icon.png   (180x180, iOS home screen, opaque)
  - favicon-32.png / favicon-16.png

Run from repo root:  python3 scripts/gen_icons.py
Idempotent — overwrites existing files.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "icons"

# Palette (matches public/icon.svg gradient + tokens)
BG = (15, 23, 42, 255)          # slate-900 #0f172a
GRAD_TOP = (167, 139, 250)      # #a78bfa
GRAD_MID = (124, 58, 237)       # #7c3aed
GRAD_BOT = (20, 184, 166)       # #14b8a6
NODE = (94, 234, 212, 255)      # teal-300 #5eead4


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _grad_color(t: float):
    """Two-stop gradient: top→mid (0..0.55), mid→bot (0.55..1)."""
    if t <= 0.55:
        return _lerp(GRAD_TOP, GRAD_MID, t / 0.55)
    return _lerp(GRAD_MID, GRAD_BOT, (t - 0.55) / 0.45)


def _rounded_rect_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def _draw_bar(draw: ImageDraw.ImageDraw, x, y, w, h, color):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=color + (255,))


def render(size: int, *, maskable: bool = False, opaque_bg=None) -> Image.Image:
    """Render the icon at `size`×`size`.

    maskable=True insets the artwork into the central 80% safe zone so
    Android's adaptive-icon mask never clips the mark.
    opaque_bg: if given, fill the canvas with this instead of transparent
    corners (apple-touch-icon wants a solid square).
    """
    SS = 4  # supersample for crisp edges
    canvas = size * SS
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable or opaque_bg is not None:
        # Full-bleed background (mask/opaque variants want no transparent corners)
        bg = opaque_bg or BG
        draw.rectangle([0, 0, canvas, canvas], fill=bg)
    else:
        # Rounded-rect background
        radius = round(canvas * 112 / 512)
        draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=radius, fill=BG)

    # Artwork is authored in a 512 viewbox; scale to canvas.
    # For maskable, inset to the central 80% (10% padding each side).
    inset = 0.10 if maskable else 0.0
    art_origin = canvas * inset
    art_size = canvas * (1 - 2 * inset)
    s = art_size / 512.0

    def X(v):
        return art_origin + v * s

    def Y(v):
        return art_origin + v * s

    # three bars (x, y, w, h in 512 space) with descending gradient t
    bars = [
        (96, 150, 220, 48, 0.15),
        (146, 232, 220, 48, 0.5),
        (196, 314, 220, 48, 0.85),
    ]
    for (bx, by, bw, bh, t) in bars:
        color = _grad_color(t)
        _draw_bar(draw, X(bx), Y(by), bw * s, bh * s, color)

    # node dots
    for (cx, cy) in [(120, 174), (392, 338)]:
        r = 14 * s
        draw.ellipse([X(cx) - r, Y(cy) - r, X(cx) + r, Y(cy) + r], fill=NODE)

    img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    render(192).save(OUT_DIR / "icon-192.png")
    render(512).save(OUT_DIR / "icon-512.png")
    render(192, maskable=True).save(OUT_DIR / "icon-192-maskable.png")
    render(512, maskable=True).save(OUT_DIR / "icon-512-maskable.png")
    # Apple touch icon: opaque square, no transparency, 180x180
    render(180, opaque_bg=BG).save(OUT_DIR / "apple-touch-icon.png")
    render(32).save(OUT_DIR / "favicon-32.png")
    render(16).save(OUT_DIR / "favicon-16.png")

    print(f"Wrote icons to {OUT_DIR}")
    for p in sorted(OUT_DIR.glob("*.png")):
        print(f"  {p.name}: {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
