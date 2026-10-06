"""Export approved whole drawings, omitting transparent download padding only."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'public/assets/social-club/master-animation-v2'
manifest = json.loads((DEST / 'manifest.json').read_text())
audit = []
for slug, character in manifest['characters'].items():
    source = ROOT / ('public/finn-whole-action-trial/assets' if slug == 'finn' else f'public/whole-character-actions/assets/{slug}')
    approved = json.loads((source / 'manifest.json').read_text())
    for action in ['throw', 'receive']:
        for n in range(1, 7):
            name = f'whole-{action}-{n}'
            full = Image.open(source / f'{action}-{n}.webp').convert('RGBA')
            box = full.getchannel('A').getbbox()
            crop = full.crop(box)
            file = DEST / slug / f'{name}.webp'
            crop.save(file, lossless=True, exact=True, method=6)
            assert np.array_equal(np.array(crop), np.array(Image.open(file))), name
            x, y, right, bottom = box
            character['bounds'][name] = [x, y, right-x, bottom-y]
            audit.append({'character': slug, 'frame': name, 'nativePixelsIdentical': True, 'bounds': character['bounds'][name]})
    character['clips']['throw'] = {'frames': [f'whole-throw-{i}' for i in range(1, 7)], 'durations': approved['clips']['throw']['durations']}
    # Hold the empty receiving grip until the actual flying card arrives.
    character['clips']['receive-ready'] = {'frames': [f'whole-receive-{i}' for i in range(1, 4)], 'durations': [80, 70, 10]}
    character['clips']['pickup'] = {'frames': [f'whole-receive-{i}' for i in range(4, 7)], 'durations': [55, 75, 100]}
    character['handoff'] = {
        'releaseMs': 215, 'released': 'whole-throw-4', 'caught': 'whole-receive-4',
        'release': [v/4 for v in approved['clips']['throw']['hand']] + [75/4, 105/4],
        'catch': [v/4 for v in approved['clips']['receive']['hand']] + [75/4, 105/4],
    }
manifest['wholeActionRevision'] = 'approved-eight-v1'
(DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(DEST / 'whole-action-checks.json').write_text(json.dumps(audit, indent=2)+'\n')
header = '// Complete native drawings; transparent padding is restored inside a fixed 2048 frame.\nexport interface MasterAnimationSet { clips: Record<string,{frames:string[];durations:number[]}>; emotions: Record<string,string>; bounds:Record<string,number[]>; handoff?:{releaseMs:number;released:string;caught:string;release:number[];catch:number[]} }\n'
(ROOT / 'src/ui/MasterAnimationData.ts').write_text(header+'export const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(manifest['characters'], separators=(',', ':'))+';\n')
print(f'Exported {len(audit)} approved native action frames')
