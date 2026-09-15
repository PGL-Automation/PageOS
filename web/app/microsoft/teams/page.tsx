"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Plus, Search, ArrowUp, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  msApi, relativeTime, stripHtml,
  ChatSummary, ChatPage, TeamsMessage, OrgUser, REACTION_EMOJIS,
} from "../components";

function TeamsPageInner() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [olderNextLink, setOlderNextLink] = useState<string | null>(null);
  const [olderMessages, setOlderMessages] = useState<TeamsMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [chatLimit, setChatLimit] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [startingChat, setStartingChat] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: chatsData, isLoading } = useQuery({
    queryKey: ["msgraph-teams-full", chatLimit],
    queryFn: () => msApi(`/teams/chats?top=${chatLimit}`) as Promise<{ chats: ChatSummary[] }>,
    staleTime: 60_000, refetchInterval: 120_000,
  });

  const { data: pageData, isLoading: pageLoading } = useQuery({
    queryKey: ["msgraph-chat-page-full", selectedChat?.id],
    queryFn: async () => {
      const p = await msApi(`/teams/${selectedChat!.id}/page?top=50`) as ChatPage;
      setOlderNextLink(p.nextLink || null);
      setOlderMessages([]);
      return p;
    },
    enabled: !!selectedChat,
    staleTime: 30_000,
  });

  const { data: searchData } = useQuery({
    queryKey: ["msgraph-search-full", debouncedQuery],
    queryFn: () => msApi(`/users/search?q=${encodeURIComponent(debouncedQuery)}`) as Promise<{ users: OrgUser[] }>,
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (pageData) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [pageData]);

  async function loadOlder() {
    if (!selectedChat || !olderNextLink) return;
    setLoadingOlder(true);
    try {
      const p = await msApi(`/teams/${selectedChat.id}/page?nextLink=${encodeURIComponent(olderNextLink)}`) as ChatPage;
      setOlderMessages(prev => [...p.messages, ...prev]);
      setOlderNextLink(p.nextLink || null);
    } catch { toast({ title: "Could not load older messages", variant: "destructive" }); }
    finally { setLoadingOlder(false); }
  }

  async function sendMessage() {
    if (!selectedChat || !message.trim()) return;
    setSending(true);
    try {
      await msApi(`/teams/${selectedChat.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page-full", selectedChat.id] });
    } catch (e) { toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" }); }
    finally { setSending(false); }
  }

  async function startChat(person: OrgUser) {
    setStartingChat(person.id);
    try {
      const { chat_id } = await msApi("/teams/new-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_ms_id: person.id }),
      }) as { chat_id: string };
      setSearchQuery(""); setDebouncedQuery("");
      setSelectedChat({ id: chat_id, chatType: "oneOnOne", topic: "",
        withName: person.displayName, withEmail: person.mail,
        lastMessage: { id: "", chatId: chat_id, body: "", sentAt: "", senderName: "", senderMsId: "" } });
      queryClient.invalidateQueries({ queryKey: ["msgraph-teams-full"] });
    } catch (e) { toast({ title: "Could not start chat", description: (e as Error).message, variant: "destructive" }); }
    finally { setStartingChat(null); }
  }

  async function toggleReact(msg: TeamsMessage, rt: string) {
    const iMine = (msg.reactions ?? []).some(r => r.reactionType === rt && r.senderName === user?.DisplayName);
    try {
      await msApi(`/teams/${msg.chatId}/messages/${msg.id}/${iMine ? "unreact" : "react"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType: rt }),
      });
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page-full", selectedChat?.id] });
    } catch {}
  }

  async function deleteMsg(msg: TeamsMessage) {
    try {
      await msApi(`/teams/${msg.chatId}/messages/${msg.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page-full", selectedChat?.id] });
    } catch { toast({ title: "Could not delete message", variant: "destructive" }); }
  }

  const chats = chatsData?.chats ?? [];
  const currentMessages = [...olderMessages, ...(pageData?.messages ?? [])];
  const searchResults = searchData?.users ?? [];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden" style={{ background: "var(--pg-bg)" }}>
      {/* ── Left: chat list ── */}
      <div className="w-72 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: "var(--pg-card-border)", background: "var(--pg-card)" }}>
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Image src="/teams-logo.svg" alt="Teams" width={20} height={20} />
            <span className="text-[14px] font-bold flex-1" style={{ color: "var(--pg-text-1)" }}>Teams Chat</span>
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pg-text-4)" }} />}
          </div>
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                   placeholder="Search people…" className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
          </div>
          {debouncedQuery.length >= 2 && (
            <div className="mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--pg-card-border)", background: "var(--pg-card)" }}>
              {searchResults.length === 0
                ? <p className="px-3 py-2 text-[11px]" style={{ color: "var(--pg-text-3)" }}>No people found</p>
                : searchResults.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 gap-2"
                       style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{p.displayName}</p>
                      <p className="text-[10px] truncate" style={{ color: "var(--pg-text-3)" }}>{p.mail}</p>
                    </div>
                    <button onClick={() => startChat(p)} disabled={startingChat === p.id}
                            className="flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-semibold shrink-0"
                            style={{ background: "#5059C9", color: "white", opacity: startingChat === p.id ? 0.6 : 1 }}>
                      {startingChat === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Chat
                    </button>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div key={chat.id} onClick={() => setSelectedChat(chat)}
                 className="px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors"
                 style={{
                   borderBottom: "1px solid var(--pg-row-border)",
                   background: selectedChat?.id === chat.id ? "var(--pg-hover)" : "",
                   borderLeft: selectedChat?.id === chat.id ? "3px solid #5059C9" : "3px solid transparent",
                 }}
                 onMouseEnter={e => { if (selectedChat?.id !== chat.id) (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"; }}
                 onMouseLeave={e => { if (selectedChat?.id !== chat.id) (e.currentTarget as HTMLElement).style.background = ""; }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold text-white"
                   style={{ background: "#5059C9" }}>
                {(chat.withName || chat.topic || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>
                    {chat.withName || chat.topic || "Unknown"}
                  </span>
                  <span className="text-[9px] shrink-0" style={{ color: "var(--pg-text-4)" }}>
                    {relativeTime(chat.lastMessage?.sentAt)}
                  </span>
                </div>
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--pg-text-2)" }}>
                  {stripHtml(chat.lastMessage?.body || "").slice(0, 50) || "No messages yet"}
                </p>
              </div>
            </div>
          ))}
          {chats.length >= chatLimit && (
            <button onClick={() => setChatLimit(l => l + 20)}
                    className="w-full py-2 text-[11px]" style={{ color: "var(--pg-text-3)" }}>
              Load more
            </button>
          )}
        </div>
      </div>

      {/* ── Right: thread ── */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Thread header */}
          <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                 style={{ background: "#5059C9" }}>
              {(selectedChat.withName || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "var(--pg-text-1)" }}>{selectedChat.withName || selectedChat.topic}</p>
              {selectedChat.withEmail && <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>{selectedChat.withEmail}</p>}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {olderNextLink && (
              <button onClick={loadOlder} disabled={loadingOlder}
                      className="mx-auto flex items-center gap-1.5 h-6 px-3 rounded-full text-[11px]"
                      style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                {loadingOlder ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUp className="w-3 h-3" />}
                Load older messages
              </button>
            )}
            {pageLoading && currentMessages.length === 0
              ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} /></div>
              : currentMessages.length === 0
                ? <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
                    <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>No messages yet. Say hello!</p>
                  </div>
                : currentMessages.map(msg => {
                    const isMe = msg.senderName === user?.DisplayName;
                    const text = stripHtml(msg.body);
                    const isDeleted = text === "" && (msg.attachments ?? []).length === 0;
                    const reactionMap: Record<string, { count: number; iMine: boolean }> = {};
                    (msg.reactions ?? []).forEach(r => {
                      if (!reactionMap[r.reactionType]) reactionMap[r.reactionType] = { count: 0, iMine: false };
                      reactionMap[r.reactionType].count++;
                      if (r.senderName === user?.DisplayName) reactionMap[r.reactionType].iMine = true;
                    });
                    return (
                      <div key={msg.id} className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}>
                        {!isMe && <span className="text-[11px] mb-0.5 ml-1 font-medium" style={{ color: "var(--pg-text-3)" }}>{msg.senderName}</span>}
                        <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                          <div className="max-w-[60%] rounded-2xl text-[13px] leading-relaxed overflow-hidden"
                               style={{
                                 background: isDeleted ? "transparent" : isMe ? "#5059C9" : "var(--pg-card)",
                                 color: isDeleted ? "var(--pg-text-4)" : isMe ? "white" : "var(--pg-text-1)",
                                 border: isDeleted ? "1px dashed var(--pg-card-border)" : isMe ? "none" : "1px solid var(--pg-card-border)",
                                 borderBottomRightRadius: isMe ? 4 : undefined,
                                 borderBottomLeftRadius: isMe ? undefined : 4,
                               }}>
                            {isDeleted
                              ? <p className="px-4 py-2.5 italic text-[12px]">This message was deleted</p>
                              : <>
                                  {text && <p className="px-4 py-2.5 whitespace-pre-wrap">{text}</p>}
                                  {(msg.attachments ?? []).filter(a => a.name && a.contentUrl).map(att => (
                                    <a key={att.id} href={att.contentUrl} target="_blank" rel="noreferrer"
                                       className="flex items-center gap-2 px-4 py-2 text-[12px] hover:opacity-80 transition-opacity"
                                       style={{ borderTop: text ? "1px solid rgba(255,255,255,0.15)" : "none",
                                                color: isMe ? "rgba(255,255,255,0.9)" : "var(--pg-accent)" }}>
                                      <span>📎</span><span className="truncate max-w-[200px]">{att.name}</span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                  ))}
                                </>
                            }
                          </div>
                          {!isDeleted && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mb-1">
                              {Object.keys(REACTION_EMOJIS).map(rt => (
                                <button key={rt} title={rt} onClick={() => toggleReact(msg, rt)}
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-transform hover:scale-125"
                                        style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                                  {REACTION_EMOJIS[rt]}
                                </button>
                              ))}
                              {isMe && (
                                <button title="Delete" onClick={() => deleteMsg(msg)}
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] hover:scale-110 transition-transform"
                                        style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "#ef4444" }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {Object.keys(reactionMap).length > 0 && (
                          <div className="flex items-center gap-1 mt-1 mx-1 flex-wrap">
                            {Object.entries(reactionMap).map(([rt, { count, iMine }]) => (
                              <button key={rt} onClick={() => toggleReact(msg, rt)}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px]"
                                      style={{
                                        background: iMine ? "rgba(80,89,201,0.15)" : "var(--pg-muted-bg)",
                                        border: `1px solid ${iMine ? "#5059C9" : "var(--pg-card-border)"}`,
                                      }}>
                                <span>{REACTION_EMOJIS[rt]}</span>
                                <span style={{ color: "var(--pg-text-2)" }}>{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <span className="text-[10px] mt-1 mx-1" style={{ color: "var(--pg-text-4)" }}>
                          {relativeTime(msg.sentAt)}
                        </span>
                      </div>
                    );
                  })
            }
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderTop: "1px solid var(--pg-row-border)", background: "var(--pg-card)" }}>
            <input value={message} onChange={e => setMessage(e.target.value)}
                   onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                   placeholder={`Message ${selectedChat.withName || "this chat"}…`}
                   className="flex-1 px-4 py-2.5 text-[13px] rounded-xl outline-none"
                   style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            <button onClick={sendMessage} disabled={sending || !message.trim()}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "#5059C9", opacity: (sending || !message.trim()) ? 0.4 : 1 }}>
              {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Image src="/teams-logo.svg" alt="Teams" width={56} height={56} style={{ opacity: 0.3 }} />
          <p className="text-[13px]" style={{ color: "var(--pg-text-3)" }}>Select a chat or search for someone</p>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  return <Suspense><TeamsPageInner /></Suspense>;
}
