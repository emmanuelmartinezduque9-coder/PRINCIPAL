# Reintento literal Genjutsu sin salida — autorización 2026-09-21

Emmanuel: «si, si no dio nada tienes permiso para volver a hacerlo».
Aplicación registrada: WeihnachtsPfote C1 clip1, job original
`ad9451ee-2da2-4c62-b61a-4091bc3dde54`; evidencia:
`EDITOR/lotes/weihnachtspfote_20260921/autorizacion_reintento.json`.
Reintento enviado y con recibo: `29a5de19-4556-4469-927b-d9b89f5780fa`.
Este permiso está consumido por ese hijo; no autoriza una cadena de reintentos.

- Usar `genjutsu.reservar_reintento` con ticket padre y autorización por hash;
  conservar prompt, parámetros, referencias, manifiesto e historial intactos.
- Exigir recibo `video_recovery` provider_failed y GET fresco failed del job
  exacto con salidas explícitamente null; sin archivos recuperados.
- Máximo un hijo determinista por original. Duplicado: recuperar el hijo,
  no borrar tickets, cambiar parámetros o abrir otra ruta para reenviar.
- Nunca reintentar moderación, seguridad, rechazos ni estados activos/inciertos.
  Si falta evidencia, conciliar o pedir dirección; no suponer fallo sin salida.
- No comprar créditos. No afirmar reembolso: no está verificada la facturación.
- Conservar las puertas de reclamar/recibo y QA posterior antes de entrega.
  Archivar original no significa aprobarlo ni autoriza upscale.
- Recuperación dirigida del hijo:
  `python3 EDITOR/lotes/weihnachtspfote_20260921/recuperar_retry1.py`.
  Solo consulta/recupera ese job y prepara QA; no genera ni escala.

No modifica ni sustituye `frame-retry-no-image.md`: aquel permiso sigue
siendo exclusivamente para frames. Otros vídeos necesitan su propia evidencia
de autorización ligada al job; esta regla no activa históricos ni un bucle global.
