"""Author Vera's complete frames. Generated poses are references registered to
one master scale. Runtime uses flattened drawings, never separate body parts.
Local face edits and card-back composites follow the owner's approved workflow.
"""
from pathlib import Path
import json,sys,runpy,shutil
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-vera-animation-v1'
MASTER=ROOT.parent/'output/100next-new-eight-masters-v1/masters/vera-master.png'
DEST=ROOT/'public/assets/social-club/master-animation-v2/vera'
REVIEW=ROOT/'public/vera-animation/assets'
for d in (DEST,REVIEW,OUT/'frames',OUT/'sources',OUT/'sheets'):d.mkdir(parents=True,exist_ok=True)
master=Image.open(MASTER).convert('RGBA'); base=np.array(master)
W=1254;OFFSET=(397,362)
back=Image.open(ROOT/'public/assets/cards/back.webp').convert('RGBA').resize((320,448),Image.Resampling.LANCZOS)
rounded=Image.new('L',back.size);ImageDraw.Draw(rounded).rounded_rectangle((0,0,319,447),radius=18,fill=255)
back.putalpha(rounded);BACK=np.array(back)
cardAudit=[];registration=[];quadsByFrame={}
helpers=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))
boxes=[(580,288,615,307),(638,297,677,317)]
def register(donor,key):
    a=np.array(donor)
    sift=cv2.SIFT_create()
    mask=np.zeros((W,W),np.uint8);mask[105:270,480:770]=255
    km,dm=sift.detectAndCompute(cv2.cvtColor(base,cv2.COLOR_RGBA2GRAY),mask)
    kd,dd=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGBA2GRAY),None)
    pairs=cv2.BFMatcher().knnMatch(dd,dm,k=2)
    matches=[m for m,n in pairs if m.distance<n.distance*.76]
    if len(matches)<5:raise ValueError((key,'head registration insufficient',len(matches)))
    transform,inliers=cv2.estimateAffinePartial2D(np.float32([kd[m.queryIdx].pt for m in matches]),np.float32([km[m.trainIdx].pt for m in matches]),method=cv2.RANSAC,ransacReprojThreshold=3)
    scale=float(np.hypot(transform[0,0],transform[1,0])); angle=float(np.degrees(np.arctan2(transform[1,0],transform[0,0])))
    if not .72<scale<1.25 or abs(angle)>8:raise ValueError((key,'registration outside expected upright range',scale,angle))
    registration.append({'frame':key,'headScaleCorrection':scale,'rotationDegrees':angle,'matches':len(matches),'inliers':int(inliers.sum())})
    a=cv2.warpAffine(a,transform,(W,W),flags=cv2.INTER_CUBIC)
    return Image.fromarray(a)
def face(donor,key):
    aligned=register(donor,key)
    mask=Image.new('L',master.size);d=ImageDraw.Draw(mask)
    # Full eye contours; never clip lashes into the middle of an eyeball.
    d.polygon([(554,258),(615,269),(619,316),(572,321),(548,292)],fill=255)
    d.polygon([(628,269),(691,267),(701,301),(667,331),(623,327)],fill=255)
    if key!='blink':
        d.polygon([(573,328),(675,338),(673,371),(609,379),(565,356)],fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(2))
    result=Image.composite(aligned,master,mask)
    result.putalpha(master.getchannel('A'))
    protected=np.array(mask)==0
    assert np.array_equal(np.array(result)[protected],base[protected]),key
    return result
