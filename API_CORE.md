# API del Core y módulos

## Frontera pública

window.webdollarCore es un objeto congelado sin referencia a la instancia de WalletCore ni acceso a claves.

El hook de envío copia destino e importe como valores inmutables. Una revisión abierta no admite ser reemplazada por otra solicitud. La confirmación exige un evento del navegador marcado `isTrusted` y un diálogo abierto; los clics sintéticos de JavaScript no transmiten. Esto protege el flujo de integración, pero no convierte los plugins ejecutados en el mismo origen en código aislado frente a un plugin malicioso.

```js
const address = window.webdollarCore.getAddress();
const balance = window.webdollarCore.getBalance(); // number | null
const state = window.webdollarCore.getState();     // copia, sin claves

window.webdollarCore.sendTransaction({
  to: 'una-direccion-WEBD-valida',
  amount: '100'
}); // abre revisión humana; nunca transmite por sí solo
```

Los tipos completos están en src/core/interfaces.d.ts. Los montos se reciben preferentemente como cadenas decimales. La comisión de tesorería está fijada en 10 WEBD por transacción; una cantidad que no cubra la comisión y la salida mínima del protocolo se rechaza.

## WalletCore interno

La UI conserva su instancia de WalletCore en el ámbito del módulo JavaScript. #account guarda las claves; #state guarda solo dirección, snapshot e historial público. Los plugins reciben una fachada limitada y no la instancia.

- importFile(File): formatos .webd oficiales compatibles, máximo 1 MB, validación cruzada de dirección/clave pública/clave privada.
- create(mnemonic?): 24 palabras BIP39; utiliza los primeros 32 bytes del seed BIP39 (PBKDF2 estándar, passphrase vacía) como seed Ed25519. No utiliza una ruta HD. Este esquema de recuperación es propio de esta PWA.
- exportWallet(): JSON oficial versión 0.1, clave privada WIF de 69 bytes.
- watch(address), getAddress(), getBalance(), publicState(), lock().
- refreshBalance(), startSync(): saldo del nodo, nunca saldo local calculado.
- quote({to,amount}): reparto exacto y obstáculos de política, sin firma.
- prepareOffline({to,amount}): firma con snapshot sincronizado de menos de 10 minutos; reserva el nonce durante la sesión.
- receiveSigned(base64): verifica firma y destinatario, registra un vale sin acreditar saldo.
- sendTransaction(data), broadcastSigned(base64): internos, utilizados después de confirmación UI y sujetos a bloqueo de política.
- checkTransaction(txId): distingue mempool, bloque y estado no verificado.

La revisión de política se realiza tanto en WalletCore como en el adaptador. El firmador calcula la diferencia del minero como 580 unidades por byte para la transacción v2 de 167 bytes y la suma al débito de entrada; los dos outputs son el importe menos 10 WEBD al destinatario y 10 WEBD a la tesorería fija. Se bloquean importes bajo el mínimo oficial, saldos insuficientes, nonce obsoleto y nodos no sincronizados.

## Formatos WebDollar

- Clave Ed25519: 64 bytes seed || publicKey; WIF: 0x80 || secret64 || checksum4.
- Dirección: HASH160 = RIPEMD160(SHA256(publicKey)); WIF: 584043fe || 00 || hash20 || checksum4 || ff.
- Checksum: primeros 4 bytes de SHA256(SHA256(body)).
- Base64 WebDollar: sustituye O por #, l por @ y / por $.
- Transacción v2: version1 || nonce2 BE || timelock3 BE || from || to.
- Montos: enteros en **7 bytes little endian**, no big endian.
- Una entrada y dos salidas: 167 bytes. La firma incluye el preimage exacto del cliente oficial.
- RPC: base64 del JSON {transaction:{data:[bytes]},signature:[bytes]}; no el binario bruto como único argumento.

La firma usa TweetNaCl, la misma familia de primitiva que el cliente oficial. Las pruebas verifican las firmas con Node crypto (OpenSSL) de forma independiente.

## MainnetNetworkAdapter

setEndpoints configura URLs y autenticación de sesión; solo HTTPS o HTTP loopback. No admite credenciales dentro de URLs, redirecciones ni respuestas fuera del contrato esperado.

connect valida protocol: WebDollar y blocks.length. Por defecto prueba primero `https://pool.timi.ro`, que durante la auditoría respondió con identidad WebDollar Mainnet y las rutas oficiales `/address/balance/:address`, `/address/nonce/:address` y `/top`. También reconoce endpoints de explorador terminados en `/api`, como `https://webdollar.cloudns.nz/api`: consulta `/chain` y `/address?address=...`, convierte las unidades enteras a WEBD y marca el snapshot como `readOnly`. Los snapshots `readOnly` nunca pueden firmar ni transmitir. Respuestas inválidas generan error, no saldo cero.

