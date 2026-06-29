import { prisma } from "./prisma";

const BASE_URL = "https://api.odds-api.io/v3";
const BOOKMAKERS = "Bet365,Winamax FR";
const ODDS_CHUNK = 10; // max eventIds per /odds/multi call

const CACHE_TTL_MS       = 12 * 60 * 60 * 1000; // 12h — cotes
const EMPTY_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72h — ligue hors-saison
const SCORES_CACHE_TTL_MS = 30 * 60 * 1000;      // 30 min — scores

export type OddsOutcome = { name: string; price: number };

export type OddsMatch = {
  id: string;
  sportKey: string; // league slug, ex: "france-ligue-1"
  sport: string;    // "soccer" | "basketball" | "tennis"
  league: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  outcomes: OddsOutcome[];
};

export type ScoreResult = {
  id: string;
  sportKey: string;
  completed: boolean;
  homeTeam: string;
  awayTeam: string;
  scores: { name: string; score: string }[] | null;
};

// Notre catégorie sport → slug odds-api.io
const SPORT_SLUG: Record<string, string> = {
  soccer: "football",
  basketball: "basketball",
  tennis: "tennis",
  hockey: "ice-hockey",
};

// Ligues statiques football + basket
const STATIC_LEAGUES: Record<string, { key: string; label: string }[]> = {
  soccer: [
    { key: "england-premier-league",                    label: "Premier League"    },
    { key: "france-ligue-1",                            label: "Ligue 1"           },
    { key: "spain-laliga",                              label: "La Liga"           },
    { key: "germany-bundesliga",                        label: "Bundesliga"        },
    { key: "italy-serie-a",                             label: "Serie A"           },
    { key: "international-clubs-uefa-champions-league", label: "Champions League"  },
    { key: "international-clubs-uefa-europa-league",    label: "Europa League"     },
  ],
  basketball: [
    { key: "usa-nba",                label: "NBA"        },
    { key: "international-euroleague", label: "EuroLeague" },
  ],
  hockey: [
    { key: "usa-nhl", label: "NHL" },
  ],
};

// Déduit le sport odds-api.io depuis un league slug
function sportFromSlug(slug: string): string {
  if (slug.startsWith("atp-") || slug.startsWith("wta-") ||
      slug.startsWith("challenger-") || slug.startsWith("itf-")) return "tennis";
  if (slug === "usa-nba" || slug === "international-euroleague") return "basketball";
  if (slug === "usa-nhl") return "ice-hockey";
  return "football";
}

