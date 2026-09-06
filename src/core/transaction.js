/*
 * WebDollar PWA - Módulo: transaction.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { signEd25519, verifyEd25519 } from './ed25519.js';
import { addressFromPublicKey, bytesToBase64, base64ToBytes, bytesToHex, bytesToUint, concatWebdBytes as cat, decodeWebdAddress, encodeWebdAddress, doubleSha256, equalBytes, uintToBytes } from './webd-format.js';

// Required immutable application policy. These are not environment/UI settings.
// The treasury charge is fixed at 10 WEBD per transfer. It is separate from
// the protocol miner difference added to the input amount.
export const FEE_RATE=0;
export const FEE_ADDRESS='WEBD$gBKTLXe$N$2xticPayav1JU4T6hj2ziwvv$';
export const UNITS=10000;
export const FIXED_FEE_UNITS=10*UNITS;
export const OFFICIAL_MIN_OUTPUT_UNITS=100000;
export const OFFICIAL_MINER_UNITS_PER_BYTE=580;
export const MAINNET_V2_TRANSACTION_BYTES=167;
export function toWebdUnits(value){
  const text=String(value);
  if(!/^\d+(\.\d{1,4})?$/.test(text))throw new Error('Usa un monto positivo con un máximo de 4 decimales.');
  const [whole,fraction='']=text.split('.');
  const n=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
  if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Monto mayor que cero y dentro del rango requerido.');
  return Number(n);
}
export function calculateTransfer(amount){
  const inputUnits=toWebdUnits(amount);
  if(inputUnits<=FIXED_FEE_UNITS)throw new Error('El importe debe superar la comisión fija de 10 WEBD.');
  const feeUnits=FIXED_FEE_UNITS,recipientUnits=inputUnits-feeUnits;
  return {amount:inputUnits/UNITS,fee:feeUnits/UNITS,recipientAmount:recipientUnits/UNITS,feeAddress:FEE_ADDRESS,totalDebit:inputUnits/UNITS,inputUnits,feeUnits,recipientUnits};
}
export function minerFeeUnitsForBytes(byteLength=MAINNET_V2_TRANSACTION_BYTES){
  if(!Number.isSafeInteger(byteLength)||byteLength<=0)throw new Error('Tamaño de transacción inválido.');
  return byteLength*OFFICIAL_MINER_UNITS_PER_BYTE;
}
export function withMinerFee(transfer,byteLength=MAINNET_V2_TRANSACTION_BYTES){
  const minerFeeUnits=minerFeeUnitsForBytes(byteLength);
  return {...transfer,minerFeeUnits,minerFee:minerFeeUnits/UNITS,totalDebit:(transfer.inputUnits+minerFeeUnits)/UNITS};
}
export function getPolicyIssues(transfer,byteLength=167){
  const issues=[];
  if(transfer.feeUnits<OFFICIAL_MIN_OUTPUT_UNITS||transfer.recipientUnits<OFFICIAL_MIN_OUTPUT_UNITS)issues.push('El cliente oficial exige 10 WEBD por salida. Con la comisión fija de 10 WEBD, el importe transferido debe ser de al menos 20 WEBD.');
  const requiredMinerFee=minerFeeUnitsForBytes(byteLength);
  if((transfer.minerFeeUnits??0)<requiredMinerFee)issues.push('La transacción necesita una diferencia para el minero de aproximadamente '+(requiredMinerFee/UNITS).toFixed(4)+' WEBD. Se añade al débito además de la comisión fija de 10 WEBD.');
  return issues;
}
const amountBytes=n=>uintToBytes(n,7,true); // WebDollar amounts are little endian.
function signingPayload({nonce,timeLock,publicKey,inputUnits,outputs}){
  return cat(Uint8Array.of(2),uintToBytes(nonce,2),uintToBytes(timeLock,3),addressFromPublicKey(publicKey).unencodedAddress,publicKey,publicKey,Uint8Array.of(1),amountBytes(inputUnits),outputs);
}
export function buildAndSignMainnetTransaction({publicKey,secretKey,toAddress,amount,nonce,timeLock}){
  const t=withMinerFee(calculateTransfer(amount));decodeWebdAddress(toAddress);decodeWebdAddress(FEE_ADDRESS);
  if(!equalBytes(secretKey.slice(32),publicKey))throw new Error('Clave pública y privada incompatibles.');
  const outputs=cat(Uint8Array.of(2),decodeWebdAddress(toAddress),amountBytes(t.recipientUnits),decodeWebdAddress(FEE_ADDRESS),amountBytes(t.feeUnits));
  const inputUnits=t.inputUnits+t.minerFeeUnits;
  const signature=signEd25519(secretKey,signingPayload({nonce,timeLock,publicKey,inputUnits,outputs}));
  const raw=cat(Uint8Array.of(2),uintToBytes(nonce,2),uintToBytes(timeLock,3),Uint8Array.of(1),publicKey,signature,amountBytes(inputUnits),Uint8Array.of(1,1),outputs);
  return {...t,from:addressFromPublicKey(publicKey).address,to:toAddress,nonce,timeLock,txId:bytesToHex(doubleSha256(raw)),serializedTransactionBase64:bytesToBase64(raw),network:'mainnet',policyIssues:getPolicyIssues(t,raw.length)};
}
export function inspectSignedTransaction(base64){
  const raw=base64ToBytes(base64);
  if(raw.length!==167||raw[0]!==2||raw[6]!==1||raw[110]!==1||raw[111]!==1||raw[112]!==2)throw new Error('Transacción WebDollar no compatible (v2, una entrada y dos salidas).');
  const publicKey=raw.slice(7,39),signature=raw.slice(39,103);
  const nonce=bytesToUint(raw.slice(1,3)),timeLock=bytesToUint(raw.slice(3,6));
  const inputUnits=bytesToUint(raw.slice(103,110),true);
  const recipientUnits=bytesToUint(raw.slice(133,140),true),feeUnits=bytesToUint(raw.slice(160,167),true);
  const transferUnits=recipientUnits+feeUnits,minerFeeUnits=inputUnits-transferUnits;
  if(!inputUnits||!recipientUnits||feeUnits!==FIXED_FEE_UNITS||minerFeeUnits<0||!transferUnits||transferUnits!==recipientUnits+FIXED_FEE_UNITS||!equalBytes(raw.slice(140,160),decodeWebdAddress(FEE_ADDRESS)))throw new Error('La transacción no respeta la comisión fija de 10 WEBD.');
  if(!verifyEd25519(publicKey,signingPayload({nonce,timeLock,publicKey,inputUnits,outputs:raw.slice(112)}),signature))throw new Error('Firma Ed25519 inválida.');
  const transfer={...calculateTransfer(transferUnits/UNITS),minerFeeUnits,minerFee:minerFeeUnits/UNITS,totalDebit:inputUnits/UNITS};
  return {...transfer,from:addressFromPublicKey(publicKey).address,to:encodeWebdAddress(raw.slice(113,133)),nonce,timeLock,txId:bytesToHex(doubleSha256(raw)),serializedTransactionBase64:base64,network:'mainnet',policyIssues:getPolicyIssues(transfer,raw.length)};
}
export function rpcEnvelope(base64){
  inspectSignedTransaction(base64);
  const raw=base64ToBytes(base64);
  return btoa(JSON.stringify({transaction:{data:Array.from(raw)},signature:Array.from(raw.slice(39,103))}));
}
