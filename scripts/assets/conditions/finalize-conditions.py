"""Finish the one-card release edge and verify exact handoff ownership."""
from pathlib import Path
import json,runpy
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'public/assets/social-club/condition-animation-v1'
helpers=runpy.run_path(str(Path(__file__).with_name('export-conditions.py')))
m=json.loads((DEST/'manifest.json').read_text())
assert len(m['characters'])==16 and all(len(c)==3 for c in m['characters'].values())
for id,stages in m['characters'].items():
 for stage,data in stages.items():
  directory=DEST/id/stage
  b=data['bounds']['release'];frame=Image.new('RGBA',(2048,2048));frame.alpha_composite(Image.open(directory/'release.webp'),(b[0],b[1]))
  frame=helpers['translate'](frame,dx=-3,dy=-2,angle=.4)
  box=frame.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
  data['bounds']['throw-edge']=[box[0],box[1],box[2]-box[0],box[3]-box[1]]
  frame.crop(box).save(directory/'throw-edge.webp',lossless=True,exact=True,method=4)
  data['frameCards']={key:1 if key in ['release','throw-edge','settle','receive-empty','receive-hold','release-blink','release-blink-half','midfall','floor','recoil','fall-start','airfall','airfall-low','impact','bounce'] else 2 for key in data['bounds']}
  t=0
  for key,ms in zip(data['clips']['throw']['frames'],data['clips']['throw']['durations']):
   if t>=data['handoff']['releaseMs']:assert data['frameCards'][key]==1
   t+=ms
m['revision']='whole-condition-drawings-v1-reviewed'
(DEST/'manifest.json').write_text(json.dumps(m,separators=(',',':')))
(ROOT/'src/ui/ConditionAnimationData.ts').write_text("import type { MasterAnimationSet } from './MasterAnimationData';\nexport const conditionAnimations:Record<string,Record<string,MasterAnimationSet>>="+json.dumps({id:{stage:{key:value for key,value in data.items() if key!='frameCards'} for stage,data in stages.items()} for id,stages in m['characters'].items()},separators=(',',':'))+';\n')
print('Finished 48 condition sets, including synchronous one-card release ownership.')
