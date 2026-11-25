# Decisiones documentadas de Emmanuel

Fecha de extracción: 26/11/2026. Resultado: **68 decisiones**. Solo se han escrito `decisiones.json` e `informe.md` en el directorio de trabajo. Los orígenes se han abierto en lectura; se han ignorado componentes `._*`. No se ha utilizado Graphify.

## Criterio y alcance

Se incluyen mensajes humanos, aprobaciones/rechazos con motivo documentado e instrucciones que los archivos atribuyen expresamente a Emmanuel. Una regla escrita por Codex se admite únicamente por esa atribución, no por estar en una skill. Las citas de reglas son transcripciones exactas del archivo, **no se presentan como transcripciones de la voz de Emmanuel**. Las citas de JSON son el contenido literal del campo humano o del motivo registrado; las claves y comillas estructurales no forman parte de la cita.

`general=true` representa una orden transversal expresamente formulada, siempre condicionada a su modalidad: por ejemplo, todas las réplicas Object Swap, nuevos frames en tiendas alemanas o todos los vídeos con música. No convierte una condición en obligación para productos o modalidades ajenos. Las decisiones concretas conservan producto y `general=false`. Las aprobaciones históricas solo aprueban sus archivos, no futuros resultados ni ventas.

Las fechas proceden del mensaje, documento fechado o directorio fechado del expediente; no de la fecha de copia del SSD. Se deja `null` cuando la sección carece de fecha atribuible. Las fuentes anteriores localizables y sus copias se relacionan abajo; los snapshots sirven como límites de existencia, no como fecha automática de cada párrafo añadido. No se afirma haber recuperado conversaciones que no están en archivos.

Fuentes revisadas: documentos de REGLAS_EDICION y snapshots `.before-*`/`.antes-*`, REGLA.md de expedientes sueltos, FLUJO_TEST_PRODUCTOS, CEREBRO/reglas y lecciones pertinentes, memory/context, AGENTS.md, CLAUDE.md, ADAPTACIONES_PROMPT.md, CONCEPTOS.md; skills creativas y sus referencias. También se buscaron nombres de rechazo/aprobación/feedback/correcciones mediante `rg` en ambos proyectos y se leyeron sus registros humanos pertinentes. `context/` no existe en la raíz del proyecto de escritorio; el contexto disponible está en `memory/context/`. No se usan listados de tests, scripts o veredictos automáticos como decisiones humanas.

La extracción conserva evidencia creativa y reglas de producción pertinentes. Configuraciones de acceso, contraseñas, finanzas, atención al cliente, desarrollo de tiendas y propuestas técnicas sin decisión creativa quedan fuera. No se afirma una exportación completa de todos los chats ni de Pinterest.

## Recuento por tipo

| Tipo | Decisiones |
|---|---:|
| aprobacion | 10 |
| instruccion | 14 |
| rechazo | 6 |
| regla | 38 |

Generales con alcance documentado: 40. De producto: 28.

## Recuento por tema

| Tema | Decisiones |
|---|---:|
| acabado-aprobado | 1 |
| adaptacion-funcional | 3 |
| continuidad-lote | 2 |
| cuerpos-reutilizables | 2 |
| embalaje-exacto | 2 |
| emojis-nicho | 2 |
| entrega-archivo | 1 |
| escala-real | 1 |
| fidelidad-referencia | 1 |
| fondo-intencion | 2 |
| frames-aprobados | 3 |
| funcion-y-acciones | 5 |
| identidad-avatar | 4 |
| idioma-gancho | 1 |
| limite-iteracion | 1 |
| limites-gancho | 1 |
| mezcla-musical | 5 |
| nicho-visible | 1 |
| prioridad-referencia | 1 |
| producto-fiel | 3 |
| producto-y-cancion | 1 |
| realismo-organico | 4 |
| resolucion-video | 1 |
| ritmo-demostracion | 1 |
| sincronia-drop | 2 |
| sustitucion-entornos | 2 |
| temporada-escena | 1 |
| texto-sobre-montaje | 1 |
| textos-en-edicion | 2 |
| tienda-coherente-escena | 3 |
| tienda-y-rotulo | 1 |
| tipografia-06b | 1 |
| traduccion-fiel | 2 |
| variacion-visual | 1 |
| variante-exacta | 1 |
| vestuario-y-textiles | 2 |

## Contradicciones resueltas y descartes

