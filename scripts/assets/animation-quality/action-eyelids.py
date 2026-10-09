"""Register eyelids to the action pose, including its changed head position."""
from pathlib import Path
import sys,json,runpy
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';H=runpy.run_path(str(Path(__file__).with_name('eyelids.py')));EYES=H['EYES'];clean_eye=H['clean_eye'];mp=P/'master-animation-v2/manifest.json';m=json.loads(mp.read_text());ap=P/'animation-visual-audit-v2.json';audit=json.loads(ap.read_text())
def full(w,f,d):
 x,y,ww,hh=d['bounds'][f];im=Image.new('RGBA',(2048,2048));im.alpha_composite(Image.open(P/'master-animation-v2'/w/(f+'.webp')).convert('RGBA'),(x,y));return im
for who,d in m['characters'].items():
 pose='whole-throw-6'
 if pose not in d['bounds']:continue
 ref=np.array(full(who,'rest',d));target=full(who,pose,d);b=np.array(target);cx,cy=np.array(EYES[who]).reshape(2,2,2).mean((0,1)).astype(int);mask=np.zeros((2048,2048),np.uint8);mask[cy-150:cy+130,cx-170:cx+170]=ref[cy-150:cy+130,cx-170:cx+170,3]
 sift=cv2.SIFT_create(nfeatures=1800,contrastThreshold=.02);ka,da=sift.detectAndCompute(cv2.cvtColor(ref,cv2.COLOR_RGBA2GRAY),mask);kb,db=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_RGBA2GRAY),None);good=[p for p,q in cv2.BFMatcher().knnMatch(da,db,k=2) if p.distance<q.distance*.77];M,ins=cv2.estimateAffinePartial2D(np.float32([ka[p.queryIdx].pt for p in good]),np.float32([kb[p.trainIdx].pt for p in good]),method=cv2.RANSAC,ransacReprojThreshold=4);assert M is not None and ins.sum()>=12,(who,'action eye registration')
 boxes=[]
 for x,y,r,bottom in EYES[who]:
  points=np.array([[x,y,1],[r,y,1],[x,bottom,1],[r,bottom,1]])@M.T;boxes.append([int(points[:,0].min()),int(points[:,1].min()),int(points[:,0].max()),int(points[:,1].max())])
 closed=d['clips']['blink-'+pose]['frames'][1];result=target.copy();allowed=np.zeros((2048,2048),bool);regions=[]
 for eye in range(2):
  repaired,box=clean_eye(result,who,eye,eye_boxes=boxes,preserve_rim=who=='bianca');result=repaired
  x,y,r,bottom=box;allowed[y:bottom,x:r]=True;regions.append(box)
 a,b=np.array(target),np.array(result);assert np.array_equal(a[:,:,3],b[:,:,3]);assert np.array_equal(a[~allowed],b[~allowed]);box=result.getchannel('A').getbbox();x,y,r,bottom=box;d['bounds'][closed]=[x,y,r-x,bottom-y];result.crop(box).save(P/'master-animation-v2'/who/(closed+'.webp'),lossless=True,exact=True,method=4)
 audit['repairs'].append({'id':who,'stage':0,'method':'action-pose eyelid registration','base':pose,'closed':closed,'eyeBoxes':boxes,'regions':regions,'inliers':int(ins.sum()),'alphaIdentical':True,'protectedPixelsIdentical':True});print(who,'action eyes registered',int(ins.sum()),flush=True)
mp.write_text(json.dumps(m,indent=2)+'\n');ap.write_text(json.dumps(audit,indent=2)+'\n');ts=R/'src/ui/MasterAnimationData.ts';prefix=ts.read_text().split('export const masterAnimations')[0];ts.write_text(prefix+'export const masterAnimations: Record<string, MasterAnimationSet> = '+json.dumps(m['characters'],separators=(',',':'))+';\n')
