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
import { initLanguage, loadLanguage, getLanguage, applyTranslations, t } from './core/i18n.js';

const $=selector=>document.querySelector(selector);
const events=new EventBus(),network=new MainnetNetworkAdapter(events),wallet=new WalletCore(events,network);
let pending=null,inputMode='watch',installPrompt=null,broadcastBusy=false;
const watchedTransactions=new Set();
function toast(message,error=false){
  const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;$('#toast-region').append(node);setTimeout(()=>node.remove(),7000);
}
const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString(getLanguage()==='en'?'en-US':'es-MX',{minimumFractionDigits:2,maximumFractionDigits:4});
function open(id){const dialog=$('#'+id);if(!dialog.open)dialog.showModal();}
function close(id){$('#'+id).close();if(id==='recovery-dialog')$('#mnemonic-words').replaceChildren();if(id==='input-dialog')$('#input-value').value='';if(id==='send-dialog')pending=null;}
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
  getAddress:()=>wallet.getAddress(),getBalance:()=>wallet.getBalance(),getNetworkSource:()=>network.activeEndpoint,signPoSHeader:header=>wallet.signPoSHeader(header),events,
  prepareOffline:data=>wallet.prepareOffline(data),receiveSigned:bytes=>wallet.receiveSigned(bytes),requestClaim
});
const plugins=new PluginManager(hooks,events);
plugins.register(miningModule);plugins.register(offlineModule);
window.webdollarCore=Object.freeze({
  getBalance:()=>wallet.getBalance(),getAddress:()=>wallet.getAddress(),getState:()=>wallet.publicState(),
  // Public send hook opens human review. It cannot silently broadcast.
  sendTransaction:requestSend,events,
  registerModule:module=>plugins.register(module),initializeModule:id=>plugins.initialize(id),
  getModules:()=>plugins.list(),attachMiningEngine:engine=>miningModule.attachEngine(engine),
  attachMiningEngineUrl:url=>miningModule.attachWorkerEngine(url)
});
 const labels={signed:'status.signed','offline-signed':'status.offlineSigned','offline-received':'status.offlineReceived',submitted:'status.submitted',mempool:'status.mempool',confirmed:'status.confirmed',unverified:'status.unverified'};
