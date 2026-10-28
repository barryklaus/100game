"""Local June eye candidates. Default writes review artifacts only; never game assets.

Every drawing branches from the clean master eye pixels, while the complete
frame, brows, mouth, hair, clothes and alpha remain those of its input pose.
The eye+lash silhouette is removed as a complete hand-reviewed polygon; the
old generic sclera-hull wipe is deliberately not used.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'output/june-eye-repair'
PUB=ROOT/'public/assets/social-club'
# Below the eyebrows, including original lash tips and the old eyelid crease.
EYE_POLYGONS=[
 [(965,650),(976,650),(989,650),(1002,650),(1013,655),(1021,663),(1027,674),(1028,685),(1021,693),(1008,695),(994,694),(981,689),(972,681),(967,670),(963,658)],
 [(1052,666),(1061,660),(1071,655),(1082,655),(1090,657),(1097,657),(1096,663),(1102,660),(1102,671),(1096,678),(1090,688),(1081,695),(1068,698),(1056,697),(1048,690),(1047,680)],
]
# Original eyeball contours, including the existing lower eye outline.
OPEN_POLYGONS=[
 [(975,665),(981,659),(992,658),(1003,661),(1012,668),(1019,679),(1020,683),(1011,688),(1000,690),(988,686),(980,681)],
 [(1050,681),(1058,670),(1067,665),(1078,663),(1090,665),(1095,672),(1091,684),(1084,692),(1075,696),(1062,696),(1051,691)],
]
# Native coordinates of a relaxed lid; same outline used throughout the repair.
HALF_CURVES=[[(975,668),(988,672),(1007,675),(1019,671)],[(1051,680),(1063,685),(1082,684),(1092,674)]]
CLOSED_CURVES=[[(975,678),(989,684),(1008,686),(1020,681)],[(1051,688),(1064,695),(1083,693),(1093,683)]]


def polygon_mask(size,polygons):
 mask=Image.new('L',size);d=ImageDraw.Draw(mask)
 for polygon in polygons:d.polygon(polygon,fill=255)
 return np.array(mask)>0


def curve(points):
 p=np.array(points,dtype=float);t=np.linspace(0,1,101)[:,None]
 return (1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3]


def skin_surface(reference,allowed,context,classifier):
 """Extend each eye's real local skin/injury color without importing healthy skin."""
 rgb=np.array(reference)[:,:,:3].astype(np.float32)
 sample=np.array(classifier)[:,:,:3].astype(np.float32)
 yy,xx=np.indices(allowed.shape,dtype=np.int16)
 r,g,b=sample.transpose(2,0,1)
 skin=(r>195)&(g>95)&(g<205)&(b>25)&(b<140)&(r>g*1.18)&(g>b*1.25)
 # Injury drawings can place a lash one pixel away from the healthy classifier.
 # Reject actual black ink/white sclera while retaining real purple bruising.
 actual_skin=(np.ptp(rgb,axis=-1)>35)&((rgb.max(axis=-1)>160)|((rgb[:,:,2]>rgb[:,:,1]*1.15)&(rgb.max(axis=-1)>75)))
 skin&=actual_skin
 result=rgb.copy()
 # Independent eye fields prevent the right-eye bruise tinting the left eye.
 ys,xs=np.nonzero(allowed);middle=float((xs.min()+xs.max())/2)
 for side in [xx<middle,xx>=middle]:
  valid=context&~allowed&skin&side
  if valid.sum()<12:valid=context&skin&side
  # Interpolate only from genuine surrounding skin/bruise pixels. A quadratic
  # fitted over the missing eye can overshoot into a dark forehead patch.
  # Solve a small local harmonic field instead, with real donor colors fixed.
  ys,xs=np.nonzero(context&side);x0,x1=max(0,int(xs.min())-3),min(rgb.shape[1],int(xs.max())+4);y0,y1=max(0,int(ys.min())-3),min(rgb.shape[0],int(ys.max())+4)
  fixed=valid[y0:y1,x0:x1];values=rgb[y0:y1,x0:x1].copy()
  vy,vx=np.nonzero(fixed);X=np.c_[np.ones(len(vx)),vx,vy]
  fit=np.linalg.lstsq(X,values[fixed],rcond=None)[0]
  gy,gx=np.indices(fixed.shape);field=np.clip(np.stack([np.ones_like(gx),gx,gy],axis=-1)@fit,0,255)
  field[fixed]=values[fixed]
  for _ in range(650):
   pad=np.pad(field,((1,1),(1,1),(0,0)),mode='edge')
   avg=(pad[:-2,1:-1]+pad[2:,1:-1]+pad[1:-1,:-2]+pad[1:-1,2:])*.25
   field[~fixed]=avg[~fixed]
  paint=(allowed&side)[y0:y1,x0:x1]
  result[y0:y1,x0:x1][paint]=field[paint]
 return result


