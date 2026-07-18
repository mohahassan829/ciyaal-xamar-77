# 🎮 CIYAAL XAMAR — Discord Bot

Discord bot oo leh:
- 💣 **!bomb** — Bomb Survival game
- 🔪 **!dilaay** — Mafia game  
- 🎫 **/setup** — Ticket System (ticket-bot/ folder)

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
| `!bomb` | Lobby cusub bilow — Bomb Survival |
| `!dilaay` | Lobby cusub bilow — Mafia Ciyaarta |
| `!kasaar` | Host: ciyaaryahan lobby ka saar |
| `!work` | $500 kasub (2 saac kasta) |
| `!balance` | Lacagtaada arag |
| `!givecash @qof xad` | Lacag u dir |
| `!join` | Bot VC-ga ku soo gal |
| `!leave` | Bot VC-ka ka saar |
| `!help` | Amarrada oo dhan |
| `/setup` | Ticket System setup (Admin) |

## 📁 Structure
```
├── index.js          ← Main bot (!bomb + !dilaay + more)
├── game.js           ← !dilaay game state
├── embeds.js         ← !dilaay embed builders
├── phases.js         ← !dilaay night/day phases
├── src/
│   ├── commands.js   ← !bomb commands
│   ├── game.js       ← BombGame class
│   ├── interactions.js ← !bomb button handlers
│   ├── economy.js    ← Economy system
│   └── tax.js        ← Auto tax scheduler
├── ticket-bot/       ← /setup Ticket System
└── data/             ← Auto-created storage
```

## 🤖 Bot Permissions
- Manage Channels, Manage Roles
- View Channels, Send Messages
- Read Message History, Attach Files
- Use Application Commands
