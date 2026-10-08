"""Validate local eye edits leave the rest of each complete sprite intact."""
from pathlib import Path
import json,runpy
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'public/assets/social-club/condition-animation-v1'
EYES=runpy.run_path(str(ROOT/'scripts/assets/social-club/build-master-reactions.py'))['EYES']
expanded=json.loads((ROOT/'scripts/assets/social-club/expanded-cast-calibration.json').read_text())
m=json.loads((DEST/'manifest.json').read_text());checks=[]
def image(id,stage,data,frame):
 x,y,w,h=data['bounds'][frame];full=Image.new('RGBA',(2048,2048));full.alpha_composite(Image.open(DEST/id/stage/(frame+'.webp')),(x,y));return full
for id,stages in m['characters'].items():
 if id in EYES:points=[[(b[0]+b[2])/2,(b[1]+b[3])/2] for b in EYES[id]]
 elif id=='vera':points=[[994.5,659.5],[1054.5,669]]
 else:points=[[(b[0]+b[2])/2+397,(b[1]+b[3])/2+362] for b in expanded[id]['eyes']]
 allowed=np.zeros((2048,2048),bool)
 for x,y in points:allowed[int(y-46):int(y+46),int(x-56):int(x+56)]=True
 for stage,data in stages.items():
  for base,frames in [('rest',['rest-blink','rest-blink-half','left','left-mid','right','right-mid','down','down-mid']),('release',['release-blink','release-blink-half']),('down',['down-blink','down-blink-half'])]:
   original=image(id,stage,data,base);a=np.array(original)
   for frame in frames:
    full=image(id,stage,data,frame);b=np.array(full)
    # Eye colors can change; original alpha and every non-eye pixel are protected.
    if not np.array_equal(a[:,:,3],b[:,:,3]):
     full.putalpha(original.getchannel('A'));x,y,w,h=data['bounds'][frame];full.crop((x,y,x+w,y+h)).save(DEST/id/stage/(frame+'.webp'),lossless=True,exact=True,method=4);b=np.array(full)
    assert np.array_equal(a[:,:,3],b[:,:,3]),(id,stage,frame,'silhouette changed')
    changed=np.any(a!=b,axis=2)
    assert np.any(changed),(id,stage,frame,'empty animation')
    assert not changed[~allowed].any(),(id,stage,frame,'non-eye painting changed')
    checks.append({'id':id,'stage':int(stage),'frame':frame,'alphaIdentical':True,'protectedPixelsIdentical':True,'changedPixels':int(changed.sum())})
    decoded=Image.open(DEST/id/stage/(frame+'.webp'));assert not getattr(decoded,'is_animated',False)
m['eyeChecks']=checks
(DEST/'manifest.json').write_text(json.dumps(m,separators=(',',':')))
print(f'Passed {len(checks)} local eye frames: silhouette and every non-eye pixel are unchanged.')
