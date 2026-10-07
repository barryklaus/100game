"""Compact, fixed-camera animation reels using the exact completed game frames."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,shutil,sys
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT.parent/'output/100next-cast-expansion-animation-v1'
REVIEW=ROOT/'public/new-cast-animation'
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
back=Image.open(ROOT/'public/finn-whole-action-trial/assets/rounded-back.webp').convert('RGBA').resize((18,25),Image.Resampling.LANCZOS)
timeline=[('Blink','blink',240),('Look left','look-left',100),('Look right','look-right',100),('Throw','throw',200),('Receive',None,200),('Tension','danger',250),('Celebrate','celebrate',200),('Tumble','tumble',900)]
groups=[('women',['vera','tess','nadia','dottie']),('men',['malik','hugo','jasper','leon'])]
if '--all' in sys.argv:groups=[('all',sum([ids for _,ids in groups],[]))]
for group,ids in groups:
 data={};drawings={}
 for id in ids:
  folder=ROOT/'public/vera-animation/assets' if id=='vera' else REVIEW/'assets'/id
  data[id]=json.loads((folder/'manifest.json').read_text())
  drawings[id]={check['frame']:Image.open(folder/(check['frame']+'.webp')).convert('RGBA').crop((300,280,1780,1780)).resize((280,284),Image.Resampling.LANCZOS) for check in data[id]['checks']}
 result=[]
 for label,key,hold in timeline:
  sequences={id:data[id]['clips'][key] if key else {'frames':['release','grip','grip','caught','rest'],'durations':[80,80,430,120,100]} for id in ids}
  length=max(sum(seq['durations']) for seq in sequences.values());length=max(length,550) if key=='throw' else length
  for t in range(0,length+hold,40):
   board=Image.new('RGB',(1120,350*((len(ids)+3)//4)),'#152132');d=ImageDraw.Draw(board)
   for index,id in enumerate(ids):
    seq=sequences[id];name=seq['frames'][-1];at=0
    for n,ms in zip(seq['frames'],seq['durations']):
     at+=ms
     if t<at:name=n;break
    x=index%4*280;y=index//4*350;d.text((x+14,y+10),id.title()+' / '+label,font=font,fill='#f4e4c9');tile=drawings[id][name];board.paste(tile,(x,y+50),tile)
    start,finish=(200,550) if key=='throw' else (160,590)
    if (key=='throw' or key is None) and start<=t<finish:
     p=(t-start)/(finish-start);h=data[id]['handoff']['release' if key=='throw' else 'catch'];hand=(h[0]*4,h[1]*4);pile=(1500,1450) if key=='throw' else (550,1450);a,b=(hand,pile) if key=='throw' else (pile,hand)
     px=(a[0]+(b[0]-a[0])*p-300)/1480*280+x;py=(a[1]+(b[1]-a[1])*p-90*math.sin(math.pi*p)-280)/1500*284+50+y
     card=back.rotate(-p*65 if key=='throw' else 7,Image.Resampling.BICUBIC,expand=True);board.paste(card,(round(px-card.width/2),round(py-card.height/2)),card)
   result.append(board)
 path=OUT/('new-'+group+'-animation.gif');result[0].save(path,save_all=True,append_images=result[1:],duration=40,loop=0,optimize=True)
 shutil.copy2(path,REVIEW/(group+'-sample.gif'));print(group,len(result),'frames',path.stat().st_size,'bytes',flush=True)
