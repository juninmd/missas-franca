import { Database } from "bun:sqlite";

const db = new Database(new URL("../data/bot.sqlite", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
db.run(`CREATE TABLE IF NOT EXISTS subscribers (
  chat_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);

export const store = {
  subscribe(chatId: number): void {
    db.run("INSERT OR IGNORE INTO subscribers (chat_id, created_at) VALUES (?, ?)", [
      chatId,
      new Date().toISOString(),
    ]);
  },
  unsubscribe(chatId: number): void {
    db.run("DELETE FROM subscribers WHERE chat_id = ?", [chatId]);
  },
  isSubscribed(chatId: number): boolean {
    return !!db.query("SELECT 1 FROM subscribers WHERE chat_id = ?").get(chatId);
  },
  subscribers(): number[] {
    return db
      .query("SELECT chat_id FROM subscribers")
      .all()
      .map((r) => (r as { chat_id: number }).chat_id);
  },
  getMeta(k: string): string | null {
    const r = db.query("SELECT v FROM meta WHERE k = ?").get(k) as { v: string } | null;
    return r?.v ?? null;
  },
  setMeta(k: string, v: string): void {
    db.run("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?", [k, v, v]);
  },
};
