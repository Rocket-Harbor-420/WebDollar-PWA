import { access, copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const local = args.includes('--local');
const dryRun = args.includes('--dry-run');
const argument = args.find(arg => !arg.startsWith('--'));

const run = (command, commandArgs, options = {}) => {
  console.log(JSON.stringify({ command, args: commandArgs, cwd: options.cwd ?? process.cwd() }));
  if (dryRun) return;
  const isBatch = process.platform === 'win32' && command.toLowerCase().endsWith('.bat');
  const result = spawnSync(command, commandArgs, { ...options, stdio: 'inherit', shell: isBatch });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

async function copyPwaIntoAndroidAssets() {
  const workspace = resolve('.');
  const assetsRoot = resolve('android/app/src/main/assets');
  const target = resolve(assetsRoot, 'www');
  const relativeTarget = relative(assetsRoot, target);
  if (relativeTarget.startsWith('..') || !target.startsWith(assetsRoot)) throw new Error('Destino de assets Android inválido.');
  if (!dryRun) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    for (const file of ['index.html', 'styles.css', 'manifest.json', 'service-worker.js']) {
      await copyFile(join(workspace, file), join(target, file));
    }
    await cp(join(workspace, 'src'), join(target, 'src'), { recursive: true });
    await cp(join(workspace, 'assets'), join(target, 'assets'), { recursive: true });
  }
  return target;
}

async function buildLocalApk() {
  const target = await copyPwaIntoAndroidAssets();
  const gradleCandidates = [
    process.env.GRADLE_CMD,
    resolve('.gradle-dist/gradle-8.10.2/bin/gradle.bat'),
    'gradle',
  ].filter(Boolean);
  const gradle = gradleCandidates.find(candidate => candidate === 'gradle' || existsSync(candidate));
  if (!gradle) throw new Error('No se encontró Gradle. Define GRADLE_CMD o instala Gradle 8.10.2.');
  const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || resolve('.android-sdk');
  const androidJar = resolve(sdkRoot, 'platforms/android-35/android.jar');
  if (!existsSync(androidJar)) throw new Error('No se encontró Android SDK Platform 35 en '+sdkRoot+'.');
  const androidDir = resolve('android');
  run(gradle, [':app:assembleDebug', '--no-daemon'], {
    cwd: androidDir,
    env: { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot },
  });
  if (dryRun) {
    console.log('Comandos de APK local validados (sin compilación). Assets: '+target);
    return;
  }
  const built = resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  await access(built);
  const output = resolve('WebDollar-wallet-debug.apk');
  await copyFile(built, output);
  console.log('APK local: '+output);
}

async function buildTwa() {
  if (!argument) {
    console.error('Uso: npm run build:apk -- https://tu-dominio.example [--dry-run] o npm run build:apk:local');
    process.exit(1);
  }
  const url = new URL(argument);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    console.error('Indica la URL HTTPS pública de la PWA, sin credenciales.');
    process.exit(1);
  }
  const directory = resolve('build/android');
  const npmCandidates = [process.env.npm_execpath, resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  const npm = npmCandidates.find(path => existsSync(path));
  if (!npm) throw new Error('Ejecuta este script mediante npm run build:apk.');
  const manifest = new URL('manifest.json', url.href.replace(/\/?$/, '/')).href;
  const bubblewrap = (bubblewrapArgs) => run(process.execPath, [npm, 'exec', '--yes', '--package=@bubblewrap/cli@1.25.0', '--', 'bubblewrap', ...bubblewrapArgs], { cwd: directory });
  if (!dryRun) await mkdir(directory, { recursive: true });
  if (!existsSync(resolve(directory, 'twa-manifest.json'))) bubblewrap(['init', '--manifest', manifest, '--directory', directory]);
  bubblewrap(['build']);
  if (!dryRun && !existsSync(resolve(directory, 'app-release-signed.apk'))) throw new Error('El compilador no produjo el APK firmado esperado.');
  console.log(dryRun ? 'Comandos de build TWA validados (sin compilación).' : 'APK TWA: '+resolve(directory, 'app-release-signed.apk'));
}

if (local) await buildLocalApk();
else await buildTwa();
