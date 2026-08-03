#!/usr/bin/env python3
"""
Generates the app icon, adaptive icon and splash mark for Bagdrop.

Checked in so the mark can be adjusted without a design tool round trip. It is
not a substitute for a designer — it is a real icon instead of Expo's default.

The mark: the cup seen from directly above, with a ball resting on the lip.
Two shapes and three colours, because at 40 points that is all that survives —
a tag, a bag or a pin all turned to mush or read as somebody else's icon.

Charcoal rather than green as the background is the deliberate part. Every golf
app is a saturated green rectangle, so green as the field makes you invisible
in the category; green as the accent on charcoal does the opposite. Deep
fairway green was tried here first and disappeared against the charcoal — the
brighter green is what makes the ring hold at small sizes.

    python3 scripts/make-icons.py
"""

from PIL import Image, ImageDraw

CHARCOAL = (24, 27, 31)     # #181B1F — the field
GREEN = (61, 220, 127)      # #3DDC7F — the cup
WHITE = (255, 255, 255)     # the ball

SIZE = 1024
SS = 4  # supersample; Pillow does not antialias its draw primitives


def draw_mark(canvas: int, diameter: int, background=None) -> Image.Image:
    """The cup from above, ball on the lip. Transparent unless given a field."""
    big = canvas * SS
    fill = (*background, 255) if background else (0, 0, 0, 0)
    image = Image.new("RGBA", (big, big), fill)
    draw = ImageDraw.Draw(image)

    r = (diameter * SS) // 2
    cx = cy = big // 2
    weight = int(r * 0.30)

    # The ring is drawn as a filled disc with the middle punched back out to the
    # field. On a transparent canvas that has to be a real hole, not a charcoal
    # disc, or the adaptive icon ships with a square of background baked in.
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    inner = [cx - r + weight, cy - r + weight, cx + r - weight, cy + r - weight]
    if background:
        draw.ellipse(inner, fill=(*background, 255))
    else:
        hole = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(hole).ellipse(inner, fill=(0, 0, 0, 255))
        image.paste((0, 0, 0, 0), (0, 0), hole)
        draw = ImageDraw.Draw(image)

    # Offset up and right so it reads as resting on the lip rather than centred
    # in the hole, which looks like a target.
    br = int(r * 0.42)
    bx, by = cx + int(r * 0.30), cy - int(r * 0.30)
    draw.ellipse([bx - br, by - br, bx + br, by + br], fill=WHITE)

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
    flatten(draw_mark(SIZE, int(SIZE * 0.54), background=CHARCOAL), CHARCOAL).save(f"{out}/icon.png")

    # Android adaptive foreground. The outer ~25% is cropped by whichever mask
    # the launcher applies, so the mark has to sit well inside it.
    draw_mark(SIZE, int(SIZE * 0.40)).save(f"{out}/adaptive-icon.png")

    # Splash. Transparent, on the background set in app.json.
    draw_mark(SIZE, int(SIZE * 0.38)).save(f"{out}/splash-icon.png")

    flatten(draw_mark(64, 36, background=CHARCOAL), CHARCOAL).save(f"{out}/favicon.png")

    print("wrote icon.png, adaptive-icon.png, splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
