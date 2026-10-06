"""Bake complete native sprite frames directly from approved master pixels.

Only calibrated eye regions are mutable. Every other RGBA pixel, including
the complete head outline, torso, clothes, arms, cards and feet, must match
the master exactly. No whole-frame fitting, body resizing or pose chaining.
The owner explicitly approved this pixel-preserving authoring method.
"""
from pathlib import Path
import json, hashlib, runpy
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SOURCES = ROOT.parent / 'output/100next-character-masters/chair-free-v1'
OUT = ROOT.parent / 'output/100next-master-branch-v1'
EYES = {
 'vince':[(996,646,1038,675),(1057,653,1088,680)],
 'finn':[(979,640,1018,679),(1038,642,1074,681)],
 'june':[(975,659,1021,690),(1047,661,1091,696)],
 'edgar':[(974,647,1020,697),(1033,646,1075,693)],
 'roxie':[(990,648,1029,680),(1047,661,1087,692)],
 'otis':[(969,610,1015,658),(1037,606,1080,653)],
 'paloma':[(960,689,1003,715),(1024,679,1066,708)],
 'bianca':[(975,642,1017,666),(1032,645,1074,671)],
}

def hull(points):
 points=sorted(set(points))
 def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 lower=[]
 for p in points:
  while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
  lower.append(p)
 upper=[]
 for p in reversed(points):
  while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
  upper.append(p)
 return lower[:-1]+upper[:-1]

def eye_data(master,box):
 crop=master.crop(box); a=np.array(crop).astype(int)
 white=(a[:,:,:3].min(axis=2)>190)&(np.ptp(a[:,:,:3],axis=2)<55)
 ys,xs=np.where(white)
 assert len(xs)>30,(box,'white sclera not found')
 mask=Image.new('L',crop.size)
 ImageDraw.Draw(mask).polygon(hull(list(zip(xs.tolist(),ys.tolist()))),fill=255)
 inner=np.array(mask)>0
 ink=(a[:,:,:3].min(axis=2)<130)&inner
 iy,ix=np.where(ink)
 assert len(ix)>8,(box,'pupil not found')
 # Keep the actual painted pupil and its white highlights, rather than
 # synthesizing a new iris. Original black eye outlines stay protected.
 x0,x1=max(0,int(ix.min())-1),min(crop.width,int(ix.max())+2)
 y0,y1=max(0,int(iy.min())-1),min(crop.height,int(iy.max())+2)
 iris=Image.new('RGBA',crop.size)
 iris.alpha_composite(crop.crop((x0,y0,x1,y1)),(x0,y0))
 iris.putalpha(Image.composite(iris.getchannel('A'),Image.new('L',crop.size),mask))
 white_color=tuple(np.median(a[:,:,:3][white],axis=0).astype(int))+(255,)
 skin=master.getpixel((int((box[0]+box[2])/2),box[3]+6))
 return crop,mask,iris,white_color,skin

def glance(master,boxes,dx=0,dy=0):
 frame=master.copy()
 for box in boxes:
  crop,mask,iris,white,_=eye_data(master,box)
  clean=Image.new('RGBA',crop.size,white)
  clean=Image.composite(clean,crop,mask)
  moved=Image.new('RGBA',crop.size);moved.alpha_composite(iris,(dx,dy))
  # Clip moving pupils to the original sclera; both eyes share direction.
  moved.putalpha(Image.composite(moved.getchannel('A'),Image.new('L',crop.size),mask))
  clean.alpha_composite(moved)
  frame.paste(clean,(box[0],box[1]))
 return frame

def blink(master,boxes,closed):
 if boxes==EYES['bianca']:
  repair=runpy.run_path(str(Path(__file__).with_name('repair-bianca-blinks.py')))
  return repair['bianca_blink'](master,closed)
 frame=master.copy()
 for box in boxes:
  crop,mask,iris,white,skin=eye_data(master,box)
  # A small authored eyelid replaces only this calibrated local region.
  # Glasses, eyelashes outside the region and the head outline cannot move.
  patch=crop.copy()
  w,h=crop.size
  # Reconstruct only the eye's background from its neighboring skin.
  # Harmonic interpolation avoids flat rectangular skin-colored stamps.
  fill=mask.filter(ImageFilter.MaxFilter(7))
  active=np.array(fill)>0
  values=np.array(crop).astype(float)
  rgb=values[:,:,:3].copy()
  border=~active
  rgb[active]=np.median(rgb[border],axis=0) if border.any() else skin[:3]
  for _ in range(220):
   average=(np.roll(rgb,1,axis=0)+np.roll(rgb,-1,axis=0)+np.roll(rgb,1,axis=1)+np.roll(rgb,-1,axis=1))/4
   rgb[active]=average[active]
  values[:,:,:3]=rgb
  repaired=Image.fromarray(np.clip(values,0,255).astype('uint8'))
  if closed>=.95:
   patch=Image.composite(repaired,crop,fill)
   draw=ImageDraw.Draw(patch)
   points=[(3+i*(w-6)/16,h*.57+2.5*np.sin(i*np.pi/16)) for i in range(17)]
   draw.line(points,fill=(37,27,23,255),width=3)
  else:
   edge=int(h*.47)
   top=fill.copy();ImageDraw.Draw(top).rectangle((0,edge+1,w,h),fill=0)
   patch=Image.composite(repaired,crop,top);draw=ImageDraw.Draw(patch)
   draw.line([(2,edge),(w-3,edge+1)],fill=(37,27,23,255),width=3)
  frame.paste(patch,(box[0],box[1]))
 return frame

