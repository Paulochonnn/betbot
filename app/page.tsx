"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ── Types ────────────────────────────────────────────────────────────── */
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
  sports: string;
  lastRunAt: string | null;
  createdAt: string;
  stats: BotStats;
};

type Bet = {
  id: string;
  botId: string;
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
  bot: { name: string };
};

type ApiStats = {
  oddsRequestsUsed: number;
  oddsRequestsRemaining: number;
  claudeRequests: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  oddsCallsLastHour: number;
  oddsCallsLastDay: number;
  oddsSuccessRate: number;
};

/* ── Config ───────────────────────────────────────────────────────────── */
const SPORT_CFG: Record<string, { color: string; bg: string }> = {
  soccer:     { color: "#5a8fff", bg: "rgba(90,143,255,.1)"  },
  football:   { color: "#5a8fff", bg: "rgba(90,143,255,.1)"  },
  tennis:     { color: "#e09820", bg: "rgba(224,152,32,.1)"  },
  basketball: { color: "#ff6844", bg: "rgba(255,104,68,.1)"  },
};
function sportColor(s: string) { return SPORT_CFG[s.toLowerCase()] ?? { color: "var(--t2)", bg: "rgba(128,128,160,0.08)" }; }
function sportLabel(s: string) {
  if (s === "soccer" || s === "football") return "Football";
  if (s === "basketball") return "Basketball";
  return "Tennis";
}

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
function pad(n: number) { return String(n).padStart(2, "0"); }

/* ── Count-up hook ────────────────────────────────────────────────────── */
function useCountUp(target: number, { duration = 1400, decimals = 2, delay = 0 } = {}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf: number;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      function step(now: number) {
        const p = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setVal(+(target * e).toFixed(decimals));
        if (p < 1) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, duration, decimals, delay]);
  return val;
}

/* ── Countdown hook ───────────────────────────────────────────────────── */
function useCountdown(msRef: React.RefObject<number | null>) {
  const [display, setDisplay] = useState("--:--:--");
  useEffect(() => {
    const id = setInterval(() => {
      const ms = msRef.current;
      if (ms === null || ms === undefined) { setDisplay("--:--:--"); return; }
      const rem = Math.max(0, ms - Date.now());
      const h = Math.floor(rem / 3_600_000);
      const m = Math.floor((rem % 3_600_000) / 60_000);
      const s = Math.floor((rem % 60_000) / 1_000);
      setDisplay(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }, 1000);
    return () => clearInterval(id);
  }, [msRef]);
  return display;
}

const BOT_COLORS = ["#00e87c", "#5a8fff", "#e09820", "#ff6844", "#a78bfa"];

/* ── Build 30-day bankroll series for one bot ────────────────────────── */
function buildHistory(bot: Bot, bets: Bet[]): { value: number; dateLabel: string }[] {
  const now = Date.now();
  const resolved = bets
    .filter((b) => b.botId === bot.id && b.status !== "pending" && b.profit !== null)
    .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

  const eventsByDay = new Map<string, number>();
  let running = bot.initialBankroll;
  for (const bet of resolved) {
    running += bet.profit!;
    const key = new Date(bet.matchDate).toISOString().slice(0, 10);
    eventsByDay.set(key, running);
  }

  const days: { value: number; dateLabel: string }[] = [];
  let lastVal = bot.initialBankroll;

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    if (eventsByDay.has(key)) lastVal = eventsByDay.get(key)!;
    days.push({
      value: lastVal,
      dateLabel: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    });
  }
  days[days.length - 1].value = bot.bankroll;
  return days;
}

/* ── Streak ───────────────────────────────────────────────────────────── */
function computeStreak(bets: Bet[]): { count: number; type: "won" | "lost" | null } {
  const resolved = [...bets]
    .filter((b) => b.status !== "pending")
    .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
  if (!resolved.length) return { count: 0, type: null };
  const type = resolved[0].status as "won" | "lost";
  let count = 0;
  for (const b of resolved) {
    if (b.status === type) count++;
    else break;
  }
  return { count, type };
}

