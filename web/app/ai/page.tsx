"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  Brain, Send, RefreshCw, TrendingUp, FileText, AlertTriangle,
  BarChart2, Sparkles, ChevronRight, User, Clipboard,
  CheckCircle2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Role = "user" | "ai";
interface Message { id: string; role: Role; content: string; time: Date; cards?: ResultCard[]; }
interface ResultCard { type: "metric" | "insight" | "action"; label: string; value?: string; description?: string; href?: string; color?: string; }

// ── Suggested prompts ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: TrendingUp,   label: "Revenue breakdown",        prompt: "Show me revenue breakdown for Page Capital this quarter by product" },
  { icon: RefreshCw,    label: "Reconciliation issues",    prompt: "What are the top unmatched items in this month's bank reconciliation?" },
  { icon: AlertTriangle,label: "Risk summary",             prompt: "Summarise the current risk exposure for Page Capital" },
  { icon: FileText,     label: "Board report",             prompt: "Draft an executive summary for the Q4 board report" },
  { icon: BarChart2,    label: "Cash flow forecast",       prompt: "Show me the 90-day cash flow forecast based on current data" },
  { icon: Clipboard,    label: "Compliance status",        prompt: "What compliance deadlines are approaching in the next 30 days?" },
];

// ── Mock AI responses ──────────────────────────────────────────────────────────

function getMockResponse(prompt: string): { content: string; cards?: ResultCard[] } {
  const lc = prompt.toLowerCase();

  if (lc.includes("revenue") || lc.includes("breakdown")) {
    return {
      content: "Here's the revenue breakdown for Page Capital in Q4 2026. Total net revenue is **₦3.2B**, up 8.2% from Q3. The primary drivers are fixed income instruments and equity mandates.",
      cards: [
        { type: "metric", label: "Fixed Income",    value: "₦1.84B", description: "57.5% of revenue · ↑9.2%",  color: "#2563eb" },
        { type: "metric", label: "Equity Mandates", value: "₦924M",  description: "28.9% of revenue · ↑6.1%",  color: "#7c3aed" },
        { type: "metric", label: "Money Market",    value: "₦436M",  description: "13.6% of revenue · ↑12.4%", color: "#0891b2" },
        { type: "insight", label: "AI Insight", description: "Fixed income growth is outpacing equity — consider rebalancing mandate targets to capture more equity market upside in Q1 2027." },
      ],
    };
  }

  if (lc.includes("reconciliation") || lc.includes("unmatched")) {
    return {
      content: "I've analysed the November bank reconciliation for GT Bank (0044456789). Here are the key unmatched items that need your attention:",
      cards: [
        { type: "metric", label: "Unmatched Bank",    value: "12 items", description: "Total: ₦876K unreconciled",  color: "#f59e0b" },
        { type: "metric", label: "Unmatched Ledger",  value: "11 items", description: "Total: ₦364K unreconciled",  color: "#dc2626" },
        { type: "insight", label: "Top unmatched", description: "TRF FROM 0234567891 (₦470K, Nov 7) likely matches the suspense entry SUS/2026/047 with 72% confidence. Review recommended." },
        { type: "action", label: "Open Reconciliation", href: "/finance/reconciliation", description: "Review and approve 23 pending items" },
      ],
    };
  }

  if (lc.includes("cash flow") || lc.includes("forecast")) {
    return {
      content: "Based on current burn rate, revenue run rate, and committed obligations, here's the 90-day cash flow forecast for Page Capital:",
      cards: [
        { type: "metric", label: "Current Position", value: "₦12.3B",  description: "As of today",              color: "#10b981" },
        { type: "metric", label: "Projected (30d)",  value: "₦11.8B",  description: "After obligations",        color: "#f59e0b" },
        { type: "metric", label: "Projected (90d)",  value: "₦9.2B",   description: "Conservative estimate",    color: "#dc2626" },
        { type: "insight", label: "Risk Alert", description: "Cash falls below the ₦10B operational threshold in approximately 58 days. Recommend reviewing committed capital calls for Q1." },
      ],
    };
  }

  if (lc.includes("board") || lc.includes("executive summary")) {
    return {
      content: "Here's a draft executive summary for the Q4 2026 board report:\n\n**Performance Overview**\nPage Capital delivered strong Q4 results with net revenue of ₦3.2B (+8.2% QoQ), driven by fixed income growth and new mandate wins. AUM reached ₦89.4B, a 12.4% year-on-year improvement.\n\n**Operational Highlights**\n- 18 new client accounts opened during the quarter\n- Bank reconciliation automation reduced manual effort by 73%\n- Compliance rate maintained at 100% with no regulatory incidents\n\n**Key Risks**\n- Cash flow pressure emerging in Q1 2027 if pipeline deals are delayed\n- 2 FRCN filings due within 14 days",
      cards: [
        { type: "action", label: "Export as PDF",  description: "Full board-ready document", color: "#2563eb" },
        { type: "action", label: "Share with CFO", description: "Send for review before board", color: "#7c3aed" },
      ],
    };
  }

  return {
    content: "I've reviewed your question against the PageOS knowledge base and live data. Here's what I found:\n\nPageOS currently monitors **4 active modules** with live data: Finance (reconciliation, ledger), Onboarding (1,247 active clients), Compliance (2 upcoming deadlines), and Approvals (23 pending).\n\nCould you be more specific? I can analyse financial data, draft reports, summarise compliance requirements, flag risks, or walk you through any operational workflow.",
    cards: [
      { type: "insight", label: "Tip", description: "Try asking: 'What are the pending approvals for today?' or 'Show me the reconciliation difference for November.'" },
    ],
  };
}

