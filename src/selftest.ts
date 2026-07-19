import { loadParishes, all, massesOnDay, todayIndex, dayName, nearest, search } from "./data";
import { parishCard, daySummary } from "./format";

await loadParishes();
console.log(`paróquias: ${all().length}`);
const idx = todayIndex();
console.log(`\n=== /hoje (${dayName(idx)}) ===`);
console.log(daySummary(`hoje (${dayName(idx)})`, massesOnDay(dayName(idx))).replace(/<[^>]+>/g, ""));

console.log(`\n=== card: busca "catedral" ===`);
const p = search("catedral")[0]!;
console.log(parishCard(p).replace(/<[^>]+>/g, ""));

console.log(`\n=== /perto de Praça Nossa Senhora (Centro) ===`);
for (const { parish, km } of nearest(-20.5386, -47.4008, 3))
  console.log(`- ${parish.name}: ${km.toFixed(2)} km (lat=${parish.lat})`);
