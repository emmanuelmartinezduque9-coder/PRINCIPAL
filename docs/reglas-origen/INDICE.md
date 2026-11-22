# Índice de reglas y skills de origen

Copia **literal** (sin resumir ni reescribir) de las reglas y skills existentes del dueño, traídas de su Mac en solo lectura el 22/11/2026. Son el material de partida para la nueva app.

## Cómo se copió

- Lectura con Desktop Commander (`read_multiple_files` / `read_file`) sobre el Mac, sin escribir, mover, borrar ni ejecutar nada allí.
- El texto devuelto por la herramienta se volcó a disco **byte a byte mediante un script** (no se tecleó a mano), precisamente para garantizar que no hubiera resúmenes ni erratas. Solo se retiró la cabecera técnica de la herramienta (`[Reading N lines …]`) y el pie `[executed on device …]`.
- Verificación: el número de líneas de cada fichero copiado se comparó con el total que declara el Mac. Coinciden todos salvo 3 ficheros con 1 línea de diferencia (ver «Incidencias»).
- El tamaño indicado es el del fichero copiado en bytes UTF-8 (equivale al del origen salvo, como mucho, el salto de línea final).
- No se abrió ningún `.env`, credencial, token, cookie, fichero de sesión, `connection.json` ni `access.json`.

## Resumen

| Sección | Ficheros |
|---|---:|
| `skills-codex/` | 43 |
| `skills-proyecto/` | 18 |
| `reglas-edicion-t7/` | 31 |
| `memory-context/` | 70 |
| `cerebro/` | 273 |
| `raiz/` | 7 |
| **Total** | **442** |

## Secretos y redacciones `[OMITIDO]`

Se revisaron todos los ficheros copiados buscando claves de API, tokens, contraseñas, webhooks y cadenas con forma de credencial. **No se encontró ninguno; no hubo que aplicar ninguna redacción `[OMITIDO]`.** Las coincidencias de las palabras «token», «secreto» o «contraseña» son texto normal de las reglas (p. ej. coste en tokens), sin valores.

Aviso: los ficheros sí contienen datos operativos no secretos (rutas locales del Mac, identificadores de pedidos/jobs, hashes SHA-256, IDs de canal/hilo de Slack y, en `memory-context/politicas-tiendas.md`, un correo de contacto de las tiendas). Conviene que el dueño decida si quiere eso en el repositorio antes de hacer commit.

## Incidencias y ficheros incompletos

- **Ningún fichero quedó incompleto.** Los dos de más de 1000 líneas se leyeron por trozos hasta el final.
- Diferencia de 1 línea (29 frente a 30, o 55 frente a 56) entre lo copiado y el total declarado por el Mac en: `reglas-edicion-t7/REFERENCIAS_TEST_4/REGLAS.md`, `cerebro/cuentas/FALTLIEBLING.md`, `cerebro/cuentas/NAGELFUNKEL.md`. El contenido visible está entero; la diferencia es una línea en blanco al final del fichero que la herramienta de lectura no devuelve.
- En general, los espacios o saltos de línea al final de cada fichero pueden no ser idénticos al original (la herramienta lee por líneas); el resto es literal.
- En varios textos aparecen fechas pegadas a la palabra anterior (p. ej. «posterior09/11/2026», «de5.8s»). Así los devolvió la lectura; no se han corregido.

## 1. skills-codex — skills de Codex (`/Users/emmanuelmartinezduque/.codex/skills/`)

43 ficheros · 295.466 bytes

**No copiado:**
- Imágenes (binarios): `nanobanana-pro-imagenes/references/cafe.png`, `nanobanana-pro-imagenes/references/escaparate.png`.
- Skills excluidas por encargo (no abiertas): `.system/`, `paypal-disputas-productos-fisicos`, `respuestas-clientes-emmanuel`, `infoproductos-avatares`, `guion-de-video-para-youtube-a-partir-de-idea`.

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `skills-codex/adaptacion-de-conceptos/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/adaptacion-de-conceptos/SKILL.md` | 9.650 | 62 |
| `skills-codex/adaptacion-de-conceptos/agents/openai.yaml` | `/Users/emmanuelmartinezduque/.codex/skills/adaptacion-de-conceptos/agents/openai.yaml` | 327 | 6 |
| `skills-codex/adaptacion-de-conceptos/references/ejemplos-reales.md` | `/Users/emmanuelmartinezduque/.codex/skills/adaptacion-de-conceptos/references/ejemplos-reales.md` | 5.800 | 46 |
| `skills-codex/adaptacion-de-conceptos/references/idea-a-prompt.md` | `/Users/emmanuelmartinezduque/.codex/skills/adaptacion-de-conceptos/references/idea-a-prompt.md` | 6.345 | 40 |
| `skills-codex/adaptacion-de-conceptos/scripts/index_approved_prompts.py` | `/Users/emmanuelmartinezduque/.codex/skills/adaptacion-de-conceptos/scripts/index_approved_prompts.py` | 2.654 | 29 |
| `skills-codex/angulos-de-venta/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/angulos-de-venta/SKILL.md` | 10.687 | 63 |
| `skills-codex/angulos-de-venta/references/ejemplos.md` | `/Users/emmanuelmartinezduque/.codex/skills/angulos-de-venta/references/ejemplos.md` | 3.665 | 32 |
| `skills-codex/angulos-de-venta/references/metodo-juanma-L_jJ3ivApwo.md` | `/Users/emmanuelmartinezduque/.codex/skills/angulos-de-venta/references/metodo-juanma-L_jJ3ivApwo.md` | 5.393 | 32 |
| `skills-codex/fondos-pinterest-por-toma/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/fondos-pinterest-por-toma/SKILL.md` | 6.267 | 45 |
| `skills-codex/fondos-pinterest-por-toma/references/criterios-seleccion-manual.md` | `/Users/emmanuelmartinezduque/.codex/skills/fondos-pinterest-por-toma/references/criterios-seleccion-manual.md` | 5.166 | 37 |
| `skills-codex/generacion-de-videos-por-idea/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/generacion-de-videos-por-idea/SKILL.md` | 4.450 | 26 |
| `skills-codex/generacion-de-videos-por-idea/agents/openai.yaml` | `/Users/emmanuelmartinezduque/.codex/skills/generacion-de-videos-por-idea/agents/openai.yaml` | 141 | 3 |
| `skills-codex/generacion-de-videos-por-idea/references/archivo.md` | `/Users/emmanuelmartinezduque/.codex/skills/generacion-de-videos-por-idea/references/archivo.md` | 3.493 | 18 |
| `skills-codex/higgsfield-genjutsu/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/higgsfield-genjutsu/SKILL.md` | 7.851 | 55 |
| `skills-codex/higgsfield-genjutsu/references/mentor-transcripcion.txt` | `/Users/emmanuelmartinezduque/.codex/skills/higgsfield-genjutsu/references/mentor-transcripcion.txt` | 14.127 | 386 |
| `skills-codex/higgsfield-genjutsu/references/object-swap-producto.md` | `/Users/emmanuelmartinezduque/.codex/skills/higgsfield-genjutsu/references/object-swap-producto.md` | 4.957 | 80 |
| `skills-codex/higgsfield-genjutsu/references/prompts.md` | `/Users/emmanuelmartinezduque/.codex/skills/higgsfield-genjutsu/references/prompts.md` | 3.580 | 34 |
| `skills-codex/nanobanana-pro-imagenes/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/SKILL.md` | 23.954 | 313 |
| `skills-codex/nanobanana-pro-imagenes/references/cafe-prompt.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/cafe-prompt.txt` | 2.949 | 15 |
| `skills-codex/nanobanana-pro-imagenes/references/ejemplos.md` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/ejemplos.md` | 2.297 | 39 |
| `skills-codex/nanobanana-pro-imagenes/references/escaparate-prompt.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/escaparate-prompt.txt` | 3.236 | 15 |
| `skills-codex/nanobanana-pro-imagenes/references/fewshot-emmanuel-1.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/fewshot-emmanuel-1.txt` | 2.949 | 15 |
| `skills-codex/nanobanana-pro-imagenes/references/fewshot-emmanuel-2.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/fewshot-emmanuel-2.txt` | 1.883 | 5 |
| `skills-codex/nanobanana-pro-imagenes/references/fewshot-emmanuel-3.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/fewshot-emmanuel-3.txt` | 2.418 | 7 |
| `skills-codex/nanobanana-pro-imagenes/references/fewshot-emmanuel-4.txt` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/fewshot-emmanuel-4.txt` | 6.802 | 63 |
| `skills-codex/nanobanana-pro-imagenes/references/realismo-20261003.md` | `/Users/emmanuelmartinezduque/.codex/skills/nanobanana-pro-imagenes/references/realismo-20261003.md` | 3.410 | 26 |
| `skills-codex/nombres-marca-emmanuel/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/nombres-marca-emmanuel/SKILL.md` | 6.566 | 59 |
| `skills-codex/nombres-marca-emmanuel/agents/openai.yaml` | `/Users/emmanuelmartinezduque/.codex/skills/nombres-marca-emmanuel/agents/openai.yaml` | 306 | 6 |
| `skills-codex/reverse-engineer-anything/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/SKILL.md` | 31.389 | 456 |
| `skills-codex/reverse-engineer-anything/references/android-applications.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/android-applications.md` | 2.318 | 39 |
| `skills-codex/reverse-engineer-anything/references/connection-and-recovery.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/connection-and-recovery.md` | 16.650 | 209 |
| `skills-codex/reverse-engineer-anything/references/evidence-workflows.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/evidence-workflows.md` | 7.449 | 117 |
| `skills-codex/reverse-engineer-anything/references/javascript-applications.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/javascript-applications.md` | 13.430 | 240 |
| `skills-codex/reverse-engineer-anything/references/native-and-artifacts.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/native-and-artifacts.md` | 33.862 | 536 |
| `skills-codex/reverse-engineer-anything/references/runtime-observation.md` | `/Users/emmanuelmartinezduque/.codex/skills/reverse-engineer-anything/references/runtime-observation.md` | 11.719 | 132 |
| `skills-codex/split-testing-videos/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/SKILL.md` | 7.519 | 44 |
| `skills-codex/split-testing-videos/agents/openai.yaml` | `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/agents/openai.yaml` | 258 | 4 |
| `skills-codex/split-testing-videos/references/cuentas-emmanuel.md` | `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/references/cuentas-emmanuel.md` | 962 | 7 |
| `skills-codex/split-testing-videos/references/metodo-video.md` | `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/references/metodo-video.md` | 1.729 | 13 |
| `skills-codex/split-testing-videos/references/vinculacion-entregas.md` | `/Users/emmanuelmartinezduque/.codex/skills/split-testing-videos/references/vinculacion-entregas.md` | 2.577 | 15 |
| `skills-codex/variaciones-textos-ganadores/SKILL.md` | `/Users/emmanuelmartinezduque/.codex/skills/variaciones-textos-ganadores/SKILL.md` | 8.122 | 74 |
| `skills-codex/variaciones-textos-ganadores/references/targetalarmm.md` | `/Users/emmanuelmartinezduque/.codex/skills/variaciones-textos-ganadores/references/targetalarmm.md` | 2.950 | 30 |
| `skills-codex/variaciones-textos-ganadores/references/ziellwecker.md` | `/Users/emmanuelmartinezduque/.codex/skills/variaciones-textos-ganadores/references/ziellwecker.md` | 3.209 | 27 |