type RawEvent = {
  id: number;
  home: string;
  away: string;
  date: string;
  status: string;
  league: { name: string; slug: string };
  bookmakers?: Record<string, Array<{ name: string; odds: Array<Record<string, string>> }>>;
  scores?: { home: number; away: number } | null;
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS  = 10_000;
const MAX_429_RETRIES   = 2;

async function apiFetch<T>(url: string): Promise<T | null> {
  const safeUrl = url.replace(/apiKey=[^&]+/, "apiKey=***");

  for (let attempt = 1; attempt <= MAX_429_RETRIES + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      // Track every HTTP round-trip
      prisma.oddsApiCallLog.create({ data: { success: res.ok } }).catch(() => {});
      prisma.apiStats.upsert({
        where: { id: "singleton" },
        create: { oddsRequestsUsed: 1 },
        update: { oddsRequestsUsed: { increment: 1 }, updatedAt: new Date() },
      }).catch(() => {});

      if (res.status === 429) {
        if (attempt <= MAX_429_RETRIES) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
          const delay = Math.min(retryAfter * 1000, attempt * 30_000);
          console.warn(`[OddsApiIO] 429 — retry ${attempt}/${MAX_429_RETRIES} in ${(delay / 1000).toFixed(0)}s`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.warn(`[OddsApiIO] 429 rate limit exhausted after ${MAX_429_RETRIES} retries — ${safeUrl}`);
        return null;
      }

      if (!res.ok) {
        console.warn(`[OddsApiIO] ${res.status} — ${safeUrl}`);
        return null;
      }

      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      prisma.oddsApiCallLog.create({ data: { success: false } }).catch(() => {});
      prisma.apiStats.upsert({
        where: { id: "singleton" },
        create: { oddsRequestsUsed: 1 },
        update: { oddsRequestsUsed: { increment: 1 }, updatedAt: new Date() },
      }).catch(() => {});

      if (err instanceof Error && err.name === "AbortError") {
        console.error(`[OddsApiIO] timeout after ${FETCH_TIMEOUT_MS / 1000}s — ${safeUrl}`);
      } else {
        console.error("[OddsApiIO] fetch error:", err);
      }
      return null;
    }
  }

  return null;
}

async function fetchEvents(sportSlug: string, leagueSlug: string, apiKey: string): Promise<RawEvent[]> {
  const url = `${BASE_URL}/events?sport=${sportSlug}&league=${encodeURIComponent(leagueSlug)}&apiKey=${apiKey}`;
  return (await apiFetch<RawEvent[]>(url)) ?? [];
}

async function fetchOddsMulti(ids: number[], apiKey: string): Promise<RawEvent[]> {
  if (ids.length === 0) return [];
  const url = `${BASE_URL}/odds/multi?eventIds=${ids.join(",")}&bookmakers=${encodeURIComponent(BOOKMAKERS)}&apiKey=${apiKey}`;
  return (await apiFetch<RawEvent[]>(url)) ?? [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Extrait les cotes 1X2 depuis les bookmakers (premier trouvé)
function extractOutcomes(event: RawEvent): OddsOutcome[] {
  for (const markets of Object.values(event.bookmakers ?? {})) {
    const ml = markets.find((m) => m.name === "ML" || m.name === "1X2" || m.name === "Match Odds");
    if (!ml?.odds[0]) continue;
    const o = ml.odds[0];
    const outcomes: OddsOutcome[] = [];
    if (o.home) outcomes.push({ name: event.home, price: parseFloat(o.home) });
    if (o.draw) outcomes.push({ name: "Draw",     price: parseFloat(o.draw) });
    if (o.away) outcomes.push({ name: event.away, price: parseFloat(o.away) });
    if (outcomes.length >= 2) return outcomes;
  }
  return [];
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getOddsCached(key: string): Promise<OddsMatch[] | null> {
  const entry = await prisma.oddsCache.findUnique({ where: { sportKey: key } });
  if (!entry) return null;
  const data = JSON.parse(entry.data) as OddsMatch[];
  const ttl = data.length === 0 ? EMPTY_CACHE_TTL_MS : CACHE_TTL_MS;
  return Date.now() - entry.fetchedAt.getTime() < ttl ? data : null;
}

async function saveOddsCache(key: string, matches: OddsMatch[]) {
  await prisma.oddsCache.upsert({
    where: { sportKey: key },
    create: { sportKey: key, data: JSON.stringify(matches), fetchedAt: new Date() },
    update: { data: JSON.stringify(matches), fetchedAt: new Date() },
  });
}

// ── Fetch + cache un ensemble de matchs pour une ligue ────────────────────────

async function fetchLeagueMatches(
  sport: string,
  leagueKey: string,
  leagueLabel: string,
  apiKey: string
): Promise<OddsMatch[]> {
  const sportSlug = SPORT_SLUG[sport] ?? "football";
  const events = await fetchEvents(sportSlug, leagueKey, apiKey);

  const now = new Date();
  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 5);

  const upcoming = events.filter((e) => {
    if (e.status !== "pending") return false;
    const d = new Date(e.date);
    return d >= now && d < windowEnd;
  });

  if (upcoming.length === 0) return [];

  // Récupérer les cotes en batch
  const oddsMap = new Map<number, RawEvent>();
  for (const ids of chunk(upcoming.map((e) => e.id), ODDS_CHUNK)) {
    const results = await fetchOddsMulti(ids, apiKey);
    for (const r of results) oddsMap.set(r.id, r);
  }

  return upcoming
    .map((event): OddsMatch | null => {
      const withOdds = oddsMap.get(event.id) ?? event;
      const outcomes = extractOutcomes(withOdds);
      if (outcomes.length === 0) return null;
      return {
        id: String(event.id),
        sportKey: leagueKey,
        sport,
        league: leagueLabel,
        homeTeam: event.home,
        awayTeam: event.away,
        matchDate: event.date,
        outcomes,
      };
    })
    .filter((m): m is OddsMatch => m !== null);
}

// ── Tennis : ligues dynamiques (tournois ATP/WTA changent chaque semaine) ─────

async function getTennisLeagues(apiKey: string): Promise<{ key: string; label: string }[]> {
  const CACHE_KEY = "__tennis_leagues__";
  const cached = await getOddsCached(CACHE_KEY);
  if (cached) return JSON.parse(JSON.stringify(cached)); // cached stores generic shape here

  const raw = await apiFetch<{ name: string; slug: string; eventsCount: number }[]>(
    `${BASE_URL}/leagues?sport=tennis&apiKey=${apiKey}`
  );
  if (!raw) return [];

  // Limit to top 4 tournaments by event count to cap LLM calls
  const MAX_TENNIS_LEAGUES = 4;
  const leagues = raw
    .filter(
      (l) =>
        (l.slug.startsWith("atp-") || l.slug.startsWith("wta-")) &&
        l.slug.includes("singles") &&
        !l.slug.includes("doubles") &&
        l.eventsCount > 0
    )
    .sort((a, b) => b.eventsCount - a.eventsCount)
    .slice(0, MAX_TENNIS_LEAGUES)
    .map((l) => ({ key: l.slug, label: l.name }));

  // Réutilise OddsCache avec un cast — on stocke juste la liste de ligues
  await prisma.oddsCache.upsert({
    where: { sportKey: CACHE_KEY },
    create: { sportKey: CACHE_KEY, data: JSON.stringify(leagues), fetchedAt: new Date() },
    update: { data: JSON.stringify(leagues), fetchedAt: new Date() },
  });

  return leagues;
}

// ── Exports publics ───────────────────────────────────────────────────────────

export async function getUpcomingMatches(sports: string[]): Promise<OddsMatch[]> {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) throw new Error("ODDS_API_IO_KEY manquant");

  const results: OddsMatch[] = [];

  for (const sport of sports) {
    const leagues =
      sport === "tennis"
        ? await getTennisLeagues(apiKey)
        : (STATIC_LEAGUES[sport] ?? []);

    for (const { key, label } of leagues) {
      const cached = await getOddsCached(key);
      if (cached) { results.push(...cached); continue; }

      const matches = await fetchLeagueMatches(sport, key, label, apiKey);
      await saveOddsCache(key, matches);
      results.push(...matches);
    }
  }

  return results;
}

// leagueSlug : ex "france-ligue-1" — stocké en tant que sportKey dans les paris
export async function getScoresBySportKey(leagueSlug: string): Promise<ScoreResult[]> {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) throw new Error("ODDS_API_IO_KEY manquant");

  // Cache
  const cached = await prisma.scoresCache.findUnique({ where: { sportKey: leagueSlug } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < SCORES_CACHE_TTL_MS) {
    return JSON.parse(cached.data) as ScoreResult[];
  }

  const sportSlug = sportFromSlug(leagueSlug);
  const events = await fetchEvents(sportSlug, leagueSlug, apiKey);

  const results: ScoreResult[] = events
    .filter((e) => e.status === "settled" && e.scores != null)
    .map((e) => ({
      id: String(e.id),
      sportKey: leagueSlug,
      completed: true,
      homeTeam: e.home,
      awayTeam: e.away,
      scores: e.scores
        ? [
            { name: e.home, score: String(e.scores.home) },
            { name: e.away, score: String(e.scores.away) },
          ]
        : null,
    }));

  await prisma.scoresCache.upsert({
    where: { sportKey: leagueSlug },
    create: { sportKey: leagueSlug, data: JSON.stringify(results), fetchedAt: new Date() },
    update: { data: JSON.stringify(results), fetchedAt: new Date() },
  });

  return results;
}
