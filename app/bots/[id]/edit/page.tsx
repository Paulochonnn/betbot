"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const SPORTS = [
  { id: "soccer",     label: "Football"   },
  { id: "basketball", label: "Basket"     },
  { id: "tennis",     label: "Tennis"     },
];

const inputClass = `
  w-full rounded-lg px-4 py-3 text-sm font-mono outline-none transition-all
  placeholder:text-[var(--muted)]
`;
const inputStyle = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  color: "var(--t1)",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-display text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: "var(--t3)" }}>
      {children}
    </label>
  );
}

export default function EditBotPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [fetching, setFetching] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);

  const [name,           setName]           = useState("");
  const [bankroll,       setBankroll]       = useState(1000);
  const [sports,         setSports]         = useState<string[]>(["soccer"]);
  const [minEdge,        setMinEdge]        = useState(5);
  const [maxKelly,       setMaxKelly]       = useState(5);
  const [systemPrompt,   setSystemPrompt]   = useState("");
  const [enableCombined,  setEnableCombined]  = useState(false);
  const [alsoIndividual,  setAlsoIndividual]  = useState(false);
  const [maxComboLegs,    setMaxComboLegs]    = useState(2);

  useEffect(() => {
    fetch(`/api/bots/${id}`)
      .then((r) => r.json())
      .then((bot) => {
        setName(bot.name);
        setBankroll(bot.bankroll);
        setSports(bot.sports ? bot.sports.split(",").map((s: string) => s.trim()) : ["soccer"]);
        setMinEdge(Math.round(bot.minEdge * 100));
        setMaxKelly(Math.round(bot.maxKelly * 100));
        setSystemPrompt(bot.systemPrompt ?? "");
        setEnableCombined(bot.enableCombined ?? false);
        setAlsoIndividual(bot.alsoIndividual ?? false);
        setMaxComboLegs(bot.maxComboLegs ?? 2);
        setFetching(false);
      })
      .catch(() => { setError("Impossible de charger le bot."); setFetching(false); });
  }, [id]);

  function toggleSport(sid: string) {
    setSports((prev) => prev.includes(sid) ? prev.filter((s) => s !== sid) : [...prev, sid]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sports.length === 0) { setError("Sélectionne au moins un sport."); return; }
    setSaving(true); setError(""); setSuccess(false);

    const res = await fetch(`/api/bots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        systemPrompt,
        minEdge: minEdge / 100,
        maxKelly: maxKelly / 100,
        sports,
        enableCombined,
        alsoIndividual,
        maxComboLegs,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erreur lors de la sauvegarde.");
      setSaving(false);
      return;
    }

    setSuccess(true);
    setSaving(false);
    setTimeout(() => router.push("/bots"), 800);
  }

  if (fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="font-mono text-xs tracking-widest" style={{ color: "var(--t3)" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div className="page min-h-screen" style={{ maxWidth: 680, margin: "0 auto" }}>
      <div className="tab-anim">

        {/* Header */}
        <div className="flex items-center gap-4 pt-10 mb-10">
          <div className="w-1 h-10 rounded-full" style={{ background: "var(--accent)" }} />
          <div>
            <h1 className="font-display font-black uppercase leading-none tracking-tight" style={{ fontSize: 36, color: "var(--t1)" }}>
              Modifier <span style={{ color: "var(--accent)" }}>le Bot</span>
            </h1>
            <p className="font-mono text-[10px] tracking-[0.2em] mt-0.5" style={{ color: "var(--t3)" }}>
              ÉDITION DE LA CONFIGURATION
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Nom */}
          <div>
            <Label>Nom du bot</Label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className={inputClass} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
            />
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
                      ? { background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,0.35)" }
                      : { background: "var(--bg2)", color: "var(--t3)", border: "1px solid var(--border)" }
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
              <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
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
              <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
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
                onClick={() => { setEnableCombined((v) => !v); if (enableCombined) setAlsoIndividual(false); }}
                className="font-display text-xs font-bold tracking-widest uppercase px-5 py-2.5 rounded transition-all"
                style={enableCombined
                  ? { background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)" }
                  : { background: "var(--bg2)", color: "var(--t3)", border: "1px solid var(--border)" }
                }
              >
                {enableCombined ? "Activé" : "Désactivé"}
              </button>
              {enableCombined && (
                <>
                  <span className="font-mono text-xs" style={{ color: "var(--t3)" }}>Jambes :</span>
                  {[2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n} type="button" onClick={() => setMaxComboLegs(n)}
                      className="font-display text-xs font-bold tracking-widest uppercase px-4 py-2.5 rounded transition-all"
                      style={maxComboLegs === n
                        ? { background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)" }
                        : { background: "var(--bg2)", color: "var(--t3)", border: "1px solid var(--border)" }
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
                        : { background: "var(--bg2)", color: "var(--t3)", border: "1px solid var(--border)" }
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
              required rows={7} value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Décris la stratégie et la personnalité du bot…"
              className={`${inputClass} resize-none leading-relaxed`} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Bankroll info */}
          <div
            className="rounded-lg px-4 py-3 font-mono text-[11px]"
            style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--t3)" }}
          >
            Bankroll actuelle : <span style={{ color: "var(--t1)" }}>€{bankroll.toFixed(2)}</span>
            {" · "}Pour réinitialiser la bankroll, supprime et recrée le bot.
          </div>

          {error && (
            <p className="font-mono text-xs rounded-lg px-4 py-3"
              style={{ background: "rgba(244,63,94,0.08)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.2)" }}>
              {error}
            </p>
          )}

          {success && (
            <p className="font-mono text-xs rounded-lg px-4 py-3"
              style={{ background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.2)" }}>
              ✓ Sauvegardé — redirection…
            </p>
          )}

          <div className="flex gap-3 pt-2 pb-10">
            <button
              type="submit" disabled={saving}
              className="flex-1 font-display text-sm font-black tracking-widest uppercase py-3 rounded-lg transition-all disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#07070b" }}
            >
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
            <Link
              href="/bots"
              className="font-display text-sm font-bold tracking-widest uppercase px-6 py-3 rounded-lg transition-all text-center no-underline"
              style={{ background: "var(--bg2)", color: "var(--t3)", border: "1px solid var(--border)" }}
            >
              Annuler
            </Link>
          </div>
        </form>

      </div>
    </div>
  );
}
