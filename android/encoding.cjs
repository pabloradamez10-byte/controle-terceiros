// Bare only supplies UTF-8; the shared byte validator also requests latin1.
const NativeDecoder=globalThis.TextDecoder;
globalThis.TextDecoder=class extends NativeDecoder{
 constructor(label='utf-8',options){
  const latin=['latin1','iso-8859-1','windows-1252'].includes(String(label).toLowerCase());
  super(latin?'utf-8':label,options);this.latin=latin;
 }
 decode(input,options){
  if(!this.latin)return super.decode(input,options);
  const bytes=input?new Uint8Array(input.buffer??input,input.byteOffset??0,input.byteLength??input.length):new Uint8Array(0);
  let value='';for(let offset=0;offset<bytes.length;offset+=8192)value+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return value;
 }
};
