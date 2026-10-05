"""Export the master-preserving review, plus generously padded authoring sheets.

Review frames keep their native 2048 canvas. Authoring cells add exactly 512
transparent pixels on every side (3072 square), never resize the artwork.
Sheets are local production sources; the browser loads complete lossless
frames for one selected clip, rather than enormous decoded atlases.
"""
from pathlib import Path
import json, shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT.parent / 'output/100next-master-branch-v1'
PUBLIC = ROOT / 'public/assets/social-club/master-branch-review-v1'
SHEETS = SOURCE / 'padded-sheets'
PUBLIC.mkdir(parents=True, exist_ok=True)
SHEETS.mkdir(parents=True, exist_ok=True)
SLUGS = ['vince', 'finn', 'june', 'edgar', 'roxie', 'otis', 'paloma', 'bianca']
CORE = ['rest', 'blink-half', 'blink', 'left-mid', 'left', 'right-mid', 'right', 'down-mid', 'down']

def sheet(slug, label, names, cols=3):
    rows = (len(names) + cols - 1) // cols
    canvas = Image.new('RGBA', (cols * 3072, rows * 3072))
    checks = []
    for index, name in enumerate(names):
        frame = Image.open(SOURCE / slug / (name + '.png')).convert('RGBA')
        assert frame.size == (2048, 2048)
        x, y = index % cols * 3072 + 512, index // cols * 3072 + 512
        canvas.paste(frame, (x, y))
        assert canvas.crop((x, y, x + 2048, y + 2048)).tobytes() == frame.tobytes()
        bounds = frame.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox()
        margin = 512 + min(bounds[0], bounds[1], 2048 - bounds[2], 2048 - bounds[3])
        assert margin >= 768, (slug, name, margin)
        checks.append({'frame': name, 'cell': index, 'minimumSolidClearance': margin})
    name = f'{slug}-{label}-3072.png'
    canvas.save(SHEETS / name, compress_level=6)
    (SHEETS / name.replace('.png', '.json')).write_text(json.dumps({
        'cellSize': 3072, 'addedPadding': 512, 'sourcePixelScale': 1,
        'columns': cols, 'rows': rows, 'frames': checks,
        'anchor': [1536, 1622], 'policy': 'Fixed master hip anchor, no pose fitting or resizing.',
    }, indent=2) + '\n')

characters = []
for slug in SLUGS:
    destination = PUBLIC / slug
    destination.mkdir(exist_ok=True)
    manifest = json.loads((SOURCE / slug / 'manifest.json').read_text())
    for name in CORE:
        shutil.copy2(SOURCE / slug / (name + '.webp'), destination / (name + '.webp'))
    sheet(slug, 'reactions', CORE)
    clips = manifest['clips']
    if slug == 'finn':
        extra = ['throw-prepare-locked', 'throw-release-locked']
        tumble = json.loads((SOURCE / slug / 'tumble-review.json').read_text())['clip']
        for name in extra + list(dict.fromkeys(n + '-tumble' for n in tumble['frames'])):
            shutil.copy2(SOURCE / slug / (name + '.webp'), destination / (name + '.webp'))
        clips['throw-trial'] = {'frames': ['rest'] + extra + ['rest'], 'durations': [360, 140, 180, 400]}
        clips['pickup-trial'] = {'frames': ['throw-release-locked', 'throw-prepare-locked', 'rest'], 'durations': [400, 170, 500]}
        clips['tumble-trial'] = {'frames': [n + '-tumble' for n in tumble['frames']], 'durations': tumble['durations']}
        sheet(slug, 'card-actions', ['rest'] + extra)
        sheet(slug, 'tumble-trial', list(dict.fromkeys(n + '-tumble' for n in tumble['frames'])))
    characters.append({'id': slug, 'name': slug.title(), 'clips': clips})
    (destination / 'checks.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Exported {slug}: complete native frames and padded sheet', flush=True)

(PUBLIC / 'manifest.json').write_text(json.dumps({
    'status': 'Review only; not enabled in the game.', 'nativeFrameSize': 2048,
    'authoringCellSize': 3072, 'characters': characters,
    'corePolicy': 'Every pixel outside the two eye regions and all alpha values match the approved master.',
    'actionPolicy': 'Finn head and lower body unchanged. Only working hand/card region composited.',
    'tumblePolicy': 'Original Finn head painting at physical scale 1; new body poses are a trial, not pixel-identical.',
}, indent=2) + '\n')
for name in ['generation.json', 'tumble-generation.json']:
    shutil.copy2(SOURCE / name, PUBLIC / name)
