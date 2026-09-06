import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey,createPublicKey,verify,createHash,webcrypto } from 'node:crypto';
import { EventBus } from '../src/core/event-bus.js';
import { WalletCore } from '../src/core/wallet.js';
import { MainnetNetworkAdapter } from '../src/core/network.js';
import { PluginManager } from '../src/core/plugin-manager.js';
import { parseWebdWallet,privateKeyWif,bytesToHex,encodeWebdAddress,decodeWebdAddress,webdBytes,concatWebdBytes,uintToBytes } from '../src/core/webd-format.js';
import { calculateTransfer,buildAndSignMainnetTransaction,inspectSignedTransaction,rpcEnvelope,FEE_ADDRESS,FIXED_FEE_UNITS,getPolicyIssues,minerFeeUnitsForBytes } from '../src/core/transaction.js';
import { socketEventPacket,socketBinaryEventPacket } from '../src/core/native-socket.js';
import { fixtureAccount,fixtureFile,fixtureSnapshot } from './fixtures.mjs';
import { encryptWallet,decryptWallet } from '../src/core/wallet.js';
import { offlineModule } from '../src/modules/offline.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;

test('fixture Ed25519 RFC8032: private/public/address export compatible',()=>{
  const a=fixtureAccount();
  assert.equal(bytesToHex(a.publicKey),'d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  assert.deepEqual(decodeWebdAddress(a.address),a.unencodedAddress);
  assert.deepEqual(parseWebdWallet(fixtureFile().bytes).addresses[0].secretKey,a.secretKey);
  assert.equal(parseWebdWallet(fixtureFile().bytes).addresses[0].address,a.address);
});
test('validates WIF and detects corruption and mismatched address/keys',()=>{
  const fixture=fixtureFile();
  const json=JSON.parse(new TextDecoder().decode(fixture.bytes));
  json.address=FEE_ADDRESS;
  assert.throws(()=>parseWebdWallet(new TextEncoder().encode(JSON.stringify(json))),/corresponde/);
  const bad=privateKeyWif(fixtureAccount().secretKey);bad[12]^=1;
  assert.throws(()=>parseWebdWallet(bad),/no válida/);
  assert.throws(()=>decodeWebdAddress(FEE_ADDRESS.replace('Pay','Paz')),/Checksum/);
});
test('reads complete serialized wallet and private-key binary export',()=>{
  const a=fixtureAccount(),wif=privateKeyWif(a.secretKey);
  const record=concatWebdBytes(Uint8Array.of(30),webdBytes(a.address),Uint8Array.of(20),a.unencodedAddress,Uint8Array.of(32),a.publicKey,Uint8Array.of(69),wif);
  const serialized=concatWebdBytes(uintToBytes(1,4),record);
  assert.equal(parseWebdWallet(serialized).addresses[0].address,a.address);
  assert.equal(parseWebdWallet(concatWebdBytes(Uint8Array.of(69),wif,Uint8Array.of(3,2))).addresses[0].address,a.address);
  assert.throws(()=>parseWebdWallet(serialized.slice(0,-1)));
});
test('comisión fija de 10 WEBD, exacta y separada del minero',()=>{
  assert.deepEqual([calculateTransfer('100').recipientUnits,calculateTransfer('100').feeUnits],[900000,FIXED_FEE_UNITS]);
  assert.equal(calculateTransfer('20').recipientAmount,10);
  for(const value of ['0','-1','0.01','10','0.01001','NaN','Infinity','1e6'])assert.throws(()=>calculateTransfer(value));
});
test('signed 167-byte transaction validated with independent Node Ed25519 and LE amounts',()=>{
  const a=fixtureAccount();
  const signed=buildAndSignMainnetTransaction({...a,toAddress:FEE_ADDRESS,amount:'100',nonce:257,timeLock:0x010203});
  const raw=Buffer.from(signed.serializedTransactionBase64,'base64');
  assert.equal(raw.length,167);assert.equal(raw.readUInt16BE(1),257);assert.equal(raw.readUIntBE(3,3),0x010203);
  assert.equal(raw.readUIntLE(103,6),1000000+minerFeeUnitsForBytes());assert.equal(raw[109],0);
  assert.equal(raw.readUIntLE(133,6),900000);assert.equal(raw.readUIntLE(160,6),100000);
  const to=raw.subarray(112),amount=raw.subarray(103,110);
  const message=Buffer.concat([raw.subarray(0,6),a.unencodedAddress,a.publicKey,a.publicKey,Buffer.from([1]),amount,to]);
  const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),a.publicKey])});
  assert.equal(verify(null,message,key,raw.subarray(39,103)),true);
  const expectedId=createHash('sha256').update(createHash('sha256').update(raw).digest()).digest('hex');
  assert.equal(signed.txId,expectedId);
  const envelope=JSON.parse(atob(rpcEnvelope(signed.serializedTransactionBase64)));
  assert.deepEqual(envelope.transaction.data,[...raw]);
  assert.equal(inspectSignedTransaction(signed.serializedTransactionBase64).recipientAmount,90);
  raw[50]^=1;assert.throws(()=>inspectSignedTransaction(raw.toString('base64')),/Firma/);
});
test('policy distinguishes fixed treasury output minimum from miner fee',()=>{
  assert.throws(()=>calculateTransfer('10'));
  assert.equal(getPolicyIssues(calculateTransfer('20')).length,1);
  assert.match(getPolicyIssues(calculateTransfer('20'))[0],/minero/);
  assert.equal(getPolicyIssues(calculateTransfer('100')).length,1);
});
test('wallet import exposes no key, offline receive never changes chain balance; replay rejected',async()=>{
  const events=new EventBus(),net={
    subscribeBalance(address,handler){handler(fixtureSnapshot(address));return ()=>{};},
    async getSnapshot(address){return fixtureSnapshot(address);}
  };
  const issuer=new WalletCore(events,net);await issuer.importFile(fixtureFile());
  assert.equal(issuer.getBalance(),333);
  assert.equal(issuer.getPrivateSeed,undefined);assert.equal(issuer.state,undefined);
  assert.equal(JSON.stringify(issuer.publicState()).includes(bytesToHex(fixtureAccount().secretKey)),false);
  const recipient=new WalletCore(new EventBus(),net);recipient.watch(FEE_ADDRESS);
  const tx=issuer.prepareOffline({to:FEE_ADDRESS,amount:'100'});
  assert.equal(issuer.getBalance(),333);
  recipient.receiveSigned(tx.serializedTransactionBase64);assert.equal(recipient.getBalance(),333);
  assert.throws(()=>recipient.receiveSigned(tx.serializedTransactionBase64),/ya está/);
  assert.throws(()=>issuer.prepareOffline({to:FEE_ADDRESS,amount:'10'}),/nonce/);
  issuer.lock();assert.equal(issuer.isUnlocked,false);
  assert.throws(()=>issuer.prepareOffline({to:FEE_ADDRESS,amount:'10'}),/privada/);
});
test('recipient relays an offline voucher without using recipient nonce or balance',async()=>{
  const senderEvents=new EventBus(),sent=[];
  const senderNetwork={
    subscribeBalance(address,handler){handler({...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true});return ()=>{};},
    async getSnapshot(address){return {...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true};}
  };
  const sender=new WalletCore(senderEvents,senderNetwork);await sender.importFile(fixtureFile());
  const voucher=sender.prepareOffline({to:FEE_ADDRESS,amount:'100'});
  const recipientNetwork={
    subscribeBalance(address,handler){handler({...fixtureSnapshot(address),balance:0,nonce:65535,fetchedAt:Date.now(),readOnly:false,synchronized:true});return ()=>{};},
    async getSnapshot(){throw new Error('recipient snapshot must not validate sender nonce');},
    async sendRawTransaction(base64){sent.push(base64);return {txId:voucher.txId,status:'submitted'};}
  };
  const recipient=new WalletCore(new EventBus(),recipientNetwork);recipient.watch(FEE_ADDRESS);
  recipient.receiveSigned(voucher.serializedTransactionBase64);
  const result=await recipient.broadcastReceived(voucher.serializedTransactionBase64);
  assert.equal(result.status,'submitted');assert.deepEqual(sent,[voucher.serializedTransactionBase64]);
});
test('node adapter rejects malformed balance instead of displaying zero',async()=>{
  const events=new EventBus();
  const net=new MainnetNetworkAdapter(events,{httpEndpoint:'https://node.example',fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('/top')?{top:2000000,is_synchronized:true}:url.includes('/nonce/')?{result:true,nonce:0}:url.includes('/balance/')?{result:true}:{protocol:'WebDollar',blocks:{length:2000000}}})});
  await assert.rejects(()=>net.getSnapshot(FEE_ADDRESS),/saldo inválida/);
});
test('explorer mirror reads live-style chain data but is explicitly read-only',async()=>{
  const events=new EventBus();
  const net=new MainnetNetworkAdapter(events,{httpEndpoint:'https://webdollar.cloudns.nz/api',fetchImpl:async url=>({
    ok:true,
    json:async()=>url.endsWith('/chain')?{height:5969836,hash:'0000000000000279c2fac9bfc8668584'}:{balance:11238,nonce:32}
  })});
  const snapshot=await net.getSnapshot(FEE_ADDRESS);
  assert.equal(snapshot.balance,1.1238);
  assert.equal(snapshot.nonce,32);
  assert.equal(snapshot.readOnly,true);
  assert.equal(snapshot.synchronized,true);
});
test('broadcast policy prevents network mutation for incompatible transfer',async()=>{
  let fetches=0;
  const net=new MainnetNetworkAdapter(new EventBus(),{rpcEndpoint:'https://node.example',fetchImpl:()=>{fetches++;throw new Error('Must not be called');}});
  const signed=buildAndSignMainnetTransaction({...fixtureAccount(),toAddress:FEE_ADDRESS,amount:'15',nonce:0,timeLock:100});
  await assert.rejects(()=>net.sendRawTransaction(signed.serializedTransactionBase64),/salida/);
  assert.equal(fetches,0);
});
test('eligible mainnet transfer carries miner difference and requires exact RPC acknowledgement',async()=>{
  let request=null;
  const signed=buildAndSignMainnetTransaction({...fixtureAccount(),toAddress:FEE_ADDRESS,amount:'1000',nonce:7,timeLock:100});
  assert.equal(signed.recipientAmount,990);
  assert.equal(signed.fee,10);
  assert.equal(signed.minerFee,9.686);
  assert.equal(signed.totalDebit,1009.686);
  assert.deepEqual(signed.policyIssues,[]);
  const net=new MainnetNetworkAdapter(new EventBus(),{rpcEndpoint:'https://node.example',fetchImpl:async(url,options)=>{
    request={url,options,body:JSON.parse(options.body)};
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:request.body.id,result:signed.txId})};
  }});
  const result=await net.sendRawTransaction(signed.serializedTransactionBase64);
  assert.deepEqual(result,{txId:signed.txId,status:'submitted'});
  assert.equal(request.url,'https://node.example');
  assert.equal(request.body.method,'sendRawTransaction');
  assert.equal(typeof request.body.params[0],'string');
  assert.equal(JSON.parse(atob(request.body.params[0])).transaction.data.length,167);
});
test('retries the same signed bytes after an ambiguous transport failure',async()=>{
  const account=fixtureAccount(),events=new EventBus(),sent=[];let attempts=0;
  const net={
    async getSnapshot(address){return {...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true};},
    subscribeBalance(address,handler){handler({...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true});return ()=>{};},
    async sendRawTransaction(base64){sent.push(base64);attempts++;if(attempts===1)throw new Error('transporte caído');return {txId:inspectSignedTransaction(base64).txId,status:'submitted'};}
  };
  const wallet=new WalletCore(events,net);await wallet.importFile(fixtureFile());
  const first=wallet.sendTransaction({to:FEE_ADDRESS,amount:'100'});
  await assert.rejects(first,/transporte caído/);
  const second=await wallet.sendTransaction({to:FEE_ADDRESS,amount:'100'});
  assert.equal(second.status,'submitted');assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);
});
test('plugin initialization and runtime errors are isolated from wallet',async()=>{
  const events=new EventBus(),hooks={getBalance:()=>333,events},manager=new PluginManager(hooks,events);
  manager.register({id:'broken',init(){throw new Error('deliberate test failure');}});
  let disposed=false;
  manager.register({id:'healthy',init(){},dispose(){disposed=true;}});
  await manager.initializeAll();assert.equal(manager.getStatus('broken'),'failed');assert.equal(manager.getStatus('healthy'),'active');
  events.emit('module:error',{id:'healthy',error:{message:'Worker crashed'}});assert.equal(manager.getStatus('healthy'),'failed');assert.equal(disposed,true);
  assert.equal(hooks.getBalance(),333);
});

