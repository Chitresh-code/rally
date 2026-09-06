"use client";

import { useState, useEffect, useMemo, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  addChecklistItem,
  addTaskAssignee,
  addTaskDependency,
  assignToSpace,
  createCustomField,
  createInvite,
  createList,
  createSpace,
  createTask,
  deleteAttachment,
  deleteChecklistItem,
  deleteCustomField,
  deleteTask,
  getOrCreateDirectChannel,
  markAllNotificationsRead,
  markChannelRead,
  markNotificationRead,
  moveTaskToList,
  postComment,
  postMessage,
  removeFromSpace,
  removeTaskAssignee,
  removeTaskDependency,
  revokeInvite,
  setCustomFieldValue,
  setMemberRole,
  toggleChecklistItem,
  updateNotificationPrefs,
  updatePassword,
  updateProfileName,
  updateSlackWebhook,
  updateTaskDescription,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
  uploadAttachment,
} from "./actions";
import { activeMentionQuery, mentionToken, parseMentions } from "@/lib/mentions";

/* ---------- types (shaped server-side from real Prisma data) ---------- */

export type UiAvatar = { id: string; name: string; initials: string; hue: number };
export type PriorityKey = "urgent" | "high" | "normal" | "low";
export type StatusKey = "todo" | "in_progress" | "review" | "done";
export type RoleKey = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export type UiComment = { id: string; author: UiAvatar; body: string; time: string };
export type UiAttachment = { id: string; filename: string; mimeType: string; size: number; uploadedBy: UiAvatar; time: string };
export type UiTaskRef = { id: string; title: string; status: StatusKey };

export type UiChecklistItem = { id: string; text: string; done: boolean };
export type UiCustomField = { id: string; name: string; type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN"; options: string[] };
export type UiCustomFieldValue = { fieldId: string; value: string };

export type UiTask = {
  id: string;
  listId: string;
  title: string;
  desc: string;
  status: StatusKey;
  priority: PriorityKey;
  due: string;
  dueDate: string | null;
  assignees: UiAvatar[];
  createdBy: UiAvatar;
  checklist: UiChecklistItem[];
  customFieldValues: UiCustomFieldValue[];
  comments: UiComment[];
  attachments: UiAttachment[];
  dependsOn: UiTaskRef[];
  dependents: UiTaskRef[];
};

export type UiList = { id: string; name: string; isSprint: boolean; sprintStart: string | null; sprintEnd: string | null; tasks: UiTask[]; customFields: UiCustomField[] };
export type UiSpace = { id: string; name: string; hue: number; members: UiAvatar[]; lists: UiList[] };
export type UiMessage = { id: string; author: UiAvatar; text: string; time: string; parentMessageId: string | null };
export type UiChannel = { id: string; name: string; isDirect: boolean; unread: number; members: UiAvatar[]; messages: UiMessage[] };
export type UiInvite = { id: string; email: string; role: string; scope: string | null; url: string };
export type UiMember = UiAvatar & { role: RoleKey };
export type UiNotification = { id: string; text: string; time: string; read: boolean; taskId: string | null };

export type RallyAppProps = {
  workspaceName: string;
  currentUser: UiAvatar;
  currentUserEmail: string;
  isGuestRole: boolean;
  role: RoleKey;
  spaces: UiSpace[];
  sharedLists: UiList[];
  members: UiAvatar[];
  allMembers: UiMember[];
  channels: UiChannel[];
  pendingInvites: UiInvite[];
  notifications: UiNotification[];
  slackWebhookUrl: string | null;
  notificationPrefs: Record<string, boolean> | null;
};

const NOTIF_PREF_DEFS: { key: string; label: string; group: string }[] = [
  { key: "taskAssigned", label: "Assigned to a task", group: "Tasks" },
  { key: "taskDue", label: "Task due soon", group: "Tasks" },
  { key: "comments", label: "Comments & mentions on tasks", group: "Tasks" },
  { key: "chatMentions", label: "Mentions in chat", group: "Chat" },
];

const STATUSES: { key: StatusKey; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "oklch(0.6 0.01 60)" },
  { key: "in_progress", label: "In Progress", color: "oklch(0.6 0.14 240)" },
  { key: "review", label: "Review", color: "oklch(0.7 0.14 70)" },
  { key: "done", label: "Done", color: "oklch(0.6 0.13 150)" },
];

const PRIORITY: Record<PriorityKey, { label: string; bg: string; fg: string }> = {
  urgent: { label: "Urgent", bg: "oklch(0.6 0.19 25)", fg: "#fff" },
  high: { label: "High", bg: "oklch(0.88 0.14 70)", fg: "oklch(0.35 0.1 70)" },
  normal: { label: "Normal", bg: "oklch(0.9 0.05 240)", fg: "oklch(0.35 0.08 240)" },
  low: { label: "Low", bg: "oklch(0.92 0.01 60)", fg: "oklch(0.45 0.01 60)" },
};

function avatarBg(hue: number) {
  return `oklch(0.55 0.13 ${hue})`;
}

const ACCENT_BG = "oklch(0.93 0.05 35)";
const ACCENT_FG = "oklch(0.35 0.12 35)";
const NEUTRAL_FG = "oklch(0.4 0.01 60)";
const MUTED_FG = "oklch(0.5 0.01 60)";

/* ---------- small shared bits ---------- */

function AvatarCircle({ a, size, fontSize }: { a: UiAvatar; size: number; fontSize: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: avatarBg(a.hue),
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 700,
        flex: "none",
      }}
    >
      {a.initials}
    </div>
  );
}

function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg }}>
      {children}
    </span>
  );
}

/** A "Copy link" button that swaps to a "Copied!" confirmation state for 1.5s after a click. */
function CopyButton({ text, label = "Copy link", style }: { text: string; label?: string; style?: CSSProperties }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        border: "none",
        background: "oklch(0.95 0.006 60)",
        color: "inherit",
        padding: "0 10px",
        height: 30,
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: "pointer",
        flex: "none",
        transition: "background 0.15s, color 0.15s",
        ...style,
        ...(copied ? { background: "oklch(0.6 0.13 150)", color: "#fff", border: "none" } : {}),
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function Skel({ w, h, r = 6 }: { w: string | number; h: number; r?: number }) {
  return <div className="rl-skel" style={{ width: w, height: h, borderRadius: r, flex: "none" }} />;
}

/** Rewrites `@[Name](id)` mention tokens into markdown links on a private scheme, so a single markdown pass renders both. */
function toMarkdownSource(text: string): string {
  return parseMentions(text)
    .map((seg) => (seg.type === "mention" ? `[@${seg.name}](rally-mention:${seg.userId})` : seg.value))
    .join("");
}

/** Renders markdown (GFM) with `@mention` tokens highlighted instead of linked. Used for descriptions, comments, and chat. */
function Markdown({ text }: { text: string }) {
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

function isOverdue(task: { dueDate: string | null; status: StatusKey }): boolean {
  if (!task.dueDate || task.status === "done") return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Clickable task preview used to unfurl a pasted task link in chat, and to give a task-related notification a quick-open target. */
function TaskCard({ task, onOpen }: { task: { title: string; status: StatusKey }; onOpen: () => void }) {
  const statusInfo = STATUSES.find((s) => s.key === task.status) ?? STATUSES[0];
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
        border: "1px solid oklch(0.88 0.006 60)",
        borderRadius: 10,
        padding: "10px 12px",
        background: "oklch(0.985 0.004 60)",
        cursor: "pointer",
        width: "100%",
        maxWidth: 320,
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusInfo.color, flex: "none" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)" }}>{statusInfo.label}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.22 0.01 60)" }}>{task.title}</div>
    </button>
  );
}

const TASK_LINK_RE = /\?task=([a-zA-Z0-9]+)/;

/** Renders chat message text, unfurling a pasted task link (?task=<id>) into a TaskCard instead of a raw URL. */
function ChatMessageBody({ text, findTask, onOpenTask }: { text: string; findTask: (id: string) => { title: string; status: StatusKey } | undefined; onOpenTask: (id: string) => void }) {
  const match = text.match(TASK_LINK_RE);
  const task = match ? findTask(match[1]) : undefined;
  if (!match || !task) return <Markdown text={text} />;

  const remaining = text
    .split(/\s+/)
    .filter((word) => !word.includes(match[0]))
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {remaining && <Markdown text={remaining} />}
      <TaskCard task={task} onOpen={() => onOpenTask(match[1])} />
    </div>
  );
}

