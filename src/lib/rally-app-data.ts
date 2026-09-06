import type { PriorityKey, RallyAppProps, RoleKey, StatusKey, UiAvatar, UiChannel, UiCustomField, UiInvite, UiList, UiMember, UiNotification, UiSpace } from "@/lib/rally-types";
import { prisma } from "@/lib/prisma";

const statusByDatabaseValue: Record<string, StatusKey> = { TODO: "todo", IN_PROGRESS: "in_progress", IN_REVIEW: "review", DONE: "done" };
const priorityByDatabaseValue: Record<string, PriorityKey> = { LOW: "low", MEDIUM: "normal", HIGH: "high", URGENT: "urgent" };
const dueFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export const taskInclude = {
  assignees: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  subtasks: { select: { status: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } },
  attachments: { orderBy: { createdAt: "asc" }, include: { uploadedBy: { select: { id: true, name: true, email: true } } } },
  dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
  dependents: { include: { task: { select: { id: true, title: true, status: true } } } },
  checklistItems: { orderBy: { position: "asc" }, select: { id: true, text: true, done: true } },
  customFieldValues: { select: { customFieldId: true, value: true } },
} as const;

export type TaskWithRelations = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignees: { id: string; name: string | null; email: string }[];
  createdBy: { id: string; name: string | null; email: string };
  comments: { id: string; body: string; createdAt: Date; author: { id: string; name: string | null; email: string } }[];
  attachments: { id: string; filename: string; mimeType: string; size: number; createdAt: Date; uploadedBy: { id: string; name: string | null; email: string } }[];
  dependsOn: { dependsOn: { id: string; title: string; status: string } }[];
  dependents: { task: { id: string; title: string; status: string } }[];
  checklistItems: { id: string; text: string; done: boolean }[];
  customFieldValues: { customFieldId: string; value: string }[];
};

export function timeAgo(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function toDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function hueFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return hash % 360;
}

export function toAvatar(user: { id: string; name: string | null; email: string }): UiAvatar {
  const label = user.name ?? user.email;
  const initials = label.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return { id: user.id, name: label, initials, hue: hueFromId(user.id) };
}

export function toUiTask(task: TaskWithRelations) {
  return {
    id: task.id,
    listId: task.listId,
    title: task.title,
    desc: task.description ?? "",
    status: statusByDatabaseValue[task.status] ?? "todo",
    priority: priorityByDatabaseValue[task.priority] ?? "normal",
    due: task.dueDate ? dueFormatter.format(task.dueDate) : "No due date",
    dueDate: toDateString(task.dueDate),
    assignees: task.assignees.map(toAvatar),
    createdBy: toAvatar(task.createdBy),
    checklist: task.checklistItems.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    customFieldValues: task.customFieldValues.map((fieldValue) => ({ fieldId: fieldValue.customFieldId, value: fieldValue.value })),
    comments: task.comments.map((comment) => ({ id: comment.id, author: toAvatar(comment.author), body: comment.body, time: timeAgo(comment.createdAt) })),
    attachments: task.attachments.map((attachment) => ({ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, uploadedBy: toAvatar(attachment.uploadedBy), time: timeAgo(attachment.createdAt) })),
    dependsOn: task.dependsOn.map((dependency) => ({ id: dependency.dependsOn.id, title: dependency.dependsOn.title, status: statusByDatabaseValue[dependency.dependsOn.status] ?? "todo" })),
    dependents: task.dependents.map((dependency) => ({ id: dependency.task.id, title: dependency.task.title, status: statusByDatabaseValue[dependency.task.status] ?? "todo" })),
  };
}

export function toUiCustomField(field: { id: string; name: string; type: string; options: string[] }): UiCustomField {
  return { id: field.id, name: field.name, type: field.type as UiCustomField["type"], options: field.options };
}

type Viewer = { id: string; name: string | null; email: string | null };

