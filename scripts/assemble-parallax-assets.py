"""Package approved imagegen layers without overwriting the original deck art.

Run with the workspace Python that includes Pillow. Inputs are recorded in
output/parallax-work/generated.json and generated-more.jsonl during preparation.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/parallax-work'
DEST = ROOT / 'public/assets/cards/midnight-v1/parallax-v1'
WIDTH, HEIGHT = 1064, 1486
records = json.loads((WORK / 'generated.json').read_text())
extra = WORK / 'generated-more.jsonl'
if extra.exists():
    for line in extra.read_text().splitlines():
        if line.strip():
            records.append(json.loads(line))
sample = WORK / 'approved-sun-sample'
for layer in ['background', 'object']:
    records.append({'key': 'sun-a', 'layer': layer, 'path': str(sample / f'{layer}.png')})
by_key = {}
for row in records:
    by_key.setdefault(row['key'], {})[row['layer']] = Path(row['path'])
cache_path = WORK / 'assembled.json'
cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
cards, changed = [], []
DEST.mkdir(parents=True, exist_ok=True)
(DEST / 'flat').mkdir(exist_ok=True)
for key, pair in sorted(by_key.items()):
    if set(pair) != {'background', 'object'}:
        continue
    token = hashlib.sha256(''.join(f'{p}:{p.stat().st_mtime_ns}' for p in pair.values()).encode()).hexdigest()
    folder = DEST / key
    if cache.get(key) != token or not (folder / 'object.webp').exists():
        bg = Image.open(pair['background'])
        fg = Image.open(pair['object'])
        if min(bg.width, fg.width) < 900 or min(bg.height, fg.height) < 1200:
            raise ValueError(f'{key}: low-resolution layer')
        if fg.mode != 'RGBA' or fg.getchannel('A').getextrema() != (0, 255):
            raise ValueError(f'{key}: object layer must contain actual transparency')
        bg = bg.convert('RGB').resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        fg = fg.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        folder.mkdir(exist_ok=True)
        bg.save(folder / 'background.webp', 'WEBP', lossless=True, method=6)
        fg.save(folder / 'object.webp', 'WEBP', lossless=True, method=6)
        # Match the hand's 6% background bleed exactly at its neutral pose.
        bleed = bg.resize((round(WIDTH * 1.06), round(HEIGHT * 1.06)), Image.Resampling.LANCZOS)
        left, top = (bleed.width-WIDTH)//2, (bleed.height-HEIGHT)//2
        flat = bleed.crop((left, top, left+WIDTH, top+HEIGHT)).convert('RGBA')
        flat.alpha_composite(fg)
        flat.convert('RGB').save(DEST / 'flat' / f'{key}.webp', 'WEBP', lossless=True, method=6)
        cache[key] = token
        changed.append(key)
    cards.append({'key': key, 'background': f'{key}/background.webp', 'object': f'{key}/object.webp', 'flat': f'flat/{key}.webp'})
(DEST / 'manifest.json').write_text(json.dumps({'version': 'parallax-v1', 'width': WIDTH, 'height': HEIGHT, 'encoding': 'lossless WebP', 'cards': cards}, indent=2)+'\n')
cache_path.write_text(json.dumps(cache, indent=2)+'\n')
for suit in ['fire', 'water', 'leaf', 'sun']:
    sheet = Image.new('RGB', (880, 1008), '#182536')
    draw = ImageDraw.Draw(sheet)
    for index, rank in enumerate(['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'k']):
        file = DEST / 'flat' / f'{suit}-{rank}.webp'
        x, y = index % 4*220+4, index//4*336+24
        draw.text((x, y-18), f'{suit}-{rank}', fill='white')
        if file.exists():
            image = Image.open(file); image.thumbnail((212,296)); sheet.paste(image,(x,y))
    sheet.save(WORK / f'{suit}-layers-review.jpg', quality=93)
print(json.dumps({'complete_cards': len(cards), 'new_cards': changed}))
