import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const endpoint = process.env.WEBDOLLAR_NODE || 'https://pool.timi.ro';
const checkedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const report = {
  checkedAt,
  endpoint,
  kind: 'read-only-native-browser-probe',
  privateWalletAccessed: false,
  transactionsBroadcast: 0,
};

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async nodeEndpoint => {
    const { NativeWebDollarSocket } = await import('/src/core/native-socket.js');
    const socket = new NativeWebDollarSocket(nodeEndpoint, { timeoutMs: 10000 });
    const errors = [];
    let hello = null;
    socket.on('error', error => errors.push(error?.message || String(error)));
    socket.on('HelloNode', data => { hello = data; });
    await socket.connect();
    const transport = socket.getTransport();
    await new Promise(resolve => setTimeout(resolve, 750));
    socket.close();
    return { connected: true, transport, helloNodeType: hello?.nodeType ?? null, errors };
  }, endpoint);
  Object.assign(report, result);
} catch (error) {
  report.connected = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
}

await mkdir('test-evidence', { recursive: true });
await writeFile('test-evidence/native-browser-connectivity.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
