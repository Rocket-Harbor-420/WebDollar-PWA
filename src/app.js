/*
 * WebDollar PWA - Módulo: app.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { EventBus } from './core/event-bus.js';
import { MainnetNetworkAdapter } from './core/network.js';
import { WalletCore } from './core/wallet.js';
import { PluginManager } from './core/plugin-manager.js';
import { shortAddress } from './core/crypto.js';
import { setQr, scanQrImage } from './core/qr.js';
import { inspectSignedTransaction } from './core/transaction.js';
import { miningModule } from './modules/mining.js';
import { offlineModule } from './modules/offline.js';
import { messengerModule } from './modules/messenger.js';
import { customNodesModule } from './modules/custom-nodes.js';
import { marketplaceModule } from './modules/marketplace.js';
import { initLanguage, loadLanguage, getLanguage, applyTranslations, t, initTheme, loadTheme, getTheme } from './core/i18n.js';

const $=selector=>document.querySelector(selector);
const events=new EventBus(),network=new MainnetNetworkAdapter(events),wallet=new WalletCore(events,network);
let pending=null,inputMode='watch',installPrompt=null,broadcastBusy=false;
const watchedTransactions=new Set();
function toast(message,error=false){
  const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;$('#toast-region').append(node);setTimeout(()=>node.remove(),7000);
}
const localeMap={es:'es-MX',en:'en-US',it:'it-IT',ro:'ro-RO','zh-CN':'zh-CN'};
const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString(localeMap[getLanguage()]||'es-MX',{minimumFractionDigits:2,maximumFractionDigits:4});
function open(id){const dialog=$('#'+id);if(!dialog.open)dialog.showModal();}
function close(id){$('#'+id).close();if(id==='recovery-dialog')$('#mnemonic-words').replaceChildren();if(id==='input-dialog')$('#input-value').value='';if(id==='send-dialog'||id==='marketplace-dialog')pending=null;}
async function copy(value){if(!value)throw new Error(t('toast.noCopy'));await navigator.clipboard.writeText(value);toast(t('toast.copied'));}
function action(selector,handler){$(selector).addEventListener('click',async event=>{try{await handler(event);}catch(error){toast(error.message,true);}});}
function setBusy(button,busy){button.disabled=busy;button.setAttribute('aria-busy',String(busy));}
function requestSend(data){
  if(pending||broadcastBusy)throw new Error(t('errors.reviewBusy'));
  const input=Object.freeze({to:String(data.to),amount:String(data.amount)});
  const quote=wallet.quote(input);pending={kind:'send',data:input,quote};
  showReview(quote);return structuredClone({reviewRequired:true,...quote});
}
function requestClaim(base64){
  if(pending||broadcastBusy)throw new Error(t('errors.reviewBusy'));
  const tx=inspectSignedTransaction(base64);
  if(tx.to!==wallet.getAddress())throw new Error('El vale pertenece a otra dirección.');
  pending={kind:'claim',base64,quote:tx};close('offline-dialog');showReview(tx);return {reviewRequired:true,txId:tx.txId};
}
function requestMarketplaceOrder(data){
  if(pending||broadcastBusy)throw new Error(t('errors.reviewBusy'));
  const input=Object.freeze({operation:data?.operation==='buy'?'buy':'list',assetId:String(data?.assetId||''),amount:String(data?.amount??''),price:String(data?.price??''),listingId:String(data?.listingId||''),seller:String(data?.seller||'')});
  pending={kind:'marketplace',data:input};
  $('#marketplace-confirm-operation').textContent=input.operation==='buy'?t('marketplace.buy'):t('marketplace.listTitle');
  $('#marketplace-confirm-asset').textContent=input.operation==='buy'?input.listingId:input.assetId;
  $('#marketplace-confirm-price').textContent=input.amount+' · '+input.price+' WEBD';
  $('#marketplace-confirm-seller').textContent=input.seller||wallet.getAddress()||'—';
  $('#marketplace-confirm-status').textContent='';
  open('marketplace-dialog');
  return {reviewRequired:true,...input};
}
function showReview(quote){
  $('#confirm-recipient').textContent=quote.to;
  $('#confirm-debit').textContent=fmt(quote.totalDebit)+' WEBD';
  $('#confirm-receive-amount').textContent=fmt(quote.recipientAmount)+' WEBD';
  $('#confirm-fee').textContent=fmt(quote.fee)+' WEBD';
  $('#policy-issues').replaceChildren();
  for(const message of quote.policyIssues){const p=document.createElement('p');p.textContent=message;$('#policy-issues').append(p);}
  $('#send-status').textContent='';$('#send-status').classList.remove('is-error');
  $('#confirm-send').disabled=quote.policyIssues.length>0;
  open('send-dialog');
}
const hooks=Object.freeze({
  getAddress:()=>wallet.getAddress(),getBalance:()=>wallet.getBalance(),getSnapshot:()=>wallet.publicState().snapshot,getNetworkSource:()=>network.activeEndpoint,signPoSHeader:header=>wallet.signPoSHeader(header),checkTransaction:txId=>wallet.checkTransaction(txId),events,
  prepareOffline:data=>wallet.prepareOffline(data),receiveSigned:bytes=>wallet.receiveSigned(bytes),requestClaim,signMarketplaceOrder:requestMarketplaceOrder
});
const plugins=new PluginManager(hooks,events);
plugins.register(miningModule);plugins.register(offlineModule);plugins.register(messengerModule);plugins.register(customNodesModule);plugins.register(marketplaceModule);
window.webdollarCore=Object.freeze({
  getBalance:()=>wallet.getBalance(),getAddress:()=>wallet.getAddress(),getState:()=>wallet.publicState(),
  // Public send hook opens human review. It cannot silently broadcast.
  sendTransaction:requestSend,signMarketplaceOrder:requestMarketplaceOrder,events,
  registerModule:module=>plugins.register(module),initializeModule:id=>plugins.initialize(id),
  getModules:()=>plugins.list(),attachMiningEngine:engine=>miningModule.attachEngine(engine),
  attachMiningEngineUrl:url=>miningModule.attachWorkerEngine(url)
});
 const labels={signed:'status.signed','offline-signed':'status.offlineSigned','offline-received':'status.offlineReceived',submitted:'status.submitted',mempool:'status.mempool',confirmed:'status.confirmed',unverified:'status.unverified'};
function render(){
  const state=wallet.publicState();$('#wallet-content').hidden=!state.address;
  $('#short-address').textContent=state.address?shortAddress(state.address):t('wallet.noWallet');$('#export-wallet').disabled=state.locked;$('#encrypt-wallet').disabled=state.locked;
  if(!state.address)return;
  $('#full-address').textContent=state.address;setQr($('#qr-image'),null,state.address);
  $('#balance-value').textContent=fmt(state.balance);
  $('#marketplace-balance').textContent=fmt(state.balance)+' WEBD';
  $('#balance-height').textContent=t('balance.height',{height:state.snapshot?.height?.toLocaleString(localeMap[getLanguage()]||'es-MX')||'—'});
  $('#balance-state').textContent=state.snapshot?(navigator.onLine===false?t('network.lastOffline'):state.snapshot.synchronized?t('network.sync'):t('network.stale')):t('network.noQuery');
  $('#balance-source').textContent=state.snapshot?t('balance.source',{source:state.snapshot.source,time:new Date(state.snapshot.fetchedAt).toLocaleTimeString()}):t('balance.source.none');
  $('#setup-title').textContent=state.locked?t('wallet.locked'):t('wallet.session');
  renderHistory(state.history);
}
function renderMarketplaceAssets(result){
  const list=$('#marketplace-assets');list.replaceChildren();
  if(!result?.assets?.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=t('marketplace.assetsEmpty');list.append(empty);return;}
  for(const asset of result.assets){
    const row=document.createElement('div');row.className='marketplace-item';
    const title=document.createElement('strong');title.textContent=asset.symbol||asset.id;
    const value=document.createElement('span');value.textContent=(asset.name||asset.id)+' · '+(asset.balance??'—')+' WEBD';
    row.append(title,value);list.append(row);
  }
}
function renderMarketplaceListings(listings=[]){
  const list=$('#marketplace-listings');list.replaceChildren();
  if(!listings.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=t('marketplace.listingsEmpty');list.append(empty);return;}
  for(const listing of listings){
    const row=document.createElement('div');row.className='marketplace-item';
    const title=document.createElement('strong');title.textContent=listing.assetId+' · '+listing.amount;
    const detail=document.createElement('span');detail.textContent=listing.price+' WEBD · '+listing.status;
    const buy=document.createElement('button');buy.type='button';buy.className='text-button';buy.textContent=t('marketplace.buy');
    buy.addEventListener('click',()=>{try{marketplaceModule.buyAsset(listing.id);}catch(error){toast(error.message,true);}});
    row.append(title,detail,buy);list.append(row);
  }
}
async function refreshMarketplace(){
  const result=await marketplaceModule.fetchAssets(wallet.getAddress());
  renderMarketplaceAssets(result);renderMarketplaceListings(await marketplaceModule.getListings());
}
function renderMarketplaceConnection(result){
  const node=$('#marketplace-connection');
  node.textContent=!result?.connected?t('marketplace.connectError'):result.assetProtocolSupported?t('marketplace.connected'):t('marketplace.protocolUnavailable');
  node.classList.toggle('is-error',!result?.connected||!result?.assetProtocolSupported);
}
function renderMarketplacePending(){
  const pending=marketplaceModule.getPendingOperations();
  const retry=$('#marketplace-retry');
  retry.disabled=pending.length===0;
  $('#marketplace-pending-status').textContent=pending.length?t('marketplace.pendingCount',{count:pending.length}):'';
}
function renderHistory(history){
  const list=$('#activity-list');list.replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent=t('activity.empty');list.append(empty);return;}
  for(const tx of history){
    const row=document.createElement('article');row.className='activity-record';
    const title=document.createElement('strong');title.textContent=t(labels[tx.status]||tx.status);
    const value=document.createElement('span');value.textContent=(tx.direction==='in'?t('activity.receive',{amount:fmt(tx.recipientAmount)}):t('activity.debit',{amount:fmt(tx.totalDebit)}))+' WEBD';
    const hash=document.createElement('code');hash.textContent=tx.txId;
    const actions=document.createElement('div');actions.className='offline-actions';
    const check=document.createElement('button');check.className='text-button';check.textContent=t('activity.verify');
    check.onclick=async()=>{try{setBusy(check,true);const status=await wallet.checkTransaction(tx.txId);toast(t(labels[status.status]||status.status));}catch(error){toast(error.message,true);}finally{setBusy(check,false);}};
    const copyHash=document.createElement('button');copyHash.className='text-button';copyHash.textContent=t('activity.copyHash');copyHash.onclick=()=>copy(tx.txId).catch(error=>toast(error.message,true));
    const explorer=document.createElement('a');explorer.href='https://webdollar.io/explorer';explorer.target='_blank';explorer.rel='noopener noreferrer';explorer.className='text-button';explorer.textContent=t('activity.explorer');
    actions.append(check,copyHash,explorer);row.append(title,value,hash,actions);list.append(row);
  }
}
async function followTransaction(txId){
  if(watchedTransactions.has(txId))return;
  watchedTransactions.add(txId);
  try{
    // Status tracking is read-only. It never signs, queues, or retransmits a transaction.
    for(let attempt=0;attempt<18;attempt++){
      await new Promise(resolve=>setTimeout(resolve,5000));
      try{
        const status=await wallet.checkTransaction(txId);
        if(status.status==='confirmed'){
          toast(t('network.confirmed',{height:status.height||'Mainnet'}));
          return;
        }
        // If a node has already removed the item from its mempool, stop polling after
        // a short grace period and leave the explicit "Verificar en nodo" action.
        if(status.status==='unverified'&&attempt>=5)return;
      }catch{}
    }
  }finally{watchedTransactions.delete(txId);}
}
function configuredNetwork(){
  network.setEndpoints({httpEndpoint:$('#http-endpoint').value.trim(),rpcEndpoint:$('#rpc-endpoint').value.trim(),username:$('#rpc-user').value,password:$('#rpc-password').value});
  $('#rpc-password').value='';
}
$('#connection-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;
  try{setBusy(button,true);configuredNetwork();await network.connect();if(wallet.getAddress()){await wallet.refreshBalance();wallet.startSync();}toast('Nodo WebDollar conectado.');}
  catch(error){connectionError(error.message);}finally{setBusy(button,false);}
});
function connectionError(message){
  $('#network-pill').textContent=t('network.offline');
  $('#connection-status').textContent=message;$('#connection-status').classList.add('is-error');
  $('#balance-state').textContent=wallet.getBalance()===null?t('network.noQuery'):t('network.lastOffline');
}
events.on('network:connected',({endpoint,kind,readOnly})=>{
  const label=readOnly?t('network.explorerReadOnly'):t('network.nodeConnected');
  $('#network-pill').textContent=label;$('#connection-summary').textContent=endpoint;
  $('#connection-status').textContent=readOnly?t('network.readOnlyHelp'):t('network.restConnected');
  $('#connection-status').classList.remove('is-error');
});
events.on('network:transport',({transport})=>{
  const description=transport==='polling'
    ?t('network.polling')
    :t('network.websocket');
  $('#connection-status').textContent=description;$('#connection-status').classList.remove('is-error');
});
events.on('network:error',({message})=>{
  const snapshot=wallet.publicState().snapshot;
  if(snapshot&&message.includes('HTTP 400 al conectar por polling.')){
    $('#connection-status').textContent=t('network.queryActive');
    $('#connection-status').classList.remove('is-error');
    return;
  }
  connectionError(message);
});
for(const name of ['wallet:ready','wallet:locked','balance:changed','transaction:new'])events.on(name,render);
events.on('mining:rate',rate=>$('#hash-rate').textContent=fmt(rate));
events.on('mining:state',({running})=>{
  $('#mining-toggle').textContent=running?t('mining.stop'):t('mining.start');
  $('#mining-indicator').textContent=running?t('mining.indicatorActive'):t('mining.indicatorStopped');
});
function formatUptime(milliseconds){const seconds=Math.floor(Math.max(0,milliseconds||0)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),rest=seconds%60;return hours?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;}
function renderMiningMetrics(metrics=miningModule.getMetrics()){
  $('#mining-accepted').textContent=String(metrics.accepted||0);$('#mining-rejected').textContent=String(metrics.rejected||0);$('#mining-latency').textContent=Number.isFinite(metrics.latencyMs)?`${Math.round(metrics.latencyMs)} ms`:'—';$('#mining-uptime').textContent=formatUptime(metrics.uptimeMs);
}
events.on('mining:metrics',renderMiningMetrics);
events.on('module:error',({id,error})=>{
  if(id==='mining'){$('#mining-status-text').textContent=t('mining.unavailable');$('#hash-rate').textContent='—';$('#mining-indicator').textContent=t('mining.noEngine');}
  toast('Module '+id+': '+(error?.message||t('mining.workerError')),true);
});
$('#wallet-file').addEventListener('change',async()=>{
  const file=$('#wallet-file').files?.[0];if(!file)return;
  try{await wallet.importFile(file,{passwordProvider:()=>window.prompt(t('wallet.encryptedPrompt'))});$('#wallet-file-name').textContent=file.name;toast(t('wallet.imported'));}
  catch(error){toast(error.message,true);}finally{$('#wallet-file').value='';}
});
action('#create-wallet',()=>{
  const created=wallet.create();$('#mnemonic-words').replaceChildren();
  for(const [index,word] of created.mnemonic.split(' ').entries()){const span=document.createElement('span');span.className='mnemonic-word';span.textContent=(index+1)+'. '+word;$('#mnemonic-words').append(span);}
  open('recovery-dialog');toast(t('wallet.created'));
});
action('#confirm-recovery',()=>close('recovery-dialog'));
function requestInput(mode){
  inputMode=mode;$('#input-value').value='';
  $('#input-title').textContent=mode==='watch'?t('wallet.addressTitle'):t('wallet.recoverTitle');
  $('#input-label').textContent=mode==='watch'?t('wallet.addressLabel'):t('wallet.recoverLabel');
  open('input-dialog');
}
action('#watch-wallet',()=>requestInput('watch'));action('#restore-wallet',()=>requestInput('restore'));
$('#input-form').addEventListener('submit',event=>{
  event.preventDefault();try{
    const value=$('#input-value').value.trim();
    if(inputMode==='watch')wallet.watch(value);else wallet.create(value);
    close('input-dialog');
  }catch(error){toast(error.message,true);}
});
action('#export-wallet',()=>{
  const blob=new Blob([wallet.exportWallet()],{type:'application/json'});const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=wallet.getAddress()+'.webd';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(t('wallet.exported'));
});
action('#encrypt-wallet',async()=>{
  const password=window.prompt(t('wallet.encryptedPrompt'));if(password===null)return;
  if(password.length<8)throw new Error(t('wallet.passwordPolicy'));
  const confirmation=window.prompt(t('wallet.passwordAgain'));if(password!==confirmation)throw new Error(t('wallet.passwordMismatch'));
  const blob=new Blob([await wallet.exportEncryptedWallet(password)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=wallet.getAddress()+'.encrypted.webd';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('wallet.encryptedExport'));
});
action('#lock-button',()=>{wallet.lock();close('recovery-dialog');toast(t('wallet.lockedToast'));});
action('#refresh-balance',async()=>{await wallet.refreshBalance();toast(t('balance.queried'));});
action('#copy-address',()=>copy(wallet.getAddress()));action('#copy-address-top',()=>copy(wallet.getAddress()));
action('#share-address',()=>{messengerModule.shareAddress($('#share-address-platform').value,wallet.getAddress());toast(t('messenger.shared'));});
action('#paste-recipient',async()=>$('#recipient').value=(await navigator.clipboard.readText()).trim());
$('#amount').addEventListener('input',()=>$('#send-total').textContent=fmt(Number($('#amount').value))+' WEBD');
$('#send-form').addEventListener('submit',event=>{event.preventDefault();try{requestSend({to:$('#recipient').value.trim(),amount:$('#amount').value.trim()});}catch(error){toast(error.message,true);}});
action('#marketplace-open',async()=>{
  $('#marketplace-panel').hidden=false;
  const result=await marketplaceModule.connect();
  renderMarketplaceConnection(result);
  renderMarketplacePending();
  if(result.connected)await refreshMarketplace();
});
action('#marketplace-close',()=>{$('#marketplace-panel').hidden=true;close('marketplace-dialog');});
action('#marketplace-connect',async()=>{
  const result=await marketplaceModule.connect();
  renderMarketplaceConnection(result);
  renderMarketplacePending();
  if(result.connected)await refreshMarketplace();
});
action('#marketplace-refresh',async()=>refreshMarketplace());
action('#marketplace-retry',async()=>{
  let connection=marketplaceModule.getState();
  if(!connection.connected){connection=await marketplaceModule.connect();renderMarketplaceConnection(connection);}
  if(!connection.assetProtocolSupported){renderMarketplacePending();return;}
  const result=await marketplaceModule.retryPending();
  renderMarketplacePending();
  if(result.transmitted)toast(t('marketplace.retryResult',{count:result.transmitted}));
  await refreshMarketplace();
});
$('#marketplace-list-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
    marketplaceModule.listAssetForSale($('#marketplace-asset-id').value.trim(),$('#marketplace-amount').value.trim(),$('#marketplace-price').value.trim());
  }catch(error){toast(error.message||t('marketplace.orderError'),true);}
});
action('#confirm-marketplace',async event=>{
  if(!event.isTrusted||!$('#marketplace-dialog').open||!pending||pending.kind!=='marketplace'||broadcastBusy)return;
  const operation=pending;
  broadcastBusy=true;setBusy($('#confirm-marketplace'),true);$('#marketplace-confirm-status').textContent=t('transaction.signing');$('#marketplace-confirm-status').classList.remove('is-error');
  try{
    const signed=wallet.signMarketplaceOrder(operation.data,{confirmed:true});
    const result=operation.data.operation==='buy'?await marketplaceModule.submitPurchase(signed):await marketplaceModule.submitListing(signed);
    const reference=result.listing?.id||result.purchaseId||result.txId||result.pendingId||'Mainnet';
    const message=result.queued?t('marketplace.queued',{reference}):t('marketplace.transmitted',{reference});
    $('#marketplace-list-status').textContent=message;
    close('marketplace-dialog');renderMarketplacePending();if(!result.queued)await refreshMarketplace();toast(message);
  }catch(error){
    $('#marketplace-confirm-status').textContent=error.message||t('marketplace.orderError');$('#marketplace-confirm-status').classList.add('is-error');toast(error.message||t('marketplace.orderError'),true);
  }finally{broadcastBusy=false;setBusy($('#confirm-marketplace'),false);}
});
action('#confirm-send',async event=>{
  if(!event.isTrusted||!$('#send-dialog').open||!pending||broadcastBusy)return;
  const operation=pending;
  if(operation.quote.policyIssues.length)throw new Error(operation.quote.policyIssues.join(' '));
  broadcastBusy=true;setBusy($('#confirm-send'),true);$('#send-status').textContent=t('transaction.signing');$('#send-status').classList.remove('is-error');
  try{
    $('#send-status').textContent=t('transaction.signing');
    const result=operation.kind==='send'
      ?await wallet.sendTransaction(operation.data)
      :await wallet.broadcastReceived(operation.base64);
    $('#send-status').textContent=t('transaction.accepted',{hash:result.txId});
    close('send-dialog');toast(t('transaction.sent',{hash:result.txId}));
    if(result.status!=='confirmed')void followTransaction(result.txId);
  }catch(error){
    $('#send-status').textContent=t('transaction.failed',{error:error.message});$('#send-status').classList.add('is-error');toast(error.message,true);
  }finally{broadcastBusy=false;$('#confirm-send').disabled=Boolean(pending?.quote.policyIssues.length);}
});
action('#mining-toggle',async()=>{
  try{if(miningModule.running)miningModule.stopMining();else await miningModule.startMining();}
  catch(error){events.emit('module:error',{id:'mining',error:{message:error.message}});}
});
action('#offline-open',()=>open('offline-dialog'));action('#offline-module-action',()=>open('offline-dialog'));
action('#create-voucher',()=>{
  const packet=offlineModule.sendViaNFC($('#offline-amount').value.trim(),$('#offline-recipient').value.trim());
  $('#offline-payload').value=packet.payload;setQr($('#offline-qr'),null,packet.payload);
  $('#voucher-state').textContent=t('offline.signed');toast(t('offline.signedToast'));
});
action('#copy-voucher',()=>copy($('#offline-payload').value));
action('#receive-voucher',async()=>{
  const payload=$('#offline-payload').value.trim(),chainStatus=await offlineModule.verifyOnChain(payload);
  if(chainStatus.status==='confirmed'||chainStatus.status==='mempool')throw new Error('La transacción ya fue observada en la cadena o mempool.');
  const tx=offlineModule.receiveViaNFC(payload);
  $('#voucher-state').textContent=t('offline.valid',{amount:fmt(tx.recipientAmount)});
  toast(t('offline.validToast'));
});
action('#claim-voucher',()=>offlineModule.reclaim($('#offline-payload').value.trim()));
action('#share-voucher',()=>messengerModule.shareVoucher($('#share-voucher-platform').value,$('#offline-payload').value.trim())&&toast(t('messenger.shared')));
action('#write-nfc',async()=>{
  const packet=await offlineModule.writeViaNFC($('#offline-amount').value.trim(),$('#offline-recipient').value.trim());
  $('#offline-payload').value=packet.payload;setQr($('#offline-qr'),null,packet.payload);$('#voucher-state').textContent=t('offline.written');toast(t('offline.writtenToast'));
});
action('#read-nfc',async()=>{
  const payload=await offlineModule.readViaNFC();const tx=offlineModule.receiveViaNFC(payload);$('#offline-payload').value=payload;setQr($('#offline-qr'),null,payload);$('#voucher-state').textContent=t('offline.read',{amount:fmt(tx.recipientAmount)});toast(t('offline.readToast'));
});
$('#qr-file').addEventListener('change',async()=>{
  try{const text=await scanQrImage($('#qr-file').files?.[0]);$('#offline-payload').value=text;toast(t('offline.qrRead'));}
  catch(error){toast(error.message,true);}finally{$('#qr-file').value='';}
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>close(button.dataset.close)));
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{
  if((dialog.id==='send-dialog'||dialog.id==='marketplace-dialog')&&!dialog.open)pending=null;
  if(dialog.id==='recovery-dialog')$('#mnemonic-words').replaceChildren();
  if(dialog.id==='input-dialog')$('#input-value').value='';
});
window.addEventListener('offline',()=>connectionError(t('network.offlineToast')));
window.addEventListener('online',()=>{toast(t('network.onlineToast'));if(wallet.getAddress())wallet.startSync();});
window.addEventListener('pagehide',()=>{wallet.lock();network.dispose();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install-button').hidden=false;});
action('#install-button',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install-button').hidden=true;}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>toast(t('app.swFailed'),true));
$('#lang-select').addEventListener('change',async event=>{try{await loadLanguage(event.target.value);render();}catch(error){toast(error.message,true);}});
$('#theme-select').addEventListener('change',async event=>{try{await loadTheme(event.target.value);}catch(error){toast(error.message,true);}});
function syncPoolControls(){
  const select=$('#pool-select'),current=miningModule.getSelectedPool();select.replaceChildren();
  for(const pool of miningModule.getPools()){const option=document.createElement('option');option.value=pool.id;option.textContent=pool.name;select.append(option);}
  select.value=current.id;const custom=select.value.startsWith('custom');$('#custom-pool-endpoint').hidden=!custom;$('#add-custom-pool').hidden=!custom;
}
$('#pool-select').addEventListener('change',()=>{try{miningModule.setPool($('#pool-select').value);const custom=$('#pool-select').value.startsWith('custom');$('#custom-pool-endpoint').hidden=!custom;$('#add-custom-pool').hidden=!custom;}catch(error){toast(error.message,true);}});
action('#add-custom-pool',()=>{const pool=miningModule.addCustomPool($('#custom-pool-endpoint').value.trim());syncPoolControls();$('#pool-select').value=pool.id;toast(t('network.customReadOnly'));});
syncPoolControls();renderMiningMetrics();
void plugins.initializeAll();
void Promise.all([initLanguage(),initTheme()]).then(()=>{ $('#lang-select').value=getLanguage();$('#theme-select').value=getTheme(); applyTranslations();syncPoolControls();render(); }).catch(()=>render());
render();
