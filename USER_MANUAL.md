# Manual de usuario · WebDollar Wallet

## Abrir e instalar

1. Abre la carpeta en VS Code y sirve index.html con Live Server. También puedes ejecutar npm start y abrir http://127.0.0.1:4173.
2. En Android, abre la dirección HTTPS de tu despliegue en Chrome y selecciona Instalar aplicación o Agregar a pantalla de inicio. El botón Instalar app aparece cuando Chrome permite solicitar la instalación.
3. En iPhone utiliza Safari, Compartir y Añadir a pantalla de inicio.
4. La versión instalada utiliza display: standalone. La primera apertura requiere conexión para guardar los recursos estáticos.
5. No abras mediante file://: los módulos y el Service Worker requieren HTTP local o HTTPS.

## Importar el archivo del usuario

1. Pulsa **Importar .webd**.
2. En el selector del sistema busca el archivo:
   C:\Users\ID140\Downloads\WEBD$22aea7b17caa785799c555bb56deb87070844881.webd
3. La PWA valida claves, dirección y checksum. No carga el archivo a ningún servidor.
4. Si la importación es válida, muestra la dirección y su QR. El saldo permanece en — hasta recibir una respuesta válida de un nodo.
5. Despliega **Conexión Mainnet**. La aplicación prueba primero `https://pool.timi.ro`; si deseas usar otro nodo, escribe su URL REST y pulsa **Conectar y consultar**. Para transmitir, el adaptador usa el transporte nativo del nodo WebDollar después de tu confirmación; si el operador dispone de un JSON-RPC explícito también puede configurarse esa ruta.
6. Introduce cualquier credencial RPC solamente en el apartado de autenticación de la aplicación. La contraseña se retira del campo después de configurarla.

Durante la sesión Mainnet auditada, el nodo devolvió `333.000 WEBD` antes del envío real y `267.314 WEBD` después de su confirmación. Si un nodo falla, la interfaz mantiene la última consulta identificada, sin sustituirla por un saldo inventado.

## Crear y recuperar una cartera

Crear cartera genera 24 palabras BIP39 con aleatoriedad local. Guarda las palabras y exporta también el .webd. Recuperar con frase utiliza la derivación de esta PWA; no presupone que una frase de otro cliente WebDollar siga el mismo método. Exportar .webd permite utilizar las claves en el cliente oficial.

La frase desaparece al cerrar el diálogo y no se almacena. La descarga .webd está sin cifrar: conserva esa copia de forma privada. No hay recuperación posible si se pierden tanto las palabras como el archivo.

## Recibir

Comparte la dirección completa o el QR de **Tu dirección**. Los QR se generan en el dispositivo y pueden mostrarse sin internet. La dirección de consulta solo lectura también puede utilizarse para verificar la recepción sin abrir una clave privada.

## Revisar un envío

1. Introduce la dirección destino y el monto total en WEBD.
2. Pulsa **Revisar envío**.
3. Comprueba la dirección completa, el débito y el importe recibido.
4. Cuando la operación es compatible, **Confirmar Envío** es el paso que solicita la firma/transmisión. La aplicación valida previamente la comisión fija, los mínimos y la tarifa del minero; si algo no cumple, el motivo aparece en el diálogo.
5. Un hash por sí solo no demuestra confirmación. La actividad diferencia firmado, enviado al RPC, mempool y confirmado en bloque. Usa Verificar en nodo y abre el explorador oficial; copia allí el hash para verificarlo.

La aplicación aplica una comisión fija de 10 WEBD a tesorería por cada transferencia. Por ejemplo, si envías 100 WEBD, el destinatario recibe 90 WEBD y 10 WEBD van a la dirección fija documentada en README. Esta comisión no sustituye la tarifa del minero, que se añade al débito del remitente.

La política del cliente oficial exige 10 WEBD por cada salida. Con la comisión fija de 10 WEBD, el destinatario también debe recibir al menos 10 WEBD, así que el monto total mínimo compatible es 20 WEBD; además la PWA suma aproximadamente 9.686 WEBD de diferencia para el minero al débito. Por eso la prueba de 0.01 WEBD y el saldo declarado de 333 WEBD no permiten verificar un envío aceptado bajo esa política; una cuenta con saldo suficiente puede continuar después de la revisión humana.

## Pago offline, NFC real y fallback QR

