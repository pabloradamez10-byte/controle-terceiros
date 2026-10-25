const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),path=require('node:path');
module.exports=function(){
 const request=createRequire(path.resolve(__dirname,'../package.json'));
 return Object.fromEntries(['node:fs/promises','node:path'].map(name=>{
  const target={'node:fs/promises':'./fs-promises.cjs','node:path':'bare-path'}[name];
  return [name,pathToFileURL(request.resolve(target)).href];
 }));
};
