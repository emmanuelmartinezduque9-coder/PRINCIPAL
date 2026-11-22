/** Proceso en segundo plano. Por ahora solo se mantiene vivo; las tareas siguientes le dan trabajo. */
console.log("[worker] en marcha");

const keepAlive = setInterval(() => {}, 60_000);

function stop() {
  clearInterval(keepAlive);
  console.log("[worker] detenido");
  process.exit(0);
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