def design(size,reference,transform=None):
 M,offset=(np.eye(2),np.zeros(2)) if transform is None else transform
 inv=np.linalg.inv(M)
 yy,xx=np.indices((size[1],size[0]),dtype=np.int16)
 cx=inv[0,0]*(xx-offset[0])+inv[0,1]*(yy-offset[1]);cy=inv[1,0]*(xx-offset[0])+inv[1,1]*(yy-offset[1])
 mapped=lambda points:(np.array(points,dtype=float)@M.T+offset).tolist()
 core=polygon_mask(size,[mapped(p) for p in EYE_POLYGONS])
 context=((cx>=958)&(cx<=1035)&(cy>=644)&(cy<=700))|((cx>=1040)&(cx<=1105)&(cy>=650)&(cy<=704))
 expanded=core.copy()
 for _ in range(4):expanded|=np.roll(expanded,1,0)|np.roll(expanded,-1,0)|np.roll(expanded,1,1)|np.roll(expanded,-1,1)
 clean=np.array(reference);ink=clean[:,:,:3].max(axis=-1)<160
 brow=ink&(((cx<1040)&(cy<=649))|((cx>=1040)&(cy<=654)))
 for _ in range(2):brow|=np.roll(brow,1,0)|np.roll(brow,-1,0)|np.roll(brow,1,1)|np.roll(brow,-1,1)
 right=np.interp(cy.ravel(),[645,655,662,672,680,695],[1100,1099,1098,1096,1094,1092]).reshape(cy.shape)
 left=np.interp(cy.ravel(),[645,650,655,660,670,675,680,695],[969,963,964,965,967,966,962,965]).reshape(cy.shape)
 temple=((cx>1040)&(cx>=right-1))|((cx<1040)&(cx<=left+1))
 allowed=expanded&context&~brow&~temple
 core&=allowed
 return {'core':core,'context':context,'allowed':allowed,'brow':brow&context,'temple':temple&context,
         'openings':[mapped(p) for p in OPEN_POLYGONS],'half':[mapped(p) for p in HALF_CURVES],'closed':[mapped(p) for p in CLOSED_CURVES],
         'regions':[mapped([(958,644),(1035,644),(1035,700),(958,700)]),mapped([(1040,650),(1105,650),(1105,704),(1040,704)])]}


