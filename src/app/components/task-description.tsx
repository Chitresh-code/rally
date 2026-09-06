"use client";

import type { UiTask } from "@/lib/rally-types";
import { Markdown, MUTED_FG } from "./primitives";

type Props = {
  task: UiTask;
  isGuest: boolean;
  editMode: boolean;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onSave: (description: string) => void;
};

export function TaskDescription({ task, isGuest, editMode, editing, saving, onStartEdit, onSave }: Props) {
  return <div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Description</div>
      {!isGuest && editMode && !editing && (
        <button onClick={onStartEdit} style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.68 0.16 35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          Edit
        </button>
      )}
    </div>
    {isGuest || !editMode || !editing ? (
      task.desc ? <Markdown text={task.desc} /> : <div style={{ fontSize: 13.5, color: MUTED_FG }}>No description.</div>
    ) : (
      <textarea
        key={task.id}
        defaultValue={task.desc}
        placeholder="Add a description… (Markdown supported)"
        onBlur={(e) => onSave(e.target.value)}
        disabled={saving}
        autoFocus
        rows={5}
        style={{ width: "100%", fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.3 0.01 60)", fontFamily: "inherit", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", resize: "vertical" }}
      />
    )}
  </div>;
}