/* ── BankrollChart (multi-bot comparison) ─────────────────────────── */
function BankrollChart({ bots, bets }: { bots: Bot[]; bets: Bet[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const series = bots
    .map((bot, i) => ({ bot, color: BOT_COLORS[i % BOT_COLORS.length], data: buildHistory(bot, bets) }))
    .filter((s) => s.data.length >= 2);

  if (series.length === 0) return null;

  const W = 1000, H = 200, PX = 14, PY = 20;
  const allVals = series.flatMap((s) => s.data.map((d) => d.value));
  const mn = Math.min(...allVals) - 1.5;
  const mx = Math.max(...allVals) + 1.2;
  const len = series[0].data.length;
  const xs = (i: number) => PX + (i / (len - 1)) * (W - PX * 2);
  const ys = (v: number) => H - PY - ((v - mn) / (mx - mn)) * (H - PY * 2);
  const dateLabels = series[0].data.map((d) => d.dateLabel);
  const xLabelIdx = [0, 7, 14, 21, len - 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(len - 1, Math.round(x * (len - 1)))));
  }

  return (
    <div className="mt-9">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--t3)" }}>
          Comparaison des Bankrolls
        </span>
        <div className="flex items-center gap-4 flex-wrap">
          {series.map(({ bot, color }) => {
            const delta = bot.initialBankroll > 0 ? ((bot.bankroll - bot.initialBankroll) / bot.initialBankroll) * 100 : 0;
            return (
              <div key={bot.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: color }} />
                <span className="font-mono text-[10px]" style={{ color: "var(--t2)" }}>{bot.name}</span>
                <span className="font-mono text-[10px]" style={{ color: delta >= 0 ? "var(--accent)" : "var(--red)" }}>
                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                </span>
              </div>
            );
          })}
          <span className="font-mono text-[10px]" style={{ color: "var(--t3)" }}>30 derniers jours</span>
        </div>
      </div>
      <div className="relative" style={{ cursor: "crosshair" }} onMouseLeave={() => setHover(null)}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 200, display: "block", overflow: "visible" }}
          onMouseMove={onMove}
        >
          <defs>
            {series.map(({ bot, color }) => (
              <linearGradient key={bot.id} id={`cf-${bot.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity=".12" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0.15, 0.4, 0.65, 0.88].map((t, i) => (
            <line key={i} x1={PX} x2={W - PX} y1={PY + t * (H - PY * 2)} y2={PY + t * (H - PY * 2)}
              stroke="rgba(128,128,160,0.06)" strokeWidth="1" />
          ))}
          {/* Areas (rendered first so lines sit on top) */}
          {series.map(({ bot, color, data }) => {
            const pts = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(d.value).toFixed(1)}`).join(" ");
            return <path key={`a-${bot.id}`} d={pts + ` L ${xs(data.length - 1)} ${H} L ${xs(0)} ${H} Z`} fill={`url(#cf-${bot.id})`} className="chart-area" />;
          })}
          {/* Lines */}
          {series.map(({ bot, color, data }) => {
            const pts = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(d.value).toFixed(1)}`).join(" ");
            return <path key={`l-${bot.id}`} d={pts} fill="none" stroke={color} strokeWidth="1.8" className="chart-line" />;
          })}
          {/* Now dots */}
          {series.map(({ bot, color, data }) => (
            <circle key={`d-${bot.id}`}
              cx={xs(data.length - 1)} cy={ys(data[data.length - 1].value)}
              r="3.5" fill="var(--bg2)" stroke={color} strokeWidth="1.8" />
          ))}
          {/* Hover crosshair + dots */}
          {hover !== null && (
            <>
              <line x1={xs(hover)} x2={xs(hover)} y1={PY} y2={H - PY}
                stroke="rgba(128,128,160,.14)" strokeWidth="1" strokeDasharray="3 3" />
              {series.map(({ bot, color, data }) => (
                <circle key={`hd-${bot.id}`}
                  cx={xs(hover)} cy={ys(data[hover]?.value ?? 0)}
                  r="4" fill={color} stroke="var(--bg)" strokeWidth="2" />
              ))}
            </>
          )}
        </svg>
        {hover !== null && (
          <div
            className="absolute pointer-events-none z-20 rounded-lg px-3 py-2.5"
            style={{
              background: "var(--bg3)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              left: `${(xs(hover) / W) * 100}%`,
              top: "8px",
              transform: hover > len * 0.65 ? "translate(-108%, 0)" : "translate(8%, 0)",
            }}
          >
            <div className="font-mono text-[9px] mb-1.5" style={{ color: "var(--t3)" }}>{dateLabels[hover]}</div>
            {series.map(({ bot, color, data }) => (
              <div key={bot.id} className="flex items-center gap-2 mb-0.5 last:mb-0">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="font-mono text-[10px]" style={{ color: "var(--t2)" }}>{bot.name}</span>
                <span className="font-mono text-[11px] font-medium ml-auto pl-3" style={{ color }}>
                  €{(data[hover]?.value ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-between px-0.5 mt-2">
        {xLabelIdx.map((idx) => (
          <span key={idx} className="font-mono text-[10px]" style={{ color: "var(--t3)" }}>
            {dateLabels[idx]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Sparkline ────────────────────────────────────────────────────────── */
function Sparkline({ data, color, fill = false }: { data: number[]; color: string; fill?: boolean }) {
  if (data.length < 2) return null;
  const W = 120, H = 36, P = 2;
  const mn = Math.min(...data) - 0.2, mx = Math.max(...data) + 0.2;
  const xs = (i: number) => P + (i / (data.length - 1)) * (W - P * 2);
  const ys = (v: number) => H - P - ((v - mn) / (mx - mn)) * (H - P * 2);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(" ");
  const area = line + ` L ${xs(data.length - 1)} ${H} L ${xs(0)} ${H} Z`;
  const uid = color.replace(/[^a-z0-9]/gi, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={`spk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spk-${uid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" opacity=".85" />
      <circle cx={xs(data.length - 1)} cy={ys(data[data.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

/* ── Pending Strip ────────────────────────────────────────────────────── */
function PendingStrip({ bets }: { bets: Bet[] }) {
  if (!bets.length) return null;
  return (
    <div className="mt-9">
      <div className="flex items-center gap-3 mb-3.5">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--t3)" }}>
          Paris en attente aujourd'hui
        </span>
        <span
          className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ background: "rgba(64,128,255,.1)", color: "#5a8fff", border: "1px solid rgba(64,128,255,.2)" }}
        >
          {bets.length} actifs
        </span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {bets.slice(0, 4).map((bet) => {
          const cfg = sportColor(bet.sport);
          const confidence = Math.round(Math.min(95, Math.max(55, bet.edge * 400 + 55)));
          const potential = (bet.odds - 1) * bet.stake;
          return (
            <div
              key={bet.id}
              className="relative flex flex-col gap-2.5 rounded-[9px] px-[18px] py-4 transition-colors"
              style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}
            >
              {/* left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-[9px]" style={{ background: "var(--accent)", opacity: 0.5 }} />
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>
                  {bet.homeTeam} vs {bet.awayTeam}
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: cfg.bg, color: cfg.color }}>
                  {sportLabel(bet.sport)}
                </span>
              </div>
              <div className="text-[12px]" style={{ color: "var(--t2)" }}>{bet.pick}</div>
              <div className="flex items-center gap-4">
                {[
                  { lbl: "Cote",      val: bet.odds.toFixed(2) },
                  { lbl: "Mise",      val: `€${bet.stake.toFixed(2)}` },
                  { lbl: "Gain pot.", val: `+€${potential.toFixed(2)}`, accent: true },
                ].map(({ lbl, val, accent }) => (
                  <div key={lbl} className="flex flex-col gap-0.5">
                    <div className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "var(--t3)" }}>{lbl}</div>
                    <div className="font-display text-[17px] font-black" style={{ color: accent ? "var(--accent)" : "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-[3px] rounded-sm overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-sm conf-fill" style={{ width: `${confidence}%`, background: "var(--accent)" }} />
                </div>
                <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: "var(--accent)" }}>
                  Confiance {confidence}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sport Breakdown ──────────────────────────────────────────────────── */
function SportBreakdown({ bets }: { bets: Bet[] }) {
  const resolved = bets.filter((b) => b.status !== "pending" && b.profit !== null);
  const groups: Record<string, { bets: number; won: number; pnl: number; color: string }> = {};
  for (const b of resolved) {
    const key = sportLabel(b.sport);
    const cfg = sportColor(b.sport);
    if (!groups[key]) groups[key] = { bets: 0, won: 0, pnl: 0, color: cfg.color };
    groups[key].bets += 1;
    groups[key].won  += b.status === "won" ? 1 : 0;
    groups[key].pnl  += b.profit!;
  }
  const entries = Object.entries(groups).sort((a, b) => b[1].bets - a[1].bets);
  const totalBets = entries.reduce((s, [, v]) => s + v.bets, 0);
  const totalPnl  = entries.reduce((s, [, v]) => s + v.pnl, 0);
  if (!entries.length) return null;

  return (
    <div className="rounded-[10px] px-7 py-6 mt-3.5" style={{ background: "var(--bg2)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
      <div className="flex justify-between items-baseline mb-5">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--t3)" }}>
          Performance par sport · 30 jours
        </span>
        <span className="font-display text-[22px] font-black tracking-[-0.01em]" style={{ color: totalPnl >= 0 ? "var(--accent)" : "var(--red)", fontVariantNumeric: "lining-nums tabular-nums" }}>
          {totalPnl >= 0 ? "+" : "−"}€{Math.abs(totalPnl).toFixed(2)}
        </span>
      </div>
      {/* Segmented bar */}
      <div className="h-[10px] rounded-[5px] overflow-hidden flex mb-[18px] bar-grow" style={{ background: "var(--bg4)" }}>
        {entries.map(([sport, v]) => (
          <div key={sport} style={{ flex: v.bets, background: v.color, opacity: v.pnl >= 0 ? 0.92 : 0.55 }} />
        ))}
      </div>
      {/* Legend */}
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: `repeat(${Math.min(entries.length, 3)}, 1fr)` }}>
        {entries.map(([sport, v]) => {
          const wr = Math.round((v.won / v.bets) * 100);
          return (
            <div key={sport} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: v.color }} />
                <span className="text-[11px] font-medium" style={{ color: "var(--t1)" }}>{sport}</span>
                <span className="font-mono text-[10px] ml-auto" style={{ color: "var(--t3)" }}>
                  {Math.round((v.bets / totalBets) * 100)}%
                </span>
              </div>
              <div className="flex gap-3 font-mono text-[10px]" style={{ color: "var(--t3)" }}>
                <span>{v.bets} paris</span>
                <span>·</span>
                <span>{wr}% WR</span>
                <span>·</span>
                <span className="font-semibold" style={{ color: v.pnl >= 0 ? "var(--accent)" : "var(--red)" }}>
                  {v.pnl >= 0 ? "+" : "−"}€{Math.abs(v.pnl).toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bet Row ──────────────────────────────────────────────────────────── */
function BetRow({ bet }: { bet: Bet }) {
  const [open, setOpen] = useState(false);
  const cfg = sportColor(bet.sport);
  const RM: Record<string, string> = { won: "Gagné", lost: "Perdu", pending: "En cours" };
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        className="grid items-center px-6 py-3.5 cursor-pointer relative transition-colors hover:bg-[rgba(128,128,160,0.04)]"
        style={{ gridTemplateColumns: "2.2fr 1fr 1.4fr .72fr .72fr .9fr .9fr 32px" }}
        onClick={() => setOpen((o) => !o)}
      >
        {/* hover left accent */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--accent)" }} />
        <div>
          <div className="text-[13px] font-medium" style={{ color: "var(--t1)" }}>
            {bet.homeTeam} vs {bet.awayTeam}
          </div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: "var(--t2)" }}>
            {new Date(bet.matchDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "Europe/Paris" })}
          </div>
        </div>
        <div>
          <span className="font-mono text-[10px] px-2 py-1 rounded" style={{ background: cfg.bg, color: cfg.color }}>
            {sportLabel(bet.sport)}
          </span>
        </div>
        <div className="text-[12px]" style={{ color: "var(--t1)" }}>{bet.pick}</div>
        <div className="font-mono text-[12px]" style={{ color: "var(--t1)" }}>{bet.odds.toFixed(2)}</div>
        <div className="font-mono text-[12px]" style={{ color: "var(--t1)" }}>€{bet.stake.toFixed(2)}</div>
        <div>
          <span
            className="font-mono text-[10px] font-semibold px-2.5 py-1 rounded uppercase tracking-[0.06em]"
            style={
              bet.status === "won"
                ? { background: "var(--adim)", color: "var(--accent)" }
                : bet.status === "lost"
                ? { background: "var(--rdim)", color: "var(--red)" }
                : { background: "rgba(128,128,128,.08)", color: "var(--t2)" }
            }
          >
            {RM[bet.status]}
          </span>
        </div>
        <div
          className="font-mono text-[12px] font-medium"
          style={{ color: bet.profit !== null ? (bet.profit >= 0 ? "var(--accent)" : "var(--red)") : "var(--t3)" }}
        >
          {bet.profit !== null
            ? `${bet.profit >= 0 ? "+" : "−"}€${Math.abs(bet.profit).toFixed(2)}`
            : "—"}
        </div>
        <button
          className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-[9px] transition-all"
          style={{ border: "1px solid var(--border)", background: "none", color: "var(--t3)", cursor: "pointer" }}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <div className="px-6 pb-4 pt-3" style={{ background: "var(--bg3)", borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] uppercase mb-1.5" style={{ color: "var(--accent)" }}>
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
            Analyse IA — {bet.bot.name}
          </div>
          <div className="font-mono text-[12px] leading-[1.8]" style={{ color: "var(--t2)" }}>{bet.reasoning}</div>
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {[`Edge ${(bet.edge * 100).toFixed(1)}%`, `Cote ${bet.odds.toFixed(2)}`, sportLabel(bet.sport)].map((tag) => (
              <span
                key={tag}
                className="font-mono text-[10px] px-2 py-0.5 rounded-[3px]"
                style={{ border: "1px solid var(--border)", color: "var(--t3)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [bots, setBots]       = useState<Bot[]>([]);
  const [bets, setBets]       = useState<Bet[]>([]);
  const [apiStats, setApiStats] = useState<ApiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const nextRunAtRef = useRef<number | null>(null);
  const countdown = useCountdown(nextRunAtRef);

  useEffect(() => {
    const load = () =>
      Promise.all([
        fetch("/api/bots").then((r) => r.json()),
        fetch("/api/bets").then((r) => r.json()),
        fetch("/api/stats").then((r) => r.json()),
      ]).then(([b, bt, s]) => {
        setBots(b);
        setBets(bt);
        setApiStats(s);
        setLoading(false);
        const active = (b as Bot[]).find((bot) => bot.status === "active");
        if (active?.lastRunAt) {
          nextRunAtRef.current = new Date(active.lastRunAt).getTime() + 30 * 60 * 1000;
        }
      });
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  /* ── Aggregate data (computed from state — safe with empty arrays) ── */
  const primaryBot    = bots.find((b) => b.status === "active") ?? bots[0];
  const totalBankroll  = bots.reduce((s, b) => s + b.bankroll, 0);
  const totalInitial   = bots.reduce((s, b) => s + b.initialBankroll, 0);
  const resolved       = bets.filter((b) => b.status !== "pending" && b.profit !== null);
  const won            = resolved.filter((b) => b.status === "won");
  const pending        = bets.filter((b) => b.status === "pending");
  const pendingStakes  = pending.reduce((s, b) => s + b.stake, 0);
  const totalValue     = totalBankroll + pendingStakes;
  const bankrollDiff   = totalValue - totalInitial;
  const winRate       = resolved.length > 0 ? (won.length / resolved.length) * 100 : 0;
  const totalProfit   = resolved.reduce((s, b) => s + b.profit!, 0);
  const roi           = totalInitial > 0 ? (totalProfit / totalInitial) * 100 : 0;
  const streak        = computeStreak(bets);
  const history       = primaryBot ? buildHistory(primaryBot, bets) : [];

  /* ── All hooks unconditionally before any early return ─────────── */
  const bankrollDisplay = useCountUp(totalValue, { duration: 1500, decimals: 2 });
  const winRateDisplay  = useCountUp(winRate,        { duration: 1200, decimals: 0, delay: 200 });
  const roiDisplay      = useCountUp(Math.abs(roi),  { duration: 1200, decimals: 1, delay: 300 });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <div className="font-display text-5xl font-black tracking-tight mb-2" style={{ color: "var(--accent)" }}>BETBOT</div>
          <div className="font-mono text-xs tracking-widest" style={{ color: "var(--t3)" }}>Chargement…</div>
        </div>
      </div>
    );
  }

  if (!bots.length) {
    return (
      <div className="page min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="font-display text-2xl font-black tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
            Aucun bot configuré
          </div>
          <Link
            href="/bots/new"
            className="font-mono text-sm tracking-wider no-underline transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            Créer votre premier bot →
          </Link>
        </div>
      </div>
    );
  }

  /* ── Sparkline data ─────────────────────────────────────── */
  const winSparkData = history.slice(-13).map((d) => d.value);
  const roiSparkData = history.slice(-13).map((d, i, arr) => {
    const base = arr[0].value;
    return base > 0 ? ((d.value - base) / base) * 100 : 0;
  });
  const pendingSparkData = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.now() - (12 - i) * 86400000).toISOString().slice(0, 10);
    return bets.filter((b) => b.matchDate.slice(0, 10) === d && b.status === "pending").length;
  });

  /* Win/loss dot pattern for last 20 resolved bets */
  const dotPat = [...resolved].slice(-20).map((b) => b.status === "won" ? 1 : 0);

  const recentBets = [...bets]
    .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
    .slice(0, 8);

  return (
    <main className="page">
      <div className="tab-anim">

        {/* ── HERO ────────────────────────────────────────────── */}
        <div className="relative grid pt-[52px] pb-0 gap-6" style={{ gridTemplateColumns: "1fr auto", alignItems: "start" }}>
          {/* Glow */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 600, height: 350, top: -60, left: -80,
              background: "radial-gradient(ellipse, var(--aglow) 0%, transparent 65%)",
              opacity: 0.45,
            }}
          />
          <div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase mb-3.5" style={{ color: "var(--t3)" }}>
              Valeur Totale
              {bots.length === 1 ? ` · ${primaryBot.name}` : ` · ${bots.length} bots`}
              {" · "}Mis à jour maintenant
            </div>
            <div
              className="font-display font-black leading-[0.88] relative"
              style={{ fontSize: 92, letterSpacing: "-0.025em", color: "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
              <span style={{ fontSize: 40, color: "var(--t3)", fontWeight: 700, verticalAlign: "super", marginRight: 2, letterSpacing: "-0.01em" }}>€</span>
              {bankrollDisplay.toFixed(2)}
            </div>
            <div className="flex items-center gap-3 mt-[18px]">
              <span className="font-mono text-[13px]" style={{ color: bankrollDiff >= 0 ? "var(--accent)" : "var(--red)" }}>
                {bankrollDiff >= 0 ? "+" : "−"}€{Math.abs(bankrollDiff).toFixed(2)}
              </span>
              <div className="w-px h-3" style={{ background: "var(--border)" }} />
              <span className="font-mono text-[11px]" style={{ color: "var(--t3)" }}>
                {fmtPct((bankrollDiff / totalInitial) * 100)} depuis le départ
              </span>
              <div className="w-px h-3" style={{ background: "var(--border)" }} />
              <span className="font-mono text-[11px]" style={{ color: "var(--t3)" }}>
                €{totalInitial.toFixed(2)} initial
              </span>
            </div>
            {pendingStakes > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <span className="font-mono text-[11px]" style={{ color: "var(--t3)" }}>
                  €{totalBankroll.toFixed(2)} disponible
                </span>
                <div className="w-px h-3" style={{ background: "var(--border)" }} />
                <span className="font-mono text-[11px]" style={{ color: "#e09820" }}>
                  €{pendingStakes.toFixed(2)} en jeu
                </span>
              </div>
            )}
            {streak.count >= 2 && (
              <div className="flex items-center gap-2.5 mt-3.5">
                <div
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium px-3 py-1.5 rounded-[6px]"
                  style={{
                    background: "rgba(0,232,124,0.08)",
                    border: "1px solid rgba(0,232,124,0.18)",
                    color: "var(--accent)",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full live-dot" />
                  {streak.count} {streak.type === "won" ? "victoires" : "défaites"} consécutives
                </div>
              </div>
            )}
          </div>

          {/* Right: bot info + countdown */}
          <div className="text-right pt-1">
            <div className="font-display font-black tracking-[0.07em] uppercase" style={{ fontSize: 24, color: "var(--t1)" }}>
              {primaryBot.name}
            </div>
            <div className="flex items-center gap-2 justify-end font-mono text-[10px] mt-1.5" style={{ color: "var(--t3)" }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--aglow)", animation: "hdot 2s infinite", display: "inline-block" }}
              />
              <span>
                {primaryBot.status === "active" ? "Actif" : "En pause"}
                {pending.length > 0 ? ` · ${pending.length} paris en attente` : ""}
              </span>
            </div>
            {primaryBot.status === "active" && (
              <div className="flex flex-col items-end gap-0.5 mt-3">
                <div className="font-mono text-[9px] tracking-[0.12em] uppercase" style={{ color: "var(--t3)" }}>
                  Prochain cycle dans
                </div>
                <div
                  className="font-display font-black tracking-[0.04em]"
                  style={{ fontSize: 22, color: "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}
                >
                  {countdown}
                </div>
                <div className="font-mono text-[10px]" style={{ color: "var(--t3)" }}>
                  {pending.length} matchs en attente
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CHART ─────────────────────────────────────────────── */}
        <BankrollChart bots={bots} bets={bets} />

        {/* ── PENDING BETS STRIP ────────────────────────────────── */}
        <PendingStrip bets={pending} />

        {/* ── STATS ROW ─────────────────────────────────────────── */}
        <div className="grid gap-3.5 mt-9" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>

          {/* Win Rate */}
          <div className="card p-7 relative" style={{ boxShadow: "var(--shadow)" }}>
            <div className="absolute left-0 top-[22%] bottom-[22%] w-[2px] rounded-sm" style={{ background: "var(--accent)", opacity: 0.75 }} />
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase mb-2.5" style={{ color: "var(--t3)" }}>Taux de Victoire</div>
            <div
              className="font-display font-black leading-[0.88]"
              style={{ fontSize: 60, letterSpacing: "-0.02em", color: "var(--accent)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
              {winRateDisplay}%
            </div>
            {/* Sparkline top right */}
            <div className="absolute right-[18px] top-[18px]" style={{ width: 90, height: 32, opacity: 0.7 }}>
              <Sparkline data={winSparkData} color="var(--accent)" fill />
            </div>
            {/* Win/loss dots */}
            {dotPat.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3.5">
                {dotPat.map((w, i) => (
                  <div key={i} className="w-2 h-2 rounded-[2px]"
                    style={{ background: w ? "rgba(0,232,124,.5)" : "rgba(240,64,96,.4)" }} />
                ))}
              </div>
            )}
            <div className="font-mono text-[11px] mt-2.5 leading-[1.7]" style={{ color: "var(--t3)" }}>
              <b style={{ color: "var(--t2)", fontWeight: 400 }}>{won.length} victoires</b>
              {" · "}{resolved.length - won.length} défaites
            </div>
          </div>

          {/* ROI */}
          <div className="card p-7 relative" style={{ boxShadow: "var(--shadow)" }}>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase mb-2.5" style={{ color: "var(--t3)" }}>ROI Total</div>
            <div
              className="font-display font-black leading-[0.88]"
              style={{ fontSize: 60, letterSpacing: "-0.02em", color: "#e09820", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
              {roi >= 0 ? "+" : "−"}{roiDisplay.toFixed(1)}%
            </div>
            <div className="absolute right-[18px] top-[18px]" style={{ width: 90, height: 32, opacity: 0.7 }}>
              <Sparkline data={roiSparkData} color="#e09820" fill />
            </div>
            <div className="font-mono text-[11px] mt-3.5 leading-[1.7]" style={{ color: "var(--t3)" }}>
              <b style={{ color: "var(--t2)", fontWeight: 400 }}>{resolved.length}</b> paris joués
              <br />
              {Array.from(new Set(bets.map((b) => sportLabel(b.sport)))).join(", ")}
            </div>
          </div>

          {/* Active bets */}
          <div className="card p-7 relative" style={{ boxShadow: "var(--shadow)" }}>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase mb-2.5" style={{ color: "var(--t3)" }}>Paris Actifs</div>
            <div
              className="font-display font-black leading-[0.88]"
              style={{ fontSize: 60, letterSpacing: "-0.02em", color: "var(--t1)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
              {pending.length}
            </div>
            <div className="absolute right-[18px] top-[18px]" style={{ width: 90, height: 32, opacity: 0.7 }}>
              <Sparkline data={pendingSparkData.map((v) => v + 0.5)} color="var(--t2)" />
            </div>
            <div className="font-mono text-[11px] mt-3.5 leading-[1.7]" style={{ color: "var(--t3)" }}>
              <b style={{ color: "var(--t2)", fontWeight: 400 }}>{bots.filter((b) => b.status === "active").length}</b>
              {" "}bot{bots.filter((b) => b.status === "active").length > 1 ? "s" : ""} actif
              {bots.filter((b) => b.status === "active").length > 1 ? "s" : ""}
              <br />
              {Array.from(new Set(pending.map((b) => sportLabel(b.sport)))).join(" · ") || "—"}
            </div>
          </div>
        </div>

        {/* ── SPORT BREAKDOWN ───────────────────────────────────── */}
        <SportBreakdown bets={bets} />

        {/* ── BETS TABLE ────────────────────────────────────────── */}
        {recentBets.length > 0 && (
          <>
            <div className="flex items-center gap-4 my-10">
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap" style={{ color: "var(--t3)" }}>
                Paris Récents
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: "var(--t3)" }}>
                Cliquez pour l'analyse IA →
              </span>
            </div>
            <div className="rounded-[10px] overflow-hidden" style={{ background: "var(--bg2)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
              {/* Header */}
              <div
                className="grid px-6 py-2.5"
                style={{ gridTemplateColumns: "2.2fr 1fr 1.4fr .72fr .72fr .9fr .9fr 32px", borderBottom: "1px solid var(--border)", background: "var(--bg3)" }}
              >
                {["Match", "Sport", "Pronostic", "Cote", "Mise", "Résultat", "Gain/Perte", ""].map((h) => (
                  <div key={h} className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "var(--t3)" }}>{h}</div>
                ))}
              </div>
              {recentBets.map((b) => <BetRow key={b.id} bet={b} />)}
            </div>
          </>
        )}

        {/* ── API STATS (bottom) ─────────────────────────────────── */}
        {apiStats && (
          <div className="mt-12 pt-8" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase mb-4" style={{ color: "var(--t3)" }}>Usage API</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--t3)" }}>odds-api.io</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--adim)", color: "var(--accent)" }}>
                    Actif
                  </span>
                </div>
                {/* Rate limit progress bar */}
                {(() => {
                  const used  = apiStats.oddsCallsLastHour;
                  const limit = 100;
                  const pct   = Math.min(100, Math.round((used / limit) * 100));
                  const barColor = pct >= 85 ? "var(--red)" : pct >= 60 ? "#e09820" : "var(--accent)";
                  return (
                    <>
                      <div className="flex justify-between font-mono text-[9px] mb-1" style={{ color: "var(--t3)" }}>
                        <span>Req / heure</span>
                        <span style={{ color: barColor, fontWeight: 600 }}>{used} / {limit}</span>
                      </div>
                      <div className="h-[4px] rounded-full overflow-hidden mb-3" style={{ background: "var(--bg4)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </>
                  );
                })()}
                <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  <span>Dernières 24h</span>
                  <span style={{ color: "var(--t2)" }}>{apiStats.oddsCallsLastDay} appels</span>
                </div>
                <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  <span>Taux de succès (1h)</span>
                  <span style={{ color: apiStats.oddsSuccessRate >= 95 ? "var(--accent)" : "#e09820" }}>
                    {apiStats.oddsSuccessRate}%
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  <span>Bookmakers</span>
                  <span style={{ color: "var(--t2)" }}>Bet365 · Winamax FR</span>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--t3)" }}>OpenRouter LLM</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--adim)", color: "var(--accent)" }}>
                    {apiStats.claudeRequests} req
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[10px]" style={{ color: "var(--t3)" }}>
                  <span>Tokens entrée</span>
                  <span style={{ color: "var(--t2)" }}>{fmtTokens(apiStats.claudeInputTokens)}</span>
                </div>
                <div className="flex justify-between font-mono text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  <span>Tokens sortie</span>
                  <span style={{ color: "var(--t2)" }}>{fmtTokens(apiStats.claudeOutputTokens)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
