# Acceso compartido: proceso abierto no significa enlace disponible

El 30/09/2026 el enlace de Sebastián dejó de resolver. El panel local y el
gateway seguían respondiendo, pero cloudflared repetía «Unauthorized: Tunnel not
found». El publicador devolvía el enlace antiguo porque solo miraba sus PID.

Corrección en `EDITOR/shared_publish.py`: comprobar HTTPS y contenido del espacio
compartido antes de anunciarlo como listo. Reutilizar conexiones sanas. Recuperar
solo el conector retirado explícitamente por Cloudflare; preservar su registro,
no reiniciar la app ni el chat, y no duplicar estados inciertos. Bloqueo de archivo
para impedir dos arranques simultáneos. Estado real y enlace anterior conservados.

Si el resolver local conserva una respuesta DNS negativa, la comprobación puede
usar DNS público y HTTPS con el mismo host y certificado, sin cambiar DNS/VPN ni
desactivar TLS. Esta prueba no confirma la conectividad del ordenador del hermano.

Pruebas: `python3 -m unittest discover -s EDITOR -p test_shared_publish.py`.
Los enlaces trycloudflare siguen siendo temporales. Esta reparación no crea un
dominio permanente ni un supervisor automático; no prometer estabilidad ilimitada.
