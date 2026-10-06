"""Complete master-derived expression drawings: local eyes and mouth edits only.

No head geometry, hair, body, clothes, hands, outline, or opacity may change.
Each drawing is flattened from the original master, not a chained redraw.
"""
from pathlib import Path
import json, hashlib, runpy, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT.parent/'output/100next-character-masters/chair-free-v1'
PREVIOUS=ROOT.parent/'output/100next-master-branch-v1'
OUT=ROOT.parent/'output/100next-master-branch-v2'
helpers=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))
EYES=helpers['EYES'];blink=helpers['blink'];glance=helpers['glance'];gif=helpers['preview_gif']
# Keep future master exports on the same repaired contour policy as runtime.
mouth_helpers=runpy.run_path(str(Path(__file__).with_name('repair-master-mouth-lines.py')))
mouth_edit=mouth_helpers['mouth']
MOUTHS={}
for slug,polygon in mouth_helpers['POLYGONS'].items():
    points=np.array(polygon);lo=points.min(axis=0)-8;hi=points.max(axis=0)+9
    old=mouth_helpers['OLD_BOXES'][slug]
    MOUTHS[slug]=(min(old[0],lo[0]),min(old[1],lo[1]),max(old[2],hi[0]),max(old[3],hi[1]))

def build(slug):
    destination=OUT/slug;destination.mkdir(parents=True,exist_ok=True)
    for file in (PREVIOUS/slug).glob('*.png'):
        if file.stem in ['rest','blink-half','blink','left-mid','left','right-mid','right','down-mid','down']:
            shutil.copy2(file,destination/file.name)
    master=Image.open(SOURCE/(slug+'-master'+('-v2' if slug=='finn' else '')+'.png')).convert('RGBA')
    base=np.array(master);allowed=np.zeros((2048,2048),bool)
    if slug=='bianca':allowed[629:677,953:1081]=True
    for x0,y0,x1,y1 in EYES[slug]+[MOUTHS[slug]]:allowed[y0:y1,x0:x1]=True
    frames={}
    kinds=['nervous','panic-soft','panicked','shock-soft','shocked','amused','smug','relieved','frustrated','defeated','delighted']
    for key in kinds:
        frame=mouth_edit(master,slug,key)
        if key=='nervous':frame=glance(frame,EYES[slug],-3)
        if key=='defeated':frame=glance(frame,EYES[slug],0,4)
        if key in ('smug','frustrated'):frame=blink(frame,EYES[slug],.5)
        if key in ('delighted','relieved'):frame=blink(frame,EYES[slug],1)
        frame.putalpha(master.getchannel('A'))
        a=np.array(frame)
        assert np.array_equal(a[~allowed],base[~allowed]),(slug,key,'protected pixels changed')
        assert np.array_equal(a[:,:,3],base[:,:,3]),(slug,key,'silhouette changed')
        frame.save(destination/(key+'.png'))
        frames[key]=frame
    data=json.loads((PREVIOUS/slug/'manifest.json').read_text())
    data['emotions']={'calm':'rest','focused':'down','curious':'left','skeptical':'blink-half','confident':'rest',**{k:k for k in kinds if not k.endswith('-soft')}}
    data['clips'].update({
      'idle':data['clips']['blink'],
      'choose-left':{'frames':['rest','left-mid','left','left-mid','rest'],'durations':[60,60,280,60,100]},
      'choose-right':{'frames':['rest','right-mid','right','right-mid','rest'],'durations':[60,60,280,60,100]},
      'danger':{'frames':['nervous','panic-soft','panicked','panic-soft','nervous'],'durations':[160,70,240,70,160]},
      'startle':{'frames':['rest','shock-soft','shocked'],'durations':[70,60,220]},
      'celebrate':{'frames':['rest','amused','delighted','relieved','rest'],'durations':[60,90,180,100,120]},
      'defeat':{'frames':['rest','nervous','defeated'],'durations':[60,80,400]},
      'expressions':{'frames':['rest','down','blink-half','amused','smug','nervous','panicked','shocked','frustrated','defeated','delighted','relieved'],'durations':[300]*12},
    })
    data.update({'sourceSHA256':hashlib.sha256(master.tobytes()).hexdigest(),'mutableRegions':EYES[slug]+[MOUTHS[slug]],'emotionPolicy':'Native master; only local eye and mouth areas edited; all protected RGBA and alpha identical','status':'complete facial animation set; movement generation in progress'})
    (destination/'manifest.json').write_text(json.dumps(data,indent=2)+'\n')
    frames['rest']=master;gif(frames,data['clips']['expressions']['frames'][:1]+kinds,[350]*(len(kinds)+1),destination/'expressions.gif',True)
    print(json.dumps({'character':slug,'expressionFrames':len(kinds),'protectedPixelsIdentical':True}),flush=True)
    return frames

if __name__=='__main__':
    for slug in EYES:build(slug)
