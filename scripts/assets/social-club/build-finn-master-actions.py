"""Composite localized card actions into the original full-resolution Finn.

Generative donors are working-region references only. Their redrawn heads,
torsos and legs are discarded. No separated body parts ship at runtime.
"""
from pathlib import Path
import json
import runpy
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
preview_gif=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))['preview_gif']

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-master-branch-v1/finn'
MASTER=ROOT.parent/'output/100next-character-masters/chair-free-v1/finn-master-v2.png'

def white_centers(im,roi):
 a=np.array(im.crop(roi).convert('RGB')).astype(int)
 white=(a.min(axis=2)>190)&(np.ptp(a,axis=2)<55)
 seen=np.zeros(white.shape,bool);components=[]
 for y,x in zip(*np.where(white)):
  if seen[y,x]:continue
  todo=[(y,x)];seen[y,x]=1;points=[]
  while todo:
   yy,xx=todo.pop();points.append((yy,xx))
   for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
    ny,nx=yy+dy,xx+dx
    if 0<=ny<white.shape[0] and 0<=nx<white.shape[1] and white[ny,nx] and not seen[ny,nx]:seen[ny,nx]=1;todo.append((ny,nx))
  if len(points)>60:
   p=np.array(points);center=(p.min(axis=0)+p.max(axis=0))/2
   components.append((len(points),np.array([center[1]+roi[0],center[0]+roi[1]])))
 return sorted([x[1] for x in sorted(components,key=lambda x:x[0],reverse=True)[:2]],key=lambda x:x[0])

def register(donor,master):
 source=white_centers(donor,(540,335,700,420))
 target=white_centers(master,(950,632,1090,690))
 assert len(source)==len(target)==2
 src=source[1]-source[0];dst=target[1]-target[0]
 scale=np.linalg.norm(dst)/np.linalg.norm(src)
 angle=np.arctan2(dst[1],dst[0])-np.arctan2(src[1],src[0])
 m=scale*np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
 offset=target[0]-m@source[0]
 inv=np.linalg.inv(m);shift=-inv@offset
 affine=(inv[0,0],inv[0,1],shift[0],inv[1,0],inv[1,1],shift[1])
 return donor.transform(master.size,Image.Transform.AFFINE,affine,Image.Resampling.BICUBIC),{'scale':float(scale),'rotation':float(angle),'offset':offset.tolist(),'method':'eye-landmark registration of donor; never fit the full silhouette'}

master=Image.open(MASTER).convert('RGBA');base=np.array(master)
mask=Image.new('L',master.size)
# Includes the held cards and working wrist, with seams inside the shirt.
polygon=[(919,816),(1025,811),(1060,779),(1120,779),(1208,865),(1342,906),(1330,1045),(1220,1090),(1080,1080),(1008,1008),(917,1008)]
ImageDraw.Draw(mask).polygon(polygon,fill=255)
mask=mask.filter(ImageFilter.GaussianBlur(3))
ImageDraw.Draw(mask).rectangle((0,0,2048,769),fill=0)
allowed=np.array(mask)>0
frames={'rest':master}
checks=[]
for key in ['throw-prepare','throw-release']:
 donor=Image.open(OUT/(key+'-generated.png')).convert('RGBA')
 registered,alignment=register(donor,master)
 frame=Image.composite(registered,master,mask)
 a=np.array(frame)
 assert np.array_equal(a[~allowed],base[~allowed]),key
 assert np.array_equal(a[:770],base[:770]),'master head changed'
 assert np.array_equal(a[1110:],base[1110:]),'master lower body changed'
 bounds=frame.getchannel('A').getbbox()
 assert min(bounds[0],bounds[1],2048-bounds[2],2048-bounds[3])>=500
 frame.save(OUT/(key+'-locked.png'))
 frame.save(OUT/(key+'-locked.webp'),lossless=True,exact=True,method=6)
 frames[key]=frame
 checks.append({'frame':key,'protectedPixelsIdentical':True,'headPixelsIdentical':True,'lowerBodyPixelsIdentical':True,'alignment':alignment,'bounds':bounds,'workingRegion':polygon})
preview_gif(frames,['rest','throw-prepare','throw-release','throw-prepare','rest'],[650,140,450,160,650],OUT/'master-card-actions.gif')
(OUT/'actions-review.json').write_text(json.dumps({'status':'localized donor-composite test; inspect seam and fingers before production','source':str(MASTER),'checks':checks},indent=2)+'\n')
print(json.dumps(checks),flush=True)
