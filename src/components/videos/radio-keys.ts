import type React from "react";

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Teclado de un grupo de opciones (`role="radiogroup"` con botones `role="radio"`): las flechas
 * pasan a la opción siguiente o anterior (dando la vuelta), Inicio y Fin a la primera y la última;
 * la opción a la que se llega queda elegida y con el foco. Solo la elegida entra en el orden de
 * Tab (`tabIndex` 0; las demás, -1).
 */
export function onRadioKeyDown(event: React.KeyboardEvent<HTMLElement>, select: (index: number) => void) {
  const group = event.currentTarget.closest('[role="radiogroup"]');
  if (!group) return;
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  const at = radios.indexOf(event.currentTarget);
  let next: number;
  if (event.key in STEPS) next = (at + STEPS[event.key] + radios.length) % radios.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = radios.length - 1;
  else return;
  event.preventDefault();
  radios[next]?.focus();
  if (next !== at) select(next);
}

/** `tabIndex` de la opción `index`: la elegida o, si no hay ninguna, la primera. */
export const radioTabIndex = (index: number, selectedIndex: number) => (index === Math.max(selectedIndex, 0) ? 0 : -1);