CLIPS={
 'blink':(['rest','blink-half','blink','blink-half','rest'],[750,40,90,40,550]),
 'look-left':(['rest','left-mid','left','left-mid','rest'],[120,70,340,70,160]),
 'look-right':(['rest','right-mid','right','right-mid','rest'],[120,70,340,70,160]),
 'study':(['rest','down-mid','down','down-mid','rest'],[100,70,260,70,140]),
 'alert':(['rest','down','rest','left','right','rest'],[90,140,70,150,150,220]),
}

def preview_gif(frames,ids,durations,path,head=False):
 crop=(768,480,1280,1056) if head else (512,256,1536,1792)
 size=(512,576) if head else (512,768)
 rgb=[]
 for key in ids:
  im=frames[key].crop(crop).resize(size,Image.Resampling.LANCZOS)
  board=Image.new('RGB',size,'#eee5d5');board.paste(im,(0,0),im);rgb.append(board)
 # One shared palette prevents the resting painting flickering between frames.
 sample=Image.new('RGB',(128*len(rgb),192))
 for i,im in enumerate(rgb):sample.paste(im.resize((128,192)),(i*128,0))
 palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 converted=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in rgb]
 converted[0].save(path,save_all=True,append_images=converted[1:],duration=durations,loop=0,disposal=1,optimize=False)

def build(slug):
 target=OUT/slug;target.mkdir(parents=True,exist_ok=True)
 src=SOURCES/(slug+'-master'+('-v2' if slug=='finn' else '')+'.png')
 master=Image.open(src).convert('RGBA');base=np.array(master)
 frames={'rest':master,
  'blink-half':blink(master,EYES[slug],.5),'blink':blink(master,EYES[slug],1),
  'left-mid':glance(master,EYES[slug],-3),'left':glance(master,EYES[slug],-7),
  'right-mid':glance(master,EYES[slug],3),'right':glance(master,EYES[slug],7),
  'down-mid':glance(master,EYES[slug],0,2),'down':glance(master,EYES[slug],0,5)}
 allowed=np.zeros((2048,2048),bool)
 if slug=='bianca':allowed[629:677,953:1081]=True
 for x0,y0,x1,y1 in EYES[slug]:allowed[y0:y1,x0:x1]=1
 checks=[]
 for key,frame in frames.items():
  # Some masters use partial opacity inside the painting. Editing RGB
  # must never flatten or change that original alpha channel.
  frame.putalpha(master.getchannel('A'))
  array=np.array(frame)
  assert np.array_equal(array[~allowed],base[~allowed]),(slug,key,'protected artwork changed')
  assert np.array_equal(array[:,:,3],base[:,:,3]),(slug,key,'silhouette changed')
  frame.save(target/(key+'.png'))
  frame.save(target/(key+'.webp'),lossless=True,exact=True,method=6)
  decoded=np.array(Image.open(target/(key+'.webp')).convert('RGBA'))
  assert np.array_equal(array[base[:,:,3]>0],decoded[base[:,:,3]>0]),(slug,key,'export changed visible pixels')
  checks.append({'frame':key,'protectedPixelsIdentical':True,'alphaIdentical':True,'bounds':master.getchannel('A').getbbox()})
 clips={key:{'frames':ids,'durations':durations} for key,(ids,durations) in CLIPS.items()}
 manifest={'id':slug,'nativeSize':[2048,2048],'source':str(src),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'method':'pixel-preserving local edits, every frame branches directly from master','mutableRegions':EYES[slug],'clips':clips,'checks':checks,'status':'review prototype; card gestures and tumble remain a separate authoring pass'}
 (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 ids=[];timing=[]
 for key in ['blink','look-left','look-right','study','alert']:
  sequence,durations=CLIPS[key];ids+=sequence;timing+=durations
 preview_gif(frames,ids,timing,target/'master-reactions.gif',True)
 preview_gif(frames,ids,timing,target/'master-full-body.gif')
 print(json.dumps({'character':slug,'frames':len(frames),'native':2048,'protectedPixelsIdentical':True,'alphaIdentical':True}),flush=True)
 return frames

if __name__=='__main__':
 for slug in EYES:build(slug)
