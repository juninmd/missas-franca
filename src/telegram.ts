import { TOKEN } from "./config";

const API = (m: string) => `https://api.telegram.org/bot${TOKEN}/${m}`;

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result as T;
}

export type InlineButton = { text: string; callback_data?: string; url?: string };

export const tg = {
  sendMessage: (
    chat_id: number | string,
    text: string,
    keyboard?: InlineButton[][],
  ) =>
    call("sendMessage", {
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),

  sendPhoto: (
    chat_id: number | string,
    photo: string,
    caption?: string,
    keyboard?: InlineButton[][],
  ) =>
    call("sendPhoto", {
      chat_id,
      photo,
      ...(caption ? { caption, parse_mode: "HTML" } : {}),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),

  sendLocation: (chat_id: number | string, latitude: number, longitude: number) =>
    call("sendLocation", { chat_id, latitude, longitude }),

  answerCallback: (callback_query_id: string, text?: string) =>
    call("answerCallbackQuery", { callback_query_id, ...(text ? { text } : {}) }),

  setMyCommands: (commands: { command: string; description: string }[]) =>
    call("setMyCommands", { commands }),

  getMe: () => call<{ id: number; username: string; first_name: string }>("getMe", {}),

  getUpdates: (offset: number, timeout = 25) =>
    call<TgUpdate[]>("getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message", "callback_query"],
    }),
};

export type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    location?: { latitude: number; longitude: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
};
