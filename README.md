# 🎫 CIYAAL XAMAR — Discord Ticket Bot

Discord bot ah oo leh ticket system oo buuxa.

## ⚡ Features

- `/setup` — Admin wuxuu samaynayaa config (categories, staff roles, embed)
- **🎫 Open Ticket** — User-ku wuxuu abuuro channel cusub `ticket-{username}`
- **👮 Claim Ticket** — Staff-ku wuxuu qaataa ticket (hal staff oo kaliya)
- **🔒 Close Ticket** — Xirista ticket-ka leh confirmation
- **📋 Transcript** — History-ga ticket-ka auto-save (.txt file)
- **🚫 One ticket** — User ma samayn karo laba ticket oo furan isla mar

## 🛠️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. .env file samee
```bash
cp .env.example .env
```

`.env` waxaad ku dartaa:
```
DISCORD_BOT_TOKEN=your_token_here
```

### 3. Bot bilaabi
```bash
npm start
```

## 🤖 Discord Bot Permissions

Bot-ka Discord-ka ku dar isticmaalka permissions-kan:
- `Manage Channels`
- `Manage Roles`
- `View Channels`
- `Send Messages`
- `Read Message History`
- `Attach Files`

**Bot Invite Link:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

## 📋 Isticmaalka

### Admin (/setup)
1. `/setup` qoro server-kaaga
2. **Open Ticket Category** dooro
3. **Closed Ticket Category** dooro
4. **Staff Roles** dooro
5. **Embed Title & Description** geli
6. **Channel** dooro embed-ka lagu soo diro

### User
1. Channel-ka ku riix **🎫 Open Ticket**
2. Ticket channel cusub ayaa la abuuri doonaa
3. Dhibaatadaada sharax
4. Staff-ka sug

### Staff
- **👮 Claim Ticket** — Ticket-ka qaado (hal staff)
- **🔒 Close Ticket** — Ticket xir → Confirm → Channel waxaa lagu wareejiyaa Closed Category

## 📁 File Structure
```
ciyaal-xamar-bot/
├── index.js                    # Entry point
├── bot/
│   ├── index.js                # Bot client + event handlers
│   ├── deploy.js               # Slash command registration
│   ├── storage.js              # JSON file persistence
│   ├── commands/
│   │   └── setup.js            # /setup command flow
│   └── handlers/
│       └── tickets.js          # Open/Claim/Close handlers
├── data/                       # Auto-created (guild configs + tickets)
├── .env                        # Token (ha git-ka gelinin!)
├── .env.example
└── package.json
```
