"""Export generated full-bleed originals and lossless game textures without redraws."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/cards/midnight-v1'
records = [json.loads(path.read_text()) for path in sorted((ROOT / 'public/card-redesign/generation-log').glob('*.json'))]
(ROOT / 'public/card-redesign/production-prompts.json').write_text(json.dumps({
    'tool': 'built-in image_gen', 'stage': 'approved production deck', 'artworks': records
}, indent=2) + '\n')
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'full').mkdir(exist_ok=True)
manifest = []
for record in records:
    name = f"{record['suit']}-{record['rank'].lower()}"
    target = OUT / 'full' / f'{name}.png'
    if not Path(record['source']).exists() and target.exists():
        image = Image.open(target).convert('RGB')
    else:
        image = Image.open(record['source']).convert('RGB')
    # Standard poker proportions. Resampling exports only; all illustration
    # pixels originate in imagegen, with no baked card frame or typography.
    image = image.resize((1064, 1486), Image.Resampling.LANCZOS)
    image.save(OUT / 'full' / f'{name}.png', optimize=True)
    image.save(OUT / f'{name}.webp', lossless=True, method=6)
    manifest.append({'suit': record['suit'], 'rank': record['rank'],
                     'width': image.width, 'height': image.height,
                     'url': f'assets/cards/midnight-v1/{name}.webp',
                     'lossless': f'assets/cards/midnight-v1/full/{name}.png'})
(OUT / 'manifest.json').write_text(json.dumps({'version': 'midnight-v1',
    'tool': 'built-in image_gen', 'artworks': manifest,
    'positiveTenRanks': ['J', 'Q', 'K'], 'positiveTenArtwork': 'K'}, indent=2) + '\n')
print(f'Exported {len(manifest)} full-bleed originals and lossless textures.')
