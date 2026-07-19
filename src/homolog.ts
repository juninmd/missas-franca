import { ADMIN_CHAT } from "./config";
import { tg } from "./telegram";
import { loadParishes, all, massesOnDay, todayIndex, dayName, search } from "./data";
import { parishCard, daySummary, mapsLink } from "./format";

await loadParishes();
const me = await tg.getMe();
console.log(`getMe OK: @${me.username} (${all().length} paróquias)`);

const chat = ADMIN_CHAT;
const idx = todayIndex();

await tg.sendMessage(
  chat,
  `✅ <b>Homologação — Missas Franca (v2, fonte: Diocese de Franca)</b>\n${all().length} paróquias de Franca com foto, padre, capelas e horários atuais. Exemplos reais abaixo.`,
);

await tg.sendMessage(chat, daySummary(`hoje (${dayName(idx)})`, massesOnDay(dayName(idx))));

async function showcase(term: string): Promise<void> {
  const p = search(term)[0];
  if (!p) return;
  if (p.image) {
    try {
      await tg.sendPhoto(chat, p.image, `⛪ <b>${p.name}</b>`);
    } catch (e) {
      console.error(`foto falhou (${p.name}):`, (e as Error).message);
    }
  }
  await tg.sendMessage(chat, parishCard(p), [
    [{ text: "🗺️ Abrir no Google Maps", url: mapsLink(p) }],
  ]);
  if (p.lat != null && p.lon != null) await tg.sendLocation(chat, p.lat, p.lon);
}

await showcase("catedral");
await showcase("santa rita"); // mostra capelas com endereços e horários próprios

console.log("Homologação v2 enviada ao canal com sucesso.");
