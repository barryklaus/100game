"""Whole-character tumble trial with the approved master's head reused.

The two larger body-pose drawings are donor artwork, not claimed to be
unchanged master pixels. Every pose shares the master's physical eye/skull
unit and reuses its actual head painting. Export complete flattened frames.
"""
from pathlib import Path
import json,runpy
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-master-branch-v1/finn'
MASTER=ROOT.parent/'output/100next-character-masters/chair-free-v1/finn-master-v2.png'
preview_gif=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))['preview_gif']
master=Image.open(MASTER).convert('RGBA')
TARGET_EYES=np.array([[998.0,659.0],[1055.5,661.0]])

def affine(im,m,offset,size=(2048,2048)):
 inv=np.linalg.inv(m);t=-inv@offset
 return im.transform(size,Image.Transform.AFFINE,(inv[0,0],inv[0,1],t[0],inv[1,0],inv[1,1],t[1]),Image.Resampling.BICUBIC)

def physical_pose(file,eyes,head_polygon,bottom):
 donor=Image.open(file).convert('RGBA')
 a=np.array(donor);a[a[:,:,3]<24,3]=0;donor=Image.fromarray(a)
 eyes=np.array(eyes,float)
 ref=TARGET_EYES[1]-TARGET_EYES[0];direction=eyes[1]-eyes[0]
 scale=float(np.linalg.norm(ref)/np.linalg.norm(direction))
 angle=float(np.arctan2(direction[1],direction[0])-np.arctan2(ref[1],ref[0]))
 solid=a[:,:,3]>128;ys,xs=np.where(solid)
 dx=1024-scale*(xs.min()+xs.max())/2
 dy=bottom-scale*ys.max()
 body_m=np.eye(2)*scale;offset=np.array([dx,dy])
 head_erase=Image.new('L',donor.size);ImageDraw.Draw(head_erase).polygon(head_polygon,fill=255)
 # Erase the old donor head so it cannot enlarge or leave a second outline.
 alpha=np.array(donor.getchannel('A'));alpha[np.array(head_erase)>0]=0;donor.putalpha(Image.fromarray(alpha))
 body=affine(donor,body_m,offset)
 head=master.copy()
 # Only borrow the open mouth; the original jaw/skull/eyes/hair remain.
 front_rotation=np.array([[np.cos(-angle),-np.sin(-angle)],[np.sin(-angle),np.cos(-angle)]])*scale
 front_offset=TARGET_EYES.mean(axis=0)-front_rotation@eyes.mean(axis=0)
 face_donor=affine(Image.open(file).convert('RGBA'),front_rotation,front_offset)
 mouth=Image.new('L',master.size);ImageDraw.Draw(mouth).rounded_rectangle((998,695,1061,741),radius=6,fill=255)
 mouth=mouth.filter(ImageFilter.GaussianBlur(2))
 head=Image.composite(face_donor,head,mouth)
 alpha=np.array(master.getchannel('A')).astype(float)
 for row in range(790,816):alpha[row]*=max(0,(815-row)/25)
 alpha[816:]=0;head.putalpha(Image.fromarray(alpha.astype('uint8')))
 # The master head gets rotation and translation only: physical scale=1.
 rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
 pupil_world=eyes.mean(axis=0)*scale+offset
 shift=pupil_world-rotation@TARGET_EYES.mean(axis=0)
 head_layer=affine(head,rotation,shift)
 body.alpha_composite(head_layer)
 return body,{'bodyDonor':str(file),'bodyScaleFromMasterEyeDistance':scale,'masterHeadScale':1,'masterHeadRotationDegrees':float(angle*180/np.pi),'headPolicy':'same original head pixels, rotated and translated; donor head discarded','bodyPolicy':'new larger-pose body artwork, calibrated to master; needs motion review'}

mid,mid_check=physical_pose(OUT/'midfall-generated.png',[(563,403),(613,400)],[(478,283),(619,280),(682,316),(692,397),(671,472),(610,493),(550,483),(501,452),(477,377)],1460)
floor,floor_check=physical_pose(OUT/'floor-generated.png',[(448.5,797.5),(490.5,773.5)],[(351,722),(403,674),(495,674),(546,712),(557,773),(551,838),(531,879),(486,885),(420,861),(371,825),(351,779)],1535)
one=Image.open(OUT/'throw-release-locked.png').convert('RGBA')
frames={'start':one,'midfall':mid,'floor':floor}
for label,degrees,dy in [('recoil',-8,20),('fall-start',-19,92)]:
 angle=degrees*np.pi/180;m=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
 anchor=np.array([1024,1110]);offset=anchor-m@anchor+np.array([0,dy])
 frames[label]=affine(one,m,offset)
for label,degrees,dy in [('airfall',-12,120),('airfall-low',-24,210)]:
 angle=degrees*np.pi/180;m=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
 anchor=np.array([1024,1180]);offset=anchor-m@anchor+np.array([0,dy])
 frames[label]=affine(mid,m,offset)
frames['impact']=affine(floor,np.eye(2),np.array([0,7]))
frames['bounce']=affine(floor,np.eye(2),np.array([0,-10]))
for key,frame in frames.items():
 frame.save(OUT/(key+'-tumble.png'))
 frame.save(OUT/(key+'-tumble.webp'),lossless=True,exact=True,method=6)
ids=['start','recoil','fall-start','midfall','airfall','airfall-low','floor','impact','bounce','floor']
durations=[500,100,80,70,65,65,80,60,90,1200]
preview_gif(frames,ids,durations,OUT/'master-tumble-trial.gif')
(OUT/'tumble-review.json').write_text(json.dumps({'status':'master-head-locked larger-pose trial, not integrated into live game','source':str(MASTER),'checks':[mid_check,floor_check],'clip':{'frames':ids,'durations':durations}},indent=2)+'\n')
print(json.dumps({'frames':len(frames),'headScale':1,'status':'review'}),flush=True)
