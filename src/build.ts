import type { Parish } from "./types";
import { scrapeDiocese, norm } from "./diocese";

const UA = "MissasFrancaBot/1.0 (contato via Telegram)";
const OUT = new URL("../data/paroquias.json", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const LEGACY = new URL("../data/legacy_horariodemissa.json", import.meta.url);

type Legacy = {
  name: string;
  bairro: string | null;
  address: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  phones: string[];
};

/** casa nome da diocese com registro legado (por palavra-chave do orago) */
function matchLegacy(p: Parish, legacy: Legacy[]): Legacy | undefined {
  const key = norm(p.name).replace(/paroquia|santuario|se catedral|diocesano|de |da |do |sao |nossa senhora/g, "").trim();
  return legacy.find((l) => {
    const lk = norm(l.name).replace(/paroquia|catedral|diocesana|de |da |do |sao |nossa senhora/g, "").trim();
    return lk && key && (lk.includes(key) || key.includes(lk));
  });
}

async function geocode(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
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

const legacy = (await Bun.file(LEGACY).json()) as Legacy[];
console.log(`descobrindo + raspando diocese (pode levar ~4 min)...`);
const parishes = await scrapeDiocese();
console.log(`diocese: ${parishes.length} paróquias de Franca`);

for (const p of parishes) {
  // 1) fallback de endereço/coords/tel do legado quando a diocese não informa
  const leg = matchLegacy(p, legacy);
  if (leg) {
    p.bairro ??= leg.bairro;
    p.address ??= leg.address;
    p.cep ??= leg.cep;
    if (p.lat == null && leg.lat != null) {
      p.lat = leg.lat;
      p.lon = leg.lon;
    }
    if (!p.phones.length && leg.phones.length) p.phones = leg.phones;
  }
  // 2) geocode por endereço quando ainda faltar coordenada
  if (p.lat == null) {
    const q = p.address
      ? `${p.address}, ${p.bairro ?? ""}, Franca, SP, Brasil`
      : `${p.name}, Franca, SP, Brasil`;
    const g = await geocode(q);
    if (g) {
      p.lat = g.lat;
      p.lon = g.lon;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
}

await Bun.write(OUT, JSON.stringify(parishes, null, 2));
console.log(`\nOK -> data/paroquias.json`);
for (const p of parishes)
  console.log(
    `- ${p.name} | missas=${p.masses.length}d | capelas=${p.chapels.length} | img=${p.image ? "sim" : "não"} | geo=${p.lat != null ? "sim" : "NÃO"} | tel=${p.phones.length}`,
  );
