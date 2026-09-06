/*
 * WebDollar PWA - Módulo: mining-pow-worker.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
importScripts('../vendor/argon2-bundled.min.js');

let stopped=false;
const u32=value=>Uint8Array.of(value>>>24,(value>>>16)&255,(value>>>8)&255,value&255);
const concat=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;};
const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1;}return 0;};

self.onmessage=async({data})=>{
  if(data.type==='stop'){stopped=true;return;}
  if(data.type!=='mine')return;
  stopped=false;
  try{
    const block=data.block instanceof Uint8Array?data.block:new Uint8Array(data.block);
    const target=data.target instanceof Uint8Array?data.target:new Uint8Array(data.target);
    const start=Number(data.start),end=Number(data.end);let best=Uint8Array.from({length:32},()=>255),bestNonce=start,nonce=start,worked=0;
    const started=performance.now();
    while(!stopped&&nonce<=end){
      const result=await self.argon2.hash({pass:concat(block,u32(nonce)),salt:'Satoshi_is_Finney',time:2,mem:256,parallelism:2,type:self.argon2.ArgonType.Argon2d,hashLen:32});
      const hash=result.hash instanceof Uint8Array?result.hash:new Uint8Array(result.hash);worked++;
      if(compare(hash,best)<0){best=hash;bestNonce=nonce;}
      if(compare(hash,target)<=0){self.postMessage({type:'result',result:true,hash,nonce,hashes:worked,elapsed:performance.now()-started});return;}
      if((worked&3)===0)self.postMessage({type:'rate',rate:worked/Math.max(.001,(performance.now()-started)/1000)});
      nonce++;
    }
    if(!stopped)self.postMessage({type:'result',result:false,hash:best,nonce:bestNonce,hashes:worked,elapsed:performance.now()-started});
  }catch(error){self.postMessage({type:'error',message:error?.message||String(error)});}
};
