"""Correct measured residual pose size without repeatedly resampling pixels."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];P=R/'public/assets/social-club';O=R.parent/'output/animation-audit-2026-10-09-round2';mp=P/'master-animation-v2/manifest.json';cp=P/'condition-animation-v1/manifest.json';m=json.loads(mp.read_text());c=json.loads(cp.read_text());ap=P/'animation-visual-audit-v2.json';audit=json.loads(ap.read_text());verified=json.loads((O/'decoded-verification.json').read_text());families={(r['id'],r['stage'],r['frame']):r['family'] for r in audit['repairs'] if r['method']=='whole pose registration'};originals={(r['id'],r['stage'],r['frame']):r for r in audit['keyPoseMeasurements']}
for row in verified['poseScales']:
 if row['inliers']<12 or abs(row['scale']-1)<.035:continue
 w,s,f=row['id'],row['stage'],row['frame'];d=c['characters'][w][str(s)] if s else m['characters'][w]
 if f in d.get('poseRegistration',{}):continue
 family=[v for v in families[w,s,f] if v in d['bounds']];x,y,ww,hh=d['bounds'][f];pivot=originals.get((w,s,f),{}).get('center',[1024,700])
 if f=='floor':pivot=[x+ww/2,y+hh]
 if f=='whole-throw-6':family+=['recoil','fall-start']
 k=1/row['scale'];transform=[k,pivot[0]*(1-k),pivot[1]*(1-k)];d.setdefault('poseRegistration',{}).update({v:transform for v in family});elapsed=0;prepare=d['clips']['throw']['frames'][0]
 for frame,ms in zip(d['clips']['throw']['frames'],d['clips']['throw']['durations']):
  elapsed+=ms;prepare=frame
  if elapsed>=d['handoff']['releaseMs']:break
 for anchor,frame in [('release',prepare),('catch',d['handoff']['caught'])]:
  if frame in family:
   ax,ay,aw,ah=d['handoff'][anchor];d['handoff'][anchor]=[ax*k+transform[1]/4,ay*k+transform[2]/4,aw*k,ah*k]
 audit['repairs'].append({'id':w,'stage':s,'frame':f,'method':'residual whole-pose display registration','sourceScale':row['scale'],'correction':k,'inliers':row['inliers'],'family':family,'registration':transform});print(w,s,f,'residual unit corrected',round(k,3),flush=True)
for w,d in m['characters'].items():
 if 'whole-throw-6' in d['bounds']:
  d['clips']['return']={'frames':['floor','bounce','airfall-low','airfall','midfall','fall-start','recoil','whole-throw-6','rest'],'durations':[160,70,60,60,70,70,80,190,180]}
 d['clips']['blink']=d['clips']['blink-rest'].copy();d['clips']['idle']=d['clips']['blink-rest'].copy()
for p,meta,var,typ,filename in [(mp,m,'masterAnimations','Record<string, MasterAnimationSet>','MasterAnimationData'),(cp,c,'conditionAnimations','Record<string, Record<number, MasterAnimationSet>>','ConditionAnimationData')]:
 p.write_text(json.dumps(meta,indent=2)+'\n');ts=R/'src/ui'/(filename+'.ts');prefix=ts.read_text().split('export const '+var)[0];payload=meta['characters']
 if filename.startswith('Condition'):payload={w:{s:{k:v for k,v in d.items() if k!='frameCards'} for s,d in stages.items()} for w,stages in payload.items()}
 ts.write_text(prefix+'export const '+var+': '+typ+' = '+json.dumps(payload,separators=(',',':'))+';\n')
ap.write_text(json.dumps(audit,indent=2)+'\n')
