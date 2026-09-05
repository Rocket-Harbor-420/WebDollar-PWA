import { mkdir,writeFile } from 'node:fs/promises';
import { MAINNET_NODE_ENDPOINTS } from '../src/core/constants.js';
const candidates=[...new Set(MAINNET_NODE_ENDPOINTS)];
const results=await Promise.all(candidates.map(async url=>{
  try{
    const response=await fetch(url+'/top',{signal:AbortSignal.timeout(8000),redirect:'error'});
    const content=await response.text();
    return {url,status:response.status,cors:response.headers.get('access-control-allow-origin'),response:content.slice(0,500)};
  }catch(error){return {url,error:error.cause?.code||error.message};}
}));
const report={checkedAt:new Date().toISOString(),kind:'read-only-public-node-discovery',privateWalletAccessed:false,transactionsBroadcast:0,results};
await mkdir('test-evidence',{recursive:true});
await writeFile('test-evidence/mainnet-connectivity.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