def repair_eyes(base,reference,closed=.5,classifier=None,transform=None,with_masks=False):
 """Return a complete pose, changing only local eye context and actual eyelids."""
 classifier=reference if classifier is None else classifier
 original=np.array(base.convert('RGBA'));clean=np.array(reference.convert('RGBA'))
 masks=design(base.size,reference,transform);allowed=masks['allowed'];context=masks['context'];core=masks['core']
 surface=skin_surface(reference,allowed,context,classifier)
 edited=original.copy();edited[context]=clean[context]
 alpha=core.astype(np.float32);spread=core.copy()
 for strength in [.8,.6,.4,.2]:
  next_spread=spread|np.roll(spread,1,0)|np.roll(spread,-1,0)|np.roll(spread,1,1)|np.roll(spread,-1,1)
  alpha[next_spread&~spread]=strength;spread=next_spread
 blended=surface*alpha[:,:,None]+clean[:,:,:3]*(1-alpha[:,:,None])
 edited[:,:,:3][allowed]=blended[allowed]
 yy,xx=np.indices(allowed.shape,dtype=np.int16)
 if closed<.95:
  for opening,points in zip(masks['openings'],masks['half']):
   inside=polygon_mask(base.size,[opening]);line=curve(points);x0,x1=int(np.floor(line[0,0])),int(np.ceil(line[-1,0]));xs=np.arange(x0,x1+1);ys=np.interp(xs,line[:,0],line[:,1])
   threshold=np.interp(xx.ravel(),xs,ys).reshape(xx.shape)
   keep=inside&allowed&(xx>=x0)&(xx<=x1)&(yy>threshold)
   edited[keep]=clean[keep]
 # Only this tiny local layer is drawn at 4×; all complete-frame pixels stay native.
 ys,xs=np.nonzero(context);bx,by=int(xs.min())-8,int(ys.min())-8;bw,bh=int(xs.max()-xs.min())+17,int(ys.max()-ys.min())+17
 marks=Image.new('RGBA',(bw*4,bh*4));draw=ImageDraw.Draw(marks)
 for i,points in enumerate(masks['closed'] if closed>=.95 else masks['half']):
  line=curve(points);draw.line([tuple((p-[bx,by])*4) for p in line],fill=(30,21,18,255),width=9,joint='curve')
  if i==0:
   x,y=line[0];lashes=[[(x+5,y+1),(x-2,y-4)],[(x+1,y),(x-5,y-3)]]
  else:
   x,y=line[-1];lashes=[[(x-5,y+2),(x+2,y-3)],[(x-1,y+1),(x+5,y-1)]]
  for lash in lashes:draw.line([tuple((np.array(p)-[bx,by])*4) for p in lash],fill=(30,21,18,255),width=7)
 result=Image.fromarray(edited);result.alpha_composite(marks.resize((bw,bh),Image.Resampling.LANCZOS),(bx,by));output=np.array(result)
 output[~context]=original[~context];output[context&~allowed]=clean[context&~allowed];output[:,:,3]=original[:,:,3]
 assert np.array_equal(output[~context],original[~context]),'Protected drawing changed'
 assert np.array_equal(output[masks['brow']],clean[masks['brow']]),'Original eyebrow/hair ink changed'
 assert np.array_equal(output[masks['temple']],clean[masks['temple']]),'Original temple boundary changed'
 assert np.array_equal(output[:,:,3],original[:,:,3]),'Silhouette changed'
 return (Image.fromarray(output),masks) if with_masks else Image.fromarray(output)


def metadata(condition=0):
 folder='condition-animation-v1' if condition else 'master-animation-v2'
 d=json.loads((PUB/folder/'manifest.json').read_text())['characters']['june']
 return d[str(condition)] if condition else d


def frame_path(name,condition=0):
 return PUB/('condition-animation-v1/june/'+str(condition) if condition else 'master-animation-v2/june')/(name+'.webp')


def full_pose(name,condition=0):
 x,y,w,h=metadata(condition)['bounds'][name];out=Image.new('RGBA',(2048,2048));out.paste(Image.open(frame_path(name,condition)).convert('RGBA'),(x,y));return out


def action_transform():
 # Existing whole-action eye registration, measured from its actual clean pose.
 source=np.array([[998,674.5],[1069,678.5]]);target=np.array([[993.5,675],[1066,673.5]])
 a=source[1]-source[0];b=target[1]-target[0];z=complex(*b)/complex(*a);M=np.array([[z.real,-z.imag],[z.imag,z.real]])
 return M,target.mean(0)-M@source.mean(0)


