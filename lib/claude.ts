import type { OddsMatch } from "./odds";
import { prisma } from "./prisma";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = [
  "google/gemini-2.0-flash-001",
] as const;

const envModels = (process.env.OPENROUTER_MODELS ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const MODELS = envModels.length > 0 ? envModels : [...DEFAULT_MODELS];
const TIMEOUT_MS        = parseInt(process.env.OPENROUTER_TIMEOUT_MS        ?? "20000", 10);
const MAX_RETRIES       = parseInt(process.env.OPENROUTER_MAX_RETRIES       ?? "2",     10);
const MATCH_CHUNK_SIZE  = parseInt(process.env.OPENROUTER_MATCH_CHUNK_SIZE  ?? "6",     10);
const PARALLEL_CHUNKS   = parseInt(process.env.OPENROUTER_PARALLEL_CHUNKS   ?? "5",     10);

console.info(`[OpenRouter] active model chain: ${MODELS.join(" -> ")}`);

export type ClaudeAnalysis = {
  matchId: string;
  decision: "BET" | "SKIP";
  pick: string | null;
  odds: number;
  estimatedProb: number;
  edge: number;
  reasoning: string;
};

type Bot = {
  systemPrompt: string;
  minEdge: number;
  maxKelly: number;
  bankroll: number;
};

type OpenRouterResponse = {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  error?: { message: string };
};

class ModelUnavailableError extends Error {
  constructor(model: string) {
    super(`Model unavailable: ${model}`);
  }
}

class QuotaError extends Error {
  constructor(public readonly tag: "DAILY" | "PERMIN", public readonly resetAt?: number) {
    super(`Quota exceeded [${tag}]`);
  }
}

class UpstreamError extends Error {}
class InvalidOpenRouterResponseError extends Error {}

function safeJsonParse<T>(value: string): T | null {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildSystemPrompt(bot: Bot): string {
  return `Tu es un systeme d'analyse statistique sportive.

--- PROFIL ---
${bot.systemPrompt}

--- PARAMETRES ---
- Seuil de valeur minimum : ${(bot.minEdge * 100).toFixed(0)}%
- Fraction max (Kelly) : ${(bot.maxKelly * 100).toFixed(0)}%
- Capital disponible : EUR ${bot.bankroll.toFixed(2)}

--- INSTRUCTIONS ---
1. Pour chaque evenement, estime la probabilite reelle de chaque issue
2. Calcule la valeur : probabilite estimee - (1 / coefficient bookmaker)
3. Decide INVEST si valeur >= ${(bot.minEdge * 100).toFixed(0)}%, sinon PASS
4. Raisonnement en francais, 2-3 phrases
5. Reponds UNIQUEMENT avec le tableau JSON valide, sans markdown ni texte autour`;
}

function buildMatchesBlock(matches: OddsMatch[]): string {
  return matches
    .map((m, i) => {
      const odds = m.outcomes.map((o) => `${o.name}: ${o.price}`).join(" | ");
      return `${i + 1}. matchId="${m.id}" - ${m.homeTeam} vs ${m.awayTeam} (${m.league}, ${new Date(m.matchDate).toLocaleDateString("fr-FR")}) - Cotes: ${odds}`;
    })
    .join("\n");
}

function buildCombinedPrompt(bot: Bot, matches: OddsMatch[]): string {
  return `${buildSystemPrompt(bot)}

Analyse ces ${matches.length} evenements sportifs et retourne un tableau JSON avec une entree par evenement :

${buildMatchesBlock(matches)}

Format attendu (tableau JSON strict) :
[
  {
    "matchId": "id_exact_du_match",
    "decision": "INVEST" ou "PASS",
    "pick": "nom equipe/joueur ou null si PASS",
    "odds": 2.10,
    "estimated_prob": 0.52,
    "edge": 0.047,
    "reasoning": "explication en 2-3 phrases"
  }
]`;
}

function chunkMatches(matches: OddsMatch[], size: number): OddsMatch[][] {
  const chunks: OddsMatch[][] = [];
  for (let i = 0; i < matches.length; i += size) {
    chunks.push(matches.slice(i, i + size));
  }
  return chunks;
}

async function fetchModel(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY manquant");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "BetBot Simulator",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.min(maxTokens, 2048),
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });

    // Headers reçus → on annule le timeout avant de lire le body
    // sinon l'abort peut couper res.text() et retourner un body vide silencieux
    clearTimeout(timer);
    const body = await res.text().catch(() => "");
    const contentType = res.headers.get("content-type") ?? "";

    if (res.status === 404) throw new ModelUnavailableError(model);

    if (!res.ok) {
      console.error(`[OpenRouter] ${model} HTTP ${res.status}:`, body.slice(0, 300));

      if (res.status === 429) {
        const parsed = safeJsonParse<Record<string, unknown>>(body) ?? {};
        const errMsg: string = (parsed?.error as { message?: string })?.message ?? "";
        const metadata: Record<string, unknown> = (parsed?.error as { metadata?: Record<string, unknown> })?.metadata ?? {};
        const raw: string = (metadata?.raw as string) ?? "";
        const headers: Record<string, string> = (metadata?.headers as Record<string, string>) ?? {};

        console.error(`[OpenRouter] 429 detail - errMsg="${errMsg}" raw="${raw.slice(0, 120)}"`);

        if (raw.includes("rate-limited upstream") || raw.includes("temporarily")) {
          throw new UpstreamError(`Upstream 429 on ${model}: ${raw.slice(0, 80)}`);
        }

        const isDaily = errMsg.includes("per-day")
          || errMsg.includes("daily")
          || errMsg.includes("free-models-per-day")
          || metadata.ratelimit === "free-models-per-day";
        const resetRaw = (headers["X-RateLimit-Reset"] ?? metadata["X-RateLimit-Reset"] ?? "") as string;
        const resetAt = resetRaw ? parseInt(resetRaw, 10) : undefined;

        if (isDaily) throw new QuotaError("DAILY", resetAt);
        throw new QuotaError("PERMIN", resetAt);
      }

      if (res.status === 400) {
        const parsed = safeJsonParse<Record<string, unknown>>(body) ?? {};
        const errMsg: string = (parsed?.error as { message?: string })?.message ?? "";
        if (
          errMsg.includes("No endpoints found")
          || errMsg.includes("not a valid model ID")
          || errMsg.includes("Developer instruction is not enabled")
        ) {
          throw new ModelUnavailableError(model);
        }
      }

      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const parsed = safeJsonParse<OpenRouterResponse>(body);
    if (!parsed) {
      console.error(
        `[OpenRouter] ${model} invalid JSON — bodyLength=${body.length} contentType="${contentType}" body=${JSON.stringify(body.slice(0, 400))}`
      );
      throw new InvalidOpenRouterResponseError(`Invalid JSON response from OpenRouter (${model})`);
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithFallback(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
  let lastDailyError: QuotaError | null = null;
  const modelErrors: string[] = [];

  for (const model of MODELS) {
    let lastErr = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await fetchModel(model, messages, maxTokens);

        if (data.error) throw new Error(data.error.message);

        const text = data.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) throw new Error("Empty response");

        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;
        console.log(`[OpenRouter] success ${model} (attempt ${attempt}) - ${inputTokens}in / ${outputTokens}out`);

        await prisma.lLMCallLog.create({
          data: { model, inputTokens, outputTokens, success: true },
        }).catch(() => {});

        return { text, inputTokens, outputTokens, model };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErr = msg;

        if (err instanceof ModelUnavailableError) {
          console.warn(`[OpenRouter] ${model} unavailable, skipping`);
          break;
        }

        if (err instanceof QuotaError) {
          if (err.tag === "DAILY") {
            lastDailyError = err;
            console.warn(`[OpenRouter] ${model} daily quota reached, trying next model`);
          } else {
            console.warn(`[OpenRouter] ${model} rate limited, trying next model`);
          }
          break;
        }

        if (err instanceof UpstreamError) {
          if (attempt < MAX_RETRIES) {
            const delay = attempt * 2_000;
            console.warn(`[OpenRouter] ${model} upstream 429, retry in ${delay}ms`);
            await sleep(delay);
            continue;
          }
          console.warn(`[OpenRouter] ${model} upstream 429 after ${MAX_RETRIES} attempts, giving up`);
          break;
        }

        if (err instanceof InvalidOpenRouterResponseError) {
          if (attempt < MAX_RETRIES) {
            console.warn(`[OpenRouter] ${model} invalid JSON response, retrying`);
            await sleep(1_000);
            continue;
          }
          console.warn(`[OpenRouter] ${model} invalid JSON response after ${MAX_RETRIES} attempts, giving up`);
          break;
        }

        if (attempt < MAX_RETRIES) {
          console.warn(`[OpenRouter] ${model} error attempt ${attempt}: ${msg.slice(0, 80)}`);
          await sleep(1_500);
          continue;
        }
      }
    }

    if (lastErr) {
      modelErrors.push(`${model}: ${lastErr.slice(0, 120)}`);
      await prisma.lLMCallLog.create({
        data: { model, inputTokens: 0, outputTokens: 0, success: false },
      }).catch(() => {});
    }
  }

  if (lastDailyError) {
    const resetInfo = lastDailyError.resetAt ? ` reset=${lastDailyError.resetAt}` : "";
    throw new Error(`HTTP 429 [DAILY]${resetInfo}: all models exhausted daily quota`);
  }

  throw new Error(`[ALL_MODELS_FAILED]: ${modelErrors.join("\n")}`);
}