function render(){
  const state=wallet.publicState();$('#wallet-content').hidden=!state.address;
  $('#short-address').textContent=state.address?shortAddress(state.address):t('wallet.noWallet');$('#export-wallet').disabled=state.locked;
  if(!state.address)return;
  $('#full-address').textContent=state.address;setQr($('#qr-image'),null,state.address);
  $('#balance-value').textContent=fmt(state.balance);
  $('#balance-height').textContent=t('balance.height',{height:state.snapshot?.height?.toLocaleString(getLanguage()==='en'?'en-US':'es-MX')||'—'});
  $('#balance-state').textContent=state.snapshot?(navigator.onLine===false?t('network.lastOffline'):state.snapshot.synchronized?t('network.sync'):t('network.stale')):t('network.noQuery');
  $('#balance-source').textContent=state.snapshot?t('balance.source',{source:state.snapshot.source,time:new Date(state.snapshot.fetchedAt).toLocaleTimeString()}):t('balance.source.none');
  $('#setup-title').textContent=state.locked?t('wallet.locked'):t('wallet.session');
  renderHistory(state.history);
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
          toast((getLanguage()==='en'?'Transaction confirmed in block ':'Transacción confirmada en el bloque ')+(status.height||'Mainnet')+'.');
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
  const label=readOnly?(getLanguage()==='en'?'Mainnet explorer · read-only':'Explorador Mainnet · solo lectura'):(getLanguage()==='en'?'WebDollar node connected':'Nodo WebDollar conectado');
  $('#network-pill').textContent=label;$('#connection-summary').textContent=endpoint;
  $('#connection-status').textContent=readOnly?(getLanguage()==='en'?'Read-only Mainnet mirror. A synchronized writable node is required to sign and broadcast.':'Espejo Mainnet de solo lectura. Para firmar y transmitir necesitas un nodo escribible sincronizado.'):(getLanguage()==='en'?'REST node connected; confirmed broadcast uses the node native Socket.IO transport.':'Nodo REST conectado; la transmisión confirmada usa el transporte Socket.IO nativo del nodo.');
  $('#connection-status').classList.remove('is-error');
});
events.on('network:transport',({transport})=>{
  const description=transport==='polling'
    ?(getLanguage()==='en'?'Mainnet connected through Engine.IO polling; signing and propagation remain local.':'Mainnet conectado por Engine.IO polling; la firma y propagación siguen siendo locales.')
    :(getLanguage()==='en'?'Mainnet connected through native WebSocket; signing and propagation remain local.':'Mainnet conectado por WebSocket nativo; la firma y propagación siguen siendo locales.');
  $('#connection-status').textContent=description;$('#connection-status').classList.remove('is-error');
});
events.on('network:error',({message})=>{
  const snapshot=wallet.publicState().snapshot;
  if(snapshot&&message.includes('HTTP 400 al conectar por polling.')){
    $('#connection-status').textContent=getLanguage()==='en'?'Mainnet query is active; the propagation channel will reconnect if needed.':'Consulta Mainnet activa; el canal de propagación se reconectará si es necesario.';
    $('#connection-status').classList.remove('is-error');
    return;
  }
  connectionError(message);
});
for(const name of ['wallet:ready','wallet:locked','balance:changed','transaction:new'])events.on(name,render);
events.on('mining:rate',rate=>$('#hash-rate').textContent=fmt(rate));
events.on('mining:state',({running})=>{
  $('#mining-toggle').textContent=running?t('mining.stop'):t('mining.start');
  $('#mining-indicator').textContent=running?(getLanguage()==='en'?'ACTIVE':'ACTIVA'):(getLanguage()==='en'?'STOPPED':'DETENIDA');
});
events.on('module:error',({id,error})=>{
  if(id==='mining'){$('#mining-status-text').textContent=t('mining.unavailable');$('#hash-rate').textContent='—';$('#mining-indicator').textContent=getLanguage()==='en'?'NO ENGINE':'SIN MOTOR';}
  toast('Module '+id+': '+(error?.message||t('mining.workerError')),true);
});
$('#wallet-file').addEventListener('change',async()=>{
  const file=$('#wallet-file').files?.[0];if(!file)return;
  try{await wallet.importFile(file);$('#wallet-file-name').textContent=file.name;toast(getLanguage()==='en'?'Wallet imported. Querying Mainnet.':'Cartera importada. Consultando Mainnet.');}
  catch(error){toast(error.message,true);}finally{$('#wallet-file').value='';}
});
action('#create-wallet',()=>{
  const created=wallet.create();$('#mnemonic-words').replaceChildren();
  for(const [index,word] of created.mnemonic.split(' ').entries()){const span=document.createElement('span');span.className='mnemonic-word';span.textContent=(index+1)+'. '+word;$('#mnemonic-words').append(span);}
  open('recovery-dialog');toast(getLanguage()==='en'?'Wallet created. Save the phrase and export the .webd.':'Cartera creada. Guarda la frase y exporta el .webd.');
});
action('#confirm-recovery',()=>close('recovery-dialog'));
function requestInput(mode){
  inputMode=mode;$('#input-value').value='';
  $('#input-title').textContent=mode==='watch'?t('wallet.addressTitle'):(getLanguage()==='en'?'Recover wallet':'Recuperar cartera');
  $('#input-label').textContent=mode==='watch'?t('wallet.addressLabel'):(getLanguage()==='en'?'24 words generated by this PWA':'24 palabras generadas por esta PWA');
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
  toast(getLanguage()==='en'?'Unencrypted .webd export: keep it private.':'Exportación .webd sin cifrar: guárdala en un lugar privado.');
});
action('#lock-button',()=>{wallet.lock();close('recovery-dialog');toast(getLanguage()==='en'?'Wallet locked. Import it again to sign.':'Cartera bloqueada. Importa de nuevo para firmar.');});
action('#refresh-balance',async()=>{await wallet.refreshBalance();toast(getLanguage()==='en'?'Balance queried.':'Saldo consultado.');});
action('#copy-address',()=>copy(wallet.getAddress()));action('#copy-address-top',()=>copy(wallet.getAddress()));
action('#paste-recipient',async()=>$('#recipient').value=(await navigator.clipboard.readText()).trim());
$('#amount').addEventListener('input',()=>$('#send-total').textContent=fmt(Number($('#amount').value))+' WEBD');
$('#send-form').addEventListener('submit',event=>{event.preventDefault();try{requestSend({to:$('#recipient').value.trim(),amount:$('#amount').value.trim()});}catch(error){toast(error.message,true);}});
action('#confirm-send',async event=>{
  if(!event.isTrusted||!$('#send-dialog').open||!pending||broadcastBusy)return;
  const operation=pending;
  if(operation.quote.policyIssues.length)throw new Error(operation.quote.policyIssues.join(' '));
  broadcastBusy=true;setBusy($('#confirm-send'),true);$('#send-status').textContent='Firmando localmente y conectando con el nodo…';$('#send-status').classList.remove('is-error');
  try{
    $('#send-status').textContent=getLanguage()==='en'?'Signing locally and connecting to the node…':'Firmando localmente y conectando con el nodo…';
    const result=operation.kind==='send'
      ?await wallet.sendTransaction(operation.data)
      :await wallet.broadcastReceived(operation.base64);
    $('#send-status').textContent=(getLanguage()==='en'?'Transport accepted the request. Hash: ':'Solicitud aceptada por el transporte. Hash: ')+result.txId;
    close('send-dialog');toast((getLanguage()==='en'?'Request sent. Verify hash ':'Solicitud enviada. Verifica el hash ')+result.txId);
    if(result.status!=='confirmed')void followTransaction(result.txId);
  }catch(error){
    $('#send-status').textContent=(getLanguage()==='en'?'Broadcast failed: ':'No se pudo transmitir: ')+error.message+(getLanguage()==='en'?' You can retry this same operation when the node is available.':' Puedes reintentar esta misma operación cuando el nodo esté disponible.');$('#send-status').classList.add('is-error');toast(error.message,true);
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
  $('#voucher-state').textContent=getLanguage()==='en'?'Signed · unsettled':'Firmado · sin liquidar';toast(getLanguage()==='en'?'Voucher signed locally. Mainnet policy limits its claim.':'Vale firmado localmente. La política Mainnet limita su reclamación.');
});
action('#copy-voucher',()=>copy($('#offline-payload').value));
action('#receive-voucher',()=>{
  const tx=offlineModule.receiveViaNFC($('#offline-payload').value.trim());
  $('#voucher-state').textContent=(getLanguage()==='en'?'Valid signature · ':'Firma válida · ')+fmt(tx.recipientAmount)+' WEBD '+(getLanguage()==='en'?'pending':'pendientes');
  toast(getLanguage()==='en'?'Signature and recipient verified. On-chain balance is unchanged.':'Firma y destinatario verificados. El saldo de cadena no cambia.');
});
action('#claim-voucher',()=>offlineModule.reclaim($('#offline-payload').value.trim()));
action('#write-nfc',async()=>{
  const packet=await offlineModule.writeViaNFC($('#offline-amount').value.trim(),$('#offline-recipient').value.trim());
  $('#offline-payload').value=packet.payload;setQr($('#offline-qr'),null,packet.payload);$('#voucher-state').textContent=getLanguage()==='en'?'Written to NFC · unsettled':'Escrito en NFC · sin liquidar';toast(getLanguage()==='en'?'Voucher written to NFC.':'Vale escrito en NFC.');
});
action('#read-nfc',async()=>{
  const payload=await offlineModule.readViaNFC();const tx=offlineModule.receiveViaNFC(payload);$('#offline-payload').value=payload;setQr($('#offline-qr'),null,payload);$('#voucher-state').textContent=(getLanguage()==='en'?'Read from NFC · ':'Leído desde NFC · ')+fmt(tx.recipientAmount)+' WEBD';toast(getLanguage()==='en'?'Voucher read from NFC.':'Vale leído desde NFC.');
});
$('#qr-file').addEventListener('change',async()=>{
  try{const text=await scanQrImage($('#qr-file').files?.[0]);$('#offline-payload').value=text;toast(getLanguage()==='en'?'QR read. Validate the voucher before claiming.':'QR leído. Valida el vale antes de reclamar.');}
  catch(error){toast(error.message,true);}finally{$('#qr-file').value='';}
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>close(button.dataset.close)));
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{
  if(dialog.id==='send-dialog'&&!dialog.open)pending=null;
  if(dialog.id==='recovery-dialog')$('#mnemonic-words').replaceChildren();
  if(dialog.id==='input-dialog')$('#input-value').value='';
});
window.addEventListener('offline',()=>connectionError(getLanguage()==='en'?'No internet. Showing the last query; vouchers remain unsettled.':'Sin internet. Se muestra la última consulta; los vales siguen sin liquidar.'));
window.addEventListener('online',()=>{toast(getLanguage()==='en'?'Connection restored. You can review pending claims.':'Conexión restablecida. Puedes revisar los reclamos pendientes.');if(wallet.getAddress())wallet.startSync();});
window.addEventListener('pagehide',()=>{wallet.lock();network.dispose();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install-button').hidden=false;});
action('#install-button',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install-button').hidden=true;}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>toast(getLanguage()==='en'?'Offline installation could not be activated.':'No se pudo activar la instalación offline.',true));
$('#lang-select').addEventListener('change',async event=>{try{await loadLanguage(event.target.value);render();}catch(error){toast(error.message,true);}});
void plugins.initializeAll();
void initLanguage().then(()=>{ $('#lang-select').value=getLanguage(); applyTranslations(); render(); }).catch(()=>render());
render();
