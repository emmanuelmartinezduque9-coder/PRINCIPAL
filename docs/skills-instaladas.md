# Skills de Claude: que se ha instalado y que no

Revision hecha el 2026-11-22 sobre los cinco repositorios recomendados en el video. Se leyeron los
archivos reales de cada uno (sin ejecutar nada de ellos). Una "skill" es, en esencia, una carpeta con
instrucciones en texto que Claude lee cuando hace falta. Eso es seguro. Lo que hay que vigilar es
cuando un paquete trae ademas programas que se ejecutan solos, servicios en segundo plano o envio de
datos a terceros.

## Resumen rapido

| Herramienta | Que hace | Estado |
|---|---|---|
| superpowers | Metodos de trabajo (planificar, depurar, probar) | Ya instalada |
| impeccable | Criterio de diseno para que la web no se vea mal | Instalada (solo las instrucciones) |
| find-skills | Ayuda a buscar mas skills | Instalada (con una advertencia) |
| task-observer | Anota correcciones para mejorar skills | No instalada |
| claude-mem | Memoria entre sesiones | No instalada |

Las skills instaladas estan en `/home/user/principal/.claude/skills/`. Cada carpeta lleva su licencia
y un archivo `ORIGEN.md` con la direccion del repositorio y la version exacta (commit).

## 1. superpowers: ya instalada

Conjunto de metodos de trabajo (planificar antes de programar, depurar con orden, pedir revision,
verificar antes de dar algo por terminado). Ya esta disponible en este entorno; no se ha tocado nada.

## 2. impeccable (diseno de interfaces): instalada

**Que es.** Una skill de diseno frontend de Paul Bakaus. Da a Claude un criterio de diseno: jerarquia,
tipografia, espaciado, color, contraste, movimiento, estados vacios, version movil. Incluye comandos
como `critique` (revision de diseno), `audit` (accesibilidad y rendimiento), `polish` (pulido final),
`layout`, `typeset`, `adapt` (adaptar a movil), `clarify` (mejorar los textos), etc. Es la mas
relevante para tu queja de que la web anterior se veia mal.

**Que se instalo.** `/home/user/principal/.claude/skills/impeccable/`: el `SKILL.md`, la carpeta
`reference/` (unos 50 archivos de texto con las guias de cada comando), la licencia (Apache 2.0) y el
aviso de terceros (`NOTICE.md`).

**Que se dejo fuera y por que.**
- La carpeta `scripts/` y un lanzador llamado `impeccable`. El lanzador, si no encuentra su programa,
  **descarga un binario desde GitHub** (`github.com/pbakaus/impeccable/releases`) y lo ejecuta. Tiene
  comprobacion de huella (sha256), pero sigue siendo un programa externo que no se ha revisado, asi
  que no se instala.
- Los hooks (`plugin/hooks/hooks.json`): se ejecutarian al iniciar sesion, tras cada edicion de
  archivos y al terminar cada turno. Sin el programa no hacen nada, y no se copian.
- Los 5 agentes auxiliares (`plugin/agents/`), la extension de navegador y el resto del repositorio.

**Efecto de lo que falta.** La skill funciona como guia de diseno en texto. Su propio `SKILL.md`
preve el caso "lanzador no disponible" y manda leer `PRODUCT.md` y `DESIGN.md` directamente. No
funcionaran: las capturas automaticas (`shot`), el detector automatico de errores de diseno, el modo
`live` (elegir elementos en el navegador) y `generate`. Para ver el resultado hay que usar las
herramientas de captura que ya tenga el proyecto.

**Riesgos y avisos.**
- Los archivos `reference/live-setup.md` y `reference/hooks.md` describen cambios que tocarian la
  configuracion del proyecto (politica de seguridad de contenido en `next.config`, hooks en
  `.claude/settings.local.json`). Solo aplican si se pide `live` o `hooks`; no se usaran sin tu
  aprobacion.
- `reference/init.md` indica pedir al usuario que ejecute `npx impeccable login` (cuenta gratuita en
  su servicio). Solo se dispara si el programa que no instalamos lo imprime; si aparece, ignorarlo.
- No se encontraron instrucciones sospechosas ni envio de datos en los textos revisados.
- Licencia Apache 2.0: uso libre, conservando la licencia (ya incluida).

## 3. find-skills (buscador de skills): instalada, con advertencia

**Que es.** Una skill de Vercel de un solo archivo (`SKILL.md`, licencia MIT). Cuando se le pregunta
"existe una skill para X?", enseña a Claude a buscar en el catalogo skills.sh usando la herramienta
`npx skills`.

