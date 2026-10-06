"""Repair Bianca's eyelids inside her original glasses, without moving the rim.

Complete lens-shaped cleanup replaces the previous rectangular eye wipe.
All edits are native-resolution and all other character artwork is preserved.
"""
from pathlib import Path
import json, runpy, sys
sys.path.insert(0, '/tmp/100next-motion-tools')
import numpy as np
import cv2
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'public/assets/social-club/master-animation-v2'
OUT=ROOT.parent/'output/mouth-line-repair'
BOX=(953,629,1081,677)
LENSES=[[(960,631),(973,632),(988,636),(1004,645),(1017,654),(1014,665),(1004,670),(982,669),(968,659),(961,647)],[(1028,653),(1036,647),(1050,641),(1078,640),(1078,653),(1070,669),(1055,675),(1040,674),(1030,666)]]
RIMS=[[(953,621),(970,625),(991,631),(1007,640),(1021,652),(1021,662),(1012,654),(1002,647),(989,641),(970,636),(953,632)],[(951,641),(960,652),(971,663),(984,669),(997,670),(1008,665),(1018,657),(1022,658),(1016,669),(1001,676),(981,674),(965,667),(954,653)],[(1025,650),(1039,640),(1053,636),(1081,636),(1081,646),(1054,646),(1040,652),(1030,659)],[(1022,653),(1030,666),(1042,674),(1058,675),(1071,666),(1078,651),(1083,649),(1084,661),(1074,675),(1057,682),(1039,679),(1027,670),(1020,658)]]
def bianca_blink(base,amount,master=None):
 if master is None:master=base
 orig=np.array(master.crop(BOX));rgb=orig[:,:,:3].astype(float);mask=Image.new('L',master.size);d=ImageDraw.Draw(mask)
 for p in LENSES:d.polygon(p,fill=255)
 protect=Image.new('L',master.size);d=ImageDraw.Draw(protect)
 for p in RIMS:d.polygon(p,fill=255)
 a=np.array(mask.crop(BOX));rim=np.array(protect.crop(BOX))>0
 ink=orig[:,:,:3].min(axis=2)<110
 rim&=ink;rim=cv2.dilate(rim.astype('uint8'),np.ones((3,3),np.uint8))>0
 a[rim]=0
 r,g,b=rgb.transpose(2,0,1);valid=(a==0)&(r>140)&(g>100)&(r>g*1.02)&(b<g*.93)
 yy,xx=np.indices(a.shape);design=np.stack([np.ones_like(xx),xx/100,yy/100],axis=-1);fit=np.linalg.lstsq(design[valid],rgb[valid],rcond=None)[0];skin=np.clip(design@fit,0,255)
 # Remove the old eye as a complete shape, never as a rectangle.
 working=rgb.copy();near=cv2.dilate(a,np.ones((7,7),np.uint8))>0;working[near&~valid]=skin[near&~valid]
 repaired=cv2.inpaint(working.astype('uint8'),a,3,cv2.INPAINT_NS);rgb[a>0]=repaired[a>0]
 marks=Image.new('RGBA',(BOX[2]*4-BOX[0]*4,BOX[3]*4-BOX[1]*4));draw=ImageDraw.Draw(marks)
 for left,right in [((969,642),(1010,656)),((1033,653),(1072,651))]:
  pts=[]
  for i in range(65):
   t=i/64;x=left[0]+(right[0]-left[0])*t;y=left[1]+(right[1]-left[1])*t+(5 if amount==1 else 8*amount-3)+3*np.sin(np.pi*t);pts.append(((x-BOX[0])*4,(y-BOX[1])*4))
  if amount<1:
   # Retain only the lower crescent of the original eye below the lid.
   for y in range(a.shape[0]):
    for x in range(a.shape[1]):
     wx=x+BOX[0];t=np.clip((wx-left[0])/(right[0]-left[0]),0,1);lid=left[1]+(right[1]-left[1])*t+(8*amount-3)+3*np.sin(np.pi*t)
     if left[0]<=wx<=right[0] and y+BOX[1]>lid and a[y,x]>0:rgb[y,x]=orig[y,x,:3]
  draw.line(pts,fill=(37,27,23,255),width=7)
 patch=Image.fromarray(np.dstack((rgb,orig[:,:,3])).astype('uint8'));patch.alpha_composite(marks.resize(patch.size,Image.Resampling.LANCZOS));pa=np.array(patch);pa[a==0]=orig[a==0]
 result=base.copy();result.paste(Image.fromarray(pa),(BOX[0],BOX[1]));return result


