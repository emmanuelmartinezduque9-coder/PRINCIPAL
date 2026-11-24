-- Orden del dueño (24/11/2026): los colaboradores trabajan con sus mismas reglas y sin tope propio; el dueño puede ponérselo a mano en «Personas».
UPDATE "users" SET "spend_cap_micros" = NULL WHERE "role" = 'colaborador';
