# Editor: referencia, idioma y navegación

Relacionada con [[reglas/globales]] y [[reglas/filtro-de-verificacion]].

- No confundir **captions de postproducción** solicitados con la regla de **no overlays en generación**: en el editor sí se reconstruyen captions cuando Emmanuel lo pide.
- Idioma lo determina la cuenta destino; texto fuente permanece como auditoría, no debe salir sin traducir por fallo técnico. Traducir toda la secuencia con contexto entre líneas sin inventar beneficios.
- Guardar traducciones por contenido/idioma para evitar consumo duplicado. El proveedor conectado hoy es Claude Code, con herramientas y MCP deshabilitados y sin historial de proyecto.
- OCR da cajas y texto, no garantiza fuente exacta. Comparar fuentes locales con recorte real y NO estirar letras para llenar una caja. Declarar aproximación y revisar el resultado visual.
- Una duración desconocida de Instagram no significa vídeo largo. Descargar con límites y medir duración real; probar el enlace exacto que falló.
- Navegación debe persistir hash + pestaña; un #editor viejo no debe anular una operación en Frames.
- Quitar errores = ocultar recuperablemente, nunca borrar archivos de entregas.
- Edición puntual de rostro: no añadir retrato frontal como si fuera iluminación de escena. Si la revisión sigue suspendiendo integración, no más regeneraciones automáticas: informar y pedir decisión.

Implementación y pruebas: EDITOR/autoedit/VERIFICACION_20260905.md.
