import type { Chapel, MassSchedule, Parish } from "./types";
import { WEEK_ORDER } from "./types";

const UA = "Mozilla/5.0 (compatible; MissasFrancaBot/1.0)";
const HOST = "https://diocesefranca.org.br";
const page = (id: number) => `${HOST}/?menu=noticia_detalhe&id=${id}&id_orgao=1`;

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const DAY_ROOT: Record<string, string> = {
  domingo: "Domingo",
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  sabado: "Sábado",
};
const ROOTS = Object.keys(DAY_ROOT);

/** início de bloco de capela/comunidade */
const SECTION_START = /^(Capela|Comunidade|[ÁA]rea Pastoral)\b/i;
/** fim rígido da parte de missas (descrição, rodapé, etc.) */
const HARD_STOP =
  /^(Descri[çc]|DESCRI|Itens relacionados|Compartilhar|TV Diocese|Servi[çc]os|Mem[óo]ria|-->)/i;

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function decode(s: string): string {
  return s
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ccedil;/g, "ç")
    .replace(/&atilde;/g, "ã")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&nbsp;/g, " ")
    .replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, " ");
}

function toLines(html: string): string[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return decode(body.replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !l.startsWith("data:image"));
}

/** "Paróquia X (Franca-SP)" -> nome do heading da pagina */
function headingName(html: string): { name: string; city: string } | null {
  const m = html.match(/<h[1-3][^>]*>\s*([^<]*\(([^)]*?)-\s*SP\)[^<]*)\s*<\/h[1-3]>/i);
  if (!m) return null;
  const name = decode(m[1]!).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const city = decode(m[2]!).trim();
  return { name, city };
}

// ---------- parsing de horarios ----------

function times(line: string): string[] {
  const out: string[] = [];
  // formato HH:MM (ex: 19:15, 07:00)
  for (const m of line.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const hh = m[1]!.padStart(2, "0");
    if (Number(hh) <= 23 && Number(m[2]) <= 59) out.push(`${hh}:${m[2]}`);
  }
  // formato Hh / HhMM / Hh00 (ex: 7h, 08h, 8h30, 10h00)
  for (const m of line.matchAll(/\b(\d{1,2})\s*h\s*(\d{2})?\b/gi)) {
    const hh = m[1]!.padStart(2, "0");
    const mm = (m[2] ?? "00").padStart(2, "0");
    if (Number(hh) <= 23) out.push(`${hh}:${mm}`);
  }
  return [...new Set(out)].sort();
}

/** dias explicitos + expansao de faixa "X a Y" */
function daysIn(line: string): string[] {
  const n = ` ${norm(line)} `;
  const present = ROOTS.filter((r) => n.includes(r));
  // faixa: "<d1> a <d2>" ou "<d1> à <d2>"
  const range = n.match(/(domingo|segunda|terca|quarta|quinta|sexta|sabado)\s*[aà]\s*(domingo|segunda|terca|quarta|quinta|sexta|sabado)/);
  if (range) {
    const i1 = ROOTS.indexOf(range[1]!);
    const i2 = ROOTS.indexOf(range[2]!);
    // ROOTS na ordem domingo..sabado (=WEEK_ORDER)
    if (i1 !== -1 && i2 !== -1 && i1 <= i2)
      for (let i = i1; i <= i2; i++) if (!present.includes(ROOTS[i]!)) present.push(ROOTS[i]!);
  }
  return present.map((r) => DAY_ROOT[r]!);
}

/** linha e uma missa recorrente simples (nao especial/mensal)? */
function isRecurring(line: string): boolean {
  return !/\b(\d[ªaºo]|do m[eê]s|todo dia|dia \d|exceto|votiv|ado?ra|sa[uú]de|1[ºo]|2[ºo]|especial)/i.test(
    line,
  );
}

/** junta linha com dia(s) sem horário à linha seguinte que só tem horário */
function coalesceDayTime(lines: string[]): string[] {
  const res: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const next = lines[i + 1];
    if (
      daysIn(l).length &&
      !times(l).length &&
      next &&
      times(next).length &&
      !daysIn(next).length
    ) {
      res.push(`${l} ${next}`);
      i++;
    } else {
      res.push(l);
    }
  }
  return res;
}