def run():
    helpers=runpy.run_path(str(Path(__file__).with_name('repair-master-mouth-lines.py')))
    meta=helpers['meta'];full=helpers['full'];master=full('bianca','rest')
    poses=['down','nervous','panicked','amused','smug','frustrated','defeated','release']
    targets={'blink-half':.5,'blink':1,'smug':.5,'frustrated':.5,'relieved':1,'delighted':1}
    for pose in poses:
        targets[pose+'-blink-half']=.8 if pose in ['smug','frustrated'] else .5
        targets[pose+'-blink']=1
    audit=[];before={};after={}
    for name,amount in targets.items():
        file=DEST/'bianca'/(name+'.webp');saved=OUT/'bianca-blink-originals'/(name+'.webp')
        saved.parent.mkdir(parents=True,exist_ok=True)
        if not saved.exists():saved.write_bytes(file.read_bytes())
        x,y,w,h=meta['characters']['bianca']['bounds'][name]
        original=Image.new('RGBA',(2048,2048));original.paste(Image.open(saved).convert('RGBA'),(x,y))
        repaired=bianca_blink(original,amount,master)
        repaired.putalpha(original.getchannel('A'))
        a,b=np.array(original),np.array(repaired)
        allowed=np.zeros((2048,2048),bool);allowed[BOX[1]:BOX[3],BOX[0]:BOX[2]]=True
        assert np.array_equal(a[~allowed],b[~allowed]),(name,'body, mouth or cards changed')
        assert np.array_equal(a[:,:,3],b[:,:,3]),(name,'alpha changed')
        # The rim region is restored from the master in the authoring function.
        rim=Image.new('L',(2048,2048));draw=ImageDraw.Draw(rim)
        for polygon in RIMS:draw.polygon(polygon,fill=255)
        glass=(np.array(rim)>0)&(np.array(master)[:,:,:3].min(axis=2)<110)
        assert np.array_equal(b[glass],np.array(master)[glass]),(name,'glasses changed')
        crop=repaired.crop((x,y,x+w,y+h));crop.save(file,lossless=True,exact=True,method=4)
        assert np.array_equal(np.array(crop),np.array(Image.open(file))),name
        audit.append({'character':'bianca','frame':name,'glassesUnchanged':True,'mouthBodyAndCardBacksUnchanged':True,'nativePixelsIdentical':True,'alphaUnchanged':True})
        before[name]=original;after[name]=repaired
    (DEST/'bianca-blink-checks.json').write_text(json.dumps(audit,indent=2)+'\n')
    sequence=['rest','blink-half','blink','blink-half','rest']
    frames=[]
    for name in sequence:
        frame=Image.new('RGB',(760,375),'#eee5d5');draw=ImageDraw.Draw(frame)
        for col,source in enumerate([before,after]):
            image=master if name=='rest' else source[name]
            face=image.crop((920,600,1120,765)).resize((360,297),Image.Resampling.LANCZOS)
            frame.paste(face,(col*380,40),face)
            draw.text((col*380+16,12),'Bianca - '+('before' if col==0 else 'corrected'),fill='#282728')
        frames.append(frame)
    frames[0].save(OUT/'bianca-blink-before-after.gif',save_all=True,append_images=frames[1:],duration=[900,50,100,50,600],loop=0,disposal=2)
    print('Repaired',len(audit),'Bianca eyelid frames; original glasses and mouth artwork preserved')


if __name__=='__main__':run()
