import { TOKEN, DAILY_HOUR } from "./config";
import { tg, type TgUpdate } from "./telegram";
import { store } from "./store";
import {
  loadParishes,
  all,
  byId,
  search,
  massesOnDay,
  todayIndex,
  dayName,
  nearest,
} from "./data";
import { parishCard, daySummary, parishListButtons, mapsLink } from "./format";

const HELP = [
  "🙏 <b>Missas Franca</b> — horários das missas das paróquias de Franca/SP.",
  "",
  "<b>Comandos:</b>",
  "/hoje — missas de hoje",
  "/amanha — missas de amanhã",
  "/paroquias — lista de paróquias (toque p/ detalhes)",
  "/missa <i>nome</i> — busca uma paróquia (ex: /missa catedral)",
  "/perto — envie sua localização e veja as mais próximas",
  "/seguir — receber o aviso diário das missas de hoje",
  "/parar — cancelar o aviso diário",
  "/ajuda — esta mensagem",
  "",
  "<i>Dados reais de horariodemissa.com.br. Confirme sempre antes de ir.</i>",
].join("\n");

function dayLabelFor(index: number): string {
  const today = todayIndex();
  if (index === today) return "hoje";
  if (index === (today + 1) % 7) return "amanhã";
  return dayName(index).toLowerCase();
}

async function sendToday(chatId: number, offset = 0): Promise<void> {
  const idx = (todayIndex() + offset) % 7;
  const label = `${dayLabelFor(idx)} (${dayName(idx)})`;
  await tg.sendMessage(chatId, daySummary(label, massesOnDay(dayName(idx))));
}

async function handleText(chatId: number, text: string): Promise<void> {
  const [cmdRaw, ...rest] = text.trim().split(/\s+/);
  const cmd = cmdRaw!.toLowerCase().replace(/@.*$/, "");
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/start":
    case "/ajuda":
    case "/help":
      await tg.sendMessage(chatId, HELP);
      return;

    case "/hoje":
      await sendToday(chatId, 0);
      return;

    case "/amanha":
    case "/amanhã":
      await sendToday(chatId, 1);
      return;

    case "/paroquias":
    case "/paróquias": {
      const list = all();
      await tg.sendMessage(
        chatId,
        `⛪ <b>${list.length} paróquias em Franca/SP</b>\nToque para ver horários, endereço, padre e telefone:`,
        parishListButtons(list),
      );
      return;
    }

    case "/missa":
    case "/paroquia":
    case "/paróquia": {
      if (!arg) {
        await tg.sendMessage(chatId, "Use: <code>/missa catedral</code> ou /paroquias");
        return;
      }
      const hits = search(arg);
      if (!hits.length) {
        await tg.sendMessage(chatId, `Nenhuma paróquia encontrada para "<b>${arg}</b>". Veja /paroquias.`);
        return;
      }
      if (hits.length === 1) {
        await sendParish(chatId, String(hits[0]!.id));
        return;
      }
      await tg.sendMessage(chatId, "Encontrei estas paróquias:", parishListButtons(hits));
      return;
    }

    case "/perto":
    case "/proximo":
    case "/próximo":
      await tg.sendMessage(
        chatId,
        "📍 Envie sua <b>localização</b> (clipe 📎 → Localização) que eu mostro as paróquias mais próximas.",
      );
      return;

    case "/seguir":
    case "/inscrever":
      store.subscribe(chatId);
      await tg.sendMessage(
        chatId,
        `✅ Pronto! Todo dia às ${DAILY_HOUR}h você recebe as missas do dia. Use /parar para cancelar.`,
      );
      return;

    case "/parar":
    case "/cancelar":
      store.unsubscribe(chatId);
      await tg.sendMessage(chatId, "🔕 Aviso diário cancelado. Use /seguir para reativar.");
      return;

    default:
      if (cmd.startsWith("/")) {
        await tg.sendMessage(chatId, "Não entendi. Veja /ajuda.");
      } else {
        // texto livre = busca
        const hits = search(text);
        if (hits.length === 1) await sendParish(chatId, String(hits[0]!.id));
        else if (hits.length) await tg.sendMessage(chatId, "Você quis dizer:", parishListButtons(hits));
        else await tg.sendMessage(chatId, "Use /ajuda para ver os comandos.");
      }
  }
}

