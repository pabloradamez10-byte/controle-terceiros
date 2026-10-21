"""Run on an approved internet-connected preparation machine; verifies pinned bytes."""
import concurrent.futures, hashlib, json, pathlib, sys, urllib.request
lock=json.loads((pathlib.Path(__file__).parent/'assets-lock.json').read_text())
target=pathlib.Path(sys.argv[1]);target.mkdir(parents=True,exist_ok=True)
def download(item):
    data=urllib.request.urlopen(item['url'],timeout=60).read()
    if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:
        raise RuntimeError('Hash divergente: '+item['path'])
    dest=target/item['path'];dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download,lock['files']))
print('Dependências verificadas:',len(lock['files']))
