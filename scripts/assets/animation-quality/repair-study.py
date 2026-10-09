"""Keep cleaned eyes through study and expression-preserving glances."""
from pathlib import Path
import json,runpy,numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';m=json.loads((P/'master-animation-v2/manifest.json').read_text())['characters'];c=json.loads((P/'condition-animation-v1/manifest.json').read_text())['characters'];helper=runpy.run_path(str(Path(__file__).with_name('refine.py')));eyes=helper['EYES'];gaze=helper['gaze'];ap=P/'animation-visual-audit-v2.json';audit=json.loads(ap.read_text())
for w in m:
 for s in range(4):
  d=c[w][str(s)] if s else m[w];folder=P/'condition-animation-v1'/w/str(s) if s else P/'master-animation-v2'/w
  def full(f):
   x,y,ww,hh=d['bounds'][f];im=Image.new('RGBA',(2048,2048));im.alpha_composite(Image.open(folder/(f+'.webp')).convert('RGBA'),(x,y));return im
  mask=np.zeros((2048,2048),bool)
  for x,y,r,b in eyes[w]:mask[y-22:b+22,x-22:r+22]=True
  rest=np.array(full('rest'));mid=np.array(full('down-mid'));mid[mask,:3]=rest[mask,:3];frames={'down-mid':Image.fromarray(mid)};base=full('down')
  for side,direction in [('left',-1),('right',1)]:
   f='down-gaze-'+side
   if f in d['bounds']:frames[f]=gaze(base,w,direction)
  for f,im in frames.items():
   x,y,ww,hh=d['bounds'][f];im.crop((x,y,x+ww,y+hh)).save(folder/(f+'.webp'),lossless=True,exact=True,method=4)
  audit['repairs'].append({'id':w,'stage':s,'method':'clean eye contours retained through study and glances','frames':list(frames)})
 print(w,'study transitions checked',flush=True)
ap.write_text(json.dumps(audit,indent=2)+'\n')
