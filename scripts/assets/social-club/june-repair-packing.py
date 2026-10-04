"""Pack complete generated drawings, shared rests and a uniform physical scale."""
from pathlib import Path
from PIL import Image,ImageFilter,ImageChops,ImageDraw
from collections import deque
import numpy as np
import ast,json,math,shutil,sys

# Local reproduction requires the preserved generated sources and original extract helper.
base=Path('output/100next-traditional-sprites').resolve() if Path('output/100next-traditional-sprites').exists() else Path('../output/100next-traditional-sprites').resolve()
root=base/(sys.argv[1] if len(sys.argv)>1 else 'finn-polished-v3')
character_name='June'
assert root.name=='june-repaired-v2'
jobs=json.loads((root/'generation-jobs.json').read_text())['jobs']
old=ast.parse((base/'compile-finn-trial.py').read_text().replace(')>48',')>180'))
exec(compile(ast.Module(body=[n for n in old.body if isinstance(n,ast.FunctionDef) and n.name in ['extract','footcenter']],type_ignores=[]),'extraction','exec'))
drawings={}
for job in jobs:
 shutil.copy2(job['path'],root/(job['id']+'-source.png'))
 if job['id']=='emotions-front':
  # Separate the two touching rows at the source gutter, leaving the generated alpha intact.
  src=Image.open(job['path']).convert('RGBA')
  strips=[src.crop((0,a,src.width,b)) for a,b in [(0,360),(360,734),(734,1018),(1018,src.height)]]
  frames=[]
  for row,strip in enumerate(strips):
   path=root/f'emotions-row-{row}.png';strip.save(path);frames.extend(extract(path,4,4))
  drawings[job['id']]=frames
 else: drawings[job['id']]=extract(job['path'],job['count'],job['cols'])
 print('Extracted',job['id'],len(drawings[job['id']]),flush=True)

ref={j['id']:(7 if j['id']=='return' else 0) for j in jobs}
ref_height={id:fs[ref[id]].getbbox()[3]-fs[ref[id]].getbbox()[1] for id,fs in drawings.items()}
def torso_anchor(im):
 a=np.array(im).astype(float)
 mask=(a[:,:,1]>a[:,:,0]*1.6)&(a[:,:,2]>a[:,:,0]*1.6)&(a[:,:,1]>25)&(a[:,:,3]>180)
 mask[:round(im.height*.42)]=False;mask[round(im.height*.5):]=False
 y,x=np.where(mask)
 assert len(x)>30
 # The curls provide a stable centered upper-body reference; crossed knees do not.
 hair=(a[:,:,3]>180)&(np.max(a[:,:,:3],axis=2)<80)
 hair[round(im.height*.25):]=False
 hy,hx=np.where(hair)
 return float((hx.min()+hx.max())/2),float(np.median(y))
anchors={id:[torso_anchor(im) if id!='tumble' else (im.width/2,im.height) for im in fs] for id,fs in drawings.items()}
height=234
chair=Image.open(base/'finn-polished-v3/chair-fixed-512.png').convert('RGBA')
fall0=np.array(drawings['tumble'][0]).astype(float)
red=(fall0[:,:,0]>fall0[:,:,1]*1.7)&(fall0[:,:,0]>fall0[:,:,2]*1.25)&(fall0[:,:,3]>180)
fy,fx=np.where(red)
fall_scale=197/(fx.max()-fx.min()+1)
chair.save(root/'chair-fixed-512.png')
layers=[];lookup={};checks=[];counts={}
for id,fs in drawings.items():
 scale=fall_scale if id=='tumble' else height/ref_height[id]
 for i,(im,(cx,cy)) in enumerate(zip(fs,anchors[id])):
  if id=='emotions-front':scale=height/(im.getbbox()[3]-im.getbbox()[1])
  layer=Image.new('RGBA',(512,512))
  resized=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
  if id=='tumble':
   a=np.array(im).astype(float)
   gold=(a[:,:,0]>100)&(a[:,:,1]>60)&(a[:,:,0]>a[:,:,1]*1.08)&(a[:,:,1]>a[:,:,2]*1.4)&(a[:,:,3]>180)
   gy,gx=np.where(gold & (np.indices(gold.shape)[0]>im.height*.65))
   pivot_y=float(np.percentile(gy,99)) if len(gy) else im.height-1
   left=round(256-cx*scale);top=round(358-pivot_y*scale)
  else:
   left=round(256-cx*scale);top=round(248-cy*scale)
  layer.alpha_composite(resized,(left,top))
  b=layer.getbbox();clear=[b[0],b[1],512-b[2],512-b[3]]
  assert min(clear)>=128,(id,i,clear,scale)
  lookup[(id,i)]=len(layers);layers.append(layer)
  checks.append({'source':id,'pose':i,'bounds':b,'insets':clear,'sourceScale':scale,'torsoAnchor':[cx,cy],'position':[left,top]})
  counts[(id,i)]=1 if id in ['tumble','return'] or id=='card-actions' and 3<=i<=7 or id=='gestures' and i in [6,7,10,11] else 2
  layer.save(root/f'{id}-pose-{i:02}.png')

def f(id,i):
 if id=='gestures' and i==9 and 'celebrate-repair' in drawings:
  return {'index':lookup[('celebrate-repair',2)],'combinedChair':False,'cards':2}
 if id=='gestures' and i==11 and 'defeat-repair' in drawings:
  return {'index':lookup[('defeat-repair',1)],'combinedChair':False,'cards':1}
 return {'index':lookup[(id,i)],'combinedChair':id in ['tumble','return'],'cards':counts[(id,i)]}
two=f('card-actions',0);one=f('card-actions',5)
defs=[
 ('idle','Idle blink',[two,f('attention',1),two],[900,80,650]),
 ('study','Study cards',[two,f('attention',2),f('attention',3),f('attention',4),two],[200,60,170,70,300]),
 ('look-left','Look left',[two,f('attention',7),f('emotions-directional',0),f('attention',8),two],[160,50,230,50,280]),
 ('look-right','Look right',[two,f('attention',5),f('attention',6),f('attention',9),two],[160,50,230,50,280]),
 ('throw','Throw / wrist flick',[two,f('card-actions',1),f('card-actions',2),f('card-actions',3),f('card-actions',4),one],[200,60,60,40,50,350]),
 ('pickup','Draw / catch',[one,f('card-actions',6),f('card-actions',7),f('card-actions',8),f('card-actions',9),f('card-actions',10),two],[180,60,100,50,60,50,350]),
 ('choose-left','Choose player left',[two,f('attention',7),f('gestures',1),two],[170,50,260,280]),
 ('choose-right','Choose player right',[two,f('gestures',2),f('gestures',3),two],[170,50,260,280]),
 ('danger','Nervous fidget',[two,f('gestures',4),f('gestures',5),f('gestures',4),two],[180,70,200,70,300]),
 ('startle','Overflow startle',[one,f('gestures',6),f('gestures',7)],[150,40,500]),
 ('celebrate','Laugh / celebrate',[two,f('gestures',8),f('gestures',9),f('gestures',8),two],[170,80,110,90,300]),
 ('defeat','Defeated slump',[one,f('gestures',10),f('gestures',11)],[160,80,450]),
 ('tumble','Chair and '+character_name+' tumble',[f('gestures',7)]+[f('tumble',i) for i in range(1,10)],[170,70,50,40,40,40,50,70,100,400]),
 ('return','Right chair / reseat',[f('tumble',i) for i in [9,8,5,4,3,2,1]]+[one],[220,90,80,70,70,80,80,300]),
]
clips=[]
def complete(frame):
 layer=layers[frame['index']]
 if frame['combinedChair']:return layer.copy()
 full=chair.copy();full.alpha_composite(layer);return full

def gif(frames,durations,path,label):
 rgb=[]
 for frame in frames:
  full=complete(frame);canvas=Image.new('RGB',(512,552),'#e8e1d5');canvas.paste(full,(0,0),full)
  ImageDraw.Draw(canvas).text((256,45),label.upper(),anchor='mm',font_size=18,fill='#44392f');rgb.append(canvas)
 sample=Image.new('RGB',(128*len(rgb),138))
 for i,im in enumerate(rgb):sample.paste(im.resize((128,138)),(i*128,0))
 palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 fs=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in rgb]
 fs[0].save(path,save_all=True,append_images=fs[1:],duration=durations,loop=0,disposal=1,optimize=False)

for id,label,frames,durations in defs:
 clip={'id':id,'label':label,'frames':frames,'durations':durations}
 if id=='throw':clip['releaseMs']=320;clip['flightMs']=260
 if id=='pickup':clip['flightStartMs']=180;clip['catchMs']=340
 clips.append(clip)
 for i,frame in enumerate(frames):complete(frame).save(root/f'{id}-frame-{i:02}.png')
 gif(frames,durations,root/f'{id}.gif',label)

