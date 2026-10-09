"""Verify decoded whole sprites, independently of repair claims in metadata."""
from pathlib import Path
import sys,json,runpy
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';O=R.parent/'output/animation-audit-2026-10-09-round2';m=json.loads((P/'master-animation-v2/manifest.json').read_text())['characters'];c=json.loads((P/'condition-animation-v1/manifest.json').read_text())['characters'];report=json.loads((P/'animation-visual-audit-v2.json').read_text());EYES=runpy.run_path(str(Path(__file__).with_name('eyelids.py')))['EYES']
regions={(x['id'],x['stage'],x['closed']):x['regions'] for x in report['repairs'] if 'closed' in x and 'regions' in x}
def full(w,s,f):
 d=c[w][str(s)] if s else m[w];x,y,ww,hh=d['bounds'][f];rel=Path('condition-animation-v1')/w/str(s)/(f+'.webp') if s else Path('master-animation-v2')/w/(f+'.webp');im=Image.new('RGBA',(2048,2048));im.alpha_composite(Image.open(P/rel).convert('RGBA'),(x,y));return np.array(im)
count=0
for w in m:
 for s in range(4):
  d=c[w][str(s)] if s else m[w]
  for key,cl in d['clips'].items():
   if not key.startswith('blink-'):continue
   a,b=full(w,s,cl['frames'][0]),full(w,s,cl['frames'][1]);mask=np.zeros((2048,2048),bool)
   for x,y,r,bottom in regions.get((w,s,cl['frames'][1]),[[x-22,y-22,r+22,b+22] for x,y,r,b in EYES[w]]):mask[y:bottom,x:r]=True
   assert np.array_equal(a[:,:,3],b[:,:,3]),(w,s,key,'alpha changed')
   assert np.array_equal(a[~mask],b[~mask]),(w,s,key,'non-eye pixels changed')
   count+=1
  print(w,'decoded blink pixels verified',flush=True)
# Re-measure repaired action/fall drawings using their face features, rather
# than trusting the inverse scale factor written by the repair program.
sift=cv2.SIFT_create(nfeatures=1800,contrastThreshold=.02);measurements=[]
for row in report['repairs']:
 if row['method']!='whole pose registration':continue
 w,s,f=row['id'],row['stage'],row['frame'];a,b=full(w,s,'rest'),full(w,s,f);cx,cy=np.array(EYES[w]).reshape(2,2,2).mean((0,1)).astype(int);mask=np.zeros((2048,2048),np.uint8);mask[cy-150:cy+130,cx-170:cx+170]=a[cy-150:cy+130,cx-170:cx+170,3];ka,da=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGBA2GRAY),mask);kb,db=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_RGBA2GRAY),None);good=[p for p,q in cv2.BFMatcher().knnMatch(da,db,k=2) if p.distance<q.distance*.77];M,ins=cv2.estimateAffinePartial2D(np.float32([ka[p.queryIdx].pt for p in good]),np.float32([kb[p.trainIdx].pt for p in good]),method=cv2.RANSAC,ransacReprojThreshold=4);ratio=float(np.hypot(M[0,0],M[1,0]));n=int(ins.sum());measurements.append({'id':w,'stage':s,'frame':f,'scale':ratio,'inliers':n})
 data=c[w][str(s)] if s else m[w];displayed=ratio*data.get('poseRegistration',{}).get(f,[1,0,0])[0];measurements[-1]['displayedScale']=displayed
 if n>=12:assert abs(displayed-1)<.035,(w,s,f,'displayed scale remains inconsistent',displayed,n)
print('Verified',count,'decoded blink pairs and',len(measurements),'repaired pose scales',flush=True)
(O/'decoded-verification.json').write_text(json.dumps({'blinkPairs':count,'poseScales':measurements},indent=2)+'\n')
