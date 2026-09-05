import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const required=['index.html','styles.css','manifest.json','service-worker.js','src/app.js','src/core/wallet.js','src/core/transaction.js','src/core/network.js','src/core/webd-format.js','src/core/plugin-manager.js','src/core/interfaces.d.ts','src/modules/mining.js','src/modules/offline.js','architecture.mermaid','API_CORE.md','USER_MANUAL.md','README.md','build-apk.js','android/settings.gradle','android/build.gradle','android/app/build.gradle','android/app/src/main/AndroidManifest.xml','android/app/src/main/java/com/webdollar/wallet/MainActivity.java'];
for(const path of required)assert.ok((await readFile(path,'utf8')).length,path);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons)await access(icon.src);
async function files(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(entry=>entry.isDirectory()?files(dir+'/'+entry.name):dir+'/'+entry.name))).flat();}
for(const file of [...await files('src'),'service-worker.js','build-apk.js']){
  if(!file.endsWith('.js'))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(result.status,0,file+': '+result.stderr);
}
const code=(await Promise.all((await files('src')).filter(p=>p.endsWith('.js')&&!p.includes('vendor')).map(p=>readFile(p,'utf8')))).join('\n');
assert.doesNotMatch(code,/api\.qrserver|localStorage\.setItem|addOfflineTransaction|2500/);
const app=await readFile('src/app.js','utf8');assert.match(app,/sendTransaction:requestSend/);
const serviceWorker=await readFile('service-worker.js','utf8');assert.match(serviceWorker,/src\/core\/native-socket\.js/);
console.log('Artefactos, sintaxis, iconos y ausencia de saldos/QR remotos simulados: OK.');
