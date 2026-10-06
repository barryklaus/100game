"""Export whole character review poses. No separate body parts in playback.

Authoring only: Pillow, numpy, OpenCV. Original paintings remain in output.
Registration cards are replaced with the original masked 100next card back.
"""
from pathlib import Path
import sys,json
import numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2

ROOT=Path(__file__).resolve().parents[3]
RAW=ROOT.parent/'output/whole-eight-actions'
DEST=ROOT/'public/whole-character-actions/assets'
DEST.mkdir(parents=True,exist_ok=True)
CAST=['june','edgar','otis','roxie','vince','paloma','bianca']
BACK=np.array(Image.open(ROOT/'public/finn-whole-action-trial/assets/rounded-back.webp').convert('RGBA').resize((256,356),Image.Resampling.LANCZOS))
AUDIT=[]

def mask_cards(im,label):
    a=np.array(im);rgb=a[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
    magenta=(r>200)&(b>180)&(g<65)&(a[:,:,3]>128)
    count,labels,stats,_=cv2.connectedComponentsWithStats(magenta.astype('uint8'))
    quads=[];accepted=np.zeros_like(magenta)
    major=[k for k in range(1,count) if stats[k,4]>=600]
    groups={k:[k] for k in major}
    # A finger crossing the card can separate a small visible corner from
    # its main surface. Attach that corner to the nearby larger surface.
    for k in range(1,count):
        if not 20<=stats[k,4]<600:continue
        center=stats[k,:2]+stats[k,2:4]/2
        closest=min(major,key=lambda j:np.linalg.norm(center-(stats[j,:2]+stats[j,2:4]/2)))
        distance=np.linalg.norm(center-(stats[closest,:2]+stats[closest,2:4]/2))
        if distance<max(stats[closest,2:4])*1.35:groups[closest].append(k)
    for ids in groups.values():
        mask=np.isin(labels,ids);accepted|=mask
        yy,xx=np.where(mask)
        rect=cv2.minAreaRect(np.column_stack((xx,yy)).astype('float32'))
        q=cv2.boxPoints(rect)
        # All held registration cards are portrait, inclined less than 45°.
        top=q[np.argsort(q[:,1])[:2]];bottom=q[np.argsort(q[:,1])[2:]]
        q=np.concatenate([top[np.argsort(top[:,0])],bottom[np.argsort(-bottom[:,0])]])
        quads.append(q)
    assert len(quads)>0,label
    quads.sort(key=lambda q:float(q[:,0].mean()))
    skin=(r>80)&(r>g*1.17)&(g>b*1.13)&(b>g*.3)&(a[:,:,3]>128)
    skin=cv2.morphologyEx(skin.astype('uint8'),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    contours,_=cv2.findContours(skin,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(skin,contours,-1,1,cv2.FILLED)
    nearby=cv2.dilate(skin,np.ones((5,5),np.uint8))>0
    fingers=(skin>0)|(nearby&(rgb.max(axis=2)<100))
    cleanup=np.zeros(a.shape[:2],np.uint8);exposed=np.zeros_like(cleanup)
    for q in quads:
        cover=np.zeros_like(cleanup);cv2.fillConvexPoly(cover,np.int32(q),255)
        cover=cv2.dilate(cover,np.ones((7,7),np.uint8))
        ring=(cv2.dilate(cover,np.ones((15,15),np.uint8))>0)&(cover==0)
        cover[fingers]=0
        cleanup=np.maximum(cleanup,cover)
        if np.mean(a[:,:,3][ring]<32)>.38:exposed=np.maximum(exposed,cover)
    cleanup=np.maximum(cleanup,cv2.dilate(accepted.astype('uint8')*255,np.ones((7,7),np.uint8)))
    fingers[magenta]=False
    cleanup[fingers]=0
    # Reconstruct clothing only beneath the tiny card surfaces; exposed
    # cards disappear to transparency before new rounded corners are added.
    result=a.copy();result[:,:,:3]=cv2.inpaint(a[:,:,:3],cleanup,3,cv2.INPAINT_NS)
    result[:,:,3]=cv2.inpaint(a[:,:,3],cleanup,3,cv2.INPAINT_NS)
    result[exposed>0]=0
    edited=Image.fromarray(result)
    h,w=BACK.shape[:2];source=np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]])
    for q in quads:
        origin=np.floor(q.min(axis=0)).astype(int)-3;extent=np.ceil(q.max(axis=0)).astype(int)-origin+4
        transform=cv2.getPerspectiveTransform(source,np.float32((q-origin)*4))
        src=BACK.astype('float32')/255;src[:,:,:3]*=src[:,:,3:4]
        tile=np.clip(cv2.warpPerspective(src,transform,tuple((extent*4).tolist()),flags=cv2.INTER_CUBIC),0,1)
        alpha=tile[:,:,3:4];tile[:,:,:3]=np.divide(tile[:,:,:3],alpha,out=np.zeros_like(tile[:,:,:3]),where=alpha>1e-6)
        tile=Image.fromarray(np.uint8(np.clip(tile,0,1)*255)).resize(tuple(extent),Image.Resampling.LANCZOS)
        edited.alpha_composite(tile,tuple(origin))
    result=np.array(edited);result[fingers]=a[fingers]
    # RGB hidden behind alpha is cleared, preserving the generated alpha.
    result[result[:,:,3]<32]=0
    search=cv2.dilate(cleanup,np.ones((11,11),np.uint8))>0
    leftover=(result[:,:,0]>200)&(result[:,:,2]>180)&(result[:,:,1]<65)&(result[:,:,3]>128)&search
    # Remove occasional isolated registration-colored antialias pixels.
    assert leftover.sum()<50,(label,'registration cleanup needs review',int(leftover.sum()))
    if leftover.any():
        tiny=cv2.dilate(leftover.astype('uint8')*255,np.ones((3,3),np.uint8))
        result[:,:,:3]=cv2.inpaint(result[:,:,:3],tiny,2,cv2.INPAINT_NS)
    remaining=(result[:,:,0]>200)&(result[:,:,2]>180)&(result[:,:,1]<65)&(result[:,:,3]>128)&search
    assert remaining.sum()==0,(label,'registration color remains',int(remaining.sum()))
    AUDIT.append({'painting':label,'cardCount':len(quads),'roundedRadiusRatio':.055,'registrationPixelsRemaining':0})
    return Image.fromarray(result),quads

