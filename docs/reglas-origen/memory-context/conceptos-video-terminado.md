# Vídeo terminado en Conceptos — 18/10/2026

Emmanuel pide ver el vídeo completo, sin separar clips. App local activa:
botón «Ver vídeo terminado» en tarjetas históricas y conceptos publicados.
Un solo diálogo con controles nativos, avance/retroceso; carga al abrir y libera
el vídeo al cerrar. No genera ni concatena archivos.

Resolver `EDITOR/concept_final_preview.py`: enlaza catalog_origin.order/item/owner
con posición y cuenta de la entrega post-edit/delivery-status.json. No adivinar
por nombre ni fecha. Conceptos históricos de un clip admiten entrega final
registrada; multiclip sin montaje completo registrado se muestran no disponibles.
SSD desconectado o archivo ausente: aviso, no sustitución por clip sin editar.
Endpoint autenticado /api/concepts/final, soporte Range del servidor existente.

Instalación con respaldo: code-packages/concept-preview-20261018.
Fuentes: PANEL/concept-final-preview.js, EDITOR/install_concept_preview.py.
Comprobado C104 EisWerk: vídeo completo 12,04 s, 1080 píxeles de ancho,
readyState 4 en navegador. Cerrar elimina reproductor. Dos pruebas unitarias;
sin sesión devuelve 401 y origen de otro propietario se rechaza.