/** Overlapping avatar stack for multi-assignee display; shows a dashed placeholder when unassigned. */
function AvatarStack({ avatars, size, fontSize }: { avatars: UiAvatar[]; size: number; fontSize: number }) {
  if (avatars.length === 0) {
    return <div style={{ width: size, height: size, borderRadius: "50%", border: "1.5px dashed oklch(0.8 0.006 60)", flex: "none" }} />;
  }
  const shown = avatars.slice(0, 3);
  const extra = avatars.length - shown.length;
  const overlap = Math.round(size * 0.35);
  return (
    <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
      {shown.map((a, i) => (
        <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -overlap, borderRadius: "50%", border: "2px solid #fff" }}>
          <AvatarCircle a={a} size={size} fontSize={fontSize} />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -overlap,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "oklch(0.88 0.006 60)",
            color: "oklch(0.4 0.01 60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(8, fontSize - 1),
            fontWeight: 700,
            border: "2px solid #fff",
            flex: "none",
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

/** Text/number/date custom-field value editor with an explicit Save button (only enabled once the draft differs from the saved value). */
function CustomFieldValueEditor({ type, value, onSave }: { type: "TEXT" | "NUMBER" | "DATE"; value: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== value;

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, gap: 6 }}>
      <input
        type={type === "NUMBER" ? "number" : type === "DATE" ? "date" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        style={{ flex: 1, fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", fontFamily: "inherit" }}
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          style={{ flex: "none", fontSize: 11.5, fontWeight: 700, padding: "0 10px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          Save
        </button>
      )}
    </div>
  );
}

/** A text input with "@" autocomplete that inserts a `@[Name](id)` mention token. */
function MentionComposer({
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
              <AvatarCircle a={m} size={20} fontSize={9} />
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shows `loading` for `ms` after `key` changes — stands in for a real fetch's pending state. */
function useDelayedLoading(key: string, ms: number): boolean {
  const [state, setState] = useState({ key, loading: true });
  if (state.key !== key) {
    setState({ key, loading: true });
  }
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s.key === key ? { ...s, loading: false } : s)), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return state.loading;
}

/* ---------- skeletons ---------- */

function BoardSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: 20, overflow: "hidden" }}>
      {[0, 1, 2, 3].map((c) => (
        <div key={c} style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <Skel w={90} h={14} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <Skel w={60} h={16} r={999} />
                <Skel w="80%" h={14} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Skel w={50} h={16} r={999} />
                  <Skel w={40} h={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div style={{ flex: 1, overflow: "hidden", padding: "8px 20px 20px", display: "flex", flexDirection: "column", gap: 1 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderTop: i ? "1px solid oklch(0.93 0.006 60)" : "none" }}>
          <Skel w={8} h={8} r={999} />
          <Skel w={`${45 + ((i * 13) % 35)}%`} h={13} />
          <div style={{ flex: 1 }} />
          <Skel w={22} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div style={{ flex: 1, overflow: "hidden", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          <Skel w={28} h={28} r={999} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w={100} h={12} />
            <Skel w={220} h={13} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskPanelSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Skel w="70%" h={20} />
      <div style={{ display: "flex", gap: 6 }}>
        <Skel w={50} h={18} r={999} />
      </div>
      <Skel w="100%" h={90} r={10} />
      <Skel w="100%" h={50} />
      <Skel w="100%" h={30} />
    </div>
  );
}

function AppSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100%", background: "oklch(0.985 0.004 60)" }}>
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid oklch(0.9 0.006 60)", background: "#fff" }}>
        <Skel w={26} h={26} r={7} />
        <Skel w={70} h={16} />
        <div style={{ flex: 1 }} />
        <Skel w={32} h={32} r={999} />
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div className="rl-sidebar" style={{ width: 260, flex: "none", flexDirection: "column", borderRight: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", padding: 16, gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={30} r={8} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <BoardSkeleton />
        </div>
      </div>
    </div>
  );
}

/* ---------- app ---------- */

export default function RallyApp({ workspaceName, currentUser, currentUserEmail, isGuestRole, role, spaces, sharedLists, members, allMembers, channels, pendingInvites, notifications, slackWebhookUrl, notificationPrefs }: RallyAppProps) {
  const bootLoading = useDelayedLoading("boot", 500);

  const [activeSpaceId, setActiveSpaceId] = useState<string>(spaces[0]?.id ?? "");
  const [activeContext, setActiveContext] = useState<"tasks" | "chat" | "manage" | "settings">("tasks");
  const [activeView, setActiveView] = useState<"board" | "list" | "sprint">("board");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskEditMode, setTaskEditMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatSidebarExpanded, setChatSidebarExpanded] = useState(false);
  const [activeChannel, setActiveChannel] = useState(channels[0]?.id ?? "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [postingMessage, setPostingMessage] = useState(false);
  const [savingField, setSavingField] = useState<"status" | "priority" | "due" | "desc" | "title" | "assignee" | null>(null);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [fieldFormListId, setFieldFormListId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<UiCustomField["type"]>("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [creatingField, setCreatingField] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<"backlog" | "sprint" | null>(null);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "GUEST">("MEMBER");
  const [inviteSpaceId, setInviteSpaceId] = useState("");
  const [inviteListId, setInviteListId] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [addMemberSelection, setAddMemberSelection] = useState<Record<string, string>>({});
  const [showListForm, setShowListForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListIsSprint, setNewListIsSprint] = useState(false);
  const [newListStart, setNewListStart] = useState("");
  const [newListEnd, setNewListEnd] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [editingDescTaskId, setEditingDescTaskId] = useState<string | null>(null);
  const [taskPanelError, setTaskPanelError] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<UiMessage | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [slackWebhookInput, setSlackWebhookInput] = useState(slackWebhookUrl ?? "");
  const [savingSlack, setSavingSlack] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [manageSpaceId, setManageSpaceId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"profile" | "notifications">("profile");
  const [profileNameInput, setProfileNameInput] = useState(currentUser.name);
  const [savingProfileName, setSavingProfileName] = useState(false);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIF_PREF_DEFS.map((d) => [d.key, notificationPrefs?.[d.key] !== false]))
  );

  const isGuest = isGuestRole;
  const canManage = !isGuest && (role === "OWNER" || role === "ADMIN");

  const selectSpace = (id: string) => {
    setActiveSpaceId(id);
    setActiveContext("tasks");
    setDrawerOpen(false);
  };
  const openSpaceSettings = (id: string) => {
    setManageSpaceId(id);
    setActiveContext("manage");
    setDrawerOpen(false);
  };
  const selectContext = (key: typeof activeContext) => {
    setActiveContext(key);
    setDrawerOpen(false);
    setManageSpaceId(null);
  };
  const openTask = (id: string) => {
    setSelectedTaskId(id);
    setCommentBody("");
    setEditingDescTaskId(null);
    setTaskPanelError(null);
    setTaskEditMode(false);
  };
  const closeTask = () => setSelectedTaskId(null);
  const toggleDrawer = () => setDrawerOpen((d) => !d);
  const selectChannel = (key: string) => {
    setActiveChannel(key);
    setMessageBody("");
    setReplyingTo(null);
    setChatError(null);
    setActiveContext("chat");
    setDrawerOpen(false);
    markChannelRead(key);
  };

  const showTasks = isGuest || activeContext === "tasks";
  const showChat = !isGuest && activeContext === "chat";
  const showManage = canManage && activeContext === "manage";
  const showSettings = !isGuest && activeContext === "settings";

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const spaceMembers = activeSpace?.members ?? members;
  const allLists = spaces.flatMap((s) => s.lists.map((l) => ({ id: l.id, label: `${s.name} / ${l.name}` })));
  const guestLists = useMemo(() => (isGuestRole ? sharedLists : []), [isGuestRole, sharedLists]);
  const tasksInSpace = isGuest ? guestLists.flatMap((l) => l.tasks) : activeSpace?.lists.flatMap((l) => l.tasks) ?? [];

  // Flat lookup across every space/list this user can see, so a task link (chat unfurl,
  // notification card, or the ?task= deep link) can be opened regardless of which space is active.
  const { taskById, taskSpaceById, listById } = useMemo(() => {
    const byId = new Map<string, UiTask>();
    const spaceById = new Map<string, string>();
    const listMap = new Map<string, UiList>();
    for (const s of spaces) for (const l of s.lists) {
      listMap.set(l.id, l);
      for (const t of l.tasks) {
        byId.set(t.id, t);
        spaceById.set(t.id, s.id);
      }
    }
    for (const l of guestLists) {
      listMap.set(l.id, l);
      for (const t of l.tasks) byId.set(t.id, t);
    }
    return { taskById: byId, taskSpaceById: spaceById, listById: listMap };
  }, [spaces, guestLists]);

  const openTaskGlobal = (id: string) => {
    const spaceId = taskSpaceById.get(id);
    if (spaceId) setActiveSpaceId(spaceId);
    setActiveContext("tasks");
    setDrawerOpen(false);
    openTask(id);
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    if (!id) return;
    const t = setTimeout(() => {
      openTaskGlobal(id);
      window.history.replaceState(null, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(t);
    // Only ever needs to run once on mount, to consume a shared/deep-linked URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sprintLists = isGuest ? [] : activeSpace?.lists.filter((l) => l.isSprint) ?? [];
  const sprintList = isGuest ? guestLists[0] : sprintLists.find((l) => l.id === selectedSprintId) ?? sprintLists[0];
  const targetList = isGuest ? guestLists[0] : activeSpace?.lists.find((l) => l.isSprint) ?? activeSpace?.lists[0];

  async function handleCreateTask() {
    const title = newTaskTitle.trim();
    if (!title || !targetList) return;
    setAddingTask(true);
    try {
      await createTask(targetList.id, title);
      setNewTaskTitle("");
    } finally {
      setAddingTask(false);
    }
  }

  async function handleStatusChange(taskId: string, status: StatusKey) {
    setSavingField("status");
    try {
      await updateTaskStatus(taskId, status);
    } finally {
      setSavingField(null);
    }
  }

  async function handlePriorityChange(taskId: string, priority: PriorityKey) {
    setSavingField("priority");
    try {
      await updateTaskPriority(taskId, priority);
    } finally {
      setSavingField(null);
    }
  }

  async function handleAddAssignee(taskId: string, userId: string) {
    setSavingField("assignee");
    setTaskPanelError(null);
    try {
      await addTaskAssignee(taskId, userId);
    } catch (err) {
      setTaskPanelError(err instanceof Error ? err.message : "Couldn't add assignee");
    } finally {
      setSavingField(null);
    }
  }

  async function handleRemoveAssignee(taskId: string, userId: string) {
    setSavingField("assignee");
    try {
      await removeTaskAssignee(taskId, userId);
    } finally {
      setSavingField(null);
    }
  }

  async function handleAddChecklistItem(taskId: string) {
    const text = newChecklistText.trim();
    if (!text) return;
    setNewChecklistText("");
    await addChecklistItem(taskId, text);
  }

  async function handleToggleChecklistItem(itemId: string, done: boolean) {
    await toggleChecklistItem(itemId, done);
  }

  async function handleDeleteChecklistItem(itemId: string) {
    await deleteChecklistItem(itemId);
  }

  async function handleCreateCustomField(listId: string) {
    const name = newFieldName.trim();
    if (!name) return;
    setCreatingField(true);
    try {
      const options = newFieldType === "DROPDOWN" ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : [];
      await createCustomField(listId, name, newFieldType, options);
      setNewFieldName("");
      setNewFieldOptions("");
      setFieldFormListId(null);
    } finally {
      setCreatingField(false);
    }
  }

  async function handleDeleteCustomField(fieldId: string) {
    if (!confirm("Delete this field? Its values on every task will be removed.")) return;
    await deleteCustomField(fieldId);
  }

  async function handleSetCustomFieldValue(taskId: string, fieldId: string, value: string) {
    await setCustomFieldValue(taskId, fieldId, value);
  }

  async function handleAddDependency(taskId: string, dependsOnId: string) {
    setTaskPanelError(null);
    try {
      await addTaskDependency(taskId, dependsOnId);
    } catch (err) {
      setTaskPanelError(err instanceof Error ? err.message : "Couldn't add dependency");
    }
  }

  async function handleRemoveDependency(taskId: string, dependsOnId: string) {
    await removeTaskDependency(taskId, dependsOnId);
  }

  async function handleUploadAttachment(taskId: string, file: File | null) {
    if (!file) return;
    setUploadingAttachment(true);
    setTaskPanelError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await uploadAttachment(taskId, formData);
    } catch (err) {
      setTaskPanelError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    await deleteAttachment(attachmentId);
  }

  async function handleStartDm(userId: string) {
    setShowDmPicker(false);
    setChatError(null);
    try {
      const channelId = await getOrCreateDirectChannel(userId);
      selectChannel(channelId);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Couldn't start conversation");
    }
  }

  async function handleSaveSlackWebhook() {
    setSavingSlack(true);
    setSlackError(null);
    try {
      await updateSlackWebhook(slackWebhookInput);
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : "Couldn't save Slack webhook");
    } finally {
      setSavingSlack(false);
    }
  }

  function handleDrop(status: StatusKey) {
    setDragOverStatus(null);
    const taskId = draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;
    const task = tasksInSpace.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    handleStatusChange(taskId, status);
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    closeTask();
    await deleteTask(taskId);
  }

  async function handleDueDateChange(taskId: string, dueDate: string) {
    setSavingField("due");
    try {
      await updateTaskDueDate(taskId, dueDate || null);
    } finally {
      setSavingField(null);
    }
  }

  async function handleDescriptionBlur(taskId: string, description: string) {
    setSavingField("desc");
    try {
      await updateTaskDescription(taskId, description);
    } finally {
      setSavingField(null);
    }
  }

  async function handlePostComment() {
    const body = commentBody.trim();
    if (!body || !selectedTask) return;
    setPostingComment(true);
    try {
      await postComment(selectedTask.id, body);
      setCommentBody("");
    } finally {
      setPostingComment(false);
    }
  }

  async function handleSendMessage() {
    const body = messageBody.trim();
    if (!body || !activeChannel || postingMessage) return;
    setPostingMessage(true);
    try {
      await postMessage(activeChannel, body, replyingTo?.id);
      setMessageBody("");
      if (replyingTo) setExpandedThreads((s) => new Set(s).add(replyingTo.id));
      setReplyingTo(null);
    } finally {
      setPostingMessage(false);
    }
  }

  async function handleCreateSpace() {
    const name = newSpaceName.trim();
    if (!name || creatingSpace) return;
    setCreatingSpace(true);
    try {
      await createSpace(name);
      setNewSpaceName("");
    } finally {
      setCreatingSpace(false);
    }
  }

  async function handleCreateInvite() {
    const email = inviteEmail.trim();
    if (!email || creatingInvite) return;
    if (inviteRole === "MEMBER" && !inviteSpaceId) return;
    if (inviteRole === "GUEST" && !inviteListId) return;
    setCreatingInvite(true);
    try {
      const result = await createInvite({
        email,
        role: inviteRole,
        spaceId: inviteRole !== "GUEST" ? inviteSpaceId || undefined : undefined,
        listId: inviteRole === "GUEST" ? inviteListId : undefined,
      });
      setInviteLink(result?.url ?? null);
      setInviteEmail("");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleAddMember(spaceId: string) {
    const userId = addMemberSelection[spaceId];
    if (!userId) return;
    await assignToSpace(spaceId, userId);
    setAddMemberSelection((s) => ({ ...s, [spaceId]: "" }));
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name || !activeSpace || creatingList) return;
    setCreatingList(true);
    try {
      await createList(activeSpace.id, name, newListIsSprint, newListStart || undefined, newListEnd || undefined);
      setNewListName("");
      setNewListIsSprint(false);
      setNewListStart("");
      setNewListEnd("");
      setShowListForm(false);
    } finally {
      setCreatingList(false);
    }
  }

  async function handleOpenNotification(n: UiNotification) {
    setNotifOpen(false);
    if (!n.read) await markNotificationRead(n.id);
    if (n.taskId) openTaskGlobal(n.taskId);
  }

  async function handleSetMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
    setSavingRole(userId);
    try {
      await setMemberRole(userId, role);
    } finally {
      setSavingRole(null);
    }
  }

  async function handleCreateSprint() {
    const name = newSprintName.trim();
    if (!name || !activeSpace || creatingSprint) return;
    setCreatingSprint(true);
    try {
      await createList(activeSpace.id, name, true, newSprintStart || undefined, newSprintEnd || undefined);
      setNewSprintName("");
      setNewSprintStart("");
      setNewSprintEnd("");
      setShowSprintForm(false);
    } finally {
      setCreatingSprint(false);
    }
  }

  async function handleMoveTask(taskId: string, listId: string) {
    await moveTaskToList(taskId, listId);
  }

  async function handleSaveTitle(taskId: string, title: string) {
    if (!title.trim()) return;
    setSavingField("title");
    try {
      await updateTaskTitle(taskId, title);
    } finally {
      setSavingField(null);
    }
  }

  async function handleSaveProfileName() {
    const name = profileNameInput.trim();
    if (!name || savingProfileName) return;
    setSavingProfileName(true);
    try {
      await updateProfileName(name);
    } finally {
      setSavingProfileName(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError("New passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(currentPasswordInput, newPasswordInput);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setPasswordFormOpen(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't change password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleToggleNotifPref(key: string) {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    await updateNotificationPrefs(next);
  }

  const tasksLoading = useDelayedLoading(`${activeSpaceId}:${activeView}:${isGuest}`, 350);
  const chatLoading = useDelayedLoading(activeChannel, 300);
  const taskDetailLoading = useDelayedLoading(`task:${selectedTaskId}`, 300);

  const boardColumns = STATUSES.map((st) => ({
    key: st.key,
    label: st.label,
    tasks: tasksInSpace.filter((t) => t.status === st.key),
  }));

  const sprintTasks = sprintList?.tasks ?? [];
  const sprintDone = sprintTasks.filter((t) => t.status === "done").length;
  const sprintInfo = {
    name: sprintList?.name ?? "No sprint yet",
    done: sprintDone,
    total: sprintTasks.length,
    pct: sprintTasks.length ? Math.round((sprintDone / sprintTasks.length) * 100) : 0,
  };
  const backlogList = isGuest ? undefined : activeSpace?.lists.find((l) => !l.isSprint);
  const backlogTasks = isGuest ? [] : activeSpace?.lists.filter((l) => !l.isSprint).flatMap((l) => l.tasks) ?? [];

  const selectedTask = selectedTaskId ? tasksInSpace.find((t) => t.id === selectedTaskId) ?? null : null;

  const spaceRows = spaces.map((sp) => {
    const active = sp.id === activeSpaceId && !isGuest;
    const listLabel = sp.lists.length === 1 ? sp.lists[0].name : `${sp.lists.length} lists`;
    return {
      ...sp,
      listLabel,
      initial: sp.name.charAt(0),
      rowBg: active ? ACCENT_BG : "transparent",
      rowColor: active ? ACCENT_FG : "oklch(0.3 0.01 60)",
    };
  });

  const chatItems = channels.map((c) => {
    const active = !isGuest && activeContext === "chat" && c.id === activeChannel;
    const unread = active ? 0 : c.unread;
    return { key: c.id, isDirect: c.isDirect, unread, displayName: c.isDirect ? c.name : "#" + c.name, rowBg: active ? ACCENT_BG : "transparent", rowColor: active ? ACCENT_FG : "oklch(0.3 0.01 60)" };
  });
  const chatPreviewItems = chatSidebarExpanded ? chatItems : chatItems.slice(0, 5);
  const chatHasMore = !chatSidebarExpanded && chatItems.length > 5;
  const dmCandidates = members.filter((m) => m.id !== currentUser.id);

  const channelName = chatItems.find((c) => c.key === activeChannel)?.displayName ?? "";
  const activeMessages = channels.find((c) => c.id === activeChannel)?.messages ?? [];
  const rootMessages = activeMessages.filter((m) => !m.parentMessageId);
  const repliesByParent = new Map<string, UiMessage[]>();
  for (const m of activeMessages) {
    if (!m.parentMessageId) continue;
    const list = repliesByParent.get(m.parentMessageId) ?? [];
    list.push(m);
    repliesByParent.set(m.parentMessageId, list);
  }

  const tabStyle = (key: typeof activeView) => ({
    bg: activeView === key ? "#fff" : "transparent",
    color: activeView === key ? "oklch(0.68 0.16 35)" : MUTED_FG,
  });
  const boardTab = tabStyle("board");
  const listTab = tabStyle("list");
  const sprintTab = tabStyle("sprint");

  const navColor = (ctx: typeof activeContext) => (!isGuest && activeContext === ctx ? "oklch(0.68 0.16 35)" : NEUTRAL_FG);

  const manageSpace = manageSpaceId ? spaces.find((s) => s.id === manageSpaceId) ?? null : null;
  const viewLabel = activeView === "sprint" ? sprintInfo.name : activeView === "list" ? "List" : "Board";
  const crumbs: { label: string; onClick?: () => void }[] = showChat
    ? [{ label: "Chat" }]
    : showSettings
    ? [{ label: "Settings" }]
    : showManage
    ? manageSpace
      ? [{ label: manageSpace.name, onClick: () => setManageSpaceId(null) }, { label: "Settings" }]
      : [{ label: "Admin console" }]
    : isGuest
    ? [{ label: "Shared with you" }]
    : [{ label: activeSpace?.name ?? "", onClick: () => selectContext("tasks") }, { label: viewLabel }];

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  if (bootLoading) {
    return <AppSkeleton />;
  }

  const chatSidebarSection = (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 4px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Chat</div>
        <button
          onClick={() => setShowDmPicker((v) => !v)}
          title="Start a direct message"
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 700, color: "oklch(0.55 0.01 60)", lineHeight: 1, padding: "0 4px" }}
        >
          +
        </button>
      </div>
      {showDmPicker && (
        <select
          value=""
          onChange={(e) => e.target.value && handleStartDm(e.target.value)}
          style={{ margin: "0 8px 6px", fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
        >
          <option value="">Message someone&hellip;</option>
          {dmCandidates.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}
      {chatPreviewItems.map((ch) => (
        <button
          key={ch.key}
          onClick={() => selectChannel(ch.key)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: ch.rowBg }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "oklch(0.9 0.006 60)", flex: "none" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: ch.rowColor, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.displayName}</div>
          {ch.unread > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, background: "oklch(0.68 0.16 35)", color: "#fff", borderRadius: 999, padding: "1px 6px", flex: "none" }}>{ch.unread}</div>
          )}
        </button>
      ))}
      {chatItems.length === 0 && <div style={{ fontSize: 12, color: MUTED_FG, padding: "0 8px" }}>No conversations yet.</div>}
      {chatHasMore && (
        <button onClick={() => setChatSidebarExpanded(true)} style={{ textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", fontSize: 12, fontWeight: 700, color: "oklch(0.5 0.14 240)", cursor: "pointer" }}>
          View more
        </button>
      )}
      {chatError && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "6px 8px", margin: "4px 8px 0" }}>
          {chatError}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100%",
        background: "oklch(0.985 0.004 60)",
        fontFamily: "var(--font-manrope), system-ui, sans-serif",
        color: "oklch(0.22 0.01 60)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* top bar */}
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid oklch(0.9 0.006 60)", background: "#fff" }}>
        {!isGuest && (
          <button
            className="rl-hamburger-btn"
            onClick={toggleDrawer}
            style={{ display: "none", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", flexDirection: "column", gap: 3 }}
          >
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
          </button>
        )}
        <Image src="/logo-black.png" alt="Rally" width={2029} height={775} priority style={{ height: "auto", width: 80, flex: "none", maxWidth: 2029, maxHeight: 775   }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 6, borderLeft: "1px solid oklch(0.9 0.006 60)", marginLeft: 2, minWidth: 0, overflow: "hidden" }}>
          {!isGuest && (
            <>
              <button
                onClick={() => selectContext("tasks")}
                style={{ border: "none", background: "transparent", padding: 0, fontSize: 13.5, fontWeight: 600, color: "oklch(0.5 0.01 60)", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {workspaceName}
              </button>
              <div style={{ fontSize: 13, color: "oklch(0.75 0.006 60)" }}>/</div>
            </>
          )}
          {crumbs.map((crumb, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {crumb.onClick ? (
                <button onClick={crumb.onClick} style={{ border: "none", background: "transparent", padding: 0, fontSize: 13.5, fontWeight: 600, color: "oklch(0.5 0.01 60)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {crumb.label}
                </button>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.25 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{crumb.label}</div>
              )}
              {i < crumbs.length - 1 && <div style={{ fontSize: 13, color: "oklch(0.75 0.006 60)" }}>/</div>}
            </div>
          ))}
        </div>
        {isGuest && (
          <div style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "oklch(0.9 0.05 35)", color: "oklch(0.4 0.12 35)", flex: "none" }}>GUEST</div>
        )}
        <div style={{ flex: 1 }} />
        {!isGuest && (
          <div style={{ position: "relative", flex: "none" }}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Notifications"
              style={{ position: "relative", width: 36, height: 36, borderRadius: 8, border: "none", background: notifOpen ? "oklch(0.95 0.006 60)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ width: 16, height: 16, borderRadius: "50% 50% 8px 8px", border: "2px solid oklch(0.35 0.01 60)" }} />
              {unreadNotifCount > 0 && (
                <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "oklch(0.62 0.19 25)", border: "1.5px solid #fff" }} />
              )}
            </button>
            {notifOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 45 }} onClick={() => setNotifOpen(false)} />
                <div style={{ position: "absolute", top: 44, right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", border: "1px solid oklch(0.9 0.006 60)", borderRadius: 12, boxShadow: "0 12px 32px oklch(0 0 0 / 0.14)", zIndex: 46, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 10px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>Notifications</div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={() => markAllNotificationsRead()}
                        style={{ border: "none", background: "transparent", color: "oklch(0.5 0.14 240)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px 8px", textAlign: "center", fontSize: 12.5, color: "oklch(0.55 0.01 60)" }}>You&apos;re all caught up</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleOpenNotification(n)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: n.read ? "transparent" : "oklch(0.97 0.006 60)" }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, background: n.read ? "oklch(0.85 0.006 60)" : "oklch(0.68 0.16 35)", flex: "none" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontSize: 13, color: "oklch(0.25 0.01 60)", lineHeight: 1.4 }}>{n.text}</div>
                          <div style={{ fontSize: 11, color: "oklch(0.55 0.01 60)" }}>{n.time}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <div style={{ position: "relative", flex: "none" }}>
          <button
            onClick={() => setProfileMenuOpen((v) => !v)}
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <AvatarCircle a={currentUser} size={32} fontSize={12} />
            {!isGuest && <div style={{ fontSize: 11, color: "oklch(0.6 0.01 60)" }}>&#9662;</div>}
          </button>
          {profileMenuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 45 }} onClick={() => setProfileMenuOpen(false)} />
              <div style={{ position: "absolute", top: 44, right: 0, width: 220, background: "#fff", border: "1px solid oklch(0.9 0.006 60)", borderRadius: 12, boxShadow: "0 12px 32px oklch(0 0 0 / 0.14)", zIndex: 46, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid oklch(0.93 0.006 60)", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
                  {!isGuest && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUserEmail}</div>}
                </div>
                {!isGuest && (
                  <button
                    onClick={() => {
                      setActiveContext("settings");
                      setProfileMenuOpen(false);
                    }}
                    style={{ textAlign: "left", border: "none", background: "transparent", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.28 0.01 60)", cursor: "pointer" }}
                  >
                    Settings
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => {
                      setActiveContext("manage");
                      setManageSpaceId(null);
                      setProfileMenuOpen(false);
                    }}
                    style={{ textAlign: "left", border: "none", background: "transparent", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.28 0.01 60)", cursor: "pointer" }}
                  >
                    Admin console
                  </button>
                )}
                <div style={{ height: 1, background: "oklch(0.93 0.006 60)", margin: "4px 0" }} />
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  style={{ textAlign: "left", border: "none", background: "transparent", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.55 0.16 25)", cursor: "pointer" }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* sidebar */}
        <div className="rl-sidebar" style={{ width: 260, flex: "none", flexDirection: "column", borderRight: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", padding: "16px 12px", gap: 18, overflowY: "auto" }}>
          {!isGuest && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)", letterSpacing: "0.04em", padding: "0 8px" }}>{workspaceName.toUpperCase()}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Spaces</div>
                {spaceRows.map((sp) => (
                  <div key={sp.id} style={{ display: "flex", alignItems: "center", borderRadius: 8, background: sp.rowBg }}>
                    <button
                      onClick={() => selectSpace(sp.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0 }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
                        {sp.initial}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sp.rowColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</div>
                        <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.listLabel}</div>
                      </div>
                    </button>
                    {canManage && (
                      <button
                        onClick={() => openSpaceSettings(sp.id)}
                        title="Space settings"
                        style={{ flex: "none", width: 24, height: 24, marginRight: 4, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "oklch(0.55 0.01 60)", fontSize: 14 }}
                      >
                        &#8942;
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {chatSidebarSection}
            </>
          )}
          {isGuest && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px" }}>Shared with you</div>
              {guestLists.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, background: "oklch(0.93 0.05 35)" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "oklch(0.85 0.08 150)", color: "oklch(0.3 0.1 150)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                    {l.name.charAt(0)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.35 0.12 35)" }}>{l.name}</div>
                </div>
              ))}
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "oklch(0.5 0.01 60)", padding: "0 8px", margin: 0 }}>
                You can view and comment on tasks in this list. Other workspace areas aren&apos;t shared with guests.
              </p>
            </div>
          )}
        </div>

        {/* main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {showTasks && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", borderBottom: "1px solid oklch(0.9 0.006 60)", flex: "none", alignItems: "flex-end" }}>
                <button onClick={() => setActiveView("board")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: boardTab.bg, color: boardTab.color }}>
                  Board
                </button>
                <button onClick={() => setActiveView("list")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: listTab.bg, color: listTab.color }}>
                  List
                </button>
                <button onClick={() => setActiveView("sprint")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: sprintTab.bg, color: sprintTab.color }}>
                  Sprint
                </button>
                <div style={{ flex: 1 }} />
                {!isGuest && (
                  <div style={{ marginBottom: 6, display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setShowListForm((v) => !v)}
                      disabled={!activeSpace}
                      style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", color: "oklch(0.35 0.01 60)", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: activeSpace ? 1 : 0.5 }}
                    >
                      + List
                    </button>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
                      placeholder="New task title"
                      disabled={addingTask}
                      style={{ height: 32, width: 180, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={handleCreateTask}
                      disabled={addingTask || !newTaskTitle.trim() || !targetList}
                      style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, opacity: addingTask || !newTaskTitle.trim() || !targetList ? 0.6 : 1 }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Task
                    </button>
                  </div>
                )}
              </div>

              {showListForm && activeSpace && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", flex: "none" }}>
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="List name"
                    style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "oklch(0.4 0.01 60)" }}>
                    <input type="checkbox" checked={newListIsSprint} onChange={(e) => setNewListIsSprint(e.target.checked)} />
                    Sprint
                  </label>
                  {newListIsSprint && (
                    <>
                      <input type="date" value={newListStart} onChange={(e) => setNewListStart(e.target.value)} style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 8px", fontSize: 12.5, fontFamily: "inherit" }} />
                      <span style={{ fontSize: 12, color: "oklch(0.55 0.01 60)" }}>to</span>
                      <input type="date" value={newListEnd} onChange={(e) => setNewListEnd(e.target.value)} style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 8px", fontSize: 12.5, fontFamily: "inherit" }} />
                    </>
                  )}
                  <button
                    onClick={handleCreateList}
                    disabled={!newListName.trim() || creatingList}
                    style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: !newListName.trim() || creatingList ? 0.6 : 1 }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowListForm(false)}
                    style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: "oklch(0.5 0.01 60)", fontSize: 12.5, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {tasksLoading ? (
                activeView === "board" ? <BoardSkeleton /> : <RowsSkeleton />
              ) : activeView === "board" ? (
                <div style={{ flex: 1, display: "flex", gap: 16, padding: 20, overflowX: "auto", overflowY: "hidden" }}>
                  {boardColumns.map((col) => (
                    <div
                      key={col.key}
                      onDragOver={(e) => {
                        if (!draggedTaskId || isGuest) return;
                        e.preventDefault();
                        setDragOverStatus(col.key);
                      }}
                      onDragLeave={() => setDragOverStatus((s) => (s === col.key ? null : s))}
                      onDrop={(e) => {
                        if (!draggedTaskId || isGuest) return;
                        e.preventDefault();
                        handleDrop(col.key);
                      }}
                      style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, borderRadius: 12, background: dragOverStatus === col.key ? "oklch(0.93 0.05 35)" : "transparent", transition: "background 0.1s" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.4 0.01 60)" }}>{col.label}</div>
                        <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{col.tasks.length}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                        {col.tasks.map((task) => {
                          const priorityInfo = PRIORITY[task.priority];
                          const blockedCount = task.dependsOn.filter((d) => d.status !== "done").length;
                          const overdue = isOverdue(task);
                          return (
                            <button
                              key={task.id}
                              className="rl-taskcard"
                              onClick={() => openTask(task.id)}
                              draggable={!isGuest}
                              onDragStart={(e) => {
                                setDraggedTaskId(task.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggedTaskId(null);
                                setDragOverStatus(null);
                              }}
                              style={{ textAlign: "left", background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 14, cursor: isGuest ? "pointer" : "grab", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 1px 2px oklch(0 0 0 / 0.04)", opacity: draggedTaskId === task.id ? 0.4 : 1 }}
                            >
                              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, color: "oklch(0.2 0.01 60)" }}>{task.title}</div>
                              {blockedCount > 0 && (
                                <Pill bg="oklch(0.9 0.09 25)" fg="oklch(0.4 0.15 25)">
                                  Blocked &times;{blockedCount}
                                </Pill>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>
                                  {priorityInfo.label}
                                </Pill>
                                <span style={{ fontSize: 11.5, fontWeight: overdue ? 700 : 400, color: overdue ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.01 60)" }}>{task.due}</span>
                                <div style={{ flex: 1 }} />
                                <AvatarStack avatars={task.assignees} size={22} fontSize={9.5} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeView === "list" ? (
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <div style={{ flex: 1 }}>Task</div>
                    <div style={{ width: 90 }}>Priority</div>
                    <div style={{ width: 90 }}>Due</div>
                    <div style={{ width: 36 }} />
                  </div>
                  {tasksInSpace.map((task) => {
                    const priorityInfo = PRIORITY[task.priority];
                    const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
                    return (
                      <button
                        key={task.id}
                        onClick={() => openTask(task.id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", borderTop: "1px solid oklch(0.93 0.006 60)", background: "#fff", cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flex: "none" }} />
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.22 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                        </div>
                        <div style={{ width: 90 }}>
                          <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>
                            {priorityInfo.label}
                          </Pill>
                        </div>
                        <div style={{ width: 90, fontSize: 12, fontWeight: isOverdue(task) ? 700 : 400, color: isOverdue(task) ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.01 60)" }}>{task.due}</div>
                        <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>
                          <AvatarStack avatars={task.assignees} size={22} fontSize={9.5} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  {!isGuest && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {sprintLists.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setSelectedSprintId(l.id)}
                          style={{ border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: sprintList?.id === l.id ? "oklch(0.68 0.16 35)" : "oklch(0.93 0.006 60)", color: sprintList?.id === l.id ? "#fff" : "oklch(0.4 0.01 60)" }}
                        >
                          {l.name}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowSprintForm((v) => !v)}
                        style={{ border: "1px dashed oklch(0.75 0.006 60)", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: "transparent", color: "oklch(0.5 0.01 60)" }}
                      >
                        + New sprint
                      </button>
                    </div>
                  )}
                  {showSprintForm && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10, padding: 12 }}>
                      <input
                        value={newSprintName}
                        onChange={(e) => setNewSprintName(e.target.value)}
                        placeholder="Sprint name"
                        style={{ flex: 1, minWidth: 140, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                      />
                      <input type="date" value={newSprintStart} onChange={(e) => setNewSprintStart(e.target.value)} style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit" }} />
                      <span style={{ fontSize: 12, color: "oklch(0.55 0.01 60)" }}>to</span>
                      <input type="date" value={newSprintEnd} onChange={(e) => setNewSprintEnd(e.target.value)} style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit" }} />
                      <button onClick={handleCreateSprint} disabled={!newSprintName.trim() || creatingSprint} style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", height: 34, borderRadius: 8, cursor: "pointer", opacity: !newSprintName.trim() || creatingSprint ? 0.6 : 1 }}>
                        Create
                      </button>
                      <button onClick={() => setShowSprintForm(false)} style={{ border: "none", background: "transparent", color: "oklch(0.5 0.01 60)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {!sprintList ? (
                    <div style={{ fontSize: 13, color: "oklch(0.55 0.01 60)", padding: "20px 4px" }}>
                      {isGuest ? "Nothing shared yet." : "No sprint yet. Click “+ New sprint” above to start one."}
                    </div>
                  ) : (
                    <>
                      <div style={{ background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: "none" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <div style={{ fontSize: 15, fontWeight: 800 }}>{sprintInfo.name}</div>
                          {(sprintList.sprintStart || sprintList.sprintEnd) && (
                            <div style={{ fontSize: 12, color: "oklch(0.5 0.01 60)" }}>
                              {sprintList.sprintStart ?? "?"} &rarr; {sprintList.sprintEnd ?? "?"}
                            </div>
                          )}
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: "oklch(0.92 0.006 60)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 999, background: "oklch(0.68 0.16 35)", width: `${sprintInfo.pct}%` }} />
                        </div>
                        <div style={{ fontSize: 12, color: "oklch(0.5 0.01 60)" }}>
                          {sprintInfo.done} of {sprintInfo.total} tasks done
                        </div>
                      </div>
                      {isGuest ? (
                        sprintTasks.map((task) => {
                          const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
                          const statusLabel = STATUSES.find((s) => s.key === task.status)!.label;
                          return (
                            <button
                              key={task.id}
                              onClick={() => openTask(task.id)}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", borderTop: "1px solid oklch(0.93 0.006 60)", background: "#fff", cursor: "pointer", textAlign: "left" }}
                            >
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flex: "none" }} />
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.22 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                              </div>
                              <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)", width: 120 }}>{statusLabel}</div>
                              <div style={{ width: 90, fontSize: 12, color: "oklch(0.5 0.01 60)" }}>{task.due}</div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rl-sprint-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 280 }}>
                          {(
                            [
                              { key: "backlog" as const, label: "Backlog", tasks: backlogTasks, targetListId: backlogList?.id },
                              { key: "sprint" as const, label: "This sprint", tasks: sprintTasks, targetListId: sprintList.id },
                            ]
                          ).map((col) => (
                            <div
                              key={col.key}
                              onDragOver={(e) => {
                                if (!draggedTaskId || !col.targetListId) return;
                                e.preventDefault();
                                setDragOverColumn(col.key);
                              }}
                              onDragLeave={() => setDragOverColumn((c) => (c === col.key ? null : c))}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverColumn(null);
                                const taskId = draggedTaskId;
                                setDraggedTaskId(null);
                                if (!taskId || !col.targetListId) return;
                                handleMoveTask(taskId, col.targetListId);
                              }}
                              style={{ display: "flex", flexDirection: "column", gap: 8, background: dragOverColumn === col.key ? "oklch(0.93 0.05 35)" : "oklch(0.97 0.006 60)", borderRadius: 12, padding: 12, minHeight: 200, transition: "background 0.1s" }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.45 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", padding: "0 4px" }}>
                                {col.label} &middot; {col.tasks.length}
                              </div>
                              {col.tasks.map((task) => {
                                const priorityInfo = PRIORITY[task.priority];
                                const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
                                return (
                                  <button
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => {
                                      setDraggedTaskId(task.id);
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                      setDraggedTaskId(null);
                                      setDragOverColumn(null);
                                    }}
                                    onClick={() => openTask(task.id)}
                                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10, background: "#fff", cursor: "grab", opacity: draggedTaskId === task.id ? 0.4 : 1 }}
                                  >
                                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flex: "none" }} />
                                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                                    <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>{priorityInfo.label}</Pill>
                                  </button>
                                );
                              })}
                              {col.tasks.length === 0 && (
                                <div style={{ fontSize: 12, color: MUTED_FG, padding: "8px 4px" }}>Nothing here.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showChat && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
                <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid oklch(0.9 0.006 60)" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{channelName}</div>
                </div>
                {chatLoading ? (
                  <ChatSkeleton />
                ) : (
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                    {rootMessages.map((m) => {
                      const replies = repliesByParent.get(m.id) ?? [];
                      const expanded = expandedThreads.has(m.id);
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", gap: 10 }}>
                            <AvatarCircle a={m.author} size={28} fontSize={10.5} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{m.author.name}</div>
                                <div style={{ fontSize: 11, color: "oklch(0.55 0.01 60)" }}>{m.time}</div>
                              </div>
                              <ChatMessageBody text={m.text} findTask={(id) => taskById.get(id)} onOpenTask={openTaskGlobal} />
                              <button
                                onClick={() => setReplyingTo(m)}
                                style={{ alignSelf: "flex-start", border: "none", background: "none", fontSize: 11, fontWeight: 700, color: MUTED_FG, cursor: "pointer", padding: 0 }}
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                          {replies.length > 0 && (
                            <div style={{ marginLeft: 38, display: "flex", flexDirection: "column", gap: 10, borderLeft: "2px solid oklch(0.92 0.006 60)", paddingLeft: 12 }}>
                              {!expanded ? (
                                <button
                                  onClick={() => setExpandedThreads((s) => new Set(s).add(m.id))}
                                  style={{ alignSelf: "flex-start", border: "none", background: "none", fontSize: 11.5, fontWeight: 700, color: "oklch(0.68 0.16 35)", cursor: "pointer", padding: 0 }}
                                >
                                  {replies.length} {replies.length === 1 ? "reply" : "replies"}
                                </button>
                              ) : (
                                replies.map((r) => (
                                  <div key={r.id} style={{ display: "flex", gap: 8 }}>
                                    <AvatarCircle a={r.author} size={22} fontSize={9} />
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.author.name}</div>
                                        <div style={{ fontSize: 10.5, color: "oklch(0.55 0.01 60)" }}>{r.time}</div>
                                      </div>
                                      <ChatMessageBody text={r.text} findTask={(id) => taskById.get(id)} onOpenTask={openTaskGlobal} />
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {replyingTo && (
                  <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderTop: "1px solid oklch(0.9 0.006 60)", fontSize: 12, color: MUTED_FG }}>
                    Replying to <strong>{replyingTo.author.name}</strong>
                    <button onClick={() => setReplyingTo(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 14 }}>
                      &times;
                    </button>
                  </div>
                )}
                <div style={{ flex: "none", display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid oklch(0.9 0.006 60)" }}>
                  <MentionComposer
                    value={messageBody}
                    onChange={setMessageBody}
                    candidates={channels.find((c) => c.id === activeChannel)?.members ?? []}
                    onEnter={handleSendMessage}
                    placeholder={`Message ${channelName} (@ to mention, Markdown supported)`}
                    inputStyle={{ width: "100%", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit" }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageBody.trim() || postingMessage}
                    style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontWeight: 700, cursor: !messageBody.trim() || postingMessage ? "default" : "pointer", opacity: !messageBody.trim() || postingMessage ? 0.5 : 1 }}
                  >
                    &uarr;
                  </button>
                </div>
            </div>
          )}

          {showManage && manageSpace && (
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
              <button
                onClick={() => setManageSpaceId(null)}
                style={{ alignSelf: "flex-start", border: "none", background: "transparent", padding: 0, fontSize: 12.5, fontWeight: 700, color: "oklch(0.5 0.14 240)", cursor: "pointer" }}
              >
                &lsaquo; Admin console
              </button>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{manageSpace.name} settings</div>
                <div style={{ fontSize: 12.5, color: MUTED_FG }}>Members and custom fields for this space only.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Members</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {manageSpace.members.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "oklch(0.96 0.006 60)", borderRadius: 999, padding: "3px 6px 3px 3px" }}>
                      <AvatarCircle a={m} size={20} fontSize={9} />
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                      {m.id !== currentUser.id && (
                        <button
                          onClick={() => removeFromSpace(manageSpace.id, m.id)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "0 2px" }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {(() => {
                  const addable = members.filter((m) => !manageSpace.members.some((sm) => sm.id === m.id));
                  return addable.length > 0 ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        value={addMemberSelection[manageSpace.id] ?? ""}
                        onChange={(e) => setAddMemberSelection((s) => ({ ...s, [manageSpace.id]: e.target.value }))}
                        style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                      >
                        <option value="">Add existing member...</option>
                        {addable.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddMember(manageSpace.id)}
                        disabled={!addMemberSelection[manageSpace.id]}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer", opacity: addMemberSelection[manageSpace.id] ? 1 : 0.5 }}
                      >
                        Add
                      </button>
                    </div>
                  ) : null;
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Custom fields</div>
                {manageSpace.lists.map((list) => (
                  <div key={list.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {manageSpace.lists.length > 1 && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED_FG }}>{list.name}</div>
                    )}
                    {list.customFields.map((field) => (
                      <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{field.name}</div>
                          <div style={{ fontSize: 11, color: MUTED_FG }}>{field.type.toLowerCase()}{field.options.length ? ` · ${field.options.join(", ")}` : ""}</div>
                        </div>
                        <button onClick={() => handleDeleteCustomField(field.id)} style={{ border: "none", background: "transparent", color: "oklch(0.55 0.16 25)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {list.customFields.length === 0 && fieldFormListId !== list.id && (
                      <div style={{ fontSize: 12, color: MUTED_FG }}>No custom fields on this list.</div>
                    )}
                    {fieldFormListId === list.id ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                        <input
                          value={newFieldName}
                          onChange={(e) => setNewFieldName(e.target.value)}
                          placeholder="Field name"
                          style={{ flex: 1, minWidth: 120, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                        />
                        <select
                          value={newFieldType}
                          onChange={(e) => setNewFieldType(e.target.value as UiCustomField["type"])}
                          style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", fontFamily: "inherit" }}
                        >
                          <option value="TEXT">Text</option>
                          <option value="NUMBER">Number</option>
                          <option value="DATE">Date</option>
                          <option value="DROPDOWN">Dropdown</option>
                        </select>
                        {newFieldType === "DROPDOWN" && (
                          <input
                            value={newFieldOptions}
                            onChange={(e) => setNewFieldOptions(e.target.value)}
                            placeholder="Options, comma separated"
                            style={{ flex: 2, minWidth: 180, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                          />
                        )}
                        <button
                          onClick={() => handleCreateCustomField(list.id)}
                          disabled={!newFieldName.trim() || creatingField}
                          style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", borderRadius: 8, cursor: "pointer", opacity: !newFieldName.trim() || creatingField ? 0.6 : 1 }}
                        >
                          Add field
                        </button>
                        <button onClick={() => setFieldFormListId(null)} style={{ border: "none", background: "transparent", color: MUTED_FG, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setFieldFormListId(list.id)}
                        style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, color: "oklch(0.68 0.16 35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        + Add field
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showManage && !manageSpace && (
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
              {role === "OWNER" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Slack notifications</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={slackWebhookInput}
                      onChange={(e) => setSlackWebhookInput(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      style={{ flex: 1, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={handleSaveSlackWebhook}
                      disabled={savingSlack}
                      style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: savingSlack ? 0.6 : 1 }}
                    >
                      Save
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: MUTED_FG, margin: 0, lineHeight: 1.5 }}>
                    Paste a Slack incoming webhook URL to mirror task and comment notifications into a channel. Leave blank to turn it off.
                  </p>
                  {slackError && (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>
                      {slackError}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Spaces</div>
                <div style={{ fontSize: 12.5, color: MUTED_FG, marginTop: -6 }}>Per-space settings (members, custom fields) live inside each space.</div>
                {role === "OWNER" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={newSpaceName}
                      onChange={(e) => setNewSpaceName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateSpace()}
                      placeholder="New space name"
                      style={{ flex: 1, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={handleCreateSpace}
                      disabled={!newSpaceName.trim() || creatingSpace}
                      style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: !newSpaceName.trim() || creatingSpace ? 0.5 : 1 }}
                    >
                      Create
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {spaces.map((sp) => (
                    <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>
                        {sp.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{sp.name}</div>
                        <div style={{ fontSize: 11.5, color: MUTED_FG }}>{sp.members.length} members &middot; {sp.lists.flatMap((l) => l.tasks).length} tasks</div>
                      </div>
                      <button
                        onClick={() => setManageSpaceId(sp.id)}
                        style={{ border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: "pointer", color: "oklch(0.35 0.01 60)" }}
                      >
                        Manage
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {role === "OWNER" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>People</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {allMembers.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: "8px 12px" }}>
                        <AvatarCircle a={m} size={24} fontSize={10} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                        {m.role === "OWNER" || m.id === currentUser.id ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "oklch(0.5 0.01 60)", textTransform: "capitalize" }}>{m.role.toLowerCase()}</span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleSetMemberRole(m.id, e.target.value as "ADMIN" | "MEMBER")}
                            disabled={savingRole === m.id}
                            style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="MEMBER">Member</option>
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Invite someone</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: 12 }}>
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    type="email"
                    placeholder="email@company.com"
                    style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={inviteRole}
                      onChange={(e) => {
                        setInviteRole(e.target.value as typeof inviteRole);
                        setInviteSpaceId("");
                        setInviteListId("");
                      }}
                      style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                    >
                      {role === "OWNER" && <option value="ADMIN">Admin</option>}
                      <option value="MEMBER">Member</option>
                      <option value="GUEST">Guest</option>
                    </select>
                    {inviteRole === "MEMBER" && (
                      <select
                        value={inviteSpaceId}
                        onChange={(e) => setInviteSpaceId(e.target.value)}
                        style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                      >
                        <option value="">Which space?</option>
                        {spaces.map((sp) => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    )}
                    {inviteRole === "ADMIN" && role === "OWNER" && (
                      <select
                        value={inviteSpaceId}
                        onChange={(e) => setInviteSpaceId(e.target.value)}
                        style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                      >
                        <option value="">Which space? (optional, assign later)</option>
                        {spaces.map((sp) => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    )}
                    {inviteRole === "GUEST" && (
                      <select
                        value={inviteListId}
                        onChange={(e) => setInviteListId(e.target.value)}
                        style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                      >
                        <option value="">Which list?</option>
                        {allLists.map((l) => (
                          <option key={l.id} value={l.id}>{l.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    onClick={handleCreateInvite}
                    disabled={!inviteEmail.trim() || creatingInvite || (inviteRole === "MEMBER" && !inviteSpaceId) || (inviteRole === "GUEST" && !inviteListId)}
                    style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: !inviteEmail.trim() || creatingInvite ? 0.5 : 1 }}
                  >
                    Send invite
                  </button>
                  {inviteLink && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "oklch(0.96 0.006 60)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 12, color: "oklch(0.4 0.01 60)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteLink}</div>
                      <CopyButton text={inviteLink} style={{ height: "auto", padding: "4px 10px", border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12 }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Pending invites</div>
                {pendingInvites.length === 0 ? (
                  <div style={{ fontSize: 13, color: "oklch(0.55 0.01 60)" }}>No pending invites.</div>
                ) : (
                  pendingInvites.map((inv) => (
                    <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: "8px 12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
                        <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{inv.role.toLowerCase()}{inv.scope ? ` · ${inv.scope}` : ""}</div>
                      </div>
                      <CopyButton text={inv.url} style={{ height: "auto", padding: "4px 10px", border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12 }} />
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent", color: "oklch(0.5 0.15 25)", cursor: "pointer" }}
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {showSettings && (
            <div style={{ flex: 1, overflowY: "auto", padding: 24, maxWidth: 640 }}>
              <div style={{ display: "flex", gap: 16, marginBottom: 20, borderBottom: "1px solid oklch(0.9 0.006 60)" }}>
                <button
                  onClick={() => setSettingsTab("profile")}
                  style={{ padding: "8px 4px", border: "none", borderBottom: `2px solid ${settingsTab === "profile" ? "oklch(0.68 0.16 35)" : "transparent"}`, background: "transparent", fontSize: 13, fontWeight: 700, color: settingsTab === "profile" ? "oklch(0.25 0.01 60)" : MUTED_FG, cursor: "pointer" }}
                >
                  Profile
                </button>
                <button
                  onClick={() => setSettingsTab("notifications")}
                  style={{ padding: "8px 4px", border: "none", borderBottom: `2px solid ${settingsTab === "notifications" ? "oklch(0.68 0.16 35)" : "transparent"}`, background: "transparent", fontSize: 13, fontWeight: 700, color: settingsTab === "notifications" ? "oklch(0.25 0.01 60)" : MUTED_FG, cursor: "pointer" }}
                >
                  Notifications
                </button>
              </div>
              {settingsTab === "profile" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Name</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        style={{ flex: 1, boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }}
                      />
                      {profileNameInput.trim() !== currentUser.name && (
                        <button
                          onClick={handleSaveProfileName}
                          disabled={!profileNameInput.trim() || savingProfileName}
                          style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", borderRadius: 8, cursor: "pointer", opacity: !profileNameInput.trim() || savingProfileName ? 0.6 : 1 }}
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Email</div>
                    <div style={{ fontSize: 13.5, color: "oklch(0.4 0.01 60)", padding: "9px 12px", background: "oklch(0.97 0.006 60)", borderRadius: 8 }}>{currentUserEmail}</div>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG }}>Password</div>
                      <button
                        onClick={() => {
                          setPasswordFormOpen((v) => !v);
                          setPasswordError(null);
                        }}
                        style={{ border: "none", background: "transparent", color: "oklch(0.5 0.14 240)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                      >
                        {passwordFormOpen ? "Cancel" : "Change password"}
                      </button>
                    </div>
                    {passwordFormOpen && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        <input
                          type="password"
                          value={currentPasswordInput}
                          onChange={(e) => setCurrentPasswordInput(e.target.value)}
                          placeholder="Current password"
                          style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }}
                        />
                        <input
                          type="password"
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="New password"
                          style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }}
                        />
                        <input
                          type="password"
                          value={confirmPasswordInput}
                          onChange={(e) => setConfirmPasswordInput(e.target.value)}
                          placeholder="Confirm new password"
                          style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }}
                        />
                        {passwordError && (
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>
                            {passwordError}
                          </div>
                        )}
                        <button
                          onClick={handleChangePassword}
                          disabled={!currentPasswordInput || !newPasswordInput || savingPassword}
                          style={{ alignSelf: "flex-start", border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer", opacity: !currentPasswordInput || !newPasswordInput || savingPassword ? 0.6 : 1 }}
                        >
                          Update password
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {["Tasks", "Chat"].map((group) => (
                    <div key={group}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{group}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {NOTIF_PREF_DEFS.filter((d) => d.group === group).map((pr) => {
                          const on = notifPrefs[pr.key];
                          return (
                            <div key={pr.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px" }}>
                              <div style={{ fontSize: 13.5, color: "oklch(0.28 0.01 60)" }}>{pr.label}</div>
                              <button
                                onClick={() => handleToggleNotifPref(pr.key)}
                                style={{ width: 40, height: 22, borderRadius: 999, border: "none", background: on ? "oklch(0.68 0.16 35)" : "oklch(0.88 0.006 60)", position: "relative", cursor: "pointer", flex: "none" }}
                              >
                                <div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px oklch(0 0 0 / 0.2)", transition: "left 0.12s" }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isGuest && (
        <div className="rl-bottomnav" style={{ display: "none", flex: "none", height: 60, borderTop: "1px solid oklch(0.9 0.006 60)", background: "#fff", alignItems: "center", justifyContent: "space-around", position: "relative", zIndex: 10 }}>
          <button onClick={() => selectContext("tasks")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: navColor("tasks") }}>
            <div style={{ width: 18, height: 18, border: "2px solid currentColor", borderRadius: 4 }} />
            <div style={{ fontSize: 10, fontWeight: 600 }}>Tasks</div>
          </button>
          <button onClick={() => selectContext("chat")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: navColor("chat") }}>
            <div style={{ width: 18, height: 16, borderRadius: "5px 5px 5px 1px", border: "2px solid currentColor" }} />
            <div style={{ fontSize: 10, fontWeight: 600 }}>Chat</div>
          </button>
          <button onClick={toggleDrawer} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: "oklch(0.4 0.01 60)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>Menu</div>
          </button>
        </div>
      )}

      {!isGuest && drawerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.35)", zIndex: 60, display: "flex" }}>
          <div style={{ width: 280, height: "100%", background: "#fff", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Image src="/logo-black.png" alt="Rally" width={2029} height={775} style={{ height: "auto", width: 80, maxWidth: 2029, maxHeight: 775 }} />
              <button onClick={toggleDrawer} style={{ border: "none", background: "oklch(0.95 0.006 60)", width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer" }}>
                &times;
              </button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)", letterSpacing: "0.04em", padding: "0 8px" }}>{workspaceName.toUpperCase()}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Spaces</div>
              {spaceRows.map((sp) => (
                <div key={sp.id} style={{ display: "flex", alignItems: "center", borderRadius: 8, background: sp.rowBg }}>
                  <button
                    onClick={() => selectSpace(sp.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0 }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
                      {sp.initial}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sp.rowColor }}>{sp.name}</div>
                      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)" }}>{sp.listLabel}</div>
                    </div>
                  </button>
                  {canManage && (
                    <button
                      onClick={() => openSpaceSettings(sp.id)}
                      title="Space settings"
                      style={{ flex: "none", width: 24, height: 24, marginRight: 4, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "oklch(0.55 0.01 60)", fontSize: 14 }}
                    >
                      &#8942;
                    </button>
                  )}
                </div>
              ))}
            </div>
            {chatSidebarSection}
          </div>
          <div style={{ flex: 1 }} onClick={toggleDrawer} />
        </div>
      )}

      {selectedTask && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
          <div className="rl-taskpanel" style={{ width: 440, background: "#fff", height: "100%", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 18, boxShadow: "-8px 0 24px oklch(0 0 0 / 0.08)" }}>
            {taskDetailLoading ? (
              <TaskPanelSkeleton />
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {!isGuest && taskEditMode ? (
                      <input
                        key={selectedTask.id}
                        defaultValue={selectedTask.title}
                        onBlur={(e) => handleSaveTitle(selectedTask.id, e.target.value)}
                        disabled={savingField === "title"}
                        style={{ width: "100%", boxSizing: "border-box", fontSize: 17, fontWeight: 700, lineHeight: 1.35, border: "1px solid oklch(0.6 0.14 240)", borderRadius: 8, padding: "4px 6px", fontFamily: "inherit" }}
                      />
                    ) : (
                      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>{selectedTask.title}</div>
                    )}
                    <div style={{ fontSize: 11.5, color: MUTED_FG }}>Opened by {selectedTask.createdBy.name}</div>
                  </div>
                  {!isGuest && (
                    <button
                      onClick={() => setTaskEditMode((v) => !v)}
                      title={taskEditMode ? "Done editing" : "Edit task"}
                      style={{ border: "none", background: taskEditMode ? "oklch(0.68 0.16 35)" : "oklch(0.95 0.006 60)", color: taskEditMode ? "#fff" : "inherit", padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flex: "none" }}
                    >
                      {taskEditMode ? "Done" : "Edit"}
                    </button>
                  )}
                  <CopyButton text={`${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?task=${selectedTask.id}`} label="Copy link" />
                  {!isGuest && taskEditMode && (
                    <button
                      onClick={() => handleDeleteTask(selectedTask.id)}
                      title="Delete task"
                      style={{ border: "none", background: "oklch(0.95 0.006 60)", padding: "0 10px", height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flex: "none", color: "oklch(0.55 0.18 25)" }}
                    >
                      Delete
                    </button>
                  )}
                  <button onClick={closeTask} style={{ border: "none", background: "oklch(0.95 0.006 60)", width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer", flex: "none" }}>
                    &times;
                  </button>
                </div>
                {taskPanelError && (
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>
                    {taskPanelError}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Assignees</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: !isGuest && taskEditMode ? 6 : 0 }}>
                    {selectedTask.assignees.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "oklch(0.96 0.006 60)", borderRadius: 999, padding: "3px 6px 3px 3px" }}>
                        <AvatarCircle a={a} size={20} fontSize={9} />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</span>
                        {!isGuest && taskEditMode && (
                          <button
                            onClick={() => handleRemoveAssignee(selectedTask.id, a.id)}
                            disabled={savingField === "assignee"}
                            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "0 2px" }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    {selectedTask.assignees.length === 0 && <span style={{ fontSize: 12.5, color: MUTED_FG }}>Unassigned</span>}
                  </div>
                  {!isGuest && taskEditMode && (() => {
                    const addable = spaceMembers.filter((m) => !selectedTask.assignees.some((a) => a.id === m.id));
                    return addable.length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => e.target.value && handleAddAssignee(selectedTask.id, e.target.value)}
                        disabled={savingField === "assignee"}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                      >
                        <option value="">+ Add assignee</option>
                        {addable.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    ) : null;
                  })()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 14, background: "oklch(0.98 0.004 60)", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Priority</div>
                    {isGuest || !taskEditMode ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: PRIORITY[selectedTask.priority].bg, color: PRIORITY[selectedTask.priority].fg }}>{PRIORITY[selectedTask.priority].label}</span>
                    ) : (
                      <select
                        value={selectedTask.priority}
                        onChange={(e) => handlePriorityChange(selectedTask.id, e.target.value as PriorityKey)}
                        disabled={savingField === "priority"}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                      >
                        {(Object.keys(PRIORITY) as PriorityKey[]).map((key) => (
                          <option key={key} value={key}>{PRIORITY[key].label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Due date</div>
                    {isGuest || !taskEditMode ? (
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedTask.due}</div>
                    ) : (
                      <input
                        type="date"
                        key={selectedTask.id}
                        defaultValue={selectedTask.dueDate ?? ""}
                        onChange={(e) => handleDueDateChange(selectedTask.id, e.target.value)}
                        disabled={savingField === "due"}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                      />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Status</div>
                    {isGuest || !taskEditMode ? (
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{STATUSES.find((s) => s.key === selectedTask.status)!.label}</div>
                    ) : (
                      <select
                        value={selectedTask.status}
                        onChange={(e) => handleStatusChange(selectedTask.id, e.target.value as StatusKey)}
                        disabled={savingField === "status"}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Description</div>
                    {!isGuest && taskEditMode && editingDescTaskId !== selectedTask.id && (
                      <button
                        onClick={() => setEditingDescTaskId(selectedTask.id)}
                        style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.68 0.16 35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {isGuest || !taskEditMode || editingDescTaskId !== selectedTask.id ? (
                    selectedTask.desc ? (
                      <Markdown text={selectedTask.desc} />
                    ) : (
                      <div style={{ fontSize: 13.5, color: MUTED_FG }}>No description.</div>
                    )
                  ) : (
                    <textarea
                      key={selectedTask.id}
                      defaultValue={selectedTask.desc}
                      placeholder="Add a description… (Markdown supported)"
                      onBlur={(e) => {
                        handleDescriptionBlur(selectedTask.id, e.target.value);
                        setEditingDescTaskId(null);
                      }}
                      disabled={savingField === "desc"}
                      autoFocus
                      rows={5}
                      style={{ width: "100%", fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.3 0.01 60)", fontFamily: "inherit", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div>
                  {(() => {
                    const done = selectedTask.checklist.filter((c) => c.done).length;
                    const total = selectedTask.checklist.length;
                    return (
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Checklist</div>
                        {total > 0 && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{done}/{total}</div>}
                      </div>
                    );
                  })()}
                  {selectedTask.checklist.length > 0 && (
                    <div style={{ height: 6, borderRadius: 999, background: "oklch(0.92 0.006 60)", overflow: "hidden", marginBottom: 8 }}>
                      <div
                        style={{
                          height: "100%",
                          background: "oklch(0.68 0.16 35)",
                          width: `${Math.round((selectedTask.checklist.filter((c) => c.done).length / selectedTask.checklist.length) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: isGuest ? 0 : 6 }}>
                    {selectedTask.checklist.map((item) => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          disabled={isGuest}
                          onChange={(e) => handleToggleChecklistItem(item.id, e.target.checked)}
                          style={{ cursor: isGuest ? "default" : "pointer" }}
                        />
                        <span style={{ flex: 1, fontSize: 12.5, color: item.done ? MUTED_FG : "oklch(0.3 0.01 60)", textDecoration: item.done ? "line-through" : "none" }}>
                          {item.text}
                        </span>
                        {!isGuest && (
                          <button onClick={() => handleDeleteChecklistItem(item.id)} style={{ border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 13, flex: "none" }}>
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    {selectedTask.checklist.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No checklist items.</div>}
                  </div>
                  {!isGuest && (
                    <input
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddChecklistItem(selectedTask.id);
                      }}
                      placeholder="+ Add checklist item"
                      style={{ width: "100%", fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", fontFamily: "inherit" }}
                    />
                  )}
                </div>
                {(() => {
                  const currentList = listById.get(selectedTask.listId);
                  if (!currentList || currentList.customFields.length === 0) return null;
                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Custom fields</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {currentList.customFields.map((field) => {
                          const value = selectedTask.customFieldValues.find((v) => v.fieldId === field.id)?.value ?? "";
                          return (
                            <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 100, flex: "none", fontSize: 12.5, fontWeight: 600, color: "oklch(0.4 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {field.name}
                              </div>
                              {isGuest || !taskEditMode ? (
                                <div style={{ flex: 1, fontSize: 12.5 }}>{value || <span style={{ color: MUTED_FG }}>—</span>}</div>
                              ) : field.type === "DROPDOWN" ? (
                                <select
                                  value={value}
                                  onChange={(e) => handleSetCustomFieldValue(selectedTask.id, field.id, e.target.value)}
                                  style={{ flex: 1, fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                                >
                                  <option value="">—</option>
                                  {field.options.map((o) => (
                                    <option key={o} value={o}>{o}</option>
                                  ))}
                                </select>
                              ) : (
                                <CustomFieldValueEditor
                                  key={`${selectedTask.id}:${field.id}`}
                                  type={field.type}
                                  value={value}
                                  onSave={(v) => handleSetCustomFieldValue(selectedTask.id, field.id, v)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const dependencyCandidates = tasksInSpace.filter(
                    (t) => t.id !== selectedTask.id && !selectedTask.dependsOn.some((d) => d.id === t.id)
                  );
                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Blocked by</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                        {selectedTask.dependsOn.map((d) => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUSES.find((s) => s.key === d.status)!.color, flex: "none" }} />
                            <button onClick={() => openTask(d.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 12.5, fontWeight: 600, color: "oklch(0.3 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.title}
                            </button>
                            {!isGuest && taskEditMode && (
                              <button onClick={() => handleRemoveDependency(selectedTask.id, d.id)} style={{ border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 13, flex: "none" }}>
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                        {selectedTask.dependsOn.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>Not blocked by anything.</div>}
                      </div>
                      {!isGuest && taskEditMode && dependencyCandidates.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => e.target.value && handleAddDependency(selectedTask.id, e.target.value)}
                          style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                        >
                          <option value="">+ Add blocking task</option>
                          {dependencyCandidates.map((t) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      )}
                      {selectedTask.dependents.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", margin: "12px 0 8px" }}>Blocks</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {selectedTask.dependents.map((d) => (
                              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUSES.find((s) => s.key === d.status)!.color, flex: "none" }} />
                                <button onClick={() => openTask(d.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 12.5, fontWeight: 600, color: "oklch(0.3 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {d.title}
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Attachments ({selectedTask.attachments.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: isGuest ? 0 : 8 }}>
                    {selectedTask.attachments.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 8, padding: "6px 8px" }}>
                        <a
                          href={`/api/attachments/${a.id}`}
                          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "oklch(0.3 0.01 60)" }}
                        >
                          {a.filename}
                        </a>
                        <span style={{ color: MUTED_FG, fontSize: 11, flex: "none" }}>{formatBytes(a.size)}</span>
                        {!isGuest && (
                          <button onClick={() => handleDeleteAttachment(a.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "oklch(0.55 0.18 25)", fontSize: 13, flex: "none" }}>
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    {selectedTask.attachments.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No attachments.</div>}
                  </div>
                  {!isGuest && (
                    <input
                      type="file"
                      onChange={(e) => {
                        handleUploadAttachment(selectedTask.id, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                      disabled={uploadingAttachment}
                      style={{ fontSize: 12 }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Comments ({selectedTask.comments.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 10 }}>
                    {selectedTask.comments.map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8 }}>
                        <AvatarCircle a={c.author} size={24} fontSize={10} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.author.name}</span>
                            <span style={{ fontSize: 11, color: MUTED_FG }}>{c.time}</span>
                          </div>
                          <Markdown text={c.body} />
                        </div>
                      </div>
                    ))}
                    {selectedTask.comments.length === 0 && <div style={{ fontSize: 12.5, color: MUTED_FG }}>No comments yet.</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <MentionComposer
                      value={commentBody}
                      onChange={setCommentBody}
                      candidates={spaceMembers}
                      onEnter={handlePostComment}
                      placeholder="Add a comment… (@ to mention, Markdown supported)"
                      disabled={postingComment}
                      inputStyle={{ width: "100%", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={handlePostComment}
                      disabled={postingComment || !commentBody.trim()}
                      style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: postingComment || !commentBody.trim() ? 0.6 : 1 }}
                    >
                      Post
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
