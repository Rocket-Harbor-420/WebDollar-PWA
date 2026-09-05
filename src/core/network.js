import { MAINNET_EXPLORER_API_ENDPOINTS, MAINNET_NODE_ENDPOINTS } from './constants.js';
import { decodeWebdAddress } from './webd-format.js';
import { inspectSignedTransaction, rpcEnvelope } from './transaction.js';
import { NativeWebDollarSocket } from './native-socket.js';

export function endpointUrl(value){
  const url=new URL(value);
  if(url.username||url.password||url.hash||url.search)throw new Error('La URL del nodo no debe incluir credenciales, fragmentos ni parámetros.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Usa HTTPS o un nodo en localhost.');
  return url.href.replace(/\/$/,'');
}
export class MainnetNetworkAdapter {
  #rpcAuth=null; #stops=new Set(); #refreshListeners=new Set(); #socket=null; #socketPromise=null; #socketBlockOff=null; #nodeInfo=null;
  constructor(events,{httpEndpoint='',rpcEndpoint='',fetchImpl=(...args)=>globalThis.fetch(...args),timeoutMs=6000,pollIntervalMs=15000}={}){
    this.events=events;this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs;this.pollIntervalMs=pollIntervalMs;
    this.activeEndpoint=null;this.activeKind=null;this.rpcEndpoint='';this.setEndpoints({httpEndpoint,rpcEndpoint});
  }
  setEndpoints({httpEndpoint='',rpcEndpoint='',username='',password=''}={}){
    this.endpoints=httpEndpoint?[{endpoint:endpointUrl(httpEndpoint),kind:new URL(httpEndpoint).pathname.replace(/\/$/,'').endsWith('/api')?'explorer':'node'}]:[
      ...MAINNET_NODE_ENDPOINTS.map(endpoint=>({endpoint,kind:'node'})),
      ...MAINNET_EXPLORER_API_ENDPOINTS.map(endpoint=>({endpoint,kind:'explorer'}))
    ];
    this.rpcEndpoint=rpcEndpoint?endpointUrl(rpcEndpoint):'';
    this.#rpcAuth=username?btoa(unescape(encodeURIComponent(username+':'+password))):null;
    this.#socket?.close();this.#socket=null;this.#socketPromise=null;this.#nodeInfo=null;
    this.#socketBlockOff?.();this.#socketBlockOff=null;this.#refreshListeners.clear();
    this.activeEndpoint=null;this.activeKind=null;
  }
  async #json(url,options={}){
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),this.timeoutMs);
    try{
      const response=await this.fetchImpl(url,{...options,signal:abort.signal,cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json',...options.headers}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||typeof data!=='object')throw new Error('Respuesta JSON inválida.');
      return data;
    }finally{clearTimeout(timer);}
  }
  async #probe(candidate){
    const endpoint=candidate.endpoint;
    if(candidate.kind==='explorer'){
      const chain=await this.#json(endpoint+'/chain');
      if(!Number.isSafeInteger(chain.height)||chain.height<1||typeof chain.hash!=='string'||chain.hash.length<16)throw new Error('Cadena explorador inválida.');
      return {endpoint,kind:'explorer',info:{protocol:'WebDollar',version:'explorer-api',blocks:{length:chain.height,lastBlockHash:chain.hash},is_synchronized:true,readOnly:true,chain}};
    }
    const info=await this.#json(endpoint+'/');
    if(info.protocol!=='WebDollar'||!Number.isSafeInteger(info.blocks?.length)||info.blocks.length<=0)throw new Error('Identidad WebDollar inválida.');
    return {endpoint,kind:'node',info:{...info,readOnly:false}};
  }
  async connect(){
    const errors=[];
    // Race read-only discovery; all candidates must identify themselves as WebDollar.
    const results=await Promise.all(this.endpoints.map(async candidate=>{
      try{
        return await this.#probe(candidate);
      }catch(error){errors.push(candidate.endpoint+': '+error.message);return null;}
    }));
    const found=results.filter(Boolean).sort((a,b)=>b.info.blocks.length-a.info.blocks.length)[0];
    if(!found)throw new Error('No hay un nodo Mainnet accesible. Configura un endpoint activo. '+errors.join(' · '));
    this.activeEndpoint=found.endpoint;this.activeKind=found.kind;this.#nodeInfo=found.info;this.events.emit('network:connected',{endpoint:found.endpoint,kind:found.kind,readOnly:found.info.readOnly===true});
    return found.info;
  }
  async #getSocket(){
    if(this.#socket)return this.#socket;
    if(this.activeKind!=='node'||!this.activeEndpoint)throw new Error('No hay un nodo WebDollar escribible activo.');
    if(this.#socketPromise)return this.#socketPromise;
    this.#socketPromise=(async()=>{
      const socket=new NativeWebDollarSocket(this.activeEndpoint,{version:this.#nodeInfo?.version||'1.3.24',timeoutMs:this.timeoutMs});
      await socket.connect();
      this.#socket=socket;
      this.events.emit('network:transport',{transport:socket.getTransport?.()||'websocket'});
      socket.on('error',error=>this.events.emit('network:error',{message:error?.message||'Error del socket Mainnet.'}));
      socket.on('close',()=>{
        this.#socketBlockOff?.();this.#socketBlockOff=null;
        if(this.#socket===socket)this.#socket=null;
      });
      return socket;
    })();
    try{return await this.#socketPromise;}finally{this.#socketPromise=null;}
  }
  async #sendViaSocket(base64,txId){
    const socket=await this.#getSocket();
    const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
    socket.sendBinaryEvent('transactions/new-pending-transaction',bytes);
    for(let attempt=0;attempt<5;attempt++){
      await new Promise(resolve=>setTimeout(resolve,1000));
      try{
        const status=await this.checkTransaction(txId);
        if(status.status==='mempool'||status.status==='confirmed')return {txId,status:status.status,transport:'native-peer'};
      }catch{}
    }
    return {txId,status:'submitted',transport:'native-peer'};
  }
  async #get(path){if(!this.activeEndpoint)await this.connect();return this.#json(this.activeEndpoint+path);}
  async #ensureBlockFeed(){
    if(this.activeKind!=='node'||this.#socketBlockOff)return;
    try{
      const socket=await this.#getSocket();
      if(this.#socket!==socket||this.#socketBlockOff)return;
      this.#socketBlockOff=socket.on('head/new-block',()=>{
        for(const refresh of [...this.#refreshListeners]){try{void refresh();}catch{}}
      });
    }catch(error){
      this.events.emit('network:error',{message:'Feed de bloques no disponible; continúa el sondeo REST. '+error.message});
    }
  }
  async getNetworkInfo(){return this.activeKind==='explorer'?this.#get('/chain'):this.#get('/');}
  async getSnapshot(address){
    decodeWebdAddress(address);
    if(!this.activeEndpoint)await this.connect();
    const endpoint=this.activeEndpoint;
    if(this.activeKind==='explorer'){
      const [record,chain]=await Promise.all([
        this.#json(endpoint+'/address?address='+encodeURIComponent(address)),
        this.#json(endpoint+'/chain')
      ]);
      const balance=Number(record.balance),nonce=Number(record.nonce),height=Number(chain.height);
      if(!Number.isSafeInteger(balance)||balance<0)throw new Error('Respuesta de saldo del explorador inválida; no se sustituirá por cero.');
      if(!Number.isSafeInteger(nonce)||nonce<0||nonce>65535)throw new Error('Respuesta de nonce del explorador inválida.');
      if(!Number.isSafeInteger(height)||height<1)throw new Error('Altura de cadena del explorador inválida.');
      return {address,balance:balance/10000,nonce,height,synchronized:true,readOnly:true,source:endpoint,fetchedAt:Date.now()};
    }
    const [balance,nonce,top]=await Promise.all([
      this.#json(endpoint+'/address/balance/'+encodeURIComponent(address)),
      this.#json(endpoint+'/address/nonce/'+encodeURIComponent(address)),this.#json(endpoint+'/top')
    ]);
    if(balance.result!==true||typeof balance.balance!=='number'||!Number.isFinite(balance.balance)||balance.balance<0)throw new Error('Respuesta de saldo inválida; no se sustituirá por cero.');
    if(nonce.result!==true||!Number.isInteger(nonce.nonce)||nonce.nonce<0||nonce.nonce>65535)throw new Error('Respuesta de nonce inválida.');
    if(!Number.isSafeInteger(top.top)||top.top<1||top.top>16777215)throw new Error('Altura de cadena inválida.');
    return {address,balance:balance.balance,nonce:nonce.nonce,height:top.top,synchronized:top.is_synchronized===true,readOnly:false,source:endpoint,fetchedAt:Date.now()};
  }
  async getAddressBalance(address){return (await this.getSnapshot(address)).balance;}
  async getAddressNonce(address){return (await this.getSnapshot(address)).nonce;}
  async checkTransaction(txId){
    if(!/^[0-9a-f]{64}$/.test(txId))throw new Error('Hash inválido.');
    if(this.activeKind==='explorer'){
      try{
        const tx=await this.#get('/tx/'+encodeURIComponent(txId));
        return tx?.txId===txId||tx?.data?.txId===txId?{status:'confirmed',height:Number(tx.blockHeight??tx.height??0)||undefined}:{status:'unverified'};
      }catch{return {status:'unverified'};}
    }
    const mined=await this.#get('/transactions/exists/'+txId);
    if(mined.result===true&&Number.isSafeInteger(mined.height))return {status:'confirmed',height:mined.height};
    const pending=await this.#get('/transactions/pending/object');
    return {status:Object.hasOwn(pending,txId)?'mempool':'unverified'};
  }
  subscribeBalance(address,handler){
    let stopped=false,timer=null,busy=false,lastHeight=null;
    const poll=async()=>{
      if(stopped||busy)return;clearTimeout(timer);timer=null;busy=true;
      try{
        const snapshot=await this.getSnapshot(address);if(stopped)return;
        handler(snapshot);
        if(lastHeight!==snapshot.height){lastHeight=snapshot.height;this.events.emit('chain:block',{height:lastHeight});}
        void this.#ensureBlockFeed();
      }catch(error){if(!stopped)this.events.emit('network:error',{message:error.message});}
      finally{busy=false;if(!stopped)timer=setTimeout(poll,this.pollIntervalMs);}
    };
    const refresh=()=>poll();
    const stop=()=>{stopped=true;clearTimeout(timer);this.#stops.delete(stop);this.#refreshListeners.delete(refresh);};
    this.#stops.add(stop);this.#refreshListeners.add(refresh);void poll();return stop;
  }
  async sendRawTransaction(base64){
    const tx=inspectSignedTransaction(base64);
    if(tx.policyIssues.length)throw new Error(tx.policyIssues.join(' '));
    if(this.activeKind==='explorer')throw new Error('El explorador configurado es de solo lectura. Usa un nodo Mainnet con JSON-RPC para transmitir.');
    if(!this.rpcEndpoint){
      if(this.activeKind==='node')return this.#sendViaSocket(base64,tx.txId);
      throw new Error('Configura un endpoint JSON-RPC o un nodo Mainnet activo.');
    }
    const id=crypto.randomUUID();let data;
    try{
      data=await this.#json(this.rpcEndpoint,{method:'POST',headers:{'Content-Type':'application/json',...(this.#rpcAuth?{Authorization:'Basic '+this.#rpcAuth}:{})},body:JSON.stringify({jsonrpc:'2.0',id,method:'sendRawTransaction',params:[rpcEnvelope(base64)]})});
    }catch{throw new Error('Respuesta RPC desconocida. Consulta el hash antes de repetir; la petición podría haber llegado al nodo.');}
    if(data.error)throw new Error('RPC: '+(data.error.message||'Transacción rechazada.'));
    if(data.id!==id||data.result!==tx.txId)throw new Error('El RPC no devolvió el hash esperado. Verifica el estado antes de reintentar.');
    // RPC acknowledgement alone is not proof of mempool inclusion.
    return {txId:tx.txId,status:'submitted'};
  }
  dispose(){for(const stop of [...this.#stops])stop();this.#socket?.close();this.#socket=null;this.#socketPromise=null;this.#nodeInfo=null;this.#rpcAuth=null;this.activeEndpoint=null;this.activeKind=null;}
}
