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
MOUTHS={
 'vince':(977,684,1049,731), 'finn':(993,699,1051,728),
 'june':(988,707,1048,745), 'edgar':(995,735,1042,762),
 'roxie':(984,700,1060,740), 'otis':(1001,708,1061,734),
 'paloma':(982,724,1044,760), 'bianca':(978,697,1042,730),
}
FEMALE={'june','roxie','paloma','bianca'}

def mouth_edit(master,slug,kind):
    box=MOUTHS[slug];crop=master.crop(box);w,h=crop.size
    mask=Image.new('L',(w,h));draw=ImageDraw.Draw(mask)
    if slug=='vince':
        draw.polygon([(1,1),(29,22),(52,32),(69,35),(69,44),(30,44),(1,26)],fill=255)
    else:
        draw.rounded_rectangle((1,1,w-2,h-2),radius=5,fill=255)
    # Reconstruct skin inside the mouth region from the original boundary.
    active=np.array(mask)>0;a=np.array(crop).astype(float);rgb=a[:,:,:3].copy()
    rgb[active]=np.median(rgb[~active],axis=0)
    for _ in range(240):
        mean=(np.roll(rgb,1,0)+np.roll(rgb,-1,0)+np.roll(rgb,1,1)+np.roll(rgb,-1,1))/4
        rgb[active]=mean[active]
    a[:,:,:3]=rgb;repair=Image.fromarray(np.clip(a,0,255).astype('uint8'))
    patch=Image.composite(repair,crop,mask)
    # Subpixel antialiasing is local; the master canvas is never resized.
    marks=Image.new('RGBA',(w*4,h*4));d=ImageDraw.Draw(marks)
    cx=(w*.40 if slug=='vince' else w*.50)*4;cy=(h*.60 if slug=='vince' else h*.55)*4
    ink=(38,24,23,255);lip=(151,34,39,255);width=min(w*.65,42)*4
    if kind in ('nervous','frustrated','defeated','smug','relieved'):
        height=3*4;points=[]
        for i in range(25):
            t=i/24;x=cx-width/2+t*width
            if kind=='nervous':y=cy+np.sin(t*3*np.pi)*3
            elif kind in ('frustrated','defeated'):y=cy-12*np.sin(t*np.pi)
            else:y=cy+12*np.sin(t*np.pi)
            points.append((x,y))
        if slug in FEMALE:d.line(points,fill=lip,width=18)
        d.line(points,fill=ink,width=8 if slug in FEMALE else 10)
    else:
        mw=min(width,32*4);mh=min(h*.75*4,26*4)
        if kind=='panic-soft':mh*=.45;mw*=.75
        if kind=='shock-soft':mh*=.6
        if kind in ('amused','delighted'):mw=min(width,40*4);mh*=.7
        outer=(cx-mw/2,cy-mh/2,cx+mw/2,cy+mh/2)
        if slug in FEMALE:
            d.ellipse((outer[0]-5,outer[1]-3,outer[2]+5,outer[3]+3),fill=lip)
        d.ellipse(outer,fill=ink)
        clip=Image.new('L',marks.size);ImageDraw.Draw(clip).ellipse(outer,fill=255)
        inside=Image.new('RGBA',marks.size);e=ImageDraw.Draw(inside)
        if kind in ('amused','delighted','panicked','panic-soft'):
            e.rectangle((cx-mw/2,cy-mh/2,cx+mw/2,cy-mh/2+mh*.25),fill=(251,244,224,255))
        e.ellipse((cx-mw*.25,cy+mh*.15,cx+mw*.35,cy+mh*.6),fill=(213,93,111,255))
        inside.putalpha(Image.composite(inside.getchannel('A'),Image.new('L',marks.size),clip))
        marks.alpha_composite(inside)
    marks=marks.resize((w,h),Image.Resampling.LANCZOS)
    # Restrict all new ink to the calibrated mouth region.
    marks.putalpha(Image.composite(marks.getchannel('A'),Image.new('L',(w,h)),mask))
    patch.alpha_composite(marks)
    result=master.copy();result.paste(patch,(box[0],box[1]));return result

def build(slug):
    destination=OUT/slug;destination.mkdir(parents=True,exist_ok=True)
    for file in (PREVIOUS/slug).glob('*.png'):
        if file.stem in ['rest','blink-half','blink','left-mid','left','right-mid','right','down-mid','down']:
            shutil.copy2(file,destination/file.name)
    master=Image.open(SOURCE/(slug+'-master'+('-v2' if slug=='finn' else '')+'.png')).convert('RGBA')
    base=np.array(master);allowed=np.zeros((2048,2048),bool)
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
