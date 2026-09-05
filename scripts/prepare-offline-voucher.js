import fs from 'node:fs/promises';
import { parseWebdWallet } from '../src/core/webd-format.js';
import { buildAndSignMainnetTransaction, inspectSignedTransaction } from '../src/core/transaction.js';

const [walletPath, recipient, amount, ...optionalArgs] = process.argv.slice(2);
const showPayload = optionalArgs.includes('--show-payload');
const endpointArg = optionalArgs.find(value => value !== '--show-payload');
const endpoint = (endpointArg || 'https://pool.timi.ro').replace(/\/$/, '');

if (!walletPath || !recipient || !amount) {
  console.error('Uso: node scripts/prepare-offline-voucher.js <wallet.webd> <destino> <monto> [endpoint] [--show-payload]');
  process.exitCode = 2;
} else {
  const getJson = async path => {
    const response = await fetch(endpoint + path);
    if (!response.ok) throw new Error(`Nodo Mainnet respondió HTTP ${response.status} para ${path}.`);
    return response.json();
  };
  let secretKey = null;
  try {
    const file = new Uint8Array(await fs.readFile(walletPath));
    const parsed = parseWebdWallet(file);
    file.fill(0);
    const account = parsed.addresses.find(entry => entry.secretKey);
    if (!account?.secretKey) throw new Error('El .webd no contiene una clave privada utilizable.');
    secretKey = account.secretKey;
    const encoded = encodeURIComponent(account.address);
    const [balance, nonce, top] = await Promise.all([
      getJson('/address/balance/' + encoded),
      getJson('/address/nonce/' + encoded),
      getJson('/top')
    ]);
    if (balance.result !== true || typeof balance.balance !== 'number') throw new Error('Respuesta de saldo Mainnet inválida.');
    if (nonce.result !== true || !Number.isInteger(nonce.nonce)) throw new Error('Respuesta de nonce Mainnet inválida.');
    if (!Number.isInteger(top.top) || top.top < 1 || top.is_synchronized !== true) throw new Error('El nodo Mainnet no está sincronizado.');
    const tx = buildAndSignMainnetTransaction({
      publicKey: account.publicKey, secretKey, toAddress: recipient, amount,
      nonce: nonce.nonce, timeLock: top.top - 1
    });
    const checked = inspectSignedTransaction(tx.serializedTransactionBase64);
    if (checked.policyIssues.length) throw new Error(checked.policyIssues.join(' '));
    if (tx.totalDebit > balance.balance) throw new Error('Saldo Mainnet insuficiente para este vale.');
    const output = {
      kind: 'prepared-real-offline-voucher', network: 'mainnet', endpoint,
      from: tx.from, to: tx.to, amount: tx.amount, recipientAmount: tx.recipientAmount,
      treasuryFee: tx.fee, minerFee: tx.minerFee, totalDebit: tx.totalDebit,
      nonce: tx.nonce, timeLock: tx.timeLock, txId: tx.txId,
      balanceBefore: balance.balance, chainHeight: top.top,
      broadcasted: false, privateKeyOutput: false
    };
    if (showPayload) output.payload = 'webd-pay-v1:' + tx.serializedTransactionBase64;
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  } finally {
    secretKey?.fill(0);
  }
}
