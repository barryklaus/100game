"""Complete, padded sprites for the seven remaining approved Midnight masters.

Actions use the complete generated character drawing, uniformly registered to
the master scale. Actual rounded card artwork is baked behind original fingers.
The runtime displays complete frames and never assembles separate body parts.
"""
from pathlib import Path
import json,sys,runpy,shutil,argparse
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-cast-expansion-animation-v1'
MASTERS=ROOT.parent/'output/100next-new-eight-masters-v1'
DEST=ROOT/'public/assets/social-club/master-animation-v2'
REVIEW=ROOT/'public/new-cast-animation'
CAL=json.loads(Path(__file__).with_name('expanded-cast-calibration.json').read_text())
HELP=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))
W=1254;OFFSET=(397,362)
BACK=Image.open(ROOT/'public/assets/cards/back.webp').convert('RGBA').resize((320,448),Image.Resampling.LANCZOS)
rounding=Image.new('L',BACK.size);ImageDraw.Draw(rounding).rounded_rectangle((0,0,319,447),radius=18,fill=255)
BACK.putalpha(rounding);BACK=np.array(BACK)
CLIPS={
 'blink':(['rest','blink','rest'],[40,100,60]),
 'look-left':(['rest','left-mid','left','left-mid','rest'],[60,60,240,60,80]),
 'look-right':(['rest','right-mid','right','right-mid','rest'],[60,60,240,60,80]),
 'study':(['rest','down-mid','down','down-mid','rest'],[60,60,220,60,80]),
 'danger':(['nervous','shocked','nervous'],[100,180,100]),
 'startle':(['rest','shocked'],[60,240]),
 'celebrate':(['confident','delighted','confident','rest'],[80,240,100,80]),
 'defeat':(['rest','nervous'],[80,300]),
 'throw':(['rest','prepare','throw-release','release'],[60,140,100,120]),
 'receive-ready':(['release','grip'],[80,80]),
 'pickup':(['caught','rest'],[120,100]),
 'tumble':(['release','fall-start','midfall','floor'],[70,110,140,360]),
 'return':(['floor','rest'],[200,200]),
}
EMOTIONS={'calm':'rest','focused':'down','confident':'confident','smug':'confident','amused':'delighted','nervous':'nervous','panicked':'shocked','shocked':'shocked','relieved':'delighted','frustrated':'nervous','defeated':'nervous'}
def pad(im):
 c=Image.new('RGBA',(2048,2048));c.alpha_composite(im,OFFSET);return c
def soften_boxes(size,boxes):
 mask=Image.new('L',size);d=ImageDraw.Draw(mask)
 for b in boxes:d.rounded_rectangle(tuple(b),radius=6,fill=255)
 return mask.filter(ImageFilter.GaussianBlur(2))
def glasses_mask(size):
 mask=Image.new('L',size);d=ImageDraw.Draw(mask)
 for box in [(565,236,624,286),(635,246,688,296)]:d.ellipse(box,outline=255,width=4)
 d.line([(620,258),(640,261)],fill=255,width=4)
 return mask
