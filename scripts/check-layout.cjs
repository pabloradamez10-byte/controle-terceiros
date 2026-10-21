const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=require('./sources.json');
require('./build.cjs').build(true);
const seen=new Set();
for(const g of manifest.groups){
 for(const f of g.sources){assert.ok(f.startsWith('src/'));assert.ok(!seen.has(f),'Fonte com dois proprietários: '+f);seen.add(f);}
 if(g.target.endsWith('.js'))new vm.Script(fs.readFileSync(path.join(root,g.target),'utf8'),{filename:g.target});
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(!/<script\b[^>]*>\s*[^<\s]/.test(html),'JavaScript voltou ao HTML');
assert.ok(!/<style\b/.test(html),'Estilos voltaram ao HTML');
const targets=manifest.groups.filter(g=>g.target.startsWith('assets/')).map(g=>g.target);
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
for(const file of targets){assert.ok(html.includes('./'+file),'Arquivo fora do HTML: '+file);assert.ok(sw.includes('./'+file),'Arquivo fora do cache público: '+file);}
const scriptFiles=[...html.matchAll(/<script\b[^>]*src="\.\/(assets\/js\/[^"?]+)"/g)].map(m=>m[1]);
assert.deepEqual(scriptFiles,targets.filter(f=>f.endsWith('.js')),'Ordem de carregamento alterada');
console.log('Layout verified: '+seen.size+' source files, syntax, ownership, script order and public cache.');
