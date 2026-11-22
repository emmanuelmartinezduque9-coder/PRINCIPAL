# Genjutsu: resultado real, prompt reescrito y audio

Evidencia: `EDITOR/lotes/tanda_20260912/galeria_cinco_recibo.json`,
`genjutsu_capacidades_final.json` y QA de los cuatro jobs allí identificados.

El proveedor completó los cuatro Genjutsu de esta tanda. El campo `prompt`
conserva literalmente lo enviado, pero aparece también un `enhanced_prompt`
distinto, redactado por el proveedor. Conservar ambos en los recibos: comprobar
solo `prompt` prueba el envío, no que el texto interno sea idéntico.

Los cuatro recibos completos contienen `generate_audio:false`. El catálogo
actual de `hf_mult_replace_object` solo expone resolución como parámetro,
sin selector documentado de doblaje o regeneración de audio. Esto no prueba
que toda futura versión sea incapaz; sí impide prometer traducción por escribir
«German» en el prompt. No inventar parámetros ni volver a gastar para probarlos.

Ruf015 (`21789e77-bfba-4f62-af2b-c1efd104db44`) conservó texto inglés superpuesto
visible. Su ASR de resultado, vinculado al SHA del MP4, devuelve conversación
en inglés. Es evidencia derivada, no escucha humana. Producto y entorno
parcialmente editados no constituyen cumplimiento completo. Para cambiar de
motor o incorporar doblaje hay que explicarlo y resolver la elección del usuario.

Genjutsu no necesita Memories Q&A detallado como paso previo. Estos fallos de
resultado no justifican reinstaurar esa dependencia ni falsear un análisis.
La comprobación posterior debe señalar cambios concretos omitidos, no aprobar
porque figuren en un prompt o porque el proveedor diga `completed`.
