// Mentions are stored inline in comment/message bodies as `@[Name](userId)`.
// Parsing below is plain string scanning (indexOf/slice), no regex, so a
// stray "@" or literal brackets in someone's message never misparses.

export type MentionSegment = { type: "text"; value: string } | { type: "mention"; name: string; userId: string };

export function mentionToken(name: string, userId: string): string {
  return `@[${name}](${userId})`;
}

export function parseMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("@[", i);
    if (start === -1) {
      segments.push({ type: "text", value: text.slice(i) });
      break;
    }
    if (start > i) segments.push({ type: "text", value: text.slice(i, start) });

    const nameEnd = text.indexOf("](", start + 2);
    const idEnd = nameEnd === -1 ? -1 : text.indexOf(")", nameEnd + 2);

    if (nameEnd === -1 || idEnd === -1) {
      segments.push({ type: "text", value: "@[" });
      i = start + 2;
      continue;
    }

    segments.push({ type: "mention", name: text.slice(start + 2, nameEnd), userId: text.slice(nameEnd + 2, idEnd) });
    i = idEnd + 1;
  }
  return segments;
}

export function mentionedUserIds(text: string): string[] {
  const ids = parseMentions(text)
    .filter((s): s is Extract<MentionSegment, { type: "mention" }> => s.type === "mention")
    .map((s) => s.userId);
  return [...new Set(ids)];
}

/** Is the caret currently inside an in-progress "@query" the user is typing? */
export function activeMentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor);
  const at = uptoCursor.lastIndexOf("@");
  if (at === -1) return null;
  const before = uptoCursor[at - 1];
  if (before !== undefined && before !== " " && before !== "\n") return null;
  const query = uptoCursor.slice(at + 1);
  if (query.includes(" ") || query.includes("\n")) return null;
  return { start: at, query };
}
