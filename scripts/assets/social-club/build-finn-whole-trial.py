"""Assemble complete redrawn Finn poses, with no separated anatomy.

Review assets only. Built-in imagegen supplied six two-pose paintings.
Matched whole-painting size, translation to the planted-foot anchor, and
uniform transparent padding. No head replacement or limb warping.
Authoring dependencies: Pillow, Numpy, opencv-python-headless.
"""
from pathlib import Path
import sys,json
import numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/finn-whole-action-trial'
DEST=ROOT/'public/finn-whole-action-trial/assets'
DEST.mkdir(parents=True,exist_ok=True)
CARD_MAPS=json.loads((Path(__file__).with_name('finn-whole-card-maps.json')).read_text())
CARD_BACK=np.array(Image.open(ROOT/'public/assets/cards/full/back.png').convert('RGBA').resize((256,356),Image.Resampling.LANCZOS))

def actual_card_backs(im,name):
    """Insert the original card artwork, retaining the drawn fingertip occlusion.

    Only the quadrilateral card surfaces change. The full character drawings
    remain intact; cards are baked into the complete exported frames.
    """
    original=np.array(im);result=original.copy()
    r,g,b=original[:,:,:3].transpose(2,0,1).astype(float)
    skin=(r>130)&(r>g*1.28)&(g>b*1.14)&(b>g*.4)&(original[:,:,3]>128)
    # Preserve both finger color and its dark ink outline above the card.
    fingers=cv2.dilate(skin.astype('uint8'),np.ones((5,5),np.uint8))>0
    h,w=CARD_BACK.shape[:2]
    source=np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]])
    for quad in CARD_MAPS[name]:
        # Supersample only this small card surface. Direct warping from a
        # large source to a tiny card aliases its intricate engraving.
        q=np.float32(quad);origin=np.floor(q.min(axis=0)).astype(int)-2
        extent=np.ceil(q.max(axis=0)).astype(int)-origin+3
        transform=cv2.getPerspectiveTransform(source,np.float32((q-origin)*4))
        tile=cv2.warpPerspective(CARD_BACK,transform,tuple((extent*4).tolist()),flags=cv2.INTER_CUBIC)
        tile=Image.fromarray(tile).resize(tuple(extent.tolist()),Image.Resampling.LANCZOS)
        card=np.zeros_like(original)
        card[origin[1]:origin[1]+extent[1],origin[0]:origin[0]+extent[0]]=np.array(tile)
        cover=Image.new('L',im.size)
        ImageDraw.Draw(cover).polygon([tuple(p) for p in quad],fill=255)
        use=(np.array(cover)>0)&~fingers&(original[:,:,3]>128)
        result[use]=card[use]
        result[use,3]=original[use,3]
    assert np.array_equal(result[fingers],original[fingers])
    return Image.fromarray(result)

def pair(name):
    im=actual_card_backs(Image.open(OUT/(name+'.png')).convert('RGBA'),name);a=np.array(im)
    a[a[:,:,3]<32]=0
    _,labels,stats,_=cv2.connectedComponentsWithStats((a[:,:,3]>32).astype('uint8'))
    largest=sorted(range(1,len(stats)),key=lambda i:stats[i,4],reverse=True)[:2]
    largest.sort(key=lambda i:stats[i,0])
    # A hand can extend over the nominal halfway line. Find the actual gap
    # between the two figures instead of cutting a fixed panel boundary.
    left,right=stats[largest[0]],stats[largest[1]]
    assert left[0]+left[2]<right[0],name
    split=round((left[0]+left[2]+right[0])/2)
    return [Image.fromarray(a).crop((0,0,split,im.height)),Image.fromarray(a).crop((split,0,im.width,im.height))]

def feet(im):
    a=np.array(im);ys,xs=np.where(a[:,:,3]>128);lo,hi=ys.min(),ys.max()
    r,g,b=a[:,:,:3].transpose(2,0,1).astype(float);yy=np.indices(r.shape)[0]
    brown=(r>g*1.3)&(g>b*1.2)&(a[:,:,3]>128)&(yy>lo+(hi-lo)*.88)
    _,labels,stats,centers=cv2.connectedComponentsWithStats(brown.astype('uint8'))
    ids=sorted(range(1,len(stats)),key=lambda i:stats[i,4],reverse=True)[:2]
    assert len(ids)==2
    return np.mean(centers[ids],axis=0)

cells={};scales={}
for action in ['throw','receive']:
    for j,letter in enumerate('abc'):
        painting=pair(action+'-'+letter)
        # Each generated pair has a different painted resolution. Register
        # the entire paintings to the same seated physical height. The two
        # matching drawings use one scale; no head/limb fitting or playback
        # zoom is introduced.
        heights=[im.getchannel('A').getbbox()[3]-im.getchannel('A').getbbox()[1] for im in painting]
        size=1024/np.mean(heights)
        for i,im in enumerate(painting):
            name=f'{action}-{j*2+i+1}';cells[name]=im;scales[name]=float(size)