def targets():
 result=[]
 for frame,amount in [('smug',.5),('frustrated',.5),('relieved',1),('delighted',1),('blink-half',.5),('blink',1)]:result.append((0,frame,'rest',amount,None))
 for pose in ['down','nervous','panicked','amused','smug','frustrated','defeated','release']:
  for suffix,amount in [('blink-half',.5),('blink',1)]:result.append((0,pose+'-'+suffix,pose if pose not in ['smug','frustrated'] else 'rest',amount,None))
 for suffix,amount in [('blink-half',.5),('blink-closed',1)]:result.append((0,'whole-throw-6-'+suffix,'whole-throw-6',amount,action_transform()))
 for condition in [1,2,3]:
  for pose in ['rest','down','release']:
   for suffix,amount in [('blink-half',.5),('blink',1)]:result.append((condition,pose+'-'+suffix,pose,amount,None))
 return result


def preview():
 OUT.mkdir(parents=True,exist_ok=True);master=full_pose('rest');source=full_pose('frustrated')
 before={'half':source,'closed':full_pose('frustrated-blink')};after={name:repair_eyes(source,master,amount) for name,amount in [('half',.5),('closed',1)]}
 for name,im in after.items():im.save(OUT/('candidate-'+name+'.png'))
 font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18);sheet=Image.new('RGB',(1200,740),(20,28,38));d=ImageDraw.Draw(sheet)
 for row,name in enumerate(['half','closed']):
  for col,(label,im) in enumerate([('Clean master',master),('Current '+name,before[name]),('Candidate '+name,after[name])]):
   face=im.crop((910,610,1120,795)).resize((378,333),Image.Resampling.LANCZOS);sheet.paste(face,(col*400+10,row*370+28),face);d.text((col*400+12,row*370+6),label,font=font,fill='white')
 sheet.save(OUT/'candidate-before-after.jpg',quality=97)
 print('June eye candidates only; no public assets modified.')


