"""Export reviewed display calibration; never resample the complete pose images."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[3]
source = ROOT / 'public/assets/social-club/special-throw-registration-v2.json'
review = json.loads(source.read_text())
registrations = {key: data['registration'] for key, data in review['characters'].items()}
header = '// Generated from the reviewed head/eye calibration by register-special-throws.py.\n'
header += '// One uniform transform per complete character sequence; never fit individual silhouettes.\n'
payload = 'export const specialThrowRegistration: Record<string, readonly [number, number, number]> = '
(ROOT / 'src/ui/SpecialThrowRegistration.ts').write_text(header + payload + json.dumps(registrations, separators=(',', ':')) + ';\n')
print(f'Exported {len(registrations)} reviewed Special Throw registrations.')
