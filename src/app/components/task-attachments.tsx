"use client";

import type { UiAttachment } from "@/lib/rally-types";
import { MUTED_FG } from "./primitives";

type Props = {
  attachments: UiAttachment[];
  isGuest: boolean;
  uploading: boolean;
  onUpload: (file: File | null) => void;
  onDelete: (attachmentId: string) => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachments({ attachments, isGuest, uploading, onUpload, onDelete }: Props) {
  return <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Attachments ({attachments.length})</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: isGuest ? 0 : 8 }}>
      {attachments.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 8, padding: "6px 8px" }}>
          <a href={`/api/attachments/${a.id}`} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "oklch(0.3 0.01 60)" }}>
            {a.filename}
          </a>
          <span style={{ color: MUTED_FG, fontSize: 11, flex: "none" }}>{formatBytes(a.size)}</span>
          {!isGuest && (
            <button onClick={() => onDelete(a.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "oklch(0.55 0.18 25)", fontSize: 13, flex: "none" }}>
              &times;
            </button>
          )}
        </div>
      ))}
      {attachments.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No attachments.</div>}
    </div>
    {!isGuest && (
      <input
        type="file"
        onChange={(e) => {
          onUpload(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
        disabled={uploading}
        style={{ fontSize: 12 }}
      />
    )}
  </div>;
}