| Fuente / indicación anterior | Decisión aplicada / motivo |
|---|---|
| `memory/context/texto-edicion-default-f.md:6` — muestra F/Arial | Descartada como default: elección posterior 06B del 16/10 y posición fija ratificada el 31/10. |
| `REGLAS_EDICION/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md:16` — 06B incluso infoproductos | Se conserva su parte vigente para productos físicos. El estilo específico de infoproductos aprobado el 02/11 sustituye la parte de infoproductos; no se impone 06B a ellos en la directiva exportada. |
| `memory/context/avatar-visible-subtitulos-pecho-20261031.md` — seguimiento del pecho | Descartado: rectángulo fijo del 31/10; no mover textos con personas. |
| `CEREBRO/reglas/edicion-musica-texto-cta.md:7` y `memory/context/ritmo-musica-voz-edicion.md:38` — atenuación automática con voz/rampa | Sustituidas como default por R2 aprobada el 25/10: nivel constante; petición posterior expresa puede cambiarlo. El 20 % era además un valor técnico, no una petición fija de Emmanuel. |
| `REGLAS_EDICION/MUSICA_R2_APROBADA/REGLA.md:8` — preservar ambiente si es posible | Sustituido para gancho+cuerpo por precisión del 27/10 en `GENJUTSU_AUDIO_COMPLETO.md:14`: solo habla del primer clip, sin ambiente ni audio del cuerpo. |
| `REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md:3` — ignorar canción externa seleccionada en réplica completa | Sustituido por orden del 15/11: canción explícita de tarjeta prevalece. No se hereda el antiguo descarte automático. |
| `REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:5` — máximo general 3 s | Descartado por aclaración posterior del mismo día, líneas 18–19: solo regalo pop/café 3 s y 1,2,3 6 s; nunca cuerpo. |
| `REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md` — preguntar siempre por tienda no elegida | La orden del 09/11 autoriza elección autónoma en Alemania cuando no hay cadena expresa: Lidl/Action/Aldi/MediaMarkt según producto. Una tienda expresamente seleccionada conserva prioridad. |
| `memory/context/fastluxus-variantes-del-video.md` y `producto-del-video-sin-mockup.md` — no adjuntar assets por verse en el original | No se exporta como exención vigente. Orden de 29/10 en `LoteMixtoReferencias-20261029/REGLA.md:3`: referencia exacta si artículo/embalaje no aparece ya en apertura aprobada. |
| `CEREBRO/lecciones/2026-09-03-la-tercera-imagen-no-va-nunca.md:5` — nunca mano de escala | No se exporta la prohibición: orden posterior de 05/11 exige referencia de escala con mano para nuevas generaciones Seedance. |
| `REGLAS_EDICION/TESTS_CALENDARIOS_720_20261104.md:8` — 720p | Sustituido por orden global del 07/11: 480p + Theia1080, FPS originales; selección humana distinta prevalece. |
| `memory/context/upscale-theia-2k.md` y antiguos 4K/60 | Sustituidos como default por las órdenes globales de noviembre. No se cambia resolución de históricos. |
| `ConfiguracionModelos-20261026/REGLA.md:4` — Genjutsu Lite | Sustituido por Motion Transfer normal del 29/10. No se confunden defaults técnicos con una aprobación creativa. |
| `REGLAS_EDICION/CONTINUIDAD_FRAMES_20261104.md:4` — revisor creativo antes de mostrar frames | Sustituido por flujo ligero del 09/11: Emmanuel aprueba los frames; controles técnicos permanecen. No se ejecutaron subagentes durante esta extracción. |
| `memory/context/wan-prime-cambios-minimos.md:16` y traducción incrustada con Prime | Eliminar editorial original y añadir idioma destino después: orden Object Swap de 17/11 ampliada a Prime el 18/11. No se conserva la anterior sustitución de texto por generación como norma vigente. |
| `CEREBRO/reglas/cta-cierre-uniforme.md` — insertar CTA uniforme por defecto | No se exporta como obligación universal: reglas posteriores de 15–24/10 ordenan conservar intención y no inventar CTA ausente. La adaptación de keywords con marca ajena tampoco se exporta bajo el filtro de terceros solicitado. |
| `memory/context/eiswerk-receta-mm-original-20261117.md:19` — fragmento f984… presentado como original completo | La rectificación del mismo documento identifica el completo 0717729…; no se presenta el condensado como receta original completa. El movimiento inicial añadido proviene de la orden actual, no del histórico. |

