"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SPORTS = [
  { id: "soccer", label: "Football" },
  { id: "basketball", label: "Basket" },
  { id: "tennis", label: "Tennis" },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-display text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: "var(--muted)" }}>
      {children}
    </label>
  );
}

const inputClass = `
  w-full rounded-lg px-4 py-3 text-sm font-mono outline-none transition-all
  placeholder:text-[var(--muted)]
`;
const inputStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

export default function NewBotPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [bankroll, setBankroll] = useState(1000);
  const [sports, setSports] = useState<string[]>(["soccer"]);
  const [minEdge, setMinEdge] = useState(5);
  const [maxKelly, setMaxKelly] = useState(5);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [enableCombined,  setEnableCombined]  = useState(false);
  const [alsoIndividual,  setAlsoIndividual]  = useState(false);
  const [maxComboLegs,    setMaxComboLegs]    = useState(2);

  function toggleSport(id: string) {
    setSports((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sports.length === 0) { setError("Sélectionne au moins un sport."); return; }
    setLoading(true); setError("");

    const res = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bankroll, sports, minEdge: minEdge / 100, maxKelly: maxKelly / 100, systemPrompt, enableCombined, alsoIndividual, maxComboLegs }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erreur lors de la création.");
      setLoading(false);
      return;
    }
    router.push("/bots");
  }

  return (
    <div className="page-root min-h-screen px-6 py-8 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className="w-1 h-10 rounded-full bg-accent" />
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none" style={{ color: "var(--text)" }}>
            Nouveau <span className="text-accent">Bot</span>
          </h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted mt-0.5">CONFIGURATION DE L'AGENT</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Nom */}
        <div>
          <Label>Nom du bot</Label>
          <input
            type="text" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="ex: Chasseur d'outsiders EPL"
            className={inputClass} style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Bankroll */}
        <div>
          <Label>Bankroll de départ</Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm" style={{ color: "var(--gold)" }}>€</span>
            <input
              type="number" required min={10} value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              className={`${inputClass} pl-8`} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>
        </div>

        {/* Sports */}
        <div>
          <Label>Sports autorisés</Label>
          <div className="flex gap-3">
            {SPORTS.map((s) => {
              const active = sports.includes(s.id);
              return (
                <button
                  key={s.id} type="button" onClick={() => toggleSport(s.id)}
                  className="font-display text-xs font-bold tracking-widest uppercase px-5 py-2.5 rounded transition-all flex-1"
                  style={active
                    ? { background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(232,97,45,0.4)" }
                    : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>
              Edge minimum —{" "}
              <span style={{ color: "var(--accent)" }}>{minEdge}%</span>
            </Label>
            <input
              type="range" min={1} max={20} step={1} value={minEdge}
              onChange={(e) => setMinEdge(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
            />
            <div className="flex justify-between font-mono text-[10px] text-muted mt-1">
              <span>1%</span><span>20%</span>
            </div>
          </div>
          <div>
            <Label>
              Mise max Kelly —{" "}
              <span style={{ color: "var(--accent)" }}>{maxKelly}%</span>
            </Label>
            <input
              type="range" min={1} max={15} step={1} value={maxKelly}
              onChange={(e) => setMaxKelly(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
            />
            <div className="flex justify-between font-mono text-[10px] text-muted mt-1">
              <span>1%</span><span>15%</span>
            </div>
          </div>
        </div>

        {/* Combined bets */}
        <div>
          <Label>Paris combinés</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setEnableCombined((v) => !v)}
              className="font-display text-xs font-bold tracking-widest uppercase px-5 py-2.5 rounded transition-all"
              style={enableCombined
                ? { background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)" }
                : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
              }
            >
              {enableCombined ? "Activé" : "Désactivé"}
            </button>
            {enableCombined && (
              <>
                <span className="font-mono text-xs text-muted">Jambes :</span>
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxComboLegs(n)}
                    className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2.5 rounded transition-all"
                    style={maxComboLegs === n
                      ? { background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)" }
                      : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
                    }
                  >
                    {n}×
                  </button>
                ))}
                <div className="w-full mt-2">
                  <button
                    type="button"
                    onClick={() => setAlsoIndividual((v) => !v)}
                    className="font-display text-xs font-bold tracking-widest uppercase px-5 py-2.5 rounded transition-all"
                    style={alsoIndividual
                      ? { background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,0.35)" }
                      : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
                    }
                  >
                    {alsoIndividual ? "✓ Aussi des paris simples" : "+ Aussi des paris simples"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* System prompt */}
        <div>
          <Label>Instructions · Personnalité</Label>
          <textarea
            required rows={5} value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={"ex: Tu es agressif et tu cherches les outsiders avec de grandes cotes. Tu acceptes plus de risque sur les équipes en forme récente et tu ignores les favoris écrasants."}
            className={`${inputClass} resize-none leading-relaxed`} style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {error && (
          <p className="font-mono text-xs rounded-lg px-4 py-3" style={{ background: "rgba(244,63,94,0.08)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.2)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit" disabled={loading}
            className="flex-1 font-display text-sm font-black tracking-widest uppercase py-3 rounded-lg transition-all disabled:opacity-40"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {loading ? "Création…" : "Créer le bot"}
          </button>
          <Link
            href="/bots"
            className="font-display text-sm font-bold tracking-widest uppercase px-6 py-3 rounded-lg transition-all text-center"
            style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
