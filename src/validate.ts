import type { Parish } from "./types";

const OUT = new URL("../data/paroquias.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const UA = "Mozilla/5.0 (compatible; MissasFrancaBot/1.0)";
const parishes = (await Bun.file(OUT).json()) as Parish[];

function decode(s: string): string {
  return s.replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, " ");
}
function toLines(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  return decode(body.replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
/** todos os horários HH:MM/Hh de um texto, normalizados */
function timesOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g))
    if (+m[1]! <= 23 && +m[2]! <= 59) out.push(`${m[1]!.padStart(2, "0")}:${m[2]}`);
  for (const m of text.matchAll(/\b(\d{1,2})\s*h\s*(\d{2})?\b/gi))
    if (+m[1]! <= 23) out.push(`${m[1]!.padStart(2, "0")}:${(m[2] ?? "00").padStart(2, "0")}`);
  return out.sort();
}
const HARD = /^(Descri[çc]|DESCRI|Itens relacionados|Compartilhar|TV Diocese|Servi[çc]os|Mem[óo]ria|-->)/i;

let issues = 0;
for (const p of parishes) {
  const html = await fetch(`https://diocesefranca.org.br/?menu=noticia_detalhe&id=${p.id}&id_orgao=1`, {
    headers: { "User-Agent": UA },
  }).then((r) => r.text());
  const lines = toLines(html);
  // região de missas na fonte: da 1ª "Missas" até HARD_STOP
  const start = lines.findIndex((l) => /^Missas\b/i.test(l));
  let end = lines.findIndex((l, i) => i > start && HARD.test(l));
  if (end === -1) end = Math.min(start + 40, lines.length);
  const srcRegion = start === -1 ? "" : lines.slice(start, end).join(" ");
  const srcTimes = timesOf(srcRegion);

  // horários que ARMAZENAMOS (matriz raw + capelas raw)
  const stored = [
    ...p.massesRaw,
    ...p.chapels.flatMap((c) => c.massesRaw),
  ].join(" ");
  const ourTimes = timesOf(stored);

  const srcCount: Record<string, number> = {};
  const ourCount: Record<string, number> = {};
  for (const t of srcTimes) srcCount[t] = (srcCount[t] ?? 0) + 1;
  for (const t of ourTimes) ourCount[t] = (ourCount[t] ?? 0) + 1;
  const missing = srcTimes.filter((t) => (ourCount[t] ?? 0) < (srcCount[t] = srcCount[t]));
  const onlySrc = [...new Set(srcTimes)].filter((t) => !ourTimes.includes(t));
  const onlyOur = [...new Set(ourTimes)].filter((t) => !srcTimes.includes(t));

  if (onlySrc.length || onlyOur.length) {
    issues++;
    console.log(`\n⚠️  ${p.name} (id ${p.id})`);
    if (onlySrc.length) console.log(`   faltando (na fonte, não capturado): ${onlySrc.join(", ")}`);
    if (onlyOur.length) console.log(`   extra (capturado, não na fonte): ${onlyOur.join(", ")}`);
  } else {
    console.log(`✓ ${p.name}: ${new Set(ourTimes).size} horários conferem`);
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`\n${issues === 0 ? "TODAS conferem" : issues + " paróquia(s) com divergência de horários"}`);
