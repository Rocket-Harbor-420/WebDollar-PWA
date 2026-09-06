/*
 * WebDollar PWA - Módulo: offline.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { inspectSignedTransaction } from '../core/transaction.js';
const PREFIX='webd-pay-v1:';
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
export const offlineModule={
  id:'offline',name:'Pago offline',
  init(core){this.core=core;},
  prepareEcash(amount,to){
    if(!this.core)throw new Error('Módulo offline no inicializado.');
    return this.core.prepareOffline({amount,to});
  },
  sendViaNFC(amount,to){
    const voucher=this.prepareEcash(amount,to);
    return {transport:'qr',voucher,payload:PREFIX+voucher.serializedTransactionBase64};
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
  receiveViaNFC(payload){
    if(typeof payload!=='string'||payload.length>4000||!payload.startsWith(PREFIX))throw new Error('Vale WebDollar no reconocido.');
    const base64=payload.slice(PREFIX.length);inspectSignedTransaction(base64);
    return this.core.receiveSigned(base64);
  },
  inspect(payload){if(!payload.startsWith(PREFIX))throw new Error('Vale inválido.');return inspectSignedTransaction(payload.slice(PREFIX.length));},
  // Reconnection never broadcasts silently. UI opens the review dialog.
  reclaim(payload){const tx=this.inspect(payload);return this.core.requestClaim(tx.serializedTransactionBase64);}
};
