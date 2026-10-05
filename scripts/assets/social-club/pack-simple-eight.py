"""Pack complete generated drawings and preview traditional frame animation.

No anatomy is synthesized or redrawn. Cropping, uniform scaling, padding,
atlas export and timed GIF playback only.
"""
from pathlib import Path
import json, math, shutil, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT.parent / 'output/100next-simple-animation-v1'
RUNTIME = ROOT / 'public/assets/social-club/simple-v1'
NAMES = ['vince','finn','june','edgar','roxie','otis','paloma','bianca']

def runs(values):
    indices=np.flatnonzero(values)
    if not len(indices): return []
    splits=np.where(np.diff(indices)>1)[0]+1
    return [(int(g[0]),int(g[-1])+1) for g in np.split(indices,splits)]

def bands(values, minimum, join=8):
    raw=runs(values)
    merged=[]
    for a,b in raw:
        if merged and a-merged[-1][1]<=join: merged[-1]=(merged[-1][0],b)
        else: merged.append((a,b))
    return [(a,b) for a,b in merged if b-a>=minimum]

def extract(path,cols,rows):
    im=Image.open(path).convert('RGBA');alpha=np.array(im.getchannel('A'))>150
    if alpha.mean()>.85: raise ValueError(f'{path.name}: opaque background, needs image-generator repair')
    rowbands=bands(alpha.sum(axis=1)>max(2,im.width*.008),im.height/rows*.20,0)
    if len(rowbands)!=rows: raise ValueError(f'{path.name}: expected {rows} rows, found {rowbands}')
    cells=[]
    for row,(top,bottom) in enumerate(rowbands):
        strip=alpha[top:bottom]
        colbands=bands(strip.sum(axis=0)>max(1,(bottom-top)*.006),im.width/cols*.12,0)
        if len(colbands)!=cols: raise ValueError(f'{path.name}: expected {cols} columns, found {colbands}')
        low=0 if row==0 else (rowbands[row-1][1]+top)//2
        high=im.height if row==rows-1 else (bottom+rowbands[row+1][0])//2
        for col,(left,right) in enumerate(colbands):
            # Include a tiny transparent guard, never clip strokes at their alpha boundary.
            west=0 if col==0 else (colbands[col-1][1]+left)//2
            east=im.width if col==cols-1 else (right+colbands[col+1][0])//2
            box=(max(west,left-2),max(low,top-2),min(east,right+2),min(high,bottom+2))
            cells.append((im.crop(box),box))
    return cells

def frame_id(kind,i):return {'reactions':1,'card-actions':13,'tumble':22}[kind]+i

def clips():
    f=lambda kind,i:frame_id(kind,i)
    two=0;one=f('card-actions',4)
    return {
      'idle':([two,f('reactions',1),two],[950,90,550]),
      'study':([two,f('reactions',2),two],[60,240,100]),
      'look-left':([two,f('reactions',3),two],[70,300,100]),
      'look-right':([two,f('reactions',4),two],[70,300,100]),
      'choose-left':([two,f('reactions',3),two],[70,380,100]),
      'choose-right':([two,f('reactions',4),two],[70,380,100]),
      'danger':([two,f('reactions',7),f('reactions',8),f('reactions',7)],[100,130,180,180]),
      'throw':([two,f('card-actions',1),f('card-actions',2),f('card-actions',3),one],[160,80,80,80,260]),
      'pickup':([one,f('card-actions',5),f('card-actions',5),f('card-actions',6),f('card-actions',7),two],[160,80,100,80,80,220]),
      'celebrate':([two,f('reactions',5),f('reactions',10),two],[80,180,230,150]),
      'defeat':([two,f('reactions',11)],[80,550]),
      'startle':([one,f('tumble',1)],[90,180]),
      'tumble':([f('tumble',i) for i in range(9)],[100,100,70,60,50,70,60,100,650]),
      'return':([f('tumble',i) for i in [8,7,6,4,3,2,1,0]]+[one],[180,70,60,60,70,80,90,100,200]),
      'expressions':([two]+[f('reactions',i) for i in range(1,12)],[500]+[350]*11),
    }

def gif(frames,durations,path,name,label):
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',18)
    rgb=[]
    for frame in frames:
        canvas=Image.new('RGB',(512,560),'#eee5d5');canvas.paste(frame,(0,24),frame)
        draw=ImageDraw.Draw(canvas);draw.text((256,24),name.title()+' · '+label,font=font,fill='#49362f',anchor='mm')
        draw.line((90,409,422,409),fill='#cbbdaa',width=1)
        rgb.append(canvas)
    palette=Image.new('RGB',(128*len(rgb),140))
    for i,im in enumerate(rgb):palette.paste(im.resize((128,140)),(i*128,0))
    palette=palette.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    images=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in rgb]
    images[0].save(path,save_all=True,append_images=images[1:],duration=durations,loop=0,disposal=1,optimize=False)

