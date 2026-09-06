/*
 * WebDollar PWA - Módulo: wallet.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { accountFromMnemonic, newMnemonic } from './crypto.js';
import { parseWebdWallet, decodeWebdAddress, privateKeyWif, bytesToHex, bytesToBase64, base64ToBytes } from './webd-format.js';
import { calculateTransfer, withMinerFee, getPolicyIssues, buildAndSignMainnetTransaction, inspectSignedTransaction } from './transaction.js';
import { signEd25519 } from './ed25519.js';

const ENCRYPTED_WALLET_FORMAT='webdollar-encrypted-v1';
const PBKDF2_ITERATIONS=210000;
const textEncoder=new TextEncoder();
const textDecoder=new TextDecoder();
function requirePassword(password){
  if(typeof password!=='string'||password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');
  return password;
}
function webCrypto(){
  if(!globalThis.crypto?.subtle||typeof globalThis.crypto.getRandomValues!=='function')throw new Error('Web Crypto no está disponible en este navegador.');
  return globalThis.crypto;
}
async function deriveWalletKey(password,salt){
  const subtle=webCrypto().subtle;
  const material=await subtle.importKey('raw',textEncoder.encode(requirePassword(password)),'PBKDF2',false,['deriveKey']);
  return subtle.deriveKey({name:'PBKDF2',salt,iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function isEncryptedWalletPayload(value){
  try{
    const text=typeof value==='string'?value:textDecoder.decode(value instanceof Uint8Array?value:new Uint8Array(value));
    return JSON.parse(text.trim()).format===ENCRYPTED_WALLET_FORMAT;
  }catch{return false;}
}
export async function encryptWallet(walletData,password){
  const cryptoApi=webCrypto(),salt=new Uint8Array(16),iv=new Uint8Array(12);
  cryptoApi.getRandomValues(salt);cryptoApi.getRandomValues(iv);
  const key=await deriveWalletKey(password,salt);
  const plaintext=typeof walletData==='string'?walletData:JSON.stringify(walletData);
  const ciphertext=await cryptoApi.subtle.encrypt({name:'AES-GCM',iv},key,textEncoder.encode(plaintext));
  return JSON.stringify({format:ENCRYPTED_WALLET_FORMAT,kdf:'PBKDF2-SHA-256',iterations:PBKDF2_ITERATIONS,cipher:'AES-256-GCM',salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(ciphertext))});
}
export async function decryptWallet(encryptedData,password){
  let envelope;
  try{envelope=typeof encryptedData==='string'?JSON.parse(encryptedData):JSON.parse(textDecoder.decode(encryptedData));}catch{throw new Error('Archivo de cartera cifrada inválido.');}
  if(envelope?.format!==ENCRYPTED_WALLET_FORMAT||envelope.kdf!=='PBKDF2-SHA-256'||envelope.cipher!=='AES-256-GCM'||envelope.iterations!==PBKDF2_ITERATIONS)throw new Error('Formato de cartera cifrada no compatible.');
  try{
    const key=await deriveWalletKey(password,base64ToBytes(envelope.salt));
    const plaintext=await webCrypto().subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.iv)},key,base64ToBytes(envelope.data));
    return textDecoder.decode(plaintext);
  }catch{throw new Error('No se pudo descifrar la cartera. Comprueba la contraseña.');}
}

export class WalletCore {
  #account=null; #state={address:null,balance:null,snapshot:null,history:[]}; #stop=null; #generation=0; #busy=false; #reserved=new Set(); #pendingBroadcasts=new Map();
  constructor(events,network){this.events=events;this.network=network;}
  get isUnlocked(){return Boolean(this.#account?.secretKey);}
  getAddress(){return this.#state.address;}
  getBalance(){return this.#state.balance;}
  publicState(){return structuredClone({...this.#state,locked:!this.isUnlocked});}
  signPoSHeader(header){
    if(!this.isUnlocked)throw new Error('Carga una cartera con clave privada para firmar PoS.');
    const bytes=header instanceof Uint8Array?header:new Uint8Array(header);
    if(bytes.length<40||bytes.length>2*1024*1024)throw new Error('Cabecera PoS inválida.');
    return {signature:signEd25519(this.#account.secretKey,bytes),publicKey:this.#account.publicKey.slice()};
  }
  async importFile(file,{passwordProvider}={}){
    if(!file?.name?.toLowerCase().endsWith('.webd')||file.size>1024*1024)throw new Error('Selecciona un archivo .webd menor de 1 MB.');
    let bytes=new Uint8Array(await file.arrayBuffer());let parsed;
    try{
      if(isEncryptedWalletPayload(bytes)){
        const password=await passwordProvider?.();
        if(!password)throw new Error('Se requiere la contraseña para importar la cartera cifrada.');
        const cleartext=await decryptWallet(bytes,password);bytes=textEncoder.encode(cleartext);
      }
      parsed=parseWebdWallet(bytes);
    }finally{bytes.fill(0);}
    const entry=parsed.addresses.find(a=>a.secretKey)||parsed.addresses[0];
    for(const other of parsed.addresses)if(other!==entry)other.secretKey?.fill(0);
    this.#load(entry);return this.publicState();
  }
  create(mnemonic=newMnemonic()){
    const entry=accountFromMnemonic(mnemonic);this.#load(entry);
    return {mnemonic,address:entry.address};
  }
  watch(address){decodeWebdAddress(address);this.#load({address,secretKey:null});}
  #load(entry){
    this.lock();this.#account=entry;this.#state={address:entry.address,balance:null,snapshot:null,history:[]};
    this.events.emit('wallet:ready',this.publicState());this.startSync();
  }
  startSync(){
    this.#stop?.();if(!this.getAddress())return;
    const generation=this.#generation;
    this.#stop=this.network.subscribeBalance(this.getAddress(),snapshot=>{
      if(generation!==this.#generation)return;
      this.#state.snapshot=snapshot;this.#state.balance=snapshot.balance;
      this.events.emit('balance:changed',this.publicState());
    });
  }
  async refreshBalance(){
    if(!this.getAddress())throw new Error('Carga una cartera.');
    const generation=this.#generation,snapshot=await this.network.getSnapshot(this.getAddress());
    if(generation!==this.#generation)throw new Error('La cartera cambió durante la consulta.');
    this.#state.snapshot=snapshot;this.#state.balance=snapshot.balance;this.events.emit('balance:changed',this.publicState());return snapshot;
  }
  lock(){
    this.#generation++;this.#account?.secretKey?.fill(0);this.#account=null;this.#pendingBroadcasts.clear();this.#reserved.clear();this.#stop?.();this.#stop=null;
    this.events.emit('wallet:locked',this.publicState());
  }
  exportWallet(){
    if(!this.isUnlocked)throw new Error('Carga una cartera desbloqueada.');
    return JSON.stringify({version:'0.1',address:this.getAddress(),publicKey:bytesToHex(this.#account.publicKey),privateKey:bytesToHex(privateKeyWif(this.#account.secretKey))});
  }
  async exportEncryptedWallet(password){return encryptWallet(this.exportWallet(),password);}
  async encryptWallet(walletData,password){return encryptWallet(walletData,password);}
  async decryptWallet(encryptedData,password){return decryptWallet(encryptedData,password);}
  quote({to,amount}){
    decodeWebdAddress(to);
    const transfer=withMinerFee(calculateTransfer(amount));
    const policyIssues=getPolicyIssues(transfer);
    return {...transfer,to,from:this.getAddress(),policyIssues};
  }
  #sign({to,amount}){
    if(!this.isUnlocked)throw new Error('Carga una cartera con clave privada.');
    const snapshot=this.#state.snapshot;
    if(!snapshot?.synchronized||snapshot.readOnly)throw new Error('Se requiere una consulta previa de un nodo Mainnet sincronizado y escribible.');
    if(Date.now()-snapshot.fetchedAt>10*60*1000)throw new Error('La consulta de nonce expiró. Actualiza la cartera antes de firmar.');
    const reservation=this.getAddress()+':'+snapshot.nonce;
    if(this.#reserved.has(reservation))throw new Error('Ya existe una operación firmada con este nonce. Espera su confirmación en cadena.');
    const transfer=withMinerFee(calculateTransfer(amount));
    if(transfer.totalDebit>snapshot.balance)throw new Error('Saldo insuficiente.');
    const tx=buildAndSignMainnetTransaction({publicKey:this.#account.publicKey,secretKey:this.#account.secretKey,toAddress:to,amount,nonce:snapshot.nonce,timeLock:snapshot.height-1});
    this.#reserved.add(reservation);return tx;
  }
  prepareOffline(data){
    const tx=this.#sign(data);
    this.#record({...tx,status:'offline-signed',createdAt:new Date().toISOString()});
    return tx;
  }
  async sendTransaction(data){
    if(this.#busy)throw new Error('Ya hay una operación en curso.');
    this.#busy=true;
    try{
      const quote=this.quote(data);
      if(quote.policyIssues.length)throw new Error(quote.policyIssues.join(' '));
      await this.refreshBalance();
      const reservation=this.getAddress()+':'+this.#state.snapshot.nonce+':'+data.to+':'+String(data.amount);
      let tx=this.#pendingBroadcasts.get(reservation);
      if(!tx){
        tx=this.#sign(data);this.#pendingBroadcasts.set(reservation,tx);
        this.#record({...tx,status:'signed',createdAt:new Date().toISOString()});
      }
      try{
        const result=await this.broadcastSigned(tx.serializedTransactionBase64);
        this.#pendingBroadcasts.delete(reservation);return result;
      }catch(error){
        // Keep the exact signed bytes for a deliberate retry; never sign a new nonce.
        throw error;
      }
    }finally{this.#busy=false;}
  }
  async broadcastSigned(base64){
    const tx=inspectSignedTransaction(base64);
    if(tx.policyIssues.length)throw new Error(tx.policyIssues.join(' '));
    const snapshot=await this.network.getSnapshot(tx.from);
    if(!snapshot.synchronized||snapshot.nonce!==tx.nonce||snapshot.balance<tx.totalDebit)throw new Error('Nonce, saldo o sincronización incompatibles con el vale.');
    const result=await this.network.sendRawTransaction(base64);
    this.#record({...tx,...result,createdAt:new Date().toISOString()});
    return result;
  }
  async broadcastReceived(base64){
    const tx=inspectSignedTransaction(base64);
    if(tx.to!==this.getAddress())throw new Error('El vale está firmado para otra dirección.');
    if(tx.policyIssues.length)throw new Error(tx.policyIssues.join(' '));
    // A recipient may relay a transaction signed by the sender. The sender's
    // nonce and balance are validated by the Mainnet node, not against the
    // recipient's account snapshot.
    const result=await this.network.sendRawTransaction(base64);
    this.#record({...tx,...result,direction:'in',createdAt:new Date().toISOString()});
    return result;
  }
  receiveSigned(base64){
    const tx=inspectSignedTransaction(base64);
    if(tx.to!==this.getAddress())throw new Error('El vale está firmado para otra dirección.');
    if(this.#state.history.some(record=>record.txId===tx.txId))throw new Error('Este vale ya está registrado.');
    this.#record({...tx,status:'offline-received',direction:'in',createdAt:new Date().toISOString()});return tx;
  }
  async checkTransaction(txId){
    const result=await this.network.checkTransaction(txId);
    this.#state.history=this.#state.history.map(tx=>tx.txId===txId?{...tx,...result}:tx);
    this.events.emit('transaction:new',this.publicState());
    if(result.status==='confirmed')await this.refreshBalance();
    return result;
  }
  #record(tx){this.#state.history=[tx,...this.#state.history.filter(t=>t.txId!==tx.txId)].slice(0,50);this.events.emit('transaction:new',this.publicState());}
}
