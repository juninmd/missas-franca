export const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT ?? "";
/** hora local (America/Sao_Paulo) do aviso diario */
export const DAILY_HOUR = Number(process.env.DAILY_HOUR ?? 7);

if (!TOKEN && import.meta.main) {
  console.error("Falta TELEGRAM_BOT_TOKEN no ambiente (.env)");
}
