// Minimal Engine.IO v3 / Socket.IO v2 client for the WebDollar node protocol.
// It intentionally implements only the browser-peer messages required by the
// wallet: HelloNode, api/start, read-only API events and binary transaction
// propagation. No third-party Socket.IO runtime is shipped.

function socketQuery(endpoint, version, uuid, transport, nodeConsensusType = 1) {
  const url = new URL(endpoint);
  url.protocol = transport === 'websocket'
    ? (url.protocol === 'https:' ? 'wss:' : 'ws:')
    : (url.protocol === 'wss:' ? 'https:' : url.protocol);
  url.pathname = '/socket.io/';
  url.search = '';
  const query = new URLSearchParams({
    EIO: '3', transport, msg: 'HelloNode', version: String(version || '1.3.24'), uuid,
    nodeType: '0', nodeConsensusType: String(nodeConsensusType), UTC: String(Math.floor(Date.now() / 1000)), domain: 'browser',
  });
  url.search = '?' + query.toString();
  return url.href;
}

function pollingQuery(endpoint, sid = '') {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol;
  url.pathname = '/socket.io/';
  url.search = '';
  const query = new URLSearchParams({ EIO: '3', transport: 'polling', t: String(Date.now()) });
  if (sid) query.set('sid', sid);
  url.search = '?' + query.toString();
  return url.href;
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCharCode(...view.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function encodePollingPayload(packets) {
  return packets.map(packet => `${packet.length}:${packet}`).join('');
}

function decodeTextPayload(text) {
  const packets = [];
  let offset = 0;
  while (offset < text.length) {
    const separator = text.indexOf(':', offset);
    if (separator < 0) throw new Error('Payload polling incompleto.');
    const lengthText = text.slice(offset, separator);
    if (!/^\d+$/.test(lengthText)) throw new Error('Longitud de payload polling inválida.');
    const length = Number(lengthText);
    const start = separator + 1;
    const end = start + length;
    if (!Number.isSafeInteger(length) || end > text.length) throw new Error('Paquete polling truncado.');
    packets.push(text.slice(start, end));
    offset = end;
  }
  return packets;
}

function decodeBinaryPayload(buffer) {
  const bytes = new Uint8Array(buffer);
  const packets = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset < bytes.length) {
    const kind = bytes[offset++];
    if (kind !== 0 && kind !== 1) throw new Error('Tipo de paquete polling binario inválido.');
    let lengthText = '';
    while (offset < bytes.length && bytes[offset] !== 255) {
      const digit = bytes[offset++];
      // Engine.IO v3 encodes the decimal length digits as numeric bytes
      // (1, 5, 6), not ASCII bytes ('1', '5', '6').
      if (digit > 9 || lengthText.length > 9) throw new Error('Longitud binaria inválida.');
      lengthText += String(digit);
    }
    if (bytes[offset++] !== 255 || !lengthText) throw new Error('Separador binario ausente.');
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || offset + length > bytes.length) throw new Error('Paquete binario truncado.');
    const part = bytes.slice(offset, offset + length);
    offset += length;
    packets.push(kind === 0 ? decoder.decode(part) : part.buffer);
  }
  return packets;
}

export function socketEventPacket(name, data) { return '42' + JSON.stringify([name, data]); }

export function socketBinaryEventPacket(name, attachmentCount = 1, data = { buffer: { _placeholder: true, num: 0 } }) {
  if (!Number.isInteger(attachmentCount) || attachmentCount < 1 || attachmentCount > 9) {
    throw new Error('Número de adjuntos Socket.IO inválido.');
  }
  return '4' + '5' + String(attachmentCount) + '-' + JSON.stringify([name, data]);
}

export class NativeWebDollarSocket {
  #socket = null; #events = new Map(); #pending = new Map(); #opened = false; #closed = false;
  #timer = null; #binary = null; #transport = null; #sid = ''; #uuid = ''; #fetchImpl;
  #pollController = null; #pollLoopPromise = null; #pollWrite = Promise.resolve(); #pollFailureReject = null;

