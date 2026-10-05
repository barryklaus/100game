"""Bake complete card-action and tumble drawings with master-locked identity.

Card gestures change only the registered chest/working-hand region. The
original head and lower body are protected. Falling body poses are new
drawings; their original master heads are reused at physical scale 1.
Every browser frame is one flattened complete character image.
"""
from pathlib import Path
import argparse, json, runpy, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-master-branch-v2'
OLD=ROOT.parent/'output/100next-master-branch-v1'
tools=runpy.run_path(str(Path(__file__).with_name('master-pose-tools.py')))
eye_pair=tools['eye_pair'];affine=tools['affine'];registration=tools['registration']
def gif(frames,ids,durations,path):
    size=(512,512);rgb=[]
    for key in ids:
        im=frames[key].crop((256,256,1792,1792)).resize(size,Image.Resampling.LANCZOS)
        board=Image.new('RGB',size,'#eee5d5');board.paste(im,(0,0),im);rgb.append(board)
    sample=Image.new('RGB',(128*len(rgb),128))
    for i,im in enumerate(rgb):sample.paste(im.resize((128,128)),(i*128,0))
    palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    converted=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in rgb]
    converted[0].save(path,save_all=True,append_images=converted[1:],duration=durations,loop=0,disposal=1,optimize=False)

EYES=runpy.run_path(str(Path(__file__).with_name('build-master-reactions.py')))['EYES']
NAMES=['vince','finn','june','edgar','roxie','otis','paloma','bianca']
DONOR_EYES={
 ('june','release'):[[599,311],[676.5,317]],
 ('bianca','prepare'):[[596.5,300],[660,306]],
 ('bianca','release'):[[585.5,314],[651,320]],
}

def donor_eyes(im,slug,kind):
    points=DONOR_EYES.get((slug,kind))
    return np.array(points) if points else eye_pair(im)

def load(file):
    im=Image.open(file).convert('RGBA');a=np.array(im);a[a[:,:,3]<16,3]=0
    return Image.fromarray(a)

def working_mask():
    mask=Image.new('L',(2048,2048))
    polygon=[(890,820),(1030,810),(1060,779),(1170,779),(1270,870),(1400,910),(1390,1100),(1230,1124),(1040,1080),(890,1025)]
    ImageDraw.Draw(mask).polygon(polygon,fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(4))
    ImageDraw.Draw(mask).rectangle((0,0,2048,769),fill=0)
    ImageDraw.Draw(mask).rectangle((0,1150,2048,2048),fill=0)
    return mask

def small_gesture(frame,mask,dx=0,dy=0,angle=0):
    theta=angle*np.pi/180;matrix=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
    pivot=np.array([1130,1020]);shift=pivot-matrix@pivot+np.array([dx,dy])
    moved=affine(frame,matrix,shift)
    return Image.composite(moved,frame,mask)

def falling_pose(slug,kind,master,target_eyes):
    donor=load(OUT/'donors'/f'{slug}-{kind}.png')
    # Otis's pose donor holds the card on the wrong side. Mirror its body,
    # then replace its face with the unmirrored original master painting.
    mirrored=slug=='otis' or (slug in ['paloma','bianca'] and kind=='midfall')
    if mirrored:donor=donor.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    source_eyes=donor_eyes(donor,slug,kind)
    _,_,scale,angle=registration(target_eyes,source_eyes)
    # Body calibration maps the donor's eye unit to the original master's.
    scale=1/scale
    rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    solid=np.array(donor.getchannel('A'))>128;ys,xs=np.where(solid)
    bottom=1460 if kind=='midfall' else 1535
    offset=np.array([1024-scale*(xs.min()+xs.max())/2,bottom-scale*ys.max()])
    body=affine(donor,np.eye(2)*scale,offset)
    world_eyes=source_eyes.mean(axis=0)*scale+offset
    head_shift=world_eyes-rotation@target_eyes.mean(axis=0)
    # Erase the donor face; keep its neck/shirt beneath the original head.
    erase=master.getchannel('A').copy();ImageDraw.Draw(erase).rectangle((0,773,2048,2048),fill=0)
    erase=erase.filter(ImageFilter.MaxFilter(25))
    erase=affine(erase,rotation,head_shift)
    alpha=np.array(body.getchannel('A'));alpha[np.array(erase)>0]=0;body.putalpha(Image.fromarray(alpha))
    head=Image.open(OUT/slug/'shocked.png').convert('RGBA')
    alpha=np.array(master.getchannel('A')).astype(float)
    for row in range(790,816):alpha[row]*=max(0,(815-row)/25)
    alpha[816:]=0;head.putalpha(Image.fromarray(alpha.astype('uint8')))
    body.alpha_composite(affine(head,rotation,head_shift))
    return body,{'sourceEyes':source_eyes.tolist(),'bodyMirroredForCardSide':mirrored,'bodyScale':float(scale),'masterHeadScale':1,'masterHeadRotationDegrees':float(angle*180/np.pi),'headPolicy':'Actual original master head, rotated/translated; only local expression edit','bodyPolicy':'New generated body pose, calibrated from master face unit'}

