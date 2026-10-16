"""Pixel-preserving copperplate finish for the complete existing character frames.

No anatomy, alpha, dimensions, frame bounds, or animation timing is changed.
Hatching is anchored in the existing full-character coordinate space so blinks
retain the exact same print outside the eyes. No separate limbs or runtime filters.
"""
from pathlib import Path
import json
import argparse
import hashlib
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'public/assets/social-club/engraved-v1'

def sources():
    root=ROOT/'public/assets/social-club'
    entries=[]
    for family in ['master-animation-v2','condition-animation-v1','special-throw-v1']:
        characters=json.loads((root/family/'manifest.json').read_text())['characters']
        for id,data in characters.items():
            stages=data.items() if family=='condition-animation-v1' else [(0,data)]
            for stage,poses in stages:
                folder=f'{family}/{id}'+(f'/{stage}' if stage else '')
                for frame,bounds in poses['bounds'].items():
                    entries.append({'id':id,'frame':frame,'condition':int(stage),'bounds':bounds,'source':f'assets/social-club/{folder}/{frame}.webp'})
    return entries

def finish(entry):
    source=ROOT/'public'/entry['source']
    image=Image.open(source).convert('RGBA')
    a=np.asarray(image).copy()
    rgb=a[:,:,:3].astype(np.float32)/255
    h,w=a.shape[:2]
    x0,y0,bw,bh=entry['bounds']
    x=x0+np.arange(w,dtype=np.float32)*bw/w
    y=y0+np.arange(h,dtype=np.float32)*bh/h
    xx,yy=np.meshgrid(x,y)
    luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    # Retain the original colors and ink contours; warm the paper highlights.
    paper=np.array([1,.935,.80],np.float32)
    warm=rgb*.88+luma[:,:,None]*paper*.12
    skin=(rgb[:,:,0]>rgb[:,:,1]*1.11)&(rgb[:,:,0]>rgb[:,:,2]*1.28)&(luma>.38)
    warm=np.where(skin[:,:,None],warm*.84+paper*.16,warm)
    # Etch shading, without a global brightness/scale pulse between frames.
    shade=np.clip((.88-luma)/.65,0,1)
    first=((xx+yy*.72)%12)<1.25
    cross=((xx-yy*.82)%15)<1.1
    hatch=first*shade*.36+cross*np.clip((.48-luma)/.4,0,1)*.24
    lightScratch=(((xx+yy*.72)%12)>10.9)&(luma<.20)
    grain=((np.sin(xx*12.9898+yy*78.233)*43758.5453)%1-.5)*.024
    warm=warm*(1-hatch[:,:,None])+lightScratch[:,:,None]*np.array([.032,.024,.012])
    warm=np.clip(warm+grain[:,:,None],0,1)
    a[:,:,:3]=(warm*255+.5).astype(np.uint8)
    # Alpha is intentionally copied byte-for-byte from the source.
    tail=entry['source'].split('assets/social-club/',1)[1]
    destination=DEST/tail
    destination.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(a).save(destination,quality=96,method=4,exact=True)
    exported=Image.open(destination).convert('RGBA')
    assert np.array_equal(np.asarray(exported)[:,:,3],a[:,:,3]), destination
    return {'source':entry['source'],'output':'assets/social-club/engraved-v1/'+tail,'width':w,'height':h,'alphaSha256':hashlib.sha256(a[:,:,3].tobytes()).hexdigest()}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--trial',action='store_true');args=parser.parse_args()
    entries=sources()
    if not args.trial:
        for source in sorted((ROOT/'public/assets/social-club/masters-native-v1').glob('*-master.webp'))+sorted((ROOT/'public/assets/social-club/masters-v1').glob('*-portrait*.webp')):
            with Image.open(source) as image: w,h=image.size
            entries.append({'source':source.relative_to(ROOT/'public').as_posix(),'bounds':[0,0,w,h]})
    if args.trial: entries=[e for e in entries if e['id'] in ['tess','edgar','otis','roxie'] and e['frame']=='rest' and e['condition']==0]
    DEST.mkdir(parents=True,exist_ok=True)
    with ProcessPoolExecutor(max_workers=4) as pool:
        results=[]
        for index,result in enumerate(pool.map(finish,entries)):
            results.append(result)
            if index%100==0: print(f'{index+1}/{len(entries)} frames',flush=True)
    (DEST/('trial.json' if args.trial else 'manifest.json')).write_text(json.dumps({'version':'engraved-v1','pixelPreserving':True,'frames':results},indent=2)+'\n')
    print(f'Finished {len(results)} whole-character frames',flush=True)
