"use client";

/**
 * Renders Teams message body HTML safely.
 * Preserves links, images, adaptive cards, quoted replies and rich formatting.
 * Strips scripts, event handlers and javascript: hrefs to prevent XSS.
 */
export function sanitizeTeamsHtml(html: string): string {
  return html
    // Remove scripts entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove style blocks
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Strip event handler attributes
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, "")
    // Block javascript: protocol
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    // Ensure all links open safely in new tab
    .replace(/<a\b([^>]*)>/gi, (_, attrs) =>
      `<a${attrs}${!/target=/i.test(attrs) ? ' target="_blank"' : ""} rel="noreferrer">`)
    // Hide Teams internal markup (attachment placeholders without content)
    .replace(/<attachment[^>]*>\s*<\/attachment>/gi, "");
}

interface Props {
  body: string;      // raw Teams message body (may be HTML or plain text)
  isMe: boolean;     // for colour adaptation
  className?: string;
}

export function MessageBody({ body, isMe, className = "" }: Props) {
  const isHtml = /<[a-z][^>]*>/i.test(body);

  if (!isHtml) {
    // Plain text — preserve newlines and detect URLs to make them clickable
    const parts = body.split(/(https?:\/\/[^\s]+)/g);
    return (
      <p className={`whitespace-pre-wrap break-words ${className}`}>
        {parts.map((part, i) =>
          /^https?:\/\//.test(part) ? (
            <a key={i} href={part} target="_blank" rel="noreferrer"
               className="underline" style={{ color: isMe ? "rgba(255,255,255,0.9)" : "#0078d4" }}>
              {part}
            </a>
          ) : part
        )}
      </p>
    );
  }

  const safe = sanitizeTeamsHtml(body);
  return (
    <div
      className={`teams-msg-body break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
      style={{
        // Quoted reply (blockquote) styling
        ["--quote-border" as any]: isMe ? "rgba(255,255,255,0.4)" : "#0078d4",
        ["--quote-bg" as any]:     isMe ? "rgba(255,255,255,0.08)" : "rgba(0,120,212,0.06)",
        ["--link-color" as any]:   isMe ? "rgba(255,255,255,0.9)"  : "#0078d4",
      }}
    />
  );
}
