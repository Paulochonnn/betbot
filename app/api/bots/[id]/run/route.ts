import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUpcomingMatches, type OddsMatch } from "@/lib/odds";
import { analyzeMatches, type ClaudeAnalysis } from "@/lib/claude";
import { kellyStake } from "@/lib/kelly";
import { resolvePendingBets } from "@/lib/resolve";

// Analyses older than this are re-run even if odds haven't changed, so stale SKIP
// decisions from a previous bad LLM response don't block the bot indefinitely.
const ANALYSIS_TTL_MS = 6 * 60 * 60 * 1000;

// Round to 1 decimal → minor odds changes (±0.05) don't invalidate the cache
function computeOddsHash(match: OddsMatch): string {
  return match.outcomes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => o.price.toFixed(1))
    .join(",");
}

// Short hash of prompt+minEdge — any change invalidates cached analyses
function computeBotHash(systemPrompt: string, minEdge: number): string {
  let h = 0;
  const str = systemPrompt + "|" + minEdge.toFixed(4);
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16).slice(0, 8);
}

function kellyFraction(prob: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  return (prob * b - (1 - prob)) / b;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) return NextResponse.json({ error: "Bot introuvable" }, { status: 404 });
  if (bot.status !== "active") {
    return NextResponse.json({ error: "Le bot est en pause" }, { status: 400 });
  }

  if (!force && bot.lastRunAt && Date.now() - bot.lastRunAt.getTime() < 60_000) {
    return NextResponse.json({ resolved: 0, matchesAnalyzed: 0, betsPlaced: 0, bets: [], skipped: [], combinedBetsPlaced: 0 });
  }

  if (force) {
    await prisma.matchAnalysis.deleteMany({ where: { botId: id } });
    console.log(`[run] force=true — cleared analysis cache for bot ${id}`);
  }

  await prisma.bot.update({ where: { id }, data: { lastRunAt: new Date() } });

  const resolved = await resolvePendingBets();
  const sports = bot.sports.split(",").map((s) => s.trim());
  const allMatches = await getUpcomingMatches(sports);

  const pendingBets = await prisma.bet.findMany({
    where: { botId: id, status: "pending" },
    select: { matchId: true },
  });
  const pendingMatchIds = new Set(pendingBets.map((b) => b.matchId));
  const newMatches = allMatches.filter((m) => !pendingMatchIds.has(m.id));

  if (newMatches.length === 0) {
    return NextResponse.json({ resolved, matchesAnalyzed: 0, betsPlaced: 0, bets: [], skipped: [], combinedBetsPlaced: 0 });
  }

  // Partition: reuse cached analysis si les cotes n'ont pas changé (cache par bot)
  const botHash = computeBotHash(bot.systemPrompt, bot.minEdge);
  const existingAnalyses = await prisma.matchAnalysis.findMany({
    where: { botId: id, matchId: { in: newMatches.map((m) => m.id) } },
  });
  const analysisCache = new Map(existingAnalyses.map((a) => [a.matchId, a]));

  const toAnalyze: OddsMatch[] = [];
  const cachedResults: ClaudeAnalysis[] = [];

  for (const match of newMatches) {
    const cached = analysisCache.get(match.id);
    const fresh = cached && Date.now() - cached.analyzedAt.getTime() < ANALYSIS_TTL_MS;
    const expectedHash = computeOddsHash(match) + "|" + botHash;
    if (cached && fresh && cached.oddsHash === expectedHash) {
      cachedResults.push({
        matchId: match.id,
        decision: cached.decision as "BET" | "SKIP",
        pick: cached.pick,
        odds: cached.odds,
        estimatedProb: cached.estimatedProb,
        edge: cached.edge,
        reasoning: cached.reasoning,
      });
    } else {
      toAnalyze.push(match);
    }
  }

  console.log(`[run] cache=${cachedResults.length} llm=${toAnalyze.length}/${newMatches.length} matches`);

  let llmResults: ClaudeAnalysis[] = [];

  if (toAnalyze.length > 0) {
    try {
      llmResults = await analyzeMatches(
        { systemPrompt: bot.systemPrompt, minEdge: bot.minEdge, maxKelly: bot.maxKelly, bankroll: bot.bankroll },
        toAnalyze
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429");

      let warning: string;
      if (is429) {
        const isDaily = msg.includes("[DAILY]");
        const resetMatch = msg.match(/reset=(\d+)/);
        if (isDaily) {
          if (resetMatch) {
            const raw = parseInt(resetMatch[1], 10);
            const resetDate = new Date(raw < 1e12 ? raw * 1000 : raw);
            const resetStr = resetDate.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
            warning = `Limite journaliere OpenRouter atteinte. Reinitialisation a ${resetStr} (heure Paris).`;
          } else {
            warning = "Limite journaliere OpenRouter atteinte. Reinitialisation a minuit UTC.";
          }
        } else {
          warning = "Le modele payant OpenRouter a echoue sur ce cycle. Verifie les logs serveur pour le detail exact.";
        }
        return NextResponse.json({ resolved, matchesAnalyzed: newMatches.length, betsPlaced: 0, bets: [], skipped: [], combinedBetsPlaced: 0, warning });
      }

      console.error("[run] analyzeMatches error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Persist new LLM results
    const matchMap = new Map(toAnalyze.map((m) => [m.id, m]));
    await Promise.all(
      llmResults.map((a) => {
        const match = matchMap.get(a.matchId);
        if (!match) return;
        const hash = computeOddsHash(match) + "|" + botHash;
        return prisma.matchAnalysis.upsert({
          where: { botId_matchId: { botId: id, matchId: a.matchId } },
          create: { botId: id, matchId: a.matchId, decision: a.decision, pick: a.pick, odds: a.odds, estimatedProb: a.estimatedProb, edge: a.edge, reasoning: a.reasoning, oddsHash: hash, matchDate: new Date(match.matchDate) },
          update: { decision: a.decision, pick: a.pick, odds: a.odds, estimatedProb: a.estimatedProb, edge: a.edge, reasoning: a.reasoning, oddsHash: hash, matchDate: new Date(match.matchDate), analyzedAt: new Date() },
        });
      })
    );
  }

  await prisma.matchAnalysis.deleteMany({ where: { botId: id, matchDate: { lt: new Date() } } });

  const freshBot = await prisma.bot.findUnique({ where: { id } });
  if (freshBot?.status !== "active") {
    return NextResponse.json({ resolved, matchesAnalyzed: newMatches.length, betsPlaced: 0, bets: [], skipped: ["Bot mis en pause pendant l'analyse"], combinedBetsPlaced: 0 });
  }

  const analyses = [...cachedResults, ...llmResults];
  const allAnalysesMap = new Map(analyses.map((a) => [a.matchId, a]));
  const matchDataMap = new Map(newMatches.map((m) => [m.id, m]));
  const placedBets: object[] = [];
  const skipped: string[] = [];
  let currentBankroll = freshBot.bankroll;

  // ── Individual bets ───────────────────────────────────────
  if (!freshBot.enableCombined || freshBot.alsoIndividual) {
    for (const match of newMatches) {
      const analysis = allAnalysesMap.get(match.id);
      const label = `${match.homeTeam} vs ${match.awayTeam}`;

      if (!analysis) { skipped.push(`${label} (pas d'analyse LLM)`); continue; }
      if (analysis.decision !== "BET" || !analysis.pick) { skipped.push(`${label} (SKIP)`); continue; }
      if (analysis.edge < bot.minEdge) { skipped.push(`${label} (edge ${(analysis.edge * 100).toFixed(1)}% < seuil)`); continue; }

      const stake = kellyStake(currentBankroll, analysis.estimatedProb, analysis.odds, freshBot.maxKelly);
      if (stake < 0.5) { skipped.push(`${label} (mise ${stake.toFixed(2)} EUR < 0.50 EUR)`); continue; }

      const [bet] = await prisma.$transaction([
        prisma.bet.create({
          data: {
            botId: id, matchId: match.id, sport: match.sport, sportKey: match.sportKey,
            league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
            pick: analysis.pick, odds: analysis.odds, estimatedProb: analysis.estimatedProb,
            edge: analysis.edge, stake, reasoning: analysis.reasoning,
            matchDate: new Date(match.matchDate),
          },
        }),
        prisma.bot.update({ where: { id }, data: { bankroll: { decrement: stake } } }),
      ]);

      currentBankroll -= stake;
      placedBets.push(bet);
    }
  }

  // ── Combined bet ─────────────────────────────────────────
  let combinedBetsPlaced = 0;
  const placedCombinedBets: object[] = [];

  if (freshBot.enableCombined) {
    const allBetCandidates = analyses
      .filter((a) => a.decision === "BET" && a.pick !== null && a.edge >= freshBot.minEdge)
      .sort((a, b) => b.edge - a.edge);

    if (allBetCandidates.length < freshBot.maxComboLegs) {
      console.log(`[run] combined skip: only ${allBetCandidates.length}/${freshBot.maxComboLegs} BET candidates`);
    } else {
      // Fetch all pending combined legs for this bot to avoid duplicates
      const existingPendingLegs = await prisma.combinedBetLeg.findMany({
        where: { combinedBet: { botId: id, status: "pending" } },
        select: { matchId: true },
      });
      const coveredMatchIds = new Set(existingPendingLegs.map((l) => l.matchId));

      // Pick top N candidates that aren't already in a pending leg
      const freshCandidates = allBetCandidates.filter((a) => !coveredMatchIds.has(a.matchId));

      if (freshCandidates.length < freshBot.maxComboLegs) {
        console.log(`[run] combined skip: ${freshCandidates.length} fresh candidates (${coveredMatchIds.size} blocked by pending legs)`);
      } else {
        const betCandidates = freshCandidates.slice(0, freshBot.maxComboLegs);
        const combinedOdds = betCandidates.reduce((p, a) => p * a.odds, 1);
        const estimatedProb = betCandidates.reduce((p, a) => p * a.estimatedProb, 1);
        const edge = estimatedProb - 1 / combinedOdds;

        // For large accumulators (5+ legs) the combined edge formula underestimates
        // value because individual edges compound non-linearly. Use a relaxed check:
        // combined edge must be > 0, individual legs already passed minEdge filter.
        const edgeThreshold = freshBot.maxComboLegs >= 5 ? 0 : freshBot.minEdge;

        if (edge < edgeThreshold) {
          console.log(`[run] combined skip: edge ${(edge*100).toFixed(1)}% < threshold ${(edgeThreshold*100).toFixed(1)}%`);
        } else {
          const fraction = Math.min(Math.max(kellyFraction(estimatedProb, combinedOdds), 0), freshBot.maxKelly);
          const stake = fraction * currentBankroll;

          if (stake < 0.5) {
            console.log(`[run] combined skip: stake ${stake.toFixed(2)} < 0.50`);
          } else {
            const legsData = betCandidates
              .map((a) => ({ a, match: matchDataMap.get(a.matchId) }))
              .filter((x): x is { a: ClaudeAnalysis; match: OddsMatch } => x.match !== undefined);

            if (legsData.length === freshBot.maxComboLegs) {
              const [combo] = await prisma.$transaction([
                prisma.combinedBet.create({
                  data: {
                    botId: id,
                    combinedOdds,
                    estimatedProb,
                    edge,
                    stake,
                    legs: {
                      create: legsData.map(({ a, match }) => ({
                        matchId: match.id,
                        sportKey: match.sportKey,
                        league: match.league,
                        homeTeam: match.homeTeam,
                        awayTeam: match.awayTeam,
                        matchDate: new Date(match.matchDate),
                        pick: a.pick!,
                        odds: a.odds,
                        estimatedProb: a.estimatedProb,
                      })),
                    },
                  },
                  include: { legs: true },
                }),
                prisma.bot.update({ where: { id }, data: { bankroll: { decrement: stake } } }),
              ]);

              currentBankroll -= stake;
              combinedBetsPlaced = 1;
              placedCombinedBets.push(combo);
              console.log(`[run] combined bet placed: ${betCandidates.map(a => a.matchId).join("+")} @ ${combinedOdds.toFixed(2)} edge=${(edge*100).toFixed(1)}% stake=${stake.toFixed(2)}`);
            }
          }
        }
      }
    }
  }

  return NextResponse.json({
    resolved,
    matchesAnalyzed: newMatches.length,
    betsPlaced: placedBets.length,
    bets: placedBets,
    skipped,
    combinedBetsPlaced,
    combinedBets: placedCombinedBets,
  });
}
