import type { Parish } from "./types";
import { norm } from "./diocese";

const OUT = new URL("../data/paroquias.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const LEGACY = new URL("../data/legacy_horariodemissa.json", import.meta.url);
const UA = "MissasFrancaBot/1.0 (contato via Telegram)";

// bounding box aproximada do município de Franca-SP
const FRANCA = { latMin: -20.62, latMax: -20.46, lonMin: -47.47, lonMax: -47.33 };
const inFranca = (lat: number, lon: number) =>
  lat >= FRANCA.latMin && lat <= FRANCA.latMax && lon >= FRANCA.lonMin && lon <= FRANCA.lonMax;

const STOP = new Set([
  "paroquia", "santuario", "diocesano", "diocesana", "se", "catedral", "nossa", "senhora",
  "de", "da", "do", "dos", "das", "e", "sao", "santa", "santo", "sant", "jesus", "menino",
  "sagrado", "coracao", "capela", "franca", "sp",
]);
const tokens = (s: string) =>
  new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)));

type Legacy = { name: string; bairro: string | null; address: string | null; cep: string | null; lat: number | null; lon: number | null; phones: string[] };

function matchLegacy(p: Parish, legacy: Legacy[]): Legacy | undefined {
  const pt = tokens(p.name);
  return legacy.find((l) => {
    const lt = tokens(l.name);
    for (const t of pt) if (lt.has(t)) return true;
    return false;
  });
}

/** limpa endereço p/ geocode: remove CEP, Cx Postal, n°, parênteses; mantém rua+num+bairro */
function cleanAddr(a: string): string {
  return a
    .replace(/\bC(?:ep|EP)\b[\s:.]*\d[\d.\-]*/gi, "")
    .replace(/\bC(?:x|aixa)\.?\s*Postal\s*\d+/gi, "")
    .replace(/\bn[°ºo]\s*/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b\d{5}-?\d{3}\b/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

async function geo(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=br&q=${encodeURIComponent(q)}`;
  try {
    const arr = (await (await fetch(url, { headers: { "User-Agent": UA } })).json()) as Array<{ lat: string; lon: string }>;
    for (const r of arr) {
      const lat = Number(r.lat), lon = Number(r.lon);
      if (inFranca(lat, lon)) return { lat, lon };
    }
  } catch { /* ignore */ }
  return null;
}

const parishes = (await Bun.file(OUT).json()) as Parish[];
const legacy = (await Bun.file(LEGACY).json()) as Legacy[];

let adoptedAddr = 0, geocoded = 0;
for (const p of parishes) {
  const leg = matchLegacy(p, legacy);
  // 1) adota endereço/bairro reais do legado (matriz) quando a diocese não tem
  if (leg?.address && !p.address) {
    p.address = leg.address;
    p.bairro ??= leg.bairro;
    p.cep ??= leg.cep;
    adoptedAddr++;
  }
  if (p.lat == null && leg?.lat != null && inFranca(leg.lat, leg.lon!)) {
    p.lat = leg.lat; p.lon = leg.lon;
  }
  // 2) geocode robusto (valida em Franca), tentando endereço e variações de nome
  if (p.lat == null) {
    const orago = p.name.replace(/^(Paróquia|Santuário Diocesano|Sé Catedral)\s*/i, "").trim();
    const queries = [
      p.address ? `${cleanAddr(p.address)}, Franca, SP` : null,
      `Igreja ${orago}, Franca, SP`,
      `Paróquia ${orago}, Franca - SP`,
    ].filter((x): x is string => !!x && x.length > 12);
    for (const q of queries) {
      const g = await geo(q);
      await new Promise((r) => setTimeout(r, 1100));
      if (g) { p.lat = g.lat; p.lon = g.lon; geocoded++; console.log(`geo+ ${p.name} <- "${q}"`); break; }
    }
    if (p.lat == null) console.log(`geo- ${p.name}`);
  }
}

await Bun.write(OUT, JSON.stringify(parishes, null, 2));
const withGeo = parishes.filter((p) => p.lat != null).length;
console.log(`\nendereços adotados: +${adoptedAddr} | geocodados: +${geocoded} | com geo: ${withGeo}/${parishes.length}`);
