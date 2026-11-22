# ARQUITECTURA — rediseño del 2026-09-04

> Emmanuel: «haz un rediseño completo de lógica de todo el sistema, levanta muros donde
> falta, monta verificadores independientes, revisa el chat y todas las correcciones que te
> haya hecho, tapia para siempre… como si una empresa necesitara rediseñar todas las fugas».
>
> Método: se sacaron del chat **182 mensajes suyos**, de ellos **114 correcciones distintas**,
> agrupadas en **14 clases de fallo**. Cada clase tiene ahora un muro mecánico, o está
> marcada como HUECO. Las **5 fugas estructurales** encontradas se cerraron.

---

## 1. Principio: UNA regla vive UNA vez

La causa raíz de «errores de inicio» no era falta de reglas: era que **la misma regla vivía
escrita dos veces** (una en `lanzar.py` para vídeo, otra en `frame.py` para imagen) y las dos
copias se separaban. La lista negra solo estaba en imagen; la tercera imagen solo en vídeo;
los elementos ajenos solo en vídeo. Cada corrección tapaba una puerta y dejaba la otra.

**Ahora:** `EDITOR/contrato.py` contiene cada comprobación compartida una sola vez, y las dos
puertas la llaman. Ampliar el contrato amplía las dos puertas a la vez.

```
                 EDITOR/contrato.py   ← la regla, una vez
                    ↑            ↑
      EDITOR/frame.py        EDITOR/lanzar.py
      (imágenes)             (vídeo)
            ↓                      ↓
        Higgsfield  ←── EDITOR/guardia.py (hook: NADA pasa por otra vía)
```

## 2. Las tres puertas y qué tapia cada una

| Puerta | Qué es | Solo deja pasar |
|---|---|---|
| `guardia.py` (hook PreToolUse Bash) | La verja exterior | vídeo **solo** vía `lanzar.py`; imagen **solo** vía `frame.py`. Cualquier `higgsfield generate create` a mano se bloquea (imagen y vídeo). |
| `frame.py` | Puerta de imágenes | frame con referencia declarada, qué se ve, marcas de la referencia, escena del vídeo (si viene de Mañana), sin overlay, prosa, 2 intentos máximo, frame+mockup (nunca una tercera imagen) |
| `lanzar.py` | Puerta de vídeo | prompt con origen (biblioteca / guardado / copiado del clip de origen), frame aprobado por Emmanuel, **palabras literales de Emmanuel** en `pedido`, elementos de la cuenta, kling con elemento, escena y personas declaradas, idioma de la cuenta, un clip por corrección |

Y el hook **Stop** no deja cerrar el turno con: app desfasada · corrección sin lección ·
muro tocado sin contarlo · afirmación sin demostrar · orden sin resolver · **concepto roto**
(sin prompt / sin frame / id cortado / frame de otra cuenta) · **concepto de un solo clip**.

## 3. Las 14 clases de fallo del chat → su muro

