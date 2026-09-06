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
  getAddress():string|null;getBalance():number|null;events:IEventBus;
  getNetworkSource?():string|null;signPoSHeader?(header:Uint8Array):{signature:Uint8Array;publicKey:Uint8Array};
  prepareOffline(data:SendInput):SignedTransaction;
  receiveSigned(base64:string):SignedTransaction;
  requestClaim(base64:string):{reviewRequired:true;txId:string};
}
export interface IPlugin {id:string;name:string;init(core:IModuleHooks):void|Promise<void>;dispose?():void;}
export interface IWebDollarCore {
  getAddress():string|null;getBalance():number|null;getState():PublicWalletState;
  sendTransaction(data:SendInput):TransferQuote&{reviewRequired:true};
  events:IEventBus;registerModule(plugin:IPlugin):void;initializeModule(id:string):Promise<void>;
  getModules():Array<{id:string;name:string;status:string;error:string|null}>;
  attachMiningEngine(engine:IMiningEngine):void;attachMiningEngineUrl(url:string):void;
}
export interface IMiningEngine {start(options:{address:string|null;balance:number|null;onRate:(rate:number)=>void}):void|Promise<void>;stop():void;}
export interface IMiningModule extends IPlugin {startMining():Promise<void>;stopMining():void;getHashRate():number;}
export interface IOfflineModule extends IPlugin {
  prepareEcash(amount:string|number,to:string):SignedTransaction;
  sendViaNFC(amount:string|number,to:string):{transport:'qr';voucher:SignedTransaction;payload:string};
  writeViaNFC(amount:string|number,to:string):Promise<{transport:'nfc'|'qr';voucher:SignedTransaction;payload:string}>;
  readViaNFC():Promise<string>;
  receiveViaNFC(payload:string):SignedTransaction;
  reclaim(payload:string):{reviewRequired:true;txId:string};
}
