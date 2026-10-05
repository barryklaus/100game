"""Frame already generated whole-character artwork; never redraw or alter anatomy."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SOURCES = Path('/Users/barryklaus/.codex/generated_images/01a0b3eb-7f6a-7191-9b2a-9e61f45bf813')
REVIEW = ROOT.parent / 'output/100next-character-masters/chair-free-v1'
RUNTIME = ROOT / 'public/assets/social-club/masters-v1'
SPEC = [
    ('vince', 'Vince', '5b44d3b4-afb1-48f0-9358-bbee567d87db', (588,488), (720,580)),
    ('finn', 'Finn', 'f04d92d0-1d64-41f2-a6f1-83d5b3899fcf', (590,510), (701,580)),
    ('june', 'June', '51209227-302f-49b0-992f-d15ebd0cad88', (560,520), (703,562)),
    ('edgar', 'Edgar', '8844fc25-a024-4666-a94d-42e6b71716ce', (633,543), (743,603)),
    ('roxie', 'Roxie', '4334e583-a83a-4868-a61b-e1a66be1b184', (576,468), (720,533)),
    ('otis', 'Otis', '29e587ad-e61a-4f49-8cfa-9e03fa606a71', (630,547), (732,599)),
    ('paloma', 'Paloma', '7ed4da3c-84ed-4784-8a96-5c116c0fc160', (588,517), (735,563)),
    ('bianca', 'Bianca', 'f3a73eb1-2aa4-410e-8c9c-373d21659db1', (594,491), (724,534)),
]
REVIEW.mkdir(parents=True, exist_ok=True)
RUNTIME.mkdir(parents=True, exist_ok=True)
manifest = {'tool':'built-in image_gen', 'status':'single-pose chair-free master playtest, animation sheets pending', 'canvas':2048, 'protectedPadding':512, 'characters':[]}
board = Image.new('RGB', (1920,1740), '#f5efe4')
draw = ImageDraw.Draw(board)
fontpath = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font = ImageFont.truetype(fontpath,36)
title = ImageFont.truetype(fontpath,44)
draw.text((70,42), '100next · Chair-free character masters', font=title, fill='#252028')
draw.text((70,103), 'Vince · Finn · June · Edgar · Roxie · Otis · Paloma · Bianca', font=ImageFont.truetype(fontpath,24), fill='#65555e')
for i,(slug,name,source_id,release,catch) in enumerate(SPEC):
    source = SOURCES / f'exec-{source_id}.png'
    im = Image.open(source).convert('RGBA')
    # Ignore near-invisible generator specks when locating the real whole drawing.
    bounds = im.getchannel('A').point(lambda alpha:255 if alpha>8 else 0).getbbox()
    assert bounds, slug
    art = im.crop(bounds)
    scale = min(1024/art.width,1024/art.height)
    resized = art.resize((round(art.width*scale),round(art.height*scale)),Image.Resampling.LANCZOS)
    framed = Image.new('RGBA',(2048,2048))
    offset = ((2048-resized.width)//2,1536-resized.height)
    framed.alpha_composite(resized,offset)
    revision = '-v2' if slug == 'finn' else ''
    framed.save(REVIEW / f'{slug}-master{revision}.png')
    runtime = framed.resize((1024,1024),Image.Resampling.LANCZOS)
    runtime.save(RUNTIME / f'{slug}-master{revision}.webp',lossless=True,method=6)
    face = framed.crop((730,490,1318,1078)).resize((384,384),Image.Resampling.LANCZOS)
    face.save(RUNTIME / f'{slug}-portrait{revision}.webp',lossless=True,method=6)
    def point(p):
        return [round((offset[0]+(p[0]-bounds[0])*scale)/4,2),round((offset[1]+(p[1]-bounds[1])*scale)/4,2),18,25]
    alpha_bounds = framed.getchannel('A').getbbox()
    padding = [alpha_bounds[0],alpha_bounds[1],2048-alpha_bounds[2],2048-alpha_bounds[3]]
    assert min(padding)>=512,(slug,padding)
    manifest['characters'].append({'id':slug,'name':name,'source':str(source),'alphaBounds':alpha_bounds,'padding':padding,'release':point(release),'catch':point(catch)})
    art.thumbnail((390,650),Image.Resampling.LANCZOS)
    x,y = (i%4)*480,165+(i//4)*780
    board.paste(art,(x+(480-art.width)//2,y+650-art.height),art)
    draw.text((x+240,y+688),name,font=font,fill='#252028',anchor='mm')
board.save(REVIEW / 'all-eight-masters.jpg',quality=94)
(RUNTIME/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(REVIEW/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
data = [{k:character[k] for k in ('id','name','release','catch')} for character in manifest['characters']]
(ROOT/'src/ui/MasterSpriteData.ts').write_text('// Calibrated from the padded chair-free master drawings.\nexport const masterCharacterData = '+json.dumps(data,separators=(',',':'))+' as const;\n')
print(json.dumps({'count':len(SPEC),'review':str(REVIEW),'runtime':str(RUNTIME),'allMinimumPadding':512}))
