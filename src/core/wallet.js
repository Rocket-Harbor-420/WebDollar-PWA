import { accountFromMnemonic, newMnemonic } from './crypto.js';
import { parseWebdWallet, decodeWebdAddress, privateKeyWif, bytesToHex } from './webd-format.js';
import { calculateTransfer, withMinerFee, getPolicyIssues, buildAndSignMainnetTransaction, inspectSignedTransaction } from './transaction.js';
import { signEd25519 } from './ed25519.js';

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
  async importFile(file){
    if(!file?.name?.toLowerCase().endsWith('.webd')||file.size>1024*1024)throw new Error('Selecciona un archivo .webd menor de 1 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());let parsed;
    try{parsed=parseWebdWallet(bytes);}finally{bytes.fill(0);}
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
