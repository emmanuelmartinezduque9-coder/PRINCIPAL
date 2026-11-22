# Traducción orgánica real, no «tono comercial»

## Corrección de Emmanuel

Emmanuel hace dropshipping orgánico. Añadir «tono comercial» al contrato de
traducción fue una suposición mía, no su instrucción. El texto debe conservar
el sentido, gancho y registro del original; no añadir venta, CTA ni beneficios.
Una CTA ya presente sí se conserva. Traducción no equivale a aplicar pilares.

## Causa y cambio ejecutable

Apple Translation falló con el hook real aunque sus idiomas estaban instalados.
La petición posterior fue usar la cuenta de Codex existente. `reference_texts/worker.py`
llama ahora a `codex_translation.py`, que carga literalmente
[[traduccion-organica]]. El hash de esa regla forma parte de la caché: cambiar
el criterio invalida las traducciones futuras sin reescribir snapshots guardados.
También se eliminó el criterio «persuasive» del localizador legado de autoedit.

No se controla el navegador, no se manda el vídeo y no se carga el chat/proyecto.
Sesión efímera de App Server, herramientas y conectores desactivados, modelo
predeterminado verificado, esfuerzo low, autenticación ChatGPT obligatoria,
sin API key/fallback. Se envían únicamente bloques y reglas de traducción.
Consume el uso compartido de Codex; no se vende como ilimitado ni gratuito.

## Persistencia y errores

- Copiar no llama al modelo; traducciones idénticas se recuperan de caché.
- El diario se escribe antes del envío. Tras desconexión incierta no se reenvía
  automáticamente. Solo confirmación explícita en la app permite otro intento.
- Límites agotados: espera durable y reanudación al restablecerse. No pagar
  API alternativa, comprar créditos ni canjear un reset.
- Original sin traducir: estado pendiente, no «Traducido». Guardar/planificar
  sigue bloqueado hasta obtener resultado válido.

## Evidencia real

`EDITOR/traduccion_codex_20260913/` conserva antes/después, traducción, activación,
prueba del navegador y verificador. Referencia `DdAvbTMNhSZ`: dos bloques en alemán,
mismos intervalos 0–8,5 y 8,75–15,666667; TARGET preservado, sin CTA añadida.
Reintento por el worker usó caché; no repitió la llamada al modelo. Pruebas
unitarias cubren límites, desconexión, caché concurrente, contratos y aislamiento.

El primer intento técnico fue rechazado por un campo de sandbox obsoleto
(`readOnly.access`) antes de inferencia; se corrigió usando el contrato admitido
por el binario. No se ocultó como un resultado de traducción.

## Límites honestos

Validar IDs, números, nombres y repeticiones no certifica semántica ni naturalidad
universal. Se mantiene la primera revisión de la plantilla; no cada regeneración.
OCR todavía puede omitir emojis: el traductor no inventa los ausentes. No se ha
exportado ni generado un vídeo durante esta corrección.