## Descartes por la regla actual sobre terceros

Filtro aplicado literalmente: no se exporta ninguna decisión que ordene quitar o prohibir una marca, tienda, película o personaje ajeno, aunque en origen figure una petición histórica concreta. Se conservan instrucciones afirmativas de usar Sephora, dm, Milka o emojis de Harry Potter.

| Archivo | Indicación excluida | Motivo |
|---|---|---|
| `ADAPTACIONES_PROMPT.md:119` | «se QUITAN UI/overlay/marcas reales» | La parte de quitar marcas reales contradice el filtro actual. La limpieza editorial se conserva desde otras órdenes sin esa prohibición. |
| `CEREBRO/reglas/frame-desde-referencia.md:13` | Cartel «sin marca real» | Excluido por prohibición de marcas ajenas. |
| `EDITOR/lotes/app_20260921_47/correccion_motion_usuario.json:3` | KuschelGrinch en habitación «sin Hello Kitty» | Excluida esa condición de terceros; la corrección independiente de Nailuna se conserva por avatar no cambiado. |
| `REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.antes-06b-fijo-20261031.md:21` | Sustituir Costco por Lidl en EisWerk V2 lote60 | Excluida del JSON por la lectura literal solicitada: quitaría una tienda de terceros. Era específica de ese vídeo, nunca default universal. |
| `memory/context/nombres-producto-nicho-20261114.md:6` | Posible quitar texto Harry Potter por petición particular | La condición de retirada no se exporta. Sí se conserva la instrucción afirmativa de emojis del nicho mágico para ZauberSchirm. |

## Dudosas y exclusiones por evidencia insuficiente

| Fuente | Motivo de no inclusión |
|---|---|
| `CEREBRO/lecciones/2026-09-01-adaptar-es-declarar-la-escena.md` | Dice GLOBAL y formula una regla útil, pero no contiene cita ni atribución explícita a Emmanuel. Puede ser deducción del agente. |
| `CEREBRO/lecciones/2026-09-01-referencia-de-producto-tapado.md` | Regla escrita tras un error, sin atribución humana suficiente; además hay reglas posteriores de referencias. |
| `REGLAS_EDICION/ESCENARIOS_FRAMES_TESTS.md` y `GENJUTSU_VARIACION_VISUAL_POR_MERCADO.md` | Reglas generales útiles pero atribución humana menos directa; se prefieren órdenes de variación fechadas, sin exportar sus detalles adicionales como preferencias del dueño. |
| `CEREBRO/reglas/organico-no-publicidad.md:27–38` | Grano fuerte, encuadre torcido, desorden y otras recetas son desarrollo técnico de Codex. Solo se exporta la petición humana de imagen orgánica, no se impone ese listado a todos los vídeos. |
| `CEREBRO/reglas/firma-del-iphone-17-pro-max.md`, `firma-medida-de-una-foto-real.md` | Mediciones, EXIF supuestos y parámetros de imagen no son decisiones humanas por sí solos. |
| `memory/context/aprendizajes-lote81-20261120.md:9` | El archivo dice expresamente que separar referencia física/proyección es una recomendación por un fallo, no solución validada. No se atribuye a Emmanuel. |
| `EDITOR/lotes/app_20260921_47/v1c1_aprobacion_fuente.json` | `orden_usuario` declara que dos empleados y tela teal son implementación del coordinador, no cita ni orden literal del usuario. |
| `Motor/order-preparation/app-7dc47e5ead3b4ca687fa4accabd64677-39/human-rejection-r1.json` | Rechazo literal y orden de regenerar V3 recuperados, pero no motivo concreto del rechazo. No convertir insultos o desagrado en una regla estética inventada. |
| `Motor/order-preparation/chat-test-a706c54bd1460d511ffe5b311cb87150/human-rejection-group-decision.json` | `answer_literal` contiene el resumen inglés «New user rejects ALL THREE…», no palabras de Emmanuel. Se usa el motivo del registro human-rejection y el mensaje literal español de la aprobación posterior. |
| `CalendarioCaballos-20261105/human-special-approval-20261105.json` | Los campos técnicos `human_approved=false` y un suspenso no invalidan el mensaje humano literal posterior; tampoco se falsifican como revisiones técnicas favorables. Esta discrepancia se conserva aquí. |
| `fondos-pinterest-por-toma/references/criterios-seleccion-manual.md:26` — R07/R08 | Rechazos explícitos sin motivo exacto. No inferir rechazo universal a salones nocturnos o POV. |
| Inventario Pinterest manual (49 imágenes, 44 entornos positivos) | Selección manual no equivale a aprobación de frame/vídeo. Las observaciones estéticas del agente y URLs no verificadas no se convierten en decisiones humanas individuales. La orden de usar esas selecciones como base sí se incluye. |
| `EDITOR/lotes/app_20260926_94/douglas_aprobacion_usuario.json` | Mensaje de aprobación literal recuperado, pero el registro aislado no identifica inequívocamente el producto. Sin producto ni alcance general se excluye. |
| `EDITOR/lotes/app_20260923_68/v3frame.aprobacion_usuario.json`, `v9frame.aprobacion_usuario.json` | Decisiones «Conservar» reales, pero el registro aislado no fija producto suficiente para exportarlas con seguridad. |
| `EDITOR/product_tests/dabf2aa90dd6742b7dca8b69/decision-correcciones-20261001.json` | «si esos 3 corrigelo…» agrupa varias imágenes/productos. No se reparten motivos y aprobaciones a productos sin vínculo inequívoco por frame. |
| `EDITOR/lotes/sebastian-9/aprobacion-clip-web.json` | No se atribuye a Emmanuel una respuesta de otro flujo/propietario sin prueba. |
| `CEREBRO/reglas/INFOPRODUCTOS` / `REGLAS_EDICION/INFOPRODUCTOS_VISUAL_APROBADO.md` | Se usa el documento fechado 02/11 para resolver la excepción de 06B. Los detalles de su receta estética y posteriores añadidos no tienen producto concreto ni cita que los extienda a todos los productos; no se exportan por inferencia. |
| `CONCEPTOS.md` y fichas de KreuzKapuze, LamellenWandel, SofaLeiste, WollZauber | Que el producto tenga ficha, avatar o clips no acredita una decisión creativa humana concreta. No se rellenan productos exigidos como ejemplos si falta evidencia que cumpla el filtro. |
| `CEREBRO/reglas/cta-cierre-uniforme.md:3` | Sentinel identifica una evidencia que no se ha recuperado como mensaje; se evita ampliar la frase de cierre a todos los vídeos sin resolver su contradicción posterior. |

