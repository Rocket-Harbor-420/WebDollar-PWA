import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeWebDollarSocket } from '../src/core/native-socket.js';

class Peer extends EventTarget {
  sent=[];
  static current;
  constructor(){
    super();Peer.current=this;
    queueMicrotask(()=>{this.frame('40');this.frame('42["HelloNode",{"nodeType":1}]');});
  }
  frame(data){this.dispatchEvent(new MessageEvent('message',{data}));}
  send(data){this.sent.push(data);if(typeof data==='string'&&data.includes('"api/start"'))this.frame('42["api/start/answer",{"result":true}]');}
  close(){}
}

test('binary block announcement is dispatched only after both attachments arrive',async()=>{
  const socket=new NativeWebDollarSocket('https://node.example',{WebSocketImpl:Peer});
  await socket.connect();
  const blocks=[];socket.on('head/new-block',block=>blocks.push(block));
  const peer=Peer.current;
  peer.frame('452-["head/new-block",{"l":5969913,"h":{"_placeholder":true,"num":0},"W":{"_placeholder":true,"num":1}}]');
  peer.frame(new Uint8Array([4,1,2,3]).buffer);
  assert.equal(blocks.length,0);
  peer.frame(new Uint8Array([4,4,5]).buffer);
  assert.equal(blocks.length,1);
  assert.equal(blocks[0].l,5969913);
  assert.deepEqual([...new Uint8Array(blocks[0].h)],[1,2,3]);
  assert.deepEqual([...new Uint8Array(blocks[0].W)],[4,5]);
  peer.frame('451-["head/new-block",{"h":{"_placeholder":true,"num":7}}]');
  peer.frame(new Uint8Array([4,0]).buffer);
  assert.equal(blocks.length,1);
  peer.frame('42["head/new-block",{"l":5969914}]');
  assert.equal(blocks.length,2);
  socket.sendBinaryEvent('transactions/new-pending-transaction',new Uint8Array([2,9,7]));
  assert.deepEqual([...new Uint8Array(peer.sent.at(-1))],[4,2,9,7]);
  socket.close();
});

test('browser polling encodes Socket.IO binary propagation without private data',async()=>{
  const posts=[];let gets=0;
  const hello='42["HelloNode",{"nodeType":1}]';
  const fetchImpl=async(_url,options={})=>{
    if(options.method==='POST'){
      posts.push(String(options.body));
      return new Response('ok',{status:200});
    }
    gets++;
    if(gets===1){const open='0{"sid":"poll-test"}';return new Response(`${open.length}:${open}2:40`,{status:200});}
    if(gets===2)return new Response(`${hello.length}:${hello}`,{status:200});
    return await new Promise(resolve=>options.signal?.addEventListener('abort',()=>resolve(new Response('',{status:200}))));
  };
  const socket=new NativeWebDollarSocket('https://node.example',{WebSocketImpl:null,fetchImpl,timeoutMs:1000});
  await socket.connect();
  socket.sendBinaryEvent('transactions/new-pending-transaction',new Uint8Array([1,2,3]));
  await new Promise(resolve=>setTimeout(resolve,10));
  const body=posts.find(item=>item.includes('transactions/new-pending-transaction'));
  assert.ok(body);
  assert.match(body,/^\d+:451-/);
  assert.match(body,/transactions\/new-pending-transaction/);
  assert.match(body,/b4AQID/);
  socket.close();
});

test('binary request preserves nested pool fields as Socket.IO attachments',async()=>{
  const socket=new NativeWebDollarSocket('https://node.example',{WebSocketImpl:Peer});
  await socket.connect();
  const peer=Peer.current;
  const pending=socket.requestWithBinary('mining-pool/hello-pool',{message:new Uint8Array([1,2]),pool:new Uint8Array([3,4]),addresses:['0102']},1000);
  await new Promise(resolve=>setTimeout(resolve,5));
  const header=peer.sent.find(value=>typeof value==='string'&&value.startsWith('452-'));
  assert.ok(header);assert.match(header,/"_placeholder":true/);assert.deepEqual([...new Uint8Array(peer.sent.find(value=>value instanceof ArrayBuffer))],[4,1,2]);
  peer.frame('42["mining-pool/hello-pool/answer",{"result":true}]');
  assert.equal((await pending).data.result,true);socket.close();
});