def build(id,facial_only=False):
 cfg=CAL[id];folder=OUT/id;folder.mkdir(exist_ok=True)
 for sub in ['frames','sources','sheets']:(folder/sub).mkdir(exist_ok=True)
 master=Image.open(MASTERS/'masters'/(id+'-master.png')).convert('RGBA');base=np.array(master)
 rows=[r for r in json.loads((OUT/'generation-results.json').read_text()) if r['id']==id]
 sources={r['pose']:r for r in rows};required={'faces','prepare','release','grip','caught','fall-start','midfall','floor'}
 assert ({'faces'} if facial_only else required)<=sources.keys(),(id,'missing drawings',required-sources.keys())
 for row in rows:shutil.copy2(row['source'],folder/'sources'/(row['pose']+'.png'))
 audit=[];registration=[];quads={}
 def register(donor,key,head_only=False):
  a=np.array(donor);sift=cv2.SIFT_create();mask=np.zeros((W,W),np.uint8)
  x,y,r,b=cfg['headMatch'];mask[y:b,x:r]=255
  km,dm=sift.detectAndCompute(cv2.cvtColor(base,cv2.COLOR_RGBA2GRAY),mask)
  kd,dd=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGBA2GRAY),None)
  assert dm is not None and dd is not None,(id,key,'no head features')
  candidates=sorted([m for m,n in cv2.BFMatcher().knnMatch(dd,dm,k=2) if m.distance<n.distance*.78],key=lambda m:m.distance)
  distinct={}
  for m in candidates:distinct.setdefault(m.trainIdx,m)
  matches=list(distinct.values())
  assert len(matches)>=4,(id,key,'head registration',len(matches))
  transform,inliers=cv2.estimateAffinePartial2D(np.float32([kd[m.queryIdx].pt for m in matches]),np.float32([km[m.trainIdx].pt for m in matches]),method=cv2.RANSAC,ransacReprojThreshold=3)
  assert transform is not None,(id,key,'head transform')
  scale=float(np.hypot(transform[0,0],transform[1,0]));angle=float(np.degrees(np.arctan2(transform[1,0],transform[0,0])))
  assert .35<scale<2.5 and abs(angle)<20,(id,key,scale,angle)
  aligned=Image.fromarray(cv2.warpAffine(a,transform,(W,W),flags=cv2.INTER_CUBIC))
  registration.append({'frame':key,'headScaleCorrection':scale,'angle':angle,'matches':len(matches),'inliers':int(inliers.sum())})
  return aligned
 def facial(donor,key):
  aligned=register(donor,key,True)
  mask=soften_boxes(master.size,[cfg['eyePatch']]+([] if key=='blink' else [cfg['mouthPatch']]))
  if id=='leon':mask=Image.fromarray(np.minimum(np.array(mask),255-np.array(glasses_mask(master.size))))
  result=Image.composite(aligned,master,mask);result.putalpha(master.getchannel('A'))
  assert np.array_equal(np.array(result)[np.array(mask)==0],base[np.array(mask)==0]),(id,key,'protected body')
  return result
 def upright(donor,key):
  # One transformation applies to the entire drawing. Never lock or transplant
  # a master head/legs onto the action torso: head and body move together.
  return register(donor,key)
 native={'rest':master}
 sheet=Image.open(sources['faces']['source']).convert('RGBA')
 for i,key in enumerate(['reference','blink','nervous','shocked','delighted','confident']):
  if i==0:continue
  cell=sheet.crop((round(i%3*sheet.width/3),round(i//3*sheet.height/2),round((i%3+1)*sheet.width/3),round((i//3+1)*sheet.height/2)))
  native[key]=facial(cell,key)
 if facial_only:
  font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18);board=Image.new('RGB',(1200,240),'#172334');d=ImageDraw.Draw(board)
  for i,key in enumerate(['rest','blink','nervous','shocked','delighted','confident']):
   patch=native[key].crop((480,150,770,420)).resize((190,177),Image.Resampling.LANCZOS);board.paste(patch,(i*200+5,30),patch);d.text((i*200+5,7),key,font=font,fill='white')
  board.save(folder/'face-review.png');print(id,'facial review exported',flush=True);return
 for key in ['prepare','release','grip','caught']:
  native[key]=upright(Image.open(sources[key]['source']).convert('RGBA'),key)
 # A receive drawing must keep the same empty working hand as the release.
 # Nadia's generated grip changed hands; her approved open palm and prepared
 # grip provide a consistent catch without making the held card swap sides.
 for key,source in cfg.get('poseAliases',{}).items():native[key]=native[source].copy()
 for key in ['fall-start','midfall','floor']:
  donor=Image.open(sources[key]['source']).convert('RGBA')
  # Whole tumble drawings keep their supplied canvas. No independent fitting.
  if donor.size!=(W,W):donor=donor.resize((W,W),Image.Resampling.LANCZOS)
  native[key]=donor
 for side,dx,dy in [('left',-5,0),('right',5,0),('down',0,3)]:
  native[side]=HELP['glance'](master,cfg['eyes'],dx,dy)
  native[side+'-mid']=HELP['glance'](master,cfg['eyes'],round(dx/2),round(dy/2))
 static_mask=np.array(Image.open(MASTERS/'card-slots'/(id+'-visible-placeholder-mask.png')).convert('L'))>0
 static_names=['rest','blink','left','left-mid','right','right-mid','down','down-mid','nervous','shocked','delighted','confident']
 def cards(im,key,static=False):
  arr=np.array(im);r,g,b=[arr[:,:,i].astype('int16') for i in range(3)]
  sel=static_mask.copy() if static else (r>170)&(b>170)&(g<100)&(arr[:,:,3]>100)
  n,labels,stats,_=cv2.connectedComponentsWithStats(sel.astype('uint8'));components=[i for i in range(1,n) if stats[i,4]>400]
  expected=2 if static or key in ['prepare','caught'] else 1
  assert len(components)==expected,(id,key,'visible card count',len(components),expected)
  qs=[];covered=np.zeros(sel.shape,np.uint8)
  for i in components:
   region=labels==i;cx,cy=stats[i,:2]+stats[i,2:4]/2
   for j in range(1,n):
    jx,jy=stats[j,:2]+stats[j,2:4]/2
    if 10<stats[j,4]<=400 and np.hypot(jx-cx,jy-cy)<max(stats[i,2:4]):region|=labels==j
   ys,xs=np.where(region);q=cv2.boxPoints(cv2.minAreaRect(np.float32(np.column_stack((xs,ys)))))
   top=q[np.argsort(q[:,1])[:2]];bottom=q[np.argsort(q[:,1])[2:]]
   q=np.concatenate([top[np.argsort(top[:,0])],bottom[np.argsort(-bottom[:,0])]])
   qs.append(q);covered[region]=255
  qs.sort(key=lambda q:q[:,0].mean());quads[key]=[(q+np.array(OFFSET)).tolist() for q in qs]
  visible=cv2.dilate(covered,np.ones((3,3),np.uint8))
  # Pixels beyond original card registration must not overwrite fingers.
  skin=(r>65)&(r>g*1.13)&(g>b*1.08)&(b>g*.25)&(arr[:,:,3]>100)
  nearby=cv2.dilate(skin.astype('uint8'),np.ones((3,3),np.uint8))>0
  fingers=skin|(nearby&(arr[:,:,:3].max(2)<105));visible[fingers&~sel]=0
  result=im.copy();src=np.float32([[0,0],[319,0],[319,447],[0,447]])
  for q in qs:
   q=(q-q.mean(0))*1.035+q.mean(0)
   tile=cv2.warpPerspective(BACK,cv2.getPerspectiveTransform(src,np.float32(q)),im.size,flags=cv2.INTER_CUBIC)
   tile[:,:,3]=np.minimum(tile[:,:,3],visible);result.alpha_composite(Image.fromarray(tile))
  out=np.array(result);left=(out[:,:,0]>190)&(out[:,:,2]>170)&(out[:,:,1]<85)&(out[:,:,3]>100)
  if left.any():out[:,:,:3]=cv2.inpaint(out[:,:,:3],cv2.dilate(left.astype('uint8')*255,np.ones((3,3),np.uint8)),2,cv2.INPAINT_NS)
  out[fingers&~sel]=arr[fingers&~sel]
  assert np.array_equal(out[fingers&~sel],arr[fingers&~sel])
  remaining=(out[:,:,0]>190)&(out[:,:,2]>170)&(out[:,:,1]<85)&(out[:,:,3]>100)
  assert not remaining.any(),(id,key,'registration color left')
  audit.append({'frame':key,'cardCount':expected,'fingersPreserved':True,'placeholderPixelsRemaining':0,'roundedRadiusRatio':.055})
  return Image.fromarray(out)
 frames={key:pad(cards(im,key,key in static_names)) for key,im in native.items()}
 clips={k:{'frames':v[0],'durations':v[1]} for k,v in CLIPS.items()}
 clips['idle']=clips['blink'];clips['choose-left']=clips['look-left'];clips['choose-right']=clips['look-right']
 eye_mask=soften_boxes(master.size,[cfg['eyePatch']])
 if id=='leon':eye_mask=Image.fromarray(np.minimum(np.array(eye_mask),255-np.array(glasses_mask(master.size))))
 for key in ['rest','left','right','down','nervous','shocked','confident','delighted','grip']:
  im=Image.composite(native['blink'],native[key],eye_mask);im.putalpha(native[key].getchannel('A'))
  frames[key+'-blink']=pad(cards(im,key,key in static_names))
  clips['blink-'+key]={'frames':[key,key+'-blink',key],'durations':[40,100,60]}
 frames['throw-release']=frames['release'];frames['release']=frames['grip']
 clips['blink-release']={'frames':['release','grip-blink','release'],'durations':[40,100,60]}
 runtime=DEST/id;review=REVIEW/'assets'/id;runtime.mkdir(parents=True,exist_ok=True);review.mkdir(parents=True,exist_ok=True)
 bounds={};checks=[]
 for key,im in frames.items():
  box=im.getchannel('A').getbbox();solid=im.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox();clearance=min(solid[0],solid[1],2048-solid[2],2048-solid[3]);assert clearance>=250,(id,key,'padding',clearance)
  im.save(folder/'frames'/(key+'.png'));crop=im.crop(box);crop.save(runtime/(key+'.webp'),lossless=True,exact=True,method=6)
  assert np.array_equal(np.array(crop),np.array(Image.open(runtime/(key+'.webp')).convert('RGBA')))
  im.save(review/(key+'.webp'),lossless=True,exact=True,method=6)
  x,y,r,b=box;bounds[key]=[x,y,r-x,b-y];checks.append({'frame':key,'bounds':solid,'clearance':clearance,'nativePixelsIdentical':True})
 working=cfg['working'];release=np.array(quads['prepare'][working]).mean(0)/4;catch=np.array(quads['caught'][working]).mean(0)/4
 data={'clips':clips,'emotions':EMOTIONS,'bounds':bounds,'handoff':{'releaseMs':200,'released':'throw-release','caught':'caught','release':[release[0],release[1],20,28],'catch':[catch[0],catch[1],20,28]}}
 report={'id':id,'name':id.title(),'nativeCanvas':2048,'actions':'complete character drawings','runtimeBodyPartLayers':0,'clips':clips,'handoff':data['handoff'],'checks':checks,'cards':audit,'registration':registration,'poseAliases':cfg.get('poseAliases',{})}
 (review/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');(folder/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
 (review/'prompts.json').write_text(json.dumps({'tool':'built-in imagegen','selectedSources':rows},indent=2)+'\n')
 for group,keys in [('reactions',['rest','blink','left','right','nervous','shocked','confident','delighted']),('actions',['rest','prepare','throw-release','grip','caught']),('tumble',['release','fall-start','midfall','floor'])]:
  sheet=Image.new('RGBA',(3072*4,3072*((len(keys)+3)//4)))
  for i,key in enumerate(keys):sheet.alpha_composite(frames[key],(i%4*3072+512,i//4*3072+512))
  sheet.save(folder/'sheets'/(group+'.png'))
 frames['rest'].save(ROOT/'public/assets/social-club/masters-native-v1'/(id+'-master.webp'),lossless=True,exact=True,method=6)
 x,y,r,b=cfg['headMatch'];frames['rest'].crop((x+OFFSET[0]-30,y+OFFSET[1],r+OFFSET[0]+30,440+OFFSET[1])).save(ROOT/'public/assets/social-club/masters-v1'/(id+'-portrait.webp'),lossless=True,exact=True,method=6)
 font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
 keys=['rest','blink','left','right','nervous','shocked','confident','delighted','prepare','throw-release','grip','caught','fall-start','midfall','floor']
 board=Image.new('RGB',(1500,3*430),'#172334');d=ImageDraw.Draw(board)
 for i,key in enumerate(keys):
  thumb=frames[key].crop((400,350,1650,1650)).resize((280,292),Image.Resampling.LANCZOS)
  board.paste(thumb,(i%5*300+10,i//5*430+70),thumb);d.text((i%5*300+12,i//5*430+15),key,font=font,fill='#f7e2b6')
 board.save(folder/'contact.jpg',quality=95,subsampling=0)
 print(id,len(frames),'complete frames; minimum padding',min(c['clearance'] for c in checks),flush=True)
 return data
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--faces-only',action='store_true');parser.add_argument('--assemble',action='store_true');parser.add_argument('characters',nargs='*',default=list(CAL));args=parser.parse_args()
 path=DEST/'manifest.json';manifest=json.loads(path.read_text())
 for id in args.characters:
  if args.assemble:
   record=json.loads((OUT/id/'manifest.json').read_text());bounds={}
   for check in record['checks']:
    x,y,r,b=Image.open(OUT/id/'frames'/(check['frame']+'.png')).getchannel('A').getbbox();bounds[check['frame']]=[x,y,r-x,b-y]
   result={'clips':record['clips'],'emotions':EMOTIONS,'bounds':bounds,'handoff':record['handoff']}
  else:result=build(id,args.faces_only)
  if result:
   manifest['characters'][id]=result
   path.write_text(json.dumps(manifest,indent=2)+'\n')
 if args.faces_only:sys.exit(0)
 path.write_text(json.dumps(manifest,indent=2)+'\n')
 target=ROOT/'src/ui/MasterAnimationData.ts';header=target.read_text().split('export const masterAnimations:')[0]
 target.write_text(header+'export const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(manifest['characters'],separators=(',',':'))+';\n')
 (REVIEW/'assets'/'cast.json').write_text(json.dumps([{'id':id,'name':id.title()} for id in ['vera',*CAL]],indent=2)+'\n')