## Duplicados fusionados y procedencia

Cada regla repetida en documentos se exporta una sola vez. Las aprobaciones de resultados distintos se mantienen como eventos separados. Las entradas TargetAlarm/ZielAlarm separan dos alcances de producto de una sola instrucción conjunta: no son dos evidencias independientes y no suman una orden global.

Para `haarzauber-sephora-arriba` se eligió la copia `.antes-06b-fijo-20261031` en lugar del documento vivo, porque ya conserva la orden del 24/10. Los mensajes de aprobación originales se prefieren a su repetición en memorias. En reglas añadidas a un documento antiguo, el encabezado de la regla gobierna su fecha; no se hereda la fecha antigua del título. Cuando varias copias tienen la misma fecha documental y no hay procedencia de creación fiable, no se afirma un orden por su mtime de copia.

- **kuschelgrinch-oscuridad-producto-rechazo**. Fuente conservada: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/lotes/app_20260921_47/correccion_luz_producto_usuario.json:2`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-21-genjutsu-luz-y-fidelidad.md:3`.
- **haarzauber-sephora-arriba**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.antes-06b-fijo-20261031.md:20`. Otras apariciones:
  - `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md:20`.
  - `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md.before-20261115:20`.
- **radblink-demostracion-giro**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:11`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/correccion-funcion-drop-ganchos-20261115.md:12`.
- **zauberschirm-emojis-magia**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:9`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/correccion-funcion-drop-ganchos-20261115.md:10`.
- **hoofholly-seedance-v2-aprobacion-parcial**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/SEEDANCE_ESCALA_MANO_20261105.md:8`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/seedance-escala-mano-20261105.md:8`.
- **texto-fijo-06b-productos-fisicos**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md:16`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/avatar-visible-subtitulos-pecho-20261031.md:5`.
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/texto-edicion-default-06b.md:36`.
- **identidades-nuevas-replicas**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md:5`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/identidades-personas-animales-genjutsu-20261106.md:5`.
- **referencias-identidad-frame-y-video**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md:9`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/identidades-personas-animales-genjutsu-20261106.md:9`.
- **gancho-cuerpo-solo-habla-primero**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md.before-20261115:14`. Otras apariciones:
  - `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md:14`.
- **cancion-tarjeta-prevalece-genjutsu**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:8`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/correccion-funcion-drop-ganchos-20261115.md:9`.
- **limites-gancho-por-concepto**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:19`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/criterios-edicion-obligatorios.md:28`.
  - `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md:87`.
- **replicas-conservar-secuencia-y-ritmo**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:19`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/criterios-edicion-obligatorios.md:28`.
  - `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md:87`.
- **frames-aprobados-continuar-lote**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/ReglaContinuidad-20261029/REGLA.md:3`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/continuidad-tras-aprobar-imagenes-20261029.md:3`.
- **entregas-editadas-carpeta-fecha**. Fuente conservada: `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/REGLA.md:3`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/videos-editados-por-fecha-20261029.md:3`.
- **targetalarm-cuerpos-aportados**. Fuente conservada: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/split-testing-dos-bases-20261029.md:7`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/SKILL.md:40`.
- **zielalarm-cuerpos-aportados**. Fuente conservada: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/split-testing-dos-bases-20261029.md:7`. Otras apariciones:
  - `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/SKILL.md:40`.

Duplicación adicional comprobada: `EDITOR/lotes/app_20260929_61/v2c3.reutilizacion_aprobacion.json` enlaza la misma aprobación «Apruebo los tres» de `tanda_20260913_prueba_eiswerk/aprobacion_usuario.json`; no se cuenta como una nueva aprobación. La réplica `Tests-mejoras-20261104/REGLA.md`, `TESTS_CALENDARIOS_720_20261104.md` y su memoria no convierten 720p en tres decisiones ni en una preferencia vigente.

## Diez ejemplos representativos

### 1. imagen-organica-no-anuncio

regla · alcance general condicionado · 2026-09-02 · mensaje o motivo humano registrado.

> creo que tú aún no tienes claro que yo no hago publicidad, o sea no pago para que se enseñen
> los vídeos, es completamente orgánico por lo que busco una imagen orgánica

Fuente: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/organico-no-publicidad.md:13`.

