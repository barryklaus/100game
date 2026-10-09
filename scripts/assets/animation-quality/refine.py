"""Offline complete-frame repairs; no body-part animation at runtime.

Requires Pillow, NumPy and OpenCV. Originals are retained outside public/.
Eye edits preserve every pixel outside calibrated eye regions, including alpha.
Tumbles use one uniform transform for the entire drawing, measured against the
master's head features. Never independently resize a head, hand or limb.
"""
from pathlib import Path
import json, os, runpy, sys
sys.path.insert(0, '/tmp/100next-motion-tools')
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT/'public/assets/social-club'
OUT = ROOT.parent/'output/animation-audit-2026-10-09'
BACKUP = OUT/'originals'
STAGING = OUT/'refined-staging'
HELP = runpy.run_path(str(ROOT/'scripts/assets/social-club/build-master-reactions.py'))
EYES = HELP['EYES'].copy()
CAL = json.loads((ROOT/'scripts/assets/social-club/expanded-cast-calibration.json').read_text())
CAL['vera']={'eyes':[(580,288,615,307),(638,297,677,317)]}
for who, cfg in CAL.items():
    EYES[who] = [(a+397,b+362,c+397,d+362) for a,b,c,d in cfg['eyes']]
MASTER = PUBLIC/'master-animation-v2/manifest.json'
CONDITION = PUBLIC/'condition-animation-v1/manifest.json'
master = json.loads(MASTER.read_text())
condition = json.loads(CONDITION.read_text())
BACKUP.mkdir(parents=True,exist_ok=True)
for label,meta in [('master',master),('condition',condition)]:
    saved=BACKUP/(label+'-manifest.json')
    if not saved.exists():saved.write_text(json.dumps(meta))
source_master=json.loads((BACKUP/'master-manifest.json').read_text())
source_condition=json.loads((BACKUP/'condition-manifest.json').read_text())
cv2.setRNGSeed(100)
audit = []

def directory(who, stage):
    return PUBLIC/('condition-animation-v1' if stage else 'master-animation-v2')/who/str(stage) if stage else PUBLIC/'master-animation-v2'/who

def original(who, stage, frame, data):
    path = directory(who,stage)/(frame+'.webp')
    saved = BACKUP/path.relative_to(PUBLIC)
    if not saved.exists():
        saved.parent.mkdir(parents=True,exist_ok=True)
        saved.write_bytes(path.read_bytes())
    original_data=source_condition['characters'][who][str(stage)] if stage else source_master['characters'][who]
    x,y,w,h = original_data['bounds'].get(frame,data['bounds'].get(frame))
    result = Image.new('RGBA',(2048,2048))
    result.alpha_composite(Image.open(saved).convert('RGBA'),(x,y))
    return result

def export(who, stage, frame, image, data):
    box = image.getchannel('A').getbbox()
    x,y,r,b = box
    assert min(x,y,2048-r,2048-b)>=100, (who,stage,frame,box)
    data['bounds'][frame] = [x,y,r-x,b-y]
    live=directory(who,stage)/(frame+'.webp');path=STAGING/live.relative_to(PUBLIC);crop=image.crop(box)
    existing_path=path if path.exists() else live
    if existing_path.exists():
        existing=Image.open(existing_path).convert('RGBA')
        if existing.size==crop.size and existing.tobytes()==crop.tobytes():return
    path.parent.mkdir(parents=True,exist_ok=True)
    crop.save(path,lossless=True,exact=True,method=4)

def regions(base, who):
    """Find each sclera locally; a padded patch avoids the old rectangular wipe."""
    a = np.array(base)
    result = []
    for x0,y0,x1,y1 in EYES[who]:
        box = (x0-15,y0-15,x1+15,y1+15)
        x,y,r,b = box
        rgb = a[y:b,x:r,:3]
        white = (rgb.min(axis=2)>180)&(np.ptp(rgb.astype(int),axis=2)<60)
        count,labels,stats,_ = cv2.connectedComponentsWithStats(white.astype('uint8'))
        candidates = [i for i in range(1,count) if stats[i,4]>=12]
        if not candidates: continue
        # Ignore isolated teeth/highlights; the search is centred on this eye.
        cx,cy=(x0+x1)/2-x,(y0+y1)/2-y
        chosen=[i for i in candidates if abs(stats[i,0]+stats[i,2]/2-cx)<(x1-x0)/2+6 and abs(stats[i,1]+stats[i,3]/2-cy)<(y1-y0)/2+5]
        if not chosen:chosen=[min(candidates,key=lambda i:(stats[i,0]+stats[i,2]/2-cx)**2+(stats[i,1]+stats[i,3]/2-cy)**2)]
        yy,xx=np.where(np.isin(labels,chosen))
        hull=cv2.convexHull(np.stack([xx,yy],axis=1).astype('int32'))
        mask=np.zeros(white.shape,np.uint8);cv2.fillConvexPoly(mask,hull,255)
        result.append((box,mask))
    assert len(result)==2,(who,'Both eyes must be identified')
    return result

