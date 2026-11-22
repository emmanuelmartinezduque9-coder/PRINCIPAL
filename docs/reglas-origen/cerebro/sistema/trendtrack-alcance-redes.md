# Trendtrack: función real para este proyecto

Comprobado el 12 septiembre 2026 en documentación oficial y página API del workspace
de Emmanuel, sin crear claves, cambiar plan ni lanzar consultas de pago.

## Alcance corregido por Emmanuel

Solo vistas y comentarios. No exigir retención, tiempo de reproducción, likes,
compartidos, conversiones ni otras métricas para elegir el conector o empezar.
Conservar ID/URL, cuenta, plataforma y fechas como identificación y contexto, no
como métricas adicionales. Mantener el criterio ganador → regenerar → si vuelve a
funcionar, aplicar pilares. No inventar un umbral de viralidad.

`metrics.comments` en el contrato TikTok consultado es un recuento; no demuestra
acceso al texto de los comentarios. No afirmar que se leen opiniones si solo se
ha recuperado el número. El alcance de comentarios individuales queda por verificar.

- La página API del workspace muestra crédito recurrente incluido en el plan base;
  por tanto no descartar la suscripción existente ni contratar otra a ciegas.
- REST y MCP sirven inteligencia de tiendas, anuncios, marcas y biblioteca TikTok.
- TikTok admite `type=organic`, filtro `handle`, fechas y métricas como views,
  likes, comments, saves y shares. Cobertura limitada a vídeos indexados: NO prometer
  que una cuenta arbitraria o todos sus vídeos estarán disponibles o actualizados.
- La ausencia de estadísticas privadas no descarta la herramienta: el alcance
  pedido ahora es vistas y comentarios, no retención ni average watch time.
- Un buscador de Instagram handle que devuelve una marca/anunciante no equivale a
  una API de Insights de Instagram orgánico.

Conclusión actual: priorizar comprobar Trendtrack, que Emmanuel ya paga, para vistas
y recuento de comentarios de sus TikToks. Probar cobertura/frescura con las cuentas
reales: disponer de esos campos no implica que todos sus vídeos estén indexados.
Instagram y el texto de comentarios no están confirmados. Si falta una cobertura
necesaria, evaluar otra fuente para esa carencia concreta, no contratar una suite
por métricas que no se pidieron. No añadir formularios manuales como solución permanente.

Próximo ensayo, sujeto a autorización de conexión: clave limitada al workspace;
verificar identidad y saldo (rutas sin coste), una consulta pequeña al handle exacto,
comparar IDs/cobertura/fechas con cuenta real. No crear credenciales automáticamente
ni ejecutar consultas que consuman créditos sin un alcance aprobado.

Fuentes:
- https://docs.trendtrack.io/en/docs/reference/api/tiktok
- https://docs.trendtrack.io/en/docs/reference/api-reference
- https://docs.trendtrack.io/en/docs/guides/getting-started
- Página API autenticada del workspace de Emmanuel (lectura del panel de uso).
