"use client";

import type { UiAvatar, UiTask } from "@/lib/rally-types";
import { AvatarCircle } from "./primitives";

type Props = {
  task: UiTask;
  members: UiAvatar[];
  isGuest: boolean;
  editMode: boolean;
  saving: boolean;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
};

export function TaskAssignees({ task, members, isGuest, editMode, saving, onAdd, onRemove }: Props) {
  const addableMembers = members.filter((member) => !task.assignees.some((assignee) => assignee.id === member.id));
  return <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Assignees</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: !isGuest && editMode ? 6 : 0 }}>
      {task.assignees.map((assignee) => <div key={assignee.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "oklch(0.96 0.006 60)", borderRadius: 999, padding: "3px 6px 3px 3px" }}><AvatarCircle avatar={assignee} size={20} fontSize={9} /><span style={{ fontSize: 12, fontWeight: 600 }}>{assignee.name}</span>{!isGuest && editMode && <button onClick={() => onRemove(assignee.id)} disabled={saving} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "0 2px" }}>&times;</button>}</div>)}
      {task.assignees.length === 0 && <span style={{ fontSize: 12.5, color: "oklch(0.5 0.01 60)" }}>Unassigned</span>}
    </div>
    {!isGuest && editMode && addableMembers.length > 0 && <select value="" onChange={(event) => event.target.value && onAdd(event.target.value)} disabled={saving} style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}><option value="">+ Add assignee</option>{addableMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>}
  </div>;
}
