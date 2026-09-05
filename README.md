# WebDollar Wallet · PWA Mainnet v2

PWA ejecutable con importación oficial .webd, firma Ed25519 local, consulta REST, transacciones serializadas WebDollar v2, transporte offline por QR, instalación standalone y build TWA para Android.

**Estado: cliente Mainnet verificado con operaciones reales confirmadas bajo acción humana.** Se verificó `https://pool.timi.ro` como nodo WebDollar Mainnet sincronizado, con CORS y las rutas REST oficiales (`/`, `/top`, `/address/balance/:address`, `/address/nonce/:address`). También se añadió `https://webdollar.cloudns.nz/api` como espejo de solo lectura. En las pruebas interactivas del usuario, la PWA cargó la cartera seleccionada, mostró 333.00 WEBD y confirmó la operación `a74a54f14d59310a4c7af9d2800a5e42c8b67dca867ffcd8951732bf9b8e3bb7` en el bloque `5970000`; después se autorizó otra operación de 20 WEBD, hash `7678126f386472a7e459b1ac4698ae68df3c381ca78446d5c5c7abe73f9555f7`, confirmada en el bloque `5970546`, dejando 237.628 WEBD. El cliente usa el transporte nativo Socket.IO/Engine.IO con fallback polling verificado desde Chromium. No hay datos simulados ni saldo inicial en el código de la app.

## Abrir ahora

Abre index.html con Live Server, o ejecuta:

```powershell
npm start
```

Visita http://127.0.0.1:4173. El paquete contiene las dependencias del navegador en src/vendor/dependencies.js; no necesita un CDN ni instalar paquetes para abrir con Live Server. Node.js 20+ se utiliza para desarrollo y pruebas.

## Qué funciona y qué falta

| Función | Estado de esta entrega |
| --- | --- |
| Importar .webd JSON 0.1, binario privado, WIF y cartera serializada | Implementado, validado con claves públicas de prueba |
| Derivar clave pública y dirección oficial | Ed25519 de 64 bytes, HASH160, checksum WIF |
| Crear/recuperar cartera | Frase BIP39 de 24 palabras propia de esta PWA; exporta .webd oficial |
| Consultar Mainnet | Implementado y verificado en `pool.timi.ro`; el espejo `cloudns` es solo lectura |
| Firmar transacciones | Implementado y verificado con Ed25519 independiente de Node |
| Transmitir/reclamar en Mainnet | Sobre sendRawTransaction implementado; requiere nodo activo, saldo, mínimos y confirmación humana |
| QR offline | Generación y lectura completamente locales, probado entre dos instancias |
| Ecash | Vale de pago prefirmado; no es Cashu ni dinero anónimo garantizado |
| Minería | Worker Argon2 para PoW y trabajo PoS Mainnet firmado localmente; depende de un pool activo |
| PWA | Service Worker e iconos PNG; instalabilidad comprobada en Chrome |
| APK | APK debug local compilado y verificado; TWA release requiere dominio HTTPS y firma |

## Bloqueos documentados del protocolo

Se inspeccionó Node-WebDollar, revisión **8a5cacba5132268c4da078184d3b6ecd22d8e43d**.

1. El selector oficial exige al menos **100000 unidades (10 WEBD) por entrada y por salida**. La PWA cobra una comisión fija de 10 WEBD, por lo que una transferencia compatible debe dejar al menos 10 WEBD al destinatario: el importe enviado debe ser de al menos 20 WEBD.
2. Una transferencia con dos salidas ocupa 167 bytes. La política por defecto de 580 unidades por byte implica **9.686 WEBD** para el minero. La PWA suma esa diferencia al débito de una transferencia elegible; no la convierte en una tercera salida y es independiente de la comisión fija de tesorería.
3. `pool.timi.ro` respondió durante la auditoría con identidad `protocol: WebDollar`, versión `1.3.24`, altura sincronizada `5969947` y CORS `*`. La lista restante contiene varios candidatos con DNS ausente, timeout o certificado TLS expirado. Consulta `test-evidence/mainnet-connectivity.json`; no se ha desactivado la verificación TLS.

