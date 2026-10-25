// Bare FileHandle lacks readFile/writeFile. Keep operations on the exclusive fd.
const fs=require('bare-fs/promises'),b4a=require('b4a');
exports.mkdir=fs.mkdir;exports.lstat=fs.lstat;exports.chmod=fs.chmod;exports.readFile=fs.readFile;
exports.open=async function(...args){
 const handle=await fs.open(...args);
 handle.writeFile=async data=>{
  const bytes=typeof data==='string'?b4a.from(data):data;
  for(let offset=0;offset<bytes.length;){const {bytesWritten}=await handle.write(bytes.subarray(offset));if(!bytesWritten)throw Error('Escrita incompleta.');offset+=bytesWritten;}
 };
 handle.readFile=async options=>{
  const stat=await handle.stat();if(stat.size>8192)throw Error('Credencial excede o limite.');
  const bytes=b4a.alloc(stat.size);let offset=0;
  while(offset<bytes.length){const {bytesRead}=await handle.read(bytes.subarray(offset));if(!bytesRead)break;offset+=bytesRead;}
  const result=bytes.subarray(0,offset),encoding=typeof options==='string'?options:options?.encoding;
  return encoding?b4a.toString(result,encoding):result;
 };
 return handle;
};
