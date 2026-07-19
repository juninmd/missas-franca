import { ADMIN_CHAT } from "./config";
import { tg } from "./telegram";
import { loadParishes, all, massesOnDay, todayIndex, dayName } from "./data";
import { parishCard, daySummary, mapsLink } from "./format";

await loadParishes();
const me = await tg.getMe();
const chat = ADMIN_CHAT;
const parishes = all();
console.log(`@${me.username} — homologando ${parishes.length} paróquias no canal`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function safe(fn: () => Promise<unknown>, label: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      const msg = (e as Error).message;
      const m = msg.match(/retry after (\d+)/i);
      if (m) {
        await sleep((Number(m[1]) + 1) * 1000);
        continue;
      }
      console.error(`falha ${label}: ${msg}`);
      return;
    }
  }
}

const idx = todayIndex();
const withPin = parishes.filter((p) => p.lat != null).length;

await safe(
  () =>
    tg.sendMessage(
      chat,
      [
        "🙏 <b>MISSAS FRANCA — homologação completa (dados revalidados ✅)</b>",
        "",
        `📿 <b>${parishes.length} paróquias</b> de Franca/SP · fonte oficial <a href="https://diocesefranca.org.br">Diocese de Franca</a>`,
        `🖼️ Foto da igreja · 👤 pároco e clero · 🕑 missas da matriz e capelas · 📍 ${withPin} com pin no mapa`,
        "",
        "<i>Abaixo: as missas de hoje e o cartão completo de cada paróquia.</i>",
      ].join("\n"),
    ),
  "intro",
);
await sleep(1500);

await safe(
  () => tg.sendMessage(chat, daySummary(`hoje (${dayName(idx)})`, massesOnDay(dayName(idx)))),
  "hoje",
);
await sleep(1500);

let ok = 0;
for (const p of parishes) {
  if (p.image) {
    await safe(() => tg.sendPhoto(chat, p.image!, `⛪ <b>${p.name}</b>`), `foto ${p.name}`);
    await sleep(1200);
  }
  await safe(
    () => tg.sendMessage(chat, parishCard(p), [[{ text: "🗺️ Abrir no Google Maps", url: mapsLink(p) }]]),
    `card ${p.name}`,
  );
  await sleep(1200);
  if (p.lat != null && p.lon != null) {
    await safe(() => tg.sendLocation(chat, p.lat!, p.lon!), `loc ${p.name}`);
    await sleep(1200);
  }
  ok++;
  console.log(`  [${ok}/${parishes.length}] ${p.name}`);
}

await safe(
  () =>
    tg.sendMessage(
      chat,
      "✅ <b>Homologação completa.</b> Bot @missas_franca_bot no ar — comandos: /hoje /amanha /paroquias /missa /perto /seguir.",
    ),
  "fim",
);
console.log("HOMOLOG_FULL_OK");