1. Antes de desconectarte, importa la cartera y obtén una consulta válida de saldo y nonce.
2. Abre **Intercambiar vale**.
3. Escribe la dirección de quien recibirá y el monto.
4. Pulsa **Generar y firmar vale**. Esta acción crea una transacción firmada en memoria y su QR; no la transmite.
5. Copia el vale o guarda/transfiere la imagen QR a la otra instancia.
6. En la instancia receptora, carga su cartera o consulta su dirección. Abre el módulo y pega el vale, utiliza **Leer NFC** en Android Chrome compatible, o usa **Leer imagen QR** como fallback.
7. Pulsa **Validar recepción**. La app verifica la firma, el reparto y el destinatario, y rechaza el mismo vale si ya está registrado en esa sesión.
8. Al reconectar utiliza **Revisar reclamo Mainnet**. El reclamo requiere confirmación y queda sujeto a la misma política de red.

El saldo confirmado no cambia al intercambiar un vale. Los fondos no están bloqueados en cadena: el emisor podría gastar desde otro cliente y el vale puede quedar obsoleto por nonce o timelock. Esta versión no garantiza dinero Ecash anónimo ni evita el doble gasto antes de la liquidación. Copia los vales antes de cerrar la sesión.

En Android Chrome compatible, **Enviar por NFC** solicita acercar el teléfono a una etiqueta NFC y escribe un registro NDEF de texto con el vale firmado. **Leer NFC** solicita permiso de lectura y valida el mismo prefijo de protocolo. Safari/iOS y navegadores sin Web NFC muestran el error controlado y permiten continuar con QR.

## Minería y fallos de módulos

El botón de minería inicia el módulo aislado de trabajo PoW/PoS Mainnet. El PoW usa Argon2 en un Worker y el PoS calcula la prueba con el saldo comunicado por el pool; la cabecera se firma localmente sin entregar la clave privada al Worker. Si el pool no acepta la conexión, verás **No disponible** y la cartera seguirá mostrando el saldo.

Si el módulo falla, la cartera conserva la dirección y el saldo consultado. El fallo aparece como No disponible; el resto de la interfaz permanece operativo.

## Mercado WebDollar: Assets y ofertas Mainnet

1. Importa la cartera y consulta un nodo Mainnet. Pulsa **Mercado** para abrir la sección.
2. La PWA consulta primero el nodo/explorador y solicita `GET /marketplace/capabilities`. Solo continúa si la respuesta anuncia `webdollar-marketplace-v1`, `network: mainnet`, Assets y listados.
3. Cuando el protocolo está disponible, **Tus activos** consulta `/address/assets` y **Explorar listados** consulta `/marketplace/listings`. La aplicación no agrega ejemplos locales ni guarda ofertas en el navegador.
4. Para vender, introduce Asset ID, cantidad y precio. Pulsa **Listar activo** y revisa el diálogo. El clic explícito **Confirmar, firmar y transmitir** es el único paso que permite firmar; después la orden se envía a `/marketplace/listings` y la UI espera el acuse del nodo.
5. Para comprar, pulsa **Comprar** junto a un listado obtenido del nodo. Revisa el identificador, cantidad, vendedor y precio; confirma para firmar y transmitir a `/marketplace/purchases`.

El repositorio oficial WebDollar2 aún describe su código como “Under development. Not working right now” y no publica un endpoint Mainnet estable de Assets/Marketplace. Por eso, con los nodos WebDollar Mainnet actuales, la sección muestra el saldo WEBD real y el estado **El nodo no anuncia el protocolo Marketplace Mainnet**; **Listar activo** y **Comprar** se bloquean antes de firmar. Esta respuesta es intencional: evita crear una firma o un listado local que no pueda liquidarse en la blockchain.

## Bloquear

Pulsa el icono de bloqueo. Se detiene la consulta periódica y se sobrescribe el array de clave privada de la sesión. La dirección y la última consulta siguen visibles. Importa de nuevo para firmar. Cerrar o recargar también elimina la sesión; esta versión no persiste vales ni historial.

## Capturas simuladas de interfaz

La siguiente representación textual sirve como captura reproducible sin incluir binarios de prueba en el repositorio:

```text
┌────────────────────────────────────────────┐
│ WebDollar     Sin conexión   Instalar app  │
│ Tu saldo, en tus manos.          🌐 ES     │
│ [Importar .webd] [Crear cartera]           │
│ Saldo en cadena       Minería              │
│ 333.00 WEBD           [Iniciar minería]    │
│ Enviar WEBD           Tu dirección  [QR]   │
│ [Dirección] [Monto]  [Revisar envío]       │
└────────────────────────────────────────────┘
```

