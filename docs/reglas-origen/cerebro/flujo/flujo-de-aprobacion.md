# Flujo de aprobación de frames y conceptos

- Mientras Emmanuel NO diga exactamente **"esta imagen está bien"**, toda regeneración es **iteración del mismo frame** (no cuenta como frame nuevo). Esa frase exacta fija la última imagen como frame aprobado y el contador avanza → actualizar registro.
- **"usa la imagen N con el prompt [NOMBRE]"** → usar ese job como start_image, sin preguntar.
- Si al pedir regenerar pasa una imagen nueva, esa imagen **REEMPLAZA** el frame anterior; si no pasa imagen, se usa el último frame guardado.
- **"guarda este video como CONCEPTO# de la cuenta X"** → registrar el concepto completo (clips: frame + prompt + config + orden). **"regenera el CONCEPTO#"** → leer registro y relanzar todos los clips en orden (con variación si la nombra).
- **Paralelo:** todo lo que no dependa de un frame en aprobación pendiente se lanza en paralelo sin esperar.
- **Modo lote:** el orden vigente completo vive en `.cursor/rules/lotes-frames-completos.mdc` (2026-09-11), común a Replicar y adaptaciones. La aprobación en bloque sigue siendo obligatoria para frames nuevos; los aprobados pasan a clips mientras se corrigen los rechazados.
- **Guardado automático de concepto:** cuando Emmanuel dice que los clips están listos, guardar el concepto solo, con los clips en el orden generado, sin que él los dicte. Los clips pueden reusarse de otros conceptos. Descargar los vídeos a su carpeta + copia a la entrega diaria + actualizar registro.
- Antes de enviarle CUALQUIER imagen: [[reglas/filtro-de-verificacion]]. Porqué: enviar algo que no cumple lo pedido le hace perder tiempo y dinero.

Relacionado: [[flujo/generacion-de-clips]], [[flujo/subida-de-imagenes-por-la-manana]], [[reglas/globales]].
