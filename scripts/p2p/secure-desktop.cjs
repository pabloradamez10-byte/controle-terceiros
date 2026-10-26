const {mkdir,chmod}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
module.exports=async function secureDesktopDirectory(directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 if(process.platform==='win32'){
  const identity=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8'});
  const sid=identity.match(/S-1-5-[0-9-]+/);if(!sid)throw Error('Não foi possível identificar a conta do Windows.');
  execFileSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+sid[0]+':(OI)(CI)F'],{stdio:'ignore'});
 }else await chmod(directory,0o700);
};
