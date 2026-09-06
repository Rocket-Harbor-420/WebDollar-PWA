/*
 * WebDollar PWA - Módulo: webd-format.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { nacl, sha256, ripemd160 } from '../vendor/dependencies.js';

export function concatWebdBytes(...arrays) {
  const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0)); let at=0;
  for(const a of arrays){out.set(a,at);at+=a.length;} return out;
}
export const equalBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export const doubleSha256=(bytes)=>sha256(sha256(bytes));
export const bytesToHex=(bytes)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function hexToBytes(text) {
  if(typeof text!=='string'||!text.length||text.length%2||!/^[0-9a-f]+$/i.test(text)) throw new Error('Hexadecimal inválido.');
  return Uint8Array.from(text.match(/../g),b=>parseInt(b,16));
}
export function bytesToBase64(bytes){let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);}
export function base64ToBytes(text){if(typeof text!=='string'||!text.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw new Error('Base64 inválido.');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export const webdBase64=(bytes)=>bytesToBase64(bytes).replaceAll('O','#').replaceAll('l','@').replaceAll('/','$');
export const webdBytes=(text)=>base64ToBytes(text.replaceAll('#','O').replaceAll('@','l').replaceAll('$','/'));
const prefix=Uint8Array.of(0x58,0x40,0x43,0xfe);
export function encodeWebdAddress(raw) {
  if(raw.length!==20)throw new Error('La dirección binaria debe tener 20 bytes.');
  const body=concatWebdBytes(Uint8Array.of(0),raw);
  return webdBase64(concatWebdBytes(prefix,body,doubleSha256(body).slice(0,4),Uint8Array.of(255)));
}
export function decodeWebdAddress(address) {
  if(typeof address!=='string'||address.length!==40)throw new Error('Dirección WEBD inválida: se requieren 40 caracteres.');
  const b=webdBytes(address);
  if(b.length!==30||!equalBytes(b.slice(0,4),prefix)||b[4]!==0||b[29]!==255||webdBase64(b)!==address)throw new Error('Prefijo o versión de dirección WEBD inválidos.');
  if(!equalBytes(doubleSha256(b.slice(4,25)).slice(0,4),b.slice(25,29)))throw new Error('Checksum de dirección WEBD inválido.');
  return b.slice(5,25);
}
export function addressFromPublicKey(publicKey) {
  if(publicKey.length!==32)throw new Error('Clave pública inválida.');
  const unencodedAddress=ripemd160(sha256(publicKey));
  return {unencodedAddress,address:encodeWebdAddress(unencodedAddress)};
}
export function validatePrivateKeyWif(bytes) {
  let secretKey;
  if(bytes.length===64)secretKey=bytes.slice();
  else if(bytes.length===69&&bytes[0]===128&&equalBytes(doubleSha256(bytes.slice(0,65)).slice(0,4),bytes.slice(65)))secretKey=bytes.slice(1,65);
  else throw new Error('Clave .webd no válida o cifrada: se esperan 64 bytes o WIF de 69 bytes.');
  const derived=nacl.sign.keyPair.fromSeed(secretKey.slice(0,32));
  if(!equalBytes(derived.publicKey,secretKey.slice(32))){derived.secretKey.fill(0);secretKey.fill(0);throw new Error('La clave pública no corresponde a la semilla privada.');}
  derived.secretKey.fill(0);
  return secretKey;
}
export function privateKeyWif(secretKey) {
  const body=concatWebdBytes(Uint8Array.of(128),secretKey);
  return concatWebdBytes(body,doubleSha256(body).slice(0,4));
}
function account(secretBytes, expectedAddress, expectedPublicKey) {
  const secretKey=secretBytes?validatePrivateKeyWif(secretBytes):null;
  try {
    const publicKey=secretKey?secretKey.slice(32):expectedPublicKey;
    if(!publicKey)throw new Error('El archivo no contiene clave pública.');
    const derived=addressFromPublicKey(publicKey);
    if(expectedAddress&&(!equalBytes(decodeWebdAddress(expectedAddress),derived.unencodedAddress)))throw new Error('La dirección exportada no corresponde a las claves.');
    if(expectedPublicKey&&!equalBytes(publicKey,expectedPublicKey))throw new Error('Las claves exportadas no coinciden.');
    return {...derived,publicKey,secretKey};
  }catch(error){secretKey?.fill(0);throw error;}
}
function readRecord(bytes,cursor){if(cursor.i>=bytes.length)throw new Error('Archivo truncado.');const len=bytes[cursor.i++];if(cursor.i+len>bytes.length)throw new Error('Archivo truncado.');const r=bytes.slice(cursor.i,cursor.i+len);cursor.i+=len;return r;}
export function parseWebdWallet(buffer) {
  const bytes=new Uint8Array(buffer);
  if(bytes.length===0||bytes.length>1024*1024)throw new Error('Archivo vacío o demasiado grande (máximo 1 MB).');
  const text=new TextDecoder().decode(bytes).replace(/^\uFEFF/,'').trim();
  if(text.startsWith('{')) {
    let json;try{json=JSON.parse(text);}catch{throw new Error('JSON .webd inválido.');}
    const data=json.data||json;
    if(data.version!=='0.1')throw new Error('Versión de exportación .webd no compatible.');
    const entry=account(data.privateKey?hexToBytes(data.privateKey):null,data.address,data.publicKey?hexToBytes(data.publicKey):null);
    return {addresses:[entry],format:'official-json-0.1'};
  }
  if(/^[0-9a-f]+$/i.test(text)&&[128,138].includes(text.length))return {addresses:[account(hexToBytes(text))],format:'private-hex'};
  if([64,69].includes(bytes.length))return {addresses:[account(bytes)],format:'private-binary'};
  if(bytes.length===bytes[0]+3&&[64,69].includes(bytes[0]))return {addresses:[account(bytes.slice(1,1+bytes[0]))],format:'private-key-export'};
  if(bytes.length<4)throw new Error('Formato .webd no reconocido.');
  const count=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(count<1||count>64)throw new Error('Formato .webd no reconocido. Exporta una cartera JSON versión 0.1 sin cifrar.');
  // Official serialized wallets have no format flag: choose by exact record length,
  // and validate every public/private/address relationship before accepting.
  for(const withPrivate of [true,false]){
    const cursor={i:4};const addresses=[];
    try{
      for(let i=0;i<count;i++){
        const encoded=readRecord(bytes,cursor),raw=readRecord(bytes,cursor),pub=readRecord(bytes,cursor);
        const secret=withPrivate?readRecord(bytes,cursor):null;
        const entry=account(secret,webdBase64(encoded),pub);
        secret?.fill(0);
        if(!equalBytes(entry.unencodedAddress,raw)){entry.secretKey?.fill(0);throw new Error('Direcciones binarias inconsistentes.');}
        addresses.push(entry);
      }
      if(cursor.i!==bytes.length)throw new Error('Datos adicionales en .webd.');
      return {addresses,format:'wallet-serialized'};
    }catch{for(const a of addresses)a.secretKey?.fill(0);}
  }
  throw new Error('Cartera .webd truncada, cifrada o con claves inconsistentes.');
}
export function uintToBytes(value,length,littleEndian=false) {
  if(!Number.isSafeInteger(value)||value<0)throw new Error('Entero fuera de rango.');
  const out=new Uint8Array(length);let rest=value;
  for(let i=0;i<length;i++){out[littleEndian?i:length-i-1]=rest%256;rest=Math.floor(rest/256);}
  if(rest)throw new Error('Entero fuera de rango.');return out;
}
export function bytesToUint(bytes,littleEndian=false){let n=0;for(const b of littleEndian?bytes.slice().reverse():bytes)n=n*256+b;if(!Number.isSafeInteger(n))throw new Error('Entero fuera de rango.');return n;}
