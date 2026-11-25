# Aprendizaje por lote y por vídeo (25/11/2026)

Encargo de Emmanuel: el motor tiene que aprender de **cada** lote y vídeo, no solo de los problemas
reportados. Tiene que ser un mecanismo real y medible, guardado en la base de datos, no un texto en un prompt
ni la memoria de Claude. Complementa «Mejoras» (`decisiones-mejoras.md`), que sigue igual: allí una corrección
nace de un reporte; aquí una preferencia nace de lo que él hace.

## Ciclo

```
lo que hace él ──► señal (learning_signals) ──► destilado (Haiku, al cerrar lote y a diario)
     ▲                                                   │
     │                                                   ▼
aprobación/corrección ◄── vídeo siguiente ◄── preferencia con peso y ámbito (learned_preferences)
  (sube/baja el peso)      (preference_applications: qué se aplicó y dónde)
```

## 1. Señales (`learning_signals`, `src/server/videos/aprendizaje/senales.ts`)

Una fila por hecho, con vídeo, lote, producto, país y quién. **Idempotente por `source_key`**: el recolector
(`collectSignals`) las saca de las tablas donde ya queda constancia de cada cosa. Se llama justo después de cada
acción (`captureVideoSignals(videoId)` / `captureBatchSignals(batchId)` en rechazar, aprobar, revisar montaje,
pedir cambio, elegir variante, avatar o canción, escribir la tarjeta o el lote, responder preguntas). Además se
llama en el barrido de cada minuto, que también recoge los lotes anteriores a este cambio (lotes 1–9). La clave es
la misma por los dos caminos, así que no se duplica nada.

| Tipo (`kind`) | De dónde | Paso (`stage`) | Signo |
| --- | --- | --- | --- |
| `rechazado` | `generations.reject_reason` (los «Corrección automática: del dueño:» cuentan con su texto; los demás «Corrección automática:» del sistema no) | imagen / clip | −1 |
| `aprobado` | resultado aprobado (`approved_*_result_id`, `tramo_approvals`) | imagen / clip | +1 |
| `candidata_descartada` | los otros resultados buenos de una ronda con varias candidatas | imagen / clip | −1 |
| `instruccion_tarjeta` | `videos.note`, `videos.adaptation` | desglose | 0 |
| `instruccion_lote` | `batch_products.notes` | desglose | 0 |
| `respuesta` | `videos.owner_answers` | según la pregunta | 0 |
| `cambio_pedido` | reportes «Cambio pedido en el montaje:» | montaje / rótulos / doblaje | −1 |
| `reporte` | otros `problem_reports` (no `uso`) | según el reporte | −1 |
| `montaje_aprobado` / `montaje_rechazado` | `videos.edit_review` (+ motivo) | montaje | +1 / −1 |
| `eleccion` | `variant_id`, `song_id`, avatar (`avatar_mode` + id) | variante / cancion / avatar | 0 |

## 2. Destilado (`destilar.ts`, tarea `aprendizaje.destilar`)

- **Cuándo:** una vez por lote al quedar `montado` (`learning_runs.run_key = 'lote:<id>'`) y cada día a las 04:15
  (`'dia:<fecha>'`). Ninguno de los dos pide nada a nadie.
- **Con texto** (rechazos, instrucciones, cambios, reportes): Haiku (`tier: "small"`, tope de gasto de quien creó el
  vídeo) recibe las señales nuevas, las preferencias activas y los temas ya usados. Devuelve:
  - un **tema** corto y reutilizable por señal (`fondo-tienda-nombrada`, `rotulos-grandes`…);
  - **preferencias nuevas**, cada una con su ámbito (`global`, `producto`, `pais`, `toma`), sus pasos, su
    directiva en español y en inglés (para los prompts de imagen y clip), si va a favor o en contra, y las señales
    que la sostienen;
  - **refuerzos o contradicciones** de las que ya existen.

  Solo puede crear una preferencia si dos señales la sostienen o si es una instrucción explícita suya. Una frase
  suelta de un vídeo («cambia Hoodie por Kapuzenpullover») no se vuelve regla general.
