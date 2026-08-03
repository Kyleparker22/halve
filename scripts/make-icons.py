#!/usr/bin/env python3
"""
Generates the app icon, adaptive icon and splash mark for Bagdrop.

Checked in so the mark can be adjusted without a design tool round trip. It is
not a substitute for a designer — it is a real icon instead of Expo's default.

The mark: a luggage tag whose punch hole is the cup. Bagdrop is the airport
term and the golf term at once — the moment you pull up, unload, and find your
group — and the tag carries both halves in one shape. The orange hole is the
only detail, because at 40 points a detail is all you get.

    python3 scripts/make-icons.py
"""

from PIL import Image, ImageDraw

FAIRWAY = (11, 61, 46)      # #0B3D2E
BONE = (246, 244, 239)      # #F6F4EF
FLAG = (228, 87, 46)        # #E4572E

SIZE = 1024
SS = 4  # supersample; Pillow does not antialias its draw primitives


def draw_mark(canvas: int, width: int, background=None) -> Image.Image:
    """The tag, centred. Transparent background unless one is given."""
    big = canvas * SS
    fill = (*background, 255) if background else (0, 0, 0, 0)
    image = Image.new("RGBA", (big, big), fill)
    draw = ImageDraw.Draw(image)

    w = width * SS
    h = int(w * 0.62)
    left = (big - w) // 2
    top = (big - h) // 2
    right, bottom = left + w, top + h

    radius = int(h * 0.20)
    point = int(w * 0.30)   # how far the angled end reaches in

    # Body: rounded on the right, squared off on the left. The squaring matters
    # — the taper has to run off a sharp corner. Leave those corners rounded and
    # the diagonal overshoots them, leaving a nub at each end; move the taper
    # inboard to avoid the nub and you get a flat edge that reads as a wallet.
    draw.rounded_rectangle([left + point, top, right, bottom], radius=radius, fill=BONE)
    draw.rectangle([left + point, top, left + point + radius, bottom], fill=BONE)
    draw.polygon(
        [(left, top + h // 2), (left + point, top), (left + point, bottom)],
        fill=BONE,
    )

    # The punch hole, which is also the cup. The only detail in the mark.
    hole_r = int(h * 0.16)
    hole_cx = left + point - int(h * 0.06)
    draw.ellipse(
        [hole_cx - hole_r, top + h // 2 - hole_r, hole_cx + hole_r, top + h // 2 + hole_r],
        fill=FLAG,
    )

    return image.resize((canvas, canvas), Image.LANCZOS)


def flatten(image: Image.Image, background) -> Image.Image:
    """iOS rejects an icon with an alpha channel outright."""
    flat = Image.new("RGB", image.size, background)
    flat.paste(image, mask=image.split()[3])
    return flat


def main() -> None:
    out = "apps/mobile/assets"

    # Store icon. Full bleed, square, no alpha, no rounded corners — the
    # platforms mask it themselves and baking a radius in looks wrong.
    flatten(draw_mark(SIZE, int(SIZE * 0.66), background=FAIRWAY), FAIRWAY).save(f"{out}/icon.png")

    # Android adaptive foreground. The outer ~25% is cropped by whichever mask
    # the launcher applies, so the mark has to sit well inside it.
    draw_mark(SIZE, int(SIZE * 0.48)).save(f"{out}/adaptive-icon.png")

    # Splash. Transparent, on the background set in app.json.
    draw_mark(SIZE, int(SIZE * 0.46)).save(f"{out}/splash-icon.png")

    flatten(draw_mark(64, 44, background=FAIRWAY), FAIRWAY).save(f"{out}/favicon.png")

    print("wrote icon.png, adaptive-icon.png, splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
