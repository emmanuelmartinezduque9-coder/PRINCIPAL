# Referencia de producto — qué imagen se pasa (y cuál no)

Una referencia de producto es una **imagen DE PRODUCTO**. **Prohibido pasar un frame entero**: arrastra a la generación todo su escenario. Error real (2026-08-31): pasé el frame del dormitorio de [[cuentas/EisMeister]] "para que viera bien la máquina" en un frame de cocina — y con él la manta, la TV, las luces de hadas y la ropa de aquella escena.

- Producto en manos reales → **se RECORTA el producto y se sube el recorte**. Ya existe: `EISMEISTER › producto_en_mano` en `EDITOR/assets.json`.
- **No se pasa referencia de algo que NO SE VA A VER.** Si el producto va tapado por la tela todo el clip, su mockup no aporta nada y empuja al modelo a dibujarlo. En ese caso **basta con la CAJA**: es la que da la forma del bulto bajo la tela. Ver [[lecciones/2026-09-01-referencia-de-producto-tapado]] y [[reglas/no-adelantar-el-reveal]].
- Cuando el producto SÍ se ve, la caja/producto de la cuenta va **SIEMPRE como 2ª referencia** al crear el frame — sin ella el producto sale aproximado ([[reglas/frame-desde-referencia]], [[flujo/pipeline-manana]]).
- Las imágenes van **por NOMBRE desde `EDITOR/assets.json`** (que declara el papel: mockup/producto/caja/avatar/logo/reference element), jamás por id. Un frame del panel NO puede ir de imgcomplemento.

Caso especial: [[reglas/producto-eismeister-es-otra-maquina]].

Aplicada por: EDITOR/lanzar.py (vídeo). Ojo: la generación de FRAMES aún no tiene puerta — es el siguiente agujero a tapar.