def cards(im,key):
    a=np.array(im);r,g,b=[a[:,:,i].astype('int16') for i in range(3)]
    if key=='rest' or key in ('left','left-mid','right','right-mid','down','down-mid','blink','nervous','shocked','delighted','confident'):
        yy,xx=np.indices(a.shape[:2])
        sel=(b-r>17)&(b-r<60)&(g-r>5)&(g-r<34)&(r>85)&(r<175)&(a[:,:,3]>200)&(xx>450)&(xx<810)&(yy>440)&(yy<660)
    else: sel=(r>175)&(b>175)&(g<95)&(a[:,:,3]>100)
    n,labels,stats,_=cv2.connectedComponentsWithStats(sel.astype('uint8'))
    ids=[i for i in range(1,n) if stats[i,4]>450]
    if not ids:raise ValueError((key,'no registration card'))
    qs=[];covered=np.zeros(a.shape[:2],np.uint8)
    for i in ids:
        region=labels==i
        # Attach small disconnected visible corners split off by fingers.
        cx,cy=stats[i,:2]+stats[i,2:4]/2
        for j in range(1,n):
            jx,jy=stats[j,:2]+stats[j,2:4]/2
            if 15<stats[j,4]<=450 and np.hypot(jx-cx,jy-cy)<max(stats[i,2:4])*1.05:region|=labels==j
        ys,xs=np.where(region)
        q=cv2.boxPoints(cv2.minAreaRect(np.float32(np.column_stack((xs,ys)))))
        top=q[np.argsort(q[:,1])[:2]];bottom=q[np.argsort(q[:,1])[2:]]
        q=np.concatenate([top[np.argsort(top[:,0])],bottom[np.argsort(-bottom[:,0])]])
        qs.append(q);covered[region]=255
    qs.sort(key=lambda q:q[:,0].mean())
    result=im.copy()
    visible=cv2.dilate(covered,np.ones((3,3),np.uint8))
    skin=(r>80)&(r>g*1.17)&(g>b*1.13)&(b>g*.3)&(a[:,:,3]>100)
    # Keep the actual fingers and their dark outline in front.
    nearby=cv2.dilate(skin.astype('uint8'),np.ones((3,3),np.uint8))>0
    fingers=skin|(nearby&(a[:,:,:3].max(2)<100))
    visible[fingers&~sel]=0
    src=np.float32([[0,0],[319,0],[319,447],[0,447]])
    whole=Image.new('RGBA',im.size)
    for q in qs:
        q=(q-q.mean(0))*1.035+q.mean(0)
        mat=cv2.getPerspectiveTransform(src,np.float32(q))
        tile=cv2.warpPerspective(BACK,mat,im.size,flags=cv2.INTER_CUBIC)
        tile[:,:,3]=np.minimum(tile[:,:,3],visible)
        whole.alpha_composite(Image.fromarray(tile))
    result.alpha_composite(whole)
    arr=np.array(result)
    left=(arr[:,:,0]>190)&(arr[:,:,2]>170)&(arr[:,:,1]<85)&(arr[:,:,3]>100)
    # Registration pixels can be outside a rounded corner by 1 pixel. Replace
    # these locally, preserving full alpha and all hands.
    if left.any():
        mask=cv2.dilate(left.astype('uint8')*255,np.ones((3,3),np.uint8))
        arr[:,:,:3]=cv2.inpaint(arr[:,:,:3],mask,2,cv2.INPAINT_NS)
    arr[fingers&~sel]=a[fingers&~sel]
    assert np.array_equal(arr[fingers&~sel],a[fingers&~sel]),key
    quadsByFrame[key]=[(q+np.array(OFFSET)).tolist() for q in qs]
    remaining=(arr[:,:,0]>190)&(arr[:,:,2]>170)&(arr[:,:,1]<85)&(arr[:,:,3]>100)
    cardAudit.append({'frame':key,'cardCount':len(qs),'roundedRadiusRatio':.055,'fingersPreserved':True,'placeholderPixelsRemaining':int(remaining.sum())})
    return Image.fromarray(arr)
def pad(im):
    canvas=Image.new('RGBA',(2048,2048));canvas.alpha_composite(im,OFFSET);return canvas
raw=json.loads((OUT/'generation-results.json').read_text())
native={'rest':master}
for row in raw:
    donor=Image.open(row['source']).convert('RGBA');shutil.copy2(row['source'],OUT/'sources'/(row['id']+'.png'))
    if row['type']=='emotion':native[row['id']]=face(donor,row['id'])
    elif row['type']=='action':native[row['id']]=register(donor,row['id'])
    else:native[row['id']]=donor
for side,dx,dy in [('left',-6,0),('right',6,0),('down',0,4)]:
    native[side]=helpers['glance'](master,boxes,dx,dy)
    native[side+'-mid']=helpers['glance'](master,boxes,round(dx/2),round(dy/2))
frames={key:pad(cards(im,key)) for key,im in native.items()}
clips={
'blink':{'frames':['rest','blink','rest'],'durations':[40,100,60]},
'look-left':{'frames':['rest','left-mid','left','left-mid','rest'],'durations':[60,60,240,60,80]},
'look-right':{'frames':['rest','right-mid','right','right-mid','rest'],'durations':[60,60,240,60,80]},
'study':{'frames':['rest','down-mid','down','down-mid','rest'],'durations':[60,60,220,60,80]},
'danger':{'frames':['nervous','shocked','nervous'],'durations':[100,180,100]},
'startle':{'frames':['rest','shocked'],'durations':[60,240]},
'celebrate':{'frames':['confident','delighted','confident','rest'],'durations':[80,240,100,80]},
'defeat':{'frames':['rest','nervous'],'durations':[80,300]},
'throw':{'frames':['rest','prepare','throw-release','release'],'durations':[60,140,100,120]},
'receive-ready':{'frames':['follow','grip'],'durations':[80,80]},
'pickup':{'frames':['caught','rest'],'durations':[120,100]},
'tumble':{'frames':['release','fall-start','midfall','floor'],'durations':[70,110,140,260]},
'return':{'frames':['floor','rest'],'durations':[200,200]},
}
clips['idle']=clips['blink']
clips['choose-left']=clips['look-left'];clips['choose-right']=clips['look-right']
for key in ['rest','nervous','shocked','delighted','confident','left','right','down','follow']:
    # Closed eyes are local master artwork for rest/reactions. One-card follow
    # uses its matching registered head area, never a two-card rest drawing.
    im=native[key].copy()
    closed=native['blink']
    mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
    d.polygon([(554,274),(618,282),(619,316),(566,320),(548,290)],fill=255)
    d.polygon([(627,286),(696,280),(701,311),(669,330),(623,327)],fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(2))
    im=Image.composite(closed,im,mask);im.putalpha(native[key].getchannel('A'))
    frame=key+'-blink';frames[frame]=pad(cards(im,key))
    clips['blink-'+key]={'frames':[key,frame,key],'durations':[40,100,60]}
