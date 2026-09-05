export const APP_VERSION='2.0.0';
export const NETWORK_NAME='WebDollar Mainnet';
export { FEE_ADDRESS,FEE_RATE } from './transaction.js';
export const MAINNET_NODE_ENDPOINTS=Object.freeze([
  // HTTPS entries from the official Node-WebDollar fallback registry.
  // Verified against the live Mainnet API during the 2026-09-05 connectivity audit.
  'https://pool.timi.ro','https://node.timi.ro',
  'https://webd.serverworks.ro','https://webd.5q.ro:8443','https://daniuda.ddns.net:8080',
  'https://doris.webdollarpool.ca','https://webd-europool.ddns.net:2222',
  'https://us-est.webdmine.io:8443','https://webdmine.io:8443','https://pool.maison:8443',
  'https://europe.pool.maison:8443','https://node.spyclub.ro:8080','https://webdollarpool.ca',
  'https://webd.pool.coffee:8443','https://node1.petreus.ro','https://node2.petreus.ro',
  'https://node3.petreus.ro','https://node4.petreus.ro','https://node5.petreus.ro',
  'https://node6.petreus.ro','https://node7.petreus.ro','https://node8.petreus.ro',
  'https://node9.petreus.ro','https://node10.petreus.ro','https://node.timi.ro',
  'https://node1.timi.ro','https://node2.timi.ro','https://node3.timi.ro','https://node4.timi.ro',
  'https://node5.timi.ro','https://node6.timi.ro','https://node7.timi.ro','https://node8.timi.ro',
  'https://node9.timi.ro','https://node10.timi.ro','https://node11.timi.ro','https://node12.timi.ro',
  'https://node13.timi.ro','https://node14.timi.ro','https://node15.timi.ro','https://node16.timi.ro',
  'https://node1.webdollarminingpool.com','https://node2.webdollarminingpool.com',
  'https://node3.webdollarminingpool.com','https://node4.webdollarminingpool.com',
  'https://node5.webdollarminingpool.com','https://node6.webdollarminingpool.com',
  'https://node7.webdollarminingpool.com','https://node8.webdollarminingpool.com',
  'https://node9.webdollarminingpool.com','https://node10.webdollarminingpool.com',
  'https://node11.webdollarminingpool.com','https://node12.webdollarminingpool.com',
  'https://node13.webdollarminingpool.com','https://node14.webdollarminingpool.com',
  'https://node15.webdollarminingpool.com','https://falx.romeonet.ro:65001',
  'https://romeonet.ddns.net:65101','https://cryptocoingb.ddns.net:8080',
  'https://cryptocoingb.ddns.net:8081','https://bacm.ro:2053'
]);
// Read-only explorer mirror. It is never treated as a transaction relay.
export const MAINNET_EXPLORER_API_ENDPOINTS=Object.freeze([
  'https://webdollar.cloudns.nz/api'
]);
