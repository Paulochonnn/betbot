"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/* ── Logo ─────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
      <path d="M14 1.5L25.5 8v14L14 28.5 2.5 22V8z" fill="var(--accent)" />
      <path d="M7 19.5L10.2 15L13.5 17L18 11L21 13.5"
        stroke="rgba(0,0,0,0.65)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ── Live clock ───────────────────────────────────────────────────────── */
function LiveClock() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!t) return null;
  return (
    <span className="font-mono text-[11px] tracking-[0.04em]" style={{ color: "var(--t3)" }}>
      {t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

/* ── Ticker ───────────────────────────────────────────────────────────── */
const TICKER_ITEMS = [
  { label: "SENTINEL", match: "PSG vs Lyon",            val: "+€4.25", cls: "pos" },
  { label: "SENTINEL", match: "Djokovic vs Alcaraz",    val: "+€1.65", cls: "pos" },
  { label: "SENTINEL", match: "Lakers vs Warriors",     val: "−€4.00", cls: "neg" },
  { label: "SYSTÈME",  match: "Paris actifs ce soir",   val: "3 en cours", cls: "" },
  { label: "SENTINEL", match: "Real Madrid vs Barça",   val: "+€3.60", cls: "pos" },
  { label: "PERF.",    match: "ROI mensuel",             val: "+8.4%",  cls: "pos" },
  { label: "SENTINEL", match: "Prochain cycle · 21h30", val: "4 matchs analysés", cls: "" },
];

function Ticker() {
  return (
    <div className="ticker-strip">
      <div
        className="flex-shrink-0 h-full flex items-center font-mono text-[9px] font-medium tracking-[0.12em] uppercase border-r px-3.5"
        style={{ color: "var(--accent)", borderColor: "var(--border)" }}
      >
        ● Live
      </div>
      <div className="flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, black 5%, black 95%, transparent)" }}>
        <div
          className="inline-flex gap-0 whitespace-nowrap"
          style={{ animation: "tickerMove 50s linear infinite" }}
          onMouseEnter={(e) => (e.currentTarget.style.animationPlayState = "paused")}
          onMouseLeave={(e) => (e.currentTarget.style.animationPlayState = "running")}
        >
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 font-mono text-[10px] px-6" style={{ color: "var(--t2)" }}>
              <span className="text-[9px] tracking-[0.06em]" style={{ color: "var(--t3)" }}>{item.label}</span>
              <span className="text-[9px] opacity-40" style={{ color: "var(--t3)" }}>·</span>
              <span>{item.match}</span>
              <span className="text-[9px] opacity-40" style={{ color: "var(--t3)" }}>·</span>
              <span style={{ color: item.cls === "pos" ? "var(--accent)" : item.cls === "neg" ? "var(--red)" : "var(--t2)" }}>
                {item.val}
              </span>
              <span className="text-[8px] mx-2 opacity-30" style={{ color: "var(--t3)" }}>◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── NavBar ───────────────────────────────────────────────────────────── */
export function NavBar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("bb-theme") as "dark" | "light") || "dark";
    setTheme(saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("bb-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const tabs = [
    { href: "/",     label: "Tableau de bord" },
    { href: "/bots", label: "Robots" },
  ];

  return (
    <>
      {/* HexWatermark lives here so it's always visible */}
      <div className="hex-watermark">
        <svg viewBox="0 0 100 100" fill="none">
          <path d="M50 4 L88 26 L88 74 L50 96 L12 74 L12 26 Z" stroke="var(--accent)" strokeWidth="0.6" />
          <path d="M50 16 L78 32 L78 68 L50 84 L22 68 L22 32 Z" stroke="var(--accent)" strokeWidth="0.4" opacity=".55" />
          <path d="M50 28 L68 38 L68 62 L50 72 L32 62 L32 38 Z" stroke="var(--accent)" strokeWidth="0.3" opacity=".35" />
        </svg>
      </div>

      <header className="hdr">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-9 no-underline">
          <Logo />
          <span className="font-display text-[15px] font-black tracking-[0.07em] uppercase" style={{ color: "var(--t1)" }}>
            Bet<b style={{ color: "var(--accent)" }}>Bot</b>
          </span>
        </Link>

        {/* Tabs */}
        <nav className="flex h-full">
          {tabs.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="relative h-full flex items-center px-[18px] text-[12px] font-medium tracking-[0.05em] uppercase transition-colors duration-150"
                style={{ color: active ? "var(--t1)" : "var(--t3)", textDecoration: "none" }}
              >
                {label}
                {active && (
                  <span
                    className="absolute bottom-0 left-[18px] right-[18px] h-[1.5px] rounded-sm"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right */}
        <div className="ml-auto flex items-center gap-4">
          <LiveClock />
          <div className="flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--t3)" }}>Actif</span>
          </div>
          <Link
            href="/bots/new"
            className="font-display text-[11px] font-black tracking-[0.08em] uppercase px-3.5 py-1.5 rounded-md transition-all"
            style={{ background: "var(--accent)", color: "#07070b", textDecoration: "none" }}
          >
            + Nouveau Bot
          </Link>
          <button
            onClick={toggleTheme}
            className="w-[30px] h-[30px] rounded-lg flex items-center justify-center transition-all text-sm"
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--t2)", cursor: "pointer" }}
            title="Changer de thème"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <Ticker />
    </>
  );
}