Estos son valores del código oficial revisado, no una afirmación de haber verificado la política de cada nodo activo. La PWA bloquea importes que no alcanzan los mínimos conocidos y no transmite sin confirmación humana. Un RPC puede devolver un hash aunque su implementación no haya insertado la operación; por eso la UI distingue respuesta RPC, mempool y bloque.

Las fuentes y el cálculo están en [PROTOCOL_EVIDENCE.md](PROTOCOL_EVIDENCE.md).

## Comisión fija de tesorería

La dirección y el cálculo están escritos literalmente en src/core/transaction.js:

```text
WEBD$gBKTLXe$N$2xticPayav1JU4T6hj2ziwvv$
```

La aplicación deduce exactamente 10 WEBD por transferencia: si se envían 100 WEBD, el destinatario recibe 90 WEBD y 10 WEBD van a tesorería. La interfaz no permite alterar esta política. El cálculo usa unidades enteras (1 WEBD = 10000 unidades) y no depende de un porcentaje ni de redondeos.

Esta es una **comisión fija de la aplicación/tesorería**, distinta de la tarifa exigida por el minero. La confirmación muestra destino completo, débito y monto recibido, sin presentar un desglose visible de la comisión de tesorería durante el flujo normal. Cuando la política impide enviar, explica el motivo.

## Privacidad y archivos

La lectura del .webd se realiza después de elegirlo en el selector del navegador. Nunca se lee automáticamente la ruta Downloads. Las claves se mantienen en campos privados de WalletCore, sin exponerlos a window.webdollarCore, eventos, red, QR ni almacenamiento persistente. El bloqueo sobrescribe el array de clave controlado por el Core; JavaScript no garantiza el borrado físico de todas las copias transitorias administradas por el recolector de memoria.

Exportar .webd descarga una copia **sin cifrar**, únicamente mediante una acción explícita. Guarda esa copia en un medio privado. La frase de recuperación desaparece del DOM al cerrar su diálogo. El historial y los vales de esta versión son de sesión; copia los vales antes de cerrar o recargar.

Los QR se generan con una biblioteca local. El Service Worker solo conserva una lista explícita de recursos estáticos del mismo origen; no guarda respuestas de nodos, balances, transacciones RPC ni archivos .webd.

La consulta REST confía en la respuesta del nodo. `pool.timi.ro` es el candidato escribible de lectura Mainnet verificado; el endpoint `cloudns` se marca `readOnly` y nunca permite firmar/transmitir contra un espejo. La PWA incluye un cliente nativo mínimo Engine.IO v3/Socket.IO v2: intenta WebSocket y, si Chromium no puede abrirlo, usa polling CORS del mismo protocolo. Propaga una transacción solo tras la confirmación humana; no implementa verificación autónoma del consenso ultra-ligero. Se publica `chain:block` cuando el sondeo o el feed detectan una altura nueva.

## Offline

Un vale contiene los 167 bytes de una transacción firmada para un destinatario específico. La firma se verifica antes de recibirlo. La creación exige un snapshot reciente de saldo/nonce y reserva ese nonce en la sesión.

No existe custodia, mint, blind signature o depósito previo. El emisor puede gastar desde otro cliente, el nonce puede quedar obsoleto y el timelock puede caducar. La recepción nunca modifica el saldo de cadena. Al volver online, la app invita a revisar el reclamo y exige Confirmar Envío; no transmite silenciosamente.

Para preparar un vale desde una consola sin transmitirlo se puede ejecutar `npm run prepare:offline -- "C:\\ruta\\cartera.webd" "WEBD$..." 20`. El script consulta saldo, nonce y altura del nodo Mainnet, firma en memoria y devuelve `broadcasted: false`; solo añade el payload QR si se agrega `--show-payload`. No contiene ninguna operación de transmisión.

