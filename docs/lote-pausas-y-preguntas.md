# Lote: qué puede pararlo o preguntar (24/11/2026)

Regla fija de Emmanuel (como Codex): desde «Enviar lote» no se le molesta hasta que están **todas**
las imágenes; se le enseñan juntas («Aprobar todas»); desde que aprueba, no se le molesta hasta que
están **todos** los vídeos listos para subir. El desglose va por dentro: no se ve en los pasos del
lote (Imágenes → Revisión → Vídeos → Listos), ni en el tablero, ni en la pantalla del vídeo (solo se
abre a propósito con `?paso=desglose`).

Todo está en `src/server/videos/lote.ts`.

## Lo que se resuelve solo (sin preguntar ni parar)

| Antes preguntaba o paraba | Ahora | Dónde |
| --- | --- | --- |
| «¿Quién sale?» (avatar sin elegir) | «Automático» (o «Sin sustitución» si no hay biblioteca) | `autoAnswer` |
| Avatar de la biblioteca / variante / canción que pedía el desglose | El primero sugerido / las fotos de siempre / el audio original | `autoAnswer` |
| El modelo elegido no admite el tramo | El primer modelo que sí lo admite | `autoAnswer` |
| Desglose fallido | Se repite solo hasta 2 veces; si sigue fallando, ese vídeo queda fuera | `autoAnswer` |
| Referencia que no se pudo preparar (enlace fallido, subida a medias, gancho cambiado) | Ese vídeo queda fuera | `autoAnswer` |
| Prompt interno con errores | Se rehace el desglose de ese vídeo; si no tiene arreglo, queda fuera | `autoConfirmBatch`, `onRequestError` (`redoPrompt`) |
| Un vídeo que no se puede presupuestar | Ese vídeo queda fuera; los demás siguen | `autoConfirmBatch` |
| «Confirmar y generar» el presupuesto | Se autoriza solo (con margen para 2 regeneraciones) | `autoConfirmBatch` |
| Precio más alto que lo previsto | Se acepta si cabe en lo autorizado | `requestFor` |
| Imagen o clip que falla en Higgsfield | Se repite solo dentro de sus rondas; sin rondas, ese vídeo queda fuera | `advanceGenerations` (`retryable`, `skipFor`) |
| Bloqueado por el filtro de Higgsfield | El clip se repite con el prompt reescrito (`sanitizeAfterBlock`); si sigue bloqueado, ese vídeo queda fuera | `advanceGenerations` |
| Llegar al máximo de regeneraciones | Ese vídeo queda fuera | `skipFor` |
| Error de un vídeo al pedir su generación | Ese vídeo queda fuera | `onRequestError` |

Un vídeo «fuera» lleva `videos.auto_skipped = true` y su motivo en `videos.auto_stop`; también se
escribe en el registro (`[lotes] Vídeo N fuera del lote M: …`). El lote termina con los demás.

## Lo único que todavía para o pregunta (solo lo puede decidir él)

| Motivo | Cómo se ve | Dónde |
| --- | --- | --- |
| Sin saldo en Higgsfield (para el lote o para una generación) | Pausa «saldo» con las cifras; «Continuar» al recargar | `autoConfirmBatch`, `requestFor`, `onRequestError` |
| Higgsfield sin conectar o caído (503) | Pausa «fallo» del lote entero | `onRequestError` |
| El lote pasaría de lo autorizado (con el margen de 2 regeneraciones ya incluido) | Pausa «presupuesto» con los créditos de más | `requestFor` |
| El producto no tiene foto del artículo | Pregunta «Falta una foto del artículo.» | `askRow` |
| «Adaptación de concepto» sin decir qué adaptación | Pregunta «¿Qué adaptación quieres?» (en «Nuevo lote» no deja enviar sin ella) | `askRow` |
| El desglose en pausa por el tope mensual de gasto de Claude | Pregunta con el motivo | `askRow` |

## Fallos de la API de Claude (24/11/2026, lote 6)

Un desglose que falla por la API de Claude (petición rechazada, sin saldo, sin respuesta, clave o
tope de gasto) no es culpa del vídeo: no cuenta para los 2 reintentos ni lo saca del lote (tiene su
propio tope de 20 intentos). Los vídeos que ya salieron por eso vuelven solos al lote en el
seguimiento de cada minuto (`reincludeClaudeSkips`): se rehace su desglose, se pide su imagen y se
suma a la revisión; lo autorizado sube lo de un vídeo medio del lote con el margen de regeneraciones.
Un «Saltar» hecho a mano (sin motivo guardado) no se toca.

## El desglose nunca se pregunta (24/11/2026, lote 8)

- Un desglose que falla se repite solo; agotados los intentos (2 del vídeo, 20 de la API de Claude),
  espera 30 minutos y se vuelve a intentar, también solo. Nunca saca el vídeo ni sale como pregunta.
- «Preguntas del lote» solo enseña lo obligatorio de verdad: falta la foto del artículo o la
  adaptación. Sin ninguna pendiente, esa pantalla devuelve al lote; ni «Repetir desglose» ni «Saltar
  este vídeo». El desglose tampoco cuenta como «Por revisar» en el tablero.
- Una referencia que aún no ha llegado (el navegador o el Mac la suben) se espera; los vídeos que
  salieron así vuelven solos en cuanto la tienen.
- La pasarela de Claude: si la API rechaza la gramática del esquema por grande («The compiled grammar
  is too large»), repite sola con el esquema en el texto y valida igual; todo error de la API deja su
  motivo real en el registro (`[claude] paso: la API respondió N: …`). Sin «avisa al dueño».
