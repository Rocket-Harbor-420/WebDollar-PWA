import { EventBus } from './core/event-bus.js';
import { MainnetNetworkAdapter } from './core/network.js';
import { WalletCore } from './core/wallet.js';
import { PluginManager } from './core/plugin-manager.js';
import { shortAddress } from './core/crypto.js';
import { setQr, scanQrImage } from './core/qr.js';
import { inspectSignedTransaction } from './core/transaction.js';
import { miningModule } from './modules/mining.js';
import { offlineModule } from './modules/offline.js';

const $=selector=>document.querySelector(selector);
const events=new EventBus(),network=new MainnetNetworkAdapter(events),wallet=new WalletCore(events,network);
let pending=null,inputMode='watch',installPrompt=null,broadcastBusy=false;
const watchedTransactions=new Set();
function toast(message,error=false){
  const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;$('#toast-region').append(node);setTimeout(()=>node.remove(),7000);
}
const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:4});
function open(id){const dialog=$('#'+id);if(!dialog.open)dialog.showModal();}
function close(id){$('#'+id).close();if(id==='recovery-dialog')$('#mnemonic-words').replaceChildren();if(id==='input-dialog')$('#input-value').value='';if(id==='send-dialog')pending=null;}
async function copy(value){if(!value)throw new Error('No hay datos para copiar.');await navigator.clipboard.writeText(value);toast('Copiado.');}
function action(selector,handler){$(selector).addEventListener('click',async event=>{try{await handler(event);}catch(error){toast(error.message,true);}});}
function setBusy(button,busy){button.disabled=busy;button.setAttribute('aria-busy',String(busy));}
function requestSend(data){
  if(pending||broadcastBusy)throw new Error('Cierra la revisión actual antes de preparar otra operación.');
  const input=Object.freeze({to:String(data.to),amount:String(data.amount)});
  const quote=wallet.quote(input);pending={kind:'send',data:input,quote};
  showReview(quote);return structuredClone({reviewRequired:true,...quote});
}
function requestClaim(base64){
  if(pending||broadcastBusy)throw new Error('Cierra la revisión actual antes de preparar otra operación.');
  const tx=inspectSignedTransaction(base64);
  if(tx.to!==wallet.getAddress())throw new Error('El vale pertenece a otra dirección.');
  pending={kind:'claim',base64,quote:tx};close('offline-dialog');showReview(tx);return {reviewRequired:true,txId:tx.txId};
}
function showReview(quote){
  $('#confirm-recipient').textContent=quote.to;
  $('#confirm-debit').textContent=fmt(quote.totalDebit)+' WEBD';
  $('#confirm-receive-amount').textContent=fmt(quote.recipientAmount)+' WEBD';
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
const labels={signed:'Firmada, sin transmitir','offline-signed':'Vale firmado, sin liquidar','offline-received':'Vale recibido, sin liquidar',submitted:'Enviado al nodo, sin verificar',mempool:'Incluido en mempool',confirmed:'Confirmado en bloque',unverified:'Sin inclusión verificada'};
function render(){
  const state=wallet.publicState();$('#wallet-content').hidden=!state.address;
  $('#short-address').textContent=shortAddress(state.address);$('#export-wallet').disabled=state.locked;
  if(!state.address)return;
  $('#full-address').textContent=state.address;setQr($('#qr-image'),null,state.address);
  $('#balance-value').textContent=fmt(state.balance);
  $('#balance-height').textContent='Altura '+(state.snapshot?.height?.toLocaleString('es-MX')||'—');
  $('#balance-state').textContent=state.snapshot?(navigator.onLine===false?'ÚLTIMA CONSULTA · SIN RED':state.snapshot.synchronized?'NODO SINCRONIZADO':'NODO DESACTUALIZADO'):'SIN CONSULTAR';
  $('#balance-source').textContent=state.snapshot?state.snapshot.source+' · '+new Date(state.snapshot.fetchedAt).toLocaleTimeString():'Fuente no disponible';
  $('#setup-title').textContent=state.locked?'Cartera bloqueada o de consulta':'Cartera abierta en esta sesión';
  renderHistory(state.history);
}
function renderHistory(history){
  const list=$('#activity-list');list.replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Tus operaciones aparecerán aquí.';list.append(empty);return;}
  for(const tx of history){
    const row=document.createElement('article');row.className='activity-record';
    const title=document.createElement('strong');title.textContent=labels[tx.status]||tx.status;
    const value=document.createElement('span');value.textContent=(tx.direction==='in'?'Recibir: '+fmt(tx.recipientAmount):'Débito: '+fmt(tx.totalDebit))+' WEBD';
    const hash=document.createElement('code');hash.textContent=tx.txId;
    const actions=document.createElement('div');actions.className='offline-actions';
    const check=document.createElement('button');check.className='text-button';check.textContent='Verificar en nodo';
    check.onclick=async()=>{try{setBusy(check,true);const status=await wallet.checkTransaction(tx.txId);toast(labels[status.status]);}catch(error){toast(error.message,true);}finally{setBusy(check,false);}};
    const copyHash=document.createElement('button');copyHash.className='text-button';copyHash.textContent='Copiar hash';copyHash.onclick=()=>copy(tx.txId).catch(error=>toast(error.message,true));
    const explorer=document.createElement('a');explorer.href='https://webdollar.io/explorer';explorer.target='_blank';explorer.rel='noopener noreferrer';explorer.className='text-button';explorer.textContent='Explorador ↗';
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
          toast('Transacción confirmada en el bloque '+(status.height||'Mainnet')+'.');
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
  $('#network-pill').textContent='Sin conexión verificada';
  $('#connection-status').textContent=message;$('#connection-status').classList.add('is-error');
  $('#balance-state').textContent=wallet.getBalance()===null?'SIN CONSULTAR':'ÚLTIMA CONSULTA · SIN RED';
}
events.on('network:connected',({endpoint,kind,readOnly})=>{
  const label=readOnly?'Explorador Mainnet · solo lectura':'Nodo WebDollar conectado';
  $('#network-pill').textContent=label;$('#connection-summary').textContent=endpoint;
  $('#connection-status').textContent=readOnly?'Espejo Mainnet de solo lectura. Para firmar y transmitir necesitas un nodo escribible sincronizado.':'Nodo REST conectado; la transmisión confirmada usa el transporte Socket.IO nativo del nodo.';
  $('#connection-status').classList.remove('is-error');
});
events.on('network:transport',({transport})=>{
  const description=transport==='polling'
    ?'Mainnet conectado por Engine.IO polling; la firma y propagación siguen siendo locales.'
    :'Mainnet conectado por WebSocket nativo; la firma y propagación siguen siendo locales.';
  $('#connection-status').textContent=description;$('#connection-status').classList.remove('is-error');
});
events.on('network:error',({message})=>{
  const snapshot=wallet.publicState().snapshot;
  if(snapshot&&message.includes('HTTP 400 al conectar por polling.')){
    $('#connection-status').textContent='Consulta Mainnet activa; el canal de propagación se reconectará si es necesario.';
    $('#connection-status').classList.remove('is-error');
    return;
  }
  connectionError(message);
});
for(const name of ['wallet:ready','wallet:locked','balance:changed','transaction:new'])events.on(name,render);
events.on('mining:rate',rate=>$('#hash-rate').textContent=fmt(rate));
events.on('mining:state',({running})=>{
  $('#mining-toggle').textContent=running?'Detener minería':'Iniciar minería';
  $('#mining-indicator').textContent=running?'ACTIVA':'DETENIDA';
});
events.on('module:error',({id,error})=>{
  if(id==='mining'){$('#mining-status-text').textContent='No disponible';$('#hash-rate').textContent='—';$('#mining-indicator').textContent='SIN MOTOR';}
  toast('Módulo '+id+': '+(error?.message||'error aislado'),true);
});
$('#wallet-file').addEventListener('change',async()=>{
  const file=$('#wallet-file').files?.[0];if(!file)return;
  try{await wallet.importFile(file);$('#wallet-file-name').textContent=file.name;toast('Cartera importada. Consultando Mainnet.');}
  catch(error){toast(error.message,true);}finally{$('#wallet-file').value='';}
});
action('#create-wallet',()=>{
  const created=wallet.create();$('#mnemonic-words').replaceChildren();
  for(const [index,word] of created.mnemonic.split(' ').entries()){const span=document.createElement('span');span.className='mnemonic-word';span.textContent=(index+1)+'. '+word;$('#mnemonic-words').append(span);}
  open('recovery-dialog');toast('Cartera creada. Guarda la frase y exporta el .webd.');
});
action('#confirm-recovery',()=>close('recovery-dialog'));
function requestInput(mode){
  inputMode=mode;$('#input-value').value='';
  $('#input-title').textContent=mode==='watch'?'Consultar dirección':'Recuperar cartera';
  $('#input-label').textContent=mode==='watch'?'Dirección WebDollar':'24 palabras generadas por esta PWA';
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
  toast('Exportación .webd sin cifrar: guárdala en un lugar privado.');
});
action('#lock-button',()=>{wallet.lock();close('recovery-dialog');toast('Cartera bloqueada. Importa de nuevo para firmar.');});
action('#refresh-balance',async()=>{await wallet.refreshBalance();toast('Saldo consultado.');});
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
    const result=operation.kind==='send'
      ?await wallet.sendTransaction(operation.data)
      :await wallet.broadcastReceived(operation.base64);
    $('#send-status').textContent='Solicitud aceptada por el transporte. Hash: '+result.txId;
    close('send-dialog');toast('Solicitud enviada. Verifica el hash '+result.txId);
    if(result.status!=='confirmed')void followTransaction(result.txId);
  }catch(error){
    $('#send-status').textContent='No se pudo transmitir: '+error.message+' Puedes reintentar esta misma operación cuando el nodo esté disponible.';$('#send-status').classList.add('is-error');toast(error.message,true);
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
  $('#voucher-state').textContent='Firmado · sin liquidar';toast('Vale firmado localmente. La política Mainnet limita su reclamación.');
});
action('#copy-voucher',()=>copy($('#offline-payload').value));
action('#receive-voucher',()=>{
  const tx=offlineModule.receiveViaNFC($('#offline-payload').value.trim());
  $('#voucher-state').textContent='Firma válida · '+fmt(tx.recipientAmount)+' WEBD pendientes';
  toast('Firma y destinatario verificados. El saldo de cadena no cambia.');
});
action('#claim-voucher',()=>offlineModule.reclaim($('#offline-payload').value.trim()));
$('#qr-file').addEventListener('change',async()=>{
  try{const text=await scanQrImage($('#qr-file').files?.[0]);$('#offline-payload').value=text;toast('QR leído. Valida el vale antes de reclamar.');}
  catch(error){toast(error.message,true);}finally{$('#qr-file').value='';}
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>close(button.dataset.close)));
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{
  if(dialog.id==='send-dialog'&&!dialog.open)pending=null;
  if(dialog.id==='recovery-dialog')$('#mnemonic-words').replaceChildren();
  if(dialog.id==='input-dialog')$('#input-value').value='';
});
window.addEventListener('offline',()=>connectionError('Sin internet. Se muestra la última consulta; los vales siguen sin liquidar.'));
window.addEventListener('online',()=>{toast('Conexión restablecida. Puedes revisar los reclamos pendientes.');if(wallet.getAddress())wallet.startSync();});
window.addEventListener('pagehide',()=>{wallet.lock();network.dispose();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install-button').hidden=false;});
action('#install-button',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install-button').hidden=true;}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>toast('No se pudo activar la instalación offline.',true));
void plugins.initializeAll();render();
