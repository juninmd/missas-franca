import { TOKEN, ADMIN_CHAT } from "./config";
import { tg } from "./telegram";
import { loadParishes, all, massesOnDay, todayIndex, dayName, search } from "./data";
import { parishCard, daySummary, mapsLink } from "./format";

async function chatReachable(): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${TOKEN}/getChat?chat_id=${ADMIN_CHAT}`,
  );
  return ((await res.json()) as { ok: boolean }).ok;
}

await loadParishes();
const tries = 30;
for (let i = 1; i <= tries; i++) {
  if (await chatReachable()) {
    const idx = todayIndex();
    await tg.sendMessage(
      ADMIN_CHAT,
      "✅ <b>Homologação — Missas Franca</b>\nBot online com dados reais (diocesefranca.org.br). Exemplos reais abaixo.",
    );
    await tg.sendMessage(ADMIN_CHAT, daySummary(`hoje (${dayName(idx)})`, massesOnDay(dayName(idx))));
    const p = search("catedral")[0]!;
    await tg.sendMessage(ADMIN_CHAT, parishCard(p), [
      [{ text: "🗺️ Abrir no Google Maps", url: mapsLink(p) }],
    ]);
    if (p.lat != null && p.lon != null) await tg.sendLocation(ADMIN_CHAT, p.lat, p.lon);
    console.log(`HOMOLOG_OK apos ${i} tentativa(s) — ${all().length} paróquias`);
    process.exit(0);
  }
  console.log(`[${i}/${tries}] bot ainda não é admin do canal ${ADMIN_CHAT}...`);
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("HOMOLOG_PENDENTE: adicione @missas_franca_bot como admin do canal.");
process.exit(2);
