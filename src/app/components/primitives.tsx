"use client";

import { useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StatusKey, UiAvatar } from "@/lib/rally-types";
import { activeMentionQuery, mentionToken, parseMentions } from "@/lib/mentions";

export const MUTED_FG = "oklch(0.5 0.01 60)";

export const STATUSES: { key: StatusKey; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "oklch(0.6 0.01 60)" },
  { key: "in_progress", label: "In Progress", color: "oklch(0.6 0.14 240)" },
  { key: "review", label: "Review", color: "oklch(0.7 0.14 70)" },
  { key: "done", label: "Done", color: "oklch(0.6 0.13 150)" },
];

export function AvatarCircle({ avatar, size, fontSize }: { avatar: UiAvatar; size: number; fontSize: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: `oklch(0.55 0.13 ${avatar.hue})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize, fontWeight: 700, flex: "none" }}>{avatar.initials}</div>;
}

/** Rewrites `@[Name](id)` mention tokens into markdown links on a private scheme, so a single markdown pass renders both. */
function toMarkdownSource(text: string): string {
  return parseMentions(text)
    .map((seg) => (seg.type === "mention" ? `[@${seg.name}](rally-mention:${seg.userId})` : seg.value))
    .join("");
}

/** Renders markdown (GFM) with `@mention` tokens highlighted instead of linked. Used for descriptions, comments, and chat. */
export function Markdown({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rl-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("rally-mention:") ? (
              <span style={{ fontWeight: 700, color: "oklch(0.68 0.16 35)" }}>{children}</span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {toMarkdownSource(text)}
      </ReactMarkdown>
    </div>
  );
}

/** A text input with "@" autocomplete that inserts a `@[Name](id)` mention token. */
export function MentionComposer({
  value,
  onChange,
  candidates,
  placeholder,
  disabled,
  onEnter,
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: UiAvatar[];
  placeholder: string;
  disabled?: boolean;
  onEnter: () => void;
  inputStyle: CSSProperties;
}) {
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setMention(activeMentionQuery(v, e.target.selectionStart ?? v.length));
  }

  function pick(m: UiAvatar) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    onChange(`${before}${mentionToken(m.name, m.id)} ${after}`);
    setMention(null);
  }

  const matches = mention ? candidates.filter((c) => c.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6) : [];

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMention(null);
          else if (e.key === "Enter" && !mention) onEnter();
        }}
        onBlur={() => setTimeout(() => setMention(null), 120)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
      {mention && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid oklch(0.88 0.006 60)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            overflow: "hidden",
            zIndex: 20,
            minWidth: 180,
          }}
        >
          {matches.map((m) => (
            <div
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", fontSize: 13 }}
            >
              <AvatarCircle avatar={m} size={20} fontSize={9} />
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg }}>{children}</span>;
}

export function CopyButton({ text, label = "Copy link", style }: { text: string; label?: string; style?: CSSProperties }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ border: "none", background: copied ? "oklch(0.6 0.13 150)" : "oklch(0.95 0.006 60)", color: copied ? "#fff" : "inherit", padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flex: "none", transition: "background 0.15s, color 0.15s", ...style }}>{copied ? "Copied!" : label}</button>;
}
