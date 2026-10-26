const fs=require('node:fs'),path=require('node:path'),Bundle=require('bare-bundle');
const root=path.resolve(__dirname,'..'),bundle=Bundle.from(fs.readFileSync(path.join(root,'app/src/main/assets/core.bundle')));
for(const abi of ['arm64-v8a','x86_64'])for(const addon of bundle.addons){
 if(!addon.startsWith('linked:'))throw Error('Android addon not linked: '+addon);
 const name=addon.slice(7);if(name!==path.basename(name)||!fs.existsSync(path.join(root,'app/src/main/addons',abi,name)))throw Error('Missing Android addon: '+abi+'/'+name);
}
console.log('Android addon inventory verified for both ABIs:',bundle.addons.length);
