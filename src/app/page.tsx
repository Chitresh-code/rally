import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RallyApp, { type UiAvatar, type UiChannel, type UiInvite, type UiList, type UiMember, type UiNotification, type UiSpace, type PriorityKey, type StatusKey, type RoleKey } from "./RallyApp";

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
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function timeAgo(d: Date): string {
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function toDateStr(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

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
  assignees: { id: string; name: string | null; email: string }[];
  createdBy: { id: string; name: string | null; email: string };
  subtasks: { status: string }[];
  comments: { id: string; body: string; createdAt: Date; author: { id: string; name: string | null; email: string } }[];
  attachments: { id: string; filename: string; mimeType: string; size: number; createdAt: Date; uploadedBy: { id: string; name: string | null; email: string } }[];
  dependsOn: { dependsOn: { id: string; title: string; status: string } }[];
  dependents: { task: { id: string; title: string; status: string } }[];
};

function toUiTask(t: TaskWithRelations) {
  return {
    id: t.id,
    title: t.title,
    desc: t.description ?? "",
    status: STATUS_MAP[t.status] ?? "todo",
    priority: PRIORITY_MAP[t.priority] ?? "normal",
    due: t.dueDate ? dueFormatter.format(t.dueDate) : "No due date",
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    assignees: t.assignees.map(toAvatar),
    checklist: t.subtasks.length ? { done: t.subtasks.filter((s) => s.status === "DONE").length, total: t.subtasks.length } : null,
    comments: t.comments.map((c) => ({ id: c.id, author: toAvatar(c.author), body: c.body, time: timeAgo(c.createdAt) })),
    attachments: t.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, uploadedBy: toAvatar(a.uploadedBy), time: timeAgo(a.createdAt) })),
    dependsOn: t.dependsOn.map((d) => ({ id: d.dependsOn.id, title: d.dependsOn.title, status: STATUS_MAP[d.dependsOn.status] ?? "todo" })),
    dependents: t.dependents.map((d) => ({ id: d.task.id, title: d.task.title, status: STATUS_MAP[d.task.status] ?? "todo" })),
  };
}

const taskInclude = {
  assignees: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  subtasks: { select: { status: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } },
  attachments: { orderBy: { createdAt: "asc" }, include: { uploadedBy: { select: { id: true, name: true, email: true } } } },
  dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
  dependents: { include: { task: { select: { id: true, title: true, status: true } } } },
} as const;

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

  const notificationsRaw = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const notifications: UiNotification[] = notificationsRaw.map((n) => ({
    id: n.id,
    text: n.text,
    time: timeAgo(n.createdAt),
    read: n.readAt !== null,
    taskId: n.taskId,
  }));

  const membersRaw = await prisma.userMembership.findMany({
    where: { workspaceId: membership.workspaceId, role: { not: "GUEST" } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const members = membersRaw.map((m) => toAvatar(m.user));
  const allMembers: UiMember[] = membersRaw.map((m) => ({ ...toAvatar(m.user), role: m.role as RoleKey }));

  if (isGuestRole) {
    const lists = await prisma.list.findMany({
      where: { guestShares: { some: { userId: session.user.id } } },
      include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude } },
    });

    const sharedLists: UiList[] = lists.map((l) => ({
      id: l.id,
      name: l.name,
      isSprint: l.isSprint,
      sprintStart: toDateStr(l.sprintStart),
      sprintEnd: toDateStr(l.sprintEnd),
      tasks: l.tasks.map((t) => toUiTask(t)),
    }));

    return (
      <RallyApp
        workspaceName={membership.workspace.name}
        currentUser={currentUser}
        isGuestRole
        role="GUEST"
        spaces={[]}
        sharedLists={sharedLists}
        members={[]}
        allMembers={[]}
        channels={[]}
        pendingInvites={[]}
        notifications={notifications}
        slackWebhookUrl={null}
      />
    );
  }

  const role = membership.role as RoleKey;

  const channelsRaw = await prisma.channel.findMany({
    where: { workspaceId: membership.workspaceId, members: { some: { id: session.user.id } } },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } },
      members: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const channels: UiChannel[] = channelsRaw.map((c) => {
    const otherMember = c.isDirect ? c.members.find((m) => m.id !== session.user.id) : undefined;
    return {
      id: c.id,
      name: c.isDirect ? (otherMember ? (otherMember.name ?? otherMember.email) : "Direct message") : c.name ?? "channel",
      isDirect: c.isDirect,
      members: c.members.map(toAvatar),
      messages: c.messages.map((m) => ({
        id: m.id,
        author: toAvatar(m.author),
        text: m.body,
        time: timeFormatter.format(m.createdAt),
        parentMessageId: m.parentMessageId,
      })),
    };
  });

  const ownerMembership = await prisma.userMembership.findFirst({
    where: { workspaceId: membership.workspaceId, role: "OWNER" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const ownerAvatar = ownerMembership ? toAvatar(ownerMembership.user) : null;

  const spacesRaw = await prisma.space.findMany({
    where: role === "OWNER" ? { workspaceId: membership.workspaceId } : { workspaceId: membership.workspaceId, members: { some: { userId: session.user.id } } },
    include: {
      lists: {
        include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude } },
      },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const spaces: UiSpace[] = spacesRaw.map((s) => {
    const spaceMembers = s.members.map((m) => toAvatar(m.user));
    const withOwner = ownerAvatar && !spaceMembers.some((m) => m.id === ownerAvatar.id) ? [ownerAvatar, ...spaceMembers] : spaceMembers;
    return {
      id: s.id,
      name: s.name,
      hue: hueFromString(s.id),
      members: withOwner,
      lists: s.lists.map((l) => ({
        id: l.id,
        name: l.name,
        isSprint: l.isSprint,
        sprintStart: toDateStr(l.sprintStart),
        sprintEnd: toDateStr(l.sprintEnd),
        tasks: l.tasks.map((t) => toUiTask(t)),
      })),
    };
  });

  const invitesRaw = await prisma.invite.findMany({
    where:
      role === "OWNER"
        ? { workspaceId: membership.workspaceId, acceptedAt: null }
        : { workspaceId: membership.workspaceId, acceptedAt: null, invitedById: session.user.id },
    include: { space: { select: { name: true } }, list: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const pendingInvites: UiInvite[] = invitesRaw.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    scope: i.space?.name ?? i.list?.name ?? null,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${i.token}`,
  }));

  return (
    <RallyApp
      workspaceName={membership.workspace.name}
      currentUser={currentUser}
      isGuestRole={false}
      role={role}
      spaces={spaces}
      sharedLists={[]}
      members={members}
      allMembers={allMembers}
      channels={channels}
      pendingInvites={pendingInvites}
      notifications={notifications}
      slackWebhookUrl={role === "OWNER" ? membership.workspace.slackWebhookUrl : null}
    />
  );
}
