import type { MassSchedule, Parish } from "./types";
import { WEEK_ORDER } from "./types";

const UA = "Mozilla/5.0 (compatible; MissasFrancaBot/1.0)";
const BASE = "https://www.horariodemissa.com.br";
const LIST_URL = `${BASE}/search.php?uf=SP&cidade=Franca&bairro=&opcoes=cidade_opcoes&submit=1`;

/** normaliza p/ comparacao: sem acentos, minusculo, trim */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const DAY_SET = new Set(WEEK_ORDER.map((d) => norm(d)));

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return await res.text();
}

function decode(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ccedil;/g, "ç")
    .replace(/&atilde;/g, "ã")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, " ");
}

/** transforma HTML em linhas de texto limpas */
function toLines(html: string): string[] {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = decode(noScript.replace(/<[^>]+>/g, "\n"));
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** extrai (key, name) unicos da pagina de listagem de Franca */
export async function fetchFrancaList(): Promise<{ key: string; name: string }[]> {
  const html = await get(LIST_URL);
  const re = /igreja\.php\?k=([A-Za-z0-9]+)"[^>]*>([^<]+)</g;
  const seen = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1]!;
    const name = decode(m[2]!).trim();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen].map(([key, name]) => ({ key, name }));
}

const TIME_RE = /\b([0-2]?\d:[0-5]\d)\b/g;

function valueAfter(lines: string[], label: RegExp): string | null {
  const i = lines.findIndex((l) => label.test(l));
  if (i === -1) return null;
  const v = lines[i + 1];
  if (!v) return null;
  if (v.length < 24 && /:$/.test(v)) return null; // proximo campo vazio -> outro label
  if (/^\(.*\)$/.test(v)) return null; // placeholder "(Nenhum ...)"
  return v;
}

export function parseParish(key: string, html: string, name: string): Parish {
  const lines = toLines(html);
  const sourceUpdatedAt =
    lines
      .join(" ")
      .match(/atualizad[oa]s?[^.]*?em\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;

  // Endereco: bloco entre "Endereço:" e "CEP:"
  const iEnd = lines.findIndex((l) => /^Endere[çc]o:/i.test(l));
  const iCep = lines.findIndex((l) => /^CEP:/i.test(l));
  let address: string | null = null;
  let bairro: string | null = null;
  let city = "Franca";
  let state = "SP";
  if (iEnd !== -1) {
    const block = lines
      .slice(iEnd + 1, iCep === -1 ? iEnd + 6 : iCep)
      .filter((l) => !/clique no endere/i.test(l));
    // formato tipico: ["Rua X, 123", "Centro -", "Franca", "-", "SP"]
    if (block.length) {
      address = block[0]!.replace(/-\s*$/, "").trim();
      const rest = block.slice(1).join(" ").replace(/\s+/g, " ");
      const mm = rest.match(/^(.*?)\s*-\s*Franca\s*-\s*SP/i);
      if (mm) bairro = mm[1]!.replace(/-\s*$/, "").trim() || null;
      else if (block[1]) bairro = block[1]!.replace(/-\s*$/, "").trim() || null;
    }
  }
  const cep =
    lines[iCep === -1 ? -1 : iCep + 1]?.match(/\d{5}-?\d{3}/)?.[0] ??
    lines.join(" ").match(/CEP:\s*(\d{5}-?\d{3})/i)?.[1] ??
    null;

  const priest = valueAfter(lines, /^P[áa]roco:/i);
  const site = valueAfter(lines, /^Site:/i)?.replace(/\s/g, "") ?? null;
  const phoneLine = valueAfter(lines, /^Telefone/i) ?? "";
  const phones = [...phoneLine.matchAll(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g)].map((x) =>
    x[0].trim(),
  );

  // Missas: entre "Missas:" e "Confissões:"
  const iMass = lines.findIndex((l) => /^Missas:/i.test(l));
  const iConf = lines.findIndex((l) => /^Confiss[õo]es:/i.test(l));
  const masses: MassSchedule[] = [];
  if (iMass !== -1) {
    const end = iConf === -1 ? Math.min(lines.length, iMass + 24) : iConf;
    for (let i = iMass + 1; i < end; i++) {
      const dayLine = lines[i]!.replace(/:$/, "").trim();
      if (!DAY_SET.has(norm(dayLine))) continue;
      // horarios podem estar na mesma linha ou na proxima
      let times = [...lines[i]!.matchAll(TIME_RE)].map((x) => x[1]!);
      if (times.length === 0 && lines[i + 1]) {
        times = [...lines[i + 1]!.matchAll(TIME_RE)].map((x) => x[1]!);
        if (times.length) i++;
      }
      if (times.length) {
        const canon = WEEK_ORDER.find((d) => norm(d) === norm(dayLine)) ?? dayLine;
        masses.push({ day: canon, times: [...new Set(times)].sort() });
      }
    }
  }
  masses.sort(
    (a, b) =>
      WEEK_ORDER.findIndex((d) => norm(d) === norm(a.day)) -
      WEEK_ORDER.findIndex((d) => norm(d) === norm(b.day)),
  );

  const confRaw = valueAfter(lines, /^Confiss[õo]es:/i);
  const confessions = confRaw && !/nenhum horário/i.test(confRaw) ? confRaw : null;

  return {
    key,
    name: name.trim() || "(sem nome)",
    bairro,
    address,
    cep,
    city,
    state,
    lat: null,
    lon: null,
    priest,
    phones,
    site: site && /^https?:/i.test(site) ? site : null,
    masses,
    confessions,
    scrapedAt: new Date().toISOString(),
    sourceUpdatedAt,
    sourceUrl: `${BASE}/igreja.php?k=${key}`,
  };
}

export async function scrapeAll(): Promise<Parish[]> {
  const list = await fetchFrancaList();
  const out: Parish[] = [];
  for (const { key, name } of list) {
    try {
      const html = await get(`${BASE}/igreja.php?k=${key}`);
      out.push(parseParish(key, html, name));
    } catch (e) {
      console.error(`falha em ${key}:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 400)); // gentileza c/ a fonte
  }
  // dedup por nome+bairro, mantendo o com mais missas
  const byId = new Map<string, Parish>();
  for (const p of out) {
    const id = norm(`${p.name}|${p.bairro ?? ""}`);
    const prev = byId.get(id);
    if (!prev || p.masses.length > prev.masses.length) byId.set(id, p);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** geocodifica via OpenStreetMap Nominatim (grátis, 1 req/s, UA obrigatório) */
export async function geocode(p: Parish): Promise<void> {
  if (!p.address) return;
  const q = `${p.address}, ${p.bairro ?? ""}, Franca, SP, Brasil`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return;
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (arr[0]) {
      p.lat = Number(arr[0].lat);
      p.lon = Number(arr[0].lon);
    }
  } catch {
    /* mantem null */
  }
}

if (import.meta.main) {
  const data = await scrapeAll();
  for (const p of data) {
    await geocode(p);
    await new Promise((r) => setTimeout(r, 1100));
  }
  const path = new URL("../data/paroquias.json", import.meta.url).pathname;
  await Bun.write(path.replace(/^\/([A-Za-z]:)/, "$1"), JSON.stringify(data, null, 2));
  console.log(`OK ${data.length} paroquias -> data/paroquias.json`);
  for (const p of data)
    console.log(
      `- ${p.name} | bairro=${p.bairro} | missas=${p.masses.length}d | tel=${p.phones.length} | paroco=${p.priest ?? "-"}`,
    );
}
