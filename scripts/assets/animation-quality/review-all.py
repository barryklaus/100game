"""Second visual audit: all conditions, complete-eye closure and pose registration.

All runtime exports remain flattened whole characters. Never move a separate
head/limb. Backups and incomplete batches stay outside the public directory.
"""
from pathlib import Path
import sys,json,runpy,os
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';O=R.parent/'output/animation-audit-2026-10-09-round2';B=O/'originals';S=O/'staging';B.mkdir(parents=True,exist_ok=True)
helpers=runpy.run_path(str(Path(__file__).with_name('eyelids.py')));EYES=helpers['EYES'];clean_eye=helpers['clean_eye']
files={'master':P/'master-animation-v2/manifest.json','condition':P/'condition-animation-v1/manifest.json'}
if json.loads(files['master'].read_text()).get('qualityRevision')=='visual-audit-v2':raise SystemExit('This migration is already applied. Restore its original snapshot before rebuilding; do not overwrite the final registrations.')
for label,p in files.items():
 if not (B/(label+'.json')).exists():(B/(label+'.json')).write_bytes(p.read_bytes())
m=json.loads((B/'master.json').read_text());c=json.loads((B/'condition.json').read_text());measurements=json.loads((O/'head-registration.json').read_text());audit=[]
sources={'master':json.loads((B/'master.json').read_text()),'condition':json.loads((B/'condition.json').read_text())};checkpoint=O/'repair-checkpoint.json';completed=[]
if checkpoint.exists():
 saved=json.loads(checkpoint.read_text());m=saved['master'];c=saved['condition'];audit=saved['audit'];completed=saved['completed']
def data(who,stage):return c['characters'][who][str(stage)] if stage else m['characters'][who]
def path(who,stage,frame):return P/'condition-animation-v1'/who/str(stage)/(frame+'.webp') if stage else P/'master-animation-v2'/who/(frame+'.webp')
def original(who,stage,frame):
 live=path(who,stage,frame);backup=B/live.relative_to(P)
 if not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(live.read_bytes())
 source=sources['condition']['characters'][who][str(stage)] if stage else sources['master']['characters'][who]
 x,y,w,h=source['bounds'][frame];out=Image.new('RGBA',(2048,2048));out.alpha_composite(Image.open(backup).convert('RGBA'),(x,y));return out
# Cache only one complete set at a time, never the entire cast in memory.
def export(who,stage,frame,im,d):
 box=im.getchannel('A').getbbox();x,y,r,b=box;assert min(x,y,2048-r,2048-b)>=100,(who,stage,frame,box)
 d['bounds'][frame]=[x,y,r-x,b-y];p=S/path(who,stage,frame).relative_to(P);p.parent.mkdir(parents=True,exist_ok=True);im.crop(box).save(p,lossless=True,exact=True,method=4)

def registration(base,im,who):
 a,b=np.array(base),np.array(im);center=np.array(EYES[who]).reshape(2,2,2).mean((0,1));cx,cy=center.astype(int);mask=np.zeros((2048,2048),np.uint8);mask[cy-150:cy+130,cx-170:cx+170]=a[cy-150:cy+130,cx-170:cx+170,3]
 sift=cv2.SIFT_create(nfeatures=1800,contrastThreshold=.02);ka,da=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGBA2GRAY),mask);kb,db=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_RGBA2GRAY),None)
 matches=[p for p,q in cv2.BFMatcher().knnMatch(da,db,k=2) if p.distance<q.distance*.77]
 if len(matches)<12:return None
 M,ins=cv2.estimateAffinePartial2D(np.float32([ka[p.queryIdx].pt for p in matches]),np.float32([kb[p.trainIdx].pt for p in matches]),method=cv2.RANSAC,ransacReprojThreshold=4)
 if M is None or ins.sum()<12:return None
 return {'scale':float(np.hypot(M[0,0],M[1,0])),'center':(M@np.array([cx,cy,1])).tolist(),'inliers':int(ins.sum()),'matches':len(matches)}

def translate(im,angle,dx=0,dy=0):
 M=cv2.getRotationMatrix2D((1024,1110),angle,1);M[:,2]+=[dx,dy];return Image.fromarray(cv2.warpAffine(np.array(im),M,(2048,2048),flags=cv2.INTER_CUBIC))
