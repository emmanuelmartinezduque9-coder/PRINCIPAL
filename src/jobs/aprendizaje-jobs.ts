import { defineJob, defineSchedule } from "@/jobs/registry";
import { distill, learningSweep } from "@/server/videos/aprendizaje/destilar";
import { collectSignals } from "@/server/videos/aprendizaje/senales";

/** Captura histórica y cierre de lotes; el destilado diario recoge también vídeos sueltos. */
defineSchedule("aprendizaje.barrido", "* * * * *", () => learningSweep());
defineSchedule("aprendizaje.diario", "15 4 * * *", async () => { await collectSignals(); await distill("diario"); });

/** También permite encolar un destilado concreto; la misma run_key conserva la idempotencia. */
defineJob<{ trigger: "lote" | "diario"; batchId?: number }>("aprendizaje.destilar", async (data) => {
  await distill(data.trigger, data.batchId);
});