| # | Clase (nº correcciones) | Muro mecánico | Dónde |
|---|---|---|---|
| 1 | Gasto sin permiso (16) | cada clip lleva las **palabras literales** de Emmanuel en `pedido`; sin cita no genera. Un lote no toca >1 clip del mismo concepto sin motivo declarado | `lanzar.py` |
| 2 | Olvidar órdenes (13) | tabla de órdenes con riesgo al inicio; Stop no cierra con órdenes pendientes | `ordenes.py` + hook |
| 3 | Imágenes adjuntas mal (11) | solo frame + mockup (+ embalaje si sale la caja); `articulo_en_mano` rechazado; producto tapado ⇒ sin foto | `contrato.que_se_ve` |
| 4 | Conceptos incompletos (8) | auditor de conceptos + un-solo-clip; **visible en la app** en rojo | `auditar_conceptos.py`, `conceptos_completos.py`, panel |
| 5 | Análisis de vídeo (8) | frame de Mañana exige `analisis_escena`; audio y cámara se leen antes del prompt | `frame.py` (`_escena_del_fotograma`) |
| 6 | App no actualizada (7) | `frame.py` y `entregar.py` refrescan la app solos; Stop no cierra con app desfasada | `entregar.actualizar_panel`, `panel.py` |
| 7 | Realismo / calidad (7) | lista negra + prosa + sin overlay, ahora en el contrato (imagen **y** vídeo) | `contrato.prompt_limpio` |
| 8 | Escena / personas mal (7) | contrato de escena: personas, lugar, objeto, **personas_son / no_pueden_quedar** | `contrato.escena` |
| 9 | Frame equivocado (6) | ids completos obligatorios; catálogo acumulativo (un frame no desaparece); retag alcanza a los viejos | `lanzar.registrar`, `generate_panel.py` |
| 10 | Prompt inventado / alterado (5) | `copiar_de` trae el texto exacto del clip de origen; biblioteca literal; notas bloqueadas | `lanzar.py`, `contrato.prompt_limpio` |
| 11 | Idioma / cuenta (4) | idioma **deducido del CEREBRO** (no de listas a mano); mismo producto ⇒ sin frames nuevos | `lanzar.adaptar_idioma`, `adaptar.py` |
| 12 | Afirmar sin verificar (3) | toda afirmación de estado lleva comando + salida esperada | `afirmaciones.py` + hook |
| 13 | Reveal / tapado (3) | producto oculto ⇒ no se adjunta; `sin_producto` con motivo | `contrato.que_se_ve` |
| 14 | Decidir por encima (1+) | marcas de la referencia se conservan (`marcas` obligatorio); nada se cambia sin su petición | `contrato.marcas_de_la_referencia` |

## 4. Las 5 fugas estructurales cerradas hoy

1. **`generar.py`** era una segunda vía a Higgsfield con la marca de la puerta (`NANO_PUERTA=1`):
   se saltaba TODOS los muros de `lanzar.py`. → Retirado: ahora aborta y señala a `lanzar.py`.
2. **El hook dejaba generar imágenes a mano** («imágenes y demás pasan»). → Bloqueado: solo `frame.py`.
3. **`esperar()` estaba definida dos veces** en `lanzar.py`. → Una sola.
4. **La lógica de «qué se ve» vivía duplicada** y desincronizada. → `contrato.py`.
5. **Un muro mío bloqueaba TODO el registro** por datos viejos de una cuenta retirada, y las
   escrituras fallaban en silencio (por eso «el frame no se actualizaba»). → Solo se comprueba
   lo que se escribe; y **nunca** una comprobación bloquea lo que no le toca.

## 5. Verificador independiente (automático, no opcional)

Antes `verificar.py` existía pero **ninguna puerta lo exigía**. Ahora `frame.py` abre un
dossier de verificación **solo** en los casos de riesgo que definió Emmanuel (cuesta ~110k
tokens por frame, no se gasta en frames rutinarios):
- el frame es el **segundo intento** (Emmanuel ya rechazó el primero),
- el frame **adapta un producto a otra cuenta** (`adaptado_de` con producto distinto).

Mientras el dossier esté abierto, el hook **bloquea enseñar imágenes** a Emmanuel. Se cierra
con el veredicto de un subagente (`haiku`) que mira la imagen, no el prompt.

## 6. Lo que sigue siendo un HUECO (dicho, no escondido)

- **Un auditor no puede mirar dentro de la imagen.** Que el frame «tenga sentido con el vídeo»
  se comprueba por texto (escena declarada ↔ prompt). Lo visual solo lo ve el verificador
  independiente, y solo en casos de riesgo.
- **Los clips anteriores al archivado** (EisWerk C2/C4/C5/C6/C7, GelatoVivo C4/C5) no tienen
  prompt ni frame en ningún sitio: no se pueden regenerar. Están marcados en la app.
- **La comprobación frame-vs-vídeo** (`frame_real_del_clip.py`) da falsos positivos porque
  Seedance reencuadra: es diagnóstico manual, no muro.

## 7. Regla de oro para cualquier muro nuevo

1. Comprueba **solo lo que se está haciendo ahora**, nunca el histórico entero.
2. **Verifica contra la fuente** antes de acusar (CDN, ficha, vídeo). Un muro que grita en
   falso se acaba ignorando.
3. Vive **una vez**, en `contrato.py` si sirve a más de una puerta.
4. Se **prueba contra el caso que lo motivó** antes de darlo por puesto.
5. Si bloquea, se arregla **mi trabajo**, no el muro. Tocarlo se cuenta (`muros.py`).
