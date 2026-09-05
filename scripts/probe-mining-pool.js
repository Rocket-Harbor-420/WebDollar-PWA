import { NativeWebDollarSocket } from '../src/core/native-socket.js';
import { decodeWebdAddress } from '../src/core/webd-format.js';
import { nacl } from '../src/vendor/dependencies.js';

const endpoint='https://pool.timi.ro';
const poolPublicKey=Uint8Array.from('7d863060bc5bf81695f53c5e61c79677ad6cb3b5fd48dafebbabb25f7dca8797'.match(/../g),hex=>parseInt(hex,16));
const address=process.env.WEBD_MINING_ADDRESS;
if(!address)throw new Error('Define WEBD_MINING_ADDRESS con una dirección pública WEBD; no se necesita una clave privada.');
const unencoded=decodeWebdAddress(address);
const hex=value=>Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,part)=>n+part.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
const text=value=>new TextEncoder().encode(String(value));
const socket=new NativeWebDollarSocket(endpoint,{nodeConsensusType:1,timeoutMs:10000});
try{
  await socket.connect();
  const message=new Uint8Array(32);crypto.getRandomValues(message);
  const response=await socket.requestWithBinary('mining-pool/hello-pool',{message,pool:poolPublicKey,minerAddress:address,addresses:[hex(unencoded)]},15000);
  const answer=response.data;
  if(!answer?.result)throw new Error('El pool no aceptó el saludo.');
  const signedMessage=concat(message,text(answer.name),text(answer.fee),text(answer.website),text(JSON.stringify(answer.servers)),text(answer.useSig));
  const signature=answer.signature instanceof Uint8Array?answer.signature:new Uint8Array(answer.signature);
  if(!nacl.sign.detached.verify(signedMessage,signature,poolPublicKey))throw new Error('La firma del pool no valida.');
  socket.sendEvent('mining-pool/hello-pool/answer/confirmation',{result:true});
  const work=answer.work;
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),kind:'read-only-mining-pool-handshake',endpoint,privateWalletAccessed:false,transactionsBroadcast:0,poolName:answer.name,poolUseSignatures:answer.useSig,workDelivered:Boolean(work),height:work?.h??null,workType:work?.h>=2348110?'PoS':'PoW',targetBytes:work?.t?.byteLength??work?.t?.length??null,blockBytes:work?.s?.byteLength??work?.s?.length??null,balanceUnits:Array.isArray(work?.b)?work.b[0]??null:null}));
}finally{socket.close();}