- **Elecciones** (variante, canción, avatar): sin IA. Si en un producto elige el mismo valor al menos 2 veces y en
  al menos el 60 % de los casos, sale la preferencia `eleccion-<tipo>-<producto>` con ese valor.

## 3. Inyección (`preferencias.ts`)

`preferencesFor(stage, { videoId, productId, country, shotTypes })` → `{ text, ids }`.

- **Qué se inyecta:** solo preferencias `activa` con peso ≥ 0,5 y ámbito que encaje, como mucho 5 por paso,
  ordenadas por peso.
- **Constancia:** cada uso se apunta en `preference_applications`, con el vídeo y el lote.
- **Si la base de datos falla,** no para nada: el paso sigue sin preferencias.
- **Cómo va escrita:** en español, «Preferencias aprendidas del dueño en lotes anteriores (aplícalas salvo que la
  tarjeta o el lote digan otra cosa)». En los prompts en inglés de Higgsfield va la directiva inglesa.
  - La tarjeta y el lote siguen mandando.
  - La regla de localización y las de Pinterest no se tocan.

| Paso | Dónde |
| --- | --- |
| desglose | `analysis.ts` (instrucciones) |
| imagen | `frame.ts` (al final del prompt, junto a lo de «Mejoras») |
| pinterest | `pinterest.ts` (planificar consultas y elegir fotos) |
| clip | `clip.ts` |
| rotulos | `edicion-referencia.ts` (va dentro de la clave de caché, como las correcciones) |
| doblaje | `doblaje.ts` (`classifySpeech`) |
| montaje | `cambio-montaje.ts` (`applyEditChange`) |
| variante / cancion / avatar | `lote.ts` (`autoAnswer`: en vez de «fotos de siempre» o la primera opción, la preferida si está entre las opciones) |

## 4. Peso que se ajusta solo

Cuando llega una señal de un vídeo, sus aplicaciones aún sin resultado se cierran:

| Señal | Pasos que cierra | Resultado |
| --- | --- | --- |
| imagen aprobada / rechazada | desglose, imagen, pinterest | `aprobado` / `corregido` |
| clip aprobado / rechazado | clip | `aprobado` / `corregido` |
| montaje aprobado | rotulos, doblaje, montaje, variante, cancion, avatar | `aprobado` |
| montaje rechazado, cambio pedido o reporte | rotulos, doblaje, montaje | `corregido` |
| elegir otro valor | variante, cancion, avatar | `corregido` |

Un `corregido` no se deshace: lo que cuenta es la primera vez.

- **Peso:** `(a + aprobados) / (a + 1 + aprobados + corregidos)`, donde `a = 1 + señales que la sostienen`, más
  los refuerzos y contradicciones del destilado.
- **Retirada:** con 4 aplicaciones o más y peso < 0,35, se retira sola (`retirada_por = 'peso'`).

## 5. Medición (`medicion.ts`)

Por lote, en orden:

- vídeos;
- correcciones por vídeo (señales −1 que no son `candidata_descartada`);
- aprobados a la primera (vídeos con imagen y clip aprobados sin ninguna corrección);
- **correcciones repetidas**: las de un tema que ya salió en un lote anterior del mismo país;
- preferencias aprendidas en ese lote y en qué vídeos posteriores se aplicaron.

## Web

En «Mejoras», la sección «Qué ha aprendido» muestra:

- arriba, la gráfica de correcciones por vídeo de cada lote (nuevas o repetidas) y la línea de aprobados a la
  primera;
- debajo, cada lote con lo que aprendió, dónde se usó después y, desplegados, sus vídeos con sus señales y lo que
  llevaron.

No tiene botones de confirmar.

## Lo que hizo Codex

Lo mecánico (migración, recolector, destilado, inyección, pruebas) se delegó en Codex con este documento como
especificación. Claude lo diseñó, revisó cada cambio e hizo la vista.