for who,healthy in m['characters'].items():
 for stage in range(4):
  if [who,stage] in completed:continue
  d=data(who,stage);frames={};transforms={};base=original(who,stage,'rest');blink_rows=[]
  def get(frame):
   if frame not in frames:frames[frame]=original(who,stage,frame)
   return frames[frame]
  # Rebuild complete closed eyelids, including the old outer rim. Glasses retain
  # their own authored lids/rims. Remove unreliable half-eye drawings from live
  # playback; a fast open/closed/open blink avoids incomplete iris fragments.
  for key,clip in list(d['clips'].items()):
   if not key.startswith('blink-'):continue
   pose=clip['frames'][-1];closed=clip['frames'][1];a=get(pose);result=get(closed).copy()
   if who not in ['bianca','leon']:
    result=a.copy();allowed=np.zeros((2048,2048),bool)
    for eye in range(2):
     repaired,box=clean_eye(result,who,eye);x,y,r,b=box;result=repaired;allowed[y:b,x:r]=True
    aa,bb=np.array(a),np.array(result);assert np.array_equal(aa[:,:,3],bb[:,:,3]);assert np.array_equal(aa[~allowed],bb[~allowed])
    frames[closed]=result
    blink_rows.append({'id':who,'stage':stage,'clip':key,'base':pose,'closed':closed,'alphaIdentical':True,'protectedPixelsIdentical':True,'method':'complete oval eyelid with continuous condition colour'})
   else:
    aa,old=np.array(a),np.array(result);bb=aa.copy();allowed=np.zeros((2048,2048),bool)
    for x,y,r,b in EYES[who]:allowed[y-22:b+22,x-22:r+22]=True
    bb[allowed,:3]=old[allowed,:3];frames[closed]=Image.fromarray(bb)
    assert np.array_equal(aa[:,:,3],bb[:,:,3]);assert np.array_equal(aa[~allowed],bb[~allowed]);blink_rows.append({'id':who,'stage':stage,'clip':key,'base':pose,'closed':closed,'alphaIdentical':True,'protectedPixelsIdentical':True,'method':'authored glasses and eyelids retained'})
   clip['frames']=[pose,closed,pose];clip['durations']=[40,80,60]
  audit.extend(blink_rows)
  candidates={row['frame']:row for row in measurements if row['id']==who and row['stage']==stage}
  if stage==0:
   # The previous audit only sampled two of the six drawings. Inspect every
   # approved action drawing, not just the final frame.
   for frame in d['bounds']:
    if frame.startswith(('whole-throw-','whole-receive-')) and frame.rsplit('-',1)[-1].isdigit():
     reg=registration(base,get(frame),who)
     if reg:candidates[frame]=reg
  groups={}
  for name,row in candidates.items():
   if row.get('inliers',0)<12 or abs(row.get('scale',1)-1)<=.03:continue
   ratio=row['scale'];assert .75<ratio<1.3,(who,stage,name,ratio)
   if name in ['fall-start','receive-hold']:continue # Derived from corrected release/receive-empty below.
   if name=='midfall':family=['midfall','airfall','airfall-low']
   elif name=='floor':family=['floor','impact','bounce']
   elif stage and name=='prepare':family=['prepare','prepare-soft']
   elif stage and name=='release':family=['release','throw-edge','settle','recoil','fall-start']
   elif stage and name=='receive-caught':family=['receive-caught','caught-soft']
   elif stage and name in ['receive-empty','receive-hold']:family=['receive-empty','receive-hold']
   else:family=[name]
   family=list(dict.fromkeys(family+[f for f in d['bounds'] if f.startswith(name+'-blink')]))
   pivot=row['center']
   if name=='floor':box=get('floor').getchannel('A').getbbox();pivot=[(box[0]+box[2])/2,box[3]]
   k=1/ratio;M=np.array([[k,0,pivot[0]*(1-k)],[0,k,pivot[1]*(1-k)]])
   for f in family:
    if f not in d['bounds']:continue
    groups[f]=(M,k);transforms[f]=M
   audit.append({'id':who,'stage':stage,'frame':name,'method':'whole pose registration','sourceScale':ratio,'correction':k,'inliers':row['inliers'],'family':family})
  # receive-hold is the final member of receive-empty's identical drawing.
  if stage and 'receive-hold' in candidates and 'receive-empty' not in groups:
   row=candidates['receive-hold']
   if row.get('inliers',0)>=12 and abs(row.get('scale',1)-1)>.03:
    k=1/row['scale'];x,y=row['center'];M=np.array([[k,0,x*(1-k)],[0,k,y*(1-k)]])
    for f in ['receive-empty','receive-hold']:groups[f]=(M,k);transforms[f]=M
    audit.append({'id':who,'stage':stage,'frame':'receive-empty','method':'whole pose registration','sourceScale':row['scale'],'correction':k,'inliers':row['inliers'],'family':['receive-empty','receive-hold']})
  for frame,(M,k) in groups.items():frames[frame]=Image.fromarray(cv2.warpAffine(np.array(get(frame)),M,(2048,2048),flags=cv2.INTER_CUBIC))
  # Flight endpoints follow the same complete drawing transform as its card.
  throw=d['clips']['throw'];elapsed=0;prepare=throw['frames'][0]
  for f,ms in zip(throw['frames'],throw['durations']):
   elapsed+=ms;prepare=f
   if elapsed>=d['handoff']['releaseMs']:break
  for anchor,frame in [('release',prepare),('catch',d['handoff']['caught'])]:
   if frame in transforms:
    M=transforms[frame];x,y,w,h=d['handoff'][anchor];point=M@np.array([x*4,y*4,1]);k=float(M[0,0]);d['handoff'][anchor]=[point[0]/4,point[1]/4,w*k,h*k]
    audit.append({'id':who,'stage':stage,'anchor':anchor,'frame':frame,'method':'flight endpoint follows complete drawing','scale':k})
  if stage==0 and 'whole-throw-6' in d['bounds']:
   held='whole-throw-6';get(held)
   # Eliminate legacy redraws at the start of a throw, after a catch and before
   # a tumble. All three transitions now start/end on an actual held pose.
   d['clips']['throw']['frames'][0]='rest';d['clips']['receive-ready']['frames'][0]=held;d['clips']['pickup']['frames'][-1]='rest';d['clips']['tumble']['frames'][0]=held
   frames['recoil']=translate(frames[held],5,dy=12);frames['fall-start']=translate(frames[held],14,dy=80)
   audit.append({'id':who,'stage':0,'method':'canonical action boundaries','throwStart':'rest','catchEnd':'rest','tumbleStart':held})
  for name,image in frames.items():
   # Only export repaired frames; read-only reference images stay byte-identical.
   if name in groups or name in [row['closed'] for row in blink_rows] or (stage==0 and 'whole-throw-6' in d['bounds'] and name in ['recoil','fall-start']):export(who,stage,name,image,d)
  completed.append([who,stage]);checkpoint.write_text(json.dumps({'master':m,'condition':c,'audit':audit,'completed':completed}))
  print(who,stage,len(blink_rows),'blinks;',len(groups),'registered frames',flush=True)