/** separa uma linha em segmentos dia→horários; divide em " e " só quando
 *  os dois lados têm dia (ex: "Quinta, 19h30 e Domingo, 10h"), preservando
 *  "Sábado: 08h e 19h" (onde "e" une horários do mesmo dia) */
function segmentize(line: string): string[] {
  const out: string[] = [];
  for (const s of line.split(/\s*\/\s*/)) {
    const parts = s.split(/\s+e\s+/i);
    if (parts.length > 1 && parts.every((p) => daysIn(p).length >= 1)) out.push(...parts);
    else out.push(s);
  }
  return out;
}

function parseMasses(rawLines: string[]): MassSchedule[] {
  const map = new Map<string, Set<string>>();
  for (const line of coalesceDayTime(rawLines)) {
    if (!isRecurring(line)) continue;
    // cada segmento associa seus dias aos seus horarios
    for (const seg of segmentize(line)) {
      const ts = times(seg);
      if (!ts.length) continue;
      for (const d of daysIn(seg)) {
        if (!map.has(d)) map.set(d, new Set());
        for (const t of ts) map.get(d)!.add(t);
      }
    }
  }
  return [...map]
    .map(([day, set]) => ({ day, times: [...set].sort() }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.day as never) - WEEK_ORDER.indexOf(b.day as never));
}

// ---------- parse da paroquia ----------

function valueAfter(lines: string[], label: RegExp): string | null {
  const i = lines.findIndex((l) => label.test(l));
  if (i === -1) return null;
  const v = lines[i + 1];
  if (!v || /:\s*$/.test(v)) return null;
  return v;
}

function absUrl(src: string): string {
  if (/^https?:/i.test(src)) return src;
  return `${HOST}/${src.replace(/^\//, "")}`;
}

