/** Verdadero cuando la aplicación corre en la nube (Railway) y no en el propio ordenador. */
export function isCloud(): boolean {
  return process.env.PRINCIPAL_CLOUD === "1" || !!process.env.RAILWAY_PROJECT_ID;
}
