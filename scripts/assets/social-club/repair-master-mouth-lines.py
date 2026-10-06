"""Repair complete mouth contours without changing eyes, anatomy or card backs.

All coordinates refer to the fixed 2048px master. Skin reconstruction and
antialiasing are local. Source backups make repeated exports deterministic.
Requires Pillow, NumPy and OpenCV (the approved local asset tool environment).
"""
from pathlib import Path
import json, sys
sys.path.insert(0, '/tmp/100next-motion-tools')
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT/'public/assets/social-club/master-animation-v2'
OUT = ROOT.parent/'output/mouth-line-repair'
ORIGINALS = OUT/'originals'
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((DEST/'manifest.json').read_text())
POLYGONS={
'vince':[(983,680),(998,688),(1006,702),(1020,712),(1038,718),(1046,720),(1044,731),(1019,736),(997,725),(985,706)],
'finn':[(987,698),(1002,700),(1020,706),(1041,702),(1057,704),(1057,733),(987,733)],
'june':[(988,705),(1006,707),(1025,709),(1044,707),(1064,710),(1064,749),(988,749)],
'edgar':[(979,737),(996,738),(1017,744),(1035,745),(1046,750),(1043,765),(979,765)],
'roxie':[(988,692),(1006,698),(1027,704),(1044,704),(1061,707),(1069,741),(988,745)],
'otis':[(997,706),(1066,706),(1066,740),(997,740)],
'paloma':[(977,730),(995,730),(1010,731),(1028,726),(1055,727),(1055,769),(977,769)],
'bianca':[(974,697),(994,700),(1013,700),(1033,699),(1053,700),(1053,740),(974,740)]}
CENTERS={'vince':(1013,723,35),'finn':(1020,715,38),'june':(1027,728,45),'edgar':(1014,751,35),'roxie':(1028,719,45),'otis':(1029,719,36),'paloma':(1015,743,43),'bianca':(1014,714,44)}
FEMALE={'june','roxie','paloma','bianca'}
CHINS={'vince':(1022,770),'finn':(1020,742),'june':(1021,751),'edgar':(1017,768),'roxie':(1024,750),'otis':(1025,751),'paloma':(1016,778),'bianca':(1014,741)}
def full(slug,name):
 x,y,w,h=meta['characters'][slug]['bounds'][name];im=Image.new('RGBA',(2048,2048));im.paste(Image.open(DEST/slug/(name+'.webp')).convert('RGBA'),(x,y));return im

