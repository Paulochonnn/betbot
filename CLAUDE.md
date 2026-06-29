# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Compile for production
npm start        # Run production server
npm run lint     # ESLint via next lint
npx prisma migrate dev   # Apply schema changes and generate client
npx prisma studio        # Open visual DB browser
```

No test framework is configured yet.

## Environment Variables

Requires `.env.local` with:
- `DATABASE_URL` — SQLite path (e.g. `file:./dev.db`)
- `ANTHROPIC_API_KEY` — Claude API key
- `ODDS_API_KEY` — External odds data provider

## Architecture

Next.js 14 App Router full-stack app. TypeScript throughout. SQLite via Prisma. Tailwind CSS for styles.

**Path alias:** `@/*` maps to the project root (configured in `tsconfig.json`).

### Data Models (`prisma/schema.prisma`)

- **Bot** — a configured AI betting agent with `bankroll`, `initialBankroll`, `systemPrompt`, `maxKelly` (fraction cap, default 0.05), `minEdge` (default 0.05), and `sports` (comma-separated list)
- **Bet** — a single wager placed by a bot, recording `odds`, `estimatedProb`, `edge`, `stake`, `reasoning` (Claude's explanation), `status` (pending/resolved), and `profit`

### Key Libraries (`lib/`)

- `lib/kelly.ts` — Kelly Criterion stake sizing: `stake = bankroll × clamp(kelly, 0, maxFraction)` where `kelly = (b×p - (1-p)) / b`. This is the core bankroll management logic.
- `lib/prisma.ts` — Prisma client singleton (standard Next.js pattern to avoid exhausting connections in dev).

### API Routes (`app/api/`)

Directory structure is defined but route handlers are not yet implemented:
- `bots/[id]/run/` — execute a bot (fetch odds → call Claude → apply Kelly → persist Bet)
- `bets/` — bet CRUD
- `resolve/` — mark bets as won/lost and update bankroll

### Intended Data Flow

1. User creates a Bot (bankroll, sports, system prompt, Kelly/edge thresholds)
2. Bot run endpoint fetches live odds (via `ODDS_API_KEY`)
3. Odds + bot's `systemPrompt` are sent to Claude; Claude returns `estimatedProb` and `reasoning`
4. `lib/kelly.ts` sizes the stake given current `bankroll` and bot's `maxKelly`
5. Bet saved as `pending`; after match resolves, profit calculated and `bankroll` updated
