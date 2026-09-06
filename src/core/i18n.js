/*
 * WebDollar PWA - Módulo: i18n.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
const DEFAULT_LANGUAGE='es';
const SUPPORTED_LANGUAGES=new Set(['es','en']);
const STORAGE_KEY='webdollar.language';
let language=DEFAULT_LANGUAGE;
let messages={};

function interpolate(value,params={}){
  return String(value).replace(/\{(\w+)\}/g,(_,key)=>params[key]===undefined?`{${key}}`:String(params[key]));
}
export function getLanguage(){return language;}
export function t(key,params={}){return interpolate(messages[key]??key,params);}
export async function loadLanguage(next){
  const selected=SUPPORTED_LANGUAGES.has(next)?next:DEFAULT_LANGUAGE;
  const response=await fetch(`./src/locales/${selected}.json`,{cache:'no-store'});
  if(!response.ok)throw new Error(`No se pudo cargar el idioma ${selected}.`);
  messages=await response.json();language=selected;
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
