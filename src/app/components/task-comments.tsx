"use client";

import type { UiAvatar, UiComment } from "@/lib/rally-types";
import { AvatarCircle, Markdown, MentionComposer, MUTED_FG } from "./primitives";

type Props = {
  comments: UiComment[];
  candidates: UiAvatar[];
  value: string;
  onChangeValue: (value: string) => void;
  posting: boolean;
  onPost: () => void;
};

export function TaskComments({ comments, candidates, value, onChangeValue, posting, onPost }: Props) {
  return <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Comments ({comments.length})</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 10 }}>
      {comments.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8 }}>
          <AvatarCircle avatar={c.author} size={24} fontSize={10} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.author.name}</span>
              <span style={{ fontSize: 11, color: MUTED_FG }}>{c.time}</span>
            </div>
            <Markdown text={c.body} />
          </div>
        </div>
      ))}
      {comments.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No comments yet.</div>}
    </div>
    <div style={{ display: "flex", gap: 8 }}>
      <MentionComposer
        value={value}
        onChange={onChangeValue}
        candidates={candidates}
        onEnter={onPost}
        placeholder="Add a comment… (@ to mention, Markdown supported)"
        disabled={posting}
        inputStyle={{ width: "100%", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit" }}
      />
      <button
        onClick={onPost}
        disabled={posting || !value.trim()}
        style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: posting || !value.trim() ? 0.6 : 1 }}
      >
        Post
      </button>
    </div>
  </div>;
}
