import { generateMnemonic, validateMnemonic, mnemonicToSeedSync, wordlist, nacl } from '../vendor/dependencies.js';
import { addressFromPublicKey, decodeWebdAddress } from './webd-format.js';
export function validateAddress(address){try{decodeWebdAddress(address);return true;}catch{return false;}}
export function shortAddress(address){return address?address.slice(0,11)+'…'+address.slice(-7):'Sin cartera';}
export function newMnemonic(){return generateMnemonic(wordlist,256);}
export function accountFromMnemonic(mnemonic){
  if(!validateMnemonic(mnemonic,wordlist))throw new Error('Frase BIP39 inválida.');
  const seed=mnemonicToSeedSync(mnemonic);
  const pair=nacl.sign.keyPair.fromSeed(seed.slice(0,32));seed.fill(0);
  return {...addressFromPublicKey(pair.publicKey),...pair};
}
