import { defineSchedule } from "@/jobs/registry";
import { cerebroSweep } from "@/server/videos/cerebro/ingesta";

/** Las lecturas se renuevan a las seis horas; los fallos se recuperan en el siguiente barrido. */
defineSchedule("cerebro.barrido", "0 * * * *", () => cerebroSweep());