def split_pair(im):
    a=np.array(im);_,_,stats,_=cv2.connectedComponentsWithStats((a[:,:,3]>32).astype('uint8'))
    ids=sorted(range(1,len(stats)),key=lambda i:stats[i,4],reverse=True)[:2];ids.sort(key=lambda i:stats[i,0])
    left,right=stats[ids[0]],stats[ids[1]]
    assert left[0]+left[2]<right[0],('figures touch',left.tolist(),right.tolist())
    split=round((left[0]+left[2]+right[0])/2)
    return [im.crop((0,0,split,im.height)),im.crop((split,0,im.width,im.height))],split

def foot_anchor(im):
    a=np.array(im);ys,xs=np.where(a[:,:,3]>128);lo,hi=ys.min(),ys.max()
    bottom=(a[:,:,3]>128)&(np.indices(a.shape[:2])[0]>lo+(hi-lo)*.96)
    yy,xx=np.where(bottom)
    return np.array([(xx.min()+xx.max())/2,hi])

def export_character(character):
    dest=DEST/character;dest.mkdir(parents=True,exist_ok=True)
    raw=RAW/character;frames={};checks=[];hands={};origins={};scales={}
    for action in ['throw','receive']:
        for j,letter in enumerate('abc'):
            name=action+'-'+letter
            edited,quads=mask_cards(Image.open(raw/(name+'.png')).convert('RGBA'),character+'/'+name)
            poses,split=split_pair(edited)
            heights=[im.getchannel('A').getbbox()[3]-im.getchannel('A').getbbox()[1] for im in poses]
            scale=1024/np.mean(heights)
            for i,pose in enumerate(poses):
                key=f'{action}-{j*2+i+1}';offset=np.array([1024,1536])-foot_anchor(pose)*scale
                frame=pose.transform((2048,2048),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
                bounds=frame.getchannel('A').getbbox();clearance=min(bounds[0],bounds[1],2048-bounds[2],2048-bounds[3])
                assert clearance>=400,(character,key,bounds)
                frame.save(dest/(key+'.webp'),lossless=True,exact=True,method=6)
                frames[key]=frame;origins[key]=offset;scales[key]=scale
                pose_quads=[q-np.array([split if i else 0,0]) for q in quads if (q[:,0].mean()>=split)==bool(i)]
                expected=([2,2,2,1,1,1] if action=='throw' else [1,1,1,2,2,2])[j*2+i]
                assert len(pose_quads)==expected,(character,key,'card count',len(pose_quads),expected)
                if key in ['throw-3','receive-4']:
                    hands[action]=(pose_quads[-1].mean(axis=0)*scale+offset).tolist()
                checks.append({'frame':key,'bounds':bounds,'clearance':clearance,'cardCount':len(pose_quads),'wholeDrawing':True,'scale':scale})
    manifest={'character':character,'nativeCanvas':2048,'authoringCell':3072,'cellInset':512,'revision':'whole-eight-v1','separateHead':False,'clips':{
        'throw':{'frames':[f'throw-{i}' for i in range(1,7)],'durations':[70,90,55,45,75,100],'flight':[215,560],'hand':hands['throw'],'pile':[1470,1300]},
        'receive':{'frames':[f'receive-{i}' for i in range(1,7)],'durations':[80,70,490,55,75,100],'flight':[160,640],'hand':hands['receive'],'pile':[680,1300]}},'checks':checks}
    (dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    contact=Image.new('RGB',(2520,1140),'#14202e');draw=ImageDraw.Draw(contact)
    for row,action in enumerate(['throw','receive']):
        for i in range(6):
            pose=frames[f'{action}-{i+1}'].crop((500,430,1580,1650)).resize((400,452),Image.Resampling.LANCZOS)
            contact.paste(pose,(i*420+10,row*570+55),pose);draw.text((i*420+15,row*570+20),character+' '+action+' '+str(i+1),fill='#ead29b')
    contact.save(raw/'contact.jpg',quality=92)
    for action in ['throw','receive']:
        atlas=Image.new('RGBA',(9216,6144))
        for i in range(6):atlas.alpha_composite(frames[f'{action}-{i+1}'],(i%3*3072+512,i//3*3072+512))
        atlas.save(raw/(action+'-padded-sheet.png'))
    return manifest

if __name__=='__main__':
    names=sys.argv[1:] or CAST
    for character in names:
        export_character(character);print('Exported',character,flush=True)
    checks=[]
    for path in sorted(DEST.glob('*/manifest.json')):
        data=json.loads(path.read_text())
        checks.extend(dict(character=data['character'],**row) for row in data['checks'])
    (DEST/'card-audit.json').write_text(json.dumps({'nativeCanvas':2048,'roundedRadiusRatio':.055,'frames':checks},indent=2)+'\n')
