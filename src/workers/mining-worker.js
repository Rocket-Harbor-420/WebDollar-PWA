/*
 * WebDollar PWA - Módulo: mining-worker.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
// Worker host for a compatible Mainnet engine supplied as an independent module.
// It never receives wallet secret keys. It emits only actual engine measurements.
let engine=null;
self.onmessage=async ({data})=>{
  try{
    if(data.type==='start'){
      const url=new URL(data.moduleUrl,self.location.href);
      if(url.origin!==self.location.origin)throw new Error('El motor debe servirse desde el mismo origen.');
      engine=(await import(url.href)).default;
      if(typeof engine?.start!=='function'||typeof engine?.stop!=='function')throw new Error('Contrato del motor incompatible.');
      await engine.start({address:data.address,balance:data.balance,onRate:rate=>{
        if(Number.isFinite(rate)&&rate>=0)self.postMessage({type:'rate',rate});
      },onMetrics:metrics=>self.postMessage({type:'metrics',...metrics})});
      self.postMessage({type:'started'});
    }else if(data.type==='stop'){
      await engine?.stop();self.postMessage({type:'stopped'});
    }
  }catch(error){self.postMessage({type:'error',message:error.message||'Fallo del motor'});}
};
