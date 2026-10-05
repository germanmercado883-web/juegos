"""Bundle dist/ into one self-contained HTML page (model embedded as base64).
Usage: npm run build && python3 scripts/build_single_file.py out.html"""
import re,glob,base64,sys
html=open('dist/index.html').read()
css=open(glob.glob('dist/assets/*.css')[0]).read()
js=open(glob.glob('dist/assets/*.js')[0]).read()
assert '</script' not in js
b64=base64.b64encode(open('dist/models/survivor.glb','rb').read()).decode()
body=re.search(r'<body>(.*)</body>',html,re.S).group(1)
body=re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>','',body)
fonts='<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Teko:wght@500;600&display=swap" rel="stylesheet" />'
extra=":root{color-scheme:dark;background:#0d1216}html,body{height:100%}body{background:#0d1216}"
out=f'<title>Duskvale Battle Royale</title>\n{fonts}\n<style>{extra}\n{css}</style>\n{body}\n<script>window.__SURVIVOR_GLB_B64="{b64}";</script>\n<script type="module">\n{js}\n</script>\n'
open(sys.argv[1],'w').write(out)
print(round(len(out)/1e6,2),'MB')
