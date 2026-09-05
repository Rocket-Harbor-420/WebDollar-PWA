import { nacl, sha256 } from '../vendor/dependencies.js';
import { NativeWebDollarSocket } from '../core/native-socket.js';
import { decodeWebdAddress } from '../core/webd-format.js';

const MAINNET_MINING_ENDPOINT='https://pool.timi.ro';
const MAINNET_POOL_PUBLIC_KEY=Uint8Array.from('7d863060bc5bf81695f53c5e61c79677ad6cb3b5fd48dafebbabb25f7dca8797'.match(/../g),hex=>parseInt(hex,16));
// PoolManagement accepts browser miners as the regular server-consensus role;
// the miner-pool role is negotiated by `mining-pool/hello-pool` afterwards.
const MINER_POOL_NODE_CONSENSUS_TYPE=1;
const POS100_ACTIVATION=2348110;
const POS_MINIMUM_UNITS=100*10000;

function bytes(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  if(Array.isArray(value))return Uint8Array.from(value);
  if(value&&typeof value==='object'){
    const keys=Object.keys(value).filter(key=>/^\d+$/.test(key)).sort((a,b)=>Number(a)-Number(b));
    if(keys.length)return Uint8Array.from(keys.map(key=>Number(value[key])));
  }
  throw new Error('Campo binario de minería inválido.');
}
function concat(...parts){const size=parts.reduce((total,part)=>total+part.length,0);const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
function u32(value){return Uint8Array.of(value>>>24,(value>>>16)&255,(value>>>8)&255,value&255);}
function optimized(value){const source=bytes(value);let first=0;while(first<source.length&&source[first]===0)first++;return concat(Uint8Array.of(source.length-first),source.slice(first));}
function ascii(value){return new TextEncoder().encode(String(value));}
function hex(value){return Array.from(bytes(value),byte=>byte.toString(16).padStart(2,'0')).join('');}
function asBigInt(value){let result=0n;for(const byte of bytes(value))result=(result<<8n)+BigInt(byte);return result;}
function fixed32(value){const result=new Uint8Array(32);let n=BigInt(value);for(let i=31;i>=0;i--){result[i]=Number(n&255n);n>>=8n;}return result;}
function compare(a,b){for(let i=0;i<a.length;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1;}return 0;}
function poolWorkData(value){return value?.work||value;}
function powBlockData(work){const serialized=bytes(work.s);if(serialized.length<36)throw new Error('Trabajo PoW truncado.');return concat(optimized(u32(Number(work.h))),optimized(work.t),serialized.slice(36));}
function headerStart(serializedBlock){const block=bytes(serializedBlock);if(block.length<129)throw new Error('El trabajo Mainnet no contiene una cabecera PoS.');const addressLength=block[128];if(addressLength!==0&&addressLength!==20)throw new Error('Longitud de dirección PoS inválida.');const start=129+addressLength;if(block.length<start+38)throw new Error('Cabecera PoS truncada.');return start;}
function posHeader(serializedBlock,timestamp){const block=bytes(serializedBlock),start=headerStart(block),header=block.slice(start);header.set(u32(timestamp),2+32);return header;}
function posHash(serializedBlock,target,address,timestamp,height,balance){const block=bytes(serializedBlock),start=headerStart(block),hashPrev=block.slice(start+2,start+34),digest=sha256(concat(optimized(u32(height)),optimized(target),optimized(hashPrev),optimized(address),optimized(u32(timestamp))));const units=BigInt(balance);if(units<POS_MINIMUM_UNITS)throw new Error('La dirección de minería necesita al menos 100 WEBD para PoS.');return fixed32(asBigInt(digest)/units);}
function signedPoolMessage(message,answer){return concat(message,ascii(answer.name),ascii(answer.fee),ascii(answer.website),ascii(JSON.stringify(answer.servers)),ascii(answer.useSig));}

function createMainnetMiningEngine(core,endpoint){
  let runtime=null;
  async function schedule(work){
    if(!runtime?.running)return;
    const normalized=poolWorkData(work);if(!normalized?.h||!normalized.s||!normalized.t)throw new Error('Trabajo de pool incompleto.');
    runtime.work=normalized;runtime.generation++;const generation=runtime.generation;runtime.powCancel?.();
    if(runtime.workPromise){try{await runtime.workPromise;}catch{}if(!runtime?.running||runtime.generation!==generation)return;}
    runtime.workPromise=mine(normalized,generation).finally(()=>{if(runtime)runtime.workPromise=null;});await runtime.workPromise;
  }
  async function submit(work,payload){
    const response=await runtime.socket.requestWithBinary('mining-pool/work-done',{work:payload},12000);
    const next=poolWorkData(response.data?.newWork||response.data?.work);if(next)await schedule(next);
  }
  async function minePow(work,generation){
    const worker=new Worker(new URL('../workers/mining-pow-worker.js',import.meta.url));runtime.powWorker=worker;
    await new Promise((resolve,reject)=>{
      const cancel=()=>{if(runtime?.powCancel===cancel)runtime.powCancel=null;worker.terminate();if(runtime?.powWorker===worker)runtime.powWorker=null;resolve();};runtime.powCancel=cancel;
      const cleanup=()=>{if(runtime?.powCancel===cancel)runtime.powCancel=null;};
      worker.onmessage=async({data})=>{
        if(data.type==='rate'){runtime?.onRate?.(data.rate);return;}
        if(data.type==='error'){cleanup();worker.terminate();runtime.powWorker=null;reject(new Error(data.message));return;}
        if(data.type!=='result'||!runtime?.running||runtime.generation!==generation){cleanup();worker.terminate();runtime.powWorker=null;resolve();return;}
        try{await submit(work,{result:data.result,hash:data.hash,nonce:data.nonce,id:work.I??work.h,h:work.h,timeDiff:data.elapsed,hashes:data.hashes});cleanup();worker.terminate();runtime.powWorker=null;resolve();}catch(error){cleanup();worker.terminate();runtime.powWorker=null;reject(error);}
      };
      worker.onerror=()=>{cleanup();worker.terminate();runtime.powWorker=null;reject(new Error('Fallo del worker Argon2 PoW.'));};
      worker.postMessage({type:'mine',block:powBlockData(work),target:bytes(work.t),start:Number(work.start)||0,end:Number(work.end)||0});
    });
  }
  async function mine(work,generation){
    if(work.h<POS100_ACTIVATION)return minePow(work,generation);
    const target=bytes(work.t),serialized=bytes(work.s),miner=decodeWebdAddress(core.getAddress()),balances=Array.isArray(work.b)?work.b:[],balance=Number(balances[0]);
    if(!Number.isSafeInteger(balance)||balance<POS_MINIMUM_UNITS)throw new Error('El saldo de la dirección no alcanza el mínimo PoS de 100 WEBD.');
    const startTimestamp=Math.max(0,Number(work.m)||0);let timestamp=startTimestamp;
    while(runtime?.running&&runtime.generation===generation){
      const hash=posHash(serialized,target,miner,timestamp,Number(work.h),balance);runtime.attempts++;
      if(compare(hash,target)<=0){
        const header=posHeader(serialized,timestamp),signed=core.signPoSHeader?.(header);if(!signed)throw new Error('El Core no expone el firmador PoS local.');
        await submit(work,{result:true,hash,nonce:0,id:work.I??work.h,h:work.h,timeDiff:Math.max(1,performance.now()-runtime.startedAt),pos:{timestamp,posSignature:signed.signature,posMinerAddress:miner,posMinerPublicKey:signed.publicKey,balance}});return;
      }
      timestamp++;if(timestamp>startTimestamp+3600)return;if((runtime.attempts&127)===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return {
    async start({address,onRate}){
      if(runtime?.running)return;const accountAddress=decodeWebdAddress(address);const state={running:true,generation:0,attempts:0,startedAt:performance.now(),socket:null,work:null,workPromise:null,onRate};runtime=state;
      const socket=new NativeWebDollarSocket(endpoint,{nodeConsensusType:MINER_POOL_NODE_CONSENSUS_TYPE,timeoutMs:12000});state.socket=socket;
      try{
        await socket.connect();const message=new Uint8Array(32);crypto.getRandomValues(message);
        const hello=await socket.requestWithBinary('mining-pool/hello-pool',{message,pool:MAINNET_POOL_PUBLIC_KEY,minerAddress:address,addresses:[hex(accountAddress)]},30000),answer=hello.data;
        if(!answer?.result)throw new Error('El pool Mainnet rechazó el saludo de minería.');
        const signature=bytes(answer.signature);if(signature.length<64||!nacl.sign.detached.verify(signedPoolMessage(message,answer),signature,MAINNET_POOL_PUBLIC_KEY))throw new Error('La firma del pool Mainnet no es válida.');
        socket.sendEvent('mining-pool/hello-pool/answer/confirmation',{result:true});socket.on('mining-pool/new-work',data=>{void schedule(poolWorkData(data)).catch(error=>core.events.emit('module:error',{id:'mining',error:{message:error.message}}));});
        let work=poolWorkData(answer.work);if(!work){const response=await socket.request('mining-pool/get-work',{});work=poolWorkData(response.data);}if(!work)throw new Error('El pool Mainnet no entregó trabajo.');
        await schedule(work);state.rateTimer=setInterval(()=>{const elapsed=Math.max(1,performance.now()-state.startedAt);onRate?.(state.attempts/(elapsed/1000));},1000);
      }catch(error){state.running=false;socket.close();runtime=null;throw error;}
    },
    stop(){if(!runtime)return;runtime.running=false;runtime.generation++;clearInterval(runtime.rateTimer);runtime.socket?.close();runtime=null;},
    getHashRate(){if(!runtime)return 0;return runtime.attempts/Math.max(1,(performance.now()-runtime.startedAt)/1000);}
  };
}

export const miningModule={
  id:'mining',name:'Minería WebDollar',running:false,lastHashRate:0,engine:null,
  init(core){this.core=core;},
  attachEngine(engine){if(!engine||typeof engine.start!=='function'||typeof engine.stop!=='function')throw new Error('Motor de minería incompatible.');this.engine=engine;},
  attachWorkerEngine(moduleUrl){const url=new URL(moduleUrl,location.href);if(url.origin!==location.origin)throw new Error('El motor debe alojarse con la PWA.');let worker=null;this.attachEngine({start:({address,balance,onRate})=>new Promise((resolve,reject)=>{worker=new Worker(new URL('../workers/mining-worker.js',import.meta.url),{type:'module'});const timeout=setTimeout(()=>{worker.terminate();reject(new Error('El motor no respondió.'));},15000);worker.onmessage=({data})=>{if(data.type==='started'){clearTimeout(timeout);resolve();}if(data.type==='rate')onRate(data.rate);if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));this.core.events.emit('module:error',{id:this.id,error:{message:data.message}});}};worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Fallo del worker de minería.'));this.core.events.emit('module:error',{id:this.id,error:{message:'Fallo del worker de minería.'}});};worker.postMessage({type:'start',moduleUrl:url.href,address,balance});}),stop:()=>{worker?.postMessage({type:'stop'});worker?.terminate();worker=null;}});},
  async startMining(){if(!this.engine&&this.core?.getNetworkSource?.()===MAINNET_MINING_ENDPOINT)this.engine=createMainnetMiningEngine(this.core,MAINNET_MINING_ENDPOINT);if(!this.engine)throw new Error('No hay un motor de consenso WebDollar conectado para este nodo.');try{await this.engine.start({address:this.core.getAddress(),balance:this.core.getBalance(),onRate:rate=>{if(Number.isFinite(rate)&&rate>=0){this.lastHashRate=rate;this.core.events.emit('mining:rate',rate);}}});this.running=true;this.core.events.emit('mining:state',{running:true});}catch(error){this.dispose();throw error;}},
  stopMining(){this.engine?.stop();this.running=false;this.lastHashRate=0;this.core?.events.emit('mining:state',{running:false});},
  getHashRate(){return this.lastHashRate;},
  dispose(){try{this.engine?.stop();}finally{this.running=false;this.lastHashRate=0;}}
};
