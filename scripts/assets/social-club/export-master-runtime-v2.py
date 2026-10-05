from pathlib import Path
import json
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parents[3];source=root.parent/'output/100next-master-branch-v2';dest=root/'public/assets/social-club/master-animation-v2';dest.mkdir(parents=True,exist_ok=True)
result={}
for slug in ['vince','finn','june','edgar','roxie','otis','paloma','bianca']:
 folder=dest/slug;folder.mkdir(exist_ok=True);data=json.loads((source/slug/'manifest.json').read_text());frames=set(data['emotions'].values())
 for clip in data['clips'].values():frames.update(clip['frames'])
 bounds={}
 for name in sorted(frames):
  original=Image.open(source/slug/(name+'.png')).convert('RGBA');bbox=original.getchannel('A').getbbox();box=[max(0,bbox[0]-8),max(0,bbox[1]-8),min(2048,bbox[2]+8),min(2048,bbox[3]+8)];crop=original.crop(box);crop.save(folder/(name+'.webp'),lossless=True,exact=True,method=6)
  decoded=Image.open(folder/(name+'.webp')).convert('RGBA');visible=np.array(crop.getchannel('A'))>0;assert np.array_equal(np.array(crop)[visible],np.array(decoded)[visible]);bounds[name]=[box[0],box[1],box[2]-box[0],box[3]-box[1]]
 result[slug]={'clips':{k:v for k,v in data['clips'].items() if k not in ['expressions','blink','alert']},'emotions':data['emotions'],'bounds':bounds}
 print(slug,len(frames),flush=True)
(root/'src/ui/MasterAnimationData.ts').write_text('// Complete master-derived drawings; cropped empty padding is restored inside a fixed 2048 frame.\nexport interface MasterAnimationSet { clips: Record<string,{frames:string[];durations:number[]}>; emotions: Record<string,string>; bounds:Record<string,number[]> }\nexport const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(result,separators=(',',':'))+';\n')
(dest/'manifest.json').write_text(json.dumps({'nativeCanvas':2048,'lossless':True,'resampled':False,'characters':result},indent=2)+'\n')
