# Validación y aceptación

El código se evalúa contra el objetivo completo. Una prueba local satisfactoria no sustituye una transacción confirmada en Mainnet.

## Resultado verificado

La prueba de confirmación en Chrome modifica el objeto pasado al hook tras abrir la revisión e intenta un clic sintético. Comprueba que no hay envío antes del clic de navegador y que el paquete enviado conserva 90 WEBD al destinatario para la revisión de 100 WEBD, con débito 109.686. Las cuatro pruebas de navegador pasan con esta regresión incluida.

Corrección posterior del feed: el cliente reconstruye ahora los eventos Socket.IO con adjuntos binarios antes de publicar `head/new-block`. Las pruebas verifican adjuntos entrantes, framing binario saliente y solicitudes anidadas del pool: 18 pruebas de núcleo aprobadas. Se elimina el temporizador anterior antes de cada refresco para evitar sondeos duplicados.

- Trece pruebas de núcleo: parsing .webd oficial, integridad WIF, consistencia de claves/dirección, enteros exactos, firmas Ed25519 comprobadas independientemente con Node crypto, espejo Mainnet marcado de solo lectura, transmisión elegible con acuse RPC exacto, bloqueo de política, reservas de nonce, recepción sin crédito ficticio, aislamiento de plugins y paquetes Socket.IO nativos.
- Cuatro pruebas en Chrome for Testing: importación y revisión 100→90, gate de transmisión que solo acepta el acuse después de Confirmar Envío, respuesta de UI tras fallo de minería, diseño sin desbordamiento horizontal a 1440/375/320 px, intercambio QR entre dos instancias móviles offline, rechazo de recepción repetida, reclamo sujeto a confirmación/política y recarga offline.
- Chrome Page.getInstallabilityErrors devuelve una lista vacía. Manifest, iconos PNG y Service Worker satisfacen la comprobación del navegador usado.
- El test de caché solo encuentra recursos estáticos del origen local.
- El chequeo estático comprueba artefactos requeridos, sintaxis, iconos y ausencia de escritura localStorage en la app.
- `npm run probe-mainnet` volvió a comprobar la red pública sin tocar ningún archivo de cartera: `pool.timi.ro` respondió `200`, `/top` reportó altura `5969947` y `is_synchronized: true`; `transactionsBroadcast: 0` y `privateWalletAccessed: false`.
- `npm run probe:socket` confirmó handshake nativo, `api/start` y consulta `api/top` en `pool.timi.ro` con altura Mainnet observada `5969943`; el nodo respondió usando la variante real `api/top/answer/undefined`. No se emitió ningún evento de transacción ni se modificó la cadena. El cliente nativo queda preparado para propagar solo después de la confirmación humana.
- `npm run probe:browser-socket` confirmó desde Chromium el handshake `HelloNode` contra `pool.timi.ro` usando el fallback `polling`, sin errores de transporte; `transactionsBroadcast: 0` y `privateWalletAccessed: false`. Esta prueba no transmite transacciones.
- `npm run probe:mining` (con `WEBD_MINING_ADDRESS` pública) confirmó el saludo firmado del pool Timi, entregó trabajo PoS de Mainnet en la altura `5970057` y validó el objetivo de 32 bytes; `transactionsBroadcast: 0` y `privateWalletAccessed: false`. La evidencia está en `test-evidence/mining-pool-connectivity.json`.
- La primera prueba interactiva posterior al cambio de transporte llegó a `Enviado al nodo, sin verificar` con hash `75d911c2b563c9a17f1742123ca94052644e5549458e1b8ae44087841c9ece78` y no se incluyó. La auditoría del framing encontró y corrigió un encabezado duplicado (`445...`) en el fallback polling.
- En la prueba interactiva siguiente, el usuario confirmó el envío desde Chrome. La operación real `a74a54f14d59310a4c7af9d2800a5e42c8b67dca867ffcd8951732bf9b8e3bb7` fue observada en mempool y después `/transactions/exists/:hash` devolvió `{result:true,height:5970000}`; `/transactions/pending/object` quedó vacío porque ya estaba minada. La PWA mostró un débito de `65.686 WEBD` (`46 WEBD` al destinatario, `10 WEBD` a la tesorería fija y `9.686 WEBD` de diferencia protocolaria del minero) y el saldo Mainnet cambió de `333.000` a `267.314 WEBD`. El espejo `webdollar.cloudns.nz/api/tx/:hash` también conserva el registro público, aunque reporta una altura de réplica distinta (`5970001`); la comprobación de inclusión usada por la app es la respuesta directa del nodo transmisor.
- En una segunda interacción, el usuario confirmó desde Chrome una operación de `20 WEBD`. La PWA mostró `Incluido en mempool`, con hash `7678126f386472a7e459b1ac4698ae68df3c381ca78446d5c5c7abe73f9555f7` y débito de `29.686 WEBD`; el nodo confirmó después `{result:true,height:5970546}`, retiró el hash de `/transactions/pending/object`, y el saldo consultado pasó a `237.628 WEBD` con nonce `2`. La evidencia completa está en `test-evidence/interactive-mainnet-transaction-2.json`.
- Las suscripciones de saldo contra nodos escribibles combinan el feed nativo `head/new-block` con el sondeo REST como respaldo; los errores del feed no bloquean la actualización ni la UI.
- El script APK pasa dry-run con rutas Windows con espacios.
- El APK debug recompilado tiene SHA-256 `822034480E07D39119C7D077E53F6D8CE2D94DD13D6CA6755BE831A2C250B332`. La compilación y las cuatro pruebas de navegador pasan tras corregir el transporte binario, la revisión del envío, el seguimiento automático de confirmación, el motor de minería y la actualización inmediata del Service Worker.
- npm audit informa cero vulnerabilidades en las dependencias instaladas.

