import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

await build({ entryPoints:['scripts/vendor-entry.js'], outfile:'src/vendor/dependencies.js', bundle:true, format:'esm', platform:'browser', target:'es2022', minify:true, legalComments:'eof' });
await mkdir('assets', {recursive:true});
// Code-native geometric application icon, no external image service.
for (const size of [192,512]) {
  const png = new PNG({width:size,height:size});
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const nx=x/size, ny=y/size;
    const stroke=(ax,ay,bx,by) => {
      const t=Math.max(0,Math.min(1,((nx-ax)*(bx-ax)+(ny-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
      return Math.hypot(nx-ax-t*(bx-ax),ny-ay-t*(by-ay))<.045;
    };
    const mark=stroke(.26,.3,.37,.7)||stroke(.37,.7,.5,.46)||stroke(.5,.46,.63,.7)||stroke(.63,.7,.74,.3);
    const color=mark?[7,19,26]:[185,255,61];
    const offset=(y*size+x)*4;
    png.data.set([...color,255],offset);
  }
  await writeFile(`assets/icon-${size}.png`,PNG.sync.write(png));
}
console.log('Dependencias locales e iconos generados.');
const licenses=[];
for(const [name,path] of [['tweetnacl','tweetnacl/LICENSE'],['noble-hashes','@noble/hashes/LICENSE'],['scure-bip39','@scure/bip39/LICENSE'],['scure-base','@scure/base/LICENSE'],['qrcode-generator','qrcode-generator/qrcode.js'],['jsqr','jsqr/LICENSE'],['argon2-browser','argon2-browser/LICENSE']]){
  const source=await readFile('node_modules/'+path,'utf8');
  licenses.push('## '+name+'\n\n'+(path.endsWith('.js')?source.split('\n').slice(0,16).join('\n'):source));
}
await writeFile('THIRD_PARTY_NOTICES.md','# Dependencias distribuidas localmente\n\n'+licenses.join('\n\n'));
