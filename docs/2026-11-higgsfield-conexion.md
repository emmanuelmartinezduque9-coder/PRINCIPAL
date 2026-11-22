# Conexión de Higgsfield: hechos comprobados y prueba con el dueño

Informe de la Tarea 1 del plan 2 (producción de vídeo). La primera parte son hechos ya
comprobados; la segunda se rellena en la prueba con el dueño en la web publicada.

## Hechos comprobados (22/11/2026, desde el Mac del dueño)

**Recurso protegido** (`https://mcp.higgsfield.ai/.well-known/oauth-protected-resource`):

- `resource`: `https://mcp.higgsfield.ai/mcp`
- servidor de permisos: `https://higgsfield.ai/_clerk`
- permisos: `openid email offline_access`
- el token va en la cabecera (`Authorization: Bearer`)
- el documento lista «potential_clients» (anthropic, claude, …) como pistas. **No se sabe** si
  Higgsfield acepta llamadas de herramientas de una aplicación propia: es lo que decide la prueba.

**Servidor de permisos** (`https://higgsfield.ai/_clerk/.well-known/oauth-authorization-server`):

- `authorization_endpoint`: `https://higgsfield.ai/_clerk/oauth/authorize`
- `token_endpoint`: `https://higgsfield.ai/_clerk/oauth/token`
- `revocation_endpoint`: `https://higgsfield.ai/_clerk/oauth/token/revoke`
- `registration_endpoint`: `https://higgsfield.ai/_clerk/oauth/register`. El **alta dinámica
  funciona** para un cliente público propio: un POST con `client_name`, `redirect_uris`,
  `grant_types` [`authorization_code`, `refresh_token`], `response_types` [`code`] y
  `token_endpoint_auth_method: none` devolvió un `client_id`.
- PKCE `S256`; `client_id_metadata_document_supported: true` (CIMD); también ofrece el flujo de
  código de dispositivo (no se usa).

**Cómo lo usa PRINCIPAL** (detalle en `docs/decisiones-produccion-de-video.md`, Tarea 1):

- Dirección de vuelta: `<PUBLIC_URL>/api/higgsfield/callback` (en producción,
  `https://principal-production-6265bcf2.up.railway.app/api/higgsfield/callback`).
- Alta dinámica una vez (cliente `PRINCIPAL`), guardada cifrada; con
  `PRINCIPAL_HIGGSFIELD_CLIENT=cimd`, `client_id` = `<PUBLIC_URL>/api/higgsfield/cliente`.
- `resource=https://mcp.higgsfield.ai/mcp` en el permiso y en cada petición de token.
- Cliente MCP: `@modelcontextprotocol/client` 2.4.0, HTTP en flujo, token por cabecera.

## Pendiente de la prueba con el dueño

Se rellena tras la PUERTA (pasos 7–8 de la Tarea 1). Para cada punto: respuesta, evidencia
(captura, texto del diagnóstico o línea del registro) y fecha.

1. **¿Puede una aplicación propia conectar?** ¿El alta dinámica y la autorización terminan en
   «Conectado como…»? Si no, el error literal (`motivo=` en la dirección de Ajustes y la línea
   `[higgsfield]` del registro de Railway).
2. **¿Puede llamar herramientas?** ¿Aparecen los créditos? Si sale «Tu conexión con Higgsfield
   ha caducado» justo después de conectar y el registro dice `El servidor MCP rechazó también el
   token renovado`, Higgsfield no acepta llamadas de herramientas de este cliente.
3. **Alta dinámica frente a CIMD:** resultado de cada una (la CIMD es la que sobrevive al
   31/12/2026 si Higgsfield retira el alta dinámica).
4. **Permisos concedidos** (`connection.scope` del diagnóstico).
5. **`expires_in` declarado** (diferencia entre `connection.expiresAt` y `connection.connectedAt`).
6. **¿Hay token de refresco?** (`connection.hasRefreshToken`). Si no lo hay, probar a añadir
   `prompt=consent` a la petición de permiso (algunos servidores OIDC solo dan `offline_access`
   con él).
7. **¿Refrescar funciona?** (filas de `higgsfield_probe_log` con `refreshed = true` y `ok = true`).
8. **Duración observada del permiso** (`higgsfield_probe_log`; se completa a los 7 días).
9. **Lista de herramientas visibles** (`tools` del diagnóstico).
10. **Forma real de `balance`** (campo `balance` del diagnóstico): sustituir
    `tests/fixtures/higgsfield/balance.json` por la captura con `"_origen": "real 2026-…"` y
    ajustar `readBalance` en `src/connectors/higgsfield/adapter.ts` si hace falta.
11. **Presupuestos y `show_generations`:** el diagnóstico de esta tarea **solo** llama a
    `balance` (orden de no gastar). Si el coordinador confirma que `estimate_image_cost`,
    `estimate_video_cost` y `show_generations` son de solo lectura, se añaden a
    `DIAGNOSTIC_TOOLS` y se captura su forma (¿`show_generations` trae `params.prompt`?).
