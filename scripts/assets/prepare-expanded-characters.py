"""Align generated cutouts into runtime cells and export pose-specific hand anchors.

No artwork is painted here. Generation restores the missing silhouettes; this
step finds the real transparent gutters, preserves complete cutouts, aligns
their heads, and discards invisible alpha speckles before WebP encoding.
"""
import json
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/character-repairs/expanded-v2'
DEST = ROOT / 'public/assets/characters'
CELL, MARGIN = 418, 14


def separators(counts):
    """Generated rows drift slightly: split at actual empty gaps, not 1/3."""
    cuts = [0]
    for i in (1, 2):
        nominal = len(counts) * i / 3
        lo, hi = round(nominal - CELL * .18), round(nominal + CELL * .18)
        gaps, start = [], None
        for p in range(lo, hi + 1):
            if counts[p] <= 4:
                if start is None:
                    start = p
            elif start is not None:
                gaps.append((start, p))
                start = None
        if start is not None:
            gaps.append((start, hi + 1))
        gaps = [g for g in gaps if g[1] - g[0] >= 3]
        if not gaps:
            raise ValueError('No safe transparent gutter near the nominal grid.')
        gap = min(gaps, key=lambda g: abs((g[0] + g[1]) / 2 - nominal))
        cuts.append(round((gap[0] + gap[1]) / 2))
    return cuts + [len(counts)]


def head_center(alpha):
    """Use the broad head silhouette above the shoulders, excluding raised cards."""
    centers = []
    for fraction in (.15, .20, .25, .30):
        row = list(alpha.crop((0, round(alpha.height * fraction), alpha.width,
                               round(alpha.height * fraction) + 1)).get_flattened_data())
        runs, start = [], None
        for x, value in enumerate(row + [0]):
            if value > 32:
                if start is None:
                    start = x
            elif start is not None:
                runs.append((start, x))
                start = None
        if runs:
            a, b = max(runs, key=lambda r: r[1] - r[0])
            centers.append((a + b) / 2)
    return median(centers) if centers else alpha.width / 2


source_manifest = json.loads((SOURCE / 'manifest.json').read_text())
runtime = json.loads((DEST / 'manifest.json').read_text())
runtime.update(version=2, revision='expanded-v2', gutter=MARGIN, alignment='head-centered complete cutouts')
layouts = []
for character in source_manifest['characters']:
    im = Image.open(SOURCE / character['file']).convert('RGBA')
    if im.size != (CELL * 3, CELL * 3):
        raise ValueError(f"Unexpected sheet dimensions: {character['name']}")
    # Values <=8 are transparent export noise, not illustration details.
    im.putalpha(im.getchannel('A').point(lambda a: 0 if a <= 8 else a))
    solid = im.getchannel('A').point(lambda a: 255 if a > 32 else 0)
    xs = separators([sum(solid.crop((x, 0, x+1, im.height)).get_flattened_data()) // 255
                     for x in range(im.width)])
    ys = separators([sum(solid.crop((0, y, im.width, y+1)).get_flattened_data()) // 255
                     for y in range(im.height)])
    frames = []
    for row in range(3):
        for col in range(3):
            region = im.crop((xs[col], ys[row], xs[col+1], ys[row+1]))
            bounds = region.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            if not bounds:
                raise ValueError('Empty sprite frame.')
            frames.append(region.crop(bounds))
    # One scale per character preserves face size across all expressions.
    scale = min((CELL - 48) / max(f.height for f in frames),
                (CELL - MARGIN * 2) / max(f.width for f in frames))
    packed = Image.new('RGBA', im.size)
    hand_poses, transforms = [], []
    for index, frame in enumerate(frames):
        width, height = round(frame.width * scale), round(frame.height * scale)
        center = head_center(frame.getchannel('A'))
        x = max(MARGIN, min(CELL - MARGIN - width, round(CELL / 2 - center * scale)))
        y = 24
        resized = frame.resize((width, height), Image.Resampling.LANCZOS)
        packed.paste(resized, (index % 3 * CELL + x, index // 3 * CELL + y))
        # Normal cards low at chest, raised card for wind-up, empty catching hand
        # for recovery. The flight remains private and uses the existing card back.
        cx, cy = (.25, .13) if index == 6 else ((.31, .59) if index == 7 else ((.47, .66) if index == 8 else (.55, .62)))
        hand_poses.append([round((x + width * (cx - .07)) / CELL, 4),
                           round((y + height * (cy - .10)) / CELL, 4),
                           round(width * .14 / CELL, 4), round(height * .20 / CELL, 4)])
        transforms.append({'x': x, 'y': y, 'width': width, 'height': height})
        if x < MARGIN or x + width > CELL - MARGIN or y + height > CELL - 24:
            raise ValueError('A packed silhouette would touch a cell edge.')
    filename = f"avatar-{character['id'] + 1:02}.webp"
    packed.save(DEST / filename, format='WEBP', quality=92, method=6)
    item = runtime['characters'][character['id']]
    item.update(generatedSource=Path(character['generatedSource']).name,
                repairedSource=f"../../../output/character-repairs/expanded-v2/{character['file']}",
                handAnchors=hand_poses, frameTransforms=transforms)
    layouts.append(hand_poses)
    print(f"{character['name']}: 9 full silhouettes, {(DEST / filename).stat().st_size:,} bytes")
(DEST / 'manifest.json').write_text(json.dumps(runtime, indent=2) + '\n')
(ROOT / 'src/ui/CharacterSpriteLayout.ts').write_text(
    '// Generated by scripts/assets/prepare-expanded-characters.py.\n'
    'export const CHARACTER_SPRITE_VERSION = "expanded-v2";\n'
    'export const characterHandAnchors: readonly (readonly (readonly number[])[])[] = '
    + json.dumps(layouts, separators=(',', ':')) + ';\n')