def build(slug):
    folder=OUT/slug;master=Image.open(folder/'rest.png').convert('RGBA');base=np.array(master)
    # Explicit calibrated eye regions prevent collars being mistaken for eyes.
    landmarks=[]
    for x0,y0,x1,y1 in EYES[slug]:
        eye=np.array(master.crop((x0,y0,x1,y1))).astype(int)
        white=(eye[:,:,:3].min(axis=2)>190)&(np.ptp(eye[:,:,:3],axis=2)<55)
        ys,xs=np.where(white)
        landmarks.append([x0+(xs.min()+xs.max())/2,y0+(ys.min()+ys.max())/2])
    target_eyes=np.array(landmarks)
    mask=working_mask();allowed=np.array(mask)>0;frames={};checks=[]
    if slug=='finn':
        for key in ['throw-prepare-locked','throw-release-locked']:
            frames['prepare' if 'prepare' in key else 'release']=Image.open(OLD/slug/(key+'.png')).convert('RGBA')
    else:
        for key in ['prepare','release']:
            donor=load(OUT/'donors'/f'{slug}-{key}.png');source_eyes=donor_eyes(donor,slug,key)
            m,offset,scale,angle=registration(source_eyes,target_eyes)
            registered=affine(donor,m,offset)
            frame=Image.composite(registered,master,mask);a=np.array(frame)
            assert np.array_equal(a[~allowed],base[~allowed]),(slug,key,'protected master changed')
            assert np.array_equal(a[:770],base[:770]),(slug,key,'head changed')
            assert np.array_equal(a[1150:],base[1150:]),(slug,key,'lower body changed')
            frames[key]=frame
            checks.append({'frame':key,'headPixelsIdentical':True,'lowerBodyPixelsIdentical':True,'protectedPixelsIdentical':True,'sourceEyes':source_eyes.tolist(),'scale':scale,'rotation':angle,'offset':offset.tolist()})
    frames['prepare-soft']=small_gesture(frames['prepare'],mask,dy=5)
    frames['throw-edge']=small_gesture(frames['prepare'],mask,dx=5,dy=-3,angle=-1.5)
    frames['settle']=small_gesture(frames['release'],mask,dy=3)
    frames['reach']=small_gesture(frames['release'],mask,dx=5,dy=4)
    # The startle is the same released body plus only its shocked face pixels.
    one=frames['release'].copy();shock=Image.open(folder/'shocked.png').convert('RGBA')
    one.paste(shock.crop((0,0,2048,770)),(0,0));frames['tumble-start']=one
    if slug=='finn':
        for key in ['midfall','floor']:
            frames[key]=Image.open(OLD/slug/(key+'-tumble.png')).convert('RGBA')
    else:
        for key in ['midfall','floor']:
            frames[key],check=falling_pose(slug,key,master,target_eyes);checks.append({'frame':key,**check})
    for key,degrees,dy in [('recoil',-8,20),('fall-start',-19,92)]:
        theta=degrees*np.pi/180;m=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
        pivot=np.array([1024,1110]);frames[key]=affine(one,m,pivot-m@pivot+np.array([0,dy]))
    for key,degrees,dy in [('airfall',-12,120),('airfall-low',-24,210)]:
        theta=degrees*np.pi/180;m=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
        pivot=np.array([1024,1180]);frames[key]=affine(frames['midfall'],m,pivot-m@pivot+np.array([0,dy]))
    frames['impact']=affine(frames['floor'],np.eye(2),np.array([0,7]))
    frames['bounce']=affine(frames['floor'],np.eye(2),np.array([0,-10]))
    for name,frame in frames.items():
        bounds=frame.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
        assert min(bounds[0],bounds[1],2048-bounds[2],2048-bounds[3])>=256,(slug,name,'clearance',bounds)
        frame.save(folder/(name+'.png'))
    data=json.loads((folder/'manifest.json').read_text())
    data['clips'].update({
        'throw':{'frames':['rest','prepare-soft','prepare','throw-edge','release','settle'],'durations':[80,80,80,80,90,130]},
        'pickup':{'frames':['release','reach','reach','prepare','prepare-soft','rest'],'durations':[160,100,80,80,80,180]},
        'startle':{'frames':['release','tumble-start'],'durations':[60,180]},
        'tumble':{'frames':['tumble-start','recoil','fall-start','midfall','airfall','airfall-low','floor','impact','bounce','floor'],'durations':[100,80,70,70,65,65,80,60,90,700]},
        'return':{'frames':['floor','bounce','airfall-low','airfall','midfall','fall-start','recoil','tumble-start','release','rest'],'durations':[160,70,60,60,70,70,80,90,100,180]},
    })
    data.update({'targetEyes':target_eyes.tolist(),'movementChecks':checks,'throwReleaseMs':320,'pickupCatchMs':340,'status':'complete animation drawings; visual review required before gameplay activation','chairPolicy':'No chairs','scalePolicy':'Native master head and body protected for small gestures; actual master head reused at scale 1 for large body poses'})
    (folder/'manifest.json').write_text(json.dumps(data,indent=2)+'\n')
    frames['rest']=master
    for name in ['throw','pickup','tumble','return']:
        clip=data['clips'][name];gif(frames,clip['frames'],clip['durations'],folder/(name+'.gif'))
    print(json.dumps({'character':slug,'movementFrames':len(frames)-1,'protectedHead':True,'complete':True}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('characters',nargs='*');args=parser.parse_args()
    for slug in args.characters or NAMES:build(slug)