test('AES-GCM encrypted wallet roundtrip rejects a wrong password',async()=>{
  const clear=JSON.stringify({version:'0.1',address:fixtureAccount().address,privateKey:'sensitive-test-material'});
  const encrypted=await encryptWallet(clear,'correct horse battery');
  assert.notEqual(encrypted,clear);assert.equal(await decryptWallet(encrypted,'correct horse battery'),clear);
  await assert.rejects(()=>decryptWallet(encrypted,'wrong password'),/descifrar|password/i);
});

test('offline v2 envelope rejects the same voucher and nonce twice',async()=>{
  const senderNetwork={subscribeBalance(address,handler){handler({...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true});return ()=>{};},async getSnapshot(address){return {...fixtureSnapshot(address),fetchedAt:Date.now(),readOnly:false,synchronized:true};}};
  const sender=new WalletCore(new EventBus(),senderNetwork);await sender.importFile(fixtureFile());
  offlineModule.init({prepareOffline:data=>sender.prepareOffline(data),getSnapshot:()=>sender.publicState().snapshot});
  const packet=offlineModule.sendViaNFC('100',FEE_ADDRESS);
  const recipient=new WalletCore(new EventBus(),senderNetwork);recipient.watch(FEE_ADDRESS);
  offlineModule.init({getAddress:()=>FEE_ADDRESS,getSnapshot:()=>recipient.publicState().snapshot,receiveSigned:base64=>recipient.receiveSigned(base64),requestClaim:()=>({reviewRequired:true,txId:packet.voucher.txId})});
  const received=offlineModule.receiveViaNFC(packet.payload);assert.equal(received.recipientAmount,90);
  assert.throws(()=>offlineModule.receiveViaNFC(packet.payload),/nonce|registrado/i);
});

test('native WebDollar Socket.IO packets are deterministic',()=>{
  assert.equal(socketEventPacket('api/top',{}),'42["api/top",{}]');
  assert.match(socketBinaryEventPacket('transactions/new-pending-transaction',1),/^451-/);
  assert.match(socketBinaryEventPacket('transactions/new-pending-transaction',1),/_placeholder/);
});
