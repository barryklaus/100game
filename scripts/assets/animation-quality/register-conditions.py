"""Match whole-character display units across healthy/injured drawings.

The native lossless images are preserved. One constant scale/translation per
condition also transforms its card anchors, every action and every blink.
"""
from pathlib import Path
import json,runpy,sys
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';m=json.loads((P/'master-animation-v2/manifest.json').read_text())['characters'];cp=P/'condition-animation-v1/manifest.json';c=json.loads(cp.read_text());ap=P/'animation-visual-audit-v2.json';audit=json.loads(ap.read_text());eyes=runpy.run_path(str(Path(__file__).with_name('eyelids.py')))['EYES'];sift=cv2.SIFT_create(nfeatures=1800,contrastThreshold=.02);rows=[]
def image(w,s):
 d=c['characters'][w][str(s)] if s else m[w];x,y,ww,hh=d['bounds']['rest'];im=Image.new('RGBA',(2048,2048));p=P/'condition-animation-v1'/w/str(s)/'rest.webp' if s else P/'master-animation-v2'/w/'rest.webp';im.alpha_composite(Image.open(p),(x,y));return np.array(im)
for w in m:
 a=image(w,0);center=np.array(eyes[w]).reshape(2,2,2).mean((0,1));cx,cy=center.astype(int);mask=np.zeros((2048,2048),np.uint8);mask[cy-150:cy+130,cx-170:cx+170]=a[cy-150:cy+130,cx-170:cx+170,3];ka,da=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGBA2GRAY),mask)
 for s in [1,2,3]:
  d=c['characters'][w][str(s)];d.pop('registration',None);b=image(w,s);kb,db=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_RGBA2GRAY),None);good=[p for p,q in cv2.BFMatcher().knnMatch(da,db,k=2) if p.distance<q.distance*.77];M,ins=cv2.estimateAffinePartial2D(np.float32([ka[p.queryIdx].pt for p in good]),np.float32([kb[p.trainIdx].pt for p in good]),method=cv2.RANSAC,ransacReprojThreshold=4);ratio=float(np.hypot(M[0,0],M[1,0]));row={'id':w,'stage':s,'inliers':int(ins.sum()),'scale':ratio};rows.append(row)
  if row['inliers']>=12 and abs(ratio-1)>.03:
   source=M@np.array([*center,1]);k=1/ratio;dx,dy=center-source*k;d['registration']=[float(k),float(dx),float(dy)];audit['repairs'].append({'id':w,'stage':s,'method':'whole-condition display registration','sourceScale':ratio,'correction':k,'inliers':row['inliers'],'sourceCenter':source.tolist(),'targetCenter':center.tolist(),'registration':d['registration']});print(w,s,'whole-condition scale',round(k,3),flush=True)
cp.write_text(json.dumps(c,indent=2)+'\n');audit['conditionTransitions']=rows;ap.write_text(json.dumps(audit,indent=2)+'\n');ts=R/'src/ui/ConditionAnimationData.ts';prefix=ts.read_text().split('export const conditionAnimations')[0];payload={w:{s:{k:v for k,v in d.items() if k!='frameCards'} for s,d in stages.items()} for w,stages in c['characters'].items()};ts.write_text(prefix+'export const conditionAnimations: Record<string, Record<number, MasterAnimationSet>> = '+json.dumps(payload,separators=(',',':'))+';\n')
print('Condition registration complete',flush=True)
