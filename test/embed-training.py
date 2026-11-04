# Embeds the training cases as a JSON data block immediately before the main <script> tag.
import json, os, re
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'training')
src = open(p, encoding='utf-8').read()
data = {}
for f in sorted(os.listdir(d)):
    if not f.endswith('.json'): continue
    o = json.load(open(os.path.join(d, f), encoding='utf-8'))
    data[o['settingId']] = o
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
# a JSON script block must not contain the sequence "</script" (case-insensitive); escape defensively
blob = re.sub(r'</(script)', r'<\\/\1', blob, flags=re.I)
block = '<script type="application/json" id="training-data">' + blob + '</script>\n'
# replace an existing block or insert before the main script
if 'id="training-data"' in src:
    src = re.sub(r'<script type="application/json" id="training-data">.*?</script>\n', lambda m: block, src, count=1, flags=re.S)
else:
    i = src.index('<script>\n')
    src = src[:i] + block + src[i:]
open(p, 'w', encoding='utf-8').write(src)
print('embedded', list(data.keys()), 'bytes', len(blob))