subscribeBalance sondea cada 15 segundos y emite chain:block al cambiar la altura. Es una conexión REST de confianza al nodo; no sustituye la verificación autónoma del consenso.

El endpoint `https://webdollar.cloudns.nz/api` se reconoce como espejo de explorador: solo sirve para observación y nunca habilita firma o transmisión.

sendRawTransaction acepta solamente una transacción localmente verificada y comprueba la política. Si se configuró un endpoint JSON-RPC explícito, transmite el sobre firmado y exige que la respuesta incluya el id solicitado y el hash calculado. Si no hay RPC pero el endpoint activo es un nodo WebDollar escribible, usa el cliente nativo mínimo Engine.IO v3/Socket.IO v2 de `src/core/native-socket.js`, intenta WebSocket y cae a polling cuando el navegador no puede abrir el upgrade; completa `HelloNode` y, cuando el despliegue responde a ello, `api/start`, y propaga el binario mediante `transactions/new-pending-transaction`. Una respuesta perdida es ambigua: el núcleo conserva los mismos bytes firmados para un reintento deliberado, sin regenerar nonce ni firma. `checkTransaction` consulta `/transactions/exists/:hash` y `/transactions/pending/object` para distinguir `submitted`, `mempool` y `confirmed`.

El transporte nativo se abre para recibir avisos públicos de bloque o para transmitir después de la confirmación humana de la UI. No recibe rutas de archivos, semillas, claves ni contraseñas. `NativeWebDollarSocket` no pretende reemplazar el consenso del nodo: la aplicación conserva la verificación local de la transacción y consulta REST para evidenciar su estado.

Cuando hay una suscripción de saldo contra un nodo escribible, el adaptador abre además un feed nativo de `head/new-block`. Cada nuevo bloque dispara una consulta REST del snapshot de la dirección; el sondeo temporizado permanece como fallback y se conserva la separación entre eventos de cadena y datos privados de la cartera.

El cliente oficial puede devolver un hash incluso si la inserción falla en una capa inferior. El estado submitted solo expresa acuse de RPC; mempool y confirmed necesitan evidencia aparte.

## EventBus

| Evento | Payload |
| --- | --- |
| wallet:ready, wallet:locked, balance:changed, transaction:new | copia de PublicWalletState |
| network:connected | {endpoint, kind: 'node'|'explorer', readOnly} |
| network:error | {message} |
| chain:block | {height} |
| module:ready | {id} |
| module:error | {id,error:{message}} |
| mining:state | {running} |
| mining:rate | number |

Los listeners deben utilizar datos públicos. No emitas semillas, claves, contraseñas ni archivos originales. Los errores de listeners síncronos y rechazos asíncronos se capturan individualmente y se publican como event:error sin detener a los demás listeners.

## Registro y aislamiento

```js
window.webdollarCore.registerModule({
  id: 'mi-modulo',
  name: 'Mi módulo',
  init(core) {
    const balance = core.getBalance();
    this.stopListening = core.events.on('chain:block', ({height}) => {
      // Consultar a través de hooks, nunca acceder a almacenamiento de la cartera.
    });
  },
  dispose() { this.stopListening?.(); }
});
await window.webdollarCore.initializeModule('mi-modulo');
```

PluginManager captura fallos de init, escucha module:error y llama dispose únicamente sobre el módulo fallido. No reinicializa los módulos que ya están activos. La separación es de fallos y acceso por API; JavaScript en el mismo origen no es un sandbox para ejecutar plugins maliciosos.

## Motor de minería

```js
window.webdollarCore.attachMiningEngineUrl('/src/engines/webdollar-engine.js');
```

Ese módulo debe exportar default con start({address,balance,onRate}) y stop(). El host Web Worker recibe dirección y saldo, nunca una clave privada. El motor incluido implementa el trabajo PoW Argon2d y el recorrido PoS del pool Mainnet; la firma de la cabecera PoS pasa por `signPoSHeader(header)` dentro de la fachada del Core y devuelve únicamente `{signature,publicKey}`. Si no existe trabajo de pool, el módulo falla de forma aislada y no inventa H/s.

También existe attachMiningEngine(engine) para un adaptador que ya gestione su propio worker. Esta configuración la hace un desarrollador de confianza.

## Pago offline

El payload es webd-pay-v1: seguido de base64 de la transacción firmada. El receptor verifica bytes, firma, outputs y dirección receptora. Los metadatos económicos se extraen del binario firmado y no de campos JSON editables.

No hay mint Cashu ni blind signatures. No hay garantía contra doble gasto antes de confirmación. Las reservas y deduplicación son solo de sesión; otra instancia de la cartera puede gastar el mismo nonce. La reconexión abre la posibilidad de revisión, sin broadcast automático.

## Caché y build

El Service Worker solo cachea recursos estáticos enumerados, nunca APIs. El bundle de dependencias está versionado en package-lock.json y se regenera con npm run build:assets. Los archivos fuente modulares se sirven directamente con Live Server.
