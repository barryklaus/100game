"""Author pose-preserving complete blink frames; mutate only calibrated eyes.

Run after export-master-runtime-v2.py. Mouth, gaze on reopening, card count,
silhouette, scale and native pixel coordinates remain those of the resting pose.
"""
from pathlib import Path
import json, runpy
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[3]
source = root.parent / 'output/100next-master-branch-v2'
dest = root / 'public/assets/social-club/master-animation-v2'
helpers = runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))
data = json.loads((dest / 'manifest.json').read_text())
checks = []
for slug, character in data['characters'].items():
    boxes = [(953,629,1081,677)] if slug=='bianca' else helpers['EYES'][slug]
    allowed = np.zeros((2048,2048),bool)
    for x0,y0,x1,y1 in boxes: allowed[y0:y1,x0:x1] = True
    lids = {key:Image.open(source/slug/(key+'.png')).convert('RGBA') for key in ['blink-half','blink']}
    for pose in ['rest','down','nervous','panicked','amused','smug','frustrated','defeated','release']:
        base = Image.open(source/slug/(pose+'.png')).convert('RGBA')
        frames = []
        for key, lid in lids.items():
            name = key if pose=='rest' else pose+'-'+key
            frames.append(name)
            if pose=='rest': continue
            frame = base.copy()
            for box in boxes: frame.paste(lid.crop(box),(box[0],box[1]))
            frame.putalpha(base.getchannel('A'))
            original, edited = np.array(base),np.array(frame)
            assert np.array_equal(original[~allowed],edited[~allowed]), (slug,pose,'body or mouth changed')
            assert np.array_equal(original[:,:,3],edited[:,:,3]), (slug,pose,'silhouette changed')
            x,y,w,h = character['bounds'][pose]
            crop = frame.crop((x,y,x+w,y+h))
            file = dest/slug/(name+'.webp')
            crop.save(file,lossless=True,exact=True,method=6)
            decoded = np.array(Image.open(file).convert('RGBA'))
            visible = np.array(crop.getchannel('A'))>0
            assert np.array_equal(np.array(crop)[visible],decoded[visible])
            character['bounds'][name] = [x,y,w,h]
            checks.append({'character':slug,'frame':name,'onlyEyesChanged':True,'nativePixelsPreserved':True})
        character['clips']['blink-'+pose] = {'frames':[frames[0],frames[1],frames[0],pose],'durations':[45,110,45,50]}
    print(slug,'pose-preserving blinks exported',flush=True)
(dest/'manifest.json').write_text(json.dumps(data,indent=2)+'\n')
(dest/'blink-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
(root/'src/ui/MasterAnimationData.ts').write_text('// Complete master-derived drawings; cropped empty padding is restored inside a fixed 2048 frame.\nexport interface MasterAnimationSet { clips: Record<string,{frames:string[];durations:number[]}>; emotions: Record<string,string>; bounds:Record<string,number[]> }\nexport const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(data['characters'],separators=(',',':'))+';\n')