def pack(slug):
    target=OUT/slug;target.mkdir(parents=True,exist_ok=True);RUNTIME.mkdir(parents=True,exist_ok=True)
    version='-v2' if slug=='finn' else ''
    master=Image.open(ROOT.parent/f'output/100next-character-masters/chair-free-v1/{slug}-master{version}.png').convert('RGBA')
    # Retain the exact approved padded master as rest frame0.
    sources={kind:extract(OUT/f'{slug}-{kind}-source.png',cols,rows)
      for kind,cols,rows in [('reactions',3,4),('card-actions',3,3),('tumble',3,3)]}
    # Match physical height to each sheet's upright first drawing. A wide floor
    # pose must not shrink that sheet independently of the ordinary body poses.
    heights={kind:cells[0][0].height for kind,cells in sources.items()}
    widest=max(max(im.width,im.height)/heights[kind] for kind,cells in sources.items() for im,_ in cells)
    body_height=256/widest
    rest=master.crop(master.getchannel('A').getbbox())
    rest=rest.resize((round(rest.width/rest.height*body_height),round(body_height)),Image.Resampling.LANCZOS)
    neutral=Image.new('RGBA',(512,512));neutral.alpha_composite(rest,(round(256-rest.width/2),384-rest.height))
    layers=[neutral]
    checks=[]
    for kind,count,cols,rows in [('reactions',12,3,4),('card-actions',9,3,3),('tumble',9,3,3)]:
        cells=sources[kind]
        # One common scale for all drawings in a sheet, never resize individual poses.
        scale=body_height/heights[kind]
        for i,(im,source_box) in enumerate(cells):
            resized=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
            x=round(256-resized.width/2);y=384-resized.height
            layer=Image.new('RGBA',(512,512));layer.alpha_composite(resized,(x,y))
            bounds=layer.getchannel('A').getbbox();insets=[bounds[0],bounds[1],512-bounds[2],512-bounds[3]]
            assert min(insets)>=128,(slug,kind,i,insets)
            layer.save(target/f'{kind}-{i:02}.png');layers.append(layer)
            checks.append({'kind':kind,'pose':i,'bounds':bounds,'padding':insets,'sourceBox':source_box,'uniformScale':scale})
    assert len(layers)==31
    atlas=Image.new('RGBA',(2048,1024))
    for i,layer in enumerate(layers):
        atlas.alpha_composite(layer.crop((128,128,384,384)),(i%8*256,i//8*256))
    atlas.save(RUNTIME/f'{slug}-atlas.webp',lossless=True,method=6)
    atlas.save(target/'atlas.png')
    full=Image.new('RGBA',(2048,4096))
    for i,layer in enumerate(layers):full.alpha_composite(layer,(i%4*512,i//4*512))
    full.save(target/'padded-sheet.png')
    definitions=clips();data={}
    # Otis's two generated side looks arrived in the opposite order. Keep
    # the complete drawings intact and map their actual screen direction.
    if slug=='otis':
        for key in ['look-left','choose-left']: definitions[key][0][1]=frame_id('reactions',4)
        for key in ['look-right','choose-right']: definitions[key][0][1]=frame_id('reactions',3)
    for key,(ids,durations) in definitions.items():
        drawing=[{'index':i,'combinedChair':False,'cards':1 if i>=22 or 16<=i<=18 else 2} for i in ids]
        data[key]={'frames':drawing,'durations':durations}
        gif([layers[i] for i in ids],durations,target/f'{key}.gif',slug,key)
    manifest={'id':slug,'tool':'built-in image_gen','logicalCell':512,'atlasCols':8,'cell':256,'padding':128,'frames':31,'clips':data,'checks':checks,'handPolicy':'retained image-left, working image-right','throwReleaseMs':320,'pickupCatchMs':340,'chairPolicy':'No chairs in any frame, including tumbles','tumble':'body lying flat low on floor, feet up'}
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (RUNTIME/f'{slug}-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'character':slug,'drawings':len(layers),'bytes':(RUNTIME/f'{slug}-atlas.webp').stat().st_size}),flush=True)
    return manifest

def overview():
    """Contact-sheet GIF proof; frame playback only, no drawing alterations."""
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',22)
    atlases={slug:Image.open(OUT/slug/'atlas.png').convert('RGBA') for slug in NAMES}
    for title,sequence in [('eight-tumbles',['tumble']),('eight-card-actions',['throw','pickup'])]:
        ids=[];durations=[]
        for key in sequence:
            frames,timing=clips()[key];ids+=frames;durations+=timing
        durations[0]=700;durations[-1]=1500
        boards=[]
        for frame in ids:
            board=Image.new('RGB',(1280,720),'#eee5d5');draw=ImageDraw.Draw(board)
            for i,slug in enumerate(NAMES):
                x=i%4*320;y=i//4*360
                draw.text((x+160,y+28),slug.title(),font=font,fill='#49362f',anchor='mm')
                draw.line((x+25,y+328,x+295,y+328),fill='#cbbdaa',width=1)
                sprite=atlases[slug].crop((frame%8*256,frame//8*256,(frame%8+1)*256,(frame//8+1)*256))
                board.paste(sprite,(x+32,y+72),sprite)
            boards.append(board)
        palette=Image.new('RGB',(320*len(boards),180))
        for i,board in enumerate(boards):palette.paste(board.resize((320,180)),(i*320,0))
        palette=palette.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
        frames=[board.quantize(palette=palette,dither=Image.Dither.NONE) for board in boards]
        frames[0].save(OUT/f'{title}.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=1,optimize=False)

if __name__=='__main__':
    for slug in sys.argv[1:] or NAMES:pack(slug)
    if not sys.argv[1:]:overview()
