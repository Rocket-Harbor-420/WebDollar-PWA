# WebDollar Wallet · PWA Mainnet v2

PWA ejecutable con importación oficial .webd, firma Ed25519 local, consulta REST, transacciones serializadas WebDollar v2, transporte offline por QR/NFC, interfaz en cinco idiomas, tema adaptativo, instalación standalone y build TWA para Android.

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
| QR/NFC offline | Generación y lectura QR completamente locales; Web NFC real con fallback QR |
| Ecash | Vale de pago prefirmado; no es Cashu ni dinero anónimo garantizado |
| Minería | Worker Argon2 para PoW y trabajo PoS Mainnet firmado localmente; depende de un pool activo |
| Idiomas y tema | Español, English, Italiano, Română, 简体中文; Sistema/Claro/Oscuro persistidos como preferencias de UI |
| Copia cifrada | AES-256-GCM + PBKDF2-SHA-256 para exportación `.encrypted.webd`, con roundtrip probado |
| Métricas de minería | Aceptados, rechazados, latencia, uptime, trabajos e intentos en memoria de sesión |
| Mensajería | Deep links para compartir dirección y vale por WhatsApp, Telegram y Messenger |
| Doble gasto offline | Sobre v2 con nonce, +100 bloques de caducidad, deduplicación en sesión y verificación on-chain oportunista |
| PWA | Service Worker e iconos PNG; instalabilidad comprobada en Chrome |
| APK | APK debug local compilado y verificado; TWA release requiere dominio HTTPS y firma |

## Bloqueos documentados del protocolo

Se inspeccionó Node-WebDollar, revisión **8a5cacba5132268c4da078184d3b6ecd22d8e43d**.

1. El selector oficial exige al menos **100000 unidades (10 WEBD) por entrada y por salida**. La PWA cobra una comisión fija de 10 WEBD, por lo que una transferencia compatible debe dejar al menos 10 WEBD al destinatario: el importe enviado debe ser de al menos 20 WEBD.
2. Una transferencia con dos salidas ocupa 167 bytes. La política por defecto de 580 unidades por byte implica **9.686 WEBD** para el minero. La PWA suma esa diferencia al débito de una transferencia elegible; no la convierte en una tercera salida y es independiente de la comisión fija de tesorería.
3. `pool.timi.ro` respondió durante la auditoría con identidad `protocol: WebDollar`, versión `1.3.24`, altura sincronizada `5969947` y CORS `*`. La lista restante contiene varios candidatos con DNS ausente, timeout o certificado TLS expirado. Las fuentes de protocolo se conservan en `PROTOCOL_EVIDENCE.md`; no se ha desactivado la verificación TLS.

Estos son valores del código oficial revisado, no una afirmación de haber verificado la política de cada nodo activo. La PWA bloquea importes que no alcanzan los mínimos conocidos y no transmite sin confirmación humana. Un RPC puede devolver un hash aunque su implementación no haya insertado la operación; por eso la UI distingue respuesta RPC, mempool y bloque.

Las fuentes y el cálculo están en [PROTOCOL_EVIDENCE.md](PROTOCOL_EVIDENCE.md).

## Comisión fija de tesorería

La dirección y el cálculo están escritos literalmente en src/core/transaction.js:

```text
WEBD$gBKTLXe$N$2xticPayav1JU4T6hj2ziwvv$
```

La aplicación deduce exactamente 10 WEBD por transferencia: si se envían 100 WEBD, el destinatario recibe 90 WEBD y 10 WEBD van a tesorería. La interfaz no permite alterar esta política. El cálculo usa unidades enteras (1 WEBD = 10000 unidades) y no depende de un porcentaje ni de redondeos.

Esta es una **comisión fija de la aplicación/tesorería**, distinta de la tarifa exigida por el minero. La confirmación muestra ahora explícitamente `10.00 WEBD` como comisión fija, además del destino, débito y monto recibido. Cuando la política impide enviar, explica el motivo.

## Privacidad y archivos

La lectura del .webd se realiza después de elegirlo en el selector del navegador. Nunca se lee automáticamente la ruta Downloads. Las claves se mantienen en campos privados de WalletCore, sin exponerlos a window.webdollarCore, eventos, red, QR ni almacenamiento persistente. El bloqueo sobrescribe el array de clave controlado por el Core; JavaScript no garantiza el borrado físico de todas las copias transitorias administradas por el recolector de memoria.

Exportar .webd descarga una copia **sin cifrar**, únicamente mediante una acción explícita. Guarda esa copia en un medio privado. La frase de recuperación desaparece del DOM al cerrar su diálogo. El historial y los vales de esta versión son de sesión; copia los vales antes de cerrar o recargar.

Los QR se generan con una biblioteca local. En Android Chrome compatible, el módulo usa `NDEFReader` para escribir/leer vales NFC; cuando Web NFC no está disponible, el flujo continúa mediante QR. El Service Worker solo conserva una lista explícita de recursos estáticos del mismo origen; no guarda respuestas de nodos, balances, transacciones RPC ni archivos .webd.

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