// ── Message component ──────────────────────────────────────────────────────────

function MessageBubble({ msg, initials }: { msg: Message; initials: string }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3 max-w-4xl", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
      {/* Avatar */}
      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5",
                         isUser ? "text-white" : "text-white")}
           style={{ background: isUser ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
        {isUser ? initials : <Brain className="w-3.5 h-3.5" />}
      </div>

      <div className={cn("flex-1 min-w-0", isUser ? "items-end" : "items-start") + " flex flex-col gap-2"}>
        {/* Text bubble */}
        <div className={cn("rounded-2xl px-4 py-3 max-w-[520px]",
                           isUser
                             ? "text-white rounded-tr-sm"
                             : "text-slate-800 rounded-tl-sm")}
             style={isUser
               ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }
               : { background: "#ffffff", border: "1px solid #e8edf3", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
             dangerouslySetInnerHTML={{
               __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
             }} />
        </div>

        {/* Result cards */}
        {msg.cards && msg.cards.length > 0 && (
          <div className="flex flex-wrap gap-2 max-w-2xl">
            {msg.cards.map((card, i) => (
              <div key={i}
                   className={cn("rounded-xl px-4 py-3 flex-1 min-w-[180px]",
                                 card.type === "action" ? "cursor-pointer hover:opacity-90 transition-opacity" : "")}
                   style={{
                     background: card.type === "insight" ? "#f8fafc" : card.type === "action" ? (card.color || "#2563eb") : "#ffffff",
                     border: card.type === "insight" ? "1px solid #e8edf3" : card.type === "action" ? "none" : `2px solid ${card.color || "#2563eb"}18`,
                     boxShadow: card.type === "metric" ? `0 0 0 1px ${card.color || "#2563eb"}20, 0 1px 4px rgba(15,23,42,0.05)` : "none",
                   }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                   style={{ color: card.type === "action" ? "rgba(255,255,255,0.7)" : "#94a3b8" }}>
                  {card.label}
                </p>
                {card.value && (
                  <p className="text-[20px] font-bold leading-none tabular mb-0.5"
                     style={{ color: card.type === "metric" ? (card.color || "#0f172a") : card.type === "action" ? "white" : "#0f172a" }}>
                    {card.value}
                  </p>
                )}
                {card.description && (
                  <p className="text-[12px] leading-relaxed"
                     style={{ color: card.type === "action" ? "rgba(255,255,255,0.85)" : "#64748b" }}>
                    {card.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {msg.time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AIPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const initials = user?.DisplayName?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() ?? "?";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function sendPrompt(prompt: string) {
    if (!prompt.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: prompt.trim(), time: new Date() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);

    setTimeout(() => {
      const { content, cards } = getMockResponse(prompt);
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "ai", content, time: new Date(), cards };
      setMessages(m => [...m, aiMsg]);
      setLoading(false);
    }, 1000 + Math.random() * 800);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(input); }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col max-w-4xl mx-auto" style={{ height: "calc(100vh - 48px - 64px)" }}>

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {empty && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
               style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", boxShadow: "0 8px 32px rgba(37,99,235,0.35)" }}>
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-[22px] font-bold text-slate-900 leading-tight">PageOS AI Copilot</h1>
          <p className="text-[14px] text-slate-500 mt-2 max-w-sm leading-relaxed">
            Ask anything about your business — financials, compliance, clients, operations, or get AI-generated reports.
          </p>

          {/* Suggestions */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl">
            {SUGGESTIONS.map(s => (
              <button key={s.label} onClick={() => sendPrompt(s.prompt)}
                      className="flex items-start gap-3 text-left p-4 rounded-xl bg-white hover:bg-slate-50 transition-colors group"
                      style={{ border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                     style={{ background: "#eff6ff" }}>
                  <s.icon className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-slate-700">{s.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{s.prompt.slice(0, 48)}…</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────── */}
      {!empty && (
        <div className="flex-1 overflow-y-auto py-6 px-2 space-y-6">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} initials={initials} />)}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                   style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2"
                   style={{ background: "#ffffff", border: "1px solid #e8edf3" }}>
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#94a3b8", animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
                <span className="text-[12px] text-slate-400">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────── */}
      <div className="shrink-0 pt-4 pb-2">
        <div className="rounded-2xl bg-white overflow-hidden"
             style={{ border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(15,23,42,0.08)" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything — financials, compliance, forecasts, reports…"
            rows={2}
            className="w-full px-5 pt-4 pb-2 text-[14px] text-slate-800 placeholder:text-slate-400 outline-none resize-none bg-transparent leading-relaxed"
          />
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <div className="flex gap-2">
              {SUGGESTIONS.slice(0, 3).map(s => (
                <button key={s.label} onClick={() => sendPrompt(s.prompt)}
                        className="h-6 px-2.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        style={{ border: "1px solid #e2e8f0" }}>
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => sendPrompt(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-30"
              style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}>
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          PageOS AI · Answers are generated from live business data · Always verify before acting
        </p>
      </div>
    </div>
  );
}
