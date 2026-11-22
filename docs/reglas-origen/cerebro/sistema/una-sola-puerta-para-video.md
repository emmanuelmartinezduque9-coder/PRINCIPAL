# Una sola puerta para generar vídeo

**Está PROHIBIDO llamar a `higgsfield generate create` de vídeo a mano.** La única vía es `EDITOR/lanzar.py`:

- `python3 EDITOR/lanzar.py plan EDITOR/lotes/<lote>.json` → tabla de comprobación, NO genera. **Siempre enseñársela a Emmanuel antes de generar**: se ve de dónde sale cada prompt, su primera línea, qué frame, qué imágenes con qué papel, motor y segundos.
- `python3 EDITOR/lanzar.py generar EDITOR/lotes/<lote>.json` → valida, genera y registra solo.

Lo que **para en seco** (nada se genera si falla uno):
1. Notas dentro del prompt (líneas `>`, títulos markdown, «Emmanuel», «Copiar LITERAL», «Origen:»…) — causa del desastre del 31 ago, venía saliendo desde el 27 → [[lecciones/2026-08-31-notas-en-prompt]].
2. Prompt sin origen declarado (`biblioteca` / `guardado` / `nuevo`+`guardar_como`). Un prompt a mano no se envía si no queda guardado. Nunca se inventa en silencio.
3. Imágenes por NOMBRE, jamás por id — salen de `EDITOR/assets.json` con su papel (mockup/producto/caja/avatar/logo). Un frame del panel NO puede ir de imgcomplemento.
4. Frame ≠ imagen de referencia.
5. Clip sin producto adjunto sin declarar `"sin_producto": "<motivo>"`.
6. Clip con habla sin el idioma de la cuenta ([[cuentas/EisWerk]]/[[cuentas/EisMeister]] → alemán, [[cuentas/Gelatovivo]] → italiano).
7. Cuenta retirada, motor desconocido, duración sobre el tope.

Además coteja el [[sistema/contrato-de-escena]], lee las notas de cuenta del CEREBRO y al terminar **registra solo** (prompt exacto incluido) y llama a la [[sistema/entrega-diaria-automatica]].

**Por qué**: existían DOS caminos (script que valida y CLI que no); cuando el script no encajaba se tiraba de CLI y se saltaban todas las comprobaciones. Si un caso no encaja en `lanzar.py`, **se amplía `lanzar.py`, no se rodea** — ver [[sistema/muros-no-se-tocan]]. El bloqueo mecánico lo pone el [[sistema/guardia]].

Aplicada por: EDITOR/lanzar.py + EDITOR/guardia.py
