/*
 * WebDollar PWA - módulo Marketplace.
 *
 * Este adaptador solo habla con un endpoint de Marketplace que anuncie de
 * forma explícita el protocolo `webdollar-marketplace-v1`. No crea listados
 * locales ni convierte una firma en una venta: el nodo debe aceptar y devolver
 * la operación antes de considerarla transmitida. Si el transporte cae después
 * de una confirmación humana, conserva la orden firmada en memoria como
 * pendiente de red; nunca la presenta como transmitida.
 */
const DEFAULT_EXPLORER='https://webdollar.cloudns.nz/api';
const ORDER_FORMAT='webdollar-market-order-v1';
const MARKETPLACE_PROTOCOL='webdollar-marketplace-v1';
const MAX_REQUEST_MS=6000;
const MARKETPLACE_UNAVAILABLE='El endpoint Mainnet no anuncia un protocolo Marketplace de WebDollar.';
const WEBDOLLAR2_ASSET_API='webdollar2-assets';

function normalizeText(value,label,max=128){
  const text=String(value??'').trim();
  if(!text||text.length>max||/[\u0000-\u001f]/.test(text))throw new Error(`${label} inválido.`);
  return text;
}
function normalizeAmount(value){
  const amount=String(value??'').trim();
  if(!/^\d+(?:\.\d{1,4})?$/.test(amount)||Number(amount)<=0)throw new Error('La cantidad del activo debe ser mayor que cero.');
  return amount;
}
function normalizePrice(value){
  const price=String(value??'').trim();
  if(!/^\d+(?:\.\d{1,4})?$/.test(price)||Number(price)<=0)throw new Error('El precio debe ser un número WEBD mayor que cero.');
  return price;
}
function normalizeEndpoint(value){return String(value||'').replace(/\/$/,'');}
async function requestJson(url,{method='GET',body}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),MAX_REQUEST_MS);
  try{
    const options={method,signal:controller.signal,cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    const response=await fetch(url,options);
    if(!response.ok){const error=new Error(`HTTP ${response.status}`);error.status=response.status;throw error;}
    let data;
    try{data=await response.json();}catch{const error=new Error('Respuesta Marketplace inválida.');error.protocolResponse=true;throw error;}
    if(!data||typeof data!=='object'){const error=new Error('Respuesta Marketplace inválida.');error.protocolResponse=true;throw error;}
    return data;
  }finally{clearTimeout(timer);}
}
function readHeight(identity){
  const height=Number(identity?.height??identity?.top??identity?.blocks?.length);
  if(!Number.isSafeInteger(height)||height<1)throw new Error('La respuesta no contiene una altura Mainnet válida.');
  return height;
}
function looksLikeWebDollar2(value){
  const text=JSON.stringify(value??{}).toLowerCase();
  return /pandorapay|webdollar2/.test(text)||Object.hasOwn(value??{},'totalDifficulty')&&Object.hasOwn(value??{},'assets');
}
function formatUnits(value,decimals){
  const amount=BigInt(String(value??0));
  const places=Math.max(0,Number(decimals)||0);
  if(!places)return amount.toString();
  const raw=amount.toString().padStart(places+1,'0');
  const whole=raw.slice(0,-places),fraction=raw.slice(-places).replace(/0+$/,'');
  return fraction?`${whole}.${fraction}`:whole;
}
function normalizeAsset(asset){
  if(!asset||typeof asset!=='object')throw new Error('El nodo devolvió un activo inválido.');
  return {id:normalizeText(asset.id??asset.assetId??asset.ticker,'Asset ID'),symbol:normalizeText(asset.symbol??asset.ticker??asset.id,'Símbolo',32),name:normalizeText(asset.name??asset.symbol??asset.id,'Nombre',128),balance:String(asset.balance??asset.amount??'0'),native:asset.native===true,decimals:Number(asset.decimals)||0};
}
function normalizeListing(listing){
  if(!listing||typeof listing!=='object')throw new Error('El nodo devolvió un listado inválido.');
  const id=normalizeText(listing.id??listing.listingId,'Listing ID',160);
  return {id,listingId:id,assetId:normalizeText(listing.assetId,'Asset ID'),amount:normalizeAmount(listing.amount),price:normalizePrice(listing.price),seller:normalizeText(listing.seller??listing.owner,'Vendedor',160),status:String(listing.status||'active')};
}
function pendingId(){
  return globalThis.crypto?.randomUUID?.()||`pending-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}
function isTransportFailure(error){
  return !error?.protocolResponse&&(error?.name==='AbortError'||error?.status===408||error?.status===429||Number(error?.status)>=500||!Number.isInteger(error?.status));
}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function queueOperation(module,kind,signedOrder){
  const operation={id:pendingId(),kind,order:clone(signedOrder),queuedAt:new Date().toISOString(),status:'pending-network',reason:module.connected?'marketplace-protocol-unavailable':'transport-unavailable'};
  module.pendingOperations.push(operation);
  module.core?.events.emit('marketplace:queued',clone(operation));
  return {status:'queued',queued:true,pendingId:operation.id};
}
async function postOrder(module,kind,signedOrder){
  const path=kind==='listing'?'/marketplace/listings':'/marketplace/purchases';
  const response=await requestJson(module.apiBase+path,{method:'POST',body:{order:signedOrder}});
  if(kind==='listing'){
    if(!response.listing||!response.listing.id){const error=new Error('El nodo no confirmó la publicación del listado.');error.protocolResponse=true;throw error;}
    const listing=normalizeListing(response.listing);
    module.listings=[listing,...module.listings.filter(item=>item.id!==listing.id)];
    module.core?.events.emit('marketplace:listing',clone(response.listing));
  }else{
    if(!response.purchaseId&&!response.txId&&!response.status){const error=new Error('El nodo no confirmó la compra.');error.protocolResponse=true;throw error;}
    module.core?.events.emit('marketplace:purchase',clone(response));
  }
  return response;
}
async function fetchWebDollar2Assets(module,address){
  const response=await requestJson(module.apiBase+'/account?address='+encodeURIComponent(address));
  const accounts=Array.isArray(response.accounts)?response.accounts:[];
  const extras=Array.isArray(response.accountsExtra)?response.accountsExtra:[];
  const assets=[];
  for(let index=0;index<accounts.length;index++){
    const account=accounts[index],assetHash=extras[index]?.asset??account.asset;
    if(typeof assetHash!=='string'||!assetHash)continue;
    const metadataResponse=await requestJson(module.apiBase+'/asset?hash='+encodeURIComponent(assetHash));
    const metadata=metadataResponse.asset;
    if(!metadata||typeof metadata!=='object')throw new Error('El nodo WebDollar2 no devolvió metadatos del activo.');
    assets.push(normalizeAsset({id:metadata.identification||assetHash,symbol:metadata.ticker||metadata.identification||assetHash,name:metadata.name||metadata.ticker||assetHash,balance:formatUnits(account.balance,metadata.decimalSeparator),decimals:metadata.decimalSeparator,native:metadata.ticker==='WEBD'||metadata.identification==='WEBD'}));
  }
  return assets;
}
export const marketplaceModule={
  id:'marketplace',name:'Mercado WebDollar',core:null,connected:false,endpoint:null,apiBase:null,assetProtocolSupported:false,marketplaceProtocolSupported:false,assetApiFlavor:null,assets:[],listings:[],pendingOperations:[],lastError:null,lastMessage:'',
  init(core){this.core=core;this.connected=false;this.endpoint=null;this.apiBase=null;this.assetProtocolSupported=false;this.marketplaceProtocolSupported=false;this.assetApiFlavor=null;this.assets=[];this.listings=[];this.pendingOperations=[];this.lastError=null;this.lastMessage='';},
  async connect(endpoint=this.core?.getNetworkSource?.()||DEFAULT_EXPLORER){
    this.endpoint=normalizeEndpoint(endpoint);this.apiBase=this.endpoint;this.lastError=null;this.lastMessage='';
    try{
      const identity=await requestJson(this.endpoint.endsWith('/api')?this.endpoint+'/chain':this.endpoint+'/');
      let chain=identity,height;
      try{height=readHeight(chain);}catch{chain=await requestJson(this.apiBase+'/chain');height=readHeight(chain);}
      const isWebDollar2=looksLikeWebDollar2(identity)||looksLikeWebDollar2(chain);
      this.connected=true;this.assetProtocolSupported=false;this.marketplaceProtocolSupported=false;this.assetApiFlavor=null;
      try{
        const capability=await requestJson(this.apiBase+'/marketplace/capabilities');
        const supported=capability.protocol===MARKETPLACE_PROTOCOL&&capability.network==='mainnet'&&capability.assets===true&&capability.listings===true;
        this.assetProtocolSupported=supported;this.marketplaceProtocolSupported=supported;this.assetApiFlavor=supported?'marketplace':null;
      }catch(error){
        if(error.status!==404&&error.status!==405)this.lastError=error.message;
      }
      if(!this.assetProtocolSupported&&isWebDollar2){this.assetProtocolSupported=true;this.assetApiFlavor=WEBDOLLAR2_ASSET_API;}
      this.lastMessage=this.marketplaceProtocolSupported?'Protocolo Marketplace Mainnet disponible.':this.assetApiFlavor===WEBDOLLAR2_ASSET_API?'API de Assets WebDollar2 disponible; Marketplace no anunciado.':MARKETPLACE_UNAVAILABLE;
      return {connected:true,endpoint:this.endpoint,height,assetProtocolSupported:this.assetProtocolSupported,marketplaceProtocolSupported:this.marketplaceProtocolSupported,assetApiFlavor:this.assetApiFlavor,message:this.lastMessage};
    }catch(error){
      this.connected=false;this.assetProtocolSupported=false;this.marketplaceProtocolSupported=false;this.assetApiFlavor=null;this.lastError=error?.message||String(error);this.lastMessage=this.lastError;
      return {connected:false,endpoint:this.endpoint,assetProtocolSupported:false,marketplaceProtocolSupported:false,message:this.lastMessage};
    }
  },
  async connectToMarketplace(endpoint){return this.connect(endpoint);},
  async fetchAssets(address=this.core?.getAddress?.()){
    if(!address)throw new Error('Carga una cartera para consultar sus activos.');
    if(!this.connected)await this.connect();
    if(!this.connected)throw new Error(this.lastMessage||'No hay conexión Mainnet.');
    if(!this.assetProtocolSupported){
      const balance=this.core?.getBalance?.();
      this.assets=[{id:'WEBD',symbol:'WEBD',name:'WebDollar',balance:balance===null||balance===undefined?'—':Number(balance).toFixed(4),native:true,decimals:4}];
      this.lastMessage=MARKETPLACE_UNAVAILABLE;
      return {address,assets:this.assets.slice(),tokenAssetsAvailable:false,assetProtocolSupported:false,message:this.lastMessage};
    }
    const assets=this.assetApiFlavor===WEBDOLLAR2_ASSET_API?await fetchWebDollar2Assets(this,address):await (async()=>{const response=await requestJson(this.apiBase+'/address/assets?address='+encodeURIComponent(address));return Array.isArray(response.assets)?response.assets.map(normalizeAsset):[];})();
    this.assets=assets;this.lastMessage='Activos consultados desde el endpoint Marketplace Mainnet.';
    if(this.assetApiFlavor===WEBDOLLAR2_ASSET_API)this.lastMessage='Activos consultados desde la API nativa de WebDollar2.';
    return {address,assets:this.assets.slice(),tokenAssetsAvailable:true,assetProtocolSupported:true,message:this.lastMessage};
  },
  async getListings(){
    if(!this.connected)await this.connect();
    if(!this.connected)throw new Error(this.lastMessage||'No hay conexión Mainnet.');
    if(!this.marketplaceProtocolSupported){this.listings=[];return [];}
    const response=await requestJson(this.apiBase+'/marketplace/listings');
    if(!Array.isArray(response.listings))throw new Error('El nodo no devolvió una lista de ofertas válida.');
    this.listings=response.listings.map(normalizeListing);return this.listings.slice();
  },
  listAssetForSale(assetId,amount,price){
    const data={operation:'list',assetId:normalizeText(assetId,'Asset ID'),amount:normalizeAmount(amount),price:normalizePrice(price)};
    const signer=globalThis.window?.webdollarCore?.signMarketplaceOrder||this.core?.signMarketplaceOrder;
    if(!signer)throw new Error('El Core no expone el hook de firma del Marketplace.');
    return signer(data);
  },
  buyAsset(listingId){
    const listing=this.listings.find(item=>item.id===String(listingId));
    if(!listing)throw new Error('El listado ya no está disponible; actualiza el mercado.');
    const signer=globalThis.window?.webdollarCore?.signMarketplaceOrder||this.core?.signMarketplaceOrder;
    if(!signer)throw new Error('El Core no expone el hook de firma del Marketplace.');
    return signer({operation:'buy',listingId:listing.id,assetId:listing.assetId,amount:listing.amount,price:listing.price,seller:listing.seller});
  },
  getPendingOperations(){return clone(this.pendingOperations);},
  async submitListing(signedOrder){
    if(!signedOrder?.signature||signedOrder.operation!=='list'||signedOrder.format!==ORDER_FORMAT)throw new Error('Orden de venta firmada inválida.');
    if(!this.connected||!this.marketplaceProtocolSupported)return queueOperation(this,'listing',signedOrder);
    try{return await postOrder(this,'listing',signedOrder);}catch(error){if(!isTransportFailure(error))throw error;return queueOperation(this,'listing',signedOrder);}
  },
  async submitPurchase(signedOrder){
    if(!signedOrder?.signature||signedOrder.operation!=='buy'||signedOrder.format!==ORDER_FORMAT)throw new Error('Orden de compra firmada inválida.');
    if(!this.connected||!this.marketplaceProtocolSupported)return queueOperation(this,'purchase',signedOrder);
    try{return await postOrder(this,'purchase',signedOrder);}catch(error){if(!isTransportFailure(error))throw error;return queueOperation(this,'purchase',signedOrder);}
  },
  async retryPending(){
    if(!this.connected||!this.marketplaceProtocolSupported)return {attempted:0,transmitted:0,pending:this.getPendingOperations()};
    const pending=[...this.pendingOperations],transmitted=[];
    for(const operation of pending){
      try{
        const response=await postOrder(this,operation.kind,operation.order);
        this.pendingOperations=this.pendingOperations.filter(item=>item.id!==operation.id);
        transmitted.push({pendingId:operation.id,response});
      }catch(error){
        if(!isTransportFailure(error))this.lastError=error?.message||String(error);
        break;
      }
    }
    return {attempted:pending.length,transmitted:transmitted.length,pending:this.getPendingOperations(),transmittedItems:transmitted};
  },
  getState(){return {connected:this.connected,endpoint:this.endpoint,assetProtocolSupported:this.assetProtocolSupported,marketplaceProtocolSupported:this.marketplaceProtocolSupported,assetApiFlavor:this.assetApiFlavor,assets:this.assets.slice(),listings:this.listings.slice(),pendingOperations:this.getPendingOperations(),lastError:this.lastError,lastMessage:this.lastMessage};}
};
