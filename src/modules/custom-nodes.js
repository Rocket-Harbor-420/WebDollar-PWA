/*
 * Preparación de nodos personalizados. Es deliberadamente de solo lectura:
 * no sustituye la ruta de firma del Core ni permite transmitir a un nodo no
 * identificado sin una comprobación explícita.
 */
const nodes=new Map();
function validateEndpoint(endpoint){
  let url;try{url=new URL(endpoint);}catch{throw new Error('La URL del nodo no es válida.');}
  if(!['https:','wss:'].includes(url.protocol))throw new Error('Los nodos personalizados deben usar HTTPS o WSS.');
  return url.href.replace(/\/$/,'');
}
function validateIdentity(identity={}){
  if(identity.protocol&&identity.protocol!=='WebDollar')throw new Error('La identidad del nodo no declara WebDollar.');
  if(identity.network&&identity.network!=='mainnet')throw new Error('El nodo no declara Mainnet.');
  return {protocol:'WebDollar',network:'mainnet',nodeId:String(identity.nodeId||'unknown'),version:String(identity.version||'unknown')};
}
export const customNodesModule={
  id:'custom-nodes',name:'Nodos personalizados',
  init(core){this.core=core;},
  validateIdentity,
  addNode({endpoint,identity={},label='Nodo WebDollar'}={}){
    const normalized=validateEndpoint(endpoint),validated=validateIdentity(identity),node={id:normalized,label,endpoint:normalized,identity:validated,readOnly:true,health:'unknown',lastCheck:null};
    nodes.set(node.id,node);return {...node};
  },
  listNodes(){return [...nodes.values()].map(node=>({...node,identity:{...node.identity}}));},
  async healthCheck(nodeOrId){
    const node=typeof nodeOrId==='string'?nodes.get(nodeOrId):nodeOrId;if(!node)throw new Error('Nodo personalizado no registrado.');
    const started=performance.now();
    try{
      const response=await fetch(`${node.endpoint}/`,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      let identity={};try{identity=await response.json();}catch{}
      node.identity=validateIdentity(identity);node.health='healthy';node.latencyMs=Math.round(performance.now()-started);node.lastCheck=new Date().toISOString();return {...node};
    }catch(error){node.health='unhealthy';node.lastCheck=new Date().toISOString();throw new Error(`Nodo no saludable: ${error.message}`);}
  },
  canSign(nodeOrId){const node=typeof nodeOrId==='string'?nodes.get(nodeOrId):nodeOrId;return Boolean(node&&node.readOnly===false&&node.health==='healthy');},
  signingGuard(nodeOrId){if(!this.canSign(nodeOrId))throw new Error('El nodo personalizado es solo lectura o no ha pasado la comprobación de salud.');return true;}
};