## 2. skills-proyecto — skills del proyecto (`/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/`)

18 ficheros · 114.498 bytes

**No copiado:** el resto de skills de esa carpeta no estaban en el encargo y no se abrieron: `higgsfield-brandkit`, `higgsfield-marketplace-cards`, `higgsfield-product-photoshoot`, `higgsfield-soul-id`, `higgsfield-video-explainer`, `higgsfield-websites`, `higgsfield-youtube-thumbnail`.

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `skills-proyecto/higgsfield-generate/SKILL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/SKILL.md` | 24.837 | 322 |
| `skills-proyecto/higgsfield-generate/references/emmanuel-nanobanana-realismo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/emmanuel-nanobanana-realismo.md` | 1.374 | 22 |
| `skills-proyecto/higgsfield-generate/references/marketing-ad-references.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-ad-references.md` | 4.314 | 99 |
| `skills-proyecto/higgsfield-generate/references/marketing-avatars.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-avatars.md` | 1.395 | 46 |
| `skills-proyecto/higgsfield-generate/references/marketing-brand-kits.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-brand-kits.md` | 2.574 | 55 |
| `skills-proyecto/higgsfield-generate/references/marketing-dtc-ads.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-dtc-ads.md` | 4.698 | 88 |
| `skills-proyecto/higgsfield-generate/references/marketing-modes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-modes.md` | 3.330 | 53 |
| `skills-proyecto/higgsfield-generate/references/marketing-products.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-products.md` | 1.505 | 57 |
| `skills-proyecto/higgsfield-generate/references/marketing-setup-items.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/marketing-setup-items.md` | 2.640 | 63 |
| `skills-proyecto/higgsfield-generate/references/media-inputs.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/media-inputs.md` | 7.607 | 142 |
| `skills-proyecto/higgsfield-generate/references/model-catalog.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/model-catalog.md` | 21.672 | 221 |
| `skills-proyecto/higgsfield-generate/references/prompt-engineering.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/prompt-engineering.md` | 1.554 | 47 |
| `skills-proyecto/higgsfield-generate/references/troubleshooting.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/troubleshooting.md` | 1.593 | 34 |
| `skills-proyecto/higgsfield-generate/references/workflows.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/higgsfield-generate/references/workflows.md` | 3.059 | 96 |
| `skills-proyecto/nano-video/SKILL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/nano-video/SKILL.md` | 5.191 | 64 |
| `skills-proyecto/nano-video/acciones.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/nano-video/acciones.md` | 3.098 | 58 |
| `skills-proyecto/nuevo-producto/SKILL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/nuevo-producto/SKILL.md` | 14.747 | 200 |
| `skills-proyecto/nuevo-producto/references/primer-video-test.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/.agents/skills/nuevo-producto/references/primer-video-test.md` | 9.310 | 116 |

## 3. reglas-edicion-t7 — reglas de edición (`/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/`)

31 ficheros · 337.218 bytes

Se copiaron todos los ficheros de texto (`.md`, `.json` y respaldos de texto `.before` / `.before-AAAAMMDD` / `.antes-…`), todos por debajo de 200 KB.

**No copiado:**
- Imágenes (binarios): `REFERENCIAS_TEST_4/coffee.png`, `REFERENCIAS_TEST_4/countdown.png`, `REFERENCIAS_TEST_4/gift_delivery.png`.
- Ficheros `._*` (basura de macOS): ignorados.

