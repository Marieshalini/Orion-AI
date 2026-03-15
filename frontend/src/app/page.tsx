"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Play, RotateCcw, ChevronRight, Zap,
  TrendingUp, Shield, Target, Cog, Brain,
  Star, AlertCircle, CheckCircle2, Loader2,
  MessageSquarePlus, Info,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BusinessInput {
  revenue: number;
  marketing_budget: number;
  employees: number;
  main_problem: string;
  avg_salary: number;
  cac: number;
  avg_order_value: number;
  gross_margin_pct: number;
}

interface Projections {
  baseline_revenue: number;
  projected_revenue: number;
  revenue_uplift: number;
  revenue_uplift_pct: number;
  baseline_costs: number;
  projected_costs: number;
  monthly_payroll: number;
  gross_profit: number;
  net_profit: number;
  base_net_profit: number;
  net_margin_pct: number;
  new_customers_base: number;
  new_customers_whatif: number;
  romi: number;
  payback_months: number;
  cac: number;
  ltv: number;
  ltv_cac_ratio: number;
  risk_score: number;
  reward_score: number;
  used_estimates: { aov: boolean; gm_pct: boolean; salary: boolean };
}

interface AgentMessage {
  id: string;
  name: string;
  emoji: string;
  color: string;
  content: string;
  streaming: boolean;
  isPlanner?: boolean;
}

type AppStep = "input" | "questions" | "simulation" | "result";

const AGENT_CONFIG = {
  sales:      { name: "Sales Agent",      emoji: "📈", color: "#a855f7", label: "Growth & Revenue" },
  marketing:  { name: "Marketing Agent",  emoji: "🎯", color: "#c084fc", label: "Acquisition & Brand" },
  finance:    { name: "Finance Agent",    emoji: "💎", color: "#e879f9", label: "Risk & Cash Flow" },
  operations: { name: "Operations Agent", emoji: "⚡", color: "#7c3aed", label: "Execution & Scale" },
} as const;

// ── Star field ────────────────────────────────────────────────────────────────
interface StarData { id: number; x: number; y: number; size: number; dur: string; delay: string; op: string; }

