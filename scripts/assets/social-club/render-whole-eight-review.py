"""Render chat GIFs from exported complete character frames and manifests."""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/whole-eight-actions'
CAST=['finn','june','edgar','otis','roxie','vince','paloma','bianca']
BACK=Image.open(ROOT/'public/finn-whole-action-trial/assets/rounded-back.webp').convert('RGBA')
FONT=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',20)

def load(character):
    base=ROOT/('public/finn-whole-action-trial/assets' if character=='finn' else 'public/whole-character-actions/assets/'+character)
    data=json.loads((base/'manifest.json').read_text())
    frames={key:Image.open(base/(key+'.webp')).convert('RGBA') for clip in data['clips'].values() for key in clip['frames']}
    return data,frames

def render(character,action,t,size=340):
    data,frames=LOADED[character];clip=data['clips'][action];s=size/1080;camera=(484,410,1564,1490)
    index=5;end=0
    for i,ms in enumerate(clip['durations']):
        end+=ms
        if t<end:index=i;break
    im=Image.new('RGB',(size,size),'#15202e')
    pose=frames[clip['frames'][index]].crop(camera).resize((size,size),Image.Resampling.LANCZOS);im.paste(pose,(0,0),pose)
    def xy(x,y):return ((x-camera[0])*s,(y-camera[1])*s)
    draw=ImageDraw.Draw(im)
    draw.ellipse((*xy(104,1060),*xy(1944,2120)),fill='#0c1926',outline='#b28649',width=2)
    draw.ellipse((*xy(144,1085),*xy(1904,2095)),outline='#b28649',width=1)
    def card(x,y,angle=7):
        c=BACK.resize((round(75*s),round(105*s)),Image.Resampling.LANCZOS).rotate(-angle,Image.Resampling.BICUBIC,expand=True)
        x,y=xy(x,y);im.paste(c,(round(x-c.width/2),round(y-c.height/2)),c)
    for x in [680,1470]:card(x,1300)
    if clip['flight'][0]<=t<clip['flight'][1]:
        p=(t-clip['flight'][0])/(clip['flight'][1]-clip['flight'][0])
        a,b=(clip['hand'],clip['pile']) if action=='throw' else (clip['pile'],clip['hand'])
        card(a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p-math.sin(math.pi*p)*130,p*120 if action=='throw' else 10)
    return im

if __name__=='__main__':
    LOADED={c:load(c) for c in CAST}
    for character in CAST:
        seq=[]
        for t in range(0,1600,40):
            frame=Image.new('RGB',(700,390),'#0b111b');d=ImageDraw.Draw(frame)
            for i,action in enumerate(['throw','receive']):
                frame.paste(render(character,action,t),(i*350+5,40));d.text((i*350+14,10),character.title()+' / '+action.title(),font=FONT,fill='#e8cc86')
            seq.append(frame)
        seq[0].save(OUT/(character+'-actions.gif'),save_all=True,append_images=seq[1:],duration=40,loop=0,disposal=2)
    for action in ['throw','receive']:
        seq=[]
        for t in range(0,1600,40):
            frame=Image.new('RGB',(1040,590),'#0b111b');d=ImageDraw.Draw(frame)
            for i,c in enumerate(CAST):
                x=i%4*260;y=i//4*295
                frame.paste(render(c,action,t,250),(x+5,y+35));d.text((x+14,y+8),c.title()+' · '+action,font=FONT,fill='#e8cc86')
            seq.append(frame)
        seq[0].save(OUT/('all-eight-'+action+'.gif'),save_all=True,append_images=seq[1:],duration=40,loop=0,disposal=2)
    print('Rendered eight paired previews and two cast GIFs')
