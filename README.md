# Missas Franca 🙏

Bot de Telegram que avisa os **horários das missas das paróquias de Franca/SP** — com **foto da igreja**, endereço, localização (Google Maps + pin), pároco e clero, telefone, e-mail, expediente da secretaria e **capelas/comunidades** (cada uma com endereço e horários próprios).

Fonte oficial: [Diocese de Franca](https://diocesefranca.org.br) (missas, imagens, padres, capelas — sempre atual). Endereço/coordenadas/telefone da matriz são complementados pelo legado [horariodemissa.com.br](https://www.horariodemissa.com.br) só quando a diocese não informa.

Inspirado em [juninmd/diocese-franca-app](https://github.com/juninmd/diocese-franca-app), mas com dados reais (o app original usava seed/placeholder).

## Comandos

| Comando | O que faz |
|---|---|
| `/hoje` | Missas de hoje em todas as paróquias, ordenadas por horário |
| `/amanha` | Missas de amanhã |
| `/paroquias` | Lista de paróquias (botões → detalhes completos) |
| `/missa <nome>` | Busca uma paróquia (ex: `/missa catedral`) |
| `/perto` | Envie sua localização → paróquias mais próximas (distância real) |
| `/seguir` / `/parar` | Ativa/cancela o aviso diário automático |

## Stack

- **Bun** + TypeScript, sem framework (Telegram Bot API via `fetch`, long-poll)
- `bun:sqlite` para assinantes do aviso diário
- Geocoding via OpenStreetMap Nominatim (habilita `/perto` e o envio de pin)

## Dados — sempre atualizados

`data/paroquias.json` é gerado a partir do site da diocese. Rode o refresh (idealmente via cron diário):

```bash
bun run refresh   # descobre + raspa a Diocese + geocodifica -> data/paroquias.json
```

> **Honestidade de dados (QA):** paróquias sem horário publicado na fonte recebem
> aviso explícito + telefone + link oficial. O bot **nunca inventa** horário de missa.
> Toda mensagem traz a data da última atualização da fonte e o pedido de confirmar antes de ir.

## Rodar

```bash
cp .env.example .env    # preencha TELEGRAM_BOT_TOKEN e TELEGRAM_ADMIN_CHAT
bun run scrape          # 1a carga dos dados reais
bun run bot             # sobe o bot (long-poll)
```

Para broadcast em canal, adicione o bot como **administrador** do canal (permissão de postar).

## Estrutura

```
src/
  diocese.ts  # descoberta + parser do site da Diocese (missas, capelas, clero, imagens)
  build.ts    # scrape diocese + merge fallback (legado) + geocode -> data/paroquias.json
  data.ts     # carga, busca, missas do dia (matriz+capelas), nearest (Haversine)
  format.ts   # cartões/resumos em HTML do Telegram
  telegram.ts # wrapper mínimo da Bot API (msg, foto, localização)
  store.ts    # assinantes + meta (SQLite)
  bot.ts      # long-poll, comandos, callbacks, aviso diário
  refresh.ts  # dispara o build para cron
  scrape.ts   # (legado) scraper horariodemissa.com.br, usado só p/ fallback de endereço
```