def mouth(master,slug,kind):
 if kind in ['smug','relieved']:return master.copy()
 polygon=POLYGONS[slug];points=np.array(polygon);lo=points.min(axis=0)-8;hi=points.max(axis=0)+9;box=(*lo,*hi);crop=np.array(master.crop(box));mask=np.zeros(crop.shape[:2],np.uint8);cv2.fillPoly(mask,[np.int32(points-lo)],255)
 # Protect the actual connected jaw outline, including antialiasing.
 head=np.array(master.crop((900,600,1130,810)));ink_mask=(head[:,:,:3].max(axis=2)<100)&(head[:,:,3]>128)
 _,labels,stats,_=cv2.connectedComponentsWithStats(ink_mask.astype('uint8'))
 px,py=CHINS[slug];ys,xs=np.where(ink_mask);pick=np.argmin((xs+900-px)**2+(ys+600-py)**2);label=labels[ys[pick],xs[pick]]
 jaw=cv2.dilate((labels==label).astype('uint8'),np.ones((3,3),np.uint8));protected=Image.new('L',(2048,2048));protected.paste(Image.fromarray(jaw*255),(900,600));jaw_local=np.array(protected.crop(box))>0
 mask[jaw_local]=0
 # Local smooth skin fill; no wrapped diffusion or rectangular edges.
 rgb=crop[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
 valid=(mask==0)&(r>110)&(g>70)&(r>g*1.04)&(g>r*.35)&(b>g*.25)&(b<g*.94)
 yy,xx=np.indices(mask.shape);design=np.stack([np.ones_like(xx),xx/100,yy/100],axis=-1)
 assert valid.sum()>20,(slug,'skin calibration')
 fit=np.linalg.lstsq(design[valid],rgb[valid],rcond=None)[0];clean=np.clip(design@fit,0,255)
 # Match the original skin at every boundary; exclude dark lip/jaw ink
 # from the reconstruction neighborhood so it cannot bleed into the face.
 working=rgb.copy();near=cv2.dilate(mask,np.ones((7,7),np.uint8))>0
 working[near&~valid]=clean[near&~valid]
 repaired=cv2.inpaint(working.astype('uint8'),mask,3,cv2.INPAINT_NS)
 rgb[mask>0]=repaired[mask>0];patch=Image.fromarray(np.dstack((rgb,crop[:,:,3])).astype('uint8'));marks=Image.new('RGBA',(patch.width*4,patch.height*4));d=ImageDraw.Draw(marks)
 cx,cy,w=CENTERS[slug];cx=(cx-lo[0])*4;cy=(cy-lo[1])*4;w*=4;ink=(45,25,23,255)
 if kind in ['nervous','frustrated','defeated']:
  pts=[]
  for i in range(41):
   t=i/40;yy=cy-(10 if kind!='nervous' else 2)*np.sin(np.pi*t);pts.append((cx-w/2+t*w,yy))
  if slug in FEMALE:
   # Complete upper and lower lips with one continuous central seam.
   upper=[(x,y-6*np.sin(np.pi*i/40)) for i,(x,y) in enumerate(pts)]
   lower=[(x,y+16*np.sin(np.pi*i/40)) for i,(x,y) in enumerate(pts)]
   shape=upper+list(reversed(lower));d.polygon(shape,fill=(184,39,49,255));d.line(shape+[shape[0]],fill=ink,width=5)
  d.line(pts,fill=ink,width=6)
 else:
  ww=30*4;hh=23*4
  if kind=='panic-soft':ww*=.8;hh*=.45
  if kind=='shock-soft':hh*=.6
  if kind in ['amused','delighted']:ww=38*4;hh*=.65
  # Keep Vince's mouth clear of the long nose.
  if slug=='vince':ww=24*4;cx-=3*4
  oval=(cx-ww/2,cy-hh/2,cx+ww/2,cy+hh/2)
  if slug in FEMALE:d.ellipse((oval[0]-5,oval[1]-5,oval[2]+5,oval[3]+5),fill=(164,33,43,255))
  d.ellipse(oval,fill=ink);inner=Image.new('RGBA',marks.size);draw=ImageDraw.Draw(inner)
  if kind in ['panicked','panic-soft','amused','delighted']:draw.rectangle((oval[0],oval[1],oval[2],oval[1]+hh*.25),fill=(252,244,226,255))
  draw.ellipse((cx-ww*.3,cy+hh*.1,cx+ww*.3,cy+hh*.55),fill=(218,93,109,255));clip=Image.new('L',marks.size);ImageDraw.Draw(clip).ellipse(oval,fill=255);inner.putalpha(Image.composite(inner.getchannel('A'),Image.new('L',marks.size),clip));marks.alpha_composite(inner)
 marks=marks.resize(patch.size,Image.Resampling.LANCZOS);patch.alpha_composite(marks);pa=np.array(patch);pa[jaw_local]=crop[jaw_local];patch=Image.fromarray(pa);result=master.copy();result.paste(patch,tuple(lo));return result

# Also restore the entire earlier edit rectangle, which otherwise retains
# stray lip corners outside the new continuous drawing.
OLD_BOXES = {
    'vince': (977,684,1049,731), 'finn': (993,699,1051,728),
    'june': (988,707,1048,745), 'edgar': (995,735,1042,762),
    'roxie': (984,700,1060,740), 'otis': (1001,708,1061,734),
    'paloma': (982,724,1044,760), 'bianca': (978,697,1042,730),
}
KINDS = ['nervous','panic-soft','panicked','shock-soft','shocked',
         'amused','smug','relieved','frustrated','defeated','delighted']
BLINK_POSES = ['nervous','panicked','amused','smug','frustrated','defeated']
AUDIT = []
BEFORE = {}
AFTER = {}


def repair_frame(slug, name, clean, box):
    record = meta['characters'][slug]
    file = DEST/slug/(name+'.webp')
    saved = ORIGINALS/slug/(name+'.webp')
    saved.parent.mkdir(parents=True, exist_ok=True)
    if not saved.exists():
        saved.write_bytes(file.read_bytes())
    x,y,w,h = record['bounds'][name]
    original = Image.new('RGBA', (2048,2048))
    original.paste(Image.open(saved).convert('RGBA'), (x,y))
    result = original.copy()
    result.paste(clean.crop(box), (box[0],box[1]))
    result.putalpha(original.getchannel('A'))
    a, b = np.array(original), np.array(result)
    allowed = np.zeros((2048,2048), bool)
    allowed[box[1]:box[3],box[0]:box[2]] = True
    assert np.array_equal(a[~allowed], b[~allowed]), (slug,name,'protected pixels')
    assert np.array_equal(a[:,:,3], b[:,:,3]), (slug,name,'silhouette')
    crop = result.crop((x,y,x+w,y+h))
    crop.save(file, lossless=True, exact=True, method=4)
    assert np.array_equal(np.array(crop),np.array(Image.open(file))), (slug,name,'lossless export')
    AUDIT.append({'character':slug, 'frame':name, 'mouthRegion':list(box),
                  'eyesBodyAndCardBacksUnchanged':True, 'alphaUnchanged':True,
                  'nativePixelsIdentical':True})
    BEFORE[slug,name] = original
    AFTER[slug,name] = result
    return result


def run():
    for slug, record in meta['characters'].items():
        master = full(slug,'rest')
        for kind in KINDS:
            if kind not in record['bounds']:
                continue
            clean = mouth(master,slug,kind)
            diff = Image.fromarray(np.any(np.array(master)!=np.array(clean),axis=2).astype('uint8')*255).getbbox()
            old = OLD_BOXES[slug]
            box = old if diff is None else (min(old[0],diff[0]),min(old[1],diff[1]),
                                           max(old[2],diff[2]),max(old[3],diff[3]))
            repair_frame(slug,kind,clean,box)
            if kind in BLINK_POSES:
                for suffix in ['-blink-half','-blink']:
                    blink = repair_frame(slug,kind+suffix,clean,box)
                    assert np.array_equal(np.array(blink.crop(box))[:,:,:3],np.array(clean.crop(box))[:,:,:3])
        print(slug, 'mouth contours and matching blinks repaired', flush=True)
    (DEST/'mouth-line-checks.json').write_text(json.dumps(AUDIT,indent=2)+'\n')
    # Native close-ups show the actual runtime eyes and mouth combinations.
    poses = ['nervous','smug','frustrated','relieved','panicked','shocked']
    board = Image.new('RGB',(6*230,8*220),'#dedad1')
    draw = ImageDraw.Draw(board)
    for row,slug in enumerate(meta['characters']):
        for col,pose in enumerate(poses):
            face = AFTER[slug,pose].crop((900,590,1130,790))
            board.paste(face,(col*230,row*220+20),face)
            draw.text((col*230+5,row*220+5),slug+' / '+pose,fill='black')
    board.save(OUT/'corrected-runtime-mouths.jpg')
    # Compare the previous and corrected frames, without changing timing.
    sequence = ['nervous','panic-soft','panicked','panic-soft','nervous',
                'nervous-blink-half','nervous-blink','nervous-blink-half','nervous']
    durations = [500,70,240,70,500,60,100,60,900]
    frames = []
    for pose in sequence:
        frame = Image.new('RGB',(1160,355),'#eee5d5')
        draw = ImageDraw.Draw(frame)
        for col,slug in enumerate(['june','bianca']):
            for side,source in enumerate([BEFORE,AFTER]):
                face = source[slug,pose].crop((930,625,1100,795)).resize((280,280),Image.Resampling.LANCZOS)
                # The inspection crop is enlarged only in this preview.
                frame.paste(face,(col*580+side*290,38),face)
                draw.text((col*580+side*290+8,12),slug.title()+(' - before' if side==0 else ' - corrected'),fill='#282728')
        frames.append(frame)
    frames[0].save(OUT/'mouth-before-after.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2)
    print('Repaired',len(AUDIT),'native reaction and blink frames')


if __name__ == '__main__':
    run()
