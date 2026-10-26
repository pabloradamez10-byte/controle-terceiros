import {mkdir,open,rename,readFile,lstat,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import sodium from 'sodium-native';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';

export const hex=value=>b4a.toString(value,'hex');
export async function privateJSON(file,value,{exclusive=false}={}){
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const serialized=JSON.stringify(value);
  if(exclusive){
    const handle=await open(file,'wx',0o600);
    let completed=false;
    try{
      await handle.writeFile(serialized);await handle.sync();completed=true;
    }finally{
      await handle.close();
      if(!completed)try{await unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    return;
  }
  const temporary=file+'.'+hex(crypto.randomBytes(8))+'.tmp';
  const handle=await open(temporary,'wx',0o600);
  try{
    try{await handle.writeFile(serialized);await handle.sync();}finally{await handle.close();}
    await rename(temporary,file);
  }finally{try{await unlink(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
export function invalidPrivateMode(stat){return globalThis.process?.platform!=='win32'&&globalThis.Bare?.platform!=='win32'&&!!(stat.mode&0o077);}
export async function readPrivateJSON(file,max=64*1024*1024){
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||invalidPrivateMode(stat)||stat.size>max)throw Error('Arquivo privado inválido.');
  return JSON.parse(await readFile(file,'utf8'));
}
export function seal(value,key,context){
  const nonce=crypto.randomBytes(24),plain=b4a.from(JSON.stringify(value));
  const cipher=b4a.alloc(plain.length+16);
  try{sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(cipher,plain,b4a.from(context),null,nonce,key);}
  finally{plain.fill(0);}
  return {format:'sst-sealed-v1',nonce:hex(nonce),ciphertext:hex(cipher)};
}
export function unseal(entry,key,context){
  if(entry?.format!=='sst-sealed-v1'||!/^[a-f0-9]{48}$/.test(entry.nonce)||typeof entry.ciphertext!=='string'||entry.ciphertext.length<32||entry.ciphertext.length>128*1024*1024||entry.ciphertext.length%2||!/^[a-f0-9]+$/.test(entry.ciphertext))throw Error('Arquivo cifrado inválido.');
  const plain=b4a.alloc(entry.ciphertext.length/2-16);
  try{sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(plain,null,b4a.from(entry.ciphertext,'hex'),b4a.from(context),b4a.from(entry.nonce,'hex'),key);return JSON.parse(b4a.toString(plain));}
  finally{plain.fill(0);}
}
export class SealedStore{
  constructor(directory,key,context){this.directory=directory;this.key=b4a.from(key);this.context=context;}
  file(id){if(typeof id!=='string'||!/^[a-f0-9]{16,128}$/.test(id))throw Error('Identificador privado inválido.');return path.join(this.directory,id+'.json');}
  async put(id,value,options){return privateJSON(this.file(id),seal(value,this.key,this.context+':'+id),options);}
  async get(id){return unseal(await readPrivateJSON(this.file(id)),this.key,this.context+':'+id);}
  async ids(){try{return(await readdir(this.directory)).filter(f=>/^[a-f0-9]{16,128}\.json$/.test(f)).map(f=>f.slice(0,-5));}catch(e){if(e.code==='ENOENT')return[];throw e;}}
  close(){this.key.fill(0);}
}