## Minería

src/modules/mining.js proporciona startMining, stopMining, getHashRate y attachWorkerEngine. El motor incluido implementa el protocolo de pool oficial: `src/workers/mining-pow-worker.js` ejecuta Argon2d para trabajos PoW históricos y el módulo calcula la prueba PoS vigente, firmando únicamente la cabecera mediante `WalletCore.signPoSHeader`. Ningún worker recibe la clave privada. Si el pool no entrega trabajo o cierra el canal, el PluginManager desactiva el módulo sin afectar al saldo.

## Pruebas

```powershell
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
npm run probe-mainnet
npm run probe:socket
npm run probe:browser-socket
npm audit
```

`probe-mainnet` solo consulta las rutas REST públicas, `probe:socket` realiza el handshake nativo desde Node y `probe:browser-socket` lo realiza dentro de Chromium. Los tres escriben evidencia en `test-evidence/` y declaran explícitamente que no accedieron a carteras privadas ni transmitieron transacciones.

Las fixtures de tests son vectores criptográficos públicos, aislados de la aplicación. **Nunca deposites fondos en esas direcciones.** El saldo 333 de las pruebas de interfaz es una respuesta controlada de test, no evidencia de la cartera del usuario ni de Mainnet.

Para regenerar el bundle e iconos:

```powershell
npm run build:assets
npm run build:apk:local
```

Las licencias de las dependencias distribuidas aparecen en THIRD_PARTY_NOTICES.md.

## APK Android

La entrega incluye además un envoltorio Android local que copia la PWA dentro de un WebView con acceso de red HTTPS, sin sustituir la aplicación ni sus módulos. El build local genera un APK firmado con la clave de depuración de Gradle, apto para instalarlo en un emulador o dispositivo de desarrollo:

```powershell
npm run build:apk:local
```

El resultado es `WebDollar-wallet-debug.apk`. En esta ejecución se generó y verificó:

```text
SHA-256: A9F78FC6602628E1F415B02C783C61F46C30D65120D19CD410C40A787FDF92D7
Package: com.webdollar.wallet
Version: 2.0.0 (20)
```

El APK local no incluye claves ni carteras. La PWA sigue exigiendo que el usuario seleccione el archivo `.webd` y confirme cualquier transmisión. La firma de depuración no debe utilizarse para publicar una versión de producción.

Publica los recursos de la PWA en un origen HTTPS que controles. Luego:

```powershell
npm run build:apk -- https://tu-dominio.example
```

El script invoca Bubblewrap 1.25.0 usando Node y npm (compatible con rutas Windows con espacios), inicializa build/android solo si no existe twa-manifest.json y compila desde ese directorio. Bubblewrap solicita JDK 17, Android SDK y los datos de firma. El resultado esperado es build/android/app-release-signed.apk.

Publica /.well-known/assetlinks.json con el packageId y huella de firma correctos para que TWA verifique el dominio. El APK local de desarrollo y el TWA de producción son rutas distintas: el primero contiene los assets; el segundo depende de un dominio HTTPS y una firma release.

Comprobar los comandos sin compilar ni descargar herramientas:

```powershell
npm run build:apk -- https://tu-dominio.example --dry-run
```

El banner de instalación PWA depende del navegador, uso previo y políticas del dispositivo; la app no puede obligar a Chrome a mostrarlo. El menú del navegador es la alternativa.

## Documentación

- USER_MANUAL.md: instrucciones y capturas de prueba claramente identificadas.
- API_CORE.md e interfaces.d.ts: contratos de módulos y hooks.
- architecture.mermaid: módulos, claves, UI, red y transporte QR.
- PROTOCOL_EVIDENCE.md: fuentes técnicas y límites de aceptación.
- VALIDATION.md: resultados y verificaciones pendientes.