Buscar una imagen orgánica para los vídeos: Emmanuel no paga para que se enseñen y su contenido es completamente orgánico.

### 2. hoofholly-tres-frames-rechazados

rechazo · HoofHolly · 2026-11-05 · mensaje o motivo humano registrado.

> Referencias con acabado profesional, espacios que no son tiendas reales. Exigir fotografías orgánicas de móvil tipo iPhone y comercio pertinente con mercancía a la venta.

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/CalendarioCaballos-20261105/human-rejection-20261105.json:3`.

Descartar los tres frames de la primera ronda por acabado profesional y espacios que no son tiendas reales; usar fotografías orgánicas de móvil y comercios pertinentes.

### 3. hoofholly-organico-muy-aprobado

aprobacion · HoofHolly · 2026-11-05 · mensaje o motivo humano registrado.

> aprobados. Estos resultados me gustaron mucho. Guarda estos resultados como muy aprobados. Esto es lo que quiero que hagas en todos los productos. Ahora genera los clips y ediciones y déjalos listos para subir.

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/CalendarioCaballos-20261105/human-special-approval-20261105.json:4`.

Usar los tres resultados HoofHolly aprobados como referencia para todos los productos; continuar sus clips y ediciones listos para subir.

### 4. haarzauber-sephora-arriba

instruccion · HaarZauber · 2026-10-24 · regla atribuida a Emmanuel.

> V6 HaarZauber, lote60: instrucción explícita actual, **Sephora arriba y HaarZauber debajo**; adaptar el emoji de uñas al contexto capilar. Esta nota no certifica que el MP4 ya esté corregido.

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.antes-06b-fijo-20261031.md:20`.

En V6 HaarZauber del lote60, poner Sephora arriba y HaarZauber debajo; adaptar el emoji de uñas al contexto capilar.

### 5. zauberschirm-emojis-magia

instruccion · ZauberSchirm · 2026-11-15 · regla atribuida a Emmanuel.

> Adaptar textos y emojis al producto, público y nicho destino, no copiar mecánicamente emojis de la fuente. ZauberSchirm: Harry Potter/magia, p. ej. 🪄⚡🦉; ☂️ si ayuda al producto. Mantener marca y alemán natural.

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:9`.

