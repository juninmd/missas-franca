import type { Parish } from "./types";
import type { DayMass } from "./data";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ABBR: Record<string, string> = {
  Domingo: "Dom",
  "Segunda-feira": "Seg",
  "Terça-feira": "Ter",
  "Quarta-feira": "Qua",
  "Quinta-feira": "Qui",
  "Sexta-feira": "Sex",
  Sábado: "Sáb",
};

/** linha de missa "especial" (mensal/votiva/etc.), não recorrente semanal */
const SPECIAL_RE = /\b\d[ªºao]|do m[eê]s|todo dia|dia \d|exceto|votiv|ado?ra|sa[uú]de|especial/i;

export function mapsLink(p: Parish): string {
  if (p.lat != null && p.lon != null)
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
  const q = encodeURIComponent(`${p.address ?? p.name}, Franca, SP`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function scheduleBlock(masses: Parish["masses"], raw: string[], indent = ""): string[] {
  const L: string[] = [];
  for (const m of masses) L.push(`${indent}<b>${ABBR[m.day] ?? m.day}</b>  ${m.times.join("  ")}`);
  const specials = raw.filter((l) => SPECIAL_RE.test(l));
  for (const s of specials) L.push(`${indent}<i>✨ ${esc(s)}</i>`);
  if (!masses.length && !specials.length && raw.length)
    for (const l of raw) L.push(`${indent}• ${esc(l)}`);
  return L;
}

/** cartao completo de uma paroquia */
export function parishCard(p: Parish): string {
  const L: string[] = [];
  L.push(`⛪ <b>${esc(p.name)}</b>`);
  L.push(`<i>${esc([p.bairro, `${p.city}/${p.state}`].filter(Boolean).join(" • "))}</i>`);
  L.push("");
  if (p.address) L.push(`📍 <a href="${mapsLink(p)}">${esc(p.address)}</a>`);
  else L.push(`📍 <a href="${mapsLink(p)}">Ver localização no Google Maps</a>`);
  if (p.priest) L.push(`👤 <b>${esc(p.priest)}</b>`);
  for (const c of p.clergy) L.push(`   ↳ <i>${esc(c)}</i>`);
  if (p.phones.length) L.push(`📞 ${p.phones.map(esc).join(" • ")}`);
  if (p.email) L.push(`✉️ ${esc(p.email)}`);
  if (p.office.length) L.push(`🕰️ <i>Secretaria: ${esc(p.office.join(" · "))}</i>`);

  L.push("");
  L.push("🕑 <b>MISSAS</b>");
  const matriz = scheduleBlock(p.masses, p.massesRaw);
  if (matriz.length) L.push(...matriz);
  else L.push("<i>Não informado no site da diocese — confirme pelo telefone.</i>");

  for (const c of p.chapels) {
    L.push("");
    L.push(`🔸 <b>${esc(c.name)}</b>`);
    if (c.address) L.push(`   <i>${esc(c.address)}</i>`);
    const cb = scheduleBlock(c.masses, c.massesRaw, "   ");
    if (cb.length) L.push(...cb);
  }

  L.push("");
  L.push(
    `<blockquote>📖 Fonte: <a href="${esc(p.sourceUrl)}">Diocese de Franca</a> · confirme sempre antes de ir 🙏</blockquote>`,
  );
  return L.join("\n");
}

export function dayHeader(dayLabel: string, count: number): string {
  return `🗓️ <b>Missas de ${dayLabel}</b>\n<i>Franca/SP · ${count} celebrações</i>`;
}

/** resumo do dia agrupado por horario para leitura rapida */
export function daySummary(dayLabel: string, list: DayMass[]): string {
  if (!list.length)
    return `🗓️ <b>Missas de ${dayLabel} — Franca/SP</b>\n\nNenhuma missa registrada na fonte para este dia.\nUse /paroquias para ver contatos.`;
  const L = [dayHeader(dayLabel, list.length), ""];
  for (const { parish, times, chapel } of list) {
    const local = chapel ? `${esc(parish.name)} · <i>${esc(chapel)}</i>` : `<b>${esc(parish.name)}</b>`;
    L.push(`🕑 <b>${times.join("  ")}</b>`);
    L.push(`     ⛪ ${local}`);
  }
  L.push("");
  L.push("<i>Toque em /paroquias para foto, endereço, padre e capelas.</i>");
  return L.join("\n");
}

export function parishListButtons(parishes: Parish[]): { text: string; callback_data: string }[][] {
  return parishes.map((p) => [{ text: `⛪ ${p.name}`, callback_data: `p:${p.id}` }]);
}