export async function loadRallyAppData(viewer: Viewer): Promise<RallyAppProps | null> {
  const membership = await prisma.userMembership.findFirst({ where: { userId: viewer.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  if (!membership) return null;

  const currentUser = toAvatar({ id: viewer.id, name: viewer.name, email: viewer.email ?? "" });
  const [viewerRecord, notificationsRaw] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewer.id }, select: { notificationPrefs: true } }),
    prisma.notification.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const notificationPrefs = (viewerRecord?.notificationPrefs as Record<string, boolean> | null) ?? null;
  const notifications: UiNotification[] = notificationsRaw.map((notification) => ({ id: notification.id, text: notification.text, time: timeAgo(notification.createdAt), read: notification.readAt !== null, taskId: notification.taskId }));

  if (membership.role === "GUEST") {
    const lists = await prisma.list.findMany({ where: { guestShares: { some: { userId: viewer.id } } }, include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude }, customFields: { orderBy: { position: "asc" } } } });
    const sharedLists: UiList[] = lists.map((list) => ({ id: list.id, name: list.name, isSprint: list.isSprint, sprintStart: toDateString(list.sprintStart), sprintEnd: toDateString(list.sprintEnd), tasks: list.tasks.map(toUiTask), customFields: list.customFields.map(toUiCustomField) }));
    return { workspaceName: membership.workspace.name, currentUser, currentUserEmail: viewer.email ?? "", notificationPrefs, isGuestRole: true, role: "GUEST", spaces: [], sharedLists, members: [], allMembers: [], channels: [], pendingInvites: [], notifications, slackWebhookUrl: null };
  }

  const role = membership.role as RoleKey;
  const [membersRaw, channelsRaw, ownerMembership, spacesRaw, invitesRaw] = await Promise.all([
    prisma.userMembership.findMany({ where: { workspaceId: membership.workspaceId, role: { not: "GUEST" } }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.channel.findMany({ where: { workspaceId: membership.workspaceId, members: { some: { id: viewer.id } } }, include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } }, members: { select: { id: true, name: true, email: true } }, reads: { where: { userId: viewer.id }, select: { lastReadAt: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.userMembership.findFirst({ where: { workspaceId: membership.workspaceId, role: "OWNER" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.space.findMany({ where: role === "OWNER" ? { workspaceId: membership.workspaceId } : { workspaceId: membership.workspaceId, members: { some: { userId: viewer.id } } }, include: { lists: { include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude }, customFields: { orderBy: { position: "asc" } } } }, members: { include: { user: { select: { id: true, name: true, email: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.invite.findMany({ where: role === "OWNER" ? { workspaceId: membership.workspaceId, acceptedAt: null } : { workspaceId: membership.workspaceId, acceptedAt: null, invitedById: viewer.id }, include: { space: { select: { name: true } }, list: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  const members = membersRaw.map((member) => toAvatar(member.user));
  const allMembers: UiMember[] = membersRaw.map((member) => ({ ...toAvatar(member.user), role: member.role as RoleKey }));
  const channels: UiChannel[] = channelsRaw.map((channel) => {
    const otherMember = channel.isDirect ? channel.members.find((member) => member.id !== viewer.id) : undefined;
    const lastReadAt = channel.reads[0]?.lastReadAt ?? channel.createdAt;
    return { id: channel.id, name: channel.isDirect ? (otherMember ? (otherMember.name ?? otherMember.email) : "Direct message") : channel.name ?? "channel", isDirect: channel.isDirect, unread: channel.messages.filter((message) => message.authorId !== viewer.id && message.createdAt > lastReadAt).length, members: channel.members.map(toAvatar), messages: channel.messages.map((message) => ({ id: message.id, author: toAvatar(message.author), text: message.body, time: timeFormatter.format(message.createdAt), parentMessageId: message.parentMessageId })) };
  });
  const ownerAvatar = ownerMembership ? toAvatar(ownerMembership.user) : null;
  const spaces: UiSpace[] = spacesRaw.map((space) => {
    const membersForSpace = space.members.map((member) => toAvatar(member.user));
    return { id: space.id, name: space.name, hue: hueFromId(space.id), members: ownerAvatar && !membersForSpace.some((member) => member.id === ownerAvatar.id) ? [ownerAvatar, ...membersForSpace] : membersForSpace, lists: space.lists.map((list) => ({ id: list.id, name: list.name, isSprint: list.isSprint, sprintStart: toDateString(list.sprintStart), sprintEnd: toDateString(list.sprintEnd), tasks: list.tasks.map(toUiTask), customFields: list.customFields.map(toUiCustomField) })) };
  });
  const pendingInvites: UiInvite[] = invitesRaw.map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, scope: invite.space?.name ?? invite.list?.name ?? null, url: `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${invite.token}` }));

  return { workspaceName: membership.workspace.name, currentUser, currentUserEmail: viewer.email ?? "", notificationPrefs, isGuestRole: false, role, spaces, sharedLists: [], members, allMembers, channels, pendingInvites, notifications, slackWebhookUrl: role === "OWNER" ? membership.workspace.slackWebhookUrl : null };
}
