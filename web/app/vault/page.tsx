"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, Upload, FileText, File, Image as ImageIcon,
  Download, Eye, Shield, ShieldCheck, ShieldAlert,
  Loader2, X, FolderLock,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081";

type VaultDoc = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  created_at: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScanBadge({ status }: { status: string }) {
  if (status === "clean")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><ShieldCheck className="w-3 h-3" />Clean</span>;
  if (status === "infected")
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600"><ShieldAlert className="w-3 h-3" />Infected</span>;
  return <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--pg-text-4)" }}><Shield className="w-3 h-3" />Scanning…</span>;
}

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="w-5 h-5 text-orange-500" />;
  if (mimeType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5" style={{ color: "var(--pg-text-3)" }} />;
}

function PreviewModal({ doc, onClose }: { doc: VaultDoc; onClose: () => void }) {
  const url = `${BASE}/api/v1/documents/${doc.id}/download`;
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf   = doc.mime_type === "application/pdf";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
         onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)", maxHeight: "90vh", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
             style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <DocIcon mimeType={doc.mime_type} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                {formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString("en-GB")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
               style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ color: "var(--pg-text-3)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={doc.filename} className="max-w-full max-h-full object-contain rounded-lg" />
          ) : isPdf ? (
            <iframe src={url} title={doc.filename} className="w-full rounded-lg" style={{ height: "65vh", border: "none" }} />
          ) : (
            <div className="text-center py-12">
              <p className="text-[13px] mt-3" style={{ color: "var(--pg-text-2)" }}>Preview not available for this file type.</p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                 className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                 style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
                <Download className="w-3.5 h-3.5" /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VaultPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<VaultDoc | null>(null);

  const { data: docs = [], isLoading } = useQuery<VaultDoc[]>({
    queryKey: ["vault-personal"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/documents?vault_type=personal`, { credentials: "include" });
      if (!res.ok) return [];
      return ((await res.json()) ?? []) as VaultDoc[];
    },
    enabled: Boolean(user),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 20 MB per file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vault_type", "personal");
      const res = await fetch(`${BASE}/api/v1/documents`, { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message ?? "Upload failed");
      }
      qc.invalidateQueries({ queryKey: ["vault-personal"] });
      toast({ title: "Saved to Vault", description: `${file.name} is now in your private vault.` });
    } catch (err) {
      toast({ title: "Upload Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderLock className="w-5 h-5 text-orange-600" />
            <h1 className="text-[20px] font-bold" style={{ color: "var(--pg-text-1)" }}>My Private Vault</h1>
          </div>
          <p className="text-[12px]" style={{ color: "var(--pg-text-3)" }}>
            Only you can see these documents. Upload anything you need to keep private and accessible.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#FF6600,#E05500)", boxShadow: "0 1px 6px rgba(255,102,0,0.35)" }}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload File"}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile}
               accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.zip" />
      </div>

      {/* Privacy notice */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
           style={{ background: "rgba(255,102,0,0.06)", border: "1px solid rgba(255,102,0,0.15)" }}>
        <Lock className="w-4 h-4 text-orange-600 shrink-0" />
        <p className="text-[12px]" style={{ color: "var(--pg-text-2)" }}>
          <strong>Fully private.</strong> These files are stored securely and are only accessible to you. No HR, manager, or admin can view them.
        </p>
      </div>

      {/* Document list */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "var(--pg-card)", border: "1px solid var(--pg-card-border)" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--pg-row-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--pg-text-1)" }}>
            Stored Files
            {docs.length > 0 && (
              <span className="font-normal text-[11px] ml-1" style={{ color: "var(--pg-text-3)" }}>({docs.length})</span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pg-text-3)" }} />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                 style={{ background: "var(--pg-muted-bg)" }}>
              <FolderLock className="w-7 h-7" style={{ color: "var(--pg-text-4)" }} />
            </div>
            <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--pg-text-2)" }}>Your vault is empty</p>
            <p className="text-[12px] mb-4" style={{ color: "var(--pg-text-4)" }}>
              Upload personal documents, certificates, or anything else you want to keep handy and private.
            </p>
            <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#FF6600,#E05500)" }}>
              <Upload className="w-3.5 h-3.5" /> Upload First File
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pg-row-border)" }}>
            {docs.map(doc => (
              <div key={doc.id}
                   className="flex items-center gap-3.5 px-5 py-3.5 group transition-colors"
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-row-hover)"}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                     style={{ background: "var(--pg-muted-bg)" }}>
                  <DocIcon mimeType={doc.mime_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "var(--pg-text-1)" }}>{doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>{formatBytes(doc.size_bytes)}</span>
                    <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>·</span>
                    <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>{new Date(doc.created_at).toLocaleDateString("en-GB")}</span>
                    <span className="text-[11px]" style={{ color: "var(--pg-text-4)" }}>·</span>
                    <ScanBadge status={doc.scan_status} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setPreview(doc)} title="Preview"
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: "var(--pg-text-3)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <Eye className="w-4 h-4" />
                  </button>
                  <a href={`${BASE}/api/v1/documents/${doc.id}/download`}
                     target="_blank" rel="noopener noreferrer" title="Download"
                     className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                     style={{ color: "var(--pg-text-3)" }}
                     onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--pg-card)"}
                     onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
