"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Phone, Building2, Briefcase, MessageSquare, X } from "lucide-react";
import { msApi, presenceColor, BASE } from "./components";

interface Props {
  msId: string;
  displayName: string;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onStartChat?: () => void;
}

type Profile = {
  id: string; displayName: string; mail: string;
  jobTitle: string; department: string; phone: string;
};
type Presence = { availability: string; activity: string };

export function ProfileCard({ msId, displayName, anchorRect, onClose, onStartChat }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [photoError, setPhotoError] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", msId],
    queryFn: () => msApi(`/users/${encodeURIComponent(msId)}/profile`) as Promise<Profile>,
    staleTime: 300_000,
  });

  const { data: presence } = useQuery({
    queryKey: ["user-presence-card", msId],
    queryFn: () => msApi(`/presence/user/${encodeURIComponent(msId)}`) as Promise<Presence>,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  // Position card near the anchor element
  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 200,
    width: 280,
  };
  if (anchorRect) {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    if (spaceBelow > 300) {
      style.top  = anchorRect.bottom + 8;
      style.left = Math.min(anchorRect.left, window.innerWidth - 296);
    } else {
      style.bottom = window.innerHeight - anchorRect.top + 8;
      style.left   = Math.min(anchorRect.left, window.innerWidth - 296);
    }
  } else {
    style.top = "50%"; style.left = "50%";
    style.transform = "translate(-50%,-50%)";
  }

  const photoUrl = `${BASE}/api/v1/msgraph/users/${encodeURIComponent(msId)}/photo`;

  return (
    <div ref={ref} style={{ ...style, background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.25)" }}>
      {/* Header strip */}
      <div className="relative" style={{ background: "linear-gradient(135deg,#5059C9,#7b5ea7)", height: 56 }}>
        <button onClick={onClose}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Avatar */}
      <div className="relative flex justify-center" style={{ marginTop: -32 }}>
        <div className="relative">
          {!photoError ? (
            <img
              src={photoUrl}
              alt={displayName}
              onError={() => setPhotoError(true)}
              className="w-16 h-16 rounded-full object-cover"
              style={{ border: "3px solid var(--pg-card)" }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-bold text-white"
                 style={{ background: "#5059C9", border: "3px solid var(--pg-card)" }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Presence dot */}
          {presence && (
            <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2"
                 style={{ background: presenceColor(presence.availability), borderColor: "var(--pg-card)" }} />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-5 pt-2 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-4)" }} />
          </div>
        ) : (
          <>
            <p className="text-[15px] font-bold text-center mt-1" style={{ color: "var(--pg-text-1)" }}>
              {profile?.displayName || displayName}
            </p>
            {presence && (
              <p className="text-[11px] text-center mt-0.5" style={{ color: presenceColor(presence.availability) }}>
                {presence.availability}
                {presence.activity && presence.activity !== presence.availability && ` · ${presence.activity}`}
              </p>
            )}

            <div className="mt-3 space-y-1.5">
              {profile?.jobTitle && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                  <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                  {profile.jobTitle}
                </div>
              )}
              {profile?.department && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--pg-text-2)" }}>
                  <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                  {profile.department}
                </div>
              )}
              {profile?.mail && (
                <a href={`mailto:${profile.mail}`}
                   className="flex items-center gap-2 text-[12px] hover:underline"
                   style={{ color: "#0078d4" }}>
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {profile.mail}
                </a>
              )}
              {profile?.phone && (
                <a href={`tel:${profile.phone}`}
                   className="flex items-center gap-2 text-[12px] hover:underline"
                   style={{ color: "var(--pg-text-2)" }}>
                  <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pg-text-3)" }} />
                  {profile.phone}
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              {onStartChat && (
                <button onClick={() => { onStartChat(); onClose(); }}
                        className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[12px] font-semibold text-white"
                        style={{ background: "#5059C9" }}>
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </button>
              )}
              {profile?.mail && (
                <a href={`mailto:${profile.mail}`}
                   className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[12px] font-medium"
                   style={{ border: "1px solid var(--pg-card-border)", color: "var(--pg-text-2)" }}>
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
