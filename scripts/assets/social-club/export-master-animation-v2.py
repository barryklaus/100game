"""Export complete master-derived animation sets and uniform padded sources."""
from pathlib import Path
import argparse, json, shutil
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT.parent/'output/100next-master-branch-v2'
PUBLIC=ROOT/'public/assets/social-club/master-branch-review-v2'
SHEETS=SOURCE/'padded-sheets'
NAMES=['vince','finn','june','edgar','roxie','otis','paloma','bianca']
GROUPS={
 'reactions':['rest','blink-half','blink','left-mid','left','right-mid','right','down-mid','down'],
 'emotions':['nervous','panic-soft','panicked','shock-soft','shocked','amused','smug','relieved','frustrated','defeated','delighted'],
 'card-actions':['prepare-soft','prepare','throw-edge','release','settle','reach'],
 'tumble':['tumble-start','recoil','fall-start','midfall','airfall','airfall-low','floor','impact','bounce'],
}

def sheet(slug,group,names):
    cols=3;rows=(len(names)+cols-1)//cols
    canvas=Image.new('RGBA',(cols*3072,rows*3072));checks=[]
    for index,name in enumerate(names):
        frame=Image.open(SOURCE/slug/(name+'.png')).convert('RGBA')
        assert frame.size==(2048,2048)
        x=index%cols*3072+512;y=index//cols*3072+512
        canvas.paste(frame,(x,y))
        assert canvas.crop((x,y,x+2048,y+2048)).tobytes()==frame.tobytes()
        bounds=frame.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
        clearance=512+min(bounds[0],bounds[1],2048-bounds[2],2048-bounds[3])
        assert clearance>=768,(slug,name,bounds)
        checks.append({'frame':name,'cell':index,'clearance':clearance})
    file=SHEETS/f'{slug}-{group}-3072.png'
    canvas.save(file,compress_level=6)
    file.with_suffix('.json').write_text(json.dumps({'cellSize':3072,'columns':cols,'rows':rows,'addedPadding':512,'artworkPixelScale':1,'registrationAnchor':[1536,1622],'frames':checks},indent=2)+'\n')

def export(slug):
    data=json.loads((SOURCE/slug/'manifest.json').read_text())
    target=PUBLIC/slug;target.mkdir(parents=True,exist_ok=True)
    referenced=set(['rest'])
    for clip in data['clips'].values():
        assert len(clip['frames'])==len(clip['durations'])
        assert all(ms>0 for ms in clip['durations'])
        referenced.update(clip['frames'])
    for name in sorted(referenced):
        frame=Image.open(SOURCE/slug/(name+'.png')).convert('RGBA')
        frame.save(target/(name+'.webp'),lossless=True,exact=True,method=6)
        decoded=Image.open(target/(name+'.webp')).convert('RGBA')
        visible=np.array(frame.getchannel('A'))>0
        assert np.array_equal(np.array(frame)[visible],np.array(decoded)[visible]),(slug,name,'lossless export mismatch')
    for group,names in GROUPS.items():sheet(slug,group,names)
    (target/'checks.json').write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({'character':slug,'completeFrames':len(referenced),'clips':len(data['clips']),'lossless':True,'sheetCell':3072}),flush=True)
    return {'id':slug,'name':slug.title(),'clips':data['clips'],'emotions':data['emotions']}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('characters',nargs='*');args=parser.parse_args()
    PUBLIC.mkdir(parents=True,exist_ok=True);SHEETS.mkdir(parents=True,exist_ok=True)
    chosen=args.characters or NAMES
    for slug in chosen:export(slug)
    characters=[]
    for slug in NAMES:
        file=PUBLIC/slug/'checks.json'
        if file.exists():
            data=json.loads(file.read_text());characters.append({'id':slug,'name':slug.title(),'clips':data['clips'],'emotions':data['emotions']})
    (PUBLIC/'manifest.json').write_text(json.dumps({'status':'Complete master-derived animation sets; activated in 100next gameplay.','nativeFrameSize':2048,'authoringCellSize':3072,'characters':characters,'corePolicy':'Every pixel outside calibrated eye/mouth areas and all alpha match the original master.','actionPolicy':'Actual master head and lower body unchanged. Active hand/card region composited.','tumblePolicy':'Original master head painting at physical scale 1 on calibrated new falling body poses.','framePolicy':'One flattened complete character per frame; no separated runtime parts.','throwReleaseMs':320,'pickupCatchMs':340},indent=2)+'\n')
    for name in ['generation-plan.json','generation-results.json']:
        if (SOURCE/name).exists():shutil.copy2(SOURCE/name,PUBLIC/name)
