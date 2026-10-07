"""Fixed-camera rehearsal GIF from the same complete drawings used in game."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, math, shutil
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-vera-animation-v1'
data=json.loads((OUT/'manifest.json').read_text())
frames={p.stem:Image.open(p).convert('RGBA') for p in (OUT/'frames').glob('*.png')}
back=Image.open(ROOT/'public/finn-whole-action-trial/assets/rounded-back.webp').convert('RGBA')
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',24)
timeline=[('Blink','blink',400),('Look left','look-left',300),('Look right','look-right',300),('Throw','throw',500),('Receive',None,350),('Tension','danger',500),('Celebrate','celebrate',400),('Tumble · feet up','tumble',1400)]
result=[];durations=[]
for label,key,hold in timeline:
    seq=data['clips'][key] if key else {'frames':['release','grip','grip','caught','rest'],'durations':[80,80,430,120,100]}
    end=sum(seq['durations']);end=max(end,550) if key=='throw' else end
    for t in range(0,end+hold,40):
        at=0;name=seq['frames'][-1]
        for n,ms in zip(seq['frames'],seq['durations']):
            at+=ms
            if t<at:name=n;break
        scene=Image.new('RGBA',(2048,2048),(20,29,43,255));scene.alpha_composite(frames[name])
        start,finish=(200,550) if key=='throw' else (160,590)
        if (key=='throw' or key is None) and start<=t<finish:
            p=(t-start)/(finish-start);h=data['handoff']['release' if key=='throw' else 'catch']
            hand=(h[0]*4,h[1]*4);pile=(1500,1450) if key=='throw' else (550,1450)
            a,b=(hand,pile) if key=='throw' else (pile,hand)
            x=a[0]+(b[0]-a[0])*p;y=a[1]+(b[1]-a[1])*p-90*math.sin(math.pi*p)
            tile=back.resize((85,119),Image.Resampling.LANCZOS).rotate(-p*65 if key=='throw' else 7,Image.Resampling.BICUBIC,expand=True)
            scene.alpha_composite(tile,(round(x-tile.width/2),round(y-tile.height/2)))
        canvas=Image.new('RGB',(600,660),(20,29,43));canvas.paste(scene.crop((400,350,1650,1650)).resize((600,624),Image.Resampling.LANCZOS).convert('RGB'),(0,36))
        ImageDraw.Draw(canvas).text((18,8),'Vera  /  '+label,font=font,fill='#f4e4c9')
        result.append(canvas);durations.append(40)
result[0].save(OUT/'vera-animation-sample.gif',save_all=True,append_images=result[1:],duration=durations,loop=0,optimize=True)
shutil.copy2(OUT/'vera-animation-sample.gif',ROOT/'public/vera-animation/sample.gif')
print('Exported fixed-camera animation sample')
