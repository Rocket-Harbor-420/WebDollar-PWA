/*
 * WebDollar PWA - Módulo: messenger.js
 * Solo comparte datos públicos o vales ya firmados; nunca exporta claves.
 */
const PLATFORM_URLS={
  whatsapp:text=>`https://wa.me/?text=${encodeURIComponent(text)}`,
  telegram:(text,url)=>`https://t.me/share/url?url=${encodeURIComponent(url||(typeof location!=='undefined'?location.href:''))}&text=${encodeURIComponent(text)}`,
  messenger:(text,url)=>`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url||(typeof location!=='undefined'?location.href:''))}&quote=${encodeURIComponent(text)}`
};
function assertPlatform(platform){if(!PLATFORM_URLS[platform])throw new Error('Canal de mensajería no compatible.');return platform;}
function openShare(url){
  if(typeof window!=='undefined'&&typeof window.open==='function')window.open(url,'_blank','noopener,noreferrer');
  return url;
}
export const messengerModule={
  id:'messenger',name:'Compartir por mensajería',
  init(core){this.core=core;},
  shareAddress(platform,address=this.core?.getAddress?.()){
    assertPlatform(platform);if(!address)throw new Error('Carga una cartera para compartir la dirección.');
    return openShare(PLATFORM_URLS[platform](`Mi dirección WebDollar es ${address}`,address));
  },
  shareVoucher(platform,payload){
    assertPlatform(platform);if(typeof payload!=='string'||!payload.startsWith('webd-pay-v1:'))throw new Error('Genera o selecciona un vale firmado antes de compartirlo.');
    return openShare(PLATFORM_URLS[platform](`Vale WebDollar firmado:\n${payload}`,payload));
  }
};