def apply_batch():
 import hashlib,runpy,shutil
 finish=runpy.run_path(str(ROOT/'scripts/assets/engraved-character-finish.py'))['engraved_image']
 stage=OUT/'staged';backups=OUT/'before';stage.mkdir(parents=True,exist_ok=True);backups.mkdir(exist_ok=True)
 records=[];replacements=[];review=[]
 sha=lambda raw:hashlib.sha256(raw).hexdigest()
 for condition,frame,donor,amount,transform in targets():
  path=frame_path(frame,condition);engraved=PUB/'engraved-v1'/path.relative_to(PUB)
  bounds=metadata(condition)['bounds'][frame];x,y,w,h=bounds
  # Keep original inputs for reproducibility after a first successful apply.
  source_backup=backups/path.relative_to(PUB);etched_backup=backups/engraved.relative_to(PUB)
  for src,dst in [(path,source_backup),(engraved,etched_backup)]:
   if not dst.exists():dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
  native_before=Image.open(source_backup).convert('RGBA');etched_before=Image.open(etched_backup).convert('RGBA')
  before_full=Image.new('RGBA',(2048,2048));before_full.paste(native_before,(x,y))
  reference=full_pose(donor,condition);classifier=full_pose(donor if donor in metadata(0)['bounds'] else 'rest') if condition else reference
  repaired,masks=repair_eyes(before_full,reference,amount,classifier,transform,True);cropped=repaired.crop((x,y,x+w,y+h))
  mutable=masks['context'][y:y+h,x:x+w];brow=masks['brow'][y:y+h,x:x+w];temple=masks['temple'][y:y+h,x:x+w]
  a=np.array(native_before);b=np.array(cropped);e=np.array(etched_before);generated=np.array(finish(cropped,bounds));f=e.copy();f[:,:,:3][mutable]=generated[:,:,:3][mutable]
  assert native_before.size==cropped.size==etched_before.size
  assert np.array_equal(a[~mutable],b[~mutable]),(condition,frame,'native protected pixels')
  assert np.array_equal(e[~mutable],f[~mutable]),(condition,frame,'engraved protected pixels')
  assert np.array_equal(a[:,:,3],b[:,:,3]) and np.array_equal(e[:,:,3],f[:,:,3]),(condition,frame,'alpha')
  assert np.array_equal(a[brow],b[brow]),(condition,frame,'native brows')
  reference_crop=np.array(reference.crop((x,y,x+w,y+h)))
  assert np.array_equal(reference_crop[temple],b[temple]),(condition,frame,'clean donor temple')
  # Some old blink masks already painted over the hair fringe. Restore those
  # damaged pixels from the clean matching pose, rather than protecting the defect.
  restored_temple=temple&np.any(a!=b,axis=-1)
  # Existing engraving may be lossy; preserve its exact decoded protected pixels.
  f[brow]=e[brow];f[temple&~restored_temple]=e[temple&~restored_temple];f[:,:,3]=e[:,:,3]
  assert np.array_equal(e[brow],f[brow])
  assert np.array_equal(generated[restored_temple],f[restored_temple])
  item={'condition':condition,'frame':frame,'donor':donor,'allowedRegions':masks['regions'],
   'alphaIdentical':True,'protectedPixelsIdentical':True,'browsIdentical':True,'templeIdentical':True,
   'protected':{'beforeSha256':sha(a[~mutable].tobytes()),'afterSha256':sha(b[~mutable].tobytes())},
   'engravedProtected':{'beforeSha256':sha(e[~mutable].tobytes()),'afterSha256':sha(f[~mutable].tobytes())},
   'brows':{'beforeSha256':sha(a[brow].tobytes()),'afterSha256':sha(b[brow].tobytes())},
   'temple':{'beforeSha256':sha(reference_crop[temple].tobytes()),'afterSha256':sha(b[temple].tobytes()),'basis':'matching clean donor pose','originalSha256':sha(a[temple].tobytes())},
   'restoredTemplePixels':int(restored_temple.sum()),
   'changedPixels':int(np.any(a!=b,axis=-1).sum()),'engravedChangedPixels':int(np.any(e!=f,axis=-1).sum())}
  for kind,public,image,old in [('source',path,cropped,a),('engraved',engraved,Image.fromarray(f),e)]:
   staged=stage/public.relative_to(PUB);staged.parent.mkdir(parents=True,exist_ok=True);image.save(staged,lossless=True,exact=True,method=4)
   decoded=np.array(Image.open(staged).convert('RGBA'));assert np.array_equal(decoded,np.array(image)),(frame,'lossless export')
   item[kind]={'path':public.relative_to(ROOT/'public').as_posix(),'beforeSha256':sha((backups/public.relative_to(PUB)).read_bytes()),'sha256':sha(staged.read_bytes()),'width':image.width,'height':image.height,'alphaSha256':sha(decoded[:,:,3].tobytes())}
   replacements.append((staged,public))
  records.append(item)
  review.append((condition,frame,before_full.crop((920,615,1110,775)),repaired.crop((920,615,1110,775))))
  print(condition,frame,item['changedPixels'],flush=True)
 # Every native and etched export passed all assertions before the first public write.
 audit={'version':1,'character':'june','method':'complete native frames; precise eye/lash polygons; clean per-pose/condition donors; fixed dimensions and original alpha','records':records}
 staged_audit=OUT/'june-eye-repair-v1.json';staged_audit.write_text(json.dumps(audit,indent=2)+'\n')
 for src,dest in replacements:shutil.copy2(src,dest)
 shutil.copy2(staged_audit,PUB/'june-eye-repair-v1.json')
 font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
 for condition in [0,1,2,3]:
  rows=[r for r in review if r[0]==condition];sheet=Image.new('RGB',(700,len(rows)*230),(20,28,38));draw=ImageDraw.Draw(sheet)
  for n,(_,name,before,after) in enumerate(rows):
   for col,im in enumerate([before,after]):
    face=im.resize((247,208),Image.Resampling.LANCZOS);sheet.paste(face,(col*350+22,n*230+20),face)
    draw.text((col*350+12,n*230+2),name+' · '+('before' if col==0 else 'after'),font=font,fill='white')
  sheet.save(OUT/f'applied-condition-{condition}.jpg',quality=96)
 print('Applied',len(records),'June frame pairs. Every staged export verified before replacement.')


if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 apply_batch() if args.apply else preview()
