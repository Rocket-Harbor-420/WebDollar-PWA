# Propuestas de evolución

Estas propuestas son compatibles con la arquitectura modular actual y no requieren exponer las claves privadas del Core.

1. **Soporte para activos adicionales**: añadir módulos independientes para redes y activos compatibles con ERC-20 y BEP-20, con validación de cadena separada para evitar mezclar saldos.
2. **Hardware wallets**: integrar Ledger mediante WebUSB/WebHID, manteniendo la firma fuera del navegador y usando el Core solo como coordinador de operaciones.
3. **Métricas de minería**: registrar hashrate, trabajos aceptados/rechazados, latencia del pool y rendimiento por dispositivo mediante un módulo de telemetría local y opcional.
4. **Modo oscuro automático**: seguir `prefers-color-scheme` y ofrecer un selector manual persistido únicamente como preferencia de interfaz.
5. **Nodos personalizados**: permitir perfiles de nodos WebSocket/REST Mainnet con validación de identidad WebDollar, indicador de solo lectura y prueba de salud antes de firmar.