def eyelids(base, who, amount):
    frame=np.array(base).copy()
    for (x,y,r,b),sclera in regions(base,who):
        patch=frame[y:b,x:r].copy();rgb=patch[:,:,:3].copy()
        # Remove the complete old eye outline. Eyebrows are outside this shape.
        mask=sclera if who=='bianca' else cv2.dilate(sclera,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
        # Reconstruct the small skin surface from nearby skin/bruise colours.
        # Feeding the old ink into inpainting produces dark smeared eyelids.
        ring=(cv2.dilate(mask,np.ones((17,17),np.uint8))>0)&(mask==0)
        valid=ring&(rgb.min(axis=2)>35)&(rgb.max(axis=2)>105)&(np.ptp(rgb.astype(int),axis=2)>30)
        assert valid.sum()>8,(who,'skin samples')
        gy,gx=np.indices(mask.shape);design=np.stack([np.ones_like(gx),gx/100,gy/100],axis=-1)
        fit=np.linalg.lstsq(design[valid],rgb[valid].astype(float),rcond=None)[0]
        surface=np.clip(design@fit,np.percentile(rgb[valid],5,axis=0),np.percentile(rgb[valid],95,axis=0)).astype('uint8')
        repaired=rgb.copy();repaired[mask>0]=surface[mask>0]
        yy,xx=np.where(sclera>0);left,right=int(xx.min()),int(xx.max())
        top,bottom=int(yy.min()),int(yy.max());height=bottom-top+1
        cleaned=repaired.copy()
        if amount<1:
            # Compress the actual eye down to a lower crescent; keep its iris,
            # colour and gaze instead of drawing a new pupil or straight cut.
            eye=Image.fromarray(patch).crop((left,top,right+1,bottom+1))
            height2=max(3,round(height*(1-amount)))
            eye=eye.resize((eye.width,height2),Image.Resampling.LANCZOS)
            em=Image.fromarray(sclera).crop((left,top,right+1,bottom+1)).resize(eye.size,Image.Resampling.LANCZOS)
            target=Image.fromarray(np.dstack([cleaned,patch[:,:,3]]))
            target.paste(eye,(left,bottom-height2+1),em);cleaned=np.array(target)[:,:,:3]
            lid=bottom-height2+1
        else: lid=top+height*.60
        marks=Image.new('RGBA',((r-x)*4,(b-y)*4));draw=ImageDraw.Draw(marks)
        points=[((left+(right-left)*t)*4,(lid+2.5*np.sin(np.pi*t))*4) for t in np.linspace(0,1,50)]
        draw.line(points,fill=(35,24,22,255),width=9)
        patch[:,:,:3]=cleaned
        merged=Image.fromarray(patch);merged.alpha_composite(marks.resize(merged.size,Image.Resampling.LANCZOS))
        changed=np.array(merged);changed[:,:,3]=patch[:,:,3]
        # Antialiasing is confined to the same calibrated eye region.
        frame[y:b,x:r]=changed
    result=Image.fromarray(frame)
    assert np.array_equal(frame[:,:,3],np.array(base)[:,:,3])
    return result

def gaze(base, who, direction, strength=.14):
    a=np.array(base);out=a.copy()
    for (x,y,r,b),mask in regions(base,who):
        patch=a[y:b,x:r].copy();inside=mask>0
        ink=(patch[:,:,:3].min(axis=2)<130)&inside
        yy,xx=np.where(ink)
        if len(xx)<5: continue
        # Keep the pupil safely inside the sclera, never clip it at the rim.
        white=(patch[:,:,:3].min(axis=2)>180)&inside
        if not white.any():continue
        color=np.median(patch[:,:,:3][white],axis=0).astype('uint8')
        left,right=xx.min(),xx.max();top,bottom=yy.min(),yy.max()
        sy,sx=np.where(inside);amount=round((sx.max()-sx.min())*strength)*direction
        amount=int(np.clip(amount,min(0,sx.min()-left+2),max(0,sx.max()-right-2)))
        cleaned=patch.copy();cleaned[:,:,:3][inside]=color
        iris=patch[top:bottom+1,left:right+1].copy()
        moved=np.zeros_like(patch);moved[top:bottom+1,left+amount:right+amount+1]=iris
        use=(moved[:,:,3]>0)&inside
        cleaned[use]=moved[use];out[y:b,x:r]=cleaned
    out[:,:,3]=a[:,:,3]
    return Image.fromarray(out)

def same_body(base, frame, who):
    a,b=np.array(base),np.array(frame);allowed=np.zeros(a.shape[:2],bool)
    for x,y,r,bt in EYES[who]: allowed[y-15:bt+15,x-15:r+15]=True
    assert np.array_equal(a[~allowed],b[~allowed])
    assert np.array_equal(a[:,:,3],b[:,:,3])
    return int(np.any(a!=b,axis=2).sum())

def repair_set(who, stage, data):
    # Closed artwork behind glasses is already authored to the exact rims.
    # Reuse only that eye region; never reuse its differently posed torso.
    for key,clip in list(data['clips'].items()):
        if not key.startswith('blink-'):continue
        base_name=clip['frames'][-1];base=original(who,stage,base_name,data)
        closed=clip['frames'][1]
        if stage:
            # Injured eyes have authored bruise colours and narrow lids. Keep
            # that complete local drawing rather than infer skin from sclera.
            for name in set(clip['frames'])-{base_name}:
                donor=original(who,stage,name,data);image=base.copy()
                for x,y,r,b in EYES[who]:
                    box=(x-15,y-15,r+15,b+15);image.paste(donor.crop(box),box[:2])
                same_body(base,image,who);export(who,stage,name,image,data)
                audit.append({'id':who,'stage':stage,'frame':name,'protectedPixelsIdentical':True,'alphaIdentical':True,'method':'pose-specific authored injury eyelids'})
            clip['durations']=[40,75,40,50]
            continue
        if who in ['bianca','leon'] or (not stage and who in CAL):
            donor=original(who,stage,closed,data);image=base.copy()
            for x,y,r,b in EYES[who]:
                box=(x-8,y-8,r+8,b+8);image.paste(donor.crop(box),box[:2])
            if base_name=='release' and not stage and who in CAL:
                closed='release-blink';export(who,stage,closed,image,data)
                clip['frames']=[base_name,closed,base_name]
            else:export(who,stage,closed,image,data)
            same_body(base,image,who)
            clip['durations']=[40,75,60] if len(clip['frames'])==3 else [40,75,40,50]
            audit.append({'id':who,'stage':stage,'frame':closed,'protectedPixelsIdentical':True,'alphaIdentical':True,'method':'pose-specific authored eye region'})
            continue
        for name,amount in [(closed,1)]+([(clip['frames'][0],.55)] if len(clip['frames'])==4 else []):
            image=eyelids(base,who,amount);changed=same_body(base,image,who)
            export(who,stage,name,image,data)
            audit.append({'id':who,'stage':stage,'frame':name,'protectedPixelsIdentical':True,'alphaIdentical':True,'changedPixels':changed,'method':'contour eyelid'})
        clip['durations']=[40,75,40,50] if len(clip['frames'])==4 else [40,75,60]
    # Original eight's approved whole throw drawings need their OWN blink.
    if not stage and who not in CAL:
        pose=data['clips']['throw']['frames'][-1];base=original(who,stage,pose,data)
        frames=[]
        for suffix,amount in [('half',.55),('closed',1)]:
            name=f'{pose}-blink-{suffix}';image=eyelids(base,who,amount)
            changed=same_body(base,image,who);export(who,stage,name,image,data);frames.append(name)
            audit.append({'id':who,'stage':stage,'frame':name,'protectedPixelsIdentical':True,'alphaIdentical':True,'changedPixels':changed,'method':'approved one-card pose'})
        data['clips']['blink-'+pose]={'frames':[frames[0],frames[1],frames[0],pose],'durations':[40,75,40,50]}
    # Retain the tension expression during automatic and selected-player glances.
    poses={data['emotions'][name] for name in ['focused','nervous','panicked']}
    for pose in poses-{'rest'}:
        base=original(who,stage,pose,data)
        for side,direction in [('left',-1),('right',1)]:
            name=f'{pose}-gaze-{side}';image=gaze(base,who,direction)
            changed=same_body(base,image,who);export(who,stage,name,image,data)
            data['clips'][f'look-{side}@{pose}']={'frames':[pose,name,pose],'durations':[60,260,80]}
            if stage:data['frameCards'][name]=2
            audit.append({'id':who,'stage':stage,'frame':name,'protectedPixelsIdentical':True,'alphaIdentical':True,'changedPixels':changed,'method':'expression-preserving gaze'})
    base=original(who,stage,'rest',data)
    for side,direction in [('left',-1),('right',1)]:
        for suffix,strength in [('-mid',.07),('',.14)]:
            name=side+suffix;image=gaze(base,who,direction,strength)
            changed=same_body(base,image,who);export(who,stage,name,image,data)
            audit.append({'id':who,'stage':stage,'frame':name,'protectedPixelsIdentical':True,'alphaIdentical':True,'changedPixels':changed,'method':'bounded pupil movement'})
    # Every one-card idle ends at its existing release blink pose for conditions.
    if stage:data['clips']['throw']['frames'][-1]='release'
    print(who,stage,'eyes and expression continuity',flush=True)

def normalize_falls(who,data):
    sift=cv2.SIFT_create();matcher=cv2.BFMatcher()
    base=np.array(original(who,0,'rest',data));mask=np.zeros((2048,2048),np.uint8);mask[460:800,850:1190]=255
    kp,desc=sift.detectAndCompute(cv2.cvtColor(base,cv2.COLOR_RGBA2GRAY),mask)
    for name in ['fall-start','midfall','floor']:
        frame=original(who,0,name,data);arr=np.array(frame)
        other,od=sift.detectAndCompute(cv2.cvtColor(arr,cv2.COLOR_RGBA2GRAY),None)
        matches=[p for p,q in matcher.knnMatch(desc,od,k=2) if p.distance<q.distance*.8]
        transform,inliers=cv2.estimateAffinePartial2D(np.float32([kp[p.queryIdx].pt for p in matches]),np.float32([other[p.trainIdx].pt for p in matches]),method=cv2.RANSAC,ransacReprojThreshold=5)
        assert transform is not None and inliers.sum()>=8,(who,name,'insufficient head registration')
        ratio=float(np.hypot(transform[0,0],transform[1,0]));assert .85<ratio<1.5
        center=transform@np.array([1024,650,1.]);scale=1/ratio
        uniform=np.array([[scale,0,center[0]*(1-scale)],[0,scale,center[1]*(1-scale)]])
        corrected=Image.fromarray(cv2.warpAffine(arr,uniform,(2048,2048),flags=cv2.INTER_CUBIC))
        export(who,0,name,corrected,data)
        audit.append({'id':who,'stage':0,'frame':name,'method':'whole-drawing head-scale registration','sourceHeadScale':round(ratio,5),'correction':round(scale,5),'inliers':int(inliers.sum()),'correctedHeadScale':1})
    def full(name):
        x,y,w,h=data['bounds'][name];out=Image.new('RGBA',(2048,2048));live=directory(who,0)/(name+'.webp');pending=STAGING/live.relative_to(PUBLIC);out.alpha_composite(Image.open(pending if pending.exists() else live).convert('RGBA'),(x,y));return out
    for name,source,angle,dx,dy in [('recoil','release',-2,0,-5),('airfall','midfall',5,0,18),('airfall-low','midfall',10,0,45),('impact','floor',0,0,4),('bounce','floor',-2,0,-10)]:
        frame=full(source);t=cv2.getRotationMatrix2D((1024,1300),angle,1);t[:,2]+=[dx,dy]
        export(who,0,name,Image.fromarray(cv2.warpAffine(np.array(frame),t,(2048,2048),flags=cv2.INTER_CUBIC)),data)
    data['clips']['tumble']={'frames':['release','recoil','fall-start','midfall','airfall','airfall-low','floor','impact','bounce','floor'],'durations':[100,80,70,70,65,65,80,60,90,700]}
    print(who,'whole-drawing tumble registration',flush=True)

if __name__=='__main__':
    for who,data in master['characters'].items():
        repair_set(who,0,data)
        for stage in [1,2,3]:repair_set(who,stage,condition['characters'][who][str(stage)])
        if who in CAL:normalize_falls(who,data)
    master['qualityRevision']='pose-continuity-v1';condition['qualityRevision']='pose-continuity-v1'
    master['resampled']=True
    master['resamplingScope']='24 complete tumble drawings uniformly registered; eye edits retain native pixels and alpha'
    # Keep partially generated crops out of the running preview. Apply complete
    # assets and matching metadata together only after all 64 sets succeed.
    for pending in STAGING.rglob('*.webp'):
        live=PUBLIC/pending.relative_to(STAGING);live.parent.mkdir(parents=True,exist_ok=True);os.replace(pending,live)
    MASTER.write_text(json.dumps(master,indent=2)+'\n');CONDITION.write_text(json.dumps(condition,indent=2)+'\n')
    ts=ROOT/'src/ui/MasterAnimationData.ts';prefix=ts.read_text().split('export const masterAnimations')[0]
    ts.write_text(prefix+'export const masterAnimations: Record<string, MasterAnimationSet> = '+json.dumps(master['characters'],separators=(',',':'))+';\n')
    ts=ROOT/'src/ui/ConditionAnimationData.ts';prefix=ts.read_text().split('export const conditionAnimations')[0]
    lean={who:{stage:{k:v for k,v in data.items() if k!='frameCards'} for stage,data in stages.items()} for who,stages in condition['characters'].items()}
    ts.write_text(prefix+'export const conditionAnimations: Record<string, Record<number, MasterAnimationSet>> = '+json.dumps(lean,separators=(',',':'))+';\n')
    (PUBLIC/'animation-quality-checks.json').write_text(json.dumps(audit,indent=2)+'\n')
    print('Complete:',len(audit),'pixel/scale checks across 64 animation sets')
