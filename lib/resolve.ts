import { prisma } from "./prisma";
import { getScoresBySportKey } from "./odds";

function determineResult(
  pick: string,
  homeTeam: string,
  awayTeam: string,
  scores: { name: string; score: string }[]
): "won" | "lost" | null {
  const homeScore = scores.find((s) => s.name === homeTeam);
  const awayScore = scores.find((s) => s.name === awayTeam);
  if (!homeScore || !awayScore) return null;

  const home = parseInt(homeScore.score, 10);
  const away = parseInt(awayScore.score, 10);
  if (isNaN(home) || isNaN(away)) return null;

  if (home > away) return pick === homeTeam ? "won" : "lost";
  if (away > home) return pick === awayTeam ? "won" : "lost";
  return pick === "Draw" ? "won" : "lost";
}

export async function resolvePendingBets(): Promise<number> {
  const now = new Date();
  let resolvedCount = 0;

  // ── Individual bets ──────────────────────────────────────
  const pendingBets = await prisma.bet.findMany({
    where: { status: "pending", matchDate: { lt: now } },
    include: { bot: true },
  });

  if (pendingBets.length > 0) {
    const bySportKey = pendingBets.reduce<Record<string, typeof pendingBets>>((acc, bet) => {
      (acc[bet.sportKey] ??= []).push(bet);
      return acc;
    }, {});

    for (const [sportKey, bets] of Object.entries(bySportKey)) {
      // Ignorer les anciens sport keys The Odds API (format "soccer_france_ligue1")
      // Les nouveaux utilisent des league slugs odds-api.io (format "france-ligue-1")
      if (!sportKey.includes("-")) continue;

      const scores = await getScoresBySportKey(sportKey);
      const scoresById = new Map(scores.map((s) => [s.id, s]));

      for (const bet of bets) {
        const scoreData = scoresById.get(bet.matchId);
        if (!scoreData?.completed || !scoreData.scores) continue;

        const result = determineResult(bet.pick, bet.homeTeam, bet.awayTeam, scoreData.scores);
        if (!result) continue;

        const profit = result === "won" ? bet.stake * (bet.odds - 1) : -bet.stake;

        await prisma.$transaction([
          prisma.bet.update({ where: { id: bet.id }, data: { status: result, profit, resolvedAt: new Date() } }),
          prisma.bot.update({
            where: { id: bet.botId },
            data: { bankroll: { increment: result === "won" ? bet.stake + profit : 0 } },
          }),
        ]);

        resolvedCount++;
      }
    }
  }

  // ── Combined bets ────────────────────────────────────────
  const pendingCombos = await prisma.combinedBet.findMany({
    where: { status: "pending" },
    include: { legs: true, bot: true },
  });

  for (const combo of pendingCombos) {
    const pastLegs = combo.legs.filter((l) => l.matchDate < now && l.status === "pending");
    if (pastLegs.length === 0) continue;

    // Fetch scores — ignorer les anciens sport keys The Odds API (sans tiret)
    const sportKeys = Array.from(new Set(pastLegs.map((l) => l.sportKey))).filter((sk) => sk.includes("-"));
    const scoresById = new Map<string, Awaited<ReturnType<typeof getScoresBySportKey>>[number]>();
    for (const sk of sportKeys) {
      const scores = await getScoresBySportKey(sk);
      scores.forEach((s) => scoresById.set(s.id, s));
    }

    // Resolve each past leg
    for (const leg of pastLegs) {
      const scoreData = scoresById.get(leg.matchId);
      if (!scoreData?.completed || !scoreData.scores) continue;

      const result = determineResult(leg.pick, leg.homeTeam, leg.awayTeam, scoreData.scores);
      if (!result) continue;

      await prisma.combinedBetLeg.update({ where: { id: leg.id }, data: { status: result } });
    }

    // Re-fetch legs to check overall status
    const updatedLegs = await prisma.combinedBetLeg.findMany({ where: { combinedBetId: combo.id } });
    const anyLost    = updatedLegs.some((l) => l.status === "lost");
    const allDone    = updatedLegs.every((l) => l.status !== "pending");

    if (anyLost) {
      // At least one leg lost — combo is lost immediately
      await prisma.combinedBet.update({
        where: { id: combo.id },
        data: { status: "lost", profit: -combo.stake, resolvedAt: new Date() },
      });
      resolvedCount++;
    } else if (allDone) {
      // All legs won
      const profit = combo.stake * (combo.combinedOdds - 1);
      await prisma.$transaction([
        prisma.combinedBet.update({ where: { id: combo.id }, data: { status: "won", profit, resolvedAt: new Date() } }),
        prisma.bot.update({ where: { id: combo.bot.id }, data: { bankroll: { increment: combo.stake + profit } } }),
      ]);
      resolvedCount++;
    }
  }

  return resolvedCount;
}
