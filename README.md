# Budgetify Bot

Telegram bot for processing financial transactions using AI (Google Gemini). Migrated from Google Apps Script to Node.js + TypeScript.

## Features

- 📝 Process text messages describing transactions
- 📸 Analyze receipt images using Gemini Vision
- 🎤 Transcribe and process voice messages
- 💾 Store transactions in Google Sheets
- 🔄 Conversation context for follow-up messages
- ✅ Confirm/Cancel buttons for transaction approval

## Prerequisites

- [Bun](https://bun.sh) (latest version)
- Google Cloud Service Account with Sheets API enabled
- Telegram Bot Token
- Google Gemini API Key
- Google Sheets Spreadsheet ID

## Setup

1. **Install Bun** (if not already installed):
```bash
curl -fsSL https://bun.sh/install | bash
```

2. **Clone and install dependencies:**
```bash
bun install
```

3. **Configure environment variables:**
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required variables:
- `TELEGRAM_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_ID` - Your Telegram chat ID (for security)
- `GEMINI_API_KEY` - Google Gemini API key
- `GOOGLE_SHEETS_SPREADSHEET_ID` - Your Google Sheets spreadsheet ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON file
  OR
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account JSON as string

4. **Google Sheets Setup:**
Your spreadsheet should have these sheets:
- `CONFIG` - Configuration with accounts, categories, subcategories
- `MIS_DATOS` - Personal data (name, aliases, CBU, CUIT)
- `GASTOS` - Expenses sheet
- `INGRESOS` - Income sheet
- `TRANSFERENCIAS` - Transfers sheet

5. **Run the server:**
```bash
bun run src/server.ts
```

For development with hot reload:
```bash
bun --watch src/server.ts
```

**Note:** Bun runs TypeScript directly - no build step needed! 🚀

## Deployment to Fly.io

1. **Install Fly CLI:**
```bash
curl -L https://fly.io/install.sh | sh
```

2. **Login to Fly:**
```bash
fly auth login
```

3. **Deploy:**
```bash
fly deploy
```

4. **Set environment variables:**
```bash
fly secrets set TELEGRAM_TOKEN=your_token
fly secrets set TELEGRAM_CHAT_ID=your_chat_id
fly secrets set GEMINI_API_KEY=your_key
fly secrets set GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
fly secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
fly secrets set WEBHOOK_URL=https://your-app.fly.dev
```

5. **Set webhook:**
The webhook is automatically set on startup, or you can set it manually:
```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.fly.dev/webhook
```

## Project Structure

```
budgetify/
├── src/
│   ├── config/          # Configuration management
│   ├── bot/             # Telegram bot handlers
│   ├── ai/              # Gemini AI client and prompts
│   ├── sheets/          # Google Sheets client
│   ├── services/        # Business logic services
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utilities (logger, errors)
│   └── server.ts        # Express server
├── tests/               # Test files
├── legacy/              # Legacy Google Apps Script files
├── package.json
├── tsconfig.json
├── Dockerfile
└── fly.toml
```

## Commands

- `bun run src/server.ts` - Start production server
- `bun --watch src/server.ts` - Start development server with hot reload
- `bun test` - Run tests
- `bun run type-check` - Type check without running
- `bun run lint` - Lint code

**Note:** Bun runs TypeScript directly, so there's no separate build step!

## Migration Notes

This project was migrated from Google Apps Script to Bun + TypeScript. Key changes:

- **PropertiesService** → In-memory storage with TTL (can be replaced with Redis)
- **SpreadsheetApp** → Google Sheets API v4
- **UrlFetchApp** → Axios
- **Logger** → Custom logger with timestamps
- **doPost()** → Express webhook endpoint
- **Runtime** → Bun (faster than Node.js, runs TypeScript natively!)

## License

MIT

