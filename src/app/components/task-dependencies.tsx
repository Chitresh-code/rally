"use client";

import type { UiTaskRef } from "@/lib/rally-types";
import { MUTED_FG, STATUSES } from "./primitives";

type Props = {
  dependsOn: UiTaskRef[];
  dependents: UiTaskRef[];
  candidates: UiTaskRef[];
  isGuest: boolean;
  editMode: boolean;
  onOpenTask: (id: string) => void;
  onAdd: (dependsOnId: string) => void;
  onRemove: (dependsOnId: string) => void;
};

export function TaskDependencies({ dependsOn, dependents, candidates, isGuest, editMode, onOpenTask, onAdd, onRemove }: Props) {
  return <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Blocked by</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
      {dependsOn.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUSES.find((s) => s.key === d.status)!.color, flex: "none" }} />
          <button onClick={() => onOpenTask(d.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 12.5, fontWeight: 600, color: "oklch(0.3 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.title}
          </button>
          {!isGuest && editMode && (
            <button onClick={() => onRemove(d.id)} style={{ border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 13, flex: "none" }}>
              &times;
            </button>
          )}
        </div>
      ))}
      {dependsOn.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>Not blocked by anything.</div>}
    </div>
    {!isGuest && editMode && candidates.length > 0 && (
      <select
        value=""
        onChange={(e) => e.target.value && onAdd(e.target.value)}
        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
      >
        <option value="">+ Add blocking task</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
    )}
    {dependents.length > 0 && (
      <>
        <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", margin: "12px 0 8px" }}>Blocks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dependents.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUSES.find((s) => s.key === d.status)!.color, flex: "none" }} />
              <button onClick={() => onOpenTask(d.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 12.5, fontWeight: 600, color: "oklch(0.3 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.title}
              </button>
            </div>
          ))}
        </div>
      </>
    )}
  </div>;
}
