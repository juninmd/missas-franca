import type { Parish } from "./types";

const UA = "MissasFrancaBot/1.0 (contato via Telegram)";
const OUT = new URL("../data/paroquias.json", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);

async function geo(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
  try {
    const arr = (await (await fetch(url, { headers: { "User-Agent": UA } })).json()) as Array<{
      lat: string;
      lon: string;
    }>;
    return arr[0] ? { lat: Number(arr[0].lat), lon: Number(arr[0].lon) } : null;
  } catch {
    return null;
  }
}

const parishes = (await Bun.file(OUT).json()) as Parish[];
let filled = 0;
for (const p of parishes) {
  if (p.lat != null) continue;
  const bare = p.name.replace(/^(Paróquia|Santuário Diocesano|Sé Catedral)\s*/i, "").trim();
  // só consultas que apontam para a MATRIZ (nunca endereço de capela -> pin errado)
  const queries = [
    p.address ? `${p.address}, Franca, SP` : null,
    `Igreja ${bare}, Franca, SP`,
    `Paróquia ${bare}, Franca, SP`,
  ].filter((x): x is string => !!x);
  for (const q of queries) {
    const g = await geo(q);
    await new Promise((r) => setTimeout(r, 1100));
    if (g) {
      p.lat = g.lat;
      p.lon = g.lon;
      filled++;
      console.log(`+ ${p.name} <- "${q}"`);
      break;
    }
  }
  if (p.lat == null) console.log(`- ${p.name}: sem geo`);
}
await Bun.write(OUT, JSON.stringify(parishes, null, 2));
const withGeo = parishes.filter((p) => p.lat != null).length;
console.log(`\ngeofill: +${filled} | total com geo: ${withGeo}/${parishes.length}`);