for meta in [m,c]:meta['qualityRevision']='visual-audit-v2'
m['resamplingScope']='Uniform whole-pose scale registration and native eye-only blink repairs; no separate head or limb transforms.'
# Do not serve a half-authored asset batch with stale crop bounds.
for pending in S.rglob('*.webp'):
 live=P/pending.relative_to(S);os.replace(pending,live)
files['master'].write_text(json.dumps(m,indent=2)+'\n');files['condition'].write_text(json.dumps(c,indent=2)+'\n')
for name,meta,var,typ in [('MasterAnimationData',m,'masterAnimations','Record<string, MasterAnimationSet>'),('ConditionAnimationData',c,'conditionAnimations','Record<string, Record<number, MasterAnimationSet>>')]:
 ts=R/'src/ui'/(name+'.ts');prefix=ts.read_text().split('export const '+var)[0];payload=meta['characters']
 if name.startswith('Condition'):payload={who:{stage:{k:v for k,v in d.items() if k!='frameCards'} for stage,d in stages.items()} for who,stages in payload.items()}
 ts.write_text(prefix+'export const '+var+': '+typ+' = '+json.dumps(payload,separators=(',',':'))+';\n')
(P/'animation-visual-audit-v2.json').write_text(json.dumps({'sets':64,'keyPoseMeasurements':measurements,'repairs':audit},indent=2)+'\n')
print('Applied',len(audit),'visual repairs/checks across all 64 sets',flush=True)
