/*
 * WebDollar PWA - Módulo: i18n.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
const DEFAULT_LANGUAGE='es';
const SUPPORTED_LANGUAGES=new Set(['es','en','it','ro','zh-CN']);
const STORAGE_KEY='webdollar.language';
const THEME_STORAGE_KEY='webdollar.theme';
const THEME_OPTIONS=new Set(['system','light','dark']);
let language=DEFAULT_LANGUAGE;
let messages={};
let theme='system';
let themeMediaQuery=null;
const MARKETPLACE_MESSAGES={
  es:{'marketplace.protocolUnavailable':'El nodo no anuncia el protocolo Marketplace Mainnet','marketplace.amount':'Cantidad','marketplace.amountPlaceholder':'1.00','marketplace.buy':'Comprar','marketplace.seller':'Vendedor','marketplace.transmitted':'Operación aceptada por Mainnet: {reference}','marketplace.intro':'Consulta activos y prepara órdenes que el nodo Marketplace Mainnet pueda validar. Sin protocolo anunciado, la app no firma ni transmite operaciones ficticias.','marketplace.comingSoon':'Los tokens aparecen cuando el nodo anuncia la API de Assets.','marketplace.reviewTitle':'Confirma la operación','marketplace.reviewCopy':'La orden se firmará localmente y se enviará al endpoint Marketplace Mainnet únicamente después de tu confirmación.','marketplace.confirm':'Confirmar, firmar y transmitir'},
  en:{'marketplace.protocolUnavailable':'The node does not announce the Mainnet Marketplace protocol','marketplace.amount':'Amount','marketplace.amountPlaceholder':'1.00','marketplace.buy':'Buy','marketplace.seller':'Seller','marketplace.transmitted':'Operation accepted by Mainnet: {reference}','marketplace.intro':'Query assets and prepare orders that the Mainnet Marketplace node can validate. Without an announced protocol, the app will not sign or transmit fictitious operations.','marketplace.comingSoon':'Tokens appear when the node announces the Assets API.','marketplace.reviewTitle':'Confirm operation','marketplace.reviewCopy':'The order will be signed locally and sent to the Mainnet Marketplace endpoint only after your confirmation.','marketplace.confirm':'Confirm, sign and transmit'},
  it:{'marketplace.protocolUnavailable':'Il nodo non annuncia il protocollo Marketplace Mainnet','marketplace.amount':'Quantità','marketplace.amountPlaceholder':'1.00','marketplace.buy':'Acquista','marketplace.seller':'Venditore','marketplace.transmitted':'Operazione accettata da Mainnet: {reference}','marketplace.intro':'Consulta gli asset e prepara ordini che il nodo Marketplace Mainnet può validare. Senza un protocollo annunciato, l’app non firma né trasmette operazioni fittizie.','marketplace.comingSoon':'I token appaiono quando il nodo annuncia l’API Assets.','marketplace.reviewTitle':'Conferma operazione','marketplace.reviewCopy':'L’ordine sarà firmato localmente e inviato all’endpoint Marketplace Mainnet solo dopo la tua conferma.','marketplace.confirm':'Conferma, firma e trasmetti'},
  ro:{'marketplace.protocolUnavailable':'Nodul nu anunță protocolul Marketplace Mainnet','marketplace.amount':'Cantitate','marketplace.amountPlaceholder':'1.00','marketplace.buy':'Cumpără','marketplace.seller':'Vânzător','marketplace.transmitted':'Operație acceptată de Mainnet: {reference}','marketplace.intro':'Consultă activele și pregătește ordine pe care nodul Marketplace Mainnet le poate valida. Fără un protocol anunțat, aplicația nu semnează și nu transmite operațiuni fictive.','marketplace.comingSoon':'Tokenurile apar când nodul anunță API-ul Assets.','marketplace.reviewTitle':'Confirmă operațiunea','marketplace.reviewCopy':'Ordinul va fi semnat local și trimis către endpointul Marketplace Mainnet numai după confirmarea ta.','marketplace.confirm':'Confirmă, semnează și transmite'},
  'zh-CN':{'marketplace.protocolUnavailable':'节点未公布主网市场协议','marketplace.amount':'数量','marketplace.amountPlaceholder':'1.00','marketplace.buy':'购买','marketplace.seller':'卖家','marketplace.transmitted':'主网已接受操作：{reference}','marketplace.intro':'查询资产并准备可由主网市场节点验证的订单。节点未公布协议时，应用不会签名或发送虚构操作。','marketplace.comingSoon':'节点公布 Assets API 后，代币才会显示。','marketplace.reviewTitle':'确认操作','marketplace.reviewCopy':'订单将在本地签名，并且只有在你确认后才会发送到主网市场端点。','marketplace.confirm':'确认、签名并发送'}
};
const MARKETPLACE_QUEUE_MESSAGES={
  es:{'marketplace.queued':'Orden firmada guardada para reintento de red: {reference}','marketplace.pendingCount':'Pendientes de red: {count}','marketplace.retryPending':'Reintentar pendientes','marketplace.retryResult':'Transmitidas: {count}'},
  en:{'marketplace.queued':'Signed order saved for a network retry: {reference}','marketplace.pendingCount':'Network pending: {count}','marketplace.retryPending':'Retry pending orders','marketplace.retryResult':'Transmitted: {count}'},
  it:{'marketplace.queued':'Ordine firmato salvato per un nuovo tentativo di rete: {reference}','marketplace.pendingCount':'In attesa di rete: {count}','marketplace.retryPending':'Riprova ordini in attesa','marketplace.retryResult':'Trasmessi: {count}'},
  ro:{'marketplace.queued':'Ordin semnat salvat pentru o nouă încercare de rețea: {reference}','marketplace.pendingCount':'În așteptarea rețelei: {count}','marketplace.retryPending':'Reîncearcă ordinele în așteptare','marketplace.retryResult':'Transmise: {count}'},
  'zh-CN':{'marketplace.queued':'已保存签名订单，等待网络重试：{reference}','marketplace.pendingCount':'等待网络：{count}','marketplace.retryPending':'重试待处理订单','marketplace.retryResult':'已发送：{count}'}
};
const MARKETPLACE_ASSET_MESSAGES={
  es:{'marketplace.assetsConnected':'API de Assets conectada; Marketplace no anunciado'},
  en:{'marketplace.assetsConnected':'Assets API connected; Marketplace not announced'},
  it:{'marketplace.assetsConnected':'API Assets connessa; Marketplace non annunciato'},
  ro:{'marketplace.assetsConnected':'API Assets conectat; Marketplace neanunțat'},
  'zh-CN':{'marketplace.assetsConnected':'Assets API 已连接；节点未公布市场协议'}
};

function interpolate(value,params={}){
  return String(value).replace(/\{(\w+)\}/g,(_,key)=>params[key]===undefined?`{${key}}`:String(params[key]));
}
export function getLanguage(){return language;}
export function t(key,params={}){return interpolate(messages[key]??MARKETPLACE_MESSAGES[language]?.[key]??MARKETPLACE_QUEUE_MESSAGES[language]?.[key]??MARKETPLACE_ASSET_MESSAGES[language]?.[key]??key,params);}
export function getTheme(){return theme;}
export function effectiveTheme(){return theme==='system'&&themeMediaQuery?themeMediaQuery.matches?'dark':'light':theme;}
export function applyTheme(){
  const active=effectiveTheme();
  document.documentElement.classList.toggle('dark-theme',active==='dark');
  document.documentElement.dataset.theme=active;
  document.documentElement.style.colorScheme=active;
}
export function themeOptions(){return [...THEME_OPTIONS];}
export async function loadTheme(next){
  theme=THEME_OPTIONS.has(next)?next:'system';
  try{localStorage.setItem(THEME_STORAGE_KEY,theme);}catch{}
  applyTheme();
  return theme;
}
export async function initTheme(){
  try{theme=THEME_OPTIONS.has(localStorage.getItem(THEME_STORAGE_KEY))?localStorage.getItem(THEME_STORAGE_KEY):'system';}catch{theme='system';}
  themeMediaQuery=window.matchMedia?.('(prefers-color-scheme: dark)')||null;
  themeMediaQuery?.addEventListener?.('change',()=>{if(theme==='system')applyTheme();});
  applyTheme();
  return theme;
}
export async function loadLanguage(next){
  const selected=SUPPORTED_LANGUAGES.has(next)?next:DEFAULT_LANGUAGE;
  const response=await fetch(`./src/locales/${selected}.json`,{cache:'no-store'});
  if(!response.ok)throw new Error(`No se pudo cargar el idioma ${selected}.`);
  messages={...await response.json(),...MARKETPLACE_MESSAGES[selected]};language=selected;
  try{localStorage.setItem(STORAGE_KEY,selected);}catch{}
  document.documentElement.lang=selected;
  applyTranslations();
  return selected;
}
export async function initLanguage(){
  let preferred=DEFAULT_LANGUAGE;
  try{preferred=localStorage.getItem(STORAGE_KEY)||DEFAULT_LANGUAGE;}catch{}
  try{return await loadLanguage(preferred);}catch(error){
    messages={};language=DEFAULT_LANGUAGE;document.documentElement.lang=DEFAULT_LANGUAGE;
    console.warn(error.message);
    return language;
  }
}
export function applyTranslations(root=document){
  root.querySelectorAll?.('[data-i18n]').forEach(element=>{element.textContent=t(element.dataset.i18n);});
  root.querySelectorAll?.('[data-i18n-html]').forEach(element=>{element.innerHTML=t(element.dataset.i18nHtml);});
  root.querySelectorAll?.('[data-i18n-placeholder]').forEach(element=>{element.placeholder=t(element.dataset.i18nPlaceholder);});
  root.querySelectorAll?.('[data-i18n-aria-label]').forEach(element=>{element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel));});
  root.querySelectorAll?.('[data-i18n-title]').forEach(element=>{element.title=t(element.dataset.i18nTitle);});
  root.querySelectorAll?.('[data-i18n-alt]').forEach(element=>{element.alt=t(element.dataset.i18nAlt);});
}
export function languageOptions(){return [...SUPPORTED_LANGUAGES];}
