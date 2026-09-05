# Evidencia del protocolo WebDollar

Revisión oficial inspeccionada: **8a5cacba5132268c4da078184d3b6ecd22d8e43d**. Las conclusiones describen ese código; no equivalen a haber verificado la configuración de un nodo Mainnet vivo.

## Transporte Mainnet observado

Corrección de framing: Engine.IO v3 antepone el byte de tipo `4` a cada frame binario de mensaje. En polling, el encabezado Socket.IO BINARY_EVENT completo es `45...` (no `445...`) y el adjunto usa el paquete Engine.IO base64 `b4...`; el transporte lo reconstruye al recibir antes de procesar adjuntos Socket.IO. Se contrastó con `engine.io-parser/lib/browser.js` de la dependencia local de referencia y se comprobó con `tests/native-feed.test.mjs`. Esta prueba local no acredita aceptación de transacciones en Mainnet.

Durante la auditoría se verificó `https://pool.timi.ro` contra el contrato REST del cliente oficial: `/`, `/top`, `/address/balance/:address`, `/address/nonce/:address` y `/transactions/pending/object` respondieron desde Mainnet con TLS y CORS.

El mismo nodo acepta el handshake Socket.IO de un navegador WebDollar (`msg=HelloNode`, `nodeType=NODE_WEB_PEER`, `nodeConsensusType=NODE_CONSENSUS_SERVER`). En Node responde a `api/start`; en Chromium, el WebSocket directo del proxy observado falla durante el upgrade, pero el transporte Engine.IO polling devuelve `HelloNode` y eventos de bloques. `src/core/native-socket.js` implementa ambos caminos y, únicamente después de una confirmación humana, puede propagar el binario mediante el listener interno `transactions/new-pending-transaction`. El nodo sigue siendo responsable de validar consenso; la PWA no presenta un acuse de envío como confirmación de bloque.

El nodo observado entrega algunas respuestas de API con el sufijo literal `/undefined` (`api/top/answer/undefined`). El método `NativeWebDollarSocket.request()` acepta tanto la forma convencional `/answer` como esa variante para mantener interoperabilidad con las versiones públicas desplegadas. Las comprobaciones reproducibles son `npm run probe:socket` (Node) y `npm run probe:browser-socket` (Chromium); ambas son de solo lectura y guardan evidencia separada en `test-evidence/`.

El POST a la raíz HTTPS de `pool.timi.ro` no se identificó como JSON-RPC; devolvió la información REST del nodo incluso cuando se envió un método de solo lectura. Por ello `src/core/network.js` no lo trata como RPC ni intenta transmitir por una ruta inventada. `sendRawTransaction` conserva la ruta JSON-RPC cuando el operador configura un endpoint explícito y, en ausencia de RPC, usa el transporte nativo observado del nodo WebDollar; ambas rutas exigen validación local y confirmación del usuario.

## Archivos oficiales

| Evidencia | Fuente |
| --- | --- |
| Longitud privada 64 bytes, unidades mínimas, tarifa por byte | [const_global.js](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/consts/const_global.js) |
| Ed25519 TweetNaCl, clave privada seed + pública | [ed25519.js](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/crypto/ed25519.js) |
| HASH160, WIF y checksums de direcciones | [Address Helper](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/addresses/Interface-Blockchain-Address-Helper.js) |
| Exportación privada binaria y serialización de dirección | [Address](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/addresses/Interface-Blockchain-Address.js) |
| Importación/exportación JSON versión 0.1 | [Wallet](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/main-blockchain/wallet/Main-Blockchain-Wallet.js) |
| Enteros de siete bytes little endian | [Serialization](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/utils/Serialization.js) |
| Preimage Ed25519 de la transacción v2 | [Transaction From](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/transactions/transaction/Interface-Blockchain-Transaction-From.js) |
| Outputs de direcciones de 20 bytes e importes de 7 bytes | [Transaction To](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/transactions/transaction/Interface-Blockchain-Transaction-To.js) |
| Validación de mínimos, antigüedad y comisión de minero | [Mining Transactions Selector](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/mining/transactions-selector/Mining-Transactions-Selector.js) |
| Tarifa = longitud serializada × tarifa por byte | [Transaction Wizard](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/common/blockchain/interface-blockchain/transactions/wizard/Interface-Blockchain-Transactions-Wizard.js) |
| Sobre base64(JSON), método autenticado | [SendRawTransaction](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/node/jsonRpc/Methods/SendRawTransaction.js) |
| Rutas REST utilizadas | [API Router](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/node/sockets/node-server/API-router/Node-API-Router.js) |
| Lista pública inicial de candidatos | [Fallback Nodes](https://github.com/WebDollar/Node-WebDollar/blob/8a5cacba5132268c4da078184d3b6ecd22d8e43d/src/node/sockets/node-clients/service/discovery/fallbacks/fallback_nodes_list.js) |

## Por qué 0.01 WEBD no satisface la política revisada

1 WEBD = 10000 unidades. El mínimo publicado es 100000 unidades por entrada y por salida, es decir, 10 WEBD. Con la comisión fija de 10 WEBD, el importe debe dejar al menos 10 WEBD al destinatario, por lo que el mínimo de transferencia compatible es 20 WEBD antes de la tarifa del minero.

Para 0.01 WEBD, la comisión fija de 10 WEBD ya supera el importe y la operación se rechaza localmente. El problema no se resuelve firmando correctamente o cambiando el transporte RPC.

## Comisión del minero y comisión de tesorería

Los dos outputs del reparto importe−10/10 suman el 100% del importe de la transferencia. La tarifa del minero es entrada menos salidas y se representa como una diferencia adicional en la entrada, no como una salida de tesorería.

La serialización v2 implementada con una entrada y dos salidas tiene:
- cabecera: 6 bytes;
- entrada y token: 106 bytes;
- salidas: 55 bytes;
- total: 167 bytes.

La tarifa por defecto del código es 580 unidades por byte: 167 × 580 = 96860 unidades = **9.686 WEBD**. La PWA la incorpora al débito de entrada, igual que el asistente oficial, manteniendo los outputs importe−10/10. Por ello el remitente debe disponer de importe solicitado + 9.686 WEBD adicionales.

El selector contiene excepciones para determinadas transacciones del minero. No se presupone que una cartera normal, un nodo público o la cartera del usuario cumplan esas excepciones.

## Acuse RPC frente a inclusión real

SendRawTransaction devuelve el identificador después de propagar. En la cadena de llamadas oficial, algunas rutas inferiores capturan errores de inserción; un identificador devuelto no constituye por sí mismo prueba de inclusión. La PWA consulta por separado mempool y bloque y muestra estado no verificado cuando no tiene esa evidencia.

## Conectividad observada

El informe reproducible se encuentra en [mainnet-connectivity.json](test-evidence/mainnet-connectivity.json). En la ejecución registrada se probaron los candidatos HTTPS del registro (sin repetir URLs): hubo respuestas fallidas por DNS, timeout, protocolo TLS incorrecto y certificado expirado, pero ninguna identidad WebDollar válida. No se enviaron claves, credenciales ni transacciones. Estos resultados describen el entorno y la fecha de la prueba, no prueban que toda la red WebDollar esté caída.
