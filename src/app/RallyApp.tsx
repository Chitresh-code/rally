"use client";

import { useEffect, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import {
  assignToSpace,
  createInvite,
  createList,
  createSpace,
  createTask,
  deleteTask,
  markAllNotificationsRead,
  markNotificationRead,
  postComment,
  postMessage,
  removeFromSpace,
  revokeInvite,
  setMemberRole,
  updateTaskAssignee,
  updateTaskDescription,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
} from "./actions";
import { activeMentionQuery, mentionToken, parseMentions } from "@/lib/mentions";

/* ---------- types (shaped server-side from real Prisma data) ---------- */

export type UiAvatar = { id: string; name: string; initials: string; hue: number };
export type PriorityKey = "urgent" | "high" | "normal" | "low";
export type StatusKey = "todo" | "in_progress" | "review" | "done";
export type RoleKey = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export type UiTask = {
  id: string;
  title: string;
  desc: string;
  status: StatusKey;
  priority: PriorityKey;
  due: string;
  dueDate: string | null;
  assignee: UiAvatar;
  checklist: { done: number; total: number } | null;
  comments: number;
};

export type UiList = { id: string; name: string; isSprint: boolean; sprintStart: string | null; sprintEnd: string | null; tasks: UiTask[] };
export type UiSpace = { id: string; name: string; hue: number; members: UiAvatar[]; lists: UiList[] };
export type UiMessage = { id: string; author: UiAvatar; text: string; time: string };
export type UiChannel = { id: string; name: string; members: UiAvatar[]; messages: UiMessage[] };
export type UiInvite = { id: string; email: string; role: string; scope: string | null; url: string };
export type UiMember = UiAvatar & { role: RoleKey };
export type UiNotification = { id: string; text: string; time: string; read: boolean; taskId: string | null };

export type RallyAppProps = {
  workspaceName: string;
  currentUser: UiAvatar;
  isGuestRole: boolean;
  role: RoleKey;
  spaces: UiSpace[];
  sharedLists: UiList[];
  members: UiAvatar[];
  allMembers: UiMember[];
  channels: UiChannel[];
  pendingInvites: UiInvite[];
  notifications: UiNotification[];
};

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

function Skel({ w, h, r = 6 }: { w: string | number; h: number; r?: number }) {
  return <div className="rl-skel" style={{ width: w, height: h, borderRadius: r, flex: "none" }} />;
}

/** Renders `@[Name](id)` mention tokens as just the name, no "@", highlighted. */
function renderMentionNodes(text: string): ReactNode {
  return parseMentions(text).map((seg, i) =>
    seg.type === "mention" ? (
      <span key={i} style={{ fontWeight: 700, color: "oklch(0.68 0.16 35)" }}>
        {seg.name}
      </span>
    ) : (
      <span key={i}>{seg.value}</span>
    )
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

function NotificationsSkeleton() {
  return (
    <div style={{ flex: 1, overflow: "hidden", padding: 20, display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 12px" }}>
          <Skel w={8} h={8} r={999} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w={280} h={13} />
            <Skel w={70} h={11} />
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

export default function RallyApp({ workspaceName, currentUser, isGuestRole, role, spaces, sharedLists, members, allMembers, channels, pendingInvites, notifications }: RallyAppProps) {
  const bootLoading = useDelayedLoading("boot", 500);

  const [activeSpaceId, setActiveSpaceId] = useState<string>(spaces[0]?.id ?? "");
  const [activeContext, setActiveContext] = useState<"tasks" | "chat" | "notifications" | "manage">("tasks");
  const [activeView, setActiveView] = useState<"board" | "list" | "sprint">("board");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileChatShowList, setMobileChatShowList] = useState(true);
  const [activeChannel, setActiveChannel] = useState(channels[0]?.id ?? "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [postingMessage, setPostingMessage] = useState(false);
  const [savingField, setSavingField] = useState<"status" | "priority" | "due" | "desc" | "assignee" | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);
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
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const isGuest = isGuestRole;
  const canManage = !isGuest && (role === "OWNER" || role === "ADMIN");

  const selectSpace = (id: string) => {
    setActiveSpaceId(id);
    setActiveContext("tasks");
    setDrawerOpen(false);
  };
  const selectContext = (key: typeof activeContext) => {
    setActiveContext(key);
    setDrawerOpen(false);
    setMobileChatShowList(true);
  };
  const openTask = (id: string) => {
    setSelectedTaskId(id);
    setCommentBody("");
  };
  const closeTask = () => setSelectedTaskId(null);
  const toggleDrawer = () => setDrawerOpen((d) => !d);
  const selectChannel = (key: string) => {
    setActiveChannel(key);
    setMessageBody("");
    setMobileChatShowList(false);
  };
  const backToChatList = () => setMobileChatShowList(true);

  const showTasks = isGuest || activeContext === "tasks";
  const showChat = !isGuest && activeContext === "chat";
  const showNotifications = !isGuest && activeContext === "notifications";
  const showManage = canManage && activeContext === "manage";

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const spaceMembers = activeSpace?.members ?? members;
  const allLists = spaces.flatMap((s) => s.lists.map((l) => ({ id: l.id, label: `${s.name} / ${l.name}` })));
  const guestLists = isGuestRole ? sharedLists : [];
  const tasksInSpace = isGuest ? guestLists.flatMap((l) => l.tasks) : activeSpace?.lists.flatMap((l) => l.tasks) ?? [];
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

  async function handleAssigneeChange(taskId: string, userId: string) {
    setSavingField("assignee");
    try {
      await updateTaskAssignee(taskId, userId);
    } finally {
      setSavingField(null);
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
      await postMessage(activeChannel, body);
      setMessageBody("");
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
    if (!n.read) await markNotificationRead(n.id);
  }

  async function handleSetMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
    setSavingRole(userId);
    try {
      await setMemberRole(userId, role);
    } finally {
      setSavingRole(null);
    }
  }

  const tasksLoading = useDelayedLoading(`${activeSpaceId}:${activeView}:${isGuest}`, 350);
  const chatLoading = useDelayedLoading(activeChannel, 300);
  const notifLoading = useDelayedLoading(`notif:${showNotifications}`, 300);
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
    const active = c.id === activeChannel;
    return { key: c.id, displayName: "#" + c.name, rowBg: active ? ACCENT_BG : "transparent", rowColor: active ? ACCENT_FG : "oklch(0.3 0.01 60)" };
  });

  const channelName = chatItems.find((c) => c.key === activeChannel)?.displayName ?? "";
  const activeMessages = channels.find((c) => c.id === activeChannel)?.messages ?? [];

  const tabStyle = (key: typeof activeView) => ({
    bg: activeView === key ? "#fff" : "transparent",
    color: activeView === key ? "oklch(0.68 0.16 35)" : MUTED_FG,
  });
  const boardTab = tabStyle("board");
  const listTab = tabStyle("list");
  const sprintTab = tabStyle("sprint");

  const navColor = (ctx: typeof activeContext) => (!isGuest && activeContext === ctx ? "oklch(0.68 0.16 35)" : NEUTRAL_FG);

  const topTitle = showChat ? "Chat" : showNotifications ? "Notifications" : showManage ? "Manage" : isGuest ? "Shared with you" : `${activeSpace?.name ?? ""}`;
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  if (bootLoading) {
    return <AppSkeleton />;
  }

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
        <div style={{ width: 26, height: 26, borderRadius: 7, background: "oklch(0.68 0.16 35)", flex: "none" }} />
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em", flex: "none" }}>Rally</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.42 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 6, borderLeft: "1px solid oklch(0.9 0.006 60)", marginLeft: 2 }}>
          {topTitle}
        </div>
        {isGuest && (
          <div style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "oklch(0.9 0.05 35)", color: "oklch(0.4 0.12 35)", flex: "none" }}>GUEST</div>
        )}
        <div style={{ flex: 1 }} />
        <AvatarCircle a={currentUser} size={32} fontSize={12} />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.01 60)", background: "transparent", border: "none", cursor: "pointer", flex: "none", padding: "6px 4px" }}
        >
          Sign out
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* sidebar */}
        <div className="rl-sidebar" style={{ width: 260, flex: "none", flexDirection: "column", borderRight: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", padding: "16px 12px", gap: 18, overflowY: "auto" }}>
          {!isGuest && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)", letterSpacing: "0.04em", padding: "0 8px" }}>
                {workspaceName.toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Spaces</div>
                {spaceRows.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => selectSpace(sp.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: sp.rowBg }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
                      {sp.initial}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sp.rowColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</div>
                      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.listLabel}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Team</div>
                <button
                  onClick={() => selectContext("chat")}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: !isGuest && activeContext === "chat" ? ACCENT_BG : "transparent" }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "oklch(0.9 0.006 60)", flex: "none", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 5, borderRadius: "5px 5px 5px 1px", background: "oklch(0.5 0.01 60)" }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: !isGuest && activeContext === "chat" ? ACCENT_FG : "oklch(0.3 0.01 60)", flex: 1 }}>Chat</div>
                </button>
                <button
                  onClick={() => selectContext("notifications")}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: !isGuest && activeContext === "notifications" ? ACCENT_BG : "transparent" }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: "50% 50% 8px 8px", background: "oklch(0.5 0.01 60)", flex: "none" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: !isGuest && activeContext === "notifications" ? ACCENT_FG : "oklch(0.3 0.01 60)", flex: 1 }}>Notifications</div>
                  {unreadNotifCount > 0 && (
                    <div style={{ fontSize: 10.5, fontWeight: 800, background: "oklch(0.68 0.16 35)", color: "#fff", borderRadius: 999, padding: "1px 7px", minWidth: 16, textAlign: "center" }}>{unreadNotifCount}</div>
                  )}
                </button>
                {canManage && (
                  <button
                    onClick={() => selectContext("manage")}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: activeContext === "manage" ? ACCENT_BG : "transparent" }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: "oklch(0.5 0.01 60)", flex: "none" }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: activeContext === "manage" ? ACCENT_FG : "oklch(0.3 0.01 60)", flex: 1 }}>Manage</div>
                  </button>
                )}
              </div>
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
                          return (
                            <button
                              key={task.id}
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
                              style={{ textAlign: "left", background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 12, cursor: isGuest ? "pointer" : "grab", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 1px 2px oklch(0 0 0 / 0.04)", opacity: draggedTaskId === task.id ? 0.4 : 1 }}
                            >
                              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: "oklch(0.22 0.01 60)" }}>{task.title}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>
                                  {priorityInfo.label}
                                </Pill>
                                <span style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)" }}>{task.due}</span>
                                <div style={{ flex: 1 }} />
                                <AvatarCircle a={task.assignee} size={22} fontSize={9.5} />
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
                        <div style={{ width: 90, fontSize: 12, color: "oklch(0.5 0.01 60)" }}>{task.due}</div>
                        <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>
                          <AvatarCircle a={task.assignee} size={22} fontSize={9.5} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                  {!isGuest && sprintLists.length > 1 && (
                    <select
                      value={sprintList?.id ?? ""}
                      onChange={(e) => setSelectedSprintId(e.target.value)}
                      style={{ marginBottom: 12, fontSize: 12.5, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                    >
                      {sprintLists.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  )}
                  {!sprintList ? (
                    <div style={{ fontSize: 13, color: "oklch(0.55 0.01 60)", padding: "20px 4px" }}>
                      {isGuest ? "Nothing shared yet." : "No sprint yet. Click “+ List” above and check “Sprint” to start one."}
                    </div>
                  ) : (
                    <>
                      <div style={{ background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
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
                      {sprintTasks.map((task) => {
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
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showChat && (
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
              <div
                className={`rl-chatlist ${mobileChatShowList ? "" : "rl-hide-mobile"}`}
                style={{ width: 240, flex: "none", borderRight: "1px solid oklch(0.9 0.006 60)", flexDirection: "column", overflowY: "auto", padding: "12px 8px", gap: 2 }}
              >
                {chatItems.map((ch) => (
                  <button
                    key={ch.key}
                    onClick={() => selectChannel(ch.key)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 8, background: ch.rowBg, cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: ch.rowColor, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.displayName}</div>
                  </button>
                ))}
              </div>
              <div className={`rl-chatthread ${mobileChatShowList ? "rl-hide-mobile" : ""}`} style={{ flex: 1, flexDirection: "column", minWidth: 0 }}>
                <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid oklch(0.9 0.006 60)" }}>
                  <button className="rl-mobile-only" onClick={backToChatList} style={{ display: "none", border: "none", background: "transparent", fontSize: 18, cursor: "pointer", padding: "2px 6px 2px 0" }}>
                    &lsaquo;
                  </button>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{channelName}</div>
                </div>
                {chatLoading ? (
                  <ChatSkeleton />
                ) : (
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                    {activeMessages.map((m) => (
                      <div key={m.id} style={{ display: "flex", gap: 10 }}>
                        <AvatarCircle a={m.author} size={28} fontSize={10.5} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{m.author.name}</div>
                            <div style={{ fontSize: 11, color: "oklch(0.55 0.01 60)" }}>{m.time}</div>
                          </div>
                          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "oklch(0.28 0.01 60)" }}>{renderMentionNodes(m.text)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ flex: "none", display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid oklch(0.9 0.006 60)" }}>
                  <MentionComposer
                    value={messageBody}
                    onChange={setMessageBody}
                    candidates={channels.find((c) => c.id === activeChannel)?.members ?? []}
                    onEnter={handleSendMessage}
                    placeholder={`Message ${channelName} (@ to mention)`}
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
            </div>
          )}

          {showNotifications &&
            (notifLoading ? (
              <NotificationsSkeleton />
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
                {unreadNotifCount > 0 && (
                  <button
                    onClick={() => markAllNotificationsRead()}
                    style={{ alignSelf: "flex-end", fontSize: 12, fontWeight: 700, color: "oklch(0.68 0.16 35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length === 0 && <div style={{ fontSize: 13, color: MUTED_FG, padding: "14px 12px" }}>No notifications yet.</div>}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleOpenNotification(n)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 12px", borderRadius: 10, cursor: "pointer", background: n.read ? "transparent" : "oklch(0.97 0.006 60)" }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: n.read ? "oklch(0.85 0.006 60)" : "oklch(0.68 0.16 35)", flex: "none" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 13.5, color: "oklch(0.25 0.01 60)", lineHeight: 1.4 }}>{n.text}</div>
                      <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {showManage && (
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Spaces</div>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {spaces.map((sp) => {
                    const addable = members.filter((m) => !sp.members.some((sm) => sm.id === m.id));
                    return (
                      <div key={sp.id} style={{ border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{sp.name}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {sp.members.map((m) => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "oklch(0.96 0.006 60)", borderRadius: 999, padding: "3px 6px 3px 3px" }}>
                              <AvatarCircle a={m} size={20} fontSize={9} />
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                              {m.id !== currentUser.id && (
                                <button
                                  onClick={() => removeFromSpace(sp.id, m.id)}
                                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "0 2px" }}
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {addable.length > 0 && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <select
                              value={addMemberSelection[sp.id] ?? ""}
                              onChange={(e) => setAddMemberSelection((s) => ({ ...s, [sp.id]: e.target.value }))}
                              style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
                            >
                              <option value="">Add existing member...</option>
                              {addable.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddMember(sp.id)}
                              disabled={!addMemberSelection[sp.id]}
                              style={{ fontSize: 12.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer", opacity: addMemberSelection[sp.id] ? 1 : 0.5 }}
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      <button
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer" }}
                      >
                        Copy link
                      </button>
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
                      <button
                        onClick={() => navigator.clipboard.writeText(inv.url)}
                        style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer" }}
                      >
                        Copy link
                      </button>
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
          <button onClick={() => selectContext("notifications")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: navColor("notifications") }}>
            <div style={{ width: 16, height: 16, borderRadius: "50% 50% 8px 8px", border: "2px solid currentColor" }} />
            <div style={{ fontSize: 10, fontWeight: 600 }}>Alerts</div>
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
              <div style={{ fontSize: 15, fontWeight: 800 }}>Rally</div>
              <button onClick={toggleDrawer} style={{ border: "none", background: "oklch(0.95 0.006 60)", width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer" }}>
                &times;
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Spaces</div>
              {spaceRows.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => selectSpace(sp.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", background: sp.rowBg }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
                    {sp.initial}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sp.rowColor }}>{sp.name}</div>
                    <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)" }}>{sp.listLabel}</div>
                  </div>
                </button>
              ))}
            </div>
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
                  <div style={{ flex: 1, fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>{selectedTask.title}</div>
                  {!isGuest && (
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 14, background: "oklch(0.98 0.004 60)", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Assignee</div>
                    {isGuest ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <AvatarCircle a={selectedTask.assignee} size={22} fontSize={9.5} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedTask.assignee.name}</div>
                      </div>
                    ) : (
                      <select
                        value={selectedTask.assignee.id}
                        onChange={(e) => handleAssigneeChange(selectedTask.id, e.target.value)}
                        disabled={savingField === "assignee"}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
                      >
                        {spaceMembers.some((m) => m.id === selectedTask.assignee.id) ? null : (
                          <option value={selectedTask.assignee.id}>{selectedTask.assignee.name}</option>
                        )}
                        {spaceMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Priority</div>
                    {isGuest ? (
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
                    {isGuest ? (
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
                    {isGuest ? (
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
                  <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Description</div>
                  {isGuest ? (
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.3 0.01 60)" }}>{selectedTask.desc || "No description."}</div>
                  ) : (
                    <textarea
                      key={selectedTask.id}
                      defaultValue={selectedTask.desc}
                      placeholder="Add a description…"
                      onBlur={(e) => handleDescriptionBlur(selectedTask.id, e.target.value)}
                      disabled={savingField === "desc"}
                      rows={4}
                      style={{ width: "100%", fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.3 0.01 60)", fontFamily: "inherit", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", resize: "vertical" }}
                    />
                  )}
                </div>
                {selectedTask.checklist && (
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Checklist</div>
                      <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>
                        {selectedTask.checklist.done}/{selectedTask.checklist.total}
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "oklch(0.92 0.006 60)", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "oklch(0.68 0.16 35)", width: `${selectedTask.checklist.total ? Math.round((selectedTask.checklist.done / selectedTask.checklist.total) * 100) : 0}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Comments ({selectedTask.comments})</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <MentionComposer
                      value={commentBody}
                      onChange={setCommentBody}
                      candidates={spaceMembers}
                      onEnter={handlePostComment}
                      placeholder="Add a comment… (@ to mention)"
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
