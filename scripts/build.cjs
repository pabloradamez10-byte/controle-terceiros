// Source order is explicit: legacy globals share their original script scope.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),manifest=require('./sources.json');
function build(check=false){
 for(const group of manifest.groups){
  const content=group.sources.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('');
  const target=path.join(root,group.target);
  if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error('Execute npm run build: '+group.target);}
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
 }
}
module.exports={build};
if(require.main===module){build(process.argv.includes('--check'));console.log('Source assembly '+(process.argv.includes('--check')?'verified.':'completed.'));}
