# Decisiones de diseño: base de la plataforma

## Tarea 1: andamiaje

- **`cn` propio.** Se quita el paquete `cn` (como pide el plan) y `src/lib/utils.ts` define `cn` con `clsx` y `tailwind-merge`, que es lo que espera shadcn.
- **Sin fuentes de Google.** `layout.tsx` no usa `next/font/google`: la compilación no depende de la red y la tipografía es la del sistema. Se puede cambiar más adelante.
- **`npm start`.** El script apunta a `scripts/start.ts`, que llega con la tarea de despliegue (el mapa de archivos del plan lo prevé); hasta entonces se usa `npm run dev`.
- **Pruebas como usuario sin privilegios.** PostgreSQL no arranca como `root`: en contenedores donde el usuario es `root`, las pruebas se lanzan con otro usuario.

## Tarea 2: cuentas

- **Papel fijado al crear la cuenta.** Una invitación a un correo que ya tiene cuenta solo cambia la contraseña y el nombre, nunca el papel: así una invitación como colaborador no puede degradar al dueño, ni una de dueño ascender a nadie por esta vía.
- **Enlace de un solo uso, también con peticiones simultáneas.** `acceptInvite` marca la invitación como usada con un `UPDATE … WHERE used_at IS NULL` dentro de la transacción; si dos peticiones llegan a la vez, solo una gana.
- **Cuenta desactivada.** `disabled_at` bloquea `login` y `getSessionUser` (las sesiones existentes dejan de valer en la siguiente petición, sin borrarlas). Un enlace nuevo no reactiva la cuenta.
- **Invitación del dueño al arrancar.** `seed` llama a `ensureOwnerInvite(process.env)`: sin cuentas, con `OWNER_EMAIL` y sin invitación de dueño vigente, crea una y escribe el enlace en el registro. `PUBLIC_URL` da la base del enlace (por defecto `http://localhost:$PORT`).
- **Variable de entorno.** `PRINCIPAL_AUTH=off` desactiva el inicio de sesión solo en local (cualquier otro valor lo mantiene activo); entonces todas las peticiones son de `LOCAL_USER` (dueño, id 0).
- **Pantallas de entrada sin `Button` de shadcn.** Todavía no existe `components/ui`; los formularios usan un `<button>` con las mismas clases hasta que llegue la tarea de la interfaz.
- **`/privacidad` y `/mcp` fuera del `matcher`.** `src/proxy.ts` copia el de Finanzas sin esas dos rutas, que aquí no existen.
