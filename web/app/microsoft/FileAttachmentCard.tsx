"use client";

import { useState } from "react";
import { ExternalLink, FileText, FileCode, FileSpreadsheet, File, Image } from "lucide-react";

interface Attachment {
  id: string;
  contentType: string;
  contentUrl: string;
  name: string;
}

interface Props {
  attachment: Attachment;
  isMe: boolean; // determines card colour scheme
}

function getFileInfo(name: string, contentType: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  const codeExts = ["py", "js", "ts", "tsx", "jsx", "go", "sql", "sh", "bash", "json",
    "yaml", "yml", "toml", "rs", "java", "c", "cpp", "cs", "rb", "php", "swift",
    "kt", "scala", "html", "css", "scss"];
  const docExts   = ["doc", "docx", "odt", "txt", "md", "rtf"];
  const sheetExts = ["xls", "xlsx", "csv", "ods"];
  const imgExts   = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "heif"];
  const pdfExts   = ["pdf"];

  if (imgExts.includes(ext) || contentType.startsWith("image/")) return { type: "image",  icon: Image,           color: "#10b981", label: ext.toUpperCase() || "IMG" };
  if (codeExts.includes(ext))                                       return { type: "code",   icon: FileCode,        color: "#6366f1", label: ext.toUpperCase() };
  if (pdfExts.includes(ext))                                        return { type: "pdf",    icon: FileText,        color: "#ef4444", label: "PDF" };
  if (docExts.includes(ext))                                        return { type: "doc",    icon: FileText,        color: "#3b82f6", label: ext.toUpperCase() || "DOC" };
  if (sheetExts.includes(ext))                                      return { type: "sheet",  icon: FileSpreadsheet, color: "#22c55e", label: ext.toUpperCase() || "XLS" };
  return                                                              { type: "file",   icon: File,            color: "#94a3b8", label: ext.toUpperCase() || "FILE" };
}

export function FileAttachmentCard({ attachment, isMe }: Props) {
  const [imgError, setImgError] = useState(false);
  const info = getFileInfo(attachment.name, attachment.contentType);
  const Icon = info.icon;

  // Card colours — inverted from bubble: dark for "me", light for others
  const cardBg      = isMe ? "rgba(255,255,255,0.12)" : "var(--pg-muted-bg)";
  const cardBorder  = isMe ? "rgba(255,255,255,0.18)" : "var(--pg-card-border)";
  const textPrimary = isMe ? "white"                  : "var(--pg-text-1)";
  const textMuted   = isMe ? "rgba(255,255,255,0.6)"  : "var(--pg-text-3)";
  const btnBg       = isMe ? "rgba(255,255,255,0.15)" : "var(--pg-card)";

  // Truncate filename to ~28 chars
  const displayName = attachment.name.length > 30
    ? attachment.name.slice(0, 27) + "…"
    : attachment.name;

  return (
    <a href={attachment.contentUrl} target="_blank" rel="noreferrer"
       className="block no-underline hover:opacity-90 transition-opacity"
       style={{ width: 200 }}>
      <div className="rounded-2xl overflow-hidden"
           style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>

        {/* Image preview — shown for image attachments */}
        {info.type === "image" && !imgError && attachment.contentUrl ? (
          <div className="relative" style={{ height: 120, background: "rgba(0,0,0,0.1)" }}>
            <img
              src={attachment.contentUrl}
              alt={attachment.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          /* File preview area — icon-based placeholder that looks like Teams */
          <div className="relative flex items-center justify-center"
               style={{ height: 100, background: "rgba(0,0,0,0.08)" }}>
            {/* Lined paper background effect */}
            <div className="absolute inset-0" style={{ opacity: 0.06 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="mx-4"
                     style={{ borderBottom: "1px solid currentColor", height: 14, marginTop: i === 0 ? 14 : 0 }} />
              ))}
            </div>
            {/* Large file icon */}
            <Icon className="w-10 h-10" style={{ color: info.color, opacity: 0.9 }} />
          </div>
        )}

        {/* File metadata footer */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Small icon */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: info.color + "22" }}>
            <Icon className="w-4 h-4" style={{ color: info.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold truncate leading-tight"
               style={{ color: textPrimary }}>
              {displayName}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
              {info.label}
            </p>
          </div>

          {/* Open icon */}
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
               style={{ background: btnBg }}>
            <ExternalLink className="w-3 h-3" style={{ color: textMuted }} />
          </div>
        </div>
      </div>
    </a>
  );
}
