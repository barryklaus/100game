"""Export approved full-bleed prints and precomputed suit/glitter masks.

Run with Pillow installed. Native PNG masters stay in output/engraved-deck-v1.
The game uses lossless WebP at one uniform playing-card aspect ratio.
"""
from pathlib import Path
import hashlib
import json
import random
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/engraved-deck-v1'
DEST = ROOT / 'public/assets/cards/engraved-v1'
WIDTH, HEIGHT = 1064, 1486
SUITS = ['fire', 'water', 'leaf', 'sun']
RANKS = ['a', '2', '3', '4', '5', '6', 'k', '7', '8', '9', '10']
SPECIAL = {'7': 'CHOOSE', '8': 'REVERSE', '9': 'ZERO', '10': 'DEDUCT'}

def colored(suit, r, g, b):
    if suit == 'fire': return r > 65 and r > g*1.8 and r > b*1.65
    if suit == 'water': return b > 50 and b > r*1.3 and b > g*1.13
    if suit == 'leaf': return g > 40 and g > r*1.16 and g > b*1.22
    return r > 90 and g > 65 and r > b*1.65 and g > b*1.35 and r > g*1.06 and g > r*.52

DEST.mkdir(parents=True, exist_ok=True)
(DEST/'foil').mkdir(exist_ok=True)
artworks = []
for rank in RANKS:
    for suit in SUITS:
        key = f'{suit}-{rank}'
        source = SOURCE/'cards'/f'{key}.webp'
        image = Image.open(source).convert('RGB').resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
        destination = DEST/f'{key}.webp'
        image.save(destination,lossless=True,method=6)
        entry = {'key':key,'suit':suit,'rank':rank,'index':SPECIAL.get(rank, '1' if rank=='a' else '10' if rank=='k' else rank),
                 'special':rank in SPECIAL,'url':f'assets/cards/engraved-v1/{key}.webp',
                 'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
        if rank in SPECIAL:
            # Half-size masks preserve the flecks without runtime readbacks or noise generation.
            art = image.resize((532,743),Image.Resampling.LANCZOS)
            rng = random.Random(7319)
            noise = [rng.random() for _ in range(178*248)]
            alpha = []
            for i,(r,g,b) in enumerate(art.getdata()):
                n = noise[(i%532)//3+(i//532//3)*178]
                alpha.append(round(110+(n-.77)/.23*145) if colored(suit,r,g,b) and n>.77 else 0)
            mask = Image.new('RGBA',art.size,(255,255,255,0))
            channel = Image.new('L',art.size); channel.putdata(alpha); mask.putalpha(channel)
            mask.save(DEST/'foil'/f'{key}.png',optimize=True)
            entry['foilMask'] = f'assets/cards/engraved-v1/foil/{key}.png'
        artworks.append(entry)
        print(key,flush=True)
(DEST/'manifest.json').write_text(json.dumps({'version':'engraved-v1','width':WIDTH,'height':HEIGHT,'encoding':'lossless WebP',
    'physicalCards':52,'uniqueFaces':44,'holo':'special cards; suit-colored details only','parallax':False,'artworks':artworks},indent=2)+'\n')
