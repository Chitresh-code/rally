"use client";

import type { UiChecklistItem } from "@/lib/rally-types";
import { MUTED_FG } from "./primitives";

type Props = {
  checklist: UiChecklistItem[];
  isGuest: boolean;
  newItemText: string;
  onChangeNewItemText: (value: string) => void;
  onAdd: () => void;
  onToggle: (itemId: string, done: boolean) => void;
  onDelete: (itemId: string) => void;
};

export function TaskChecklist({ checklist, isGuest, newItemText, onChangeNewItemText, onAdd, onToggle, onDelete }: Props) {
  const done = checklist.filter((c) => c.done).length;
  const total = checklist.length;
  return <div>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Checklist</div>
      {total > 0 && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{done}/{total}</div>}
    </div>
    {total > 0 && (
      <div style={{ height: 6, borderRadius: 999, background: "oklch(0.92 0.006 60)", overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", background: "oklch(0.68 0.16 35)", width: `${Math.round((done / total) * 100)}%` }} />
      </div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: isGuest ? 0 : 6 }}>
      {checklist.map((item) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={item.done} disabled={isGuest} onChange={(e) => onToggle(item.id, e.target.checked)} style={{ cursor: isGuest ? "default" : "pointer" }} />
          <span style={{ flex: 1, fontSize: 12.5, color: item.done ? MUTED_FG : "oklch(0.3 0.01 60)", textDecoration: item.done ? "line-through" : "none" }}>
            {item.text}
          </span>
          {!isGuest && (
            <button onClick={() => onDelete(item.id)} style={{ border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 13, flex: "none" }}>
              &times;
            </button>
          )}
        </div>
      ))}
      {checklist.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No checklist items.</div>}
    </div>
    {!isGuest && (
      <input
        value={newItemText}
        onChange={(e) => onChangeNewItemText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd();
        }}
        placeholder="+ Add checklist item"
        style={{ width: "100%", fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", fontFamily: "inherit" }}
      />
    )}
  </div>;
}
