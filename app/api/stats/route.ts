import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_MODELS = [
  "meta-llama/llama-3.1-8b-instruct",
] as const;

const envModels = (process.env.OPENROUTER_MODELS ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const MODELS = envModels.length > 0 ? envModels : [...DEFAULT_MODELS];

export async function GET() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [stats, recentLogs, oddsLastHour, oddsLastDay] = await Promise.all([
    prisma.apiStats.findUnique({ where: { id: "singleton" } }),
    prisma.lLMCallLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.oddsApiCallLog.findMany({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.oddsApiCallLog.findMany({ where: { createdAt: { gte: oneDayAgo } } }),
  ]);

  const modelStats = MODELS.map((model) => {
    const calls      = recentLogs.filter((l) => l.model === model);
    const successful = calls.filter((l) => l.success);
    const failed     = calls.filter((l) => !l.success);
    const sparkline  = successful.slice(-30).map((l) => l.outputTokens);

    return {
      model,
      totalCalls:  successful.length,
      failedCalls: failed.length,
      totalTokens: successful.reduce((s, c) => s + c.outputTokens + c.inputTokens, 0),
      avgTokens:   successful.length > 0
        ? Math.round(successful.reduce((s, c) => s + c.outputTokens, 0) / successful.length)
        : 0,
      sparkline,
    };
  });

  const oddsCallsLastHour   = oddsLastHour.length;
  const oddsSuccessLastHour = oddsLastHour.filter((l) => l.success).length;
  const oddsCallsLastDay    = oddsLastDay.length;
  const oddsSuccessRate     = oddsCallsLastHour > 0
    ? Math.round((oddsSuccessLastHour / oddsCallsLastHour) * 100)
    : 100;

  return NextResponse.json({
    ...(stats ?? {
      oddsRequestsUsed:      0,
      oddsRequestsRemaining: 500,
      claudeRequests:        0,
      claudeInputTokens:     0,
      claudeOutputTokens:    0,
      claudeCacheReadTokens: 0,
      updatedAt:             null,
    }),
    oddsCallsLastHour,
    oddsSuccessLastHour,
    oddsCallsLastDay,
    oddsSuccessRate,
    modelStats,
  });
}
