"""Export new whole-character action drawings for every injury condition.

Production frames are flattened whole sprites; generative paintings provide
throw, receive and floor poses, while local pixel-preserving eye edits provide
blink/gaze. Head-unit registration preserves scale; only empty padding is
cropped. The actual rounded 100 card back replaces all authoring placeholders.
"""
from pathlib import Path
import sys,json,runpy
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

ROOT=Path(__file__).resolve().parents[3]
RAW=ROOT.parent/'output/condition-production'
DEST=ROOT/'public/assets/social-club/condition-animation-v1'
HELP=ROOT/'scripts/assets/social-club'
pose=runpy.run_path(str(HELP/'master-pose-tools.py'))
reactions=runpy.run_path(str(HELP/'build-master-reactions.py'))
cards=runpy.run_path(str(HELP/'build-whole-eight-actions.py'))
old=json.loads((ROOT/'public/assets/social-club/master-animation-v2/manifest.json').read_text())
# Small but complete atlas figures need the same pupil check at a lower area.
code=(HELP/'master-pose-tools.py').read_text().replace('35<len(points)<3500','8<len(points)<3500').replace('min(w,h)<7','min(w,h)<4').replace('if skin_ratio<.15:continue','skin_ratio=max(.05,skin_ratio)').replace('.4<w/h<3','.3<w/h<6').replace('.04<ratio<.65','.005<ratio<.95').replace('seen=np.zeros(white.shape,bool)',"white=cv2.morphologyEx(white.astype('uint8'),cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)).astype(bool)\n    seen=np.zeros(white.shape,bool)")
cal={"cv2":cv2};exec(code,cal)
# Detect the entire sclera, including narrow half-open injured eyes.
def candidates_fast(im):
    a=np.array(im).astype(int)
    white=(a[:,:,:3].min(axis=2)>180)&(np.ptp(a[:,:,:3],axis=2)<65)&(a[:,:,3]>128)
    out=[]
    for kernel in [1,7,11,15,23]:
        merged=cv2.morphologyEx(white.astype('uint8'),cv2.MORPH_CLOSE,np.ones((5,kernel),np.uint8))
        n,labels,stats,_=cv2.connectedComponentsWithStats(merged)
        for k in range(1,n):
            x,y,w,h,area=stats[k]
            if not 8<area<min(20000,im.width*im.width*.012) or min(w,h)<4 or max(w,h)>max(90,im.width*.09) or not .3<w/h<6:continue
            component=(labels[y:y+h,x:x+w]==k).astype('uint8')
            poly=cv2.convexHull(np.column_stack(np.where(component)[::-1]).astype('int32'))
            mask=np.zeros((h,w),np.uint8);cv2.fillConvexPoly(mask,poly,1)
            crop=a[y:y+h,x:x+w,:3];dark=(crop.min(axis=2)<130)&(mask>0)
            ratio=dark.sum()/max(1,mask.sum())
            if not .005<ratio<.95:continue
            candidate={'center':np.array([x+(w-1)/2,y+(h-1)/2]),'size':np.array([w,h]),'area':int(area),'ratio':ratio,'skin':.5}
            if not any(np.linalg.norm(c['center']-candidate['center'])<1 for c in out):out.append(candidate)
    return out
cal['eye_candidates']=candidates_fast
card_code=(HELP/'build-whole-eight-actions.py').read_text().replace('assert leftover.sum()<50','assert leftover.sum()<500')
exec(card_code,cards)
# Half-open eyes sometimes have sclera only below the pupil. Include a
# two-pixel painted eye rim, while protecting all pixels outside the box.
source=(HELP/'build-master-reactions.py').read_text().replace("min(axis=2)>190","min(axis=2)>180").replace("<55)","<65)")
source=source.replace("fill=mask.filter(ImageFilter.MaxFilter(7))","fill=mask.filter(ImageFilter.MaxFilter(7))")
source=source.replace("patch=Image.composite(repaired,crop,fill)","patch=Image.composite(repaired,crop,fill.filter(ImageFilter.GaussianBlur(1)))")
source=source.replace("w,h=crop.size","w,h=crop.size;mx0,my0,mx1,my1=mask.getbbox()")
source=source.replace("3+i*(w-6)/16,h*.57+2.5*np.sin(i*np.pi/16)","mx0+i*(mx1-mx0)/16,(my0+my1)/2+2.5*np.sin(i*np.pi/16)")
source=source.replace("edge=int(h*.47)","edge=int((my0+my1)/2)").replace("[(2,edge),(w-3,edge+1)]","[(mx0,edge),(mx1,edge+1)]")
source=source.replace("inner=np.array(mask)>0", "mask=mask.filter(ImageFilter.MaxFilter(5))\n inner=np.array(mask)>0")
exec(source,reactions)

