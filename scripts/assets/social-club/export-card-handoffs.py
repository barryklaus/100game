"""Erase only the working card to produce a matching empty grip.

Restore the unobstructed jacket/shirt from the approved one-card artwork;
keep the actual fingers and every pixel outside the small card region.
No anatomy generation, pose deformation or full-frame rescaling.
Authoring only: Pillow, Numpy and opencv-python-headless. These are not
runtime or deployment dependencies.
"""
from pathlib import Path
import sys,json,runpy
sys.path.insert(0,'/tmp/100next-motion-tools')
import cv2,numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT.parent/'output/100next-master-branch-v2'
OUT=ROOT.parent/'output/100next-card-handoffs'
DEST=ROOT/'public/assets/social-club/master-animation-v2'
REVIEW=ROOT/'public/assets/social-club/master-branch-review-v2'
helpers=runpy.run_path(str(Path(__file__).with_name('build-master-movements-v2.py')))
QUADS={
 'vince':[(1031,795),(1096,792),(1100,879),(1043,882)],
 'finn':[(1076,800),(1139,817),(1120,896),(1060,877)],
 'june':[(1010,783),(1084,770),(1099,862),(1027,880)],
 'edgar':[(1064,804),(1128,811),(1122,903),(1052,898)],
 'roxie':[(1015,783),(1093,770),(1101,863),(1026,876)],
 'otis':[(1045,770),(1144,770),(1143,856),(1056,864)],
 'paloma':[(1050,827),(1112,829),(1110,911),(1048,909)],
 'bianca':[(1032,770),(1093,778),(1082,857),(1018,846)],
}
def build(slug,manifest):
    folder=OUT/slug;folder.mkdir(parents=True,exist_ok=True)
    im=Image.open(SOURCE/slug/'prepare.png').convert('RGBA');base=np.array(im)
    backdrop=np.array(Image.open(SOURCE/slug/'release.png').convert('RGBA'))
    mask=np.zeros(base.shape[:2],np.uint8);quad=np.array(QUADS[slug],np.int32)
    cv2.fillConvexPoly(mask,quad,255)
    hsv=cv2.cvtColor(base[:,:,:3],cv2.COLOR_RGB2HSV)
    # Fingers intersect the bottom of the card. Keep their original shape,
    # contour, jewelry and nails; replace the card behind them.
    skin=(hsv[:,:,0]<18)&(hsv[:,:,1]>45)&(hsv[:,:,2]>75)&(base[:,:,2]>30)
    skin[:int(quad[:,1].mean())]=False
    _,labels,stats,_=cv2.connectedComponentsWithStats(skin.astype('uint8'))
    skin=np.isin(labels,np.flatnonzero(stats[:,cv2.CC_STAT_AREA]>600));skin[labels==0]=False
    skin=cv2.dilate(skin.astype('uint8'),np.ones((3,3),np.uint8))
    mask[skin>0]=0;mask[:770]=0
    result=base.copy();result[mask>0]=backdrop[mask>0]
    # Use the same silhouette: these are internal card pixels, not body edges.
    result[:,:,3]=base[:,:,3]
    assert np.array_equal(result[mask==0],base[mask==0])
    frame=Image.fromarray(result);frame.save(folder/'empty-grip.png')
    frame.save(REVIEW/slug/'empty-grip.webp',lossless=True,exact=True,method=6)
    record=manifest['characters'][slug];x,y,w,h=record['bounds']['prepare']
    crop=frame.crop((x,y,x+w,y+h));crop.save(DEST/slug/'empty-grip.webp',lossless=True,exact=True,method=6)
    decoded=np.array(Image.open(DEST/slug/'empty-grip.webp').convert('RGBA'))
    visible=np.array(crop.getchannel('A'))>0
    assert np.array_equal(np.array(crop)[visible],decoded[visible])
    record['bounds']['empty-grip']=[x,y,w,h]
    empty_release=helpers['small_gesture'](frame,helpers['working_mask'](),dx=5,dy=-3,angle=-1.5)
    empty_release.save(folder/'empty-release.png')
    empty_release.save(REVIEW/slug/'empty-release.webp',lossless=True,exact=True,method=6)
    x,y,w,h=record['bounds']['throw-edge']
    empty_release.crop((x,y,x+w,y+h)).save(DEST/slug/'empty-release.webp',lossless=True,exact=True,method=6)
    record['bounds']['empty-release']=[x,y,w,h]
    record['clips']['throw']={'frames':['rest','prepare-soft','prepare','throw-edge','empty-release','release','settle'],'durations':[50,50,50,50,45,65,80]}
    record['clips']['receive-ready']={'frames':['release','reach','empty-grip'],'durations':[40,40,60]}
    record['clips']['pickup']={'frames':['prepare','prepare-soft','rest'],'durations':[65,55,60]}
    center=quad.mean(axis=0)/4;width=(np.linalg.norm(quad[1]-quad[0])+np.linalg.norm(quad[2]-quad[3]))/8
    height=(np.linalg.norm(quad[2]-quad[1])+np.linalg.norm(quad[3]-quad[0]))/8
    theta=np.deg2rad(-1.5);rot=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
    c=(quad.mean(axis=0)-[1130,1020])@rot.T+[1130,1020]+[5,-3]
    record['handoff']={'releaseMs':200,'released':'empty-release','caught':'prepare','release':[float(c[0]/4),float(c[1]/4),float(width),float(height)],'catch':[float(center[0]),float(center[1]),float(width),float(height)]}
    print(slug,'matching release / catch grip',flush=True)
    return im,frame

if __name__=='__main__':
    manifest=json.loads((DEST/'manifest.json').read_text());OUT.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGB',(480*4,340*2),'#eee5d5');draw=ImageDraw.Draw(sheet)
    for i,slug in enumerate(QUADS):
        original,frame=build(slug,manifest)
        for j,im in enumerate([original,frame]):
            im=im.crop((960,770,1260,1060)).resize((240,232));x=(i%4)*480+j*240;y=(i//4)*340
            sheet.paste(im,(x,y+30),im);draw.text((x+5,y+8),slug+(' grip' if j==0 else ' empty'),fill='black')
    sheet.save(OUT/'grips.png')
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    review=json.loads((REVIEW/'manifest.json').read_text())
    for character in review['characters']:
        for clip in ['throw','receive-ready','pickup']:
            character['clips'][clip]=manifest['characters'][character['id']]['clips'][clip]
    (REVIEW/'manifest.json').write_text(json.dumps(review,indent=2)+'\n')
    (ROOT/'src/ui/MasterAnimationData.ts').write_text('// Complete native drawings, with matched card handoff poses.\nexport interface MasterAnimationSet { clips: Record<string,{frames:string[];durations:number[]}>; emotions: Record<string,string>; bounds:Record<string,number[]>; handoff?:{releaseMs:number;released:string;caught:string;release:number[];catch:number[]} }\nexport const masterAnimations:Record<string,MasterAnimationSet> = '+json.dumps(manifest['characters'],separators=(',',':'))+';\n')
