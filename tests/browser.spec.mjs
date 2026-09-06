import {test,expect} from '@playwright/test';
import {fixtureFile} from './fixtures.mjs';
import {FEE_ADDRESS} from '../src/core/transaction.js';
import {mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:4173';
async function configureFixture(page,{rpc=false}={}){
  await page.route('https://node.fixture.invalid/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path==='/'?{protocol:'WebDollar',blocks:{length:2000000}}:path==='/top'?{top:2000000,is_synchronized:true}:path.includes('/balance/')?{result:true,balance:333}:{result:true,nonce:0};
    await route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  if(rpc)await page.route('https://rpc.fixture.invalid/**',async route=>{
    const request=route.request();
    const body=request.postDataJSON();
    const envelope=JSON.parse(Buffer.from(body.params[0],'base64').toString('utf8'));
    const raw=Buffer.from(envelope.transaction.data);
    const txId=createHash('sha256').update(createHash('sha256').update(raw).digest()).digest('hex');
    await route.fulfill({json:{jsonrpc:'2.0',id:body.id,result:txId},headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.locator('#connection-settings summary').first().click();
  await page.locator('#http-endpoint').fill('https://node.fixture.invalid');
  if(rpc)await page.locator('#rpc-endpoint').fill('https://rpc.fixture.invalid');
  await page.getByRole('button',{name:'Conectar y consultar'}).click();
  await expect(page.locator('#connection-summary')).toHaveText('https://node.fixture.invalid');
  await page.locator('#connection-settings summary').first().click();
}
test('import, exact review, fault isolation, local QR and responsive layouts',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);
  await configureFixture(page);
  const fixture=fixtureFile();
  await page.locator('#wallet-file').setInputFiles({name:fixture.name,mimeType:'application/json',buffer:Buffer.from(fixture.bytes)});
  await expect(page.locator('#balance-value')).toHaveText('333.00');
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual(['webdollar.language']);
  expect(await page.evaluate(()=>window.webdollarCore.wallet)).toBeUndefined();
  await page.locator('#recipient').fill(FEE_ADDRESS);await page.locator('#amount').fill('100');
  await page.getByRole('button',{name:'Revisar envío'}).click();
  await expect(page.locator('#confirm-receive-amount')).toHaveText('90.00 WEBD');
  await expect(page.locator('#confirm-fee')).toHaveText('10.00 WEBD');
  await expect(page.locator('#confirm-debit')).toHaveText('109.686 WEBD');
  await expect(page.locator('#confirm-send')).toBeEnabled();
  await page.locator('[data-close="send-dialog"]').click();
  await page.locator('#mining-toggle').click();
  await expect(page.locator('#mining-status-text')).toHaveText('No disponible');
  await expect(page.locator('#balance-value')).toHaveText('333.00');
  expect(await page.locator('#qr-image').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  await mkdir('test-evidence',{recursive:true});
  for(const width of [1440,375,320]){
    await page.setViewportSize({width,height:width===1440?1000:812});
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    expect(size.scroll).toBeLessThanOrEqual(size.width);
    await page.screenshot({path:'test-evidence/ui-'+width+'.png',fullPage:true});
  }
  expect(errors).toEqual([]);
});
test('explicit confirmation is the only broadcast gate',async({page})=>{
  let submitted=null;
  page.on('request',request=>{if(request.url().startsWith('https://rpc.fixture.invalid')&&request.method()==='POST')submitted=request.postDataJSON();});
  await page.goto(origin);
  await configureFixture(page,{rpc:true});
  const fixture=fixtureFile();
  await page.locator('#wallet-file').setInputFiles({name:fixture.name,mimeType:'application/json',buffer:Buffer.from(fixture.bytes)});
  await expect(page.locator('#balance-value')).toHaveText('333.00');
  await page.evaluate(to=>{
    const input={to,amount:'100'};
    const quote=window.webdollarCore.sendTransaction(input);
    input.amount='200';input.to=window.webdollarCore.getAddress();
    quote.policyIssues.push('modified by caller');
    document.querySelector('#confirm-send').click();
  },FEE_ADDRESS);
  await expect(page.locator('#confirm-send')).toBeEnabled();
  await expect(page.locator('#activity-list')).toContainText('Tus operaciones aparecerán aquí.');
  expect(submitted).toBeNull();
  await page.locator('#confirm-send').click();
  await expect(page.locator('#toast-region')).toContainText('Solicitud enviada. Verifica el hash');
  await expect(page.locator('#activity-list')).toContainText('Enviado al nodo, sin verificar');
  const bytes=Buffer.from(JSON.parse(Buffer.from(submitted.params[0],'base64').toString()).transaction.data);
  expect(bytes.readUIntLE(133,6)).toBe(900000);
  await expect(page.locator('#activity-list')).toContainText('109.686 WEBD');
});
test('signed offline QR roundtrip across two instances, no balance credit',async({browser})=>{
  const context=await browser.newContext(),sender=await context.newPage(),receiver=await context.newPage();
  for(const page of [sender,receiver]){await page.setViewportSize({width:375,height:812});await page.goto(origin);await configureFixture(page);}
  const fixture=fixtureFile();
  await sender.locator('#wallet-file').setInputFiles({name:fixture.name,mimeType:'application/json',buffer:Buffer.from(fixture.bytes)});
  await expect(sender.locator('#balance-value')).toHaveText('333.00');
  await receiver.locator('#watch-wallet').click();await receiver.locator('#input-value').fill(FEE_ADDRESS);await receiver.locator('#input-form button').click();
  await expect(receiver.locator('#balance-value')).toHaveText('333.00');
  await sender.locator('#offline-open').click();
  await sender.locator('#offline-recipient').fill(FEE_ADDRESS);await sender.locator('#offline-amount').fill('100');
  await context.setOffline(true);
  await sender.locator('#create-voucher').click();
  await expect(sender.locator('#voucher-state')).toContainText('Firmado');
  const qr=await sender.locator('#offline-qr').screenshot({path:'test-evidence/offline-qr.png'});
  await receiver.locator('#offline-open').click();
  await receiver.locator('#qr-file').setInputFiles({name:'public-test-qr.png',mimeType:'image/png',buffer:qr});
  await expect(receiver.locator('#offline-payload'),await receiver.locator('#toast-region').innerText()).toHaveValue(/^webd-pay-v1:/);
  await receiver.locator('#receive-voucher').click();
  await expect(receiver.locator('#voucher-state')).toContainText('90.00 WEBD pendientes');
  await expect(receiver.locator('#balance-value')).toHaveText('333.00');
  await receiver.locator('#receive-voucher').click();await expect(receiver.locator('#toast-region')).toContainText('ya está registrado');
  await context.setOffline(false);
  await receiver.locator('#claim-voucher').click();
  await expect(receiver.locator('#confirm-send')).toBeEnabled();
  await receiver.locator('[data-close="send-dialog"]').click();
  await context.close();
});
test('service worker offline reload contains shell, never node or wallet files',async({page,context})=>{
  await page.goto(origin);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cdp=await context.newCDPSession(page);
  const installability=await cdp.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('heading',{name:'Tu saldo, en tus manos.'})).toBeVisible();
  const urls=await page.evaluate(async()=>{const all=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())all.push(request.url);return all;});
  expect(urls.length).toBeGreaterThan(15);
  for(const url of urls){expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4173\//);expect(url).not.toMatch(/balance|nonce|\.webd/);}
  await context.setOffline(false);
});
