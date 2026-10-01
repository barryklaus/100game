"""Pack generated equal 3x3 cells with transparent sampling gutters; no art retouching."""
import argparse
from pathlib import Path
from PIL import Image
p = argparse.ArgumentParser()
p.add_argument('source')
p.add_argument('output')
a = p.parse_args()
im = Image.open(a.source).convert('RGBA')
if im.width != im.height:
    raise ValueError('Character atlas must be square.')
if im.getchannel('A').getextrema() != (0, 255):
    raise ValueError('Character atlas requires true transparency.')
cell = round(im.width / 3)
# A transparent inset prevents adjacent cells bleeding at fractional CSS sizes.
packed = Image.new('RGBA', (cell * 3, cell * 3))
for y in range(3):
    for x in range(3):
        region = im.crop((round(x*im.width/3)+2, round(y*im.height/3)+2,
                          round((x+1)*im.width/3)-2, round((y+1)*im.height/3)-2))
        if not region.getchannel('A').getbbox():
            raise ValueError(f'Empty frame {x},{y}.')
        packed.paste(region.resize((cell-4,cell-4),Image.Resampling.LANCZOS), (x*cell+2,y*cell+2))
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
packed.save(a.output, format='WEBP',quality=90,method=6)
print(f'{a.output}: {packed.width}×{packed.height}, {Path(a.output).stat().st_size:,} bytes')
