"use client";

import type { UiTask } from "@/lib/rally-types";
import { CopyButton } from "./primitives";

type Props = {
  task: UiTask;
  isGuest: boolean;
  editMode: boolean;
  savingTitle: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSaveTitle: (title: string) => void;
  onToggleEdit: () => void;
};

export function TaskDetailHeader({ task, isGuest, editMode, savingTitle, onClose, onDelete, onSaveTitle, onToggleEdit }: Props) {
  const taskUrl = `${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?task=${task.id}`;
  return <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {!isGuest && editMode ? <input key={task.id} defaultValue={task.title} onBlur={(event) => onSaveTitle(event.target.value)} disabled={savingTitle} style={{ width: "100%", boxSizing: "border-box", fontSize: 17, fontWeight: 700, lineHeight: 1.35, border: "1px solid oklch(0.6 0.14 240)", borderRadius: 8, padding: "4px 6px", fontFamily: "inherit" }} /> : <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>{task.title}</div>}
      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)" }}>Opened by {task.createdBy.name}</div>
    </div>
    {!isGuest && <button onClick={onToggleEdit} title={editMode ? "Done editing" : "Edit task"} style={{ border: "none", background: editMode ? "oklch(0.68 0.16 35)" : "oklch(0.95 0.006 60)", color: editMode ? "#fff" : "inherit", padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flex: "none" }}>{editMode ? "Done" : "Edit"}</button>}
    <CopyButton text={taskUrl} label="Copy link" />
    {!isGuest && editMode && <button onClick={onDelete} title="Delete task" style={{ border: "none", background: "oklch(0.95 0.006 60)", padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flex: "none", color: "oklch(0.55 0.18 25)" }}>Delete</button>}
    <button onClick={onClose} style={{ border: "none", background: "oklch(0.95 0.006 60)", width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer", flex: "none" }}>&times;</button>
  </div>;
}