  constructor(endpoint, { version = '1.3.24', nodeConsensusType = 1, timeoutMs = 10000, WebSocketImpl = globalThis.WebSocket,
    fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    this.endpoint = endpoint; this.version = version; this.nodeConsensusType = nodeConsensusType; this.timeoutMs = timeoutMs;
    this.WebSocketImpl = WebSocketImpl; this.#fetchImpl = fetchImpl;
  }

  on(name, handler) {
    if (typeof handler !== 'function') throw new Error('El listener Socket.IO debe ser una función.');
    const list = this.#events.get(name) || []; list.push(handler); this.#events.set(name, list);
    return () => { const current = this.#events.get(name) || []; this.#events.set(name, current.filter(item => item !== handler)); };
  }

  #emit(name, data) { for (const handler of [...(this.#events.get(name) || [])]) { try { handler(data); } catch {} } }
  #failPending(error) { for (const waiters of this.#pending.values()) for (const resolve of waiters) resolve({ error }); this.#pending.clear(); }

  #message(raw) {
    if (raw instanceof ArrayBuffer) {
      if (new Uint8Array(raw)[0] !== 4) { this.#binary = null; return; }
      raw = raw.slice(1); const assembly = this.#binary; if (!assembly) return;
      assembly.size += raw.byteLength;
      if (assembly.size > 3 * 1024 * 1024) { this.#binary = null; return; }
      assembly.buffers.push(raw);
      if (assembly.buffers.length === assembly.count) {
        this.#binary = null;
        const restore = (value, depth = 0) => {
          if (depth > 32) throw new Error('Paquete demasiado profundo.');
          if (!value || typeof value !== 'object') return value;
          if (value._placeholder === true) {
            if (!Number.isInteger(value.num) || value.num < 0 || value.num >= assembly.count) throw new Error('Adjunto inválido.');
            return assembly.buffers[value.num];
          }
          if (Array.isArray(value)) return value.map(item => restore(item, depth + 1));
          return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item, depth + 1)]));
        };
        try { this.#dispatch(restore(assembly.packet)); } catch {}
      }
      return;
    }
    if (typeof raw !== 'string') return;
    if (raw.startsWith('b4')) { try { this.#message(base64ToArrayBuffer(raw.slice(2))); } catch {} return; }
    if (raw === '2') { if (this.#transport === 'polling') this.#queuePollingPayload(encodePollingPayload(['3'])); else this.#socket?.send('3'); return; }
    if (raw === '40') { this.#opened = true; this.#emit('connect'); return; }
    if (raw.startsWith('45')) {
      this.#binary = null; const match = /^45([1-9])-([\s\S]+)$/.exec(raw);
      if (!match || raw.length > 65536) return;
      try { this.#binary = { count: Number(match[1]), packet: JSON.parse(match[2]), buffers: [], size: 0 }; } catch {}
      return;
    }
    if (!raw.startsWith('42')) return;
    this.#binary = null; let packet; try { packet = JSON.parse(raw.slice(2)); } catch { return; }
    this.#dispatch(packet);
  }

  #dispatch(packet) {
    if (!Array.isArray(packet) || typeof packet[0] !== 'string') return;
    const [name, data] = packet; this.#emit(name, data);
    const waiters = this.#pending.get(name);
    if (waiters) { this.#pending.delete(name); for (const resolve of waiters) resolve({ data }); }
  }

  waitFor(name, timeoutMs = this.timeoutMs) {
    return new Promise(resolve => {
      const list = this.#pending.get(name) || []; list.push(resolve); this.#pending.set(name, list);
      setTimeout(() => {
        const current = this.#pending.get(name) || []; const index = current.indexOf(resolve);
        if (index >= 0) { current.splice(index, 1); if (current.length) this.#pending.set(name, current); else this.#pending.delete(name); resolve({ error: new Error('Tiempo de espera agotado para ' + name + '.') }); }
      }, timeoutMs);
    });
  }

  request(name, data = {}, timeoutMs = this.timeoutMs) {
    if (typeof name !== 'string' || !name) throw new Error('Nombre de evento Socket.IO inválido.');
    const answerNames = [name + '/answer', name + '/answer/undefined'];
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); for (const off of offs) off(); if (result.error) reject(result.error); else resolve(result); };
      const timer = setTimeout(() => finish({ error: new Error('Tiempo de espera agotado para ' + name + '.') }), timeoutMs);
      const offs = answerNames.map(answerName => this.on(answerName, response => finish({ data: response, event: answerName })));
      try { this.sendEvent(name, data); } catch (error) { finish({ error }); }
    });
  }

  requestWithBinary(name, data = {}, timeoutMs = this.timeoutMs) {
    if (typeof name !== 'string' || !name) throw new Error('Nombre de evento Socket.IO inválido.');
    const answerNames = [name + '/answer', name + '/answer/undefined'];
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); for (const off of offs) off(); if (result.error) reject(result.error); else resolve(result); };
      const timer = setTimeout(() => finish({ error: new Error('Tiempo de espera agotado para ' + name + '.') }), timeoutMs);
      const offs = answerNames.map(answerName => this.on(answerName, response => finish({ data: response, event: answerName })));
      try { this.sendEventWithBinary(name, data); } catch (error) { finish({ error }); }
    });
  }

  #queuePollingPayload(payload) {
    if (this.#closed) return;
    this.#pollWrite = this.#pollWrite.then(async () => {
      const response = await this.#fetchImpl(pollingQuery(this.endpoint, this.#sid), { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/plain' }, body: payload });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' al enviar por polling.');
    }).catch(error => {
      if (!this.#closed) { this.#failPending(error); this.#emit('error', error); this.#pollFailureReject?.(error); }
    });
  }

  async #pollGet(initial = false) {
    this.#pollController = new AbortController();
    try {
      const response = await this.#fetchImpl(initial ? socketQuery(this.endpoint, this.version, this.#uuid, 'polling', this.nodeConsensusType) : pollingQuery(this.endpoint, this.#sid), {
        method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: this.#pollController.signal, headers: { Accept: 'text/plain' },
      });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' al conectar por polling.');
      return await response.arrayBuffer();
    } finally { this.#pollController = null; }
  }

  #consumePollingPayload(buffer) {
    const bytes = new Uint8Array(buffer);
    const packets = bytes.length && (bytes[0] === 0 || bytes[0] === 1) ? decodeBinaryPayload(buffer) : decodeTextPayload(new TextDecoder().decode(bytes));
    for (const packet of packets) this.#message(packet);
  }

  async #pollLoop() {
    try {
      while (!this.#closed && this.#transport === 'polling') this.#consumePollingPayload(await this.#pollGet(false));
    } catch (error) {
      if (!this.#closed) { this.#failPending(error); this.#emit('error', error); this.#pollFailureReject?.(error); this.#opened = false; this.#emit('close'); }
    }
  }

  #waitForHello(timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { offHello(); reject(new Error('Tiempo de espera agotado para HelloNode.')); }, timeoutMs);
      const offHello = this.on('HelloNode', data => {
        clearTimeout(timer); offHello();
        if (!data || data.nodeType === undefined) reject(new Error('Handshake HelloNode inválido.'));
        else resolve(data);
      });
    });
  }

  #completeHandshake() {
    return this.#waitForHello().then(() => this.request('api/start', { login: 'false' }).then(result => {
      if (result.data?.result !== true) throw new Error('El peer rechazó api/start.');
      return this;
    }));
  }

  async #connectWebSocket() {
    if (!this.WebSocketImpl) throw new Error('WebSocket no está disponible en este navegador.');
    const uuid = randomUuid();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => { if (settled) return; settled = true; clearTimeout(this.#timer); try { this.#socket?.close(); } catch {} this.#socket = null; this.#opened = false; reject(error instanceof Error ? error : new Error(String(error))); };
      this.#timer = setTimeout(() => fail(new Error('Tiempo de espera agotado al conectar con el peer Mainnet.')), this.timeoutMs);
      try { this.#socket = new this.WebSocketImpl(socketQuery(this.endpoint, this.version, uuid, 'websocket', this.nodeConsensusType)); } catch (error) { fail(error); return; }
      this.#transport = 'websocket'; this.#socket.binaryType = 'arraybuffer';
      this.#socket.addEventListener('open', () => {}); this.#socket.addEventListener('message', event => this.#message(event.data));
      this.#socket.addEventListener('error', () => fail(new Error('Error del WebSocket Mainnet.')));
      this.#socket.addEventListener('close', () => { this.#opened = false; if (!settled) fail(new Error('El peer Mainnet cerró el socket.')); this.#emit('close'); });
      this.#completeHandshake().then(() => { if (settled) return; settled = true; clearTimeout(this.#timer); resolve(this); }).catch(fail);
    });
  }

  async #connectPolling() {
    if (typeof this.#fetchImpl !== 'function') throw new Error('fetch no está disponible para el transporte polling.');
    this.#closed = false; this.#transport = 'polling'; this.#uuid = randomUuid();
    const initial = await this.#pollGet(true); const firstText = new TextDecoder().decode(new Uint8Array(initial));
    const match = /(?:^|:)0(\{"sid":"([^"]+)"[\s\S]*?\})/.exec(firstText);
    if (!match) throw new Error('Handshake polling Mainnet inválido.');
    this.#sid = match[2]; this.#consumePollingPayload(initial); this.#pollLoopPromise = this.#pollLoop();
    let rejectFailure; const failure = new Promise((resolve, reject) => { rejectFailure = reject; }); this.#pollFailureReject = rejectFailure;
    try {
      // Some WebDollar deployments accept the browser peer over Engine.IO
      // polling but do not return api/start/answer on that transport. HelloNode
      // is sufficient for propagation and block-feed events, so keep the
      // polling session alive and make api/start best-effort in the background.
      await Promise.race([this.#waitForHello(), failure]);
      void this.request('api/start', { login: 'false' }, Math.min(this.timeoutMs, 3000)).catch(() => {});
      return this;
    } finally { this.#pollFailureReject = null; }
  }

  sendEvent(name, data = {}) {
    if (!this.#socket && this.#transport !== 'polling') throw new Error('Socket Mainnet no conectado.');
    const event = socketEventPacket(name, data);
    if (this.#transport === 'polling') this.#queuePollingPayload(encodePollingPayload(['4' + event])); else this.#socket.send(event);
  }

  sendEventWithBinary(name, data = {}) {
    if (!this.#socket && this.#transport !== 'polling') throw new Error('Socket Mainnet no conectado.');
    const attachments = [];
    const replace = value => {
      if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value.buffer || value);
        const num = attachments.length; attachments.push(bytes.slice()); return {_placeholder:true,num};
      }
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
      return value;
    };
    const packetData=replace(data);
    const header = socketBinaryEventPacket(name, attachments.length || 1, packetData);
    if (!attachments.length) { this.sendEvent(name, data); return; }
    if (this.#transport === 'polling') {
      const frames = [header, ...attachments.map(bytes => 'b4' + bytesToBase64(bytes))];
      this.#queuePollingPayload(encodePollingPayload(frames)); return;
    }
    this.#socket.send(header);
    for (const bytes of attachments) { const frame = new Uint8Array(bytes.byteLength + 1); frame[0] = 4; frame.set(bytes, 1); this.#socket.send(frame.buffer); }
  }

  sendBinaryEvent(name, bytes) {
    if (!this.#socket && this.#transport !== 'polling') throw new Error('Socket Mainnet no conectado.');
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.sendEventWithBinary(name, {buffer:raw});
  }

  async connect() {
    if (this.#opened) return this;
    this.#closed = false; let websocketError;
    if (this.WebSocketImpl) { try { return await this.#connectWebSocket(); } catch (error) { websocketError = error; } }
    try { return await this.#connectPolling(); }
    catch (pollingError) { const error = pollingError instanceof Error ? pollingError : websocketError; this.#failPending(error || new Error('No se pudo conectar al peer Mainnet.')); throw error || new Error('No se pudo conectar al peer Mainnet.'); }
  }

  getTransport() { return this.#transport; }

  close() {
    this.#binary = null; this.#closed = true; clearTimeout(this.#timer); try { this.#pollController?.abort(); } catch {} try { this.#socket?.close(); } catch {}
    this.#socket = null; this.#opened = false; this.#transport = null; this.#sid = ''; this.#events.clear(); this.#pending.clear();
  }
}