function StarField() {
  const [stars, setStars] = useState<StarData[]>([]);
  useEffect(() => {
    setStars(Array.from({ length: 120 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 2 + 0.5, dur: (Math.random() * 4 + 2).toFixed(1),
      delay: (Math.random() * 5).toFixed(1), op: (Math.random() * 0.6 + 0.2).toFixed(2),
    })));
  }, []);
  return (
    <div className="stars">
      {stars.map((s) => (
        <div key={s.id} className="star" style={{
          left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
          "--dur": `${s.dur}s`, "--delay": `${s.delay}s`, "--max-op": s.op,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

// ── Orion Logo ────────────────────────────────────────────────────────────────
function OrionLogo({ size = 48 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="orion-ring absolute inset-0" style={{ width: size, height: size }} />
      <div className="orion-ring absolute" style={{ width: size * 0.65, height: size * 0.65, top: size * 0.175, left: size * 0.175, animationDelay: "0.5s" }} />
      <div className="absolute flex items-center justify-center" style={{ inset: 0 }}>
        <Star className="fill-current" style={{ width: size * 0.38, height: size * 0.38, color: "#c084fc" }} />
      </div>
    </div>
  );
}

// ── Step badge ────────────────────────────────────────────────────────────────
function StepBadge({ step, current, isDone }: { step: number; current: number; isDone?: boolean }) {
  const done = current > step || (step === 4 && isDone);
  const active = current === step && !done;
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all duration-300"
      style={{
        background: done ? "linear-gradient(135deg,#7c3aed,#a855f7)" : active ? "rgba(139,92,246,0.25)" : "rgba(13,0,33,0.8)",
        border: active ? "1px solid rgba(168,85,247,0.7)" : done ? "none" : "1px solid rgba(139,92,246,0.2)",
        color: done ? "white" : active ? "#c084fc" : "rgba(196,181,253,0.4)",
        boxShadow: active ? "0 0 16px rgba(168,85,247,0.4)" : "none",
      }}>
      {done ? <CheckCircle2 size={14} /> : step}
    </div>
  );
}

// ── Agent bubble ──────────────────────────────────────────────────────────────
function AgentBubble({ msg }: { msg: AgentMessage }) {
  const parts = msg.content.split(/(\*\*[^*]+\*\*)/g);
  const isPlan = msg.isPlanner;
  return (
    <div className="agent-bubble flex gap-3 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
        style={{
          background: isPlan ? "rgba(100,116,139,0.15)" : `${msg.color}15`,
          border: `1px solid ${isPlan ? "rgba(100,116,139,0.35)" : msg.color + "35"}`,
        }}>
        {msg.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-mono font-bold" style={{ color: isPlan ? "#94a3b8" : msg.color }}>{msg.name}</span>
          {isPlan && <span className="text-xs opacity-40 font-mono">Scenario Coordinator</span>}
          {!isPlan && <span className="text-xs opacity-40 font-mono">{AGENT_CONFIG[msg.id as keyof typeof AGENT_CONFIG]?.label}</span>}
        </div>
        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: isPlan ? "rgba(100,116,139,0.08)" : `${msg.color}08`,
            border: `1px solid ${isPlan ? "rgba(100,116,139,0.2)" : msg.color + "20"}`,
          }}>
          {parts.map((p, i) =>
            p.startsWith("**") && p.endsWith("**")
              ? <strong key={i} style={{ color: isPlan ? "#94a3b8" : msg.color, fontWeight: 600 }}>{p.slice(2, -2)}</strong>
              : <span key={i}>{p}</span>
          )}
          {msg.streaming && <span className="blink-cursor" />}
        </div>
      </div>
    </div>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="text-xs font-mono" style={{ color }}>{name}</span>
      <span className="text-xs opacity-50">thinking</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="dot-bounce w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: color, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-mono"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
      <span style={{ whiteSpace: "pre-line" }}>{msg}</span>
    </div>
  );
}

// ── Strategy formatter ────────────────────────────────────────────────────────
function StrategyDisplay({ text, streaming }: { text: string; streaming: boolean }) {
  const sectionRegex = /\*\*([^*]+)\*\*[:\s]*/g;
  const sections: { title: string; content: string; color: string; emoji: string }[] = [];
  const SECTION_META: Record<string, { color: string; emoji: string }> = {
    "ORION STRATEGY":   { color: "#c084fc", emoji: "🧠" },
    "TOP 3 ACTIONS":    { color: "#a855f7", emoji: "⚡" },
    "PROJECTED IMPACT": { color: "#22c55e", emoji: "📈" },
    "CRITICAL RISK":    { color: "#f59e0b", emoji: "⚠️" },
  };
  const matches: { title: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(text)) !== null) {
    matches.push({ title: m[1].trim().toUpperCase(), index: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const { title, end } = matches[i];
    const nextIndex = matches[i + 1]?.index ?? text.length;
    const content = text.slice(end, nextIndex).trim();
    const meta = SECTION_META[title] ?? { color: "#c084fc", emoji: "✦" };
    sections.push({ title, content, ...meta });
  }
  if (sections.length === 0) {
    return (
      <div className="text-sm leading-relaxed" style={{ color: "rgba(245,240,255,0.8)" }}>
        {text}{streaming && <span className="blink-cursor" />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((sec, i) => {
        const isLast = i === sections.length - 1;
        const isActionList = sec.title.includes("ACTION");
        const lines = sec.content.split(/\n/).map((l) => l.trim()).filter(Boolean);
        return (
          <div key={sec.title} className="rounded-xl p-4"
            style={{ background: `${sec.color}08`, border: `1px solid ${sec.color}20` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{sec.emoji}</span>
              <span className="text-xs font-mono font-bold tracking-widest uppercase" style={{ color: sec.color }}>
                {sec.title}
              </span>
            </div>
            {isActionList ? (
              <ol className="flex flex-col gap-2">
                {lines.map((line, li) => {
                  const clean = line.replace(/^\d+\.\s*/, "");
                  return (
                    <li key={li} className="flex gap-2 items-start text-sm" style={{ color: "rgba(245,240,255,0.85)" }}>
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold mt-0.5"
                        style={{ background: `${sec.color}20`, color: sec.color }}>{li + 1}</span>
                      <span className="leading-relaxed">{clean}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="text-sm leading-relaxed" style={{ color: "rgba(245,240,255,0.85)" }}>
                {lines.join(" ")}
                {streaming && isLast && <span className="blink-cursor" />}
              </div>
            )}
          </div>
        );
      })}
      {streaming && <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "rgba(196,181,253,0.4)" }}>
        <Loader2 size={10} className="animate-spin" /> Writing strategy…
      </div>}
    </div>
  );
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
function RevenueBarChart({ projections }: { projections: Projections }) {
  const data = [
    { label: "Current",   sub: "Revenue", value: projections.baseline_revenue,  color: "#7c3aed" },
    { label: "Projected", sub: "Revenue", value: projections.projected_revenue, color: "#a855f7" },
    { label: "Current",   sub: "Costs",   value: projections.baseline_costs,    color: "#e879f9" },
    { label: "Projected", sub: "Costs",   value: projections.projected_costs,   color: "#f97316" },
  ];
  const max     = Math.max(...data.map((d) => d.value)) * 1.2;
  const W       = 420;
  const H       = 150;
  const PAD_TOP = 30;
  const PAD_L   = 60;
  const PAD_B   = 46;
  const BAR_W   = 48;
  const GAP     = 20;
  const chartW  = data.length * BAR_W + (data.length - 1) * GAP;
  const startX  = PAD_L + (W - PAD_L - chartW) / 2;
  const TOTAL_H = PAD_TOP + H + PAD_B;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${TOTAL_H}`} width="100%" style={{ display: "block", minWidth: "300px" }}>
        {/* Y gridlines + labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = PAD_TOP + (1 - pct) * H;
          return (
            <g key={pct}>
              <line x1={PAD_L} y1={y} x2={startX + chartW + 8} y2={y}
                stroke="rgba(139,92,246,0.1)" strokeWidth="1" strokeDasharray="4,4" />
              <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize="8.5"
                fill="rgba(196,181,253,0.45)" fontFamily="JetBrains Mono, monospace">
                {formatCurrency(max * pct)}
              </text>
            </g>
          );
        })}
        {/* Baseline axis */}
        <line x1={PAD_L} y1={PAD_TOP + H} x2={startX + chartW + 8} y2={PAD_TOP + H}
          stroke="rgba(139,92,246,0.25)" strokeWidth="1" />
        {/* Bars */}
        {data.map((d, i) => {
          const barH = Math.max(3, (d.value / max) * H);
          const x    = startX + i * (BAR_W + GAP);
          const y    = PAD_TOP + H - barH;
          return (
            <g key={`${d.label}-${d.sub}`}>
              <rect x={x - 3} y={y - 2} width={BAR_W + 6} height={barH + 4} rx="7" fill={d.color} opacity="0.1" />
              <rect x={x} y={y} width={BAR_W} height={barH} rx="5" fill={d.color} opacity="0.88" />
              <text x={x + BAR_W / 2} y={y - 6} textAnchor="middle" fontSize="8.5"
                fill={d.color} fontFamily="JetBrains Mono, monospace" fontWeight="bold">
                {formatCurrency(d.value)}
              </text>
              <text x={x + BAR_W / 2} y={PAD_TOP + H + 14} textAnchor="middle" fontSize="9"
                fill="rgba(245,240,255,0.7)" fontFamily="JetBrains Mono, monospace">
                {d.label}
              </text>
              <text x={x + BAR_W / 2} y={PAD_TOP + H + 27} textAnchor="middle" fontSize="8.5"
                fill="rgba(196,181,253,0.45)" fontFamily="JetBrains Mono, monospace">
                {d.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Risk / Reward bars ────────────────────────────────────────────────────────
function RiskRewardBars({ projections }: { projections: Projections }) {
  const bars = [
    { label: "Reward Score", value: projections.reward_score, color: "#22c55e", emoji: "🚀" },
    { label: "Risk Score",   value: projections.risk_score,   color: "#f59e0b", emoji: "⚠️" },
    { label: "ROMI",         value: Math.min(100, projections.romi / 5), raw: `${projections.romi.toFixed(0)}%`, color: "#c084fc", emoji: "📊" },
    { label: "LTV/CAC",      value: Math.min(100, projections.ltv_cac_ratio * 20), raw: `${projections.ltv_cac_ratio}x`, color: "#06b6d4", emoji: "🎯" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">{b.emoji}</span>
              <span className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.6)" }}>{b.label}</span>
            </div>
            <span className="text-xs font-mono font-bold" style={{ color: b.color }}>
              {"raw" in b ? b.raw : `${b.value}/100`}
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: "rgba(139,92,246,0.12)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, b.value)}%`, background: b.color, boxShadow: `0 0 8px ${b.color}60` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Projection stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, emoji }: { label: string; value: string; sub?: string; color: string; emoji: string }) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.5)" }}>{label}</span>
      </div>
      <span className="text-lg font-mono font-bold" style={{ color }}>{value}</span>
      {sub && <span className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.35)" }}>{sub}</span>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function OrionApp() {
  const [bizInput, setBizInput] = useState<BusinessInput>({
    revenue: 850000, marketing_budget: 45000, employees: 8,
    main_problem: "", avg_salary: 30000, cac: 500,
    avg_order_value: 0, gross_margin_pct: 0,
  });

  const [showAdvanced, setShowAdvanced]     = useState(false);
  const [questions, setQuestions]           = useState<string[]>([]);
  const [answers, setAnswers]               = useState<string[]>([]);
  const [loadingQuestions, setLoadingQ]     = useState(false);
  const [messages, setMessages]             = useState<AgentMessage[]>([]);
  const [typingAgent, setTypingAgent]       = useState<string | null>(null);
  const [strategy, setStrategy]             = useState("");
  const [strategyStreaming, setStratStream] = useState(false);
  const [projections, setProjections]       = useState<Projections | null>(null);
  // What-if
  const [whatIfMarketing, setWhatIfMkt]     = useState(45000);
  const [whatIfEmployees, setWhatIfEmp]     = useState(8);
  const [whatIfActive, setWhatIfActive]     = useState(false);
  // Custom scenario
  const [customScenario, setCustomScenario] = useState("");
  const [showCustom, setShowCustom]         = useState(false);

  const [step, setStep]     = useState<AppStep>("input");
  const [running, setRunning] = useState(false);
  const [error, setError]   = useState("");

  const streamRef  = useRef<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); },
    [messages, typingAgent, strategy]);

  useEffect(() => {
    setWhatIfMkt(bizInput.marketing_budget);
    setWhatIfEmp(bizInput.employees);
  }, [bizInput.marketing_budget, bizInput.employees]);

  const setField = (f: keyof BusinessInput) => (v: number | string) =>
    setBizInput((p) => ({ ...p, [f]: v }));

  // ── Smart questions ───────────────────────────────────────────────────────
  const fetchSmartQuestions = useCallback(async () => {
    if (!bizInput.main_problem.trim()) { setError("Please describe your main business problem first."); return; }
    setError(""); setLoadingQ(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      let res: Response;
      try {
        res = await fetch(`${API}/smart-questions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bizInput), signal: controller.signal,
        });
      } catch (e: any) {
        if (e.name === "AbortError") throw new Error("Request timed out. Is uvicorn running?");
        throw new Error(`Cannot reach backend at ${API}\n→ Run: uvicorn main:app --reload --port 8000`);
      } finally { clearTimeout(timeout); }
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = ""; let gotQ = false;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const ev = JSON.parse(line.slice(6).trim()); if (ev.questions) { setQuestions(ev.questions); setAnswers(new Array(ev.questions.length).fill("")); gotQ = true; } } catch {}
        }
      }
      if (!gotQ) { setQuestions(["What is your customer acquisition cost?", "What is your average order value?", "Which marketing channel drives the most revenue?"]); setAnswers(["", "", ""]); }
      setStep("questions");
    } catch (e: any) { setError(e.message || "Connection failed."); } finally { setLoadingQ(false); }
  }, [bizInput]);

  // ── Run simulation ────────────────────────────────────────────────────────
  const runSimulation = useCallback(async (isWhatIf = false) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    streamRef.current = {};
    setMessages([]); setStrategy(""); setStratStream(false);
    setTypingAgent(null); setRunning(true); setError("");
    setProjections(null); setStep("simulation");

    const payload = {
      ...bizInput,
      followup_questions: questions, followup_answers: answers,
      what_if_marketing: isWhatIf ? whatIfMarketing : null,
      what_if_employees: isWhatIf ? whatIfEmployees : null,
      custom_scenario: customScenario,
    };

    try {
      let res: Response;
      try {
        res = await fetch(`${API}/simulate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: abortRef.current.signal,
        });
      } catch (e: any) {
        if (e.name === "AbortError") return;
        throw new Error(`Cannot reach backend at ${API}\n→ Check uvicorn is running`);
      }
      if (!res.ok) throw new Error(`Backend error ${res.status}`);

      const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: any; try { ev = JSON.parse(line.slice(6).trim()); } catch { continue; }
          switch (ev.type) {
            case "projections":
              setProjections(ev.data); break;

            case "planner":
              setMessages((prev) => [...prev, {
                id: "planner", name: "Planner", emoji: "📋",
                color: "#64748b", content: ev.content, streaming: false, isPlanner: true,
              }]); break;

            case "agent_start": setTypingAgent(ev.agent); break;

            case "token": {
              streamRef.current[ev.agent] = (streamRef.current[ev.agent] || "") + ev.token;
              const content = streamRef.current[ev.agent];
              setMessages((prev) => {
                const idx = prev.findLastIndex((m) => m.id === ev.agent);
                if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], content, streaming: true }; return next; }
                const cfg = AGENT_CONFIG[ev.agent as keyof typeof AGENT_CONFIG];
                return [...prev, { id: ev.agent, name: cfg?.name ?? ev.agent, emoji: cfg?.emoji ?? "🤖", color: cfg?.color ?? "#8b5cf6", content, streaming: true }];
              });
              setTypingAgent(ev.agent); break;
            }

            case "agent_done":
              setMessages((prev) => prev.map((m) => m.id === ev.agent ? { ...m, streaming: false } : m));
              setTypingAgent(null); streamRef.current[ev.agent] = ""; break;

            case "strategy_start": setStratStream(true); setTypingAgent("orion"); break;
            case "strategy_token": setStrategy((prev) => prev + ev.token); break;
            case "done": setRunning(false); setStratStream(false); setTypingAgent(null); setStep("result"); break;
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message || "Simulation failed."); setRunning(false);
    }
  }, [bizInput, questions, answers, whatIfMarketing, whatIfEmployees, customScenario]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStep("input"); setMessages([]); setStrategy(""); setQuestions([]);
    setAnswers([]); setError(""); setRunning(false); setWhatIfActive(false);
    setProjections(null); setCustomScenario("");
  }, []);

  const stepNum = { input: 1, questions: 2, simulation: 3, result: 4 }[step];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen" style={{ zIndex: 2 }}>
      <div className="galaxy-bg" /><StarField />
      <div className="relative z-10">

        {/* Header */}
        <header className="sticky top-0 z-50 border-b"
          style={{ borderColor: "rgba(139,92,246,0.15)", background: "rgba(3,0,13,0.85)", backdropFilter: "blur(16px)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <OrionLogo size={36} />
              <div>
                <h1 className="text-lg font-display tracking-widest" style={{ color: "#f5f0ff", letterSpacing: "0.2em" }}>ORION AI</h1>
                <p className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.45)", letterSpacing: "0.1em" }}>BUSINESS STRATEGY COMMAND CENTER</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {[{ n: 1, label: "Input" }, { n: 2, label: "Questions" }, { n: 3, label: "Debate" }, { n: 4, label: "Strategy" }].map(({ n, label }, i) => (
                <div key={n} className="flex items-center gap-2">
                  {i > 0 && <div className="w-6 h-px" style={{ background: "rgba(139,92,246,0.25)" }} />}
                  <div className="flex items-center gap-1.5">
                    <StepBadge step={n} current={stepNum} isDone={step === "result" && !strategyStreaming && !!strategy} />
                    <span className="text-xs font-mono hidden md:block" style={{ color: stepNum >= n ? "rgba(196,181,253,0.7)" : "rgba(196,181,253,0.25)" }}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
            {step !== "input" && (
              <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
                style={{ border: "1px solid rgba(139,92,246,0.25)", color: "rgba(196,181,253,0.6)" }}>
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

          {/* ── STEP 1: Input ── */}
          {step === "input" && (
            <div className="section-enter max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <div className="flex justify-center mb-5"><OrionLogo size={72} /></div>
                <h2 className="text-4xl font-display mb-3" style={{ color: "#f5f0ff", letterSpacing: "0.1em" }}>MISSION BRIEF</h2>
                <p className="text-sm" style={{ color: "rgba(196,181,253,0.6)" }}>Enter your business data. Orion&apos;s agents will analyze, debate, and strategize.</p>
              </div>

              <div className="orion-card orion-card-glow p-6 flex flex-col gap-5">
                {/* Core fields */}
                {[
                  { label: "Monthly Revenue (₹)", field: "revenue" as const, step: 100000 },
                  { label: "Marketing Budget (₹)", field: "marketing_budget" as const, step: 10000 },
                ].map(({ label, field, step: s }) => (
                  <div key={field}>
                    <label className="orion-label">{label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono" style={{ color: "rgba(196,181,253,0.45)" }}>₹</span>
                      <input type="number" className="orion-input pl-7" value={bizInput[field]} min={0} step={s}
                        onChange={(e) => setField(field)(+e.target.value)} />
                    </div>
                    <p className="text-xs mt-1 font-mono" style={{ color: "rgba(196,181,253,0.35)" }}>{formatCurrency(bizInput[field] as number)}</p>
                  </div>
                ))}

                <div>
                  <label className="orion-label">Number of Employees</label>
                  <input type="number" className="orion-input" value={bizInput.employees} min={1} step={1}
                    onChange={(e) => setField("employees")(+e.target.value)} />
                </div>

                <div>
                  <label className="orion-label">Main Business Problem</label>
                  <textarea className="orion-input resize-none" rows={3}
                    placeholder="e.g. We have good traffic but very few visitors convert to paying customers..."
                    value={bizInput.main_problem} onChange={(e) => setField("main_problem")(e.target.value)} />
                </div>

                {/* Advanced financial inputs toggle */}
                <button className="flex items-center gap-2 text-xs font-mono transition-all"
                  style={{ color: showAdvanced ? "#c084fc" : "rgba(196,181,253,0.45)" }}
                  onClick={() => setShowAdvanced((v) => !v)}>
                  <Info size={13} />
                  {showAdvanced ? "Hide" : "Add"} financial details for more accurate projections
                  <ChevronRight size={12} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
                </button>

                {showAdvanced && (
                  <div className="flex flex-col gap-4 pt-1 pl-4 border-l" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
                    <p className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.4)" }}>
                      These values improve projection accuracy. Leave as 0 if unknown — we&apos;ll estimate.
                    </p>
                    {[
                      { label: "Avg Monthly Salary per Employee (₹)", field: "avg_salary" as const, placeholder: "30000" },
                      { label: "Customer Acquisition Cost / CAC (₹)", field: "cac" as const, placeholder: "500" },
                      { label: "Average Order Value (₹)", field: "avg_order_value" as const, placeholder: "0 = estimate" },
                      { label: "Gross Margin % (e.g. 40)", field: "gross_margin_pct" as const, placeholder: "0 = estimate" },
                    ].map(({ label, field, placeholder }) => (
                      <div key={field}>
                        <label className="orion-label">{label}</label>
                        <input type="number" className="orion-input" value={bizInput[field]} min={0}
                          placeholder={placeholder} onChange={(e) => setField(field)(+e.target.value)} />
                      </div>
                    ))}
                  </div>
                )}

                {error && <ErrorBanner msg={error} />}

                <button className="btn-orion w-full flex items-center justify-center gap-2 py-3.5 text-sm"
                  onClick={fetchSmartQuestions} disabled={loadingQuestions}>
                  {loadingQuestions
                    ? <><Loader2 size={16} className="animate-spin" />Analyzing your business…</>
                    : <><Sparkles size={16} />Analyze &amp; Get Smart Questions<ChevronRight size={16} /></>}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(AGENT_CONFIG).map(([id, cfg]) => (
                  <div key={id} className="orion-card p-3 text-center flex flex-col items-center gap-2" style={{ borderColor: `${cfg.color}20` }}>
                    <div className="text-2xl">{cfg.emoji}</div>
                    <div className="text-xs font-mono font-bold" style={{ color: cfg.color }}>{cfg.name}</div>
                    <div className="text-xs opacity-40">{cfg.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Questions ── */}
          {step === "questions" && (
            <div className="section-enter max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(168,85,247,0.35)" }}>
                  <Brain size={20} style={{ color: "#c084fc" }} />
                </div>
                <h2 className="text-2xl font-display mb-2" style={{ color: "#f5f0ff", letterSpacing: "0.1em" }}>ORION NEEDS MORE DATA</h2>
                <p className="text-sm" style={{ color: "rgba(196,181,253,0.55)" }}>Answer these to sharpen the strategy — or skip and run anyway</p>
              </div>
              <div className="orion-card orion-card-glow p-6 flex flex-col gap-6">
                {questions.map((q, i) => (
                  <div key={i}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0 mt-0.5"
                        style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc" }}>{i + 1}</div>
                      <label className="text-sm" style={{ color: "rgba(245,240,255,0.85)" }}>{q}</label>
                    </div>
                    <textarea className="orion-input resize-none ml-8" rows={2} placeholder="Your answer (optional)…"
                      value={answers[i] || ""} onChange={(e) => { const next = [...answers]; next[i] = e.target.value; setAnswers(next); }} />
                  </div>
                ))}
                <div className="flex gap-3 pt-2">
                  <button className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                    style={{ border: "1px solid rgba(139,92,246,0.25)", color: "rgba(196,181,253,0.6)" }}
                    onClick={() => runSimulation()}>Skip &amp; Run</button>
                  <button className="btn-orion flex-1 flex items-center justify-center gap-2 py-3 text-sm"
                    onClick={() => runSimulation()}><Play size={15} /> Launch Simulation</button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3 & 4: Debate + Result ── */}
          {(step === "simulation" || step === "result") && (
            <div className="section-enter grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

              {/* Left: chat + charts + strategy */}
              <div className="flex flex-col gap-4">

                {/* Agent status bar */}
                <div className="orion-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${running ? "animate-pulse" : ""}`}
                        style={{ background: running ? "#a855f7" : step === "result" ? "#22c55e" : "#64748b" }} />
                      <span className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.6)" }}>
                        {running ? "WAR ROOM ACTIVE" : "DEBATE COMPLETE"}
                      </span>
                    </div>
                    {running && <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#c084fc" }}>
                      <Loader2 size={12} className="animate-spin" /> Agents deliberating…
                    </div>}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(AGENT_CONFIG).map(([id, cfg]) => {
                      const done = messages.some((m) => m.id === id && !m.streaming);
                      const active = typingAgent === id || messages.some((m) => m.id === id && m.streaming);
                      return (
                        <div key={id} className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-300"
                          style={{ background: active ? `${cfg.color}15` : "transparent", border: `1px solid ${active ? cfg.color + "40" : "rgba(139,92,246,0.1)"}` }}>
                          <span className="text-base">{cfg.emoji}</span>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: done ? "#22c55e" : active ? cfg.color : "rgba(139,92,246,0.2)" }} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chat log */}
                <div className="orion-card orion-card-glow p-5 flex flex-col gap-4"
                  style={{ height: "420px", overflowY: "auto", overflowX: "hidden" }}>
                  {messages.length === 0 && running && (
                    <div className="flex items-center justify-center py-8 gap-3">
                      <Loader2 size={16} className="animate-spin" style={{ color: "#8b5cf6" }} />
                      <span className="text-sm font-mono" style={{ color: "rgba(196,181,253,0.5)" }}>Summoning agents…</span>
                    </div>
                  )}
                  {messages.map((msg, i) => <AgentBubble key={`${msg.id}-${i}`} msg={msg} />)}
                  {typingAgent && typingAgent !== "orion" && !messages.some((m) => m.id === typingAgent) && (
                    <TypingDots
                      name={AGENT_CONFIG[typingAgent as keyof typeof AGENT_CONFIG]?.name ?? typingAgent}
                      color={AGENT_CONFIG[typingAgent as keyof typeof AGENT_CONFIG]?.color ?? "#8b5cf6"} />
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Revenue bar chart */}
                {projections && (
                  <div className="orion-card p-5 section-enter">
                    <p className="text-xs font-mono mb-4 uppercase tracking-widest" style={{ color: "rgba(196,181,253,0.5)" }}>
                      📊 Revenue &amp; Cost — Before vs After
                    </p>
                    <RevenueBarChart projections={projections} />
                    {projections.used_estimates.aov && (
                      <p className="text-xs font-mono mt-2" style={{ color: "rgba(245,158,11,0.6)" }}>
                        ⚠️ Revenue projection uses estimated avg order value. Add it in Step 1 for accuracy.
                      </p>
                    )}
                  </div>
                )}

                {/* Final strategy */}
                {(strategyStreaming || strategy) && (
                  <div className="strategy-glow rounded-2xl p-5 section-enter">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                        style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(192,132,252,0.35)" }}>🧠</div>
                      <div>
                        <div className="text-sm font-mono font-bold" style={{ color: "#c084fc" }}>ORION — FINAL STRATEGY</div>
                        <div className="text-xs opacity-50 font-mono">Synthesized from all agent perspectives</div>
                      </div>
                      {strategyStreaming && <div className="ml-auto flex items-center gap-1.5 text-xs font-mono" style={{ color: "#8b5cf6" }}>
                        <Loader2 size={12} className="animate-spin" /> Generating…
                      </div>}
                    </div>
                    <StrategyDisplay text={strategy} streaming={strategyStreaming} />
                  </div>
                )}

                {error && <ErrorBanner msg={error} />}
              </div>

              {/* Right panel */}
              <div className="flex flex-col gap-4">

                {/* Key metrics */}
                <div className="orion-card p-4">
                  <p className="text-xs font-mono mb-3" style={{ color: "rgba(196,181,253,0.5)", letterSpacing: "0.1em" }}>CURRENT METRICS</p>
                  <div className="space-y-2">
                    {[
                      { label: "Revenue",    value: formatCurrency(bizInput.revenue) },
                      { label: "Mkt Budget", value: formatCurrency(bizInput.marketing_budget) },
                      { label: "Employees",  value: `${bizInput.employees} people` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.4)" }}>{label}</span>
                        <span className="text-xs font-mono font-bold" style={{ color: "#c084fc" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial projection stats */}
                {projections && (
                  <div className="orion-card p-4 section-enter flex flex-col gap-3">
                    <p className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.5)", letterSpacing: "0.1em" }}>FINANCIAL PROJECTIONS</p>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Proj. Revenue" value={formatCurrency(projections.projected_revenue)}
                        sub={`+${projections.revenue_uplift_pct}%`} color="#22c55e" emoji="💰" />
                      <StatCard label="Net Profit" value={formatCurrency(projections.net_profit)}
                        sub={`${projections.net_margin_pct}% margin`} color={projections.net_profit >= 0 ? "#06b6d4" : "#f87171"} emoji="📊" />
                      <StatCard label="ROMI" value={`${projections.romi.toFixed(0)}%`}
                        sub="return on mkt spend" color="#c084fc" emoji="🎯" />
                      <StatCard label="Payback" value={projections.payback_months > 0 ? `${projections.payback_months}mo` : "—"}
                        sub="to recover spend" color="#f59e0b" emoji="⏱️" />
                      <StatCard label="LTV/CAC" value={`${projections.ltv_cac_ratio}x`}
                        sub=">3x is healthy" color={projections.ltv_cac_ratio >= 3 ? "#22c55e" : "#f59e0b"} emoji="👥" />
                      <StatCard label="New Customers" value={`+${Math.round(projections.new_customers_whatif - projections.new_customers_base)}`}
                        sub="from extra spend" color="#a855f7" emoji="🚀" />
                    </div>
                  </div>
                )}

                {/* Risk / Reward bars */}
                {projections && (
                  <div className="orion-card p-4 section-enter">
                    <p className="text-xs font-mono mb-3" style={{ color: "rgba(196,181,253,0.5)", letterSpacing: "0.1em" }}>RISK / REWARD ANALYSIS</p>
                    <RiskRewardBars projections={projections} />
                  </div>
                )}

                {/* What-If simulator */}
                <div className="orion-card active-card p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={14} style={{ color: "#a855f7" }} />
                      <span className="text-xs font-mono font-bold" style={{ color: "#c084fc", letterSpacing: "0.1em" }}>WHAT-IF SIMULATOR</span>
                    </div>
                    <div className="w-8 h-4 rounded-full cursor-pointer relative transition-all"
                      style={{ background: whatIfActive ? "rgba(168,85,247,0.6)" : "rgba(139,92,246,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}
                      onClick={() => setWhatIfActive((v) => !v)}>
                      <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                        style={{ background: whatIfActive ? "#c084fc" : "rgba(196,181,253,0.3)", left: whatIfActive ? "calc(100% - 14px)" : "2px" }} />
                    </div>
                  </div>

                  <div className={`flex flex-col gap-4 transition-opacity ${whatIfActive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                    {/* Marketing slider */}
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="orion-label" style={{ margin: 0 }}>Marketing Budget</label>
                        <span className="text-xs font-mono font-bold" style={{ color: "#a855f7" }}>{formatCurrency(whatIfMarketing)}</span>
                      </div>
                      <input type="range" className="orion-range" min={10000}
                        max={Math.max(bizInput.marketing_budget * 4, 500000)} step={10000}
                        value={whatIfMarketing} onChange={(e) => setWhatIfMkt(+e.target.value)} />
                      {whatIfMarketing !== bizInput.marketing_budget && (
                        <p className="text-xs font-mono mt-1" style={{ color: whatIfMarketing > bizInput.marketing_budget ? "#22c55e" : "#f87171" }}>
                          {whatIfMarketing > bizInput.marketing_budget ? "▲" : "▼"} {Math.abs(((whatIfMarketing - bizInput.marketing_budget) / bizInput.marketing_budget) * 100).toFixed(0)}% vs current
                        </p>
                      )}
                    </div>
                    {/* Employees slider */}
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="orion-label" style={{ margin: 0 }}>Employees</label>
                        <span className="text-xs font-mono font-bold" style={{ color: "#c084fc" }}>{whatIfEmployees}</span>
                      </div>
                      <input type="range" className="orion-range" min={1}
                        max={Math.max(bizInput.employees * 5, 50)} step={1}
                        value={whatIfEmployees} onChange={(e) => setWhatIfEmp(+e.target.value)} />
                    </div>
                    <button className="btn-orion w-full flex items-center justify-center gap-2 py-2.5 text-sm"
                      onClick={() => runSimulation(true)} disabled={running}>
                      {running ? <><Loader2 size={14} className="animate-spin" />Simulating…</> : <><Zap size={14} />Run What-If</>}
                    </button>
                  </div>
                </div>

                {/* Custom scenario */}
                <div className="orion-card p-4 flex flex-col gap-3"
                  style={{ border: showCustom ? "1px solid rgba(192,132,252,0.35)" : undefined }}>
                  <button className="flex items-center justify-between w-full"
                    onClick={() => setShowCustom((v) => !v)}>
                    <div className="flex items-center gap-2">
                      <MessageSquarePlus size={14} style={{ color: "#c084fc" }} />
                      <span className="text-xs font-mono font-bold" style={{ color: "#c084fc", letterSpacing: "0.1em" }}>CUSTOM SCENARIO</span>
                    </div>
                    <ChevronRight size={12} className={`transition-transform`} style={{ color: "rgba(196,181,253,0.4)", transform: showCustom ? "rotate(90deg)" : "none" }} />
                  </button>

                  {showCustom && (
                    <div className="flex flex-col gap-3 section-enter">
                      <p className="text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>
                        Describe any scenario you want the agents to analyze — a new product launch, entering a new market, hiring a sales team, etc.
                      </p>
                      <textarea className="orion-input resize-none" rows={3}
                        placeholder="e.g. What if we launch a premium tier at 3x the price and target enterprise customers instead of SMBs?"
                        value={customScenario} onChange={(e) => setCustomScenario(e.target.value)} />
                      <button className="btn-orion w-full flex items-center justify-center gap-2 py-2.5 text-sm"
                        onClick={() => runSimulation(false)} disabled={running || !customScenario.trim()}>
                        {running ? <><Loader2 size={14} className="animate-spin" />Simulating…</> : <><Play size={14} />Analyze This Scenario</>}
                      </button>
                    </div>
                  )}
                </div>

                {step === "result" && (
                  <button className="btn-orion w-full flex items-center justify-center gap-2 py-3 text-sm section-enter"
                    onClick={() => runSimulation(false)} disabled={running}>
                    <RotateCcw size={14} /> Re-run Simulation
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        <footer className="border-t mt-12 py-5 text-center" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
          <p className="text-xs font-mono" style={{ color: "rgba(196,181,253,0.25)" }}>
            ORION AI · Powered by Groq + LangChain · DSOC 2026
          </p>
        </footer>
      </div>
    </div>
  );
}