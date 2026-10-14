"""Export whole-drawing Special Throws; preserve characters and insert real card backs."""
from pathlib import Path
import sys,json,math
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT.parent/'output/special-throws-v1'
sys.path.insert(0,str(SOURCE))
from inspect_frames import components
DEST=ROOT/'public/assets/social-club/special-throw-v1'
DEST.mkdir(parents=True,exist_ok=True)
generated=json.loads((SOURCE/'generation-manifest.json').read_text())['characters']
raws={cid:SOURCE/(cid+'-special-throw-source.png') for cid in ['finn','bianca']}
back=Image.open(ROOT/'public/finn-whole-action-trial/assets/rounded-back.webp').convert('RGBA')
masters=json.loads((ROOT/'public/assets/social-club/master-animation-v2/manifest.json').read_text())['characters']

def quad_for(points):
 pts=np.array(points,dtype=float)
 # Minimum-area oriented rectangle; examine convex hull edge orientations.
 pts=pts[np.lexsort((pts[:,1],pts[:,0]))]
 def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 lower=[];upper=[]
 for p in pts:
  while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
  lower.append(p)
 for p in reversed(pts):
  while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
  upper.append(p)
 hull=np.array(lower[:-1]+upper[:-1]);edges=np.roll(hull,-1,axis=0)-hull
 angles=np.unique(np.round(np.arctan2(edges[:,1],edges[:,0])%(math.pi/2),5))
 best=None
 for angle in angles:
  c,s=math.cos(angle),math.sin(angle);rot=np.array([[c,-s],[s,c]])
  v=pts@rot;lo=v.min(0)-.5;hi=v.max(0)+.5;extent=hi-lo;area=np.prod(extent)
  if best is None or area<best[0]:best=(area,lo,hi,rot,extent)
 _,lo,hi,rot,extent=best
 q=np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])@rot.T
 # Match card portrait direction, including Bianca's upside-down pose.
 a=np.argsort(q[:,1]);top=q[a[:2]];bottom=q[a[2:]]
 q=np.r_[top[np.argsort(top[:,0])],bottom[np.argsort(-bottom[:,0])]]
 return q,extent

KEEP={
 'vince':[[0,1],[0],[0],[0],[0],[0],[0],[0]],
 'finn':[[0,1],[0,1],[0,1],[0,1],[0],[],[0],[0]],
 'june':[[0,1],[0,1],[0,1],[0,1],[0],[0],[0],[0]],
 'roxie':[[],[],[],[],[],[],[],[]],
 'bianca':[[1,2],[1,2],[0,1],[1,2],[0],[0],[1],[0]],
 'tess':[[0,1],[0,1],[0,1],[0,1],[0],[0],[0],[0]],
 'leon':[[0,1],[0,1],[1,2],[0,1],[1],[0],[1],[0]],
}
# Reviewed card surfaces that touch dark clothing or fingers and cannot be
# safely distinguished from a blazer/tie by automatic colour segmentation.
# Coordinates are in the selected native 4×2 drawing, not the padded exports.
EXTRA={
 'vince':{3:[[[1502,229],[1533,224],[1540,250],[1507,257]]]},
 'finn':{5:[[[740,644],[768,659],[751,690],[726,675]]]},
 'edgar':{
  1:[[[698,205],[720,200],[728,234],[707,242]]],
  2:[[[1163,159],[1185,174],[1168,204],[1147,185]]],
  3:[[[1536,184],[1564,192],[1557,226],[1530,219]]],
  4:[[[300,582],[327,593],[316,628],[289,615]]],
  6:[[[1163,605],[1184,611],[1181,641],[1152,635]]]},
 'roxie':{
  0:[[[140,101],[170,93],[182,128],[154,139]],[[307,124],[334,133],[320,169],[294,159]]],
  1:[[[776,122],[803,129],[787,167],[765,154]]],
  2:[[[1216,208],[1241,221],[1221,255],[1196,242]]],
  3:[[[1440,116],[1471,109],[1486,148],[1454,157]],[[1634,160],[1655,166],[1644,201],[1625,194]]],
  4:[[[358,592],[383,605],[363,639],[339,623]]],
  5:[[[789,584],[814,597],[792,635],[770,620]]],
  6:[[[1239,650],[1261,663],[1240,694],[1220,681]]],
  7:[[[1634,571],[1660,581],[1643,616],[1621,606]]]},
 'malik':{5:[[[762,635],[786,649],[767,676],[748,660]]]},
 'hugo':{2:[[[1144,230],[1169,233],[1161,270],[1134,264]]],7:[[[1600,572],[1628,577],[1620,611],[1594,605]]]},
 'jasper':{2:[[[1054,103],[1074,108],[1077,138],[1059,136]]],3:[[[1457,116],[1478,109],[1486,133],[1466,142]]],5:[[[804,582],[827,588],[820,613],[800,607]]]}
}
RELEASE_HANDS={'vince':[95,683],'finn':[267,713],'june':[104,596],'edgar':[107,554],
 'roxie':[273,721],'otis':[190,635],'paloma':[98,566],'bianca':[323,769],
 'vera':[143,575],'tess':[120,586],'nadia':[140,573],'leon':[459,572],
 'dottie':[113,569],'malik':[408,567],'hugo':[380,709],'jasper':[161,537]}

def insert_backs(im,cid,index):
 arr=np.asarray(im).copy();rgb=arr[:,:,:3].astype(float);alpha=arr[:,:,3]
 dark=(rgb.max(2)-rgb.min(2)<13)&(rgb.mean(2)>25)&(rgb.mean(2)<91)&(alpha>160)
 groups,labels=components(dark,True)
 quads=[];masks=[]
 for label,g in enumerate(groups,1):
  if not 65<=g['area']<=2400:continue
  x,y,r,b=g['box'];bw,bh=r-x,b-y
  if min(bw,bh)<7 or max(bw,bh)>100:continue
  ys,xs=np.nonzero(labels==label)
  if y>im.height*.68:continue
  q,ext=quad_for(np.c_[xs,ys]);ratio=min(ext)/max(ext)
  if not .43<=ratio<=.94 or g['area']/np.prod(ext)<.43:continue
  values=rgb[ys,xs]
  if values.std(0).max()>11:continue
  quads.append(q);masks.append(labels==label)
 if cid in KEEP:
  keep=KEEP[cid][index];quads=[q for n,q in enumerate(quads) if n in keep];masks=[m for n,m in enumerate(masks) if n in keep]
 for raw in EXTRA.get(cid,{}).get(index,[]):
  q=np.array(raw,dtype=float)
  if cid in raws:
   source=Image.open(raws[cid]);q-=np.array([round((index%4)*source.width/4),round((index//4)*source.height/2)])
  else:
   c=next(c for c in generated if c['id']==cid);q+=np.array(c['frames'][index]['translation'])
  region=Image.new('L',im.size);ImageDraw.Draw(region).polygon([tuple(p) for p in q],fill=255)
  mask=(np.array(region)>0)&(rgb.max(2)-rgb.min(2)<24)&(rgb.max(2)<115)&(alpha>100)
  quads.append(q);masks.append(mask)
 for q,mask in zip(quads,masks):
  # PIL expects output -> input projective coefficients.
  a=[];b=[]
  for (x,y),(u,v) in zip(q,[(0,0),(back.width,0),(back.width,back.height),(0,back.height)]):
   a.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);b.extend([u,v])
  coeff=np.linalg.solve(np.array(a),np.array(b))
  tile=back.transform(im.size,Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
  # Replace only the registration surface. Drawn fingers and outlines stay intact.
  layer=Image.new('RGBA',im.size)
  layer.paste(tile,(0,0),Image.fromarray(mask.astype('uint8')*255))
  im=Image.alpha_composite(im,layer)
 return im,[q.round(2).tolist() for q in quads]

def source_frames(cid):
 entry=next((c for c in generated if c['id']==cid),None)
 if entry:return [Image.open(SOURCE/f['path']).convert('RGBA') for f in entry['frames']]
 source=Image.open(raws[cid]).convert('RGBA');frames=[]
 for i in range(8):
  x0=round((i%4)*source.width/4);x1=round((i%4+1)*source.width/4)
  y0=round((i//4)*source.height/2);y1=round((i//4+1)*source.height/2)
  im=source.crop((x0,y0,x1,y1));a=np.array(im);a[a[:,:,3]<8]=0
  frames.append(Image.fromarray(a))
 return frames

manifest={'version':1,'characters':{},'durations':[110,90,90,100,75,100,100,140],
 'releaseMs':390,'releaseFrame':4,'notes':'Complete drawings; real rounded card backs; fixed scale per character; standing foot anchor; native cropped lossless frames.'}
review=Image.new('RGB',(1600,4*420),(14,22,32));draw=ImageDraw.Draw(review)
for n,cid in enumerate(masters):
 frames=source_frames(cid);visible=[]
 for im in frames:visible.append(im.getchannel('A').point(lambda a:255 if a>24 else 0).getbbox())
 x0,y0,r0,b0=visible[0];rest=masters[cid]['bounds']['rest'];restheight=rest[3]
 # The healthy first cast is smaller on its native canvas. Preserve that display size.
 # Standing adds leg extension while keeping the torso/head close to the idle scale.
 scale=restheight/(b0-y0)*1.1
 floor=rest[1]+rest[3]
 anchorx=(x0+r0)/2
 data={'frames':[],'bounds':{},'cards':[],'release':[],'move':next((c['move'] for c in generated if c['id']==cid),'The Catastrophic Wind-up' if cid=='finn' else 'The Impossible Cartwheel')}
 out=DEST/cid;out.mkdir(exist_ok=True)
 for i,(im,box) in enumerate(zip(frames,visible)):
  im,quads=insert_backs(im,cid,i)
  crop=im.crop(box);name=f'special-{i+1:02d}';crop.save(out/f'{name}.webp',lossless=True,exact=True,method=6)
  x,y,r,b=box
  # Preserve the sheet's horizontal root coordinate; foot height is registered once per pose.
  center=anchorx if cid not in raws else frames[0].width/2
  dx=1024-center*scale;dy=floor+100-b*scale-(150 if cid=='bianca' and i==3 else 0)
  data['bounds'][name]=[x*scale+dx,y*scale+dy,(r-x)*scale,(b-y)*scale]
  data['frames'].append(name);data['cards'].append(quads)
  if i==4:
   hx,hy=RELEASE_HANDS[cid]
   if cid in raws:
    original=Image.open(raws[cid]);hy-=round(original.height/2)
   else:
    c=next(c for c in generated if c['id']==cid);tx,ty=c['frames'][i]['translation'];hx+=tx;hy+=ty
   data['release']=[hx*scale+dx,hy*scale+dy,26*scale,36*scale]
  if i==0:
   p=crop.copy();p.thumbnail((380,340),Image.Resampling.LANCZOS)
   xx,yy=(n%4)*400,(n//4)*420;review.paste(p,(xx+(400-p.width)//2,yy+350-p.height),p)
   draw.text((xx+15,yy+363),cid,fill=(255,220,160))
   draw.text((xx+15,yy+385),'cards detected: '+str(len(quads)),fill=(170,190,210))
 manifest['characters'][cid]=data
 print(cid,[len(q) for q in data['cards']],flush=True)
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
header='// Complete whole-character drawings for the once-per-round Special Throw.\nexport interface SpecialThrowSet {frames:string[]; bounds:Record<string,number[]>; release:number[];move:string}\n'
runtime={cid:{k:v for k,v in data.items() if k!='cards'} for cid,data in manifest['characters'].items()}
(ROOT/'src/ui/SpecialThrowData.ts').write_text(header+'export const specialThrows:Record<string,SpecialThrowSet> = '+json.dumps(runtime,separators=(',',':'))+';\nexport const specialThrowDurations = '+json.dumps(manifest['durations'])+';\nexport const specialThrowReleaseMs = '+str(manifest['releaseMs'])+';\n')
review.save(SOURCE/'runtime-card-review.jpg',quality=95)
