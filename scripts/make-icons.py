#!/usr/bin/env python3
"""
Generates the app icon, adaptive icon and splash mark.

Checked in so the mark can be adjusted without a design tool round trip. It is
not a substitute for a designer — it is a real icon instead of Expo's default,
which is what shipped until now.

The mark: a golf ball split down the middle, one half bone and one half flag
orange. It is the name and the product in one shape — two people, one round,
the money split between them — and it stays legible at 40 points, which a
detailed ball with dimples does not.

    python3 scripts/make-icons.py
"""

from PIL import Image, ImageDraw

FAIRWAY = (11, 61, 46)      # #0B3D2E
BONE = (246, 244, 239)      # #F6F4EF
FLAG = (228, 87, 46)        # #E4572E

SIZE = 1024
SS = 4  # supersample factor; Pillow has no antialiased draw, so draw big and shrink


def draw_mark(canvas_size: int, diameter: int, background=None) -> Image.Image:
    """The split ball, centred. Transparent background unless one is given."""
    big = canvas_size * SS
    image = Image.new("RGBA", (big, big), (*background, 255) if background else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    d = diameter * SS
    left = (big - d) // 2
    top = (big - d) // 2
    box = [left, top, left + d, top + d]

    # Two half discs with a gap between them. The gap is what makes it read as
    # halved rather than as a two-tone circle.
    gap = max(2, d // 28)
    draw.pieslice(box, start=90, end=270, fill=BONE)          # left half
    draw.pieslice(box, start=-90, end=90, fill=FLAG)          # right half
    draw.rectangle(
        [left + d // 2 - gap // 2, top - 1, left + d // 2 + gap // 2, top + d + 1],
        fill=(*background, 255) if background else (0, 0, 0, 0),
    )

    return image.resize((canvas_size, canvas_size), Image.LANCZOS)


def flatten(image: Image.Image, background) -> Image.Image:
    """iOS rejects an icon with an alpha channel outright."""
    flat = Image.new("RGB", image.size, background)
    flat.paste(image, mask=image.split()[3])
    return flat


def main() -> None:
    out = "apps/mobile/assets"

    # iOS/Android store icon. Full bleed, square, no alpha, no rounded corners —
    # the platforms mask it themselves and baking a radius in looks wrong.
    icon = draw_mark(SIZE, int(SIZE * 0.62), background=FAIRWAY)
    flatten(icon, FAIRWAY).save(f"{out}/icon.png")

    # Android adaptive foreground. The outer ~25% is cropped by whichever mask
    # the launcher applies, so the mark has to sit well inside it.
    adaptive = draw_mark(SIZE, int(SIZE * 0.44))
    adaptive.save(f"{out}/adaptive-icon.png")

    # Splash. Transparent, sits on the fairway background set in app.json.
    splash = draw_mark(SIZE, int(SIZE * 0.40))
    splash.save(f"{out}/splash-icon.png")

    favicon = draw_mark(64, 40, background=FAIRWAY)
    flatten(favicon, FAIRWAY).save(f"{out}/favicon.png")

    print("wrote icon.png, adaptive-icon.png, splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
