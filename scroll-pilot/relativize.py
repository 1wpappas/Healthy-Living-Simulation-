# Make the Next static export work from any folder (artifact preview): absolute /_next/ -> ./_next/
import pathlib, re, shutil, sys
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if dst.exists(): shutil.rmtree(dst)
shutil.copytree(src, dst)
for p in list(dst.rglob('*.html')) + list(dst.rglob('*.txt')):
    s = p.read_text(); s = s.replace('"/_next/', '"./nx/').replace('\\"/_next/', '\\"./nx/').replace("'/_next/", "'./nx/"); p.write_text(s)
(dst / '_next').rename(dst / 'nx')   # the artifact host reserves names starting with "_"
for p in dst.glob('nx/static/chunks/*.js'):
    s = p.read_text(); n = s.count('"/_next/"'); s = s.replace('"/_next/"', '"./nx/"'); p.write_text(s)
    if n: print('patched', p.name, n)
for p in dst.rglob('*.js'):   # the artifact host refuses a literal U+FFFD; escape it (it only appears inside string literals)
    s = p.read_text()
    if '�' in s: p.write_text(s.replace('�', '\\ufffd'))
