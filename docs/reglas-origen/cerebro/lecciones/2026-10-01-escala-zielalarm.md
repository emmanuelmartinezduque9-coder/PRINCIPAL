# Revisión de proceso: ZielAlarm, 01/10/2026

Fuente: motor `zielalarm-ganchos-20261001` y recibos de sus jobs. Horas Europe/Madrid.
No se infieren minutos de trabajo humano/LLM a partir de un estado `updated`,
que también cambia al consultar el proveedor.

## Evidencia observada

- Primeros nueve nodos de frames: 18:13. Total 15 nodos de imagen tras seis
  correcciones; incluyen cambios expresamente solicitados por Emmanuel.
- Primeros clips enviados: 20:35. Transcurrieron aproximadamente 142 minutos
  desde crear la primera ronda de frames: incluye generación, revisiones,
  decisiones/correcciones y preparación; no es una medición de 142 min de LLM.
- Envío a archivo local en los ocho clips obtenidos: 2,3–23,0 min.
  No es latencia pura del proveedor: incluye consulta y descarga.
- Pareja: fallo terminal sin salida en original y retry1; no hay tercer intento
  automático autorizado. Ocho resultados no equivalen a nueve entregas.
- Hubo trabajo local evitable: comillas alemanas del countdown no reconocidas,
  derivación de biblioteca no soportada por una rama del expediente, enlace de
  aprobaciones y conflicto de caja en el prompt de checkout.
- Se preparó CapCut tarde; una galería nueva requirió cambios de servidor que
  luego se retiraron. Preferir presentación existente, sin desarrollar UI por lote.
- Hubo consultas repetidas de estado y mensajes sin cambio útil mientras el
  motor local ya estaba recuperando resultados. Evitar consumir LLM en esa espera.

## Cambio de operación para dos productos

| Antes observado | Próximo flujo |
|---|---|
| Preparar vídeo después de revisar imagen | Preparar movimiento, duración, fuentes y CapCut durante frames; ligar frame final al aprobar |
| Improvisar expedientes por gancho | Reusar estructura probada; adaptar contenido del producto, no heredar aprobación de otra cuenta |
| Varias lecturas amplias de estado | Un resumen compacto por lote con jobs y siguiente acción |
| Espera consultada por chat repetidamente | Motor local recupera; el chat trabaja en preparación independiente |
| Nueva galería/infraestructura por lote | Presentación agrupada existente; un fallo se lista aparte |
| Mezclar investigación con producción | Validar ángulos antes de compilar el lote |

## Qué no se elimina

Validación de producto/identidad/acción del frame, aprobación humana, protección
de envíos duplicados y originales CapCut. No compensar un frame incorrecto con
prompts de vídeo contradictorios. No pagar regeneraciones cosméticas autónomas.

## Medición del siguiente ensayo

Registrar por producto: comienzo de preparación, envío de cada frame,
archivo disponible, aprobación, envío de clip, archivo disponible y proyecto
preparado. Contar correcciones, consultas de LLM y fallos de proveedor por separado.
Comparar tiempo aprobación→envío y tasa de frames conservados al primer intento.
Objetivo: reducir retrabajo y preparación, no prometer un porcentaje aún no medido.

## Evolución de producto

Regla permanente: `.cursor/rules/produccion-escalable-angulos-mercados.mdc`.
Ángulo = público/situación/motivación; hook = estructura de apertura. Adaptar
uno no exige reinventar el otro. Guardar país, ángulo validado, hook y variante
en la trazabilidad; mantener controles para comparar sin atribuir ventas a vistas.
