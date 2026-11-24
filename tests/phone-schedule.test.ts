import { describe, expect, it } from "vitest";
import { nextPublicationSlot } from "@/server/videos/publications";
const day = (d:Date) => d.toLocaleDateString("en-CA",{timeZone:"Europe/Berlin"});
describe("ritmo de publicaciones en Berlín", () => {
  it("cinco vídeos: dos hoy separados cuatro horas y el resto en días siguientes", () => {
    const now = new Date("2026-11-24T09:00:00Z");
    const booked:Date[]=[];
    for(let i=0;i<5;i++) booked.push(nextPublicationSlot(booked, now, 4));
    expect(booked.map(day)).toEqual(["2026-11-24","2026-11-24","2026-11-25","2026-11-25","2026-11-26"]);
    for(let i=1;i<booked.length;i++) expect(booked[i].getTime()-booked[i-1].getTime()).toBeGreaterThanOrEqual(4*3600_000);
  });
  it("respeta Berlín en ambos cambios de hora", () => {
    for(const start of ["2026-03-28T22:00:00Z","2026-10-24T21:00:00Z"]) {
      const booked:Date[]=[];
      for(let i=0;i<12;i++) booked.push(nextPublicationSlot(booked,new Date(start),4));
      const counts = new Map<string,number>();
      for(const at of booked) counts.set(day(at),(counts.get(day(at)) ?? 0)+1);
      expect([...counts.values()].every(n=>n<=2)).toBe(true);
      for(let i=1;i<booked.length;i++) expect(booked[i].getTime()-booked[i-1].getTime()).toBeGreaterThanOrEqual(4*3600_000);
    }
  });
  it("evita huecos demasiado próximos a una publicación futura", () => {
    const next=nextPublicationSlot([new Date("2026-11-24T12:00:00Z")],new Date("2026-11-24T09:00:00Z"),4);
    expect(next.toISOString()).toBe("2026-11-24T16:00:00.000Z");
  });
});
describe("separación por producto", () => {
  it("por defecto, 3 horas: uno ahora y el siguiente 3 h después; el tercero, al día siguiente", () => {
    const now = new Date("2026-11-24T09:00:00Z");
    const booked: Date[] = [];
    for (let i = 0; i < 3; i++) booked.push(nextPublicationSlot(booked, now));
    expect(booked[0].toISOString()).toBe(now.toISOString());
    expect(booked[1].getTime() - booked[0].getTime()).toBe(3 * 3600_000);
    expect(booked[2].toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })).toBe("2026-11-25");
  });
  it("respeta la separación que ponga el producto", () => {
    const now = new Date("2026-11-24T08:00:00Z");
    expect(nextPublicationSlot([now], now, 6).getTime() - now.getTime()).toBe(6 * 3600_000);
  });
});
