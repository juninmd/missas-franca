import type { Parish } from "./types";
import { WEEK_ORDER } from "./types";
import { norm } from "./diocese";

const DATA_PATH = new URL("../data/paroquias.json", import.meta.url);

let cache: Parish[] = [];

export async function loadParishes(): Promise<Parish[]> {
  cache = (await Bun.file(DATA_PATH).json()) as Parish[];
  return cache;
}

export function all(): Parish[] {
  return cache;
}

export function byId(id: string | number): Parish | undefined {
  return cache.find((p) => String(p.id) === String(id));
}

export function search(term: string): Parish[] {
  const t = norm(term);
  return cache.filter(
    (p) => norm(p.name).includes(t) || norm(p.bairro ?? "").includes(t) || norm(p.city).includes(t),
  );
}

export function todayIndex(now = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export function dayName(index: number): string {
  return WEEK_ORDER[((index % 7) + 7) % 7]!;
}

export type DayMass = { parish: Parish; times: string[]; chapel?: string };

/** missas de um dia (matriz + capelas), ordenadas por horario */
export function massesOnDay(dayCanonical: string): DayMass[] {
  const out: DayMass[] = [];
  for (const p of cache) {
    const m = p.masses.find((x) => norm(x.day) === norm(dayCanonical));
    if (m?.times.length) out.push({ parish: p, times: m.times });
    for (const c of p.chapels) {
      const cm = c.masses.find((x) => norm(x.day) === norm(dayCanonical));
      if (cm?.times.length) out.push({ parish: p, times: cm.times, chapel: c.name });
    }
  }
  return out.sort((a, b) => (a.times[0]! < b.times[0]! ? -1 : 1));
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function nearest(lat: number, lon: number, limit = 3): { parish: Parish; km: number }[] {
  return cache
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({ parish: p, km: distanceKm(lat, lon, p.lat!, p.lon!) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