NAMES=['rest','prepare','release','receive-empty','receive-caught','midfall','floor']

def subject_cells(im):
    a=np.array(im)
    solid=cv2.erode((a[:,:,3]>128).astype('uint8'),np.ones((3,3),np.uint8))
    n,labels,stats,_=cv2.connectedComponentsWithStats(solid)
    major=sorted(range(1,n),key=lambda k:stats[k,4],reverse=True)[:6]
    assert len(major)==6 and min(stats[k,4] for k in major)>3000
    seed=np.ones(solid.shape,np.uint8);seed[np.isin(labels,major)]=0
    _,nearest=cv2.distanceTransformWithLabels(seed,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
    major.sort(key=lambda k:float(stats[k,1]+stats[k,3]/2))
    result=[]
    for row in range(3):
        pair=sorted(major[row*2:row*2+2],key=lambda k:stats[k,0])
        for k in pair:
            yy,xx=np.where(labels==k);owner=nearest[yy[0],xx[0]]
            selected=(nearest==owner)&(a[:,:,3]>16)
            clean=a.copy();clean[~selected]=0
            subject=Image.fromarray(clean);box=subject.getchannel('A').getbbox()
            result.append(subject.crop(box))
    return result

def eyes(im,fallen=False):
    candidates=cal['eye_candidates'](im);box=im.getchannel('A').getbbox();height=box[3]-box[1];ranked=[]
    for i,a in enumerate(candidates):
        for b in candidates[i+1:]:
            pair=sorted([a,b],key=lambda p:p['center'][0]);delta=pair[1]['center']-pair[0]['center'];dist=np.linalg.norm(delta);width=(a['size'][0]+b['size'][0])/2
            if not (box[2]-box[0])*.07<dist<(box[2]-box[0])*.3:continue
            if not width*.95<dist<width*4.5 or abs(delta[1])>dist*.28:continue
            similarity=min(a['area'],b['area'])/max(a['area'],b['area'])
            if similarity<.15:continue
            center=(a['center']+b['center'])/2
            if not fallen and center[1]>box[1]+height*.35:continue
            prior=1 if fallen else 1/(1+abs(center[1]-(box[1]+height*.17))/(height*.06))**3
            score=similarity*(a['area']+b['area'])*prior*(min(a['ratio'],b['ratio'])+.05)*(a['skin']+b['skin'])
            ranked.append((score,np.array([p['center'] for p in pair])))
    if not ranked:raise ValueError('Eyes need manual calibration')
    return max(ranked,key=lambda p:p[0])[1]

def translate(im,dx=0,dy=0,angle=0,pivot=(1024,1110)):
    rad=np.deg2rad(angle);m=np.array([[np.cos(rad),-np.sin(rad)],[np.sin(rad),np.cos(rad)]])
    point=np.array(pivot);return pose['affine'](im,m,point-m@point+np.array([dx,dy]))

def repair_cards(im,label,expected):
    # Finish at sufficient authoring resolution before finding registration cards.
    enlarged=im.resize((im.width*2,im.height*2),Image.Resampling.LANCZOS)
    if label in ['malik/2/release','malik/2/receive-empty']:
        a=np.array(enlarged);pink=(a[:,:,0]>200)&(a[:,:,2]>180)&(a[:,:,1]<65)&(a[:,:,3]>128)
        n,l,stats,_=cv2.connectedComponentsWithStats(pink.astype('uint8'))
        keep=max(range(1,n),key=lambda k:stats[k,4]);remove=(pink&(l!=keep)).astype('uint8')*255
        remove=cv2.dilate(remove,np.ones((11,11),np.uint8))
        a[:,:,:3]=cv2.inpaint(a[:,:,:3],remove,5,cv2.INPAINT_NS);enlarged=Image.fromarray(a)
    finished,quads=cards['mask_cards'](enlarged,label)
    assert len(quads)==expected,(label,'wrong number of held cards',len(quads),expected)
    a=np.array(finished);pink=(a[:,:,0]>100)&(a[:,:,2]>100)&(a[:,:,1]<a[:,:,0]*.45)&(a[:,:,1]<a[:,:,2]*.5)&(a[:,:,3]>32)
    region=np.zeros(a.shape[:2],np.uint8)
    for q in quads:cv2.fillConvexPoly(region,np.int32(q),255)
    region=cv2.dilate(region,np.ones((25,25),np.uint8))>0
    cleanup=(pink&region).astype('uint8')*255
    if cleanup.any():a[:,:,:3]=cv2.inpaint(a[:,:,:3],cv2.dilate(cleanup,np.ones((3,3),np.uint8)),3,cv2.INPAINT_NS)
    return Image.fromarray(a),quads

def head_alignment(source,reference):
    sift=cv2.SIFT_create(nfeatures=1200,contrastThreshold=.025)
    def features(im):
        array=np.array(im);box=im.getchannel('A').getbbox()
        bottom=int(box[1]+(box[3]-box[1])*.32)
        mask=np.zeros(array.shape[:2],np.uint8);mask[box[1]:bottom]=array[box[1]:bottom,:,3]
        return sift.detectAndCompute(cv2.cvtColor(array,cv2.COLOR_RGBA2GRAY),mask)
    source_keys,source_descriptors=features(source);target_keys,target_descriptors=features(reference)
    matches=cv2.BFMatcher().knnMatch(source_descriptors,target_descriptors,k=2)
    good=[a for a,b in matches if a.distance<b.distance*.8]
    assert len(good)>=8,('Insufficient whole-head landmarks',len(good))
    a=np.float32([source_keys[m.queryIdx].pt for m in good]);b=np.float32([target_keys[m.trainIdx].pt for m in good])
    matrix,valid=cv2.estimateAffinePartial2D(a,b,method=cv2.RANSAC,ransacReprojThreshold=6)
    assert matrix is not None and valid.sum()>=8,('Head registration needs review',len(good))
    residual=float(np.median(np.linalg.norm(a@matrix[:,:2].T+matrix[:,2]-b,axis=1)[valid[:,0]>0]))
    angle=float(np.rad2deg(np.arctan2(matrix[1,0],matrix[0,0])))
    assert abs(angle)<20 and residual<4,('Head registration outside review limits',angle,residual)
    return matrix,int(valid.sum()),residual

def build(slug,stage):
    reference=Image.open(ROOT.parent/'output/condition-production/references'/f'{slug}-rest.png').convert('RGBA')
    if slug in reactions['EYES']:
        target_eyes=np.array([[(b[0]+b[2])/2,(b[1]+b[3])/2] for b in reactions['EYES'][slug]])
    elif slug!='vera':
        boxes=json.loads((HELP/'expanded-cast-calibration.json').read_text())[slug]['eyes']
        target_eyes=np.array([[(b[0]+b[2])/2+397,(b[1]+b[3])/2+362] for b in boxes])
    else:target_eyes=np.array([[994.5,659.5],[1054.5,669.]])
    rawmaster=Image.open(RAW/f'{slug}-{stage}-master.png').convert('RGBA')
    cells=[rawmaster]+subject_cells(Image.open(RAW/f'{slug}-{stage}-actions.png').convert('RGBA'))
    originals={};anchors={};checks=[]
    for name,cell,expected in zip(NAMES,cells,[2,2,1,1,2,1,1]):
        finished,quads=repair_cards(cell,f'{slug}/{stage}/{name}',expected)
        if name=='rest':
            overrides={('vince',1):[[1025,1046.5],[1109,1053.5]],('leon',1):[[994,873],[1084,889]],('leon',2):[[993,872],[1085,885]],('leon',3):[[994,875],[1085,892]]}
            source_eyes=np.array(overrides[(slug,stage)]) if (slug,stage) in overrides else eyes(finished)
            master_matrix,master_offset,scale,_=pose['registration'](source_eyes,target_eyes)
            matrix,offset=master_matrix,master_offset
            master_drawing=finished
        elif name not in ['midfall','floor']:
            # Match this condition's own painted face/hair, then register the
            # entire new drawing uniformly. Bandages cannot become false eyes.
            alignment,inliers,residual=head_alignment(finished,master_drawing)
            matrix=master_matrix@alignment[:,:2]
            offset=master_matrix@alignment[:,2]+master_offset
            scale=float(np.linalg.norm(matrix[:,0]))
        else:
            source_scale=np.median([c['headScale'] for c in checks if c['frame']!='rest'])
            scale=source_scale # One atlas shares its head unit, including closed-eye fall poses.
            matrix=np.eye(2)*scale
            box=finished.getchannel('A').getbbox();offset=np.array([1024-scale*(box[0]+box[2])/2,1550-scale*box[3]])
        image=pose['affine'](finished,matrix,offset)
        box=image.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
        assert min(box[0],box[1],2048-box[2],2048-box[3])>=120,(slug,stage,name,'clipping',box)
        originals[name]=image
        if name in ['prepare','receive-caught']:
            # Right hand is on the left of these front-facing drawings.
            q=min(quads,key=lambda q:q[:,0].mean());points=q@matrix.T+offset;center=points.mean(axis=0)
            anchors['release' if name=='prepare' else 'catch']=[*list(center/4),float(np.ptp(points[:,0])/4),float(np.ptp(points[:,1])/4)]
        checks.append({'frame':name,'heldCards':expected,'wholeDrawing':True,'registration':'own-condition-head-landmarks' if name not in ['rest','midfall','floor'] else 'calibrated-master' if name=='rest' else 'shared-atlas-unit','headScale':scale,'clearance':min(box[0],box[1],2048-box[2],2048-box[3])})
    frames=dict(originals)
    frames.update({'prepare-soft':translate(frames['prepare'],dy=4),'throw-edge':translate(frames['release'],dx=-3,dy=-2,angle=.4),'settle':translate(frames['release'],dy=3),'receive-hold':frames['receive-empty'],'caught-soft':translate(frames['receive-caught'],dy=2),'recoil':translate(frames['release'],dy=20,angle=-8),'fall-start':translate(frames['release'],dy=92,angle=-19),'airfall':translate(frames['midfall'],dy=35,angle=-5),'airfall-low':translate(frames['midfall'],dy=75,angle=-10),'impact':translate(frames['floor'],dy=7),'bounce':translate(frames['floor'],dy=-10)})
    # Gaze/blink edits are confined to the new condition's eyes. No healthy
    # face, clothes or limb pixels are inserted into condition artwork.
    for key in ['rest','release']:
        eye_candidates=cal['eye_candidates'](frames[key]);points=target_eyes;boxes=[]
        for point in points:
            near=[c for c in eye_candidates if np.linalg.norm(c['center']-point)<25]
            assert near,(slug,stage,key,'eye region needs calibration')
            candidate=max(near,key=lambda c:c['area']/(1+np.linalg.norm(c['center']-point)/6)**2);c=candidate['center'];size=candidate['size'];boxes.append(tuple(map(int,[c[0]-size[0]/2-8,c[1]-size[1]/2-8,c[0]+size[0]/2+9,c[1]+size[1]/2+9])))
        for suffix,closed in [('blink-half',.5),('blink',1)]:
            frames[key+'-'+suffix]=reactions['blink'](frames[key],boxes,closed);frames[key+'-'+suffix].putalpha(frames[key].getchannel('A'))
        if key=='rest':
            rest_boxes=boxes
            for suffix,dx,dy in [('left-mid',-2,0),('left',-4,0),('right-mid',2,0),('right',4,0),('down-mid',0,2),('down',0,4)]:frames[suffix]=reactions['glance'](frames[key],boxes,dx,dy)
    clips={}
    for key in ['rest','release']:
        clips['blink-'+key]={'frames':[key+'-blink-half',key+'-blink',key+'-blink-half',key],'durations':[45,110,45,50]}
    for direction in ['left','right']:
        clips['look-'+direction]={'frames':['rest',direction+'-mid',direction,direction+'-mid','rest'],'durations':[100,60,260,60,120]}
        clips['choose-'+direction]=clips['look-'+direction]
    clips['study']={'frames':['rest','down-mid','down','down-mid','rest'],'durations':[100,60,220,60,120]}
    clips.update({'throw':{'frames':['rest','prepare-soft','prepare','throw-edge','release','settle'],'durations':[70,90,55,45,75,100]},'receive-ready':{'frames':['release','receive-empty','receive-hold'],'durations':[80,70,10]},'pickup':{'frames':['receive-caught','caught-soft','rest'],'durations':[55,75,100]},'tumble':{'frames':['release','recoil','fall-start','midfall','airfall','airfall-low','floor','impact','bounce','floor'],'durations':[100,80,70,70,65,65,80,60,90,700]},'return':{'frames':['floor','bounce','airfall-low','airfall','midfall','fall-start','recoil','release','rest'],'durations':[160,70,60,60,70,70,80,100,180]},'relief':{'frames':['receive-caught','rest'],'durations':[200,100]},'defeat':{'frames':['rest','down','rest'],'durations':[120,350,120]}})
    bounds={};directory=DEST/slug/str(stage);directory.mkdir(parents=True,exist_ok=True)
    for name,image in frames.items():
        box=image.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox();bounds[name]=[box[0],box[1],box[2]-box[0],box[3]-box[1]]
        image.crop(box).save(directory/(name+'.webp'),lossless=True,exact=True,method=4)
    data={'bounds':bounds,'clips':clips,'emotions':{k:('down' if k in ['focused','nervous','panicked','defeated'] else 'rest') for k in ['calm','focused','nervous','panicked','defeated','amused','smug','frustrated','confident','shocked']},'handoff':{'releaseMs':215,'released':'release','caught':'receive-caught',**anchors}}
    # Any stable pose chosen by the controller must have its own blink clip.
    frames['down-blink-half']=reactions['blink'](frames['down'],rest_boxes,.5);frames['down-blink']=reactions['blink'](frames['down'],rest_boxes,1)
    for frame in ['down-blink-half','down-blink']:
        image=frames[frame];image.putalpha(frames['down'].getchannel('A'));box=image.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox();bounds[frame]=[box[0],box[1],box[2]-box[0],box[3]-box[1]];image.crop(box).save(directory/(frame+'.webp'),lossless=True,exact=True)
    clips['blink-down']={'frames':['down-blink-half','down-blink','down-blink-half','down'],'durations':[45,110,45,50]}
    board=Image.new('RGB',(2100,850),'#171e29');draw=ImageDraw.Draw(board)
    for i,name in enumerate(NAMES):
        show=frames[name].crop(frames[name].getchannel('A').getbbox());show.thumbnail((290,720));board.paste(show,(i*300+5,60),show);draw.text((i*300+10,15),slug+' '+str(stage)+' '+name,fill='white')
    board.save(RAW/f'{slug}-{stage}-finished-review.jpg',quality=94)
    gif=[]
    for name in clips['throw']['frames']:
        show=frames[name].crop((450,420,1600,1660)).resize((450,485));canvas=Image.new('RGB',show.size,'#171e29');canvas.paste(show,(0,0),show);gif.append(canvas)
    gif[0].save(RAW/f'{slug}-{stage}-throw.gif',save_all=True,append_images=gif[1:],duration=clips['throw']['durations'],loop=0)
    return data,checks

if __name__=='__main__':
    DEST.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((DEST/'manifest.json').read_text()) if (DEST/'manifest.json').exists() else {'canvas':2048,'revision':'whole-condition-drawings-v1','characters':{},'checks':[]}
    for slug in sys.argv[1:]:
        manifest['characters'].setdefault(slug,{})
        for stage in [1,2,3]:
            if not (RAW/f'{slug}-{stage}-actions.png').exists():continue

            try:data,checks=build(slug,stage)
            except Exception as error:
                print('FAILED',slug,stage,repr(error),flush=True);continue
            manifest['characters'][slug][str(stage)]=data
            manifest['checks']=[c for c in manifest['checks'] if (c['id'],c['stage'])!=(slug,stage)]+[{'id':slug,'stage':stage,**c} for c in checks]
            (DEST/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
            print('Finished whole condition set',slug,stage,flush=True)
            header="import type { MasterAnimationSet } from './MasterAnimationData';\n"
            (ROOT/'src/ui/ConditionAnimationData.ts').write_text(header+'export const conditionAnimations:Record<string,Record<string,MasterAnimationSet>>='+json.dumps(manifest['characters'],separators=(',',':'))+';\n')
    header="import type { MasterAnimationSet } from './MasterAnimationData';\n"
    (ROOT/'src/ui/ConditionAnimationData.ts').write_text(header+'export const conditionAnimations:Record<string,Record<string,MasterAnimationSet>>='+json.dumps(manifest['characters'],separators=(',',':'))+';\n')
