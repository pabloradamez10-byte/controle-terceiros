import BlindPairing from 'blind-pairing';
import {CandidateRequest,MemberRequest,createInvite} from 'blind-pairing-core';
import Hyperswarm from 'hyperswarm';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import canonicalize from 'canonicalize';
import qrcode from 'qrcode-generator';
import {hex} from './sealed-store.mjs';
import {validKey,ROLES} from '../../backend/p2p/protocol.mjs';

const WIRE='sst-link-v1',MAX=16000;
const bytes=value=>b4a.from(value,'hex');
function decode(value){if(typeof value!=='string'||value.length>MAX||!/^[a-f0-9]+$/.test(value)||value.length%2)throw Error('Convite ou resposta inválidos.');return bytes(value);}
function sas(id,data){return hex(crypto.hash(b4a.concat([id,data]))).slice(0,12).match(/.{4}/g).join('-');}
function verify(data){
  const {signature,...body}=JSON.parse(b4a.toString(data));
  if(body.format!==WIRE||!validKey(body.writer)||!validKey(body.userKey)||!validKey(body.transportKey)||!validKey(body.nonce)||typeof body.name!=='string'||!/^[a-z0-9@._-]{3,120}$/i.test(body.name)||typeof body.label!=='string'||body.label.length<1||body.label.length>80||typeof signature!=='string'||!/^[a-f0-9]{128}$/.test(signature)||!crypto.verify(b4a.from(canonicalize(body)),bytes(signature),bytes(body.userKey)))throw Error('Pedido de vinculação inválido.');
  return body;
}
export class Pairing{
  constructor({clock=Date.now,networkOptions={}}={}){this.clock=clock;this.options=networkOptions;this.invite=null;this.pending=new Map();this.candidate=null;this.expires=null;}
  network(){if(!this.blind){this.swarm=new Hyperswarm(this.options);this.swarm.on('error',()=>{});this.blind=new BlindPairing(this.swarm,{poll:5000});}return this.blind;}
  create(group,transportKey){
    if(this.invite&&!this.invite.used&&this.clock()<this.invite.expiresAt)throw Error('Cancele o convite anterior antes de criar outro.');
    for(const id of this.pending.keys())this.deny(id);
    this.invite?.seed?.fill(0);this.invite?.invite?.fill(0);
    const entry=createInvite(bytes(group),{data:b4a.from(JSON.stringify({sponsorTransport:transportKey}))}),expiresAt=this.clock()+10*60*1000;
    this.invite={...entry,expiresAt,used:false};
    const text=WIRE+':'+hex(entry.invite),qr=qrcode(0,'M');qr.addData(text);qr.make();
    return {code:text,qrDataUrl:qr.createDataURL(3,12),expiresAt};
  }
  listen(){
    if(this.member)return;
    this.member=this.network().addMember({discoveryKey:this.invite.discoveryKey,onadd:request=>this.receive(request)});
  }
  receive(request){
    const invite=this.invite;
    if(!invite||invite.used||this.clock()>=invite.expiresAt||!b4a.equals(request.inviteId,invite.id)||this.pending.size>=8){request.deny();return Promise.resolve();}
    try{request.open(invite.publicKey);}catch{request.deny();return Promise.resolve();}
    let data;try{data=verify(request.userData);}catch{request.deny();return Promise.resolve();}
    const id=hex(request.id),code=sas(request.inviteId,request.userData);
    if(this.pending.has(id))return this.pending.get(id).waiting;
    let finish;const waiting=new Promise(resolve=>finish=resolve);
    const row={request,data,id,code,finish,waiting,expiresAt:invite.expiresAt};this.pending.set(id,row);
    row.timer=setTimeout(()=>{this.pending.delete(id);request.deny();finish();},Math.max(1,invite.expiresAt-this.clock()));row.timer.unref?.();
    return waiting;
  }
  requests(){return [...this.pending.values()].map(({id,code,data,expiresAt})=>({id,code,label:data.label,name:data.name,expiresAt}));}
  async approve(id,code,role,userRole,device,session){
    const user=await session.require();
    if(user.role!=='admin'||await device.role()!=='admin')throw Error('Somente administrador vincula aparelhos.');
    const row=this.pending.get(id),invite=this.invite;
    if(!row||!invite||invite.used||this.clock()>=row.expiresAt||row.code!==code||!ROLES.includes(role)||!ROLES.includes(userRole))throw Error('Confira o código ou crie outro convite.');
    // Mark in memory before any await; the signed log also rejects a reused invitation.
    invite.used=true;
    const result=await device.append({kind:'enroll',writer:row.data.writer,userKey:row.data.userKey,transportKey:row.data.transportKey,inviteId:hex(invite.id),name:row.data.name,label:row.data.label,role,userRole});
    if(!result.accepted||!result.finalized){row.request.deny();row.finish();throw Error('Vinculação não confirmada pelo núcleo. Crie outro convite.');}
    row.request.confirm({key:bytes(device.baseKey),encryptionKey:bytes(device.secret),additional:invite.additional});
    clearTimeout(row.timer);this.pending.delete(id);row.finish();
    return {approved:true,response:hex(row.request.response)};
  }
  deny(id){const row=this.pending.get(id);if(row){clearTimeout(row.timer);row.request.deny();row.finish();this.pending.delete(id);}return {denied:true};}
  prepare(code,{writer,transportKey,identity,name,label}){
    if(this.candidate)throw Error('Cancele o pedido anterior.');
    if(typeof code!=='string'||!code.startsWith(WIRE+':'))throw Error('Convite incompatível.');
    const body={format:WIRE,writer,transportKey,userKey:hex(identity.publicKey),name:name.trim().toLowerCase(),label,nonce:hex(crypto.randomBytes(32))};
    const signature=hex(crypto.sign(b4a.from(canonicalize(body)),identity.secretKey));
    const request=new CandidateRequest(decode(code.slice(WIRE.length+1)),b4a.from(canonicalize({...body,signature})));
    this.candidate={request,code:sas(request.inviteId,request.userData),state:'prepared'};
    return this.candidateStatus();
  }
  candidateStatus(){const row=this.candidate;return row?{state:row.state,code:row.code,request:hex(row.request.encode())}:null;}
  submit(code,online=true){
    const row=this.candidate;if(!row||row.state!=='prepared'||row.code!==code)throw Error('Confira o código antes de continuar.');
    row.state='waiting';row.online=online;if(!online)return this.candidateStatus();this.client=this.network().addCandidate(row.request,{onadd:auth=>{row.auth=auth;row.state='accepted';}});
    this.client.pairing.catch(()=>{row.state='failed';});return this.candidateStatus();
  }
  response(value){const row=this.candidate;if(!row||row.state!=='waiting')throw Error('Pedido não confirmado neste aparelho.');const auth=row.request.handleResponse(decode(value));if(!auth)throw Error('Resposta inválida ou negada.');row.auth=auth;row.state='accepted';return this.candidateStatus();}
  auth(){const row=this.candidate;if(row?.state!=='accepted'||!row.auth?.key||!row.auth?.encryptionKey)throw Error('Aguarde a autorização do administrador.');return row.auth;}
  async close(){for(const id of this.pending.keys())this.deny(id);await this.blind?.close();await this.swarm?.destroy();this.candidate?.request.destroy();this.blind=null;this.swarm=null;this.member=null;this.client=null;this.candidate=null;this.invite?.seed?.fill(0);this.invite?.invite?.fill(0);this.invite=null;}
}
