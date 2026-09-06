/*
 * WebDollar PWA - Módulo: qr.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
import { qrcode, jsQR } from '../vendor/dependencies.js';
export function qrDataUrl(payload){
  const qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({cellSize:5,margin:20,scalable:true}));
}
export function setQr(image,fallback,payload){image.src=qrDataUrl(payload);image.hidden=false;if(fallback)fallback.hidden=true;}
export async function scanQrImage(file){
  if(!file)throw new Error('Selecciona una imagen QR.');
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  const result=jsQR(pixels.data,pixels.width,pixels.height);
  if(!result)throw new Error('No se detectó un código QR legible.');return result.data;
}
