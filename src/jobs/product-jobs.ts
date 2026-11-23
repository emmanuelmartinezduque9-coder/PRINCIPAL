import { defineJob, defineSchedule } from "@/jobs/registry";
import { StepFailedError } from "@/jobs/steps";
import { advanceIntake, INTAKE_JOB, INTAKE_SWEEP, intakeSweep } from "@/server/product-intake";
import { RESEARCH_JOB, runResearch } from "@/server/product-research";

/**
 * Trabajos de los productos: el alta desde un enlace y la búsqueda de nicho, ángulo o audiencia.
 * Se importa en `src/worker/main.ts` y en las rutas que encolan.
 */

/** Empieza (o sigue) el alta desde un enlace en cuanto se crea; el resto lo hace la tarea programada. */
defineJob<{ intakeId: number }>(
  INTAKE_JOB,
  async ({ intakeId }) => {
    if (typeof intakeId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await advanceIntake(intakeId);
  },
  "Alta de producto desde un enlace",
);

/** Cada minuto: las altas que esperan al Mac, a Claude o al mockup de Higgsfield. */
defineSchedule(INTAKE_SWEEP, "* * * * *", () => intakeSweep());

/** Busca nicho, ángulo o audiencia diferente con datos de internet. */
defineJob<{ researchId: number }>(
  RESEARCH_JOB,
  async ({ researchId }) => {
    if (typeof researchId !== "number") throw new StepFailedError("Datos del trabajo no válidos.");
    await runResearch(researchId);
  },
  "Buscar nicho, ángulo o audiencia",
);
