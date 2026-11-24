import { defineSchedule } from "@/jobs/registry";
import { mejorasSweep, SWEEP_NAME } from "@/server/videos/mejoras/classify";

/**
 * «Mejoras»: cada minuto se clasifican con Claude Haiku los reportes nuevos y los rechazos con motivo
 * aún sin tipo. Se importa en `src/worker/main.ts`.
 */
defineSchedule(SWEEP_NAME, "* * * * *", () => mejorasSweep());
