"""Targeted complete-frame eyelid repair. Never changes non-eye pixels."""
from pathlib import Path
import sys,runpy,json
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
R=Path(__file__).resolve().parents[3];H=runpy.run_path(str(R/'scripts/assets/animation-quality/refine.py'));EYES=H['EYES'];P=R/'public/assets/social-club';O=R.parent/'output/animation-audit-2026-10-09-round2';meta=json.loads((P/'condition-animation-v1/manifest.json').read_text())['characters']
def full(who,stage,name):
 d=meta[who][str(stage)];x,y,w,h=d['bounds'][name];im=Image.new('RGBA',(2048,2048));im.alpha_composite(Image.open(P/'condition-animation-v1'/who/str(stage)/(name+'.webp')),(x,y));return im

def clean_eye(base,who,eye,amount=1,closed=None,eye_boxes=None,preserve_rim=False):
 a=np.array(base);x0,y0,x1,y1=(eye_boxes or EYES[who])[eye];x,y,r,b=x0-18,y0-18,x1+18,y1+18;p=a[y:b,x:r].copy();rgb=p[:,:,:3].astype(float);yy,xx=np.indices(p.shape[:2]);inside=(xx>=18-4)&(xx<=x1-x0+18+4)&(yy>=18-3)&(yy<=y1-y0+18+3)
 white=(rgb.min(2)>170)&(np.ptp(rgb,axis=2)<80)&inside
 py,px=np.where(white)
 if len(px)<=10:return base.copy(),[x,y,r,b] # Delighted drawings already have closed eyes.
 # A complete oval covers the original iris AND outer eye rim. Skin is
 # reconstructed continuously from this condition's surrounding colours.
 mask=np.zeros(p.shape[:2],np.uint8);hull=cv2.convexHull(np.stack([px,py],axis=1).astype('int32'));cv2.fillConvexPoly(mask,hull,255)
 mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3) if preserve_rim else (15,15)));active=mask>0
 boundary=cv2.inpaint(rgb.astype('uint8'),(rgb.max(2)<65).astype('uint8')*255,5,cv2.INPAINT_NS).astype(float)
 rgbfill=boundary.copy();rgbfill[active]=np.median(boundary[~active],axis=0)
 for _ in range(600):
  avg=(np.roll(rgbfill,1,0)+np.roll(rgbfill,-1,0)+np.roll(rgbfill,1,1)+np.roll(rgbfill,-1,1))*.25
  rgbfill[active]=avg[active]
 fill=np.clip(rgbfill,0,255).astype('uint8')
 lid=py.min()+(py.max()-py.min())*(.6 if amount==1 else .45)
 use=mask.copy()
 if amount<1:use[int(lid)+2:]=0
 target=p
 merged=Image.composite(Image.fromarray(fill),Image.fromarray(target[:,:,:3]),Image.fromarray(use).filter(ImageFilter.GaussianBlur(.65))).convert('RGBA')
 marks=Image.new('RGBA',(p.shape[1]*4,p.shape[0]*4));draw=ImageDraw.Draw(marks);left,right=px.min()-1,px.max()+1;pts=[((left+(right-left)*t)*4,(lid+2.6*np.sin(np.pi*t))*4) for t in np.linspace(0,1,35)];draw.line(pts,fill=(38,25,25,255),width=10)
 merged.alpha_composite(marks.resize(merged.size,Image.Resampling.LANCZOS));p[:,:,:3]=np.array(merged)[:,:,:3];a[y:b,x:r]=p
 return Image.fromarray(a),[x,y,r,b]