**Lectura por trozos:** `Identidades-20261106-respaldo/AGENTS.md.before` (1435 líneas) y `MUSICA_R2_APROBADA/AGENTS.before.md` (1288 líneas) superan las 1000 líneas; se leyeron en dos trozos (0–999 y 1000–fin) y están completos (recuento de líneas verificado).

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `reglas-edicion-t7/CONTINUIDAD_FRAMES_20261104.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CONTINUIDAD_FRAMES_20261104.md` | 1.366 | 9 |
| `reglas-edicion-t7/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CORRECCION_FUNCION_DROP_GANCHOS_20261115.md` | 3.911 | 19 |
| `reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.antes-06b-fijo-20261031.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.antes-06b-fijo-20261031.md` | 10.070 | 74 |
| `reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md` | 11.840 | 87 |
| `reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.md.before-20261115` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md.before-20261115` | 10.628 | 79 |
| `reglas-edicion-t7/ESCENARIOS_FRAMES_TESTS.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/ESCENARIOS_FRAMES_TESTS.md` | 1.839 | 9 |
| `reglas-edicion-t7/FLUJO_TEST_PRODUCTOS.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md` | 18.836 | 103 |
| `reglas-edicion-t7/GANCHO_HABLADO_IDIOMA_MOTOR_MIXTO_20261104.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GANCHO_HABLADO_IDIOMA_MOTOR_MIXTO_20261104.md` | 2.204 | 15 |
| `reglas-edicion-t7/GENJUTSU_AUDIO_COMPLETO.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md` | 2.489 | 18 |
| `reglas-edicion-t7/GENJUTSU_AUDIO_COMPLETO.md.before-20261115` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_AUDIO_COMPLETO.md.before-20261115` | 2.024 | 14 |
| `reglas-edicion-t7/GENJUTSU_PADDING_TECNICO.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_PADDING_TECNICO.md` | 4.209 | 69 |
| `reglas-edicion-t7/GENJUTSU_VARIACION_VISUAL_POR_MERCADO.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/GENJUTSU_VARIACION_VISUAL_POR_MERCADO.md` | 1.390 | 5 |
| `reglas-edicion-t7/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/IDENTIDADES_PERSONAS_ANIMALES_GENJUTSU_20261106.md` | 2.567 | 12 |
| `reglas-edicion-t7/INFOPRODUCTOS_VISUAL_APROBADO.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/INFOPRODUCTOS_VISUAL_APROBADO.md` | 4.047 | 13 |
| `reglas-edicion-t7/Identidades-20261106-respaldo/AGENTS.md.before` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/Identidades-20261106-respaldo/AGENTS.md.before` | 118.974 | 1435 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/AGENTS.before.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/AGENTS.before.md` | 100.723 | 1288 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/CRITERIOS_OBLIGATORIOS.md.before` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/CRITERIOS_OBLIGATORIOS.md.before` | 8.447 | 66 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/REGLA.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/REGLA.md` | 2.977 | 17 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/aprobacion-v8-r3.json` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion-v8-r3.json` | 626 | 8 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/aprobacion.json` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/aprobacion.json` | 960 | 19 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/criterios-edicion-obligatorios.md.before` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/criterios-edicion-obligatorios.md.before` | 2.135 | 16 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/politica.before-v8-r3.json` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/politica.before-v8-r3.json` | 691 | 17 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/politica.json` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/politica.json` | 1.012 | 24 |
| `reglas-edicion-t7/MUSICA_R2_APROBADA/ritmo-musica-voz-edicion.md.before` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/MUSICA_R2_APROBADA/ritmo-musica-voz-edicion.md.before` | 8.100 | 112 |
| `reglas-edicion-t7/REFERENCIAS_TEST_4/REGLAS.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/REFERENCIAS_TEST_4/REGLAS.md` | 3.848 | 29 |
| `reglas-edicion-t7/REFERENCIAS_TEST_4/catalog.json` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/REFERENCIAS_TEST_4/catalog.json` | 1.814 | 68 |
| `reglas-edicion-t7/SEEDANCE_ESCALA_MANO_20261105.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/SEEDANCE_ESCALA_MANO_20261105.md` | 1.855 | 8 |
| `reglas-edicion-t7/SIN_OVERLAYS_GENERADOS.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/SIN_OVERLAYS_GENERADOS.md` | 713 | 3 |
| `reglas-edicion-t7/TESTS_CALENDARIOS_720_20261104.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/TESTS_CALENDARIOS_720_20261104.md` | 2.443 | 15 |
| `reglas-edicion-t7/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md` | 1.357 | 16 |
| `reglas-edicion-t7/variacion-visual-ganchos-tests-20261031.md` | `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/variacion-visual-ganchos-tests-20261031.md` | 3.123 | 15 |

## 4. memory-context — memoria de contexto (`/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/`)

70 ficheros · 153.880 bytes

**No copiado:**
- `finanzas-hypersku-continuidad-20261115.md` — excluido por tema (finanzas/HyperSKU); no se abrió.
- No son `.md` (solo se pedían `.md`): `countdown-1s-notificacion-20261022.json`, `reparacion-chat-buscar-proveedor-20261116.json`, `texto-edicion-default-f.json`.
- Ningún `.md` superaba los 100 KB.

**A revisar por el dueño (copiados, pero no son estrictamente de vídeo):** `politicas-tiendas.md` (políticas legales de tienda; contiene una dirección de correo de contacto de las tiendas), `shopify-shrine-pro-emmanuel.md`, `slack-sega-notificaciones.md`, `slack-productos-fuente-compartida-20261030.md`, `delegacion-productos-vendedores-borrador-20261108.md`. No tratan de finanzas/PayPal/disputas, por eso no se excluyeron.

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `memory-context/alta-automatica-productos-testeados-20261114.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/alta-automatica-productos-testeados-20261114.md` | 764 | 2 |
| `memory-context/angulos-de-venta-20261107-video-juanma.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/angulos-de-venta-20261107-video-juanma.md` | 914 | 5 |
| `memory-context/aprendizajes-lote81-20261120.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/aprendizajes-lote81-20261120.md` | 2.222 | 12 |
| `memory-context/auditoria-edicion-ssd-20261115.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/auditoria-edicion-ssd-20261115.md` | 2.852 | 23 |
| `memory-context/automatizacion-ligera-20261109.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/automatizacion-ligera-20261109.md` | 5.500 | 27 |
| `memory-context/avatar-visible-subtitulos-pecho-20261031.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/avatar-visible-subtitulos-pecho-20261031.md` | 1.846 | 12 |
| `memory-context/canciones-capcut-importacion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/canciones-capcut-importacion.md` | 1.379 | 22 |
| `memory-context/cierre-catalogo-verificado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/cierre-catalogo-verificado.md` | 2.839 | 40 |
| `memory-context/classic-y-assets-prime.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/classic-y-assets-prime.md` | 2.387 | 39 |
| `memory-context/colliezauber-charms-2d-20261104.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/colliezauber-charms-2d-20261104.md` | 840 | 8 |
| `memory-context/competidores-por-referencias.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/competidores-por-referencias.md` | 1.603 | 9 |
| `memory-context/conceptos-video-terminado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/conceptos-video-terminado.md` | 1.184 | 19 |
| `memory-context/continuidad-tras-aprobar-imagenes-20261029.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/continuidad-tras-aprobar-imagenes-20261029.md` | 2.491 | 12 |
| `memory-context/correccion-funcion-drop-ganchos-20261115.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/correccion-funcion-drop-ganchos-20261115.md` | 3.558 | 16 |
| `memory-context/cuentas-cuerpos-emojis-20261114.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/cuentas-cuerpos-emojis-20261114.md` | 1.953 | 11 |
| `memory-context/cuerpos-alarmas-retirados-20261029.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/cuerpos-alarmas-retirados-20261029.md` | 470 | 3 |
| `memory-context/delegacion-productos-vendedores-borrador-20261108.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/delegacion-productos-vendedores-borrador-20261108.md` | 2.411 | 19 |
| `memory-context/edicion-opcional-y-wan-simple.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/edicion-opcional-y-wan-simple.md` | 2.516 | 40 |
| `memory-context/eiswerk-receta-mm-original-20261117.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/eiswerk-receta-mm-original-20261117.md` | 3.981 | 25 |
| `memory-context/eiswerk-variante-azul.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/eiswerk-variante-azul.md` | 661 | 3 |
| `memory-context/eiswerk-variante-virutas-20261117.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/eiswerk-variante-virutas-20261117.md` | 2.123 | 13 |
| `memory-context/entrega-agrupada-frames.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/entrega-agrupada-frames.md` | 420 | 2 |
| `memory-context/fastluxus-variantes-del-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/fastluxus-variantes-del-video.md` | 1.852 | 30 |
| `memory-context/fondos-organicos-tiendas-reales-20261105.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/fondos-organicos-tiendas-reales-20261105.md` | 1.006 | 2 |
| `memory-context/generacion-480-global-20261107.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/generacion-480-global-20261107.md` | 1.144 | 7 |
| `memory-context/generacion-720-global-20261104.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/generacion-720-global-20261104.md` | 1.147 | 7 |
| `memory-context/genjutsu-variacion-visual-por-mercado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/genjutsu-variacion-visual-por-mercado.md` | 1.390 | 5 |
| `memory-context/heygen-conexion-20261031.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/heygen-conexion-20261031.md` | 832 | 6 |
| `memory-context/hoofholly-referencia-visual-muy-aprobada-20261105.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/hoofholly-referencia-visual-muy-aprobada-20261105.md` | 1.128 | 7 |
| `memory-context/identidad-avatar-realismo-20261114.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/identidad-avatar-realismo-20261114.md` | 827 | 6 |
| `memory-context/identidades-personas-animales-genjutsu-20261106.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/identidades-personas-animales-genjutsu-20261106.md` | 2.567 | 12 |
| `memory-context/infoproductos-google-flow-20261101.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/infoproductos-google-flow-20261101.md` | 4.127 | 20 |
| `memory-context/nombres-marca-emmanuel.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/nombres-marca-emmanuel.md` | 523 | 3 |
| `memory-context/nombres-producto-nicho-20261114.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/nombres-producto-nicho-20261114.md` | 1.225 | 8 |
| `memory-context/object-swap-textos-fondos-20261117.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/object-swap-textos-fondos-20261117.md` | 3.023 | 11 |
| `memory-context/pinterest-opcional-por-video-20261105.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/pinterest-opcional-por-video-20261105.md` | 557 | 4 |
| `memory-context/pinterest-seleccion-manual-20261117.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/pinterest-seleccion-manual-20261117.md` | 1.885 | 11 |
| `memory-context/politicas-tiendas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/politicas-tiendas.md` | 1.458 | 13 |
| `memory-context/proactividad-y-preguntas-lotes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/proactividad-y-preguntas-lotes.md` | 2.345 | 28 |
| `memory-context/producto-del-video-sin-mockup.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/producto-del-video-sin-mockup.md` | 4.838 | 72 |
| `memory-context/productos-compartidos-tiendas-20261117.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/productos-compartidos-tiendas-20261117.md` | 1.730 | 14 |
| `memory-context/referencias-identidad-y-lotes-mixtos-20261029.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/referencias-identidad-y-lotes-mixtos-20261029.md` | 2.630 | 13 |
| `memory-context/regeneracion-referencias-adicionales-20261030.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/regeneracion-referencias-adicionales-20261030.md` | 1.347 | 5 |
| `memory-context/relevo-automatizacion-20261109.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/relevo-automatizacion-20261109.md` | 3.446 | 20 |
| `memory-context/replicas-vestuario-diferente-20261031.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/replicas-vestuario-diferente-20261031.md` | 944 | 5 |
| `memory-context/resolucion-generacion-y-unlimited.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/resolucion-generacion-y-unlimited.md` | 1.393 | 22 |
| `memory-context/ritmo-musica-voz-edicion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/ritmo-musica-voz-edicion.md` | 9.723 | 120 |
| `memory-context/seedance-escala-mano-20261105.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/seedance-escala-mano-20261105.md` | 1.855 | 8 |
| `memory-context/shopify-shrine-pro-emmanuel.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/shopify-shrine-pro-emmanuel.md` | 9.739 | 54 |
| `memory-context/sin-overlays-ni-paneles-negros-20261030.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/sin-overlays-ni-paneles-negros-20261030.md` | 672 | 3 |
| `memory-context/slack-productos-fuente-compartida-20261030.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/slack-productos-fuente-compartida-20261030.md` | 1.843 | 5 |
| `memory-context/slack-sega-notificaciones.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/slack-sega-notificaciones.md` | 1.581 | 15 |
| `memory-context/split-testing-dos-bases-20261029.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/split-testing-dos-bases-20261029.md` | 1.572 | 11 |
| `memory-context/testeo-investigacion-ciclos-20261108.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/testeo-investigacion-ciclos-20261108.md` | 3.174 | 14 |
| `memory-context/tests-calendarios-720-20261104.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/tests-calendarios-720-20261104.md` | 2.443 | 15 |
| `memory-context/texto-edicion-default-06b.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/texto-edicion-default-06b.md` | 3.085 | 40 |
| `memory-context/texto-edicion-default-f.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/texto-edicion-default-f.md` | 2.152 | 32 |
| `memory-context/textos-siempre-edicion-20261031.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/textos-siempre-edicion-20261031.md` | 687 | 3 |
| `memory-context/tiendas-alemania-pinterest-logo-20261109.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/tiendas-alemania-pinterest-logo-20261109.md` | 1.527 | 11 |
| `memory-context/traduccion-fiel-aleman-y-control-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/traduccion-fiel-aleman-y-control-video.md` | 4.234 | 62 |
| `memory-context/upscale-theia-1080p.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/upscale-theia-1080p.md` | 1.060 | 16 |
| `memory-context/upscale-theia-2k.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/upscale-theia-2k.md` | 1.071 | 21 |
| `memory-context/variantes-embalajes-y-cierre-lotes-20261116.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/variantes-embalajes-y-cierre-lotes-20261116.md` | 6.692 | 31 |
| `memory-context/verificador-cortes-independiente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/verificador-cortes-independiente.md` | 2.439 | 38 |
| `memory-context/videos-editados-por-fecha-20261029.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/videos-editados-por-fecha-20261029.md` | 1.051 | 7 |
| `memory-context/wan-prime-cambios-minimos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/wan-prime-cambios-minimos.md` | 1.782 | 27 |
| `memory-context/wan-prime-creditos-20261107.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/wan-prime-creditos-20261107.md` | 661 | 2 |
| `memory-context/wan-prime-solo-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/wan-prime-solo-video.md` | 3.783 | 49 |
| `memory-context/wintertasse-adaptacion-chocolate-20261108.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/wintertasse-adaptacion-chocolate-20261108.md` | 2.339 | 12 |
| `memory-context/wintertasse-ritmo-pov-20261108.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/memory/context/wintertasse-ritmo-pov-20261108.md` | 437 | 2 |

## 5. cerebro — vault CEREBRO (`/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/`)

273 ficheros · 458.567 bytes

Copiado: `INDEX.md` y todos los `.md` de `reglas/` (58), `flujo/` (9), `sistema/` (18), `cuentas/` (44) y `lecciones/` (143).

**No copiado (fuera del encargo, no abierto):**
- `SEGA - Operativa/` (8 ficheros) — excluido expresamente.
- `logica/` (6 `.md`: biblioteca-de-prompts, como-pensar-referencia-vs-frame, estructura-de-8-bloques, plantilla-oficial-de-frame, por-que-un-prompt-sale-POV-y-otro-sale-rodaje, realismo-iphone) — **probablemente relevante para la app; no estaba en la lista. Pedir si se quiere.**
- `plantillas/` (`cuenta-nueva.md`, `politicas/eiswerk-original-de.md`), `investigaciones/`, `aprendizaje/cmg/`, `propuestas/realismo-20261003/`, `prompts/` (incluye otra `BIBLIOTECA_PROMPTS.md`, `conceptos/` por cuenta y `originales_analisis/`).
- Ficheros sueltos de la raíz de CEREBRO: `SEGA-KAFFEEBILD-*.md`, `SEGA-LOTE3-*.md/.json`, `SEGA-NANOBANANA-ESTILO-*.md/.json/.html`, `SEGA.canvas`, `NAGELKLAR-preflight-20261003.json`, `nylosteam-preparacion-20261003.json`, `coordinacion-sega.json`, `coordinacion-sega.lock`, `.obsidian/`, `.DS_Store`.

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `cerebro/INDEX.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/INDEX.md` | 5.166 | 100 |
| `cerebro/cuentas/BRAUFORM.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/BRAUFORM.md` | 2.442 | 34 |
| `cerebro/cuentas/EisMeister.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/EisMeister.md` | 1.630 | 25 |
| `cerebro/cuentas/EisWerk.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/EisWerk.md` | 2.527 | 51 |
| `cerebro/cuentas/EisZwilling.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/EisZwilling.md` | 3.993 | 53 |
| `cerebro/cuentas/FABLESEAT.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FABLESEAT.md` | 132 | 5 |
| `cerebro/cuentas/FALTERPFOTE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FALTERPFOTE.md` | 1.648 | 18 |
| `cerebro/cuentas/FALTLIEBLING.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FALTLIEBLING.md` | 1.205 | 29 |
| `cerebro/cuentas/FASTLUXUS.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FASTLUXUS.md` | 1.379 | 34 |
| `cerebro/cuentas/FENSTERFUNKELN.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FENSTERFUNKELN.md` | 830 | 18 |
| `cerebro/cuentas/FRECHFLAUSCH.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FRECHFLAUSCH.md` | 878 | 28 |
| `cerebro/cuentas/FlauschNest.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/FlauschNest.md` | 2.190 | 33 |
| `cerebro/cuentas/GLASLIEBE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/GLASLIEBE.md` | 2.353 | 26 |
| `cerebro/cuentas/Gelatovivo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/Gelatovivo.md` | 592 | 11 |
| `cerebro/cuentas/HAARFEIN.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/HAARFEIN.md` | 1.765 | 26 |
| `cerebro/cuentas/HAARZAUBER.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/HAARZAUBER.md` | 1.341 | 34 |
| `cerebro/cuentas/HerzPfote.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/HerzPfote.md` | 1.007 | 18 |
| `cerebro/cuentas/KAFFEEBILD.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/KAFFEEBILD.md` | 2.611 | 35 |
| `cerebro/cuentas/KUSCHELGRINCH.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/KUSCHELGRINCH.md` | 1.022 | 33 |
| `cerebro/cuentas/LASERBANDE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/LASERBANDE.md` | 873 | 26 |
| `cerebro/cuentas/LICHTERFREUDE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/LICHTERFREUDE.md` | 867 | 13 |
| `cerebro/cuentas/NAGELFUNKEL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/NAGELFUNKEL.md` | 3.108 | 55 |
| `cerebro/cuentas/NAGELKLAR.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/NAGELKLAR.md` | 3.926 | 69 |
| `cerebro/cuentas/Nailuna.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/Nailuna.md` | 2.130 | 39 |
| `cerebro/cuentas/NikolausLicht.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/NikolausLicht.md` | 1.805 | 36 |
| `cerebro/cuentas/PISTENGRINS.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/PISTENGRINS.md` | 1.971 | 23 |
| `cerebro/cuentas/PlattenZauber.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/PlattenZauber.md` | 1.681 | 26 |
| `cerebro/cuentas/RADBLINK.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/RADBLINK.md` | 890 | 17 |
| `cerebro/cuentas/RICCIOVIVO.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/RICCIOVIVO.md` | 1.166 | 29 |
| `cerebro/cuentas/RentierGlanz.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/RentierGlanz.md` | 2.025 | 46 |
| `cerebro/cuentas/RufZeit.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/RufZeit.md` | 1.437 | 37 |
| `cerebro/cuentas/SCHUTZKLINGEL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/SCHUTZKLINGEL.md` | 1.108 | 26 |
| `cerebro/cuentas/STILLWOHL.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/STILLWOHL.md` | 885 | 24 |
| `cerebro/cuentas/TargetAlarm.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/TargetAlarm.md` | 1.808 | 31 |
| `cerebro/cuentas/WAERMENEST.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WAERMENEST.md` | 1.829 | 28 |
| `cerebro/cuentas/WAERMEPLATZ.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WAERMEPLATZ.md` | 889 | 26 |
| `cerebro/cuentas/WEIHNACHTSPFOTE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WEIHNACHTSPFOTE.md` | 1.372 | 39 |
| `cerebro/cuentas/WICHTELLAUNE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WICHTELLAUNE.md` | 1.225 | 31 |
| `cerebro/cuentas/WINTERDURCHBLICK.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WINTERDURCHBLICK.md` | 2.584 | 39 |
| `cerebro/cuentas/WINTERTASSE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WINTERTASSE.md` | 780 | 18 |
| `cerebro/cuentas/WOLKENWONNE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/WOLKENWONNE.md` | 850 | 24 |
| `cerebro/cuentas/ZAUBERDACH.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/ZAUBERDACH.md` | 825 | 24 |
| `cerebro/cuentas/ZEHENWONNE.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/ZEHENWONNE.md` | 910 | 24 |
| `cerebro/cuentas/ZWEIGGLANZ.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/ZWEIGGLANZ.md` | 1.848 | 46 |
| `cerebro/cuentas/ZielAlarm.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/cuentas/ZielAlarm.md` | 2.111 | 32 |
| `cerebro/flujo/alta-de-producto-nuevo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/alta-de-producto-nuevo.md` | 2.066 | 16 |
| `cerebro/flujo/analisis-con-memories.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/analisis-con-memories.md` | 1.691 | 18 |
| `cerebro/flujo/flujo-de-aprobacion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/flujo-de-aprobacion.md` | 1.746 | 12 |
| `cerebro/flujo/generacion-de-clips.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/generacion-de-clips.md` | 1.784 | 13 |
| `cerebro/flujo/metodo-hibrido-clip1-aparte.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/metodo-hibrido-clip1-aparte.md` | 1.854 | 35 |
| `cerebro/flujo/motor-por-clip.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/motor-por-clip.md` | 2.872 | 60 |
| `cerebro/flujo/pipeline-manana.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/pipeline-manana.md` | 2.471 | 17 |
| `cerebro/flujo/prompt-de-10-puntos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/prompt-de-10-puntos.md` | 2.032 | 19 |
| `cerebro/flujo/subida-de-imagenes-por-la-manana.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/flujo/subida-de-imagenes-por-la-manana.md` | 1.197 | 11 |
| `cerebro/lecciones/2026-08-31-200k-tokens-por-una-imagen.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-200k-tokens-por-una-imagen.md` | 935 | 11 |
| `cerebro/lecciones/2026-08-31-afirmar-sin-verificar.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-afirmar-sin-verificar.md` | 966 | 11 |
| `cerebro/lecciones/2026-08-31-color-pink-en-frame-menta.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-color-pink-en-frame-menta.md` | 898 | 11 |
| `cerebro/lecciones/2026-08-31-entrega-diaria-olvidada.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-entrega-diaria-olvidada.md` | 956 | 11 |
| `cerebro/lecciones/2026-08-31-frame-usado-como-mockup.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-frame-usado-como-mockup.md` | 899 | 11 |
| `cerebro/lecciones/2026-08-31-frames-sin-montar-en-panel.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-frames-sin-montar-en-panel.md` | 731 | 11 |
| `cerebro/lecciones/2026-08-31-notas-en-prompt.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-notas-en-prompt.md` | 1.142 | 11 |
| `cerebro/lecciones/2026-08-31-palet-en-dormitorio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-palet-en-dormitorio.md` | 932 | 11 |
| `cerebro/lecciones/2026-08-31-producto-eismeister-recoloreado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-producto-eismeister-recoloreado.md` | 1.036 | 11 |
| `cerebro/lecciones/2026-08-31-prompts-inventados-existiendo-en-biblioteca.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-prompts-inventados-existiendo-en-biblioteca.md` | 1.136 | 11 |
| `cerebro/lecciones/2026-08-31-reveal-adelantado-en-frame.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-reveal-adelantado-en-frame.md` | 988 | 11 |
| `cerebro/lecciones/2026-08-31-tocar-el-muro-para-pasar.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-08-31-tocar-el-muro-para-pasar.md` | 960 | 11 |
| `cerebro/lecciones/2026-09-01-adaptar-es-declarar-la-escena.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-adaptar-es-declarar-la-escena.md` | 551 | 13 |
| `cerebro/lecciones/2026-09-01-adaptar-un-concepto-es-adaptar-todos-sus-clips.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-adaptar-un-concepto-es-adaptar-todos-sus-clips.md` | 775 | 13 |
| `cerebro/lecciones/2026-09-01-kling-no-admite-imagenes-de-referencia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-kling-no-admite-imagenes-de-referencia.md` | 578 | 13 |
| `cerebro/lecciones/2026-09-01-la-app-se-actualiza-sola-o-el-turno-no-cierra.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-la-app-se-actualiza-sola-o-el-turno-no-cierra.md` | 741 | 13 |
| `cerebro/lecciones/2026-09-01-los-fondos-no-pueden-salir-apagados.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-los-fondos-no-pueden-salir-apagados.md` | 787 | 13 |
| `cerebro/lecciones/2026-09-01-no-tomar-decisiones-que-no-me-pidio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-no-tomar-decisiones-que-no-me-pidio.md` | 681 | 13 |
| `cerebro/lecciones/2026-09-01-nombres-que-no-se-parecen.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-nombres-que-no-se-parecen.md` | 2.376 | 38 |
| `cerebro/lecciones/2026-09-01-realismo-no-basta-con-nombrarlo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-realismo-no-basta-con-nombrarlo.md` | 664 | 13 |
| `cerebro/lecciones/2026-09-01-referencia-de-producto-tapado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-referencia-de-producto-tapado.md` | 513 | 13 |
| `cerebro/lecciones/2026-09-01-respetar-la-ropa-del-avatar.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-respetar-la-ropa-del-avatar.md` | 707 | 13 |
| `cerebro/lecciones/2026-09-01-solo-se-adjunta-lo-que-se-va-a-ver.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-solo-se-adjunta-lo-que-se-va-a-ver.md` | 877 | 13 |
| `cerebro/lecciones/2026-09-01-un-concepto-creado-en-el-mensaje-manda-sobre-el-viejo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-01-un-concepto-creado-en-el-mensaje-manda-sobre-el-viejo.md` | 934 | 13 |
| `cerebro/lecciones/2026-09-02-cambiar-una-cara-parecida-exige-describir-los-rasgos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-cambiar-una-cara-parecida-exige-describir-los-rasgos.md` | 1.017 | 13 |
| `cerebro/lecciones/2026-09-02-dos-cuentas-del-mismo-pais-y-nicho-no-pueden-parecerse.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-dos-cuentas-del-mismo-pais-y-nicho-no-pueden-parecerse.md` | 739 | 13 |
| `cerebro/lecciones/2026-09-02-dos-intentos-por-frame-y-se-para.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-dos-intentos-por-frame-y-se-para.md` | 797 | 13 |
| `cerebro/lecciones/2026-09-02-el-frame-se-ensena-antes-de-gastar-el-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-el-frame-se-ensena-antes-de-gastar-el-video.md` | 705 | 13 |
| `cerebro/lecciones/2026-09-02-el-id-de-una-generacion-no-es-un-media-id.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-el-id-de-una-generacion-no-es-un-media-id.md` | 810 | 13 |
| `cerebro/lecciones/2026-09-02-el-motor-se-decide-clip-a-clip.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-el-motor-se-decide-clip-a-clip.md` | 877 | 13 |
| `cerebro/lecciones/2026-09-02-el-packaging-lleva-el-logo-no-la-foto-del-proveedor.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-el-packaging-lleva-el-logo-no-la-foto-del-proveedor.md` | 802 | 13 |
| `cerebro/lecciones/2026-09-02-la-app-no-se-abria-y-yo-decia-que-si.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-la-app-no-se-abria-y-yo-decia-que-si.md` | 1.382 | 22 |
| `cerebro/lecciones/2026-09-02-la-firma-real-se-mide-no-se-opina.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-la-firma-real-se-mide-no-se-opina.md` | 813 | 13 |
| `cerebro/lecciones/2026-09-02-la-prosa-gana-a-los-bloques-en-mayusculas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-la-prosa-gana-a-los-bloques-en-mayusculas.md` | 1.136 | 13 |
| `cerebro/lecciones/2026-09-02-la-receta-validada-de-imagen.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-la-receta-validada-de-imagen.md` | 992 | 13 |
| `cerebro/lecciones/2026-09-02-las-medidas-diagnostican-no-corrigen.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-las-medidas-diagnostican-no-corrigen.md` | 879 | 13 |
| `cerebro/lecciones/2026-09-02-las-referencias-son-del-mismo-producto.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-las-referencias-son-del-mismo-producto.md` | 871 | 13 |
| `cerebro/lecciones/2026-09-02-logos-con-caracter-y-cajas-de-verdad.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-logos-con-caracter-y-cajas-de-verdad.md` | 926 | 13 |
| `cerebro/lecciones/2026-09-02-los-frames-tambien-tienen-puerta.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-los-frames-tambien-tienen-puerta.md` | 686 | 13 |
| `cerebro/lecciones/2026-09-02-los-videos-que-hace-emmanuel-a-mano-no-se-revisan.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-los-videos-que-hace-emmanuel-a-mano-no-se-revisan.md` | 735 | 13 |
| `cerebro/lecciones/2026-09-02-metodo-hibrido-el-hook-va-aparte.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-metodo-hibrido-el-hook-va-aparte.md` | 722 | 13 |
| `cerebro/lecciones/2026-09-02-no-anadir-miradas-a-camara-que-no-pidio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-no-anadir-miradas-a-camara-que-no-pidio.md` | 719 | 13 |
| `cerebro/lecciones/2026-09-02-no-describir-el-rodaje-sino-lo-que-pasa.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-no-describir-el-rodaje-sino-lo-que-pasa.md` | 986 | 13 |
| `cerebro/lecciones/2026-09-02-no-usar-referencias-generadas-por-ia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-no-usar-referencias-generadas-por-ia.md` | 543 | 13 |
| `cerebro/lecciones/2026-09-02-organico-no-publicidad.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-organico-no-publicidad.md` | 812 | 16 |
| `cerebro/lecciones/2026-09-02-realismo-organico-es-plano-no-defectuoso.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-realismo-organico-es-plano-no-defectuoso.md` | 861 | 13 |
| `cerebro/lecciones/2026-09-02-un-asset-que-emmanuel-dice-que-esta-mal-se-bloquea.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-un-asset-que-emmanuel-dice-que-esta-mal-se-bloquea.md` | 628 | 13 |
| `cerebro/lecciones/2026-09-02-un-corte-detectado-no-es-un-clip-hasta-mirarlo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-un-corte-detectado-no-es-un-clip-hasta-mirarlo.md` | 951 | 13 |
| `cerebro/lecciones/2026-09-02-un-frame-de-partida-tambien-es-referencia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-02-un-frame-de-partida-tambien-es-referencia.md` | 829 | 13 |
| `cerebro/lecciones/2026-09-03-app-se-actualiza-sola-tras-cada-lote.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-app-se-actualiza-sola-tras-cada-lote.md` | 1.235 | 13 |
| `cerebro/lecciones/2026-09-03-cada-generacion-es-un-clip-del-concepto.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-cada-generacion-es-un-clip-del-concepto.md` | 856 | 13 |
| `cerebro/lecciones/2026-09-03-del-video-de-referencia-tambien-audio-y-camara.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-del-video-de-referencia-tambien-audio-y-camara.md` | 1.191 | 13 |
| `cerebro/lecciones/2026-09-03-el-mismo-producto-no-lleva-frames-nuevos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-el-mismo-producto-no-lleva-frames-nuevos.md` | 654 | 13 |
| `cerebro/lecciones/2026-09-03-hibrido-siempre-ensenar-los-frames.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-hibrido-siempre-ensenar-los-frames.md` | 672 | 13 |
| `cerebro/lecciones/2026-09-03-kling-el-producto-va-como-elemento.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-kling-el-producto-va-como-elemento.md` | 1.112 | 13 |
| `cerebro/lecciones/2026-09-03-la-tercera-imagen-no-va-nunca.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-la-tercera-imagen-no-va-nunca.md` | 1.139 | 13 |
| `cerebro/lecciones/2026-09-03-la-url-de-un-frame-no-se-construye.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-la-url-de-un-frame-no-se-construye.md` | 884 | 13 |
| `cerebro/lecciones/2026-09-03-lo-que-no-se-ve-se-comprueba-con-la-url.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-lo-que-no-se-ve-se-comprueba-con-la-url.md` | 750 | 13 |
| `cerebro/lecciones/2026-09-03-los-conceptos-se-ven-no-se-descifran.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-los-conceptos-se-ven-no-se-descifran.md` | 966 | 13 |
| `cerebro/lecciones/2026-09-03-no-recorregir-lo-que-el-no-pidio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-no-recorregir-lo-que-el-no-pidio.md` | 998 | 13 |
| `cerebro/lecciones/2026-09-03-si-el-producto-ya-esta-en-el-frame-no-se-adjunta.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-si-el-producto-ya-esta-en-el-frame-no-se-adjunta.md` | 1.418 | 7 |
| `cerebro/lecciones/2026-09-03-un-concepto-de-un-solo-clip-no-es-un-concepto.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-03-un-concepto-de-un-solo-clip-no-es-un-concepto.md` | 1.104 | 13 |
| `cerebro/lecciones/2026-09-04-al-adaptar-el-elemento-es-el-de-la-cuenta-destino.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-al-adaptar-el-elemento-es-el-de-la-cuenta-destino.md` | 914 | 13 |
| `cerebro/lecciones/2026-09-04-al-adaptar-las-personas-son-las-de-la-escena-nueva.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-al-adaptar-las-personas-son-las-de-la-escena-nueva.md` | 737 | 13 |
| `cerebro/lecciones/2026-09-04-al-adaptar-se-copia-el-prompt-del-clip-no-un-nombre.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-al-adaptar-se-copia-el-prompt-del-clip-no-un-nombre.md` | 1.078 | 13 |
| `cerebro/lecciones/2026-09-04-cada-motor-tiene-un-minimo-de-segundos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-cada-motor-tiene-un-minimo-de-segundos.md` | 798 | 13 |
| `cerebro/lecciones/2026-09-04-el-frame-de-un-video-sigue-al-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-el-frame-de-un-video-sigue-al-video.md` | 909 | 13 |
| `cerebro/lecciones/2026-09-04-el-hook-tapia-tambien-las-imagenes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-el-hook-tapia-tambien-las-imagenes.md` | 733 | 13 |
| `cerebro/lecciones/2026-09-04-el-registro-de-conceptos-se-audita-solo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-el-registro-de-conceptos-se-audita-solo.md` | 1.140 | 13 |
| `cerebro/lecciones/2026-09-04-la-lista-negra-tambien-en-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-la-lista-negra-tambien-en-video.md` | 800 | 13 |
| `cerebro/lecciones/2026-09-04-las-marcas-de-la-referencia-no-se-tocan.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-las-marcas-de-la-referencia-no-se-tocan.md` | 792 | 13 |
| `cerebro/lecciones/2026-09-04-solo-se-regenera-el-clip-corregido.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-solo-se-regenera-el-clip-corregido.md` | 793 | 13 |
| `cerebro/lecciones/2026-09-04-traducir-un-idioma-no-es-cambiar-la-palabra.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-traducir-un-idioma-no-es-cambiar-la-palabra.md` | 960 | 13 |
| `cerebro/lecciones/2026-09-04-un-auditor-no-puede-gritar-en-falso.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-un-auditor-no-puede-gritar-en-falso.md` | 961 | 13 |
| `cerebro/lecciones/2026-09-04-un-muro-no-puede-bloquear-lo-que-no-le-toca.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-un-muro-no-puede-bloquear-lo-que-no-le-toca.md` | 1.056 | 13 |
| `cerebro/lecciones/2026-09-04-una-pregunta-suya-no-es-un-encargo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-una-pregunta-suya-no-es-un-encargo.md` | 793 | 13 |
| `cerebro/lecciones/2026-09-04-una-regla-vive-una-vez-contrato.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-una-regla-vive-una-vez-contrato.md` | 779 | 13 |
| `cerebro/lecciones/2026-09-04-verificador-independiente-automatico-en-riesgo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-04-verificador-independiente-automatico-en-riesgo.md` | 712 | 13 |
| `cerebro/lecciones/2026-09-05-un-muro-se-mide-contra-el-dia-del-turno.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-05-un-muro-se-mide-contra-el-dia-del-turno.md` | 895 | 13 |
| `cerebro/lecciones/2026-09-07-c16-mm-pareja-validado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-07-c16-mm-pareja-validado.md` | 1.352 | 23 |
| `cerebro/lecciones/2026-09-07-eiszwilling-c1-visible.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-07-eiszwilling-c1-visible.md` | 692 | 5 |
| `cerebro/lecciones/2026-09-08-creatomate-403-no-demuestra-permisos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-creatomate-403-no-demuestra-permisos.md` | 1.153 | 19 |
| `cerebro/lecciones/2026-09-08-creatomate-tipografia-emojis-y-recepcion-iphone.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-creatomate-tipografia-emojis-y-recepcion-iphone.md` | 1.742 | 23 |
| `cerebro/lecciones/2026-09-08-escala-mano-y-acciones-completas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-escala-mano-y-acciones-completas.md` | 3.026 | 23 |
| `cerebro/lecciones/2026-09-08-logo-higgsfield-y-seedance-contextual.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-logo-higgsfield-y-seedance-contextual.md` | 956 | 14 |
| `cerebro/lecciones/2026-09-08-nombres-navidad-no-forzar-compuestos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-nombres-navidad-no-forzar-compuestos.md` | 1.567 | 21 |
| `cerebro/lecciones/2026-09-08-persona-propia-y-redisenio-visible.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-persona-propia-y-redisenio-visible.md` | 1.834 | 16 |
| `cerebro/lecciones/2026-09-08-revision-editor-avatar-escala.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-08-revision-editor-avatar-escala.md` | 3.862 | 33 |
| `cerebro/lecciones/2026-09-09-la-piel-y-la-luz-se-verifican-no-se-presuponen.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-09-la-piel-y-la-luz-se-verifican-no-se-presuponen.md` | 2.520 | 24 |
| `cerebro/lecciones/2026-09-09-pov-base-buena-sin-retratos-ajenos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-09-pov-base-buena-sin-retratos-ajenos.md` | 1.388 | 20 |
| `cerebro/lecciones/2026-09-10-lote-incompleto-y-lampara-no-juguete.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-10-lote-incompleto-y-lampara-no-juguete.md` | 2.794 | 17 |
| `cerebro/lecciones/2026-09-10-pruebas-selector-replicar.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-10-pruebas-selector-replicar.md` | 1.087 | 17 |
| `cerebro/lecciones/2026-09-11-conservar-no-es-entregar-y-memories-no-es-infalible.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-11-conservar-no-es-entregar-y-memories-no-es-infalible.md` | 2.099 | 19 |
| `cerebro/lecciones/2026-09-11-encuadre-video-y-revision.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-11-encuadre-video-y-revision.md` | 2.742 | 13 |
| `cerebro/lecciones/2026-09-11-fuentes-memories-y-camara.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-11-fuentes-memories-y-camara.md` | 1.764 | 28 |
| `cerebro/lecciones/2026-09-11-primera-ronda-completa-de-frames.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-11-primera-ronda-completa-de-frames.md` | 603 | 10 |
| `cerebro/lecciones/2026-09-11-seedance-caras-y-medidas-rentier.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-11-seedance-caras-y-medidas-rentier.md` | 747 | 12 |
| `cerebro/lecciones/2026-09-12-automatizar-no-es-anadir-formularios.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-automatizar-no-es-anadir-formularios.md` | 1.247 | 20 |
| `cerebro/lecciones/2026-09-12-bloqueo-parcial-no-para-todo-el-lote.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-bloqueo-parcial-no-para-todo-el-lote.md` | 1.917 | 31 |
| `cerebro/lecciones/2026-09-12-creatomate-nombre-y-api.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-creatomate-nombre-y-api.md` | 1.103 | 19 |
| `cerebro/lecciones/2026-09-12-fewshot-real-y-metricas-minimas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-fewshot-real-y-metricas-minimas.md` | 1.362 | 23 |
| `cerebro/lecciones/2026-09-12-genjutsu-no-es-reconstruccion-seedance.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-genjutsu-no-es-reconstruccion-seedance.md` | 849 | 12 |
| `cerebro/lecciones/2026-09-12-genjutsu-resultados-y-audio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-genjutsu-resultados-y-audio.md` | 1.603 | 26 |
| `cerebro/lecciones/2026-09-12-inventario-completo-y-aprobacion-explicita.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-inventario-completo-y-aprobacion-explicita.md` | 1.706 | 27 |
| `cerebro/lecciones/2026-09-12-redisenio-produccion-pausada.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-redisenio-produccion-pausada.md` | 1.374 | 9 |
| `cerebro/lecciones/2026-09-12-regenerar-no-es-reanalizar-y-avatar-opcional.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-regenerar-no-es-reanalizar-y-avatar-opcional.md` | 2.404 | 41 |
| `cerebro/lecciones/2026-09-12-rondas-guardado-y-montaje-implantados.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-12-rondas-guardado-y-montaje-implantados.md` | 2.573 | 43 |
| `cerebro/lecciones/2026-09-13-autorizacion-creditos-sin-preguntas-repetidas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-autorizacion-creditos-sin-preguntas-repetidas.md` | 822 | 13 |
| `cerebro/lecciones/2026-09-13-captura-por-clip.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-captura-por-clip.md` | 1.663 | 11 |
| `cerebro/lecciones/2026-09-13-carpetas-musica-y-alcance-por-clips.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-carpetas-musica-y-alcance-por-clips.md` | 2.189 | 15 |
| `cerebro/lecciones/2026-09-13-edicion-sin-revision-por-concepto.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-edicion-sin-revision-por-concepto.md` | 1.642 | 25 |
| `cerebro/lecciones/2026-09-13-fallos-aislados-en-produccion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-fallos-aislados-en-produccion.md` | 953 | 17 |
| `cerebro/lecciones/2026-09-13-guardar-y-aprobar-textos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-guardar-y-aprobar-textos.md` | 1.610 | 26 |
| `cerebro/lecciones/2026-09-13-ids-edicion-y-montaje-simple.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-ids-edicion-y-montaje-simple.md` | 913 | 15 |
| `cerebro/lecciones/2026-09-13-ocr-cartel-caja-y-emoji.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-ocr-cartel-caja-y-emoji.md` | 2.481 | 44 |
| `cerebro/lecciones/2026-09-13-ocr-etiquetas-y-traduccion-fallida.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-ocr-etiquetas-y-traduccion-fallida.md` | 3.252 | 53 |
| `cerebro/lecciones/2026-09-13-replicar-configuracion-por-enlace.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-replicar-configuracion-por-enlace.md` | 1.685 | 26 |
| `cerebro/lecciones/2026-09-13-retrospectiva-prueba-eiswerk.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-retrospectiva-prueba-eiswerk.md` | 2.378 | 37 |
| `cerebro/lecciones/2026-09-13-seleccion-real-y-estados-textos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-seleccion-real-y-estados-textos.md` | 2.014 | 11 |
| `cerebro/lecciones/2026-09-13-seleccion-visual-conceptos-y-frames.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-seleccion-visual-conceptos-y-frames.md` | 1.608 | 31 |
| `cerebro/lecciones/2026-09-13-selectores-visuales-y-edicion-por-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-selectores-visuales-y-edicion-por-video.md` | 2.070 | 36 |
| `cerebro/lecciones/2026-09-13-texto-se-adapta-al-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-texto-se-adapta-al-video.md` | 1.658 | 26 |
| `cerebro/lecciones/2026-09-13-textos-sin-teclear-y-edicion-revisable.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-textos-sin-teclear-y-edicion-revisable.md` | 1.076 | 17 |
| `cerebro/lecciones/2026-09-13-traduccion-nativa-fiel-aprobada.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-traduccion-nativa-fiel-aprobada.md` | 1.943 | 35 |
| `cerebro/lecciones/2026-09-13-traduccion-organica-codex.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-13-traduccion-organica-codex.md` | 2.837 | 52 |
| `cerebro/lecciones/2026-09-19-consumo-y-aperturas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-19-consumo-y-aperturas.md` | 2.097 | 32 |
| `cerebro/lecciones/2026-09-19-envio-directo-sin-oficina.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-19-envio-directo-sin-oficina.md` | 1.012 | 18 |
| `cerebro/lecciones/2026-09-19-retirar-graphify.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-19-retirar-graphify.md` | 639 | 12 |
| `cerebro/lecciones/2026-09-21-genjutsu-luz-y-fidelidad.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-21-genjutsu-luz-y-fidelidad.md` | 2.370 | 37 |
| `cerebro/lecciones/2026-09-22-genjutsu-fallo-sin-salida.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-22-genjutsu-fallo-sin-salida.md` | 1.089 | 9 |
| `cerebro/lecciones/2026-09-23-nailuna-apertura-asr-inconcluyente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-23-nailuna-apertura-asr-inconcluyente.md` | 1.481 | 24 |
| `cerebro/lecciones/2026-09-28-alta-incompleta-no-es-perdida.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-28-alta-incompleta-no-es-perdida.md` | 1.313 | 21 |
| `cerebro/lecciones/2026-09-29-combinador-visual.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-29-combinador-visual.md` | 749 | 12 |
| `cerebro/lecciones/2026-09-29-estudio-multicuenta.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-29-estudio-multicuenta.md` | 1.160 | 19 |
| `cerebro/lecciones/2026-09-29-genjutsu-frame-inicial-omitido.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-29-genjutsu-frame-inicial-omitido.md` | 834 | 14 |
| `cerebro/lecciones/2026-09-30-acceso-compartido-tunel-retirado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-30-acceso-compartido-tunel-retirado.md` | 1.213 | 19 |
| `cerebro/lecciones/2026-09-30-genjutsu-herencia-apertura.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-30-genjutsu-herencia-apertura.md` | 1.246 | 20 |
| `cerebro/lecciones/2026-09-30-regenerar-sin-selector-metodo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-09-30-regenerar-sin-selector-metodo.md` | 1.199 | 19 |
| `cerebro/lecciones/2026-10-01-escala-zielalarm.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/2026-10-01-escala-zielalarm.md` | 3.345 | 56 |
| `cerebro/lecciones/20260905-editor-referencia-y-localizacion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/20260905-editor-referencia-y-localizacion.md` | 1.488 | 14 |
| `cerebro/lecciones/20260906-adaptacion-cuenta-y-desembalaje.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/20260906-adaptacion-cuenta-y-desembalaje.md` | 1.414 | 12 |
| `cerebro/lecciones/eiszwilling-escala-y-upscale.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/eiszwilling-escala-y-upscale.md` | 1.870 | 27 |
| `cerebro/lecciones/equipo-dos-administradores.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/lecciones/equipo-dos-administradores.md` | 851 | 9 |
| `cerebro/reglas/ARQUITECTURA.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/ARQUITECTURA.md` | 7.438 | 102 |
| `cerebro/reglas/alojamiento-permanente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/alojamiento-permanente.md` | 1.639 | 25 |
| `cerebro/reglas/analisis-directo-sin-memories.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/analisis-directo-sin-memories.md` | 1.167 | 19 |
| `cerebro/reglas/avatares-eleccion-autonoma.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/avatares-eleccion-autonoma.md` | 1.596 | 23 |
| `cerebro/reglas/avatares-numerados.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/avatares-numerados.md` | 2.741 | 43 |
| `cerebro/reglas/biblioteca-musica-y-recortes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/biblioteca-musica-y-recortes.md` | 2.270 | 34 |
| `cerebro/reglas/calidad-de-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/calidad-de-video.md` | 1.115 | 16 |
| `cerebro/reglas/canciones-desde-enlace.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/canciones-desde-enlace.md` | 2.029 | 27 |
| `cerebro/reglas/clips-aprobados-upscale-automatico-20261007.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/clips-aprobados-upscale-automatico-20261007.md` | 1.456 | 24 |
| `cerebro/reglas/colaboracion-critica.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/colaboracion-critica.md` | 3.229 | 49 |
| `cerebro/reglas/como-se-hace-una-imagen-que-vale.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/como-se-hace-una-imagen-que-vale.md` | 5.172 | 82 |
| `cerebro/reglas/controles-video-por-motor.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/controles-video-por-motor.md` | 3.337 | 43 |
| `cerebro/reglas/countdown-apertura.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/countdown-apertura.md` | 1.591 | 26 |
| `cerebro/reglas/criterios-edicion-obligatorios.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/criterios-edicion-obligatorios.md` | 4.505 | 28 |
| `cerebro/reglas/cta-cierre-uniforme.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/cta-cierre-uniforme.md` | 1.586 | 32 |
| `cerebro/reglas/edicion-musica-texto-cta.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/edicion-musica-texto-cta.md` | 2.581 | 37 |
| `cerebro/reglas/filtro-de-verificacion.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/filtro-de-verificacion.md` | 1.559 | 14 |
| `cerebro/reglas/firma-del-iphone-17-pro-max.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/firma-del-iphone-17-pro-max.md` | 2.714 | 40 |
| `cerebro/reglas/firma-medida-de-una-foto-real.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/firma-medida-de-una-foto-real.md` | 2.494 | 51 |
| `cerebro/reglas/foto-principal-web.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/foto-principal-web.md` | 2.366 | 17 |
| `cerebro/reglas/frame-desde-referencia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/frame-desde-referencia.md` | 2.379 | 19 |
| `cerebro/reglas/frame-ideal.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/frame-ideal.md` | 910 | 12 |
| `cerebro/reglas/frame-retry-no-image.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/frame-retry-no-image.md` | 1.459 | 22 |
| `cerebro/reglas/genjutsu-frame-inicial-obligatorio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/genjutsu-frame-inicial-obligatorio.md` | 2.550 | 39 |
| `cerebro/reglas/genjutsu-prueba.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/genjutsu-prueba.md` | 7.169 | 101 |
| `cerebro/reglas/genjutsu-retry-sin-salida.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/genjutsu-retry-sin-salida.md` | 1.729 | 27 |
| `cerebro/reglas/genjutsu-upscale-4k.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/genjutsu-upscale-4k.md` | 3.677 | 51 |
| `cerebro/reglas/globales.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/globales.md` | 1.658 | 23 |
| `cerebro/reglas/integridad-y-pov-amplio.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/integridad-y-pov-amplio.md` | 3.392 | 54 |
| `cerebro/reglas/logos-de-tiendas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/logos-de-tiendas.md` | 1.056 | 13 |
| `cerebro/reglas/lote-ejecucion-sin-espera-plan-completo.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/lote-ejecucion-sin-espera-plan-completo.md` | 1.064 | 11 |
| `cerebro/reglas/lotes-dos-revisiones-editables.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/lotes-dos-revisiones-editables.md` | 2.450 | 30 |
| `cerebro/reglas/no-adelantar-el-reveal.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/no-adelantar-el-reveal.md` | 1.129 | 14 |
| `cerebro/reglas/nombres-producto-nicho.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/nombres-producto-nicho.md` | 1.225 | 8 |
| `cerebro/reglas/nuevo-frame-vs-referencia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/nuevo-frame-vs-referencia.md` | 1.317 | 12 |
| `cerebro/reglas/numeros-del-panel-fijos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/numeros-del-panel-fijos.md` | 1.179 | 14 |
| `cerebro/reglas/oficina-api.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/oficina-api.md` | 3.407 | 53 |
| `cerebro/reglas/organico-no-publicidad.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/organico-no-publicidad.md` | 2.613 | 48 |
| `cerebro/reglas/produccion-compartida-vigente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/produccion-compartida-vigente.md` | 5.668 | 63 |
| `cerebro/reglas/produccion-consumo-acotado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/produccion-consumo-acotado.md` | 2.642 | 43 |
| `cerebro/reglas/produccion-por-rondas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/produccion-por-rondas.md` | 2.698 | 34 |
| `cerebro/reglas/producto-eismeister-es-otra-maquina.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/producto-eismeister-es-otra-maquina.md` | 1.383 | 15 |
| `cerebro/reglas/recuperacion-eficiencia-20260929.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/recuperacion-eficiencia-20260929.md` | 1.704 | 29 |
| `cerebro/reglas/referencia-de-producto.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/referencia-de-producto.md` | 1.528 | 12 |
| `cerebro/reglas/regeneraciones-literales.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/regeneraciones-literales.md` | 1.352 | 22 |
| `cerebro/reglas/reintentos-sin-salida.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/reintentos-sin-salida.md` | 2.045 | 13 |
| `cerebro/reglas/replicar-textos-automaticos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/replicar-textos-automaticos.md` | 4.511 | 73 |
| `cerebro/reglas/revision-clips-por-ronda.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/revision-clips-por-ronda.md` | 1.007 | 16 |
| `cerebro/reglas/revision-original-antes-upscale.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/revision-original-antes-upscale.md` | 745 | 9 |
| `cerebro/reglas/seedance-largo-referencia-contextual.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/seedance-largo-referencia-contextual.md` | 4.059 | 48 |
| `cerebro/reglas/textos-classic-creatomate.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/textos-classic-creatomate.md` | 2.375 | 35 |
| `cerebro/reglas/textos-referencia-independiente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/textos-referencia-independiente.md` | 2.294 | 35 |
| `cerebro/reglas/topaz-default-1080p-20261007.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/topaz-default-1080p-20261007.md` | 759 | 14 |
| `cerebro/reglas/traduccion-organica.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/traduccion-organica.md` | 3.799 | 60 |
| `cerebro/reglas/un-frame-de-partida-tambien-es-referencia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/un-frame-de-partida-tambien-es-referencia.md` | 1.782 | 35 |
| `cerebro/reglas/upscale-bytedance-2026-09-08.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/upscale-bytedance-2026-09-08.md` | 887 | 12 |
| `cerebro/reglas/variante-de-color.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/variante-de-color.md` | 1.129 | 10 |
| `cerebro/reglas/vocabulario-de-imagenes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/reglas/vocabulario-de-imagenes.md` | 2.744 | 52 |
| `cerebro/sistema/afirmaciones-demostradas.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/afirmaciones-demostradas.md` | 997 | 15 |
| `cerebro/sistema/contrato-de-escena.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/contrato-de-escena.md` | 1.181 | 16 |
| `cerebro/sistema/creatomate-edicion-flexible.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/creatomate-edicion-flexible.md` | 4.446 | 72 |
| `cerebro/sistema/creatomate-maquina-helados-api.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/creatomate-maquina-helados-api.md` | 4.209 | 72 |
| `cerebro/sistema/detector-de-deriva.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/detector-de-deriva.md` | 1.054 | 20 |
| `cerebro/sistema/entrega-diaria-automatica.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/entrega-diaria-automatica.md` | 1.244 | 15 |
| `cerebro/sistema/frame-fewshot-corto-hermano.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/frame-fewshot-corto-hermano.md` | 4.653 | 48 |
| `cerebro/sistema/granja-de-videos.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/granja-de-videos.md` | 8.255 | 132 |
| `cerebro/sistema/guardia.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/guardia.md` | 1.615 | 17 |
| `cerebro/sistema/lecciones-aprendizaje-forzado.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/lecciones-aprendizaje-forzado.md` | 1.275 | 18 |
| `cerebro/sistema/lote-visual-configurable.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/lote-visual-configurable.md` | 7.705 | 102 |
| `cerebro/sistema/meta-autonomia-y-aprendizaje.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/meta-autonomia-y-aprendizaje.md` | 3.436 | 63 |
| `cerebro/sistema/muros-no-se-tocan.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/muros-no-se-tocan.md` | 1.151 | 16 |
| `cerebro/sistema/registro-de-ordenes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/registro-de-ordenes.md` | 1.186 | 17 |
| `cerebro/sistema/techos-de-coste.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/techos-de-coste.md` | 1.174 | 12 |
| `cerebro/sistema/trendtrack-alcance-redes.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/trendtrack-alcance-redes.md` | 2.777 | 45 |
| `cerebro/sistema/una-sola-puerta-para-video.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/una-sola-puerta-para-video.md` | 2.018 | 21 |
| `cerebro/sistema/verificador-independiente.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO/sistema/verificador-independiente.md` | 1.765 | 22 |

## 6. raiz — documentos de la raíz del proyecto (`/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/`)

7 ficheros · 115.730 bytes

**No copiado:** `BIBLIOTECA_PROMPTS.md` — 754 729 bytes (≈737 KB), 5281 líneas; demasiado grande, excluido por encargo (solo se consultaron sus metadatos).

| Fichero copiado (relativo a `docs/reglas-origen/`) | Ruta de origen | Bytes | Líneas |
|---|---|---:|---:|
| `raiz/ADAPTACIONES_PROMPT.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/ADAPTACIONES_PROMPT.md` | 16.252 | 167 |
| `raiz/AGENTS.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/AGENTS.md` | 17.342 | 105 |
| `raiz/CONCEPTOS.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CONCEPTOS.md` | 35.307 | 381 |
| `raiz/EDITOR/PROMPT_ANALISIS.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/EDITOR/PROMPT_ANALISIS.md` | 4.114 | 82 |
| `raiz/LOGICA_SISTEMA_NANO_BANANA.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/LOGICA_SISTEMA_NANO_BANANA.md` | 10.637 | 184 |
| `raiz/PROMPT_MAESTRO_NANO_BANANA.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/PROMPT_MAESTRO_NANO_BANANA.md` | 15.446 | 234 |
| `raiz/maestro_fondo_realismo_fewshot_corregido.md` | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/maestro_fondo_realismo_fewshot_corregido.md` | 16.632 | 229 |