En ZauberSchirm adaptar emojis a Harry Potter y magia, por ejemplo 🪄⚡🦉; usar ☂️ si ayuda al producto, manteniendo marca y alemán natural.

### 6. wintertasse-chocolate-solido

instruccion · WinterTasse · 2026-11-08 · regla atribuida a Emmanuel.

> Orden de Emmanuel: usar referencias de EisWerk como estructura, ritmo, ambiente y textos compatibles; NO Genjutsu para trasladar acciones de máquina de helados a la taza. Diseñar tomas propias Seedance con funcionamiento solicitado: chocolate sólido dentro de WinterTasse, taza sobre su base, paso del tiempo coherente hacia chocolate ablandado/fundido y snack (p. ej. marshmallow) sumergido al final. No empezar la preparación vertiendo chocolate líquido. Un adelanto del resultado al inicio conserva la estructura de un reel que luego muestra la preparación.

Fuente: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/wintertasse-adaptacion-chocolate-20261108.md:3`.

Usar la estructura y ritmo de EisWerk, pero crear tomas Seedance propias: chocolate sólido, taza sobre su base, fundido tras tiempo coherente y snack sumergido al final.

### 7. faltliebling-tres-ediciones-r3-aprobadas

aprobacion · FaltLiebling · 2026-10-25 · mensaje o motivo humano registrado.

> las ediciones quedaron perfectas, con textos variados para cada concepto, que tenga sentido, la edición quedó bien, con música correcta y respetando los tiempos de cambios de ritmo y cambios de clip

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/TestProductos4-20261025/FaltLiebling-preflight/user-approval-editing-reference.json:6`.

Conservar las tres ediciones R3 aprobadas: textos variados con sentido para cada concepto, música correcta y tiempos de cambios de ritmo y clip respetados.

### 8. tienda-alemana-coherente-autonomia

regla · alcance general condicionado · 2026-11-09 · regla atribuida a Emmanuel.

> Para nuevos frames dentro de tiendas en Alemania, si Emmanuel no especifica tienda y el texto del vídeo de referencia tampoco la especifica, elegir autónomamente una tienda coherente con el producto entre Lidl, Action, Aldi y MediaMarkt. Una indicación expresa del usuario prevalece; conservar una tienda explícita de referencia salvo cambio encargado. No usar un almacén genérico como sustituto.

Fuente: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/tiendas-alemania-pinterest-logo-20261109.md:5`.

En tiendas alemanas sin cadena indicada por Emmanuel ni por el texto fuente, elegir Lidl, Action, Aldi o MediaMarkt según el producto; respetar elecciones expresas y evitar almacenes genéricos.

### 9. limites-gancho-por-concepto

regla · alcance general condicionado · 2026-11-15 · regla atribuida a Emmanuel.

> No hay límite general de tres segundos. Solo el gancho regalo pop y el gancho de dejar caer café tienen máximo3s; el gancho 1,2,3 tiene máximo6s. Conservar duraciones aprobadas menores. Límites exclusivos del gancho identificado, nunca del cuerpo.

Fuente: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:19`.

Sin límite general: regalo pop y caída de café, máximo 3 s; 1,2,3, máximo 6 s. Conservar duraciones aprobadas menores y aplicar límites solo al gancho identificado, nunca al cuerpo.

### 10. object-swap-todos-entornos

regla · alcance general condicionado · 2026-11-17 · regla atribuida a Emmanuel.

> 2. **Cambiar obligatoriamente TODOS los entornos originales.** No conservar el fondo de ninguna toma en una réplica Object Swap. Agrupar tomas por entorno real observado, no por número, duración o nombre: tomas del mismo lugar comparten el mismo fondo nuevo; lugares distintos requieren fondos nuevos distintos. Ejemplo: cinco clips, los dos primeros en un mismo entorno y los tres restantes en lugares diferentes → cuatro fondos nuevos, asignación A/A/B/C/D.

