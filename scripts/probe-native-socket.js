import { mkdir, writeFile } from 'node:fs/promises';
import { NativeWebDollarSocket } from '../src/core/native-socket.js';

const endpoint = process.env.WEBDOLLAR_NODE || 'https://pool.timi.ro';
const checkedAt = new Date().toISOString();
const report = {
  checkedAt,
  endpoint,
  kind: 'read-only-native-socket-probe',
  privateWalletAccessed: false,
  transactionsBroadcast: 0,
};

const socket = new NativeWebDollarSocket(endpoint, { timeoutMs: 12000 });
try {
  await socket.connect();
  const answer = await socket.request('api/top', {}, 8000);
  report.connected = true;
  report.answerEvent = answer.event;
  report.top = answer.data?.top ?? null;
  report.isSynchronized = answer.data?.is_synchronized === true;
} catch (error) {
  report.connected = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  socket.close();
}

await mkdir('test-evidence', { recursive: true });
await writeFile('test-evidence/native-socket-connectivity.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
