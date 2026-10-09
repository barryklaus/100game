"""Final contour review: remove duplicate gaze rims and incomplete iris edges."""
from pathlib import Path
import sys,json,runpy,os
sys.path.insert(0,'/tmp/100next-motion-tools')
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';O=R.parent/'output/animation-audit-2026-10-09-round2';S=O/'final-eyes';H=runpy.run_path(str(Path(__file__).with_name('eyelids.py')));EYES=H['EYES'];clean_eye=H['clean_eye'];mp=P/'master-animation-v2/manifest.json';cp=P/'condition-animation-v1/manifest.json';m=json.loads(mp.read_text());c=json.loads(cp.read_text());ap=P/'animation-visual-audit-v2.json';audit=json.loads(ap.read_text())
def rel(w,s,f):return Path('condition-animation-v1')/w/str(s)/(f+'.webp') if s else Path('master-animation-v2')/w/(f+'.webp')
def full(w,s,f,d):
 x,y,ww,hh=d['bounds'][f];im=Image.new('RGBA',(2048,2048));im.alpha_composite(Image.open(P/rel(w,s,f)).convert('RGBA'),(x,y));return im
for w in m['characters']:
 for s in range(4):
  d=c['characters'][w][str(s)] if s else m['characters'][w];cache={};allowed=np.zeros((2048,2048),bool)
  for x,y,r,b in EYES[w]:allowed[y-22:b+22,x-22:r+22]=True
  def get(f):
   if f not in cache:cache[f]=full(w,s,f,d)
   return cache[f]
  # The old down-look drawing painted a second white outline over each eye.
  # Restore that condition's clean eye drawing, retaining its mouth/body.
  a=np.array(get('down'));rest=np.array(get('rest'));a[allowed,:3]=rest[allowed,:3];cache['down']=Image.fromarray(a)
  audit['repairs'].append({'id':w,'stage':s,'method':'duplicate down-look eye contours removed','frame':'down'})
  changed={'down'}
  for key,cl in d['clips'].items():
   if not key.startswith('blink-'):continue
   pose=cl['frames'][0];closed=cl['frames'][1]
   if pose=='whole-throw-6':continue # Registered in action-eyelids.py.
   base=get(pose);out=base.copy();regions=[]
   if w in ['bianca','leon']:
    old=np.array(get(closed));a=np.array(base);a[allowed,:3]=old[allowed,:3];out=Image.fromarray(a)
    regions=[[x-22,y-22,r+22,b+22] for x,y,r,b in EYES[w]]
   else:
    for eye in range(2):
     repaired,box=clean_eye(out,w,eye);out=repaired;regions.append(box)
   a,b=np.array(base),np.array(out);mask=np.zeros((2048,2048),bool)
   for x,y,r,bottom in regions:mask[y:bottom,x:r]=True
   assert np.array_equal(a[:,:,3],b[:,:,3]);assert np.array_equal(a[~mask],b[~mask]);cache[closed]=out;changed.add(closed)
   audit['repairs'].append({'id':w,'stage':s,'method':'final eyelid contour','base':pose,'closed':closed,'regions':regions,'alphaIdentical':True,'protectedPixelsIdentical':True})
  for f in changed:
   im=cache[f];x,y,ww,hh=d['bounds'][f];box=(x,y,x+ww,y+hh);p=S/rel(w,s,f);p.parent.mkdir(parents=True,exist_ok=True);im.crop(box).save(p,lossless=True,exact=True,method=4)
  print(w,s,'eye contours checked',flush=True)
for p in S.rglob('*.webp'):os.replace(p,P/p.relative_to(S))
ap.write_text(json.dumps(audit,indent=2)+'\n')
runpy.run_path(str(Path(__file__).with_name('action-eyelids.py')),run_name='__main__')
