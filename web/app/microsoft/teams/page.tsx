"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Plus, Search, ArrowUp, ExternalLink, ChevronDown, Phone, Video, Eye, Link2Off } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  msApi, relativeTime, stripHtml, presenceColor, BASE,
  ChatSummary, ChatPage, TeamsMessage, Presence, OrgUser, REACTION_EMOJIS,
} from "../components";
import { PeoplePicker } from "../PeoplePicker";
import { ProfileCard } from "../ProfileCard";
import { FileAttachmentCard } from "../FileAttachmentCard";

// Encode chatId and messageId — Teams IDs contain ':', '@', spaces
function encodeId(id: string) { return encodeURIComponent(id); }

/** Avatar with profile photo fallback to coloured initial */
function ChatAvatar({ msId, name, isGroup, size = 36 }: { msId: string; name: string; isGroup?: boolean; size?: number }) {
  const [photoError, setPhotoError] = useState(false);
  const initial = isGroup ? "G" : (name || "?").charAt(0).toUpperCase();
  const bg = isGroup ? "#7b5ea7" : "#5059C9";

  if (msId && !photoError && !isGroup) {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <img
          src={`${BASE}/api/v1/msgraph/users/${encodeId(msId)}/photo`}
          alt={name}
          onError={() => setPhotoError(true)}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      </div>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white"
         style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

// Play a short notification beep using Web Audio API (no file needed)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

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
  const [profileCard, setProfileCard] = useState<{ msId: string; name: string; rect: DOMRect } | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  // Optimistic messages — shown immediately on send, cleared after next successful fetch
  const [optimisticMessages, setOptimisticMessages] = useState<TeamsMessage[]>([]);
  const prevPageLengthRef = useRef(0);
  const [groupMembers, setGroupMembers] = useState("");
  const [groupTopic, setGroupTopic] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [settingPresence, setSettingPresence] = useState(false);
  const prevLastMsgRef = useRef<Map<string, string>>(new Map());

  const disconnectMutation = useMutation({
    mutationFn: () => msApi("/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Disconnected from Microsoft 365" });
      queryClient.invalidateQueries({ queryKey: ["msgraph-status"] });
      window.location.href = "/microsoft";
    },
    onError: () => toast({ title: "Disconnect failed", variant: "destructive" }),
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: presenceData, refetch: refetchPresence } = useQuery({
    queryKey: ["msgraph-presence-full"],
    queryFn: () => msApi("/presence") as Promise<Presence>,
    staleTime: 30_000, refetchInterval: 60_000,
  });

  const { data: chatsData, isLoading } = useQuery({
    queryKey: ["msgraph-teams-full", chatLimit],
    queryFn: () => msApi(`/teams/chats?top=${chatLimit}`) as Promise<{ chats: ChatSummary[] }>,
    staleTime: 30_000,
    refetchInterval: 30_000, // check for new chats every 30s
  });

  const { data: pageData, isLoading: pageLoading } = useQuery({
    queryKey: ["msgraph-chat-page-full", selectedChat?.id],
    queryFn: async () => {
      const p = await msApi(`/teams/${encodeId(selectedChat!.id)}/page?top=50`) as ChatPage;
      setOlderNextLink(p.nextLink || null);
      setOlderMessages([]);
      setOptimisticMessages([]); // clear stale optimistic messages on chat switch
      return p;
    },
    enabled: !!selectedChat,
    staleTime: 2_000,
    refetchInterval: 3_000, // poll active chat every 3s
  });

  const { data: searchData } = useQuery({
    queryKey: ["msgraph-search-full", debouncedQuery],
    queryFn: () => msApi(`/users/search?q=${encodeURIComponent(debouncedQuery)}`) as Promise<{ users: OrgUser[] }>,
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Mark chat as read when opened — enables read receipts for the other person
  useEffect(() => {
    if (!selectedChat) return;
    msApi(`/teams/${encodeId(selectedChat.id)}/mark-read`, { method: "POST" }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  // Other user's presence (shown in chat thread header)
  const { data: otherPresence } = useQuery({
    queryKey: ["msgraph-other-presence", selectedChat?.withMsId],
    queryFn: () => msApi(`/presence/user/${encodeId(selectedChat!.withMsId)}`) as Promise<Presence>,
    enabled: !!selectedChat?.withMsId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Local reactions (stored in our DB) — merged with Graph reactions
  const { data: localReactionsData, refetch: refetchReactions } = useQuery({
    queryKey: ["msgraph-local-reactions", selectedChat?.id],
    queryFn: () => msApi(`/teams/${encodeId(selectedChat!.id)}/reactions`) as Promise<Record<string, Array<{ reactionType: string; senderName: string; senderMsId: string }>>>,
    enabled: !!selectedChat,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  // Read receipts — fetch when thread is open to show eye icon on read messages
  const { data: readStatusData } = useQuery({
    queryKey: ["msgraph-read-status", selectedChat?.id],
    queryFn: () => msApi(`/teams/${encodeId(selectedChat!.id)}/read-status`) as Promise<{ members: Array<{ userId: string; displayName: string; lastReadDateTime: string }> }>,
    enabled: !!selectedChat,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Browser notification permission
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Detect NEW messages in any chat (not just new chats) and fire browser notification + beep
  useEffect(() => {
    const chats = chatsData?.chats ?? [];
    const prev = prevLastMsgRef.current;
    if (prev.size > 0) {
      chats.forEach(c => {
        const lastMsg = c.lastMessage;
        if (!lastMsg?.id) return;
        const prevId = prev.get(c.id);
        // New message if ID changed AND sender is not the current user
        if (prevId && prevId !== lastMsg.id && lastMsg.senderName !== user?.DisplayName) {
          const sender = lastMsg.senderName || c.withName || "Someone";
          const body = stripHtml(lastMsg.body || "").slice(0, 80) || "Sent you a message";
          playBeep();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const n = new Notification(`New message from ${sender}`, { body, icon: "/teams-logo.svg" });
            // Click notification → focus window
            n.onclick = () => { window.focus(); setSelectedChat(c); };
          }
        }
      });
    }
    // Update the map with current last message IDs
    const updated = new Map<string, string>();
    chats.forEach(c => { if (c.lastMessage?.id) updated.set(c.id, c.lastMessage.id); });
    prevLastMsgRef.current = updated;
  }, [chatsData, user?.DisplayName]);

  // Clear optimistic messages when real messages arrive (fetch count increased)
  useEffect(() => {
    const len = pageData?.messages?.length ?? 0;
    if (len > prevPageLengthRef.current && optimisticMessages.length > 0) {
      setOptimisticMessages([]);
    }
    prevPageLengthRef.current = len;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData?.messages?.length]);

  useEffect(() => {
    if (pageData) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [pageData]);

  async function loadOlder() {
    if (!selectedChat || !olderNextLink) return;
    setLoadingOlder(true);
    try {
      const p = await msApi(`/teams/${encodeId(selectedChat.id)}/page?nextLink=${encodeURIComponent(olderNextLink)}`) as ChatPage;
      setOlderMessages(prev => [...p.messages, ...prev]);
      setOlderNextLink(p.nextLink || null);
    } catch { toast({ title: "Could not load older messages", variant: "destructive" }); }
    finally { setLoadingOlder(false); }
  }

  async function sendMessage() {
    if (!selectedChat || !message.trim()) return;
    const text = message;
    setMessage(""); // Clear input immediately

    // Optimistic update — show the message right away before API responds
    const tempId = `opt-${Date.now()}`;
    const optimistic: TeamsMessage = {
      id: tempId,
      chatId: selectedChat.id,
      body: text,
      sentAt: new Date().toISOString(),
      senderName: user?.DisplayName || "You",
      senderMsId: "",
      attachments: [],
      reactions: [],
    };
    setOptimisticMessages(prev => [...prev, optimistic]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    setSending(true);
    try {
      await msApi(`/teams/${encodeId(selectedChat.id)}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      // Trigger immediate refetch (don't wait for the 3s interval)
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page-full", selectedChat.id] });
    } catch (e) {
      // Remove optimistic message and restore input on failure
      setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
      setMessage(text);
      toast({ title: "Failed to send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function updatePresence(availability: string) {
    setSettingPresence(true);
    try {
      await msApi("/presence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability, expirationDuration: "PT4H" }),
      });
      refetchPresence();
      toast({ title: "Availability updated", description: availability });
    } catch (e) { toast({ title: "Failed to update availability", description: (e as Error).message, variant: "destructive" }); }
    finally { setSettingPresence(false); }
  }

  async function startChat(person: OrgUser) {
    setStartingChat(person.id);
    try {
      const { chat_id } = await msApi("/teams/new-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_ms_id: person.id }),
      }) as { chat_id: string };
      setSearchQuery(""); setDebouncedQuery("");
      // Use the returned chat_id directly — encoding happens in API calls, not in state
      setSelectedChat({ id: chat_id, chatType: "oneOnOne", topic: "",
        withName: person.displayName, withEmail: person.mail, withMsId: person.id,
        lastMessage: { id: "", chatId: chat_id, body: "", sentAt: "", senderName: "", senderMsId: "" } });
      queryClient.invalidateQueries({ queryKey: ["msgraph-teams-full"] });
    } catch (e) { toast({ title: "Could not start chat", description: (e as Error).message, variant: "destructive" }); }
    finally { setStartingChat(null); }
  }

  async function createGroupChat() {
    const memberIds = groupMembers.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (memberIds.length < 2) {
      toast({ title: "Add at least 2 people to create a group chat", variant: "destructive" });
      return;
    }
    setCreatingGroup(true);
    try {
      const { chat_id } = await msApi("/teams/new-group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: groupTopic, member_ms_ids: memberIds }),
      }) as { chat_id: string };
      setGroupMode(false); setGroupMembers(""); setGroupTopic("");
      setSelectedChat({ id: chat_id, chatType: "group", topic: groupTopic || "Group Chat",
        withName: groupTopic || "Group Chat", withEmail: "", withMsId: "",
        lastMessage: { id: "", chatId: chat_id, body: "", sentAt: "", senderName: "", senderMsId: "" } });
      queryClient.invalidateQueries({ queryKey: ["msgraph-teams-full"] });
    } catch (e) { toast({ title: "Could not create group chat", description: (e as Error).message, variant: "destructive" }); }
    finally { setCreatingGroup(false); }
  }

  async function toggleReact(msg: TeamsMessage, rt: string) {
    // Check local reactions (our DB) — the source of truth
    const localForMsg = localReactionsData?.[msg.id] ?? [];
    const iMine = localForMsg.some(r => r.reactionType === rt && r.senderName === user?.DisplayName);
    try {
      await msApi(`/teams/${encodeId(msg.chatId)}/messages/${encodeId(msg.id)}/${iMine ? "unreact" : "react"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType: rt }),
      });
      refetchReactions(); // refresh local reaction counts immediately
    } catch (e) { toast({ title: "Reaction failed", description: (e as Error).message, variant: "destructive" }); }
  }

  async function deleteMsg(msg: TeamsMessage) {
    try {
      await msApi(`/teams/${encodeId(msg.chatId)}/messages/${encodeId(msg.id)}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["msgraph-chat-page-full", selectedChat?.id] });
    } catch { toast({ title: "Could not delete message", variant: "destructive" }); }
  }

  const chats = chatsData?.chats ?? [];
  // Merge: older pages + current page + optimistic (not yet in Graph response)
  const realIds = new Set((pageData?.messages ?? []).map(m => m.id));
  const currentMessages = [
    ...olderMessages,
    ...(pageData?.messages ?? []),
    ...optimisticMessages.filter(m => !realIds.has(m.id)),
  ];
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
            <button onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
                    title="Disconnect from Microsoft 365"
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: "var(--pg-text-3)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#ef4444"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--pg-text-3)"}>
              {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
            </button>
            {/* My presence indicator + setter */}
            {presenceData && (
              <div className="relative group/presence">
                <button className="flex items-center gap-1.5 h-6 px-2 rounded-lg text-[11px] font-medium"
                        style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: presenceColor(presenceData.availability) }} />
                  <span style={{ color: "var(--pg-text-2)" }}>{presenceData.availability}</span>
                  <ChevronDown className="w-3 h-3" style={{ color: "var(--pg-text-4)" }} />
                </button>
                {/* Dropdown */}
                <div className="absolute right-0 top-8 z-50 hidden group-hover/presence:block rounded-xl overflow-hidden shadow-lg"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", minWidth: 160 }}>
                  {[
                    { a: "Available", label: "Available" },
                    { a: "Busy", label: "Busy" },
                    { a: "DoNotDisturb", label: "Do Not Disturb" },
                    { a: "BeRightBack", label: "Be Right Back" },
                    { a: "Away", label: "Away" },
                    { a: "Offline", label: "Appear Offline" },
                  ].map(({ a, label }) => (
                    <button key={a} onClick={() => updatePresence(a)} disabled={settingPresence}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left transition-colors"
                            style={{ color: "var(--pg-text-1)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: presenceColor(a) }} />
                      {label}
                      {presenceData.availability === a && <span className="ml-auto text-[10px]" style={{ color: "var(--pg-text-3)" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Search + New Group toggle */}
          <div className="flex gap-1.5 mb-2">
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5" style={{ color: "var(--pg-text-4)" }} />
              <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setGroupMode(false); }}
                     placeholder="Search people to message…" className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg outline-none"
                     style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
            </div>
            <button onClick={() => { setGroupMode(v => !v); setSearchQuery(""); }}
                    className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold shrink-0"
                    style={{ background: groupMode ? "#5059C9" : "var(--pg-muted-bg)", color: groupMode ? "white" : "var(--pg-text-2)", border: "1px solid var(--pg-card-border)" }}>
              <Plus className="w-3 h-3" /> Group
            </button>
          </div>

          {/* Group chat creation panel */}
          {groupMode && (
            <div className="space-y-2 p-2 rounded-xl mb-2" style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-card-border)" }}>
              <p className="text-[11px] font-semibold" style={{ color: "var(--pg-text-3)" }}>NEW GROUP CHAT</p>
              <input value={groupTopic} onChange={e => setGroupTopic(e.target.value)}
                     placeholder="Group name (optional)"
                     className="w-full px-3 py-1.5 text-[12px] rounded-lg outline-none"
                     style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", color: "var(--pg-text-1)" }} />
              <PeoplePicker value={groupMembers} onChange={setGroupMembers} placeholder="Add members (search by name)" />
              <button onClick={createGroupChat} disabled={creatingGroup}
                      className="w-full h-7 rounded-lg text-[12px] font-semibold text-white flex items-center justify-center gap-1.5"
                      style={{ background: "#5059C9", opacity: creatingGroup ? 0.6 : 1 }}>
                {creatingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create Group Chat
              </button>
            </div>
          )}

          {/* 1:1 search results */}
          {debouncedQuery.length >= 2 && !groupMode && (
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
              {/* Avatar — shows profile photo if available */}
              <div className="relative shrink-0 cursor-pointer"
                   onClick={e => { e.stopPropagation(); if (chat.withMsId && chat.chatType !== "group") setProfileCard({ msId: chat.withMsId, name: chat.withName, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>
                <ChatAvatar msId={chat.chatType === "group" ? "" : chat.withMsId} name={chat.withName || chat.topic || "?"} isGroup={chat.chatType === "group"} size={36} />
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
            {/* Avatar with presence dot — clickable to show profile card */}
            <div className="relative shrink-0 cursor-pointer"
                 onClick={e => { if (selectedChat.withMsId) setProfileCard({ msId: selectedChat.withMsId, name: selectedChat.withName, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>
              <ChatAvatar msId={selectedChat.withMsId} name={selectedChat.withName || selectedChat.topic || "?"} isGroup={selectedChat.chatType === "group"} size={36} />
              {otherPresence && (
                <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                     style={{ background: presenceColor(otherPresence.availability), borderColor: "var(--pg-card)" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold truncate cursor-pointer hover:underline"
                 style={{ color: "var(--pg-text-1)" }}
                 onClick={e => { if (selectedChat.withMsId) setProfileCard({ msId: selectedChat.withMsId, name: selectedChat.withName, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>
                {selectedChat.withName || selectedChat.topic}
              </p>
              <p className="text-[11px]" style={{ color: presenceColor(otherPresence?.availability ?? "Unknown") }}>
                {otherPresence?.availability ?? (selectedChat.withEmail || "")}
                {otherPresence?.activity && otherPresence.activity !== otherPresence.availability && ` · ${otherPresence.activity}`}
              </p>
            </div>
            {/* Voice + Video call buttons */}
            {selectedChat.withEmail && (
              <div className="flex items-center gap-1.5">
                <a href={`https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(selectedChat.withEmail)}&withVideo=false`}
                   target="_blank" rel="noreferrer" title="Voice call"
                   className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                   style={{ color: "var(--pg-text-2)" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <Phone className="w-4 h-4" />
                </a>
                <a href={`https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(selectedChat.withEmail)}&withVideo=true`}
                   target="_blank" rel="noreferrer" title="Video call"
                   className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                   style={{ color: "var(--pg-text-2)" }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <Video className="w-4 h-4" />
                </a>
              </div>
            )}
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
                : currentMessages.map((msg, msgIdx) => {
                    const isMe = msg.senderName === user?.DisplayName;
                    const isOptimistic = msg.id.startsWith("opt-");
                    const text = stripHtml(msg.body);
                    const isLastSent = isMe && !isOptimistic && msgIdx === currentMessages.map((m, i) => m.senderName === user?.DisplayName ? i : -1).filter(i => i >= 0).pop();
                    const otherMemberRead = readStatusData?.members?.find((m: any) => m.userId === selectedChat?.withMsId);
                    const isRead = isLastSent && otherMemberRead?.lastReadDateTime
                      ? new Date(otherMemberRead.lastReadDateTime) >= new Date(msg.sentAt)
                      : false;
                    const isDeleted = text === "" && (msg.attachments ?? []).length === 0;

                    // Merge Graph reactions (from message) + local reactions (from our DB)
                    const reactionMap: Record<string, { count: number; iMine: boolean }> = {};
                    const allReactions = [
                      ...(msg.reactions ?? []),
                      ...(localReactionsData?.[msg.id] ?? []),
                    ];
                    allReactions.forEach(r => {
                      if (!reactionMap[r.reactionType]) reactionMap[r.reactionType] = { count: 0, iMine: false };
                      reactionMap[r.reactionType].count++;
                      if (r.senderName === user?.DisplayName) reactionMap[r.reactionType].iMine = true;
                    });
                    return (
                      <div key={msg.id} className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}>
                        {!isMe && (
                          <span className="text-[11px] mb-0.5 ml-1 font-medium cursor-pointer hover:underline"
                                style={{ color: "var(--pg-text-3)" }}
                                onClick={e => { if (msg.senderMsId) setProfileCard({ msId: msg.senderMsId, name: msg.senderName, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>
                            {msg.senderName}
                          </span>
                        )}
                        <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                          <div className="max-w-[60%] rounded-2xl text-[13px] leading-relaxed overflow-hidden"
                               style={{
                                 background: isDeleted ? "transparent" : isMe ? "#5059C9" : "var(--pg-card)",
                                 color: isDeleted ? "var(--pg-text-4)" : isMe ? "white" : "var(--pg-text-1)",
                                 border: isDeleted ? "1px dashed var(--pg-card-border)" : isMe ? "none" : "1px solid var(--pg-card-border)",
                                 borderBottomRightRadius: isMe ? 4 : undefined,
                                 borderBottomLeftRadius: isMe ? undefined : 4,
                                 opacity: isOptimistic ? 0.7 : 1, // slightly faded while sending
                               }}>
                            {isDeleted
                              ? <p className="px-4 py-2.5 italic text-[12px]">This message was deleted</p>
                              : <>
                                  {text && <p className="px-4 py-2.5 whitespace-pre-wrap">{text}</p>}
                                  {(msg.attachments ?? []).filter(a => a.name && a.contentUrl).length > 0 && (
                                    <div className={`flex flex-wrap gap-2 px-3 py-2.5 ${text ? "border-t" : ""}`}
                                         style={{ borderColor: isMe ? "rgba(255,255,255,0.12)" : "var(--pg-row-border)" }}>
                                      {(msg.attachments ?? []).filter(a => a.name && a.contentUrl).map(att => (
                                        <FileAttachmentCard key={att.id} attachment={att} isMe={isMe} />
                                      ))}
                                    </div>
                                  )}
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
                        <div className={`flex items-center gap-1 mt-1 mx-1 ${isMe ? "justify-end" : "justify-start"}`}>
                          <span className="text-[10px]" style={{ color: isOptimistic ? "#0078d4" : "var(--pg-text-4)" }}>
                            {isOptimistic ? "Sending…" : relativeTime(msg.sentAt)}
                          </span>
                          {isRead && (
                            <span title="Seen">
                              <Eye className="w-3 h-3" style={{ color: "#5059C9" }} />
                            </span>
                          )}
                        </div>
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

      {/* Profile card popup */}
      {profileCard && (
        <ProfileCard
          msId={profileCard.msId}
          displayName={profileCard.name}
          anchorRect={profileCard.rect}
          onClose={() => setProfileCard(null)}
          onStartChat={profileCard.msId !== selectedChat?.withMsId ? () => {
            // Start 1:1 chat with this person
            msApi("/teams/new-chat", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recipient_ms_id: profileCard.msId }),
            }).then((res: any) => {
              setSelectedChat({
                id: res.chat_id, chatType: "oneOnOne", topic: "",
                withName: profileCard.name, withEmail: "", withMsId: profileCard.msId,
                lastMessage: { id: "", chatId: res.chat_id, body: "", sentAt: "", senderName: "", senderMsId: "" },
              });
              queryClient.invalidateQueries({ queryKey: ["msgraph-teams-full"] });
            }).catch(() => {});
          } : undefined}
        />
      )}
    </div>
  );
}

export default function TeamsPage() {
  return <Suspense><TeamsPageInner /></Suspense>;
}
