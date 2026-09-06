# Propuestas de evolución

Estas propuestas son compatibles con la arquitectura modular actual y no requieren exponer las claves privadas del Core.

1. **Soporte para activos adicionales**: añadir módulos independientes para redes y activos compatibles con ERC-20 y BEP-20, con validación de cadena separada para evitar mezclar saldos.
2. **Hardware wallets**: integrar Ledger mediante WebUSB/WebHID, manteniendo la firma fuera del navegador y usando el Core solo como coordinador de operaciones.
3. **Métricas de minería**: registrar hashrate, trabajos aceptados/rechazados, latencia del pool y rendimiento por dispositivo mediante un módulo de telemetría local y opcional.
4. **Modo oscuro automático**: seguir `prefers-color-scheme` y ofrecer un selector manual persistido únicamente como preferencia de interfaz.
5. **Nodos personalizados**: permitir perfiles de nodos WebSocket/REST Mainnet con validación de identidad WebDollar, indicador de solo lectura y prueba de salud antes de firmar.

## Preparación de puntos 7–12

### 7. Nodos personalizados con identidad y salud

`src/modules/custom-nodes.js` ya contiene el contrato de registro, validación de `protocol: WebDollar`, `network: mainnet`, indicador `readOnly`, lista de nodos y `healthCheck`. La próxima iteración debe obtener una identidad firmada del nodo, comprobar altura/estado sincronizado y solo entonces entregar un token de capacidad al adaptador de firma. Hasta que esa prueba exista, `signingGuard` mantiene el nodo en solo lectura.

### 8. Marketplace / propuestas WebDollar

**Adaptador implementado en v3.0** como `src/modules/marketplace.js`, siguiendo la separación de red, consenso y transacciones del repositorio público [WebDollar/webdollar2](https://github.com/WebDollar/webdollar2). El módulo es un conector real, no parte de `WalletCore`:

1. Publicar una oferta como documento firmado por una dirección WebDollar: `offerId`, activo, cantidad, precio, expiración, garantías y dirección de liquidación.
2. Resolver ofertas mediante un índice externo o P2P, mostrando siempre la red y el nodo que verificó cada dato.
3. Crear una orden local sin transmitir fondos, calcular comisiones y revisar el contrato completo antes de firmar.
4. Usar escrow o un contrato de custodia compatible con el protocolo real; no fingir custodia con `localStorage` ni con un vale offline.
5. Mantener reputación, cancelación, expiración y disputa fuera de las claves privadas. La PWA solo debe firmar un resumen mostrado al usuario.

La entrega actual consulta el estado Mainnet. Puede leer Assets nativos de WebDollar2 mediante `/account` y `/asset` cuando esa API se anuncia, pero solo habilita listados/compras si el nodo anuncia el capability `webdollar-marketplace-v1`; en ese caso firma con confirmación humana y transmite a los endpoints del contrato. No finge custodia ni transmisión: el repositorio oficial aún declara WebDollar2 como trabajo en desarrollo y no documenta un libro de órdenes, así que el Mainnet actual queda explícitamente bloqueado para listar/comprar hasta que exista un endpoint verificable.

### 9. Otras redes y activos

Los contratos `INetworkAdapter` e `IAssetAdapter` de `src/core/interfaces.d.ts` permiten añadir otra cadena mediante un plugin. Cada adaptador debe declarar `id`, red, unidad, precisión, explorador, balance, nonce, cotización, construcción sin firmar y broadcast. El Core WebDollar no debe asumir que un nonce, formato de dirección o fee es válido en otra red; el módulo debe aportar sus propios validadores y pruebas.

### 10. Ledger WebUSB/WebHID

La futura integración Ledger debe preferir WebHID cuando el modelo lo requiera y WebUSB cuando el transporte sea compatible. Flujo propuesto:

1. El usuario conecta el dispositivo y aprueba el permiso del navegador.
2. El módulo lee una clave pública de una ruta mostrada y verifica que corresponde a la dirección seleccionada.
3. El Core prepara el hash/preimagen sin la semilla, el módulo muestra red, destino, monto, fee y nonce, y Ledger confirma en su pantalla.
4. El dispositivo firma; la PWA valida la firma y transmite solo después de la confirmación humana.
5. Al bloquear o cerrar, el módulo llama `disconnect` y no conserva handles ni material secreto.

El contrato `HardwareSigner` no contiene una operación de exportación de clave privada. La prueba de integración debe usar un dispositivo de prueba y nunca un saldo de producción sin confirmación visual.

### 11. Pool selector y extensibilidad

La UI ya tiene un selector con Timi Mainnet y pool HTTPS personalizado. Para producción, el registro debe añadir identidad firmada del pool, algoritmo, altura, target, tarifa publicada, latencia y política de pagos. Las credenciales no se deben introducir en la URL. La telemetría aceptada/rechazada/latencia/uptime se conserva en sesión, sin enviar datos de la cartera a un colector.

### 12. Evolución sin tocar Core

Los módulos futuros deben usar `PluginManager`, `IEventBus` y los hooks públicos. Un módulo no debe importar `WalletCore`, leer `localStorage` de cartera ni acceder a `#account`. Las capacidades nuevas se registran como interfaces y adaptadores; si fallan, `module:error` debe aislarlas y conservar la consulta de saldo.