# The rest controller requests release for a one-card hand.
frames['throw-release']=frames['release'];frames['release']=frames['follow']
clips['blink-release']={'frames':['release','follow-blink','release'],'durations':[40,100,60]}
bounds={};checks=[]
for key,im in frames.items():
    im.save(OUT/'frames'/(key+'.png'))
    box=im.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox()
    # Strip truly empty pixels only; never discard antialias pixels.
    cropbox=im.getchannel('A').getbbox();crop=im.crop(cropbox)
    crop.save(DEST/(key+'.webp'),lossless=True,exact=True,method=6)
    assert np.array_equal(np.array(crop),np.array(Image.open(DEST/(key+'.webp')).convert('RGBA'))),key
    x,y,r,b=cropbox;bounds[key]=[x,y,r-x,b-y]
    im.save(REVIEW/(key+'.webp'),lossless=True,exact=True,method=6)
    checks.append({'frame':key,'solidBounds':box,'clearance':min(box[0],box[1],2048-box[2],2048-box[3]),'nativePixelsIdentical':True})
working=np.array(quadsByFrame['prepare'][0]).mean(0)
catch=np.array(quadsByFrame['caught'][0]).mean(0)
setdata={'clips':clips,'emotions':{'calm':'rest','focused':'down','confident':'confident','smug':'confident','amused':'delighted','nervous':'nervous','panicked':'shocked','shocked':'shocked','relieved':'delighted','frustrated':'nervous','defeated':'nervous'},'bounds':bounds,'handoff':{'releaseMs':200,'released':'throw-release','caught':'caught','release':[*(working/4).tolist(),20,28],'catch':[*(catch/4).tolist(),20,28]}}
manifestPath=ROOT/'public/assets/social-club/master-animation-v2/manifest.json'
manifest=json.loads(manifestPath.read_text());manifest['characters']['vera']=setdata
manifestPath.write_text(json.dumps(manifest,indent=2)+'\n')
dataPath=ROOT/'src/ui/MasterAnimationData.ts';text=dataPath.read_text();header=text.split('export const masterAnimations:')[0]
dataPath.write_text(header+'export const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(manifest['characters'],separators=(',',':'))+';\n')
review={'character':'Vera','nativeCanvas':2048,'revision':'vera-v1','clips':clips,'handoff':setdata['handoff'],'checks':checks,'registration':registration,'cards':cardAudit}
(REVIEW/'manifest.json').write_text(json.dumps(review,indent=2)+'\n')
(REVIEW/'prompts.json').write_text(json.dumps({'original':json.loads((OUT/'generation-plan.json').read_text()),'corrections':json.loads((OUT/'correction-prompts.json').read_text()),'selectedSources':raw},indent=2)+'\n')
(OUT/'manifest.json').write_text(json.dumps(review,indent=2)+'\n')
# Uniform authoring cells, no independent fitting.
for group,keys in [('reactions',['rest','blink','left','right','nervous','shocked','delighted','confident']),('actions',['rest','prepare','release','follow','grip','caught']),('tumble',['release','fall-start','midfall','floor'])]:
    columns=4;rows=(len(keys)+3)//4
    sheet=Image.new('RGBA',(columns*3072,rows*3072))
    for i,key in enumerate(keys):sheet.alpha_composite(frames[key],(i%4*3072+512,i//4*3072+512))
    sheet.save(OUT/'sheets'/(group+'.png'))
# Master and picker exports.
frames['rest'].save(ROOT/'public/assets/social-club/masters-native-v1/vera-master.webp',lossless=True,exact=True,method=6)
portrait=frames['rest'].crop((870,490,1180,840))
portrait.save(ROOT/'public/assets/social-club/masters-v1/vera-portrait.webp',lossless=True,exact=True,method=6)
# Contact sheet for visual review.
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
keys=['rest','blink','left','right','nervous','shocked','delighted','confident','prepare','release','grip','caught','fall-start','midfall','floor']
board=Image.new('RGB',(1500,((len(keys)+4)//5)*490),'#172334');d=ImageDraw.Draw(board)
for i,key in enumerate(keys):
    thumb=frames[key].crop((600,400,1448,1710)).resize((280,432),Image.Resampling.LANCZOS)
    board.paste(thumb,(i%5*300+10,i//5*490+40),thumb);d.text((i%5*300+12,i//5*490+8),key,font=font,fill='#f7e2b6')
board.save(OUT/'contact.jpg',quality=95,subsampling=0)
print('Exported Vera:',len(frames),'frames;',len(clips),'clips',flush=True)
