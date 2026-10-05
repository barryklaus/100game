"""Embed the repaired Finn drawings in the existing in-chat review."""
from pathlib import Path
import base64, json, sys
from PIL import Image

root=Path(__file__).resolve().parents[3]
out=root.parent/'output/100next-simple-animation-v2'
manifest=json.loads((root/'public/assets/social-club/simple-v2/finn-manifest.json').read_text())
preview_image=out/'finn-preview-atlas.webp'
Image.open(root/'public/assets/social-club/simple-v2/finn-atlas.webp').save(preview_image,quality=82,method=6)
labels={'tumble':'Overflow tumble','return':'Get back up','throw':'Throw card','pickup':'Pick up card','expressions':'Expressions','idle':'Blink','study':'Study cards','look-left':'Look left','look-right':'Look right','choose-left':'Choose left','choose-right':'Choose right','danger':'Nervous / panic','celebrate':'Celebrate','defeat':'Defeat','startle':'Startle'}
clips={key:{'label':labels[key],'frames':[f['index'] for f in clip['frames']],'durations':clip['durations']} for key,clip in manifest['clips'].items()}
data={'clips':clips,'atlas':'data:image/webp;base64,'+base64.b64encode(preview_image.read_bytes()).decode()}
template=(Path(__file__).parent/'finn-scale-preview-template.html').read_text()
target=Path(sys.argv[1])
target.write_text(template.replace('__FINN_SCALE_DATA__',json.dumps(data,separators=(',',':'))))
assert target.stat().st_size<1_000_000
print(json.dumps({'path':str(target),'bytes':target.stat().st_size}))