Fuente: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md:6`.

En toda réplica Object Swap cambiar todos los entornos; usar un fondo nuevo por lugar original distinto y compartirlo entre las tomas del mismo lugar.

## Trazabilidad de alcance y comprobación final

Las citas y líneas de las 68 entradas se han contrastado contra el contenido de origen; IDs únicos, claves exactas del esquema, enums, fechas, límites de 600/300 caracteres y pasos permitidos comprobados por código. Cada `general=true` tiene una cita de alcance localizada en una fuente del corpus; se indica su procedencia a continuación para evitar confundir atribución con deducción. Este control documental no revisa visualmente los vídeos ni certifica funcionamiento del motor.

- `hoofholly-organico-muy-aprobado`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/CalendarioCaballos-20261105/human-special-approval-20261105.json:4` — «Esto es lo que quiero que hagas en todos los productos.». 
- `nailuna-r2-mezcla-aprobada`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion.json:5` — «Ese es el tipo de edición que necesito cuando hay música.». 
- `sustituir-elemento-producto-destino`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-al-adaptar-el-elemento-es-el-de-la-cuenta-destino.md:4` — «antes de generarse cualquier video debera de comprobar que el elemento esta correctamente sustituido por la referencia del producto al que se va a adaptar». 
- `dos-intentos-frame-maximo`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-dos-intentos-por-frame-y-se-para.md:5` — «si un frame te cuesta mas de dos imagenes, paralo, no generes una tercera». 
- `traduccion-nativa-fiel`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/traduccion-organica.md:15` — «Prioridad permanente confirmada por Emmanuel el 13 septiembre de 2026:». 
- `texto-no-alarga-video`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/edicion-musica-texto-cta.md:23` — «**Texto al vídeo**, nunca vídeo al texto: no añadir dos segundos, repetir,». 
- `texto-fijo-06b-productos-fisicos`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md:16` — «Configuración predeterminada para TODOS los vídeos, incluidos infoproductos:». 
- `ganchos-variacion-visual-todos-productos`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/variacion-visual-ganchos-tests-20261031.md:2` — «Orden de Emmanuel — 31/10/2026. Aplicar a TODOS los productos en próximos frames de tests con ganchos validados.». 
- `ganchos-ropa-contexto`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/variacion-visual-ganchos-tests-20261031.md:2` — «Orden de Emmanuel — 31/10/2026. Aplicar a TODOS los productos en próximos frames de tests con ganchos validados.». 
- `regalo-navidad-contextual`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/variacion-visual-ganchos-tests-20261031.md:2` — «Orden de Emmanuel — 31/10/2026. Aplicar a TODOS los productos en próximos frames de tests con ganchos validados.». 
- `textos-finales-todas-entregas`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/textos-siempre-edicion-20261031.md:3` — «Orden expresa de Emmanuel: todas las entregas deben llevar textos y edición posterior; frames y clips generados limpios sin overlays.». 
- `publico-reconocible-primer-frame`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md:77` — «Para toda cuenta y producto, identificar antes de generar quién debe reconocerse en la escena». 
- `calendario-envase-y-piezas-exactas`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md:80` — «Para todas las cuentas, el envase del calendario forma parte del producto vendido.». 
- `fondos-intencion-todos-productos`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md:87` — «Emmanuel aprueba este criterio para todos los productos en testeo y en venta.». 
- `identidades-nuevas-replicas`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md:3` — «Orden expresa de Emmanuel. Aplicar a todas las cuentas y a nuevas preparaciones de vídeos,». 
- `referencias-identidad-frame-y-video`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md:3` — «Orden expresa de Emmanuel. Aplicar a todas las cuentas y a nuevas preparaciones de vídeos,». 
- `generacion-480-theia-1080`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/generacion-480-global-20261107.md:3` — «Orden expresa de Emmanuel: todos los vídeos nuevos de testeos y lotes, incluidos Seedance, Genjutsu y otros motores,». 
- `avatar-identidad-no-realismo`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/identidad-avatar-realismo-20261114.md:2` — «Orden expresa de Emmanuel, 14/11/2026. Alcance: testeos de productos y lotes de vídeos, todos los frames nuevos.». 
- `referencia-subida-desactiva-pinterest`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/AGENTS.md:72` — «Cuando una tarjeta tiene una imagen de referencia subida por Emmanuel, usar esa referencia y desactivar automáticamente la búsqueda en Pinterest para esa tarjeta, incluso si tenía Pinterest activado.». 
- `fondos-manuales-base-todos-productos`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/pinterest-seleccion-manual-20261117.md:3` — «Orden de Emmanuel: usar sus fondos manuales como base de selección para todos los productos.». 
- `entorno-funcional-todas-cuentas`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/variantes-embalajes-y-cierre-lotes-20261116.md:24` — «Mantener objetos funcionales y lógica de acción en TODAS las cuentas/productos.». 
- `object-swap-quitar-texto-editorial`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md:3` — «Regla fija para cualquier nueva réplica con Object Swap, de cualquier cuenta o producto.». 
- `object-swap-todos-entornos`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md:3` — «Regla fija para cualquier nueva réplica con Object Swap, de cualquier cuenta o producto.». 
- `wan-prime-mismas-reglas-object-swap`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md:3` — «Regla fija para cualquier nueva réplica con Object Swap, de cualquier cuenta o producto.». 
- `cancion-exacta-drop-ancla`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion.json:5` — «Ese es el tipo de edición que necesito cuando hay música.». 
- `musica-continua-desde-primer-frame`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion.json:5` — «Ese es el tipo de edición que necesito cuando hay música.». 
- `mezcla-r2-nivel-constante`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion.json:5` — «Ese es el tipo de edición que necesito cuando hay música.». 
- `gancho-cuerpo-solo-habla-primero`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md:14` — «Gancho más cuerpo: descartar todo audio generado/original del cuerpo y todo ambiente.». 
- `cancion-tarjeta-prevalece-genjutsu`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:8` — «Canción explícita de tarjeta prevalece también en réplica Genjutsu completa.». 
- `limites-gancho-por-concepto`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:19` — «No hay límite general de tres segundos.». 
- `replicas-conservar-secuencia-y-ritmo`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:19` — «Réplicas de contenido conservan secuencia, acciones, visuales, tiempos, cortes y ritmo de la referencia efectiva;». 
- `tienda-alemana-coherente-autonomia`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/tiendas-alemania-pinterest-logo-20261109.md:5` — «Para nuevos frames dentro de tiendas en Alemania, si Emmanuel no especifica tienda y el texto del vídeo de referencia tampoco la especifica,». 
- `tienda-logo-fisico-autentico`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/tiendas-alemania-pinterest-logo-20261109.md:5` — «Para nuevos frames dentro de tiendas en Alemania, si Emmanuel no especifica tienda y el texto del vídeo de referencia tampoco la especifica,». 
- `gancho-hablado-idioma-destino`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GANCHO_HABLADO_IDIOMA_MOTOR_MIXTO_20261104.md:3` — «Orden expresa de Emmanuel para nuevos testeos en modalidad replicar los más virales.». 
- `frames-aprobados-continuar-lote`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/ReglaContinuidad-20261029/REGLA.md:12` — «Se aplica también a lotes mixtos con edición de vídeos existentes.». 
- `dudas-iniciales-antes-frames`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/automatizacion-ligera-20261109.md:27` — «Todas las preguntas esenciales del lote (imágenes, generación, edición, música, voz, textos y cortes)». 
- `entregas-editadas-carpeta-fecha`: alcance en `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/REGLA.md:3` — «Orden directa de Emmanuel: todos los vídeos editados se guardan en». 
- `imagen-organica-no-anuncio`: alcance en `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/organico-no-publicidad.md:14` — «los vídeos, es completamente orgánico por lo que busco una imagen orgánica». 

Ampliaciones de alcance contrastadas al cierre:

- `emojis-adaptados-referencia-real`: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/textos-siempre-edicion-20261031.md:3`. Alcance: «Orden expresa de Emmanuel: todas las entregas deben llevar textos y edición posterior; frames y clips generados limpios sin overlays.». La atribución procede de la orden expresa del documento, sin convertir el ejemplo en aprobación de un resultado.
- `cada-demostracion-funcion-real`: `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md:10`. Alcance: «Antes de escribir cada demostración, consultar la función real del producto y sus referencias.». La atribución procede de la orden expresa del documento, sin convertir el ejemplo en aprobación de un resultado.
- `falterpfote-preservar-proyeccion`: `/Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md:5`. La atribución procede de la orden expresa del documento, sin convertir el ejemplo en aprobación de un resultado.

No se encontró una orden humana inequívoca que imponga emojis específicos para cada país o estación en todos los productos. Se conserva la adaptación por referencia, idioma y nicho, los casos capilar/magia y la decoración navideña condicional; no se inventa un catálogo universal de emojis estacionales.
