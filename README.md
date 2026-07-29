# 🎮 CIYAAL XAMAR — Discord Bot

Discord Mafia game bot — **!dilaay** (Mafia/Killer Game) + Ticket System

## ⚡ Bilaabida

```bash
npm install
cp .env.example .env
# .env waxaad ku dartaa: DISCORD_BOT_TOKEN=token-kaaga
npm start
```

## 🎮 Commands

| Command | Sharax |
|---------|--------|
| `!dilaay` | Lobby cusub bilow — Mafia Ciyaarta |
| `!kasaar @user` | Host: ciyaaryahan lobby ka saar (mention) |
| `!dilaay @user kasaar` | Sidoo kale lobby ka saar (mention) |
| `!join` | Bot VC-ga ku soo gal (24/7) |
| `!leave` | Bot VC-ka ka saar |
| `!icaawi [farriin]` | Cilad owner-ka u dir |
| `!say` | Bot-ku fariin diro (Admin) |
| `!dashboard` | Serverrada arag (Owner) |
| `!dm @qof farriin` | DM gaar ah (Owner) |
| `!news farriin` | Dhammaan dadka DM u dir (Owner) |
| `/setup` | Ticket System setup (Admin) |

## 🔪 Sida loo ciyaaro !dilaay

1. `!dilaay` — Lobby fur (adiga waxaad noqon doontaa host)
2. Lobby-ga ku biir: **JOIN** batoon riix
3. Host: **START** riix (ugu yaraan 5 ciyaaryahan)
4. DM-kaaga u fiir doorarkaaga (Dilaaye / Dhakhtar / Sheriff / Shacab)
5. Habeenka: Dilaayuhu qof dileyaa, Dhakhtar qof badbaadiya, Sheriff qof toogta
6. Maalinta: Codbixin — cidda ugu badan codadka ayaa la saara

## 🎭 Doorarka

| Door | Sharax |
|------|--------|
| 🔪 Dilaaye | Habeenka qof dil |
| 🩺 Dhakhtar | Habeenka qof badbaadi |
| ⭐ Sheriff/Atoore | Habeenka Dilaaye toog |
| 👤 Shacab | Maalinta Dilaayaha saar codbixin |

## 📁 Structure

```
├── index.js       ← Main bot
├── game.js        ← Game state & roles
├── embeds.js      ← Discord embeds
├── phases.js      ← Night/Day phases
├── bot/           ← Ticket system handlers
└── ticket-bot/    ← TypeScript version
```

## 🤖 Required Bot Permissions
- Manage Channels, Manage Roles
- Send Messages, Read Message History
- Use External Emojis, Add Reactions
- SERVER MEMBERS INTENT ✅
- MESSAGE CONTENT INTENT ✅
