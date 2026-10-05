"""Restore original full-resolution character art without drawing or rescaling."""
from pathlib import Path
import json
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT.parent / 'output/100next-character-masters/chair-free-v1'
TARGET = ROOT / 'public/assets/social-club/masters-native-v1'
NAMES = ['vince','finn','june','edgar','roxie','otis','paloma','bianca']
TARGET.mkdir(parents=True,exist_ok=True)
records=[]
for name in NAMES:
    source=SOURCE / f'{name}-master{"-v2" if name=="finn" else ""}.png'
    original=Image.open(source).convert('RGBA')
    assert original.size==(2048,2048)
    destination=TARGET / f'{name}-master.webp'
    original.save(destination,lossless=True,exact=True,method=6)
    decoded=Image.open(destination).convert('RGBA')
    assert decoded.size==original.size
    before=np.array(original);after=np.array(decoded)
    assert np.array_equal(before[:,:,3],after[:,:,3])
    visible=before[:,:,3]>0
    assert np.array_equal(before[visible],after[visible]),'Visible artwork must stay pixel-identical'
    records.append({'id':name,'source':str(source),'asset':destination.name,'size':original.size,'alphaBounds':original.getchannel('A').getbbox(),'bytes':destination.stat().st_size,'lossless':True})
(TARGET/'manifest.json').write_text(json.dumps({'status':'approved original masters; animation replacement under review','rescaled':False,'characters':records},indent=2)+'\n')
print('Exported eight native 2048px masters; visible pixels and alpha verified unchanged.')
