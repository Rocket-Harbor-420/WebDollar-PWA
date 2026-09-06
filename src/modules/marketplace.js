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
function protocolError(){return new Error(MARKETPLACE_UNAVAILABLE);}
async function requestJson(url,{method='GET',body}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),MAX_REQUEST_MS);
  try{
    const options={method,signal:controller.signal,cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    const response=await fetch(url,options);
    if(!response.ok){const error=new Error(`HTTP ${response.status}`);error.status=response.status;throw error;}
    const data=await response.json();
    if(!data||typeof data!=='object')throw new Error('Respuesta Marketplace inválida.');
    return data;
  }finally{clearTimeout(timer);}
}
function readHeight(identity){
  const height=Number(identity?.height??identity?.top??identity?.blocks?.length);
  if(!Number.isSafeInteger(height)||height<1)throw new Error('La respuesta no contiene una altura Mainnet válida.');
  return height;
}
function normalizeAsset(asset){
  if(!asset||typeof asset!=='object')throw new Error('El nodo devolvió un activo inválido.');
  return {id:normalizeText(asset.id??asset.assetId??asset.ticker,'Asset ID'),symbol:normalizeText(asset.symbol??asset.ticker??asset.id,'Símbolo',32),name:normalizeText(asset.name??asset.symbol??asset.id,'Nombre',128),balance:String(asset.balance??asset.amount??'0'),native:asset.native===true};
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
  return error?.name==='AbortError'||error?.status===408||error?.status===429||Number(error?.status)>=500||!Number.isInteger(error?.status);
}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function queueOperation(module,kind,signedOrder){
  const operation={id:pendingId(),kind,order:clone(signedOrder),queuedAt:new Date().toISOString(),status:'pending-network'};
  module.pendingOperations.push(operation);
  module.core?.events.emit('marketplace:queued',clone(operation));
  return {status:'queued',queued:true,pendingId:operation.id};
}
async function postOrder(module,kind,signedOrder){
  const path=kind==='listing'?'/marketplace/listings':'/marketplace/purchases';
  const response=await requestJson(module.apiBase+path,{method:'POST',body:{order:signedOrder}});
  if(kind==='listing'){
    if(!response.listing||!response.listing.id)throw new Error('El nodo no confirmó la publicación del listado.');
    const listing=normalizeListing(response.listing);
    module.listings=[listing,...module.listings.filter(item=>item.id!==listing.id)];
    module.core?.events.emit('marketplace:listing',clone(response.listing));
  }else{
    if(!response.purchaseId&&!response.txId&&!response.status)throw new Error('El nodo no confirmó la compra.');
    module.core?.events.emit('marketplace:purchase',clone(response));
  }
  return response;
}
export const marketplaceModule={
  id:'marketplace',name:'Mercado WebDollar',core:null,connected:false,endpoint:null,apiBase:null,assetProtocolSupported:false,assets:[],listings:[],pendingOperations:[],lastError:null,lastMessage:'',
  init(core){this.core=core;this.connected=false;this.endpoint=null;this.apiBase=null;this.assetProtocolSupported=false;this.assets=[];this.listings=[];this.pendingOperations=[];this.lastError=null;this.lastMessage='';},
  async connect(endpoint=this.core?.getNetworkSource?.()||DEFAULT_EXPLORER){
    this.endpoint=normalizeEndpoint(endpoint);this.apiBase=this.endpoint;this.lastError=null;this.lastMessage='';
    try{
      const identity=await requestJson(this.endpoint.endsWith('/api')?this.endpoint+'/chain':this.endpoint+'/');
      const height=readHeight(identity);this.connected=true;this.assetProtocolSupported=false;
      try{
        const capability=await requestJson(this.apiBase+'/marketplace/capabilities');
        this.assetProtocolSupported=capability.protocol===MARKETPLACE_PROTOCOL&&capability.network==='mainnet'&&capability.assets===true&&capability.listings===true;
      }catch(error){
        if(error.status!==404&&error.status!==405)this.lastError=error.message;
      }
      this.lastMessage=this.assetProtocolSupported?'Protocolo Marketplace Mainnet disponible.':MARKETPLACE_UNAVAILABLE;
      return {connected:true,endpoint:this.endpoint,height,assetProtocolSupported:this.assetProtocolSupported,message:this.lastMessage};
    }catch(error){
      this.connected=false;this.assetProtocolSupported=false;this.lastError=error?.message||String(error);this.lastMessage=this.lastError;
      return {connected:false,endpoint:this.endpoint,assetProtocolSupported:false,message:this.lastMessage};
    }
  },
  async connectToMarketplace(endpoint){return this.connect(endpoint);},
  async fetchAssets(address=this.core?.getAddress?.()){
    if(!address)throw new Error('Carga una cartera para consultar sus activos.');
    if(!this.connected)await this.connect();
    if(!this.connected)throw new Error(this.lastMessage||'No hay conexión Mainnet.');
    if(!this.assetProtocolSupported){
      const balance=this.core?.getBalance?.();
      this.assets=[{id:'WEBD',symbol:'WEBD',name:'WebDollar',balance:balance===null||balance===undefined?'—':Number(balance).toFixed(4),native:true}];
      this.lastMessage=MARKETPLACE_UNAVAILABLE;
      return {address,assets:this.assets.slice(),tokenAssetsAvailable:false,assetProtocolSupported:false,message:this.lastMessage};
    }
    const response=await requestJson(this.apiBase+'/address/assets?address='+encodeURIComponent(address));
    const assets=Array.isArray(response.assets)?response.assets.map(normalizeAsset):[];
    this.assets=assets;this.lastMessage='Activos consultados desde el endpoint Marketplace Mainnet.';
    return {address,assets:this.assets.slice(),tokenAssetsAvailable:true,assetProtocolSupported:true,message:this.lastMessage};
  },
  async getListings(){
    if(!this.connected)await this.connect();
    if(!this.connected)throw new Error(this.lastMessage||'No hay conexión Mainnet.');
    if(!this.assetProtocolSupported){this.listings=[];return [];}
    const response=await requestJson(this.apiBase+'/marketplace/listings');
    if(!Array.isArray(response.listings))throw new Error('El nodo no devolvió una lista de ofertas válida.');
    this.listings=response.listings.map(normalizeListing);return this.listings.slice();
  },
  listAssetForSale(assetId,amount,price){
    const data={operation:'list',assetId:normalizeText(assetId,'Asset ID'),amount:normalizeAmount(amount),price:normalizePrice(price)};
    if(this.connected&&!this.assetProtocolSupported)throw protocolError();
    const signer=globalThis.window?.webdollarCore?.signMarketplaceOrder||this.core?.signMarketplaceOrder;
    if(!signer)throw new Error('El Core no expone el hook de firma del Marketplace.');
    return signer(data);
  },
  buyAsset(listingId){
    const listing=this.listings.find(item=>item.id===String(listingId));
    if(!listing)throw new Error('El listado ya no está disponible; actualiza el mercado.');
    if(this.connected&&!this.assetProtocolSupported)throw protocolError();
    const signer=globalThis.window?.webdollarCore?.signMarketplaceOrder||this.core?.signMarketplaceOrder;
    if(!signer)throw new Error('El Core no expone el hook de firma del Marketplace.');
    return signer({operation:'buy',listingId:listing.id,assetId:listing.assetId,amount:listing.amount,price:listing.price,seller:listing.seller});
  },
  getPendingOperations(){return clone(this.pendingOperations);},
  async submitListing(signedOrder){
    if(!signedOrder?.signature||signedOrder.operation!=='list'||signedOrder.format!==ORDER_FORMAT)throw new Error('Orden de venta firmada inválida.');
    if(!this.connected)return queueOperation(this,'listing',signedOrder);
    if(!this.assetProtocolSupported)throw protocolError();
    try{return await postOrder(this,'listing',signedOrder);}catch(error){if(!isTransportFailure(error))throw error;return queueOperation(this,'listing',signedOrder);}
  },
  async submitPurchase(signedOrder){
    if(!signedOrder?.signature||signedOrder.operation!=='buy'||signedOrder.format!==ORDER_FORMAT)throw new Error('Orden de compra firmada inválida.');
    if(!this.connected)return queueOperation(this,'purchase',signedOrder);
    if(!this.assetProtocolSupported)throw protocolError();
    try{return await postOrder(this,'purchase',signedOrder);}catch(error){if(!isTransportFailure(error))throw error;return queueOperation(this,'purchase',signedOrder);}
  },
  async retryPending(){
    if(!this.connected||!this.assetProtocolSupported)return {attempted:0,transmitted:0,pending:this.getPendingOperations()};
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
  getState(){return {connected:this.connected,endpoint:this.endpoint,assetProtocolSupported:this.assetProtocolSupported,assets:this.assets.slice(),listings:this.listings.slice(),pendingOperations:this.getPendingOperations(),lastError:this.lastError,lastMessage:this.lastMessage};}
};