La interfaz usa el mismo flujo en escritorio, tablet y móvil; el selector de idioma aparece en el pie de página y la sección offline ofrece QR y NFC.

## Instalar el APK local de desarrollo

Desde la carpeta del proyecto ejecuta `npm run build:apk:local`. El resultado es `WebDollar-wallet-debug.apk`, firmado con la clave de depuración para pruebas. Puedes abrirlo en un emulador o instalarlo con `adb install -r WebDollar-wallet-debug.apk` si Android Platform Tools está disponible. Esta variante contiene los archivos de la PWA dentro de un WebView; no contiene la cartera física ni una semilla inicial.

La prueba automatizada comprueba ausencia de desplazamiento horizontal en 1440, 375 y 320 px. La verificación de Web NFC depende de un dispositivo Android con NFC; Safari/iOS usa el fallback QR.

## Idiomas y tema

En el pie de página puedes cambiar entre Español, English, Italiano, Română y 简体中文. La selección se conserva en el dispositivo como `webdollar.language`. En **Tema** elige **Sistema** para seguir `prefers-color-scheme`, o selecciona **Claro**/**Oscuro** manualmente; la preferencia se guarda como `webdollar.theme` y no contiene información de la cartera.

## Copia cifrada de la cartera

1. Con una cartera desbloqueada, pulsa **Cifrar y descargar**.
2. Introduce una contraseña de al menos 8 caracteres y repítela.
3. Guarda el archivo `.encrypted.webd` fuera del repositorio. El archivo usa AES-256-GCM y una derivación PBKDF2-SHA-256 con salt aleatorio; la contraseña no se envía a la red.
4. Para restaurarlo, pulsa **Importar .webd**, selecciona el archivo cifrado y escribe la contraseña cuando la PWA la solicite. La aplicación descifra en memoria, valida la dirección y las claves, y después consulta Mainnet.

Si olvidas la contraseña, el archivo cifrado no puede recuperarse desde la PWA. El archivo `.webd` sin cifrar y la frase de recuperación siguen siendo respaldos distintos: protégelos con el mismo cuidado que el efectivo.

## Métricas de minería y pool

La tarjeta de minería muestra trabajos aceptados/rechazados, latencia del pool y tiempo de sesión además del hashrate. Los contadores son temporales y desaparecen al detener o recargar la app; no se escriben en `localStorage`. **Timi Mainnet** es el pool predefinido. El campo de pool personalizado solo admite HTTPS y el motor exige que el nodo configurado corresponda al endpoint seleccionado.

## Compartir por WhatsApp, Telegram y Messenger

En **Tu dirección** selecciona un canal y pulsa **Compartir dirección**. En el diálogo offline, después de generar un vale firmado, selecciona el canal y pulsa **Compartir vale**. Se abren deep links del servicio elegido. La dirección es pública; el vale contiene únicamente la transacción ya firmada. Nunca se comparte la semilla, la clave privada ni la contraseña.

## Protección del vale offline

Los vales nuevos usan un sobre v2 que conserva la transacción firmada y añade un nonce del emisor, una identificación del vale y una caducidad a 100 bloques desde la consulta usada para crearlo. La instancia receptora mantiene un registro en memoria para rechazar el mismo vale o un nonce repetido en la misma sesión. Si hay red, intenta consultar la cadena antes de aceptar; si no hay red, la app muestra el estado como no verificado. Esto reduce replay accidental, pero no reemplaza el consenso: otra cartera puede gastar el nonce mientras el emisor está offline, el emisor puede dejar un nonce obsoleto y el registro se pierde al cerrar la aplicación. El reclamo siempre requiere conexión, revisión y confirmación humana.

### Captura simulada actualizada

```text
┌────────────────────────────────────────────────────────┐
│ WebDollar   [Saldo] [Tema: Sistema] [Idioma: Español]  │
│ Saldo en cadena             Minería                     │
│ 333.00 WEBD                0 H/s  Acept.  Rech. Lat.   │
│ [Cifrar y descargar]       [Iniciar minería]            │
│ Tu dirección [QR]  [Copiar] [WhatsApp] [Compartir]     │
│ Offline: [QR] [NFC] [Vale monouso +100 bloques]       │
└────────────────────────────────────────────────────────┘
```