function pickImages(html: string): { image: string | null; priestImage: string | null } {
  const srcs = [...html.matchAll(/<img[^>]+src="((?!data:)[^"]+)"/gi)].map((m) => m[1]!);
  const priestImage =
    srcs.find((s) => /uploads\/avatars\//i.test(s)) ??
    srcs.find((s) => /padre|paroco/i.test(s)) ??
    null;
  // foto real da igreja: nome com timestamp (images/YYYYMMDDHHMMSS_...) ou upload de conteudo
  const image =
    srcs.find((s) => /images\/\d{12,}_/i.test(s)) ??
    srcs.find(
      (s) =>
        /sist_integrado\/uploads\//i.test(s) &&
        !/avatars|padre|logo|banner/i.test(s),
    ) ??
    null;
  return {
    image: image ? absUrl(image) : null,
    priestImage: priestImage ? absUrl(priestImage) : null,
  };
}

export function parseParish(id: number, html: string, name: string, city: string): Parish {
  const lines = toLines(html);
  const { image, priestImage } = pickImages(html);

  const priest = valueAfter(lines, /^P[aá]roco\s*:/i);
  const clergy = [
    ["Vigário paroquial", /^Vig[aá]rio paroquial\s*:/i],
    ["Vigário", /^Vig[aá]rio\s*:/i],
    ["Cooperador", /^Cooperador\s*:/i],
    ["Diácono", /^Di[aá]cono\s*:/i],
  ]
    .map(([label, re]) => {
      const v = valueAfter(lines, re as RegExp);
      return v ? `${label as string}: ${v}` : null;
    })
    .filter((x): x is string => x != null);

  const firstSection = lines.findIndex((l) => SECTION_START.test(l));

  // cabeçalho da matriz: qualquer "Missas..." ANTES da 1ª capela ("Missas:",
  // "Missas na Matriz:", "Missas Devocionais (na Matriz)")
  const iMassCand = lines.findIndex((l) => /^Missas\b/i.test(l));
  const iMass =
    iMassCand !== -1 && (firstSection === -1 || iMassCand < firstSection) ? iMassCand : -1;

  // expediente: entre "Expediente" e a matriz
  const iExp = lines.findIndex((l) => /^Expediente/i.test(l));
  const office =
    iExp !== -1 && iMass > iExp ? lines.slice(iExp + 1, iMass).filter(Boolean) : [];

  // só linhas que parecem horário de missa (evita engolir descrição/história)
  const scheduleish = (l: string) => daysIn(l).length > 0 || times(l).length > 0;

  const iStop = lines.findIndex((l, idx) => idx > iMass && HARD_STOP.test(l));
  const massEnd = [firstSection, iStop, lines.length]
    .filter((x) => x > iMass)
    .sort((a, b) => a - b)[0]!;
  const massesRaw =
    iMass !== -1 ? coalesceDayTime(lines.slice(iMass + 1, massEnd).filter(scheduleish)) : [];

  // capelas / comunidades / áreas pastorais
  const chapels: Chapel[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!SECTION_START.test(lines[i]!)) continue;
    let cName = lines[i]!;
    let skip = 1;
    // nome quebrado: "Capela" numa linha, o nome do orago na seguinte
    if (
      /^(Capela|Comunidade|[ÁA]rea Pastoral)$/i.test(cName) &&
      lines[i + 1] &&
      !/^Missas/i.test(lines[i + 1]!) &&
      !scheduleish(lines[i + 1]!)
    ) {
      cName = `${cName} ${lines[i + 1]!}`;
      skip = 2;
    }
    const addr =
      lines[i + skip] && !/^Missas/i.test(lines[i + skip]!) && !scheduleish(lines[i + skip]!)
        ? lines[i + skip]!
        : null;
    const jStart = i + skip + (addr ? 1 : 0);
    const jEnd = lines.findIndex((l, idx) => idx > i && (SECTION_START.test(l) || HARD_STOP.test(l)));
    const block = coalesceDayTime(
      lines
        .slice(jStart, jEnd === -1 ? Math.min(jStart + 6, lines.length) : jEnd)
        .filter((l) => !/^Missas\s*:?$/i.test(l))
        .filter(scheduleish),
    );
    chapels.push({ name: cName, address: addr, massesRaw: block, masses: parseMasses(block) });
  }

  const joined = lines.join(" ");
  const cep = joined.match(/\b\d{5}-?\d{3}\b/)?.[0] ?? null;
  const phones = [...joined.matchAll(/\(?\b\d{2}\)?\s?\d{4,5}-\d{4}\b/g)].map((m) => m[0].trim());
  const email = joined.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? null;
  const addrLabel = valueAfter(lines, /^Endere[çc]o\s*:/i);

  return {
    id,
    name,
    city,
    state: "SP",
    bairro: null,
    address: addrLabel,
    cep,
    lat: null,
    lon: null,
    phones: [...new Set(phones)],
    email,
    site: joined.match(/https?:\/\/[\w./-]+/)?.[0] ?? null,
    priest,
    clergy,
    office,
    image,
    priestImage,
    masses: parseMasses(massesRaw),
    massesRaw,
    chapels,
    scrapedAt: new Date().toISOString(),
    sourceUrl: page(id),
  };
}

/** descobre paginas de paroquia de Franca no intervalo de ids conhecido */
export async function discoverFranca(
  ids: number[] = [
    ...Array.from({ length: 76 }, (_, i) => 2010 + i),
    2106,
    2143,
    2257,
    2258,
    2339,
  ],
): Promise<{ id: number; name: string; city: string }[]> {
  const out: { id: number; name: string; city: string }[] = [];
  for (const id of ids) {
    try {
      const html = await get(page(id));
      if (!/P[aá]roco\s*:/i.test(html)) continue;
      const h = headingName(html);
      if (!h) continue;
      if (norm(h.city) !== "franca") continue;
      out.push({ id, ...h });
    } catch {
      /* ignora id inexistente */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // dedup por nome
  const byName = new Map<string, { id: number; name: string; city: string }>();
  for (const p of out) if (!byName.has(norm(p.name))) byName.set(norm(p.name), p);
  return [...byName.values()];
}

export async function scrapeDiocese(): Promise<Parish[]> {
  const list = await discoverFranca();
  const parishes: Parish[] = [];
  for (const { id, name, city } of list) {
    try {
      const html = await get(page(id));
      parishes.push(parseParish(id, html, name, city));
    } catch (e) {
      console.error(`falha id ${id}:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return parishes.sort((a, b) => a.name.localeCompare(b.name, "pt"));
}
