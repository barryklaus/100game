"""Replace old card drawings only; preserve original faces, poses and hands.

The approved original back is perspective mapped and rounded at width*.055.
Complete native frames remain complete images in the game. Reruns use the
saved authoring originals, never an already composited output.
"""
from pathlib import Path
import json, sys
sys.path.insert(0, '/tmp/100next-motion-tools')
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT/'public/assets/social-club/master-animation-v2'
ORIGINALS = ROOT.parent/'output/master-card-back-originals'
PROOF = ROOT.parent/'output/master-card-back-repair'
PROOF.mkdir(parents=True, exist_ok=True)
manifest = json.loads((DEST/'manifest.json').read_text())
maps = json.loads(Path(__file__).with_name('master-card-back-quads.json').read_text())
back = Image.open(ROOT/'public/assets/cards/full/back.png').convert('RGBA')
mask = Image.new('L', back.size)
ImageDraw.Draw(mask).rounded_rectangle((0,0,back.width-1,back.height-1), radius=back.width*.055, fill=255)
back.putalpha(mask)
back = np.array(back.resize((256,356), Image.Resampling.LANCZOS)).astype('float32')/255
back[:,:,:3] *= back[:,:,3:4]
source = np.float32([[0,0],[255,0],[255,355],[0,355]])
audit = []

def quads(slug, family):
    result=[]
    for edge in maps[slug][family]:
        a,b=np.array(edge,float)
        v=b-a;down=np.array([-v[1],v[0]])*1.39
        result.append(np.array([a,b,b+down,a+down]))
    return result

def pose_mapping(name):
    # These are the exact translations/rotations used by the original authoring.
    family='rest';degrees=0;shift=np.array([0,0]);pivot=np.array([0,0])
    if name.startswith('prepare') or name in ['throw-edge','empty-grip','empty-release']:
        family='prepare'
        if name=='prepare-soft':shift=np.array([0,5])
        if name in ['throw-edge','empty-release']:degrees=-1.5;shift=np.array([5,-3]);pivot=np.array([1130,1020])
    elif name.startswith('release') or name in ['settle','reach','tumble-start','recoil','fall-start']:
        family='release'
        if name=='settle':shift=np.array([0,3])
        if name=='reach':shift=np.array([5,4])
        if name=='recoil':degrees=-8;shift=np.array([0,20]);pivot=np.array([1024,1110])
        if name=='fall-start':degrees=-19;shift=np.array([0,92]);pivot=np.array([1024,1110])
    elif name in ['midfall','airfall','airfall-low']:
        family='midfall'
        if name=='airfall':degrees=-12;shift=np.array([0,120]);pivot=np.array([1024,1180])
        if name=='airfall-low':degrees=-24;shift=np.array([0,210]);pivot=np.array([1024,1180])
    elif name in ['floor','impact','bounce']:
        family='floor';shift=np.array([0,7 if name=='impact' else -10 if name=='bounce' else 0])
    theta=np.deg2rad(degrees);matrix=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
    return family,matrix,pivot-matrix@pivot+shift

