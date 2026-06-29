import { NextResponse } from "next/server";

const MODEL = "google/gemma-3-27b-it:free";

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const checks: Record<string, unknown> = {
    env_key_present: !!apiKey,
    env_key_preview: apiKey ? `${apiKey.slice(0, 14)}...${apiKey.slice(-4)}` : "MISSING",
    env_key_format_ok: apiKey ? apiKey.startsWith("sk-or-v1-") : false,
  };

  if (!apiKey) {
    return NextResponse.json({ checks, error: "OPENROUTER_API_KEY absent du .env.local" }, { status: 500 });
  }

  // Minimal request to avoid token limits
  let httpStatus: number | null = null;
  let rawBody = "";
  let responseHeaders: Record<string, string> = {};
  let durationMs = 0;

  try {
    const t0 = Date.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "BetBot Debug",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    durationMs = Date.now() - t0;
    httpStatus = res.status;
    rawBody = await res.text();

    ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset",
      "x-request-id", "cf-cache-status"].forEach((h) => {
      const v = res.headers.get(h);
      if (v) responseHeaders[h] = v;
    });
  } catch (err) {
    return NextResponse.json({
      checks,
      error: err instanceof Error ? err.message : String(err),
      httpStatus,
      rawBody,
      responseHeaders,
      durationMs,
    });
  }

  let parsed: unknown = null;
  try { parsed = JSON.parse(rawBody); } catch { parsed = rawBody; }

  const content = (parsed as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content ?? null;
  const apiError = (parsed as { error?: { message?: string; code?: number } })?.error ?? null;

  return NextResponse.json({
    checks,
    httpStatus,
    ok: httpStatus === 200,
    content,
    apiError,
    rawBody,
    responseHeaders,
    durationMs,
  });
}