function parseChunkText(text: string, batch: OddsMatch[]): ClaudeAnalysis[] {
  let parsed: {
    matchId: string;
    decision: string;
    pick: string | null;
    odds: number;
    estimated_prob: number;
    edge: number;
    reasoning: string;
  }[];

  try {
    const stripped = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const arrayMatch = stripped.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(arrayMatch ? arrayMatch[0] : stripped);
  } catch {
    console.error("[OpenRouter] Non-JSON response:", text.slice(0, 200));
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, idx) => {
      const resolvedId = batch.find((m) => m.id === item.matchId)?.id ?? batch[idx]?.id;
      if (!resolvedId) return null;
      return {
        matchId: resolvedId,
        decision: (item.decision === "BET" || item.decision === "INVEST" ? "BET" : "SKIP") as "BET" | "SKIP",
        pick: item.pick ?? null,
        odds: item.odds ?? 0,
        estimatedProb: item.estimated_prob ?? 0,
        edge: item.edge ?? 0,
        reasoning: item.reasoning ?? "",
      };
    })
    .filter((x): x is ClaudeAnalysis => x !== null);
}

export async function analyzeMatches(bot: Bot, matches: OddsMatch[]): Promise<ClaudeAnalysis[]> {
  if (matches.length === 0) return [];

  const chunks = chunkMatches(matches, Math.max(1, MATCH_CHUNK_SIZE));
  const totalChunks = chunks.length;

  // Results indexed by chunk position to preserve order
  const chunkResults: Array<ClaudeAnalysis[]> = new Array(totalChunks).fill(null);
  const tokenTotals = { input: 0, output: 0 };
  let dailyQuotaError: Error | null = null;

  async function runChunk(batch: OddsMatch[], i: number) {
    if (dailyQuotaError) return;
    console.log(`[OpenRouter] analyzing chunk ${i + 1}/${totalChunks} (${batch.length} matches)`);
    const messages  = [{ role: "user", content: buildCombinedPrompt(bot, batch) }];
    const maxTokens = Math.max(512, 220 * batch.length);
    try {
      const result = await callWithFallback(messages, maxTokens);
      tokenTotals.input  += result.inputTokens;
      tokenTotals.output += result.outputTokens;
      chunkResults[i] = parseChunkText(result.text, batch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("[DAILY]")) { dailyQuotaError = err as Error; return; }
      console.warn(`[OpenRouter] chunk ${i + 1}/${totalChunks} échec: ${msg.slice(0, 80)}`);
      chunkResults[i] = [];
    }
  }

  // Run in parallel batches of PARALLEL_CHUNKS
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    if (dailyQuotaError) break;
    await Promise.all(chunks.slice(i, i + PARALLEL_CHUNKS).map((batch, j) => runChunk(batch, i + j)));
  }

  if (dailyQuotaError) throw dailyQuotaError;

  const aggregated = chunkResults.flat().filter(Boolean);

  await prisma.apiStats.upsert({
    where: { id: "singleton" },
    create: {
      claudeRequests:        totalChunks,
      claudeInputTokens:     tokenTotals.input,
      claudeOutputTokens:    tokenTotals.output,
      claudeCacheReadTokens: 0,
      updatedAt:             new Date(),
    },
    update: {
      claudeRequests:        { increment: totalChunks },
      claudeInputTokens:     { increment: tokenTotals.input },
      claudeOutputTokens:    { increment: tokenTotals.output },
      updatedAt:             new Date(),
    },
  });

  return aggregated;
}
