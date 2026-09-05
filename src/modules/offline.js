import { inspectSignedTransaction } from '../core/transaction.js';
const PREFIX='webd-pay-v1:';
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
  receiveViaNFC(payload){
    if(typeof payload!=='string'||payload.length>4000||!payload.startsWith(PREFIX))throw new Error('Vale WebDollar no reconocido.');
    const base64=payload.slice(PREFIX.length);inspectSignedTransaction(base64);
    return this.core.receiveSigned(base64);
  },
  inspect(payload){if(!payload.startsWith(PREFIX))throw new Error('Vale inválido.');return inspectSignedTransaction(payload.slice(PREFIX.length));},
  // Reconnection never broadcasts silently. UI opens the review dialog.
  reclaim(payload){const tx=this.inspect(payload);return this.core.requestClaim(tx.serializedTransactionBase64);}
};
