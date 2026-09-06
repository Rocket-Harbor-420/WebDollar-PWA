export interface PublicWalletState {
  address: string|null;
  balance: number|null;
  snapshot: ChainSnapshot|null;
  locked: boolean;
  history: SignedTransaction[];
}
export interface ChainSnapshot {address:string;balance:number;nonce:number;height:number;synchronized:boolean;source:string;fetchedAt:number;}
export interface SendInput {to:string;amount:string|number;}
export interface TransferQuote {
  from:string|null;to:string;amount:number;recipientAmount:number;fee:number;
  feeAddress:string;totalDebit:number;inputUnits:number;recipientUnits:number;feeUnits:number;minerFee:number;minerFeeUnits:number;policyIssues:string[];
}
export interface SignedTransaction extends TransferQuote {
  txId:string;nonce:number;timeLock:number;serializedTransactionBase64:string;network:'mainnet';
  status?:'signed'|'offline-signed'|'offline-received'|'submitted'|'mempool'|'confirmed'|'unverified';
  createdAt?:string;direction?:'in'|'out';
}
export interface IEventBus {on(event:string,handler:(payload:any)=>void):()=>void;off(event:string,handler:(payload:any)=>void):void;emit(event:string,payload?:unknown):void;}
export interface IModuleHooks {
  getAddress():string|null;getBalance():number|null;getSnapshot?():ChainSnapshot|null;events:IEventBus;
  getNetworkSource?():string|null;signPoSHeader?(header:Uint8Array):{signature:Uint8Array;publicKey:Uint8Array};
  checkTransaction?(txId:string):Promise<{status:string;txId?:string;height?:number}>;
  signMarketplaceOrder(data:{operation:'list'|'buy';assetId:string;amount:string|number;price:string|number;listingId?:string;seller?:string}):{reviewRequired:true;operation:'list'|'buy';assetId:string;amount:string;price:string;listingId?:string;seller?:string};
  prepareOffline(data:SendInput):SignedTransaction;
  receiveSigned(base64:string):SignedTransaction;
  requestClaim(base64:string):{reviewRequired:true;txId:string};
}
export interface IPlugin {id:string;name:string;init(core:IModuleHooks):void|Promise<void>;dispose?():void;}
export interface IWebDollarCore {
  getAddress():string|null;getBalance():number|null;getState():PublicWalletState;
  sendTransaction(data:SendInput):TransferQuote&{reviewRequired:true};
  signMarketplaceOrder(data:{assetId:string;price:string|number}):{reviewRequired:true;assetId:string;price:string};
  events:IEventBus;registerModule(plugin:IPlugin):void;initializeModule(id:string):Promise<void>;
  getModules():Array<{id:string;name:string;status:string;error:string|null}>;
  attachMiningEngine(engine:IMiningEngine):void;attachMiningEngineUrl(url:string):void;
}
export interface MiningMetrics {accepted:number;rejected:number;latencyMs:number|null;hashes:number;jobs:number;uptimeMs:number;running:boolean;}
export interface MiningPool {id:string;name:string;endpoint:string;network:'mainnet';custom?:boolean;}
export interface IMiningEngine {start(options:{address:string|null;balance:number|null;onRate:(rate:number)=>void;onMetrics?:(metrics:Partial<MiningMetrics>)=>void}):void|Promise<void>;stop():void;}
export interface IMiningModule extends IPlugin {startMining():Promise<void>;stopMining():void;getHashRate():number;getMetrics():MiningMetrics;getPools():MiningPool[];setPool(id:string):MiningPool;addCustomPool(endpoint:string,name?:string):MiningPool;}
export interface IOfflineModule extends IPlugin {
  prepareEcash(amount:string|number,to:string):SignedTransaction&{issuerNonce:number;expiresAtHeight:number|null;voucherId:string;envelope:OfflineVoucherEnvelope};
  sendViaNFC(amount:string|number,to:string):{transport:'qr';voucher:SignedTransaction;payload:string;envelope:OfflineVoucherEnvelope};
  writeViaNFC(amount:string|number,to:string):Promise<{transport:'nfc'|'qr';voucher:SignedTransaction;payload:string;envelope:OfflineVoucherEnvelope}>;
  readViaNFC():Promise<string>;
  receiveViaNFC(payload:string):SignedTransaction;
  reclaim(payload:string):{reviewRequired:true;txId:string};
  verifyOnChain(payload:string):Promise<{status:string;txId:string}>;
}
export interface OfflineVoucherEnvelope {format:'webdollar-ecash-v2';version:2;voucherId:string;issuer:string;issuerNonce:number;createdAt:string;expiresAtHeight:number|null;transaction:string;}
export interface IShareModule extends IPlugin {shareAddress(platform:'whatsapp'|'telegram'|'messenger',address?:string):string;shareVoucher(platform:'whatsapp'|'telegram'|'messenger',payload:string):string;}
export interface MarketplaceOrder {format:'webdollar-market-order-v1';network:'mainnet';type:'listing'|'purchase';operation:'list'|'buy';owner:string;assetId:string;amount:string;price:string;createdAt:string;listingId?:string;seller?:string;orderId?:string;publicKey?:string;signature?:string;status?:string;}
export interface IMarketplaceModule extends IPlugin {connect(endpoint?:string):Promise<{connected:boolean;endpoint:string|null;height?:number;assetProtocolSupported:boolean;message:string}>;connectToMarketplace(endpoint?:string):Promise<{connected:boolean;endpoint:string|null;height?:number;assetProtocolSupported:boolean;message:string}>;fetchAssets(address?:string):Promise<{address:string;assets:Array<{id:string;symbol:string;name:string;balance:string;native:boolean}>;tokenAssetsAvailable:boolean;assetProtocolSupported:boolean;message:string}>;listAssetForSale(assetId:string,amount:string|number,price:string|number):{reviewRequired:true;operation:'list';assetId:string;amount:string;price:string};buyAsset(listingId:string):{reviewRequired:true;operation:'buy';listingId:string;assetId:string;amount:string;price:string;seller:string};getListings():Promise<Array<{id:string;listingId:string;assetId:string;amount:string;price:string;seller:string;status:string}>>;submitListing(order:MarketplaceOrder):Promise<unknown>;submitPurchase(order:MarketplaceOrder):Promise<unknown>;}
export interface CustomNode {id:string;label:string;endpoint:string;identity:{protocol:string;network:string;nodeId:string;version:string};readOnly:boolean;health:'unknown'|'healthy'|'unhealthy';}
export interface ICustomNodesModule extends IPlugin {addNode(input:{endpoint:string;identity?:Partial<CustomNode['identity']>;label?:string}):CustomNode;listNodes():CustomNode[];healthCheck(node:string|CustomNode):Promise<CustomNode>;signingGuard(node:string|CustomNode):true;}
export interface IAssetAdapter {id:string;network:string;assets():string[];quote(input:unknown):Promise<unknown>;buildUnsigned(input:unknown):Promise<unknown>;}
export interface INetworkAdapter {id:string;network:string;getBalance(address:string):Promise<number>;getNonce(address:string):Promise<number>;broadcast(serialized:string):Promise<{txId:string;status:string}>;}
export interface HardwareSigner {transport:'usb'|'hid';connect():Promise<void>;getPublicKey(path:string):Promise<Uint8Array>;signHash(hash:Uint8Array):Promise<Uint8Array>;disconnect():Promise<void>;}