async function sendParish(chatId: number, id: string): Promise<void> {
  const p = byId(id);
  if (!p) {
    await tg.sendMessage(chatId, "Paróquia não encontrada. Veja /paroquias.");
    return;
  }
  if (p.image) {
    try {
      await tg.sendPhoto(chatId, p.image, `⛪ <b>${p.name}</b>`);
    } catch {
      /* imagem indisponivel -> segue sem foto */
    }
  }
  const buttons = [[{ text: "🗺️ Abrir no Google Maps", url: mapsLink(p) }]];
  await tg.sendMessage(chatId, parishCard(p), buttons);
  if (p.lat != null && p.lon != null) await tg.sendLocation(chatId, p.lat, p.lon);
}

async function handleLocation(chatId: number, lat: number, lon: number): Promise<void> {
  const near = nearest(lat, lon, 3);
  if (!near.length) {
    await tg.sendMessage(chatId, "Não consegui calcular distâncias agora. Veja /paroquias.");
    return;
  }
  const lines = ["📍 <b>Paróquias mais próximas de você:</b>\n"];
  for (const { parish, km } of near)
    lines.push(`⛪ <b>${parish.name}</b> — ${km.toFixed(1)} km`);
  await tg.sendMessage(
    chatId,
    lines.join("\n"),
    near.map(({ parish }) => [{ text: `⛪ ${parish.name}`, callback_data: `p:${parish.id}` }]),
  );
}

async function handleUpdate(u: TgUpdate): Promise<void> {
  try {
    if (u.callback_query) {
      const cq = u.callback_query;
      const chatId = cq.message?.chat.id;
      await tg.answerCallback(cq.id);
      if (chatId && cq.data?.startsWith("p:")) await sendParish(chatId, cq.data.slice(2));
      return;
    }
    const msg = u.message;
    if (!msg) return;
    if (msg.location) {
      await handleLocation(msg.chat.id, msg.location.latitude, msg.location.longitude);
      return;
    }
    if (msg.text) await handleText(msg.chat.id, msg.text);
  } catch (e) {
    console.error("handleUpdate erro:", (e as Error).message);
  }
}

/** dispara aviso diario 1x por dia na hora configurada (America/Sao_Paulo) */
async function dailyTick(): Promise<void> {
  const now = new Date();
  const hh = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (hh !== DAILY_HOUR) return;
  if (store.getMeta("lastDaily") === today) return;
  store.setMeta("lastDaily", today);
  const subs = store.subscribers();
  console.log(`[daily] enviando p/ ${subs.length} assinantes`);
  for (const chatId of subs) {
    try {
      await sendToday(chatId, 0);
    } catch (e) {
      console.error(`[daily] falha chat ${chatId}:`, (e as Error).message);
    }
  }
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("Defina TELEGRAM_BOT_TOKEN antes de iniciar o bot.");
    process.exit(1);
  }
  await loadParishes();
  const me = await tg.getMe();
  console.log(`Bot @${me.username} online — ${all().length} paróquias carregadas.`);
  await tg.setMyCommands([
    { command: "hoje", description: "Missas de hoje" },
    { command: "amanha", description: "Missas de amanhã" },
    { command: "paroquias", description: "Lista de paróquias" },
    { command: "missa", description: "Buscar uma paróquia" },
    { command: "perto", description: "Paróquias mais próximas" },
    { command: "seguir", description: "Aviso diário" },
    { command: "parar", description: "Cancelar aviso diário" },
    { command: "ajuda", description: "Ajuda" },
  ]);

  setInterval(() => void dailyTick(), 60_000);

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg.getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u);
      }
    } catch (e) {
      console.error("polling erro:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

void main();
