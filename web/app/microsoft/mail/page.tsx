"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2, Send, Plus, ChevronLeft, ChevronRight, Link2Off } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { msApi, relativeTime, stripHtml, MailMessage } from "../components";
import { PeoplePicker } from "../PeoplePicker";

function MailPageInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const disconnectMutation = useMutation({
    mutationFn: () => msApi("/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disconnected from Microsoft 365" });
      queryClient.invalidateQueries({ queryKey: ["msgraph-status"] });
      window.location.href = "/microsoft";
    },
    onError: () => toast({ title: "Disconnect failed", variant: "destructive" }),
  });
  const [folder, setFolder] = useState<"inbox" | "sent" | "drafts" | "junk">("inbox");
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [replyMode, setReplyMode] = useState<"reply" | "replyAll" | "forward" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({ to: "", cc: "", bcc: "", showCcBcc: false, subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["msgraph-mail-full", folder],
    queryFn: () => msApi(`/mail?folder=${folder}`) as Promise<{ messages: MailMessage[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["msgraph-thread", selected?.conversationId],
    queryFn: () => msApi(`/mail/thread/${selected!.conversationId}`) as Promise<{ messages: MailMessage[] }>,
    enabled: !!selected?.conversationId,
    staleTime: 120_000,
  });

  const { data: bodyData } = useQuery({
    queryKey: ["msgraph-mail-body", selected?.id],
    queryFn: () => msApi(`/mail/${selected!.id}`) as Promise<{ body: string }>,
    enabled: !!selected,
    staleTime: 300_000,
  });

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const endpoint = replyMode === "replyAll" ? "reply-all" : "reply";
      await msApi(`/mail/${selected.id}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyText }),
      });
      toast({ title: "Reply sent" });
      setReplyText(""); setReplyMode(null);
      queryClient.invalidateQueries({ queryKey: ["msgraph-thread", selected.conversationId] });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function sendForward() {
    if (!selected || !forwardTo.trim()) return;
    const toList = forwardTo.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (toList.length === 0) return;
    setSending(true);
    try {
      await msApi(`/mail/${selected.id}/forward`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toList, comment: replyText }),
      });
      toast({ title: "Email forwarded" });
      setForwardTo(""); setReplyText(""); setReplyMode(null);
    } catch (e) {
      toast({ title: "Failed to forward", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  function parseEmails(raw: string): string[] {
    return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }

  async function sendCompose() {
    const toList = parseEmails(compose.to);
    if (toList.length === 0 || !compose.subject) return;
    setSending(true);
    try {
      await msApi("/mail/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toList,
          cc: parseEmails(compose.cc),
          bcc: parseEmails(compose.bcc),
          subject: compose.subject,
          body: compose.body,
        }),
      });
      toast({ title: "Email sent" });
      setCompose({ to: "", cc: "", bcc: "", showCcBcc: false, subject: "", body: "" });
      setComposing(false);
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  const allMessages = data?.messages ?? [];
  const thread = threadData?.messages ?? [];
  const pagedMessages = allMessages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(allMessages.length / PAGE_SIZE);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden" style={{ background: "var(--pg-bg)" }}>
      {/* ── Left: inbox list ── */}
      <div className="w-80 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: "var(--pg-card-border)", background: "var(--pg-card)" }}>
        {/* Header */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Image src="/outlook-logo.svg" alt="Outlook" width={18} height={18} />
            <span className="text-[14px] font-bold flex-1" style={{ color: "var(--pg-text-1)" }}>Outlook</span>
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
            <button onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
                    title="Disconnect" className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: "var(--pg-text-3)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#ef4444"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}>
              {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setComposing(true); setSelected(null); }}
                    className="flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold"
                    style={{ background: "#0078d4", color: "white" }}>
              <Plus className="w-3 h-3" /> Compose
            </button>
          </div>
          {/* Folder tabs */}
          <div className="flex gap-1">
            {(["inbox", "sent", "drafts", "junk"] as const).map(f => (
              <button key={f} onClick={() => { setFolder(f); setSelected(null); setPage(0); }}
                      className="flex-1 py-1 rounded text-[11px] font-medium capitalize transition-colors"
                      style={{
                        background: folder === f ? "#0078d4" : "var(--pg-muted-bg)",
                        color: folder === f ? "white" : "var(--pg-text-2)",
                      }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {pagedMessages.map(m => (
            <div key={m.id} onClick={() => { setSelected(m); setReplyMode(null); setReplyText(""); setComposing(false); }}
                 className="px-4 py-3 cursor-pointer transition-colors"
                 style={{
                   borderBottom: "1px solid var(--pg-row-border)",
                   background: selected?.id === m.id ? "var(--pg-hover)" : "",
                   borderLeft: selected?.id === m.id ? "3px solid #0078d4" : "3px solid transparent",
                 }}
                 onMouseEnter={e => { if (selected?.id !== m.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"; }}
                 onMouseLeave={e => { if (selected?.id !== m.id) (e.currentTarget as HTMLElement).style.background = ""; }}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] truncate max-w-[140px] ${!m.isRead ? "font-bold" : "font-medium"}`}
                      style={{ color: "var(--pg-text-1)" }}>{m.senderName || m.senderEmail}</span>
                <span className="text-[10px] shrink-0" style={{ color: "var(--pg-text-3)" }}>{relativeTime(m.receivedDateTime)}</span>
              </div>
              <p className={`text-[11px] truncate mt-0.5 ${!m.isRead ? "font-semibold" : ""}`}
                 style={{ color: "var(--pg-text-2)" }}>{m.subject}</p>
              <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-3)" }}>{m.bodyPreview?.slice(0, 60)}</p>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderTop: "1px solid var(--pg-row-border)" }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="w-6 h-6 flex items-center justify-center rounded" style={{ color: page === 0 ? "var(--pg-text-4)" : "var(--pg-text-2)" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: page === totalPages - 1 ? "var(--pg-text-4)" : "var(--pg-text-2)" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Right: compose / thread view ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {composing ? (
          <div className="flex flex-col h-full p-6 gap-3 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold flex-1" style={{ color: "var(--pg-text-1)" }}>New Email</h2>
              <button onClick={() => setComposing(false)} className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>Cancel</button>
            </div>
            {/* To with autocomplete */}
            <PeoplePicker value={compose.to} onChange={v => setCompose(p => ({ ...p, to: v }))} placeholder="To — search or type email" />
            {/* CC / BCC toggle */}
            <div className="flex justify-end -mt-1">
              <button onClick={() => setCompose(p => ({ ...p, showCcBcc: !p.showCcBcc }))}
                      className="text-[11px] font-medium" style={{ color: "#0078d4" }}>
                {compose.showCcBcc ? "Hide CC / BCC" : "Add CC / BCC"}
              </button>
            </div>
            {compose.showCcBcc && (
              <>
                <PeoplePicker value={compose.cc} onChange={v => setCompose(p => ({ ...p, cc: v }))} placeholder="CC" />
                <PeoplePicker value={compose.bcc} onChange={v => setCompose(p => ({ ...p, bcc: v }))} placeholder="BCC" />
              </>
            )}
            <input value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))}
                   placeholder="Subject"
                   className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                      placeholder="Write your message…" className="flex-1 w-full px-4 py-2.5 text-[13px] rounded-xl outline-none resize-none"
                      style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <button onClick={sendCompose} disabled={sending || !compose.to.trim() || !compose.subject}
                    className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white self-start"
                    style={{ background: "#0078d4", opacity: (sending || !compose.to.trim() || !compose.subject) ? 0.6 : 1 }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
            </button>
          </div>
        ) : selected ? (
          <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-6 py-4 gap-4">
            <h2 className="text-[18px] font-bold shrink-0" style={{ color: "var(--pg-text-1)" }}>{selected.subject}</h2>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto space-y-4">
              {threadLoading
                ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
                : (thread.length > 0 ? thread : [selected]).map((msg, i) => (
                  <div key={msg.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
                    <div className="flex items-center justify-between px-5 py-3"
                         style={{ borderBottom: "1px solid var(--pg-row-border)", background: i === (thread.length || 1) - 1 ? "rgba(0,120,212,0.04)" : "" }}>
                      <div>
                        <p className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>{msg.senderName}</p>
                        <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{msg.senderEmail}</p>
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{relativeTime(msg.receivedDateTime)}</span>
                    </div>
                    <div className="px-5 py-4 text-[13px] leading-relaxed" style={{ color: "var(--pg-text-2)" }}>
                      {i === (thread.length || 1) - 1 && bodyData?.body
                        ? <div dangerouslySetInnerHTML={{ __html: bodyData.body }} />
                        : <p>{msg.bodyPreview}</p>}
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Reply area */}
            <div className="shrink-0 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
              {!replyMode
                ? <div className="flex gap-2 p-3 flex-wrap">
                    <button onClick={() => setReplyMode("reply")} className="h-8 px-4 rounded-lg text-[12px] font-medium text-white" style={{ background: "#0078d4" }}>Reply</button>
                    <button onClick={() => setReplyMode("replyAll")} className="h-8 px-4 rounded-lg text-[12px] font-medium" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Reply All</button>
                    <button onClick={() => { setReplyMode("forward"); setForwardTo(""); setReplyText(""); }}
                            className="h-8 px-4 rounded-lg text-[12px] font-medium" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>Forward</button>
                  </div>
                : replyMode === "forward"
                  ? <div className="p-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--pg-text-3)" }}>Forward to</p>
                      <PeoplePicker value={forwardTo} onChange={setForwardTo} placeholder="Search or type email addresses" />
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                placeholder="Add a message (optional)…"
                                rows={3} className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none resize-none"
                                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                      <div className="flex gap-2">
                        <button onClick={sendForward} disabled={sending || !forwardTo.trim()}
                                className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold text-white"
                                style={{ background: "#0078d4", opacity: (sending || !forwardTo.trim()) ? 0.6 : 1 }}>
                          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Forward
                        </button>
                        <button onClick={() => { setReplyMode(null); setForwardTo(""); setReplyText(""); }}
                                className="h-8 px-3 rounded-lg text-[12px]" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  : <div className="p-3 space-y-2">
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                placeholder={replyMode === "replyAll" ? "Reply to all…" : "Write your reply…"}
                                rows={4} className="w-full px-4 py-2.5 text-[13px] rounded-xl outline-none resize-none"
                                style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
                      <div className="flex gap-2">
                        <button onClick={sendReply} disabled={sending || !replyText.trim()}
                                className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold text-white"
                                style={{ background: "#0078d4", opacity: (sending || !replyText.trim()) ? 0.6 : 1 }}>
                          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
                        </button>
                        <button onClick={() => { setReplyMode(null); setReplyText(""); }}
                                className="h-8 px-3 rounded-lg text-[12px]" style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
              }
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Image src="/outlook-logo.svg" alt="Outlook" width={48} height={48} style={{ opacity: 0.3 }} />
            <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>Select an email to read</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MailPage() {
  return <Suspense><MailPageInner /></Suspense>;
}
