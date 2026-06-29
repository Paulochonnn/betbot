import { NextResponse } from "next/server";

// Cast wide net across different upstream providers
const CANDIDATES = [
  "google/gemma-3-27b-it:free",                   // Google AI Studio
  "google/gemma-3-12b-it:free",                   // Google AI Studio
  "meta-llama/llama-3.3-70b-instruct:free",       // Meta / Cerebras
  "meta-llama/llama-3.1-8b-instruct:free",        // Meta
  "meta-llama/llama-3.2-3b-instruct:free",        // Venice
  "deepseek/deepseek-r1-distill-llama-8b:free",   // DeepSeek
  "deepseek/deepseek-r1-distill-qwen-14b:free",   // DeepSeek
  "mistralai/mistral-7b-instruct:free",            // Mistral
  "microsoft/phi-4-reasoning-plus:free",           // Microsoft
  "nousresearch/hermes-3-llama-3.1-405b:free",    // Nous Research
  "qwen/qwen2.5-vl-3b-instruct:free",             // Qwen
  "qwen/qwen2.5-7b-instruct:free",                // Qwen
];

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY manquant" }, { status: 500 });
  }

  const results = await Promise.all(
    CANDIDATES.map(async (model) => {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            // No system role — universal compatibility test
            messages: [{ role: "user", content: "Reply with only the word: OK" }],
            max_tokens: 10,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        const body = await res.json();
        const content = body?.choices?.[0]?.message?.content?.trim() ?? null;
        const errMsg = body?.error?.message ?? null;
        const rawErr = body?.error?.metadata?.raw ?? null;
        const provider = body?.provider ?? body?.error?.metadata?.provider_name ?? null;

        return { model, status: res.status, ok: res.ok, content, error: errMsg, rawError: rawErr, provider };
      } catch (err) {
        return {
          model, status: null, ok: false, content: null, provider: null,
          error: err instanceof Error ? err.message : String(err), rawError: null,
        };
      }
    })
  );

  const working = results.filter((r) => r.ok).map((r) => ({ model: r.model, provider: r.provider }));

  return NextResponse.json({ working, results });
}