frames={};checks=[];offsets={}
for name,im in cells.items():
    scale=scales[name]
    offset=np.array([1024,1476])-feet(im)*scale;offsets[name]=offset
    full=im.transform((2048,2048),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
    bounds=full.getchannel('A').getbbox()
    clearance=min(bounds[0],bounds[1],2048-bounds[2],2048-bounds[3])
    assert clearance>=400,(name,bounds)
    full.save(DEST/(name+'.webp'),lossless=True,exact=True,method=6)
    full.save(OUT/(name+'.png'));frames[name]=full
    decoded=np.array(Image.open(DEST/(name+'.webp')).convert('RGBA'));original=np.array(full);visible=original[:,:,3]>0
    assert np.array_equal(decoded[visible],original[visible]),name
    checks.append({'frame':name,'wholeCharacterDrawing':True,'scale':scale,'bounds':bounds,'minimumClearance':clearance,'losslessVisiblePixels':True})

def point(frame,p):return (np.array(p)*scales[frame]+offsets[frame]).tolist()
manifest={'status':'Whole-character Finn review trial; game animations unchanged','nativeCanvas':2048,'authoringCell':3072,'cellInset':512,'separateHead':False,'clips':{'throw':{'frames':[f'throw-{i}' for i in range(1,7)],'durations':[70,90,55,45,75,100],'flight':[215,560],'hand':point('throw-3',[680,382]),'pile':[1470,1300]},'receive':{'frames':[f'receive-{i}' for i in range(1,7)],'durations':[80,70,490,55,75,100],'flight':[160,640],'hand':point('receive-4',[1350-pair('receive-b')[0].width,510]),'pile':[680,1300]}},'checks':checks}
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

for action in ['throw','receive']:
    atlas=Image.new('RGBA',(9216,6144))
    for i in range(6):atlas.alpha_composite(frames[f'{action}-{i+1}'],(i%3*3072+512,i//3*3072+512))
    atlas.save(OUT/(action+'-padded-sheet.png'))
contact=Image.new('RGB',(2520,1140),'#14202e')
for row,action in enumerate(['throw','receive']):
    for i in range(6):
        im=frames[f'{action}-{i+1}'].crop((550,380,1550,1610)).resize((390,480),Image.Resampling.LANCZOS)
        contact.paste(im,(i*420+15,row*570+45),im)
        ImageDraw.Draw(contact).text((i*420+15,row*570+15),f'{action} {i+1}',fill='#e8cc86')
contact.save(OUT/'contact.png')

back=Image.open(ROOT/'public/assets/cards/back.webp').convert('RGBA')
def preview(action,table):
    clip=manifest['clips'][action];seq=[];width,height=480,602
    camera=(550,380,1550,1634);s=width/1000
    def xy(x,y):return ((x-camera[0])*s,(y-camera[1])*s)
    def card_at(im,x,y,w,h,angle):
        card=back.resize((max(1,round(w*s)),max(1,round(h*s))),Image.Resampling.LANCZOS).rotate(-angle,Image.Resampling.BICUBIC,expand=True)
        xx,yy=xy(x,y);im.paste(card,(round(xx-card.width/2),round(yy-card.height/2)),card)
    for t in range(0,1600,40):
        index=5;boundary=0
        for i,ms in enumerate(clip['durations']):
            boundary+=ms
            if t<boundary:index=i;break
        im=Image.new('RGB',(width,height),'#15202e')
        pose=frames[clip['frames'][index]].crop(camera).resize((width,height),Image.Resampling.LANCZOS)
        im.paste(pose,(0,0),pose);d=ImageDraw.Draw(im)
        def ellipse(cx,cy,rx,ry,**kwargs):
            a=xy(cx-rx,cy-ry);b=xy(cx+rx,cy+ry);d.ellipse((*a,*b),**kwargs)
        if table:
            ellipse(1024,1590,920,530,fill='#0c1926',outline='#a57c3c',width=3)
            ellipse(1024,1590,880,505,outline='#a57c3c',width=1)
            for x in [680,1470]:ellipse(x,1308,65,23,fill='#070c13');card_at(im,x,1300,75,105,7)
            if clip['flight'][0]<=t<clip['flight'][1]:
                p=(t-clip['flight'][0])/(clip['flight'][1]-clip['flight'][0])
                a,b=(clip['hand'],clip['pile']) if action=='throw' else (clip['pile'],clip['hand'])
                x=a[0]+(b[0]-a[0])*p;y=a[1]+(b[1]-a[1])*p-np.sin(np.pi*p)*110
                card_at(im,x,y,75,105,10 if action=='receive' else p*120)
        d.text((16,16),'FINN / '+action.upper()+' / WHOLE DRAWINGS',fill='#e8cc86')
        seq.append(im)
    name=('table-' if table else '')+action+'.gif'
    seq[0].save(OUT/name,save_all=True,append_images=seq[1:],duration=40,loop=0,disposal=2)
for action in ['throw','receive']:
    preview(action,False);preview(action,True)
print(json.dumps({'poses':len(frames),'registeredSeatedHeight':1024,'completeDrawings':True,'separateAnatomy':False,'checks':checks},indent=2))