def repair(full, qs):
    points=np.concatenate(qs);lo=np.maximum(0,np.floor(points.min(axis=0)).astype(int)-15);hi=np.minimum(2048,np.ceil(points.max(axis=0)).astype(int)+16)
    box=(*lo,*hi);original=np.array(full.crop(box));r,g,b=original[:,:,:3].transpose(2,0,1).astype(float)
    old_gold=(r>120)&(g>70)&(r>g*1.01)&(b<g*.25)&(original[:,:,3]>128)
    skin=(((r>75)&(r>g*1.055)&(g>b*1.025)&(b>g*.45))|((r>100)&(r>g*1.7)&(g>b*1.025)&(b>g*.2))|((r>150)&(g<70)&(b<110)))&(original[:,:,3]>128)&~old_gold
    skin=skin.astype('uint8')
    skin=cv2.morphologyEx(skin,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    _,labels,stats,_=cv2.connectedComponentsWithStats(skin)
    skin=np.isin(labels,np.flatnonzero(stats[:,cv2.CC_STAT_AREA]>450)).astype('uint8');skin[labels==0]=0
    contours,_=cv2.findContours(skin,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(skin,contours,-1,1,cv2.FILLED)
    fingers=(skin>0)|((cv2.dilate(skin,np.ones((7,7),np.uint8))>0)&(original[:,:,:3].max(axis=2)<95))
    cleanup=np.zeros(original.shape[:2],np.uint8)
    for q in qs:
        q=q-lo;cover=np.zeros_like(cleanup);cv2.fillConvexPoly(cover,np.int32(q),255)
        search=cv2.dilate(cover,np.ones((31,31),np.uint8))>0
        # Include the entire old perimeter, even where the drawing is not
        # a mathematically exact rectangle. No old gold underlay may survive.
        cleanup=np.maximum(cleanup,cv2.dilate(cover,np.ones((5,5),np.uint8)))
        cleanup=np.maximum(cleanup,cv2.dilate((search&old_gold).astype('uint8')*255,np.ones((5,5),np.uint8)))
    cleanup[fingers]=0
    result=original.copy();result[:,:,:3]=cv2.inpaint(original[:,:,:3],cleanup,3,cv2.INPAINT_NS)
    result[:,:,3]=cv2.inpaint(original[:,:,3],cleanup,3,cv2.INPAINT_NS)
    edited=Image.fromarray(result);changed=cleanup>0
    for q in qs:
        transform=cv2.getPerspectiveTransform(source,np.float32((q-lo)*4))
        tile=np.clip(cv2.warpPerspective(back,transform,(edited.width*4,edited.height*4),flags=cv2.INTER_CUBIC),0,1)
        alpha=tile[:,:,3:4];tile[:,:,:3]=np.divide(tile[:,:,:3],alpha,out=np.zeros_like(tile[:,:,:3]),where=alpha>1e-6)
        layer=Image.fromarray(np.uint8(tile*255)).resize(edited.size,Image.Resampling.LANCZOS)
        changed|=np.array(layer.getchannel('A'))>0
        edited=Image.alpha_composite(edited,layer)
    result=np.array(edited);result[fingers]=original[fingers]
    assert np.array_equal(result[~changed],original[~changed])
    full=full.copy();full.paste(Image.fromarray(result),tuple(lo))
    return full

contacts={}
for slug,record in manifest['characters'].items():
    original_folder=ORIGINALS/slug;original_folder.mkdir(parents=True,exist_ok=True)
    for name,bounds in record['bounds'].items():
        if name.startswith('whole-'):continue
        file=DEST/slug/(name+'.webp');saved=original_folder/(name+'.webp')
        if not saved.exists():saved.write_bytes(file.read_bytes())
        x,y,w,h=bounds;full=Image.new('RGBA',(2048,2048));full.paste(Image.open(saved).convert('RGBA'),(x,y))
        family,matrix,offset=pose_mapping(name);qs=[q@matrix.T+offset for q in quads(slug,family)]
        if name in ['empty-grip','empty-release']:qs=qs[:1]
        result=repair(full,qs);crop=result.crop((x,y,x+w,y+h))
        crop.save(file,lossless=True,exact=True,method=4)
        assert np.array_equal(np.array(crop),np.array(Image.open(file))), (slug,name)
        audit.append({'character':slug,'frame':name,'cardsReplaced':len(qs),'cornerRadiusRatio':.055,'facesAndBodyOutsideCardsUnchanged':True,'handsPreserved':True,'nativeResolution':True})
        if name in ['rest','release','midfall','floor']:contacts[(slug,name)]=result
    print(slug,'updated card backs',flush=True)
board=Image.new('RGB',(1600,8*320),'#18212e');draw=ImageDraw.Draw(board)
for row,slug in enumerate(manifest['characters']):
    for col,name in enumerate(['rest','release','midfall','floor']):
        im=contacts[(slug,name)];qs=quads(slug,'release' if name=='release' else name);pts=np.concatenate(qs)
        box=(int(pts[:,0].min()-30),int(pts[:,1].min()-30),int(pts[:,0].max()+30),int(pts[:,1].max()+50))
        cr=im.crop(box);cr.thumbnail((380,280));board.paste(cr,(col*400+10,row*320+30),cr)
        draw.text((col*400+10,row*320+6),slug+' / '+name,fill='#eacb8a')
board.save(PROOF/'card-backs-contact.jpg')
(DEST/'card-back-checks.json').write_text(json.dumps(audit,indent=2)+'\n')
manifest['cardBackRevision']='actual-rounded-back-v1'
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Repaired',len(audit),'native poses')
