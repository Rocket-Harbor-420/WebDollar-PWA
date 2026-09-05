import { nacl } from '../vendor/dependencies.js';
export function signEd25519(secretKey,message) {
  if(secretKey?.length!==64)throw new Error('Se requiere la clave Ed25519 de 64 bytes.');
  return nacl.sign.detached(message,secretKey);
}
export function verifyEd25519(publicKey,message,signature){
  try{return nacl.sign.detached.verify(message,signature,publicKey);}catch{return false;}
}