Las capturas automatizadas usan un **nodo de contrato de prueba interceptado exclusivamente desde tests/browser.spec.mjs**. La aplicación no contiene ese nodo, saldo simulado ni lógica de simulación. Adicionalmente, durante la prueba interactiva del usuario del 2026-09-05, la cartera seleccionada se cargó en la PWA y el nodo Mainnet mostró 333.00 WEBD; al pulsar la confirmación, la actividad quedó en `Firmada, sin transmitir` y la verificación devolvió `Sin inclusión verificada`. El hash visible en esa actividad es un identificador local de la operación firmada, no una confirmación de bloque.

## Auditoría de requisitos

| Requisito | Evidencia | Estado |
| --- | --- | --- |
| index.html, CSS, manifest y Service Worker ejecutables | archivos y Chrome | Comprobado |
| src/core y módulos desacoplados, hooks tipados | archivos, tipos y prueba de aislamiento | Comprobado para los contratos implementados |
| Clave privada local, fuera de red/persistencia | campos privados, app sin localStorage, pruebas | Comprobado dentro del flujo implementado |
| Importación de formatos oficiales .webd | fixtures públicas oficiales/compatibles y carga interactiva | Comprobado con fixtures; el archivo seleccionado por el usuario también fue cargado sin pedir contraseña |
| Dirección derivada y checksum válido | pruebas criptográficas independientes | Comprobado |
| Generación/recuperación por mnemónica | BIP39 y derivación documentada | Implementado; esquema propio de esta PWA |
| Mostrar saldo real de la cartera ~333 WEBD | archivo seleccionado por el usuario, consulta Mainnet y UI mostró 333.00 WEBD | Comprobado antes del envío |
| Conexión activa Mainnet | `test-evidence/mainnet-connectivity.json`; `pool.timi.ro` responde identidad y `/top` | Comprobado |
| WebSocket/ultraligero con consenso | handshake nativo Node, `HelloNode` en Chromium por polling y paquete binario de propagación | Comprobado para propagación supervisada; el canal browser fue polling |
| Envío firmado con comisión fija 10 WEBD inmutable | serialización, firma, diferencia de minero y outputs comprobados | Comprobado en Mainnet con hash real |
| Tx real 0.01 con hash y bloque | el protocolo rechaza 0.01 por mínimos; se confirmó una operación elegible de 56 WEBD | Parcial: operación real confirmada; 0.01 no es protocolariamente elegible |
| Vale firmado transferido sin internet | dos instancias Chrome 375×812 y lector QR | Comprobado |
| Reclamo confirmado afectando saldo Mainnet | necesita política compatible/nodo y confirmación humana | No cumplido |
| Minería real híbrida PoW/PoS en dispositivo | worker Argon2, protocolo de pool y firma PoS local implementados; `npm run probe:mining` completó handshake firmado y recibió trabajo PoS Mainnet en altura 5970057 | Integración live de trabajo comprobada; no se ejecutó una solución/bloque de minería durante la auditoría |
| PWA instalable | prueba de instalabilidad y app shell offline | Comprobado en Chrome; instalación física pendiente |
| APK funcional compilado | `npm run build:apk:local`, APK inspeccionado con `aapt` y ZIP | APK debug generado; instalación física pendiente |
| Manuales y diagrama | README, USER_MANUAL, API_CORE, Mermaid | Entregados |
| iOS/Safari y Android físico | sin dispositivo probado | No verificado |

## Bloqueos pendientes

1. La ruta JSON-RPC pública de `pool.timi.ro` no está verificada; su POST no se comporta como JSON-RPC. La aplicación conserva RPC explícito cuando existe y usa el transporte nativo WebSocket/Socket.IO o polling cuando el nodo no expone RPC.
2. La diferencia del minero se añade al débito de entrada sin alterar los outputs importe−10/10. La salida mínima de 10 WEBD exige un total mínimo de 20 WEBD; el saldo declarado de 333 WEBD solo sería insuficiente si se incluye el monto y la tarifa del minero en una operación concreta.
3. Ejecutar una solución PoW o PoS y obtener aceptación de bloque/recompensa desde el pool Mainnet. La sesión de trabajo ya fue aceptada y entregó trabajo PoS; la auditoría no forzó una solución ni una recompensa.
4. Dominio HTTPS y datos de firma release para producir el TWA de distribución; el APK debug local ya fue compilado.
5. Carga y confirmación humana de la transacción real en UI ya comprobadas para el hash documentado; el cliente no realiza confirmaciones financieras de manera autónoma.

El núcleo Mainnet y la transmisión supervisada están comprobados con el hash documentado. La integración del motor híbrido PoW/PoS y la entrega de trabajo Mainnet están comprobadas, pero no se forzó una solución/recompensa de minería. Permanecen pendientes una reclamación Ecash que liquide fondos reales y una prueba en dispositivo Android físico. El APK debug local fue generado y su hash está documentado en README.md.
