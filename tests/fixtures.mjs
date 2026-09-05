// Public RFC8032 test vector. Never fund this address. Tests only, not app state.
import { createPrivateKey,createPublicKey,createHash } from 'node:crypto';
import { encodeWebdAddress,privateKeyWif,bytesToHex } from '../src/core/webd-format.js';
export function fixtureAccount(){
  const seed=Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex');
  const privateKey=createPrivateKey({format:'der',type:'pkcs8',key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed])});
  const publicKey=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32);
  const unencodedAddress=createHash('ripemd160').update(createHash('sha256').update(publicKey).digest()).digest();
  return {publicKey:new Uint8Array(publicKey),secretKey:new Uint8Array(Buffer.concat([seed,publicKey])),unencodedAddress:new Uint8Array(unencodedAddress),address:encodeWebdAddress(unencodedAddress)};
}
export function fixtureFile(){
  const a=fixtureAccount();
  const text=JSON.stringify({version:'0.1',address:a.address,publicKey:bytesToHex(a.publicKey),privateKey:bytesToHex(privateKeyWif(a.secretKey))});
  const bytes=new TextEncoder().encode(text);
  return {name:'PUBLIC-TEST-VECTOR-NO-FUNDS.webd',size:bytes.length,bytes,arrayBuffer:async()=>bytes.slice().buffer};
}
export const fixtureSnapshot=address=>({address,balance:333,nonce:0,height:2000000,synchronized:true,source:'TEST-ONLY',fetchedAt:Date.now()});
