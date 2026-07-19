import type { Parish } from "./types";
import { parseParish } from "./diocese";

const OUT = new URL("../data/paroquias.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const UA = "Mozilla/5.0 (compatible; MissasFrancaBot/1.0)";
const old = (await Bun.file(OUT).json()) as Parish[];

const out: Parish[] = [];
for (const o of old) {
  const html = await fetch(`https://diocesefranca.org.br/?menu=noticia_detalhe&id=${o.id}&id_orgao=1`, {
    headers: { "User-Agent": UA },
  }).then((r) => r.text());
  const p = parseParish(o.id, html, o.name, o.city);
  // preserva geo e enriquecimentos que não vêm do parse
  p.lat = o.lat;
  p.lon = o.lon;
  p.bairro ??= o.bairro;
  if (!p.address && o.address) p.address = o.address;
  if (!p.cep && o.cep) p.cep = o.cep;
  if (!p.phones.length && o.phones.length) p.phones = o.phones;
  out.push(p);
  console.log(`${p.name}: matriz=${p.masses.length}d raw=${p.massesRaw.length} capelas=${p.chapels.length}`);
  await new Promise((r) => setTimeout(r, 300));
}
out.sort((a, b) => a.name.localeCompare(b.name, "pt"));
await Bun.write(OUT, JSON.stringify(out, null, 2));
console.log(`\nOK -> ${out.length} paróquias reprocessadas`);