names=['calm','focused','curious','skeptical','confident','smug','amused','relieved','nervous','panicked','shocked','frustrated','defeated','delighted']
emotions=[{'id':id,'label':id.capitalize(),'frame':f('emotions-front',i)} for i,id in enumerate(names)]
for i in range(12):
 id=['curious','skeptical','smug','amused','shocked','frustrated'][i//2]+'-'+('left' if i%2==0 else 'right')
 emotions.append({'id':id,'label':id.replace('-',' ').capitalize(),'frame':f('emotions-directional',i)})
used=sorted({frame['index'] for clip in clips for frame in clip['frames']}|{emotion['frame']['index'] for emotion in emotions})
remap={old:new for new,old in enumerate(used)}
for clip in clips:clip['frames']=[{**frame,'index':remap[frame['index']]} for frame in clip['frames']]
for emotion in emotions:emotion['frame']={**emotion['frame'],'index':remap[emotion['frame']['index']]}
two={**two,'index':remap[two['index']]};one={**one,'index':remap[one['index']]}
layers=[layers[index] for index in used]
for size,quality in [(512,94),(320,80),(256,75)]:
 atlas=Image.new('RGBA',(8*size,math.ceil(len(layers)/8)*size))
 for i,layer in enumerate(layers):atlas.alpha_composite(layer.resize((size,size),Image.Resampling.LANCZOS),((i%8)*size,(i//8)*size))
 atlas.save(root/f'characters-{size}.webp',quality=quality,method=6)

normal=[layers[frame['index']] for clip in clips for frame in clip['frames'] if not frame['combinedChair']]
union=np.maximum.reduce([np.array(im.getchannel('A')) for im in normal])
exposed=(np.array(chair.getchannel('A'))>0)&(union==0)
expected=np.array(chair)[exposed]
changed=0
for layer in normal:
 full=chair.copy();full.alpha_composite(layer)
 changed=max(changed,int(np.any(np.array(full)[exposed]!=expected,axis=1).sum()))
assert changed==0
by_id={c['id']:c for c in clips}
assert by_id['throw']['frames'][0]==by_id['pickup']['frames'][-1]
assert by_id['throw']['frames'][-1]==by_id['pickup']['frames'][0]==by_id['return']['frames'][-1]
assert by_id['tumble']['frames'][-1]==by_id['return']['frames'][0]
verification={'uniformNeutralBodyHeight':height,'minimumPadding':min(min(c['insets']) for c in checks),'unchangedChairPixels':int(exposed.sum()),'changedChairPixels':changed,'sharedTwoCardRest':two,'sharedOneCardRest':one,'exactTumbleReturnBoundary':True}
manifest={'status':character_name+' traditional sprite trial','character':character_name,'cellSize':512,'atlasColumns':8,'atlasFrames':len(layers),'clips':clips,'emotions':emotions,'sourceFrameChecks':checks,'verification':verification,'handPolicy':'Retained hand is image-left; working hand is image-right.','gameSequence':['idle','study','look-left','look-right','choose-left','choose-right','danger','throw','pickup','celebrate','throw','startle','tumble','return','defeat','pickup','idle']}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
for name,entries in [('actions',[{'label':c['label'],'frame':c['frames'][min(2,len(c['frames'])-1)]} for c in clips]),('emotions',emotions)]:
 board=Image.new('RGB',(2048,math.ceil(len(entries)/4)*512),'#e8e1d5')
 for i,e in enumerate(entries):
  full=complete(e['frame']);x,y=(i%4)*512,(i//4)*512;board.paste(full,(x,y),full)
  ImageDraw.Draw(board).text((x+256,y+48),e['label'],anchor='mm',font_size=18,fill='#44392f')
 board.save(root/f'{name}-review.png')
all_frames=[frame for clip in clips for frame in clip['frames']]
all_durations=[d for clip in clips for d in clip['durations']]
gif(all_frames,all_durations,root/(character_name.lower()+'-all-animations.gif'),character_name+' · continuity polish')
print(json.dumps({'clips':len(clips),'emotionPoses':len(emotions),'drawings':len(layers),'verification':verification,'atlas256Bytes':(root/'characters-256.webp').stat().st_size}),flush=True)