**Que se instalo.** `/home/user/principal/.claude/skills/find-skills/` con `SKILL.md`, `LICENSE` y
`ORIGEN.md`. No se copio la herramienta de linea de comandos (el repositorio `vercel-labs/skills`
completo), solo la skill.

**Riesgos que debes conocer.**
- El texto sugiere instalar skills con `npx skills add <paquete> -g -y`: eso instala en tu cuenta
  (`-g`, global) y sin pedir confirmacion (`-y`). Es justo la forma de instalar codigo de terceros que
  esta revision intenta evitar. **Regla para este proyecto: Claude nunca instala una skill nueva sin
  tu permiso expreso, aunque esta skill lo sugiera.**
- La herramienta `npx skills add` envia telemetria de instalacion (se ve en `src/add.ts` y
  `src/telemetry.ts` del repositorio). Otra razon para no usarla sin preguntarte.
- La propia skill recomienda desconfiar de skills con pocas instalaciones o de autores desconocidos;
  es un buen criterio y conviene aplicarlo.

## 4. task-observer (repositorio "one-skill-to-rule-them-all"): NO instalada

**Que es.** Una skill grande (autor Eoghan Henn, licencia CC-BY-4.0) que observa tus sesiones, anota
correcciones y repeticiones en un registro y propone mejoras a otras skills.

**Por que no se instalo.**
- Pide invocarse **antes de la primera accion de cada sesion** y ejecutar un script de arranque
  (`scripts/session-start-scan.sh`, unos 58 KB de shell) y otros ocho scripts mas un validador en
  Python de 230 KB. No es una skill de "solo texto": depende de codigo que habria que auditar entero.
- Esta pensada para activarse con hooks de inicio de sesion y para escribir un registro persistente
  en una carpeta del usuario. Este proyecto corre en un contenedor efimero y ya guarda sus decisiones
  en `docs/` (regla del proyecto) y en tu Obsidian; un segundo registro paralelo se perderia o
  duplicaria.
- Es muy extensa (el nucleo mas unos 600 KB de referencias), lo que consume contexto en cada sesion
  sin aportar a construir la web.
- Contiene opciones que pueden consultar red (comprobacion de versiones, seguimiento de incidencias),
  aunque dice que son opcionales.

**Hallazgos.** No se vieron instrucciones maliciosas ni llamadas de red en los scripts (busqueda de
`curl`, `wget`, direcciones web: sin resultados relevantes), pero los scripts no se auditaron linea
por linea. Si mas adelante quieres algo parecido, es mejor una nota simple en `docs/`.

## 5. claude-mem (memoria entre sesiones): NO instalada

**Que es.** Un plugin que graba lo que hace Claude en cada sesion y se lo vuelve a ofrecer en la
siguiente.

**Por que no se instalo.**
- **No es una skill, es un sistema:** ejecuta hooks en cada inicio, en cada mensaje tuyo y tras cada
  accion de herramienta (`plugin/hooks/hooks.json`), levanta un **servicio local en segundo plano**
  (Bun), guarda una **base de datos** SQLite en `~/.claude-mem` e incluye un servidor MCP
  (`plugin/.mcp.json`).
- **Datos a terceros:** un segundo agente ("observer") procesa todo lo que Claude lee, edita y
  ejecuta para resumirlo. El README indica que el instalador pide iniciar sesion y ofrece un proveedor
  de pago con prueba de 30 dias que pide tarjeta, que la **sincronizacion en la nube es opcional**, y
  que las **estadisticas de uso anonimas vienen activadas por defecto**. Podria incluir contenido de
  la tienda o de datos de Finanzas leidos en una sesion.
- **Entorno efimero:** el contenedor se borra, asi que la memoria local se perderia; nuestra memoria
  ya vive en el repositorio (`docs/`) y en Obsidian, donde la ve el dueño y queda versionada.
- Se instala con `npx claude-mem install`, lo que ejecutaria codigo descargado.

Licencia Apache 2.0. Sin hallazgos de instrucciones maliciosas; el descarte es por encaje y por
privacidad, no por malicia.

## Que cambia para ti

- Claude tendra mas criterio de diseno al construir la web (impeccable) y sabra buscar skills
  (find-skills), pero **no se ha instalado ningun programa, servicio ni hook nuevo**.
- Si algun dia quieres activar las partes dejadas fuera (el detector automatico de impeccable, por
  ejemplo), hay que decidirlo expresamente y revisar ese binario antes.
- Cualquier skill nueva debe pasar por esta misma revision antes de copiarse al proyecto.
