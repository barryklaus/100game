"""Pack complete generated tumble cutouts into padded cells; no art repainting."""
import json
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'output/character-tumbles/v1'
CELL, GUTTER = 418, 18

def cuts(alpha, axis):
    size = alpha.width if axis == 'x' else alpha.height
    counts = []
    solid = alpha.point(lambda a: 255 if a > 32 else 0)
    for p in range(size):
        strip = solid.crop((p, 0, p+1, solid.height) if axis == 'x' else (0, p, solid.width, p+1))
        counts.append(sum(strip.get_flattened_data()) // 255)
    result = [0]
    for i in (1, 2):
        nominal = size*i/3
        lo, hi = max(0, round(nominal-size*.075)), min(size-1, round(nominal+size*.075))
        gaps, start = [], None
        for p in range(lo, hi+1):
            if counts[p] <= 2:
                if start is None: start = p
            elif start is not None:
                gaps.append((start, p)); start = None
        if start is not None: gaps.append((start, hi+1))
        gaps = [g for g in gaps if g[1]-g[0] >= 3]
        if not gaps: raise ValueError(f'No transparent {axis} separator at {i}/3')
        a, b = min(gaps, key=lambda g: abs(sum(g)/2-nominal))
        result.append(round((a+b)/2))
    return result+[size]

def cutouts(band):
    """Separate complete disconnected figures when their horizontal bounds overlap."""
    width,height=band.size
    alpha=band.getchannel('A')
    pixels=bytearray(alpha.tobytes())
    components=[]
    for start,value in enumerate(pixels):
        if value <= 8: continue
        queue=deque([start]);pixels[start]=0;points=[]
        left,right,top,bottom=width,0,height,0
        while queue:
            p=queue.popleft();points.append(p);x,y=p%width,p//width
            left=min(left,x);right=max(right,x);top=min(top,y);bottom=max(bottom,y)
            for q in ((p-1 if x else -1),(p+1 if x+1<width else -1),p-width,p+width):
                if 0<=q<len(pixels) and pixels[q]>8:
                    pixels[q]=0;queue.append(q)
        if len(points)>12: components.append((points,(left,top,right+1,bottom+1)))
    bodies=sorted(components,key=lambda c:len(c[0]),reverse=True)[:3]
    if len(bodies)!=3 or any(len(c[0])<12000 for c in bodies): raise ValueError('Three separate full figures required')
    bodies.sort(key=lambda c:(c[1][0]+c[1][2])/2)
    if any(len(c[0])>12000 for c in components if c not in bodies): raise ValueError('Unexpected extra full figure')
    groups=[[] for _ in bodies]
    for component in components:
        if component in bodies: column=bodies.index(component)
        else:
            cx=(component[1][0]+component[1][2])/2
            column=min(range(3),key=lambda i:abs(cx-(bodies[i][1][0]+bodies[i][1][2])/2))
        groups[column].extend(component[0])
    result=[]
    for points in groups:
        mask=bytearray(width*height)
        for p in points: mask[p]=255
        isolated=band.copy()
        from PIL import ImageChops
        isolated.putalpha(ImageChops.multiply(alpha,Image.frombytes('L',band.size,bytes(mask))))
        result.append(isolated.crop(isolated.getchannel('A').getbbox()))
    return result

manifest = json.loads((DEST/'manifest.json').read_text())
for item in manifest['characters']:
    image = Image.open(DEST/item['source']).convert('RGBA')
    if image.getchannel('A').getextrema() != (0,255): raise ValueError('True alpha required')
    image.putalpha(image.getchannel('A').point(lambda a: 0 if a <= 8 else a))
    ys = cuts(image.getchannel('A'), 'y')
    frames = []
    for row in range(3):
        band = image.crop((0, ys[row], image.width, ys[row+1]))
        try: xs = cuts(band.getchannel('A'), 'x')
        except ValueError:
            frames.extend(cutouts(band))
            continue
        for col in range(3):
            region = band.crop((xs[col], 0, xs[col+1], band.height))
            bbox = region.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            if not bbox: raise ValueError('Missing tumble pose')
            frames.append(region.crop(bbox))
    scale = min((CELL-2*GUTTER)/max(f.width for f in frames), (CELL-2*GUTTER)/max(f.height for f in frames))
    packed = Image.new('RGBA',(CELL*3,CELL*3))
    for i, frame in enumerate(frames):
        w,h = round(frame.width*scale), round(frame.height*scale)
        resized = frame.resize((w,h),Image.Resampling.LANCZOS)
        packed.paste(resized,(i%3*CELL+(CELL-w)//2,i//3*CELL+CELL-GUTTER-h))
    name = f"avatar-{item['id']+1:02}-tumble.webp"
    packed.save(DEST/name,format='WEBP',quality=92,method=6)
    item.update(sheet=name,width=CELL*3,height=CELL*3,frameSize=CELL,gutter=GUTTER)
    print(f"{item['name']}: nine complete tumble poses, {(DEST/name).stat().st_size:,} bytes")
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