`probe-mainnet` solo consulta las rutas REST públicas, `probe:socket` realiza el handshake nativo desde Node y `probe:browser-socket` lo realiza dentro de Chromium. Los tres imprimen sus resultados en consola y declaran explícitamente que no accedieron a carteras privadas ni transmitieron transacciones.

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
SHA-256: 75F5F254ED4A7C9A18E1D7A8372B686BD456B477CB35601DF60A1DC85167EEF7
Package: com.webdollar.wallet
Version: 2.0.0 (20)
```

El build local también genera `build/release/WebDollar-wallet-debug.aab` con firma debug para pruebas internas:

```text
SHA-256: B712F509590C00268DA50E10713AB15086F33E43F90D802EF6AB84AC977C1007
```

El APK/AAB local no incluye claves ni carteras. La PWA sigue exigiendo que el usuario seleccione el archivo `.webd` y confirme cualquier transmisión. La firma de depuración no debe utilizarse para publicar una versión de producción.

Publica los recursos de la PWA en un origen HTTPS que controles. Luego:

```powershell
npm run build:apk -- https://tu-dominio.example
```

El script invoca Bubblewrap 1.25.0 usando Node y npm (compatible con rutas Windows con espacios), inicializa `android-twa/` solo si no existe `twa-manifest.json` y compila desde ese directorio. Bubblewrap solicita JDK 17, Android SDK y los datos de firma. Los APK/AAB producidos se copian a `build/release/`.

Publica `/.well-known/assetlinks.json` con el packageId y huella de firma correctos para que TWA verifique el dominio. El APK local de desarrollo y el TWA de producción son rutas distintas: el primero contiene los assets; el segundo depende de un dominio HTTPS y una firma release.

Para preparar una firma release local, genera una keystore fuera del repositorio:

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\\webdollar-release.keystore" -alias webdollar -keyalg RSA -keysize 4096 -validity 10000
```

No subas la keystore, contraseñas ni archivos `.webd` a Git. Configura las credenciales de firma únicamente en el asistente de Bubblewrap o en un almacén seguro de CI. El AAB es el artefacto para Play Store; el APK firmado sirve para instalación directa y pruebas.

## Idiomas, tema, cifrado y NFC

El selector ofrece Español, English, Italiano, Română y 简体中文. Guarda únicamente la preferencia de idioma en `localStorage` bajo `webdollar.language`. El selector de tema ofrece Sistema, Claro y Oscuro; solo guarda `webdollar.theme` y responde a `prefers-color-scheme`. Las claves, saldos, nonces y transacciones no se guardan allí. Las traducciones viven en `src/locales/` y el Service Worker incluye los cinco archivos en su app shell.

**Copia cifrada:** `WalletCore.encryptWallet`/`decryptWallet` y `exportEncryptedWallet` usan el formato `webdollar-encrypted-v1`, PBKDF2-SHA-256 (210 000 iteraciones) y AES-256-GCM. La PWA descarga el texto cifrado como `.encrypted.webd`; al importarlo solicita la contraseña y descifra solo en memoria. La prueba de protocolo cubre roundtrip y contraseña incorrecta.

**Métricas de minería:** la sesión muestra hashrate, trabajos aceptados/rechazados, latencia del pool, intentos y uptime. Los contadores permanecen en memoria. El worker devuelve mensajes `metrics` adicionales sin recibir claves privadas. El selector incluye `https://pool.timi.ro` y permite un endpoint HTTPS personalizado, pero el motor solo arranca cuando el nodo Mainnet configurado coincide con el pool seleccionado.

**Mensajería:** el módulo `src/modules/messenger.js` comparte dirección y vales firmados mediante deep links para WhatsApp, Telegram y Messenger. No comparte semillas ni claves.

En Android Chrome con Web NFC habilitado, `Enviar por NFC` escribe el vale firmado como un registro de texto NDEF y `Leer NFC` recupera y valida el prefijo `webd-pay-v1:`. Los vales nuevos llevan dentro un sobre `webdollar-ecash-v2` con nonce secuencial, expiración a +100 bloques y registro de uso en memoria. Si hay red, se consulta la cadena antes de aceptar; la validación no acredita saldo y el reclamo sigue requiriendo revisión y confirmación. En navegadores sin Web NFC, `Leer imagen QR` es el fallback funcional. El registro offline se pierde al cerrar la sesión y no puede reemplazar el consenso contra doble gasto en otra cartera.

**Preparación futura desacoplada:** `src/modules/custom-nodes.js` valida identidad Mainnet, mantiene nodos como solo lectura y expone health checks antes de firmar. `src/core/interfaces.d.ts` contiene contratos para adaptadores de otras redes/activos y para Ledger WebUSB/WebHID. El diseño de marketplace WebDollar, hardware wallet y pools extendidos está en `PROPOSALS.md`; ninguno modifica el Core en esta entrega.

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
- PROPOSALS.md: diseño marketplace, Ledger WebUSB/WebHID, nodos, activos/redes y pools para futuras versiones.
