"""Fetch the pinned upstream Android runtime, verify before extracting."""
import hashlib, io, pathlib, urllib.request, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
url='https://github.com/holepunchto/bare-kit/releases/download/v2.5.5/prebuilds.zip'
expected='fc68740347c8532ba49d45bf61fae9ca1f1040dc7d6c99f2f92dc30c40e84e46'
import sys
if len(sys.argv)>1: payload=pathlib.Path(sys.argv[1]).read_bytes()
else:
    with urllib.request.urlopen(url,timeout=120) as response: payload=response.read()
if hashlib.sha256(payload).hexdigest()!=expected: raise SystemExit('Bare Kit checksum mismatch')
with zipfile.ZipFile(io.BytesIO(payload)) as archive:
    for item in archive.infolist():
        if not item.filename.startswith('android/bare-kit/'): continue
        relative=pathlib.PurePosixPath(item.filename).relative_to('android')
        if '..' in relative.parts: raise SystemExit('Invalid runtime path')
        output=root/'app/libs'/relative
        if item.is_dir(): output.mkdir(parents=True,exist_ok=True)
        else:
            output.parent.mkdir(parents=True,exist_ok=True)
            output.write_bytes(archive.read(item))
print('Bare Kit 2.5.5 verified and Android runtime prepared.')
