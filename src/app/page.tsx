import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RallyApp, { type UiAvatar, type UiList, type UiSpace, type PriorityKey, type StatusKey } from "./RallyApp";

const STATUS_MAP: Record<string, StatusKey> = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  IN_REVIEW: "review",
  DONE: "done",
};
const PRIORITY_MAP: Record<string, PriorityKey> = {
  LOW: "low",
  MEDIUM: "normal",
  HIGH: "high",
  URGENT: "urgent",
};

const dueFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function hueFromString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function toAvatar(u: { id: string; name: string | null; email: string }): UiAvatar {
  const label = u.name ?? u.email;
  const initials = label
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return { id: u.id, name: label, initials, hue: hueFromString(u.id) };
}

type TaskWithRelations = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  comments: number;
  assignees: { id: string; name: string | null; email: string }[];
  createdBy: { id: string; name: string | null; email: string };
  subtasks: { status: string }[];
};

function toUiTask(t: TaskWithRelations) {
  const assignee = t.assignees[0] ?? t.createdBy;
  return {
    id: t.id,
    title: t.title,
    desc: t.description ?? "",
    status: STATUS_MAP[t.status] ?? "todo",
    priority: PRIORITY_MAP[t.priority] ?? "normal",
    due: t.dueDate ? dueFormatter.format(t.dueDate) : "No due date",
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    assignee: toAvatar(assignee),
    checklist: t.subtasks.length ? { done: t.subtasks.filter((s) => s.status === "DONE").length, total: t.subtasks.length } : null,
    comments: t.comments,
  };
}

const taskInclude = {
  assignees: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  subtasks: { select: { status: true } },
  _count: { select: { comments: true } },
} as const;

function flattenTaskCount<T extends { _count: { comments: number } }>(t: T) {
  const { _count, ...rest } = t;
  return { ...rest, comments: _count.comments };
}

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.userMembership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "system-ui, sans-serif" }}>
        You&apos;re not a member of any workspace yet.
      </div>
    );
  }

  const isGuestRole = membership.role === "GUEST";
  const currentUser = toAvatar({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? "" });

  const members = (
    await prisma.userMembership.findMany({
      where: { workspaceId: membership.workspaceId, role: { not: "GUEST" } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
  ).map((m) => toAvatar(m.user));

  if (isGuestRole) {
    const lists = await prisma.list.findMany({
      where: { guestShares: { some: { userId: session.user.id } } },
      include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude } },
    });

    const sharedLists: UiList[] = lists.map((l) => ({
      id: l.id,
      name: l.name,
      isSprint: l.isSprint,
      tasks: l.tasks.map((t) => toUiTask(flattenTaskCount(t))),
    }));

    return <RallyApp workspaceName={membership.workspace.name} currentUser={currentUser} isGuestRole spaces={[]} sharedLists={sharedLists} members={[]} />;
  }

  const spacesRaw = await prisma.space.findMany({
    where: { workspaceId: membership.workspaceId },
    include: {
      lists: {
        include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const spaces: UiSpace[] = spacesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    hue: hueFromString(s.id),
    lists: s.lists.map((l) => ({
      id: l.id,
      name: l.name,
      isSprint: l.isSprint,
      tasks: l.tasks.map((t) => toUiTask(flattenTaskCount(t))),
    })),
  }));

  return <RallyApp workspaceName={membership.workspace.name} currentUser={currentUser} isGuestRole={false} spaces={spaces} sharedLists={[]} members={members} />;
}
