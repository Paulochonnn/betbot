"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type SortKey = "bot" | "match" | "pick" | "odds" | "stake" | "edge" | "profit" | "date";
type SortDir  = "asc" | "desc";

type BotStats = {
  totalBets: number;
  pendingBets: number;
  wonBets: number;
  winRate: number;
  totalProfit: number;
  roi: number;
};

type Bot = {
  id: string;
  name: string;
  bankroll: number;
  initialBankroll: number;
  status: string;
  maxKelly: number;
  minEdge: number;
  sports: string;
  lastRunAt: string | null;
  createdAt: string;
  enableCombined: boolean;
  maxComboLegs: number;
  stats: BotStats;
};

type CombinedBetLeg = {
  id: string;
  matchId: string;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  pick: string;
  odds: number;
  estimatedProb: number;
  status: string;
};

type CombinedBet = {
  id: string;
  botId: string;
  bot: { name: string };
  legs: CombinedBetLeg[];
  combinedOdds: number;
  estimatedProb: number;
  edge: number;
  stake: number;
  status: string;
  profit: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

type Bet = {
  id: string;
  botId: string;
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  odds: number;
  edge: number;
  stake: number;
  reasoning: string;
  status: string;
  profit: number | null;
  matchDate: string;
  createdAt: string;
  bot: { name: string };
};

type ModelStat = {
  model: string;
  totalCalls: number;
  failedCalls: number;
  totalTokens: number;
  avgTokens: number;
  sparkline: number[];
};

/* ── Helpers ──────────────────────────────────────────────────────────── */
function fmtEur(n: number, sign = true) {
  const abs = Math.abs(n).toFixed(2);
  if (!sign) return `€${abs}`;
  return n >= 0 ? `+€${abs}` : `−€${abs}`;
}
function fmtPct(n: number) { return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`; }
function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
const AUTO_RUN_INTERVAL_MS = 60 * 60 * 1000; // 1h

function fmtCountdown(ms: number) {
  if (ms <= 0) return "maintenant";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function sportLabel(s: string) {
  if (s === "soccer" || s === "football") return "Football";
  if (s === "basketball") return "Basketball";
  return "Tennis";
}

function sortBets(bets: Bet[], key: SortKey, dir: SortDir): Bet[] {
  return [...bets].sort((a, b) => {
    let va: number | string, vb: number | string;
    switch (key) {
      case "bot":    va = a.bot.name;    vb = b.bot.name;    break;
      case "match":  va = a.homeTeam;    vb = b.homeTeam;    break;
      case "pick":   va = a.pick;        vb = b.pick;        break;
      case "odds":   va = a.odds;        vb = b.odds;        break;
      case "stake":  va = a.stake;       vb = b.stake;       break;
      case "edge":   va = a.edge;        vb = b.edge;        break;
      case "profit": va = a.profit ?? 0; vb = b.profit ?? 0; break;
      case "date":   va = a.matchDate;   vb = b.matchDate;   break;
      default:       return 0;
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

/* ── Mini sparkline ───────────────────────────────────────────────────── */
function MiniSparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null;
  const W = 300, H = 36, P = 2;
  const mn = Math.min(...data) - 0.3, mx = Math.max(...data) + 0.3;
  const xs = (i: number) => P + (i / (data.length - 1)) * (W - P * 2);
  const ys = (v: number) => H - P - ((v - mn) / (mx - mn)) * (H - P * 2);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}>
      <path d={line} fill="none" stroke={up ? "var(--accent)" : "var(--red)"} strokeWidth="1.5" opacity=".7" />
    </svg>
  );
}

/* ── Combined bet card ───────────────────────────────────────────────── */
function CombinedBetCard({ combo, onResolved }: { combo: CombinedBet; onResolved: () => void }) {
  const [resolving, setResolving] = useState(false);
  // Anciens combinés = legs avec matchId non-numérique (The Odds API)
  const isOld = combo.legs.some((l) => !/^\d+$/.test(l.matchId ?? ""));

  async function manualResolve(status: "won" | "lost") {
    setResolving(true);
    await fetch(`/api/combined-bets/${combo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setResolving(false);
    onResolved();
  }

  return (
    <div className="card p-5" style={combo.status === "pending" ? { borderColor: "rgba(167,139,250,.25)" } : {}}>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display text-[12px] font-black tracking-widest uppercase" style={{ color: "#a78bfa" }}>
            {combo.bot.name}
          </span>
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "var(--t3)" }}>
            COMBINÉ {combo.legs.length} sél.
          </span>
          {combo.status === "pending" && isOld ? (
            <div className="flex gap-1.5">
              <button
                onClick={() => manualResolve("won")}
                disabled={resolving}
                className="font-mono text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider disabled:opacity-30"
                style={{ background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.25)", cursor: "pointer" }}
              >
                ✓ Gagné
              </button>
              <button
                onClick={() => manualResolve("lost")}
                disabled={resolving}
                className="font-mono text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider disabled:opacity-30"
                style={{ background: "var(--rdim)", color: "var(--red)", border: "1px solid rgba(255,71,87,.25)", cursor: "pointer" }}
              >
                ✗ Perdu
              </button>
            </div>
          ) : (
            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded uppercase"
              style={combo.status === "pending"
                ? { background: "rgba(128,128,128,.08)", color: "var(--t2)" }
                : combo.status === "won"
                ? { background: "var(--adim)", color: "var(--accent)" }
                : { background: "var(--rdim)", color: "var(--red)" }
              }>
              {combo.status === "pending" ? "EN ATTENTE" : combo.status === "won" ? "GAGNÉ" : "PERDU"}
            </span>
          )}
        </div>
        <div className="flex gap-4 flex-wrap">
          {[
            { lbl: "Cote combinée", val: combo.combinedOdds.toFixed(2),        c: "var(--gold)"   },
            { lbl: "Mise",          val: `€${combo.stake.toFixed(2)}`,          c: "var(--t1)"     },
            { lbl: "Edge",          val: `${(combo.edge * 100).toFixed(1)}%`,   c: "#a78bfa"       },
            ...(combo.profit !== null ? [{ lbl: "Profit", val: fmtEur(combo.profit), c: combo.profit >= 0 ? "var(--accent)" : "var(--red)" }] : []),
          ].map(({ lbl, val, c }) => (
            <div key={lbl} className="text-right">
              <div className="font-mono text-[9px] tracking-widest uppercase" style={{ color: "var(--t3)" }}>{lbl}</div>
              <div className="font-mono text-[14px] font-bold" style={{ color: c }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {combo.legs.map((leg, i) => (
          <div key={leg.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 flex-wrap"
            style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
            <span className="font-mono text-[10px] font-bold w-4 flex-shrink-0" style={{ color: "rgba(167,139,250,0.5)" }}>{i + 1}</span>
            <span className="font-mono text-[12px] flex-1 min-w-0" style={{ color: "var(--t1)" }}>
              {leg.homeTeam} vs {leg.awayTeam}
              <span className="ml-2" style={{ color: "var(--t3)" }}>{leg.league}</span>
            </span>
            <span className="font-mono text-[12px] font-bold px-2" style={{ color: "#a78bfa" }}>{leg.pick}</span>
            <span className="font-mono text-[12px]" style={{ color: "var(--gold)" }}>{leg.odds.toFixed(2)}</span>
            <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: "var(--t3)" }}>
              {new Date(leg.matchDate).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })}
              {" "}
              {new Date(leg.matchDate).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bot card (design grid style) ────────────────────────────────────── */
function BotCard({ bot, bets, pendingCombos, onRun, onToggle, onDelete, isRunning }: {
  bot: Bot;
  bets: Bet[];
  pendingCombos: CombinedBet[];
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isRunning: boolean;
}) {
  const botBets = bets.filter((b) => b.botId === bot.id);
  const pendingStake = botBets
    .filter((b) => b.status === "pending")
    .reduce((s, b) => s + b.stake, 0);
  const pendingComboStake = pendingCombos
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + c.stake, 0);
  const totalPendingStake = pendingStake + pendingComboStake;
  const totalValue = bot.bankroll + totalPendingStake;

  const diff = totalValue - bot.initialBankroll;
  const pct  = ((diff / bot.initialBankroll) * 100).toFixed(1);
  const up   = diff >= 0;

  const resolved = botBets
    .filter((b) => b.status !== "pending" && b.profit !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let running = bot.initialBankroll;
  const history: number[] = [running];
  for (const bet of resolved) {
    running += bet.profit ?? 0;
    history.push(running);
  }
  if (history[history.length - 1] !== totalValue) history.push(totalValue);
  if (history.length < 2) history.push(totalValue);

  return (
    <div className="bot-grid-card">
      {isRunning && <div className="scan-bar absolute inset-0" />}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <div className="font-display font-black tracking-[0.07em] uppercase mb-1.5" style={{ fontSize: 18, color: "var(--t1)" }}>
              {bot.name}
            </div>
            <div className={`status-pill ${bot.status}`}>
              <span className="w-1.5 h-1.5 rounded-full live-dot flex-shrink-0" />
              {bot.status === "active" ? "Actif" : "En pause"}
            </div>
          </div>
          <div className="text-right">
            <div
              className="font-display font-black tracking-[-0.01em]"
              style={{ fontSize: 26, color: "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
              €{totalValue.toFixed(2)}
            </div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>
              init €{bot.initialBankroll.toFixed(2)}&nbsp;
              <span style={{ color: up ? "var(--accent)" : "var(--red)" }}>
                {up ? "+" : ""}{diff.toFixed(2)} ({up ? "+" : ""}{pct}%)
              </span>
            </div>
            {totalPendingStake > 0 && (
              <div className="font-mono text-[9px] mt-0.5" style={{ color: "var(--t3)" }}>
                €{bot.bankroll.toFixed(2)} dispo · €{totalPendingStake.toFixed(2)} en jeu
                {pendingComboStake > 0 && (
                  <span style={{ color: "#a78bfa" }}> (€{pendingComboStake.toFixed(2)} combinés)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3.5 mb-4">
          {[
            { lbl: "Win Rate", val: `${bot.stats.winRate.toFixed(1)}%`, green: bot.stats.winRate >= 55 },
            { lbl: "ROI",      val: fmtPct(bot.stats.roi),              green: bot.stats.roi >= 0 },
            { lbl: "Paris",    val: String(bot.stats.totalBets),        green: false },
          ].map(({ lbl, val, green }) => (
            <div key={lbl}>
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase mb-1" style={{ color: "var(--t3)" }}>{lbl}</div>
              <div
                className="font-display font-black tracking-[-0.01em]"
                style={{ fontSize: 22, color: green ? "var(--accent)" : "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}
              >
                {val}
              </div>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div className="mb-4" style={{ height: 36, width: "100%" }}>
          <MiniSparkline data={history} up={up} />
        </div>

        {/* Sports chips */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {bot.sports.split(",").map((s) => (
            <span key={s} className="font-mono text-[9px] tracking-[0.06em] uppercase px-2 py-1 rounded"
              style={{ border: "1px solid var(--border)", color: "var(--t3)" }}>
              {sportLabel(s.trim())}
            </span>
          ))}
          {bot.stats.pendingBets > 0 && (
            <span className="font-mono text-[9px] px-2 py-1 rounded"
              style={{ background: "rgba(128,128,128,.07)", color: "var(--t2)", border: "1px solid var(--border)" }}>
              {bot.stats.pendingBets} en attente
            </span>
          )}
          {pendingCombos.filter((c) => c.status === "pending").length > 0 && (
            <span className="font-mono text-[9px] px-2 py-1 rounded"
              style={{ background: "rgba(167,139,250,.08)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.2)" }}>
              {pendingCombos.filter((c) => c.status === "pending").length} combiné{pendingCombos.filter((c) => c.status === "pending").length > 1 ? "s" : ""} en attente
            </span>
          )}
          {bot.enableCombined && (
            <span className="font-mono text-[9px] px-2 py-1 rounded"
              style={{ background: "rgba(167,139,250,.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.2)" }}>
              COMBINÉ {bot.maxComboLegs}×
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-auto">
          <button
            onClick={onRun}
            disabled={isRunning || bot.status !== "active"}
            className="flex-1 py-2 rounded-[7px] font-display text-[11px] font-black tracking-[0.08em] uppercase transition-all disabled:opacity-30"
            style={{ background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.2)", cursor: "pointer" }}
          >
            {isRunning ? "En cours…" : "▶ Lancer Cycle"}
          </button>
          <button
            onClick={onToggle}
            className="px-4 py-2 rounded-[7px] font-display text-[11px] font-semibold tracking-[0.08em] uppercase transition-all"
            style={{
              background: "none",
              color: bot.status === "active" ? "#c08820" : "var(--accent)",
              border: `1px solid ${bot.status === "active" ? "rgba(224,152,32,.25)" : "rgba(0,232,124,.2)"}`,
              cursor: "pointer",
            }}
          >
            {bot.status === "active" ? "⏸ Pause" : "▶ Reprendre"}
          </button>
          <Link
            href={`/bots/${bot.id}/edit`}
            className="px-3 py-2 rounded-[7px] font-display text-[11px] font-semibold uppercase transition-all flex items-center justify-center no-underline"
            style={{ background: "none", color: "var(--t3)", border: "1px solid var(--border)" }}
            title="Modifier le bot"
          >
            ✎
          </Link>
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-[7px] font-display text-[11px] font-semibold uppercase transition-all"
            style={{ background: "none", color: "var(--t3)", border: "1px solid var(--border)", cursor: "pointer" }}
            title="Supprimer le bot"
          >
            ✕
          </button>
        </div>

        {/* Last run */}
        {bot.lastRunAt && (
          <div className="font-mono text-[9px] mt-2 text-center" style={{ color: "var(--t3)" }}>
            Dernier cycle {new Date(bot.lastRunAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sort TH ──────────────────────────────────────────────────────────── */
function SortTh({ label, sortKey, current, dir, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="sort-th px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em]"
      style={{ color: active ? "var(--accent)" : "var(--t3)" }}
      onClick={() => onClick(sortKey)}
    >
      {label}
      <span className="ml-1">{active ? (dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}</span>
    </th>
  );
}

/* ── Bet row ──────────────────────────────────────────────────────────── */
function BetRow({ bet, showProfit, onResolved }: { bet: Bet; showProfit: boolean; onResolved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const colSpan = showProfit ? 10 : 9;
  const RM: Record<string, string> = { won: "Gagné", lost: "Perdu", pending: "En cours" };

  async function manualResolve(status: "won" | "lost") {
    setResolving(true);
    await fetch(`/api/bets/${bet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setResolving(false);
    onResolved?.();
  }

  return (
    <>
      <tr className="bet-row">
        <td className="px-4 py-3">
          <span className="font-mono text-[11px] font-bold tracking-wider" style={{ color: "var(--accent)" }}>{bet.bot.name}</span>
        </td>
        <td className="px-4 py-3">
          <div className="text-[13px]" style={{ color: "var(--t1)" }}>{bet.homeTeam} vs {bet.awayTeam}</div>
          <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: "var(--t3)" }}>{bet.league}</div>
        </td>
        <td className="px-4 py-3 font-mono text-[12px] font-medium" style={{ color: "var(--t1)" }}>{bet.pick}</td>
        <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--gold)" }}>{bet.odds.toFixed(2)}</td>
        <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--t1)" }}>€{bet.stake.toFixed(2)}</td>
        <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "var(--t2)" }}>{(bet.edge * 100).toFixed(1)}%</td>
        {showProfit && (
          <td className="px-4 py-3 font-mono text-[12px] font-bold" style={{ color: (bet.profit ?? 0) >= 0 ? "var(--accent)" : "var(--red)" }}>
            {bet.profit !== null ? fmtEur(bet.profit) : "—"}
          </td>
        )}
        <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap" style={{ color: "var(--t3)" }}>
          <div>{new Date(bet.matchDate).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })}</div>
          <div style={{ color: "var(--gold)" }}>{new Date(bet.matchDate).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}</div>
        </td>
        <td className="px-4 py-3">
          {bet.status === "pending" && !/^\d+$/.test(bet.matchId) ? (
            <div className="flex gap-1.5">
              <button
                onClick={() => manualResolve("won")}
                disabled={resolving}
                className="font-mono text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider disabled:opacity-30"
                style={{ background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.25)", cursor: "pointer" }}
              >
                ✓ Gagné
              </button>
              <button
                onClick={() => manualResolve("lost")}
                disabled={resolving}
                className="font-mono text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider disabled:opacity-30"
                style={{ background: "var(--rdim)", color: "var(--red)", border: "1px solid rgba(255,71,87,.25)", cursor: "pointer" }}
              >
                ✗ Perdu
              </button>
            </div>
          ) : (
            <span
              className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-[0.06em]"
              style={
                bet.status === "won"    ? { background: "var(--adim)", color: "var(--accent)" }
                : bet.status === "lost" ? { background: "var(--rdim)", color: "var(--red)" }
                : { background: "rgba(128,128,128,.08)", color: "var(--t2)" }
              }
            >
              {RM[bet.status] ?? bet.status}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="font-mono text-[10px] font-bold tracking-widest uppercase transition-colors"
            style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
          >
            {open ? "Fermer" : "Détails"}
          </button>
        </td>
      </tr>
      {open && (
        <tr style={{ background: "var(--bg3)" }}>
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="flex gap-3">
              <div className="w-[2px] flex-shrink-0 rounded-full" style={{ background: "var(--accent)", opacity: 0.6 }} />
              <p className="font-mono text-[12px] leading-relaxed" style={{ color: "var(--t2)" }}>{bet.reasoning}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Bots page ────────────────────────────────────────────────────────── */
export default function BotsPage() {
  const [bots,         setBots]         = useState<Bot[]>([]);
  const [bets,         setBets]         = useState<Bet[]>([]);
  const [combinedBets, setCombinedBets] = useState<CombinedBet[]>([]);
  const [modelStats,   setModelStats]   = useState<ModelStat[]>([]);
  const [betFilter,    setBetFilter]    = useState<"all" | "won" | "lost">("all");
  const [botFilter,    setBotFilter]    = useState<string>("all");
  const [pendingSort,  setPendingSort]  = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "asc"  });
  const [historySort,  setHistorySort]  = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const [loading,      setLoading]      = useState(true);
  const [runningId,    setRunningId]    = useState<string | null>(null);
  const [resolving,    setResolving]    = useState(false);
  const [message,      setMessage]      = useState("");
  const [messageType,  setMessageType]  = useState<"info" | "warning">("info");
  const [countdown,    setCountdown]    = useState(AUTO_RUN_INTERVAL_MS);

  const lastRunRef    = useRef<number>(Date.now());
  const isAutoRunning = useRef(false);

  const fetchData = useCallback(async () => {
    const [botsRes, betsRes, statsRes, combosRes] = await Promise.all([
      fetch("/api/bots"), fetch("/api/bets"), fetch("/api/stats"), fetch("/api/combined-bets"),
    ]);
    const botsData   = await botsRes.json()   as Bot[];
    const betsData   = await betsRes.json()   as Bet[];
    const statsData  = await statsRes.json()  as { modelStats: ModelStat[] };
    const combosData = await combosRes.json() as CombinedBet[];
    setBots(botsData); setBets(betsData); setModelStats(statsData.modelStats ?? []);
    setCombinedBets(combosData);
    setLoading(false);
    // Seed lastRunRef from most recent bot run so the 1h clock is accurate on page load
    const latestRun = botsData.reduce((mx, b) => {
      const t = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return t > mx ? t : mx;
    }, 0);
    if (latestRun > 0) lastRunRef.current = latestRun;
    return botsData;
  }, []);

  const runBot = useCallback(async (botId: string, silent = false) => {
    setRunningId(botId);
    if (!silent) { setMessage(""); setMessageType("info"); }
    try {
      const res  = await fetch(`/api/bots/${botId}/run`, { method: "POST" });
      const data = await res.json();
      if (!silent) {
        if (data.warning) {
          setMessage(data.warning); setMessageType("warning");
        } else if (res.ok) {
          const parts: string[] = [];
          if (data.resolved > 0) parts.push(`${data.resolved} pari(s) résolu(s)`);
          parts.push(data.betsPlaced > 0
            ? `${data.matchesAnalyzed} matchs analysés, ${data.betsPlaced} pari(s) placé(s)`
            : `${data.matchesAnalyzed} matchs analysés, aucun pari retenu`);
          if (data.combinedBetsPlaced > 0) parts.push(`${data.combinedBetsPlaced} combiné placé`);
          setMessage(parts.join(" · ")); setMessageType("info");
        }
      }
      return await fetchData();
    } catch (err) {
      console.error("[runBot]", err);
      return await fetchData();
    } finally {
      setRunningId(null);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-run toutes les heures si aucun cycle manuel dans l'heure écoulée
  useEffect(() => {
    const tick = setInterval(async () => {
      const elapsed = Date.now() - lastRunRef.current;
      const remaining = AUTO_RUN_INTERVAL_MS - elapsed;
      setCountdown(Math.max(0, remaining));

      if (remaining <= 0 && !isAutoRunning.current) {
        const activeBots = bots.filter((b) => b.status === "active");
        if (activeBots.length === 0) return;
        isAutoRunning.current = true;
        lastRunRef.current = Date.now();
        try {
          for (const bot of activeBots) {
            await runBot(bot.id, true);
          }
        } finally {
          isAutoRunning.current = false;
        }
      }
    }, 10_000);
    return () => clearInterval(tick);
  }, [bots, runBot]);

  async function toggleBot(bot: Bot) {
    const newStatus = bot.status === "active" ? "paused" : "active";
    await fetch(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchData();
  }

  async function deleteBot(bot: Bot) {
    if (!window.confirm(`Supprimer "${bot.name}" et tous ses paris ?`)) return;
    await fetch(`/api/bots/${bot.id}`, { method: "DELETE" });
    await fetchData();
  }

  async function runAllBots() {
    lastRunRef.current = Date.now();
    const activeBots = bots.filter((b) => b.status === "active");
    for (const bot of activeBots) {
      await runBot(bot.id);
    }
  }

  async function resolveAll() {
    setResolving(true); setMessage("");
    const res  = await fetch("/api/resolve", { method: "POST" });
    const data = await res.json();
    setMessage(data.message);
    fetchData();
    setResolving(false);
  }

  function togglePendingSort(key: SortKey) {
    setPendingSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  }
  function toggleHistorySort(key: SortKey) {
    setHistorySort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  }

  const byBot        = (b: Bet) => botFilter === "all" || b.botId === botFilter;
  const pendingBets  = sortBets(bets.filter((b) => b.status === "pending" && byBot(b)), pendingSort.key, pendingSort.dir);
  const historyBets  = bets.filter((b) => b.status !== "pending");
  const filteredHistory = sortBets(
    historyBets.filter((b) => (betFilter === "all" || b.status === betFilter) && byBot(b)),
    historySort.key, historySort.dir
  );
  const activeBots = bots.filter((b) => b.status === "active");
  const hasActive  = activeBots.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="font-mono text-[12px] tracking-widest" style={{ color: "var(--t3)" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <main className="page">
      <div className="tab-anim">

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex items-end justify-between pt-12 pb-7">
          <div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--t3)" }}>
              Robots configurés
            </div>
          </div>
          <div className="flex items-center gap-3">
            {bots.length > 0 && (
              <>
                <button
                  onClick={runAllBots}
                  disabled={runningId !== null || !hasActive}
                  className="font-display text-[11px] font-black tracking-[0.08em] uppercase px-4 py-2.5 rounded-lg transition-all disabled:opacity-30 relative overflow-hidden"
                  style={{ background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.25)", cursor: "pointer" }}
                >
                  {runningId !== null && <div className="scan-bar absolute inset-0" />}
                  <span className="relative z-10">{runningId !== null ? "En cours…" : "▶ Lancer tous les bots"}</span>
                </button>
                <button
                  onClick={resolveAll}
                  disabled={resolving}
                  className="font-display text-[11px] font-black tracking-[0.08em] uppercase px-4 py-2.5 rounded-lg transition-all disabled:opacity-30"
                  style={{ background: "var(--bg3)", color: "var(--t2)", border: "1px solid var(--border)", cursor: "pointer" }}
                >
                  {resolving ? "Résolution…" : "Résoudre tous"}
                </button>
              </>
            )}
            <Link
              href="/bots/new"
              className="flex items-center gap-2 font-display text-[12px] font-black tracking-[0.07em] uppercase px-5 py-2.5 rounded-lg transition-all no-underline"
              style={{ background: "var(--accent)", color: "#07070b", boxShadow: "0 0 24px var(--aglow)" }}
            >
              + Nouveau Robot
            </Link>
          </div>
        </div>

        {/* ── Auto-run banner ───────────────────────────────────── */}
        {hasActive && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg mb-6 relative overflow-hidden"
            style={{ background: "rgba(0,232,124,0.04)", border: "1px solid rgba(0,232,124,0.12)" }}
          >
            {runningId !== null && <div className="scan-bar absolute inset-0" />}
            <span className="live-dot flex-shrink-0" style={{ opacity: runningId !== null ? 1 : 0.5 }} />
            <span className="font-mono text-[11px] relative z-10" style={{ color: "var(--t3)" }}>
              {runningId !== null
                ? <span style={{ color: "var(--accent)" }}>CYCLE EN COURS…</span>
                : <>Auto-cycle dans <b style={{ color: "var(--accent)" }}>{fmtCountdown(countdown)}</b></>
              }
            </span>
            <span className="relative z-10" style={{ color: "var(--border)" }}>·</span>
            <span className="font-mono text-[10px] relative z-10" style={{ color: "var(--t3)" }}>
              {activeBots.length} bot{activeBots.length > 1 ? "s" : ""} actif{activeBots.length > 1 ? "s" : ""} · intervalle 1h
            </span>
          </div>
        )}

        {/* ── Flash message ─────────────────────────────────────── */}
        {message && (
          <div
            className="px-4 py-3 rounded-lg mb-6 font-mono text-[12px]"
            style={
              messageType === "warning"
                ? { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }
                : { background: "var(--adim)", border: "1px solid rgba(0,232,124,0.2)", color: "var(--accent)" }
            }
          >
            {messageType === "warning" && <span className="mr-2">⚠</span>}{message}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {!bots.length ? (
          <div className="text-center py-32">
            <div className="font-display font-black tracking-widest uppercase mb-4" style={{ fontSize: 22, color: "var(--t3)" }}>
              Aucun bot configuré
            </div>
            <Link href="/bots/new" className="font-mono text-[14px] tracking-wider no-underline transition-opacity hover:opacity-70" style={{ color: "var(--accent)" }}>
              Créer votre premier bot →
            </Link>
          </div>
        ) : (
          <>
            {/* ── Bot cards grid ────────────────────────────────── */}
            <div className="grid gap-[18px] mb-10" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {bots.map((bot, idx) => (
                <div key={bot.id} style={{ animationDelay: `${idx * 0.08}s` }}>
                  <BotCard
                    bot={bot}
                    bets={bets}
                    pendingCombos={combinedBets.filter((c) => c.botId === bot.id)}
                    isRunning={runningId === bot.id}
                    onRun={() => runBot(bot.id)}
                    onToggle={() => toggleBot(bot)}
                    onDelete={() => deleteBot(bot)}
                  />
                </div>
              ))}
            </div>

            {/* ── Combined bets ─────────────────────────────────── */}
            {combinedBets.filter((c) => botFilter === "all" || c.botId === botFilter).length > 0 && (
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-px h-5 rounded-full" style={{ background: "#a78bfa" }} />
                  <h2 className="font-display font-black tracking-tight uppercase" style={{ fontSize: 20, color: "var(--t1)" }}>
                    Paris Combinés
                  </h2>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(167,139,250,.12)", color: "#a78bfa" }}>
                    {combinedBets.filter((c) => botFilter === "all" || c.botId === botFilter).length}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {combinedBets
                    .filter((c) => botFilter === "all" || c.botId === botFilter)
                    .map((combo) => (
                      <CombinedBetCard key={combo.id} combo={combo} onResolved={fetchData} />
                    ))}
                </div>
              </section>
            )}

            {/* ── Bot filter ────────────────────────────────────── */}
            {bots.length > 1 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <span className="font-mono text-[10px] uppercase tracking-widest mr-1" style={{ color: "var(--t3)" }}>Bot :</span>
                {[{ id: "all", name: "Tous" }, ...bots.map((b) => ({ id: b.id, name: b.name }))].map((b) => (
                  <button key={b.id} onClick={() => setBotFilter(b.id)}
                    className="font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all"
                    style={botFilter === b.id
                      ? { background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.3)", cursor: "pointer" }
                      : { background: "transparent", color: "var(--t3)", border: "1px solid var(--border)", cursor: "pointer" }
                    }>
                    {b.name}
                  </button>
                ))}
              </div>
            )}

            {/* ── Pending bets table ────────────────────────────── */}
            {pendingBets.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-px h-5 rounded-full" style={{ background: "var(--accent)" }} />
                  <h2 className="font-display font-black tracking-tight uppercase" style={{ fontSize: 20, color: "var(--t1)" }}>
                    Paris en cours
                  </h2>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--adim)", color: "var(--accent)" }}>
                    {pendingBets.length}
                  </span>
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead style={{ borderBottom: "1px solid var(--border)", background: "var(--bg3)" }}>
                        <tr>
                          <SortTh label="Bot"   sortKey="bot"   current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Match" sortKey="match" current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Pick"  sortKey="pick"  current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Cote"  sortKey="odds"  current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Mise"  sortKey="stake" current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Edge"  sortKey="edge"  current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <SortTh label="Date"  sortKey="date"  current={pendingSort.key} dir={pendingSort.dir} onClick={togglePendingSort} />
                          <th className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--t3)" }}>Statut</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {pendingBets.map((bet) => <BetRow key={bet.id} bet={bet} showProfit={false} onResolved={fetchData} />)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ── History ───────────────────────────────────────── */}
            {historyBets.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-px h-5 rounded-full" style={{ background: "var(--gold)" }} />
                    <h2 className="font-display font-black tracking-tight uppercase" style={{ fontSize: 20, color: "var(--t1)" }}>
                      Historique
                    </h2>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--gold-dim)", color: "var(--gold)" }}>
                      {historyBets.length}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {(["all", "won", "lost"] as const).map((f) => (
                      <button key={f} onClick={() => setBetFilter(f)}
                        className="font-mono text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded transition-all"
                        style={betFilter === f
                          ? { background: "var(--adim)", color: "var(--accent)", border: "1px solid rgba(0,232,124,.3)", cursor: "pointer" }
                          : { background: "transparent", color: "var(--t3)", border: "1px solid var(--border)", cursor: "pointer" }
                        }>
                        {f === "all" ? "Tous" : f === "won" ? "Gagnés" : "Perdus"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead style={{ borderBottom: "1px solid var(--border)", background: "var(--bg3)" }}>
                        <tr>
                          <SortTh label="Bot"    sortKey="bot"    current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Match"  sortKey="match"  current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Pick"   sortKey="pick"   current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Cote"   sortKey="odds"   current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Mise"   sortKey="stake"  current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Edge"   sortKey="edge"   current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Profit" sortKey="profit" current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <SortTh label="Date"   sortKey="date"   current={historySort.key} dir={historySort.dir} onClick={toggleHistorySort} />
                          <th className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--t3)" }}>Résultat</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.map((bet) => <BetRow key={bet.id} bet={bet} showProfit={true} onResolved={fetchData} />)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ── Model stats ───────────────────────────────────── */}
            {modelStats.length > 0 && (
              <div className="mt-12 pt-8" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="font-mono text-[9px] tracking-[0.14em] uppercase mb-4" style={{ color: "var(--t3)" }}>
                  Modèles LLM actifs
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {modelStats.map((stat, idx) => (
                    <div key={stat.model} className="card p-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                          {stat.model.split("/").pop()?.split(":")[0] ?? stat.model}
                        </span>
                        <span className="font-mono text-[12px] font-bold" style={{ color: "var(--t1)" }}>{stat.totalCalls}</span>
                      </div>
                      {stat.failedCalls > 0 && (
                        <div className="font-mono text-[10px]" style={{ color: "var(--red)" }}>{stat.failedCalls} erreurs</div>
                      )}
                      {stat.totalCalls > 0 && (
                        <div className="font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                          ~{fmtTokens(stat.avgTokens)} tok/req
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
