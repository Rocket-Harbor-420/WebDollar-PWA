/*
 * WebDollar PWA - Módulo: offline.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { inspectSignedTransaction } from '../core/transaction.js';
import { bytesToBase64, base64ToBytes } from '../core/webd-format.js';

const PREFIX='webd-pay-v1:';
const ENVELOPE_FORMAT='webdollar-ecash-v2';
const MAX_EXPIRY_BLOCKS=100;
function assertNfc(){
  if(typeof window==='undefined'||typeof window.NDEFReader!=='function')throw new Error('NFC no está disponible en este dispositivo; usa el QR.');
  return new window.NDEFReader();
}
function recordText(record){
  if(record.recordType!=='text'&&record.recordType!=='mime')return '';
  const bytes=record.data instanceof DataView?new Uint8Array(record.data.buffer,record.data.byteOffset,record.data.byteLength):new Uint8Array(record.data);
  if(record.recordType==='text'&&bytes.length){const languageLength=bytes[0]&0x3f;return new TextDecoder().decode(bytes.slice(1+languageLength));}
  return new TextDecoder().decode(bytes);
}
function encodeEnvelope(envelope){return bytesToBase64(new TextEncoder().encode(JSON.stringify(envelope)));}
function decodeEnvelope(value){
  try{return JSON.parse(new TextDecoder().decode(base64ToBytes(value)));}
  catch{throw new Error('Vale offline corrupto o incompatible.');}
}

export const offlineModule={
  id:'offline',name:'Pago offline',usedVouchers:new Set(),usedNonces:new Map(),claimRequested:new Set(),receivedVouchers:new Set(),
  init(core){this.core=core;this.usedVouchers=new Set();this.usedNonces=new Map();this.claimRequested=new Set();this.receivedVouchers=new Set();},
  currentHeight(){return Number(this.core?.getSnapshot?.()?.height||0);},
  prepareEcash(amount,to){
    if(!this.core)throw new Error('Módulo offline no inicializado.');
    const transaction=this.core.prepareOffline({amount,to});
    const currentHeight=this.currentHeight();
    const issuerNonce=transaction.nonce;
    const expiresAtHeight=currentHeight>0?currentHeight+MAX_EXPIRY_BLOCKS:null;
    const envelope={format:ENVELOPE_FORMAT,version:2,voucherId:transaction.txId,issuer:transaction.from,issuerNonce,createdAt:new Date().toISOString(),expiresAtHeight,transaction:transaction.serializedTransactionBase64};
    return {...transaction,issuerNonce,expiresAtHeight,voucherId:transaction.txId,envelope};
  },
  sendViaNFC(amount,to){
    const voucher=this.prepareEcash(amount,to);
    return {transport:'qr',voucher,envelope:voucher.envelope,payload:PREFIX+encodeEnvelope(voucher.envelope)};
  },
  async writeViaNFC(amount,to){
    const packet=this.sendViaNFC(amount,to),reader=assertNfc();
    await reader.write({records:[{recordType:'text',lang:'en',data:packet.payload}]});
    return {...packet,transport:'nfc'};
  },
  async readViaNFC(){
    const reader=assertNfc();
    return new Promise(async(resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;fn(value);};
      reader.onreadingerror=()=>finish(reject,new Error('No se pudo leer la etiqueta NFC.'));
      reader.onreading=event=>{
        try{
          const payload=[...(event.message?.records||[])].map(recordText).find(value=>value.startsWith(PREFIX));
          if(!payload)throw new Error('La etiqueta NFC no contiene un vale WebDollar.');
          finish(resolve,payload);
        }catch(error){finish(reject,error);}
      };
      try{await reader.scan();}catch(error){finish(reject,error);}
    });
  },
  inspect(payload){
    if(typeof payload!=='string'||payload.length>8000||!payload.startsWith(PREFIX))throw new Error('Vale WebDollar no reconocido.');
    const encoded=payload.slice(PREFIX.length);
    let envelope;
    try{envelope=decodeEnvelope(encoded);}catch{
      // v1 payloads carried only the signed transaction. They remain readable,
      // but new vouchers always use the replay-resistant v2 envelope.
      const tx=inspectSignedTransaction(encoded);
      return {tx,envelope:{format:'webdollar-ecash-v1',version:1,voucherId:tx.txId,issuer:tx.from,issuerNonce:tx.nonce,expiresAtHeight:null,transaction:tx.serializedTransactionBase64}};
    }
    if(envelope?.format!==ENVELOPE_FORMAT||envelope.version!==2||typeof envelope.transaction!=='string')throw new Error('Vale offline no reconocido.');
    const tx=inspectSignedTransaction(envelope.transaction);
    if(tx.txId!==envelope.voucherId||tx.from!==envelope.issuer||tx.nonce!==envelope.issuerNonce)throw new Error('Metadatos del vale no corresponden con la firma.');
    return {tx,envelope};
  },
  async verifyOnChain(payload){
    const {tx}=this.inspect(payload);
    if(typeof this.core?.checkTransaction!=='function')return {status:'unavailable',txId:tx.txId};
    try{return {...await this.core.checkTransaction(tx.txId),txId:tx.txId};}
    catch{return {status:'unverified',txId:tx.txId};}
  },
  receiveViaNFC(payload){
    const {tx,envelope}=this.inspect(payload);
    const currentHeight=this.currentHeight();
    if(envelope.expiresAtHeight!==null&&currentHeight>0&&currentHeight>Number(envelope.expiresAtHeight))throw new Error('El vale offline ya caducó en Mainnet.');
    if(tx.to!==this.core.getAddress())throw new Error('El vale está firmado para otra dirección.');
    if(this.usedVouchers.has(envelope.voucherId)||this.receivedVouchers.has(envelope.voucherId))throw new Error('Este vale o nonce ya está registrado en esta sesión.');
    const previousNonce=this.usedNonces.get(envelope.issuer);
    if(previousNonce!==undefined&&Number(envelope.issuerNonce)<=previousNonce)throw new Error('Este vale o nonce ya está registrado en esta sesión.');
    const received=this.core.receiveSigned(tx.serializedTransactionBase64);
    this.usedVouchers.add(envelope.voucherId);this.receivedVouchers.add(envelope.voucherId);this.usedNonces.set(envelope.issuer,Number(envelope.issuerNonce));
    return {...received,issuerNonce:envelope.issuerNonce,expiresAtHeight:envelope.expiresAtHeight,voucherId:envelope.voucherId};
  },
  // Reconnection never broadcasts silently. UI opens the review dialog.
  reclaim(payload){
    const {tx,envelope}=this.inspect(payload);
    const currentHeight=this.currentHeight();
    if(envelope.expiresAtHeight!==null&&currentHeight>0&&currentHeight>Number(envelope.expiresAtHeight))throw new Error('El vale offline ya caducó en Mainnet.');
    if(this.claimRequested.has(envelope.voucherId))throw new Error('Este vale ya tiene un reclamo abierto en esta sesión.');
    const result=this.core.requestClaim(tx.serializedTransactionBase64);this.claimRequested.add(envelope.voucherId);this.usedVouchers.add(envelope.voucherId);return result;
  },
  resetSession(){this.usedVouchers.clear();this.usedNonces.clear();this.claimRequested.clear();this.receivedVouchers.clear();}
};
