"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { requireEditableTask, requireListAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { mentionedUserIds } from "@/lib/mentions";
import { MAX_ATTACHMENT_BYTES, deleteAttachmentFile, saveAttachmentFile } from "@/lib/storage";

async function myMembership(userId: string) {
  return prisma.userMembership.findFirst({ where: { userId } });
}

type NotifCategory = "taskAssigned" | "taskDue" | "comments" | "chatMentions";

async function notify(userId: string, actorId: string | null, text: string, taskId?: string, category?: NotifCategory) {
  if (actorId && userId === actorId) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, notificationPrefs: true } });
  if (!user) return;
  const prefs = user.notificationPrefs as Record<string, boolean> | null;
  const enabled = !category || !prefs || prefs[category] !== false;

  if (enabled) {
    await prisma.notification.create({ data: { userId, text, taskId } });
    try {
      await sendMail(user.email, "Rally notification", `${text}\n\n${process.env.APP_URL ?? "http://localhost:3000"}`);
    } catch (err) {
      console.error("Failed to send notification email", err);
    }
  }

  // ponytail: incoming webhooks post to one fixed Slack channel, so this is
  // a broadcast model (everyone in that channel sees every notification),
  // not a per-user DM. Prefix the recipient's name so it's still legible.
  const membership = await myMembership(userId);
  const workspace = membership ? await prisma.workspace.findUnique({ where: { id: membership.workspaceId }, select: { slackWebhookUrl: true } }) : null;
  if (workspace?.slackWebhookUrl) {
    try {
      const res = await fetch(workspace.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${user.name ?? user.email}: ${text}` }),
      });
      if (!res.ok) console.error("Slack webhook rejected notification", res.status, await res.text());
    } catch (err) {
      console.error("Failed to send Slack notification", err);
    }
  }
}

// Called hourly by /api/cron/due-notifications, which only lets it run through
// once at the DUE_NOTIFY_HOUR gate (see that route) — the createdAt check below
// is a cheap belt-and-suspenders dedupe, not the primary guard.
export async function checkDueDateNotifications() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const dayAfterStart = new Date(tomorrowStart.getTime() + 86_400_000);

  const windows = [
    { label: "due today", gte: todayStart, lt: tomorrowStart },
    { label: "due tomorrow", gte: tomorrowStart, lt: dayAfterStart },
  ];

  for (const { label, gte, lt } of windows) {
    const tasks = await prisma.task.findMany({
      where: { dueDate: { gte, lt }, status: { not: "DONE" } },
      include: { assignees: { select: { id: true } } },
    });
    for (const task of tasks) {
      const text = `'${task.title}' is ${label}`;
      for (const assignee of task.assignees) {
        const alreadySent = await prisma.notification.findFirst({
          where: { userId: assignee.id, taskId: task.id, text, createdAt: { gte: todayStart } },
        });
        if (!alreadySent) await notify(assignee.id, null, text, task.id, "taskDue");
      }
    }
  }
}

async function filterWorkspaceMembers(workspaceId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.userMembership.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function assertListAccess(userId: string, listId: string) {
  return requireListAccess(userId, listId);
}

export async function createTask(listId: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = title.trim();
  if (!trimmed) return;

  const { isGuest } = await requireListAccess(session.user.id, listId);
  if (isGuest) throw new Error("Guests cannot create tasks");

  await prisma.task.create({
    data: {
      listId,
      title: trimmed,
      createdById: session.user.id,
      assignees: { connect: [{ id: session.user.id }] },
    },
  });
  revalidatePath("/");
}

export async function createSpace(name: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can create spaces");

  await prisma.space.create({ data: { workspaceId: membership.workspaceId, name: trimmed } });
  revalidatePath("/");
}

async function assertManagesSpace(userId: string, membershipRole: string, spaceId: string) {
  if (membershipRole === "OWNER") return;
  if (membershipRole !== "ADMIN") throw new Error("Forbidden");
  const isSpaceAdmin = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  if (!isSpaceAdmin) throw new Error("You don't manage this space");
}

async function assertSpaceAccess(userId: string, membershipRole: string, spaceId: string) {
  if (membershipRole === "OWNER") return;
  const isSpaceMember = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  if (!isSpaceMember) throw new Error("Forbidden");
}

export async function createList(spaceId: string, name: string, isSprint: boolean, sprintStart?: string, sprintEnd?: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertSpaceAccess(session.user.id, membership.role, spaceId);

  await prisma.list.create({
    data: {
      spaceId,
      name: trimmed,
      isSprint,
      sprintStart: isSprint && sprintStart ? new Date(sprintStart) : null,
      sprintEnd: isSprint && sprintEnd ? new Date(sprintEnd) : null,
    },
  });
  revalidatePath("/");
}

export async function setMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
  const session = await auth();
  if (!session?.user?.id) return;
  if (userId === session.user.id) throw new Error("You can't change your own role");

  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can change roles");

  const target = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: membership.workspaceId } },
  });
  if (!target || target.role === "OWNER" || target.role === "GUEST") throw new Error("Can't change this user's role");

  await prisma.userMembership.update({ where: { id: target.id }, data: { role } });
  revalidatePath("/");
}

export async function assignToSpace(spaceId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertManagesSpace(session.user.id, membership.role, spaceId);

  await prisma.spaceMember.upsert({
    where: { userId_spaceId: { userId, spaceId } },
    update: {},
    create: { userId, spaceId },
  });
  revalidatePath("/");
}

export async function removeFromSpace(spaceId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertManagesSpace(session.user.id, membership.role, spaceId);

  await prisma.spaceMember.deleteMany({ where: { userId, spaceId } });
  revalidatePath("/");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(input: { email: string; role: "ADMIN" | "MEMBER" | "GUEST"; spaceId?: string; listId?: string }) {
  const session = await auth();
  if (!session?.user?.id) return;
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.userMembership.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId: membership.workspaceId } },
    });
    if (existingMembership) throw new Error("This person is already in the workspace. Change their role instead of inviting them again.");
  }

  if (input.role === "ADMIN") {
    if (membership.role !== "OWNER") throw new Error("Only the owner can invite admins");
  } else if (input.role === "MEMBER") {
    if (!input.spaceId) throw new Error("A space is required to invite a member");
    await assertManagesSpace(session.user.id, membership.role, input.spaceId);
  } else if (input.role === "GUEST") {
    if (!input.listId) throw new Error("A list is required to invite a guest");
    await requireListAccess(session.user.id, input.listId);
  }

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.invite.create({
    data: {
      email,
      role: input.role,
      token,
      workspaceId: membership.workspaceId,
      invitedById: session.user.id,
      spaceId: input.role === "GUEST" ? null : input.spaceId,
      listId: input.role === "GUEST" ? input.listId : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  try {
    await sendMail(email, "You're invited to Rally", `You've been invited to join a Rally workspace as ${input.role.toLowerCase()}.\n\nAccept your invite: ${url}`);
  } catch (err) {
    console.error("Failed to send invite email", err);
  }

  revalidatePath("/");
  return { url };
}

export async function revokeInvite(inviteId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.acceptedAt) return;

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  if (membership.role !== "OWNER" && invite.invitedById !== session.user.id) throw new Error("Forbidden");

  await prisma.invite.delete({ where: { id: inviteId } });
  revalidatePath("/");
}

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  const invite = await prisma.invite.findUnique({ where: { token: input.token } });
  if (!invite) throw new Error("This invite link is invalid.");
  if (invite.acceptedAt) throw new Error("This invite has already been used.");
  if (invite.expiresAt < new Date()) throw new Error("This invite has expired.");

  const name = input.name.trim();
  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (!existingUser && input.password.length < 8) throw new Error("Password must be at least 8 characters");

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        email: invite.email,
        name: name || invite.email,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
    }));

  await prisma.userMembership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    update: {},
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
  });

  if (invite.spaceId) {
    await prisma.spaceMember.upsert({
      where: { userId_spaceId: { userId: user.id, spaceId: invite.spaceId } },
      update: {},
      create: { userId: user.id, spaceId: invite.spaceId },
    });
  }
  if (invite.listId) {
    await prisma.guestShare.upsert({
      where: { userId_listId: { userId: user.id, listId: invite.listId } },
      update: {},
      create: { workspaceId: invite.workspaceId, userId: user.id, listId: invite.listId },
    });
  }

  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  revalidatePath("/");
}

const STATUS_DB = { todo: "TODO", in_progress: "IN_PROGRESS", review: "IN_REVIEW", done: "DONE" } as const;
const PRIORITY_DB = { low: "LOW", normal: "MEDIUM", high: "HIGH", urgent: "URGENT" } as const;

async function assertCanEditTask(userId: string, taskId: string) {
  await requireEditableTask(userId, taskId);
}

export async function updateTaskStatus(taskId: string, status: keyof typeof STATUS_DB) {
  const session = await auth();
  if (!session?.user?.id) return;
  await requireEditableTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: STATUS_DB[status] } });
  revalidatePath("/");
}

export async function updateTaskPriority(taskId: string, priority: keyof typeof PRIORITY_DB) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { priority: PRIORITY_DB[priority] } });
  revalidatePath("/");
}

export async function updateTaskDueDate(taskId: string, dueDate: string | null) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { dueDate: dueDate ? new Date(dueDate) : null } });
  revalidatePath("/");
}

export async function addTaskAssignee(taskId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, listId: true } });
  if (!task) throw new Error("Task not found");

  const targetAccess = await assertListAccess(userId, task.listId).catch(() => null);
  if (!targetAccess || targetAccess.isGuest) throw new Error("That person doesn't have access to this task's space");

  await prisma.task.update({ where: { id: taskId }, data: { assignees: { connect: [{ id: userId }] } } });
  const actor = session.user.name ?? session.user.email ?? "Someone";
  await notify(userId, session.user.id, `${actor} assigned you to '${task.title}'`, taskId, "taskAssigned");
  revalidatePath("/");
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { assignees: { disconnect: [{ id: userId }] } } });
  revalidatePath("/");
}

export async function addChecklistItem(taskId: string, text: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  await assertCanEditTask(session.user.id, taskId);

  const count = await prisma.checklistItem.count({ where: { taskId } });
  await prisma.checklistItem.create({ data: { taskId, text: trimmed, position: count } });
  revalidatePath("/");
}

export async function toggleChecklistItem(itemId: string, done: boolean) {
  const session = await auth();
  if (!session?.user?.id) return;
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) throw new Error("Checklist item not found");
  await assertCanEditTask(session.user.id, item.taskId);
  await prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
  revalidatePath("/");
}

export async function deleteChecklistItem(itemId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) return;
  await assertCanEditTask(session.user.id, item.taskId);
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath("/");
}

export async function createCustomField(listId: string, name: string, type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN", options: string[]) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const { isGuest } = await assertListAccess(session.user.id, listId);
  if (isGuest) throw new Error("Guests cannot add custom fields");

  const count = await prisma.customField.count({ where: { listId } });
  await prisma.customField.create({
    data: { listId, name: trimmed, type, options: type === "DROPDOWN" ? options.filter(Boolean) : [], position: count },
  });
  revalidatePath("/");
}

export async function deleteCustomField(fieldId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const field = await prisma.customField.findUnique({ where: { id: fieldId }, select: { listId: true } });
  if (!field) return;
  const { isGuest } = await assertListAccess(session.user.id, field.listId);
  if (isGuest) throw new Error("Guests cannot delete custom fields");
  await prisma.customField.delete({ where: { id: fieldId } });
  revalidatePath("/");
}

export async function setCustomFieldValue(taskId: string, customFieldId: string, value: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);

  if (!value.trim()) {
    await prisma.customFieldValue.deleteMany({ where: { taskId, customFieldId } });
  } else {
    await prisma.customFieldValue.upsert({
      where: { taskId_customFieldId: { taskId, customFieldId } },
      update: { value },
      create: { taskId, customFieldId, value },
    });
  }
  revalidatePath("/");
}

async function wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  if (taskId === dependsOnId) return true;
  const visited = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await prisma.taskDependency.findMany({ where: { taskId: current }, select: { dependsOnId: true } });
    for (const d of deps) stack.push(d.dependsOnId);
  }
  return false;
}

export async function addTaskDependency(taskId: string, dependsOnId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  if (taskId === dependsOnId) throw new Error("A task can't depend on itself");
  await assertCanEditTask(session.user.id, taskId);

  const other = await prisma.task.findUnique({ where: { id: dependsOnId }, select: { listId: true } });
  if (!other) throw new Error("Task not found");
  await assertListAccess(session.user.id, other.listId);

  if (await wouldCreateCycle(taskId, dependsOnId)) throw new Error("That would create a circular dependency");

  await prisma.taskDependency.upsert({
    where: { taskId_dependsOnId: { taskId, dependsOnId } },
    update: {},
    create: { taskId, dependsOnId },
  });
  revalidatePath("/");
}

export async function removeTaskDependency(taskId: string, dependsOnId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.taskDependency.deleteMany({ where: { taskId, dependsOnId } });
  revalidatePath("/");
}

export async function uploadAttachment(taskId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("File exceeds the 20MB limit");

  const key = await saveAttachmentFile(file);
  await prisma.attachment.create({
    data: {
      taskId,
      url: key,
      filename: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById: session.user.id,
    },
  });
  revalidatePath("/");
}

export async function deleteAttachment(attachmentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, url: true } });
  if (!attachment) return;
  await assertCanEditTask(session.user.id, attachment.taskId);

  await prisma.attachment.delete({ where: { id: attachmentId } });
  await deleteAttachmentFile(attachment.url).catch((err) => console.error("Failed to delete attachment file", err));
  revalidatePath("/");
}

export async function updateSlackWebhook(url: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can change the Slack integration");

  const trimmed = url.trim();
  if (trimmed && !trimmed.startsWith("https://hooks.slack.com/")) throw new Error("That doesn't look like a Slack incoming webhook URL");

  await prisma.workspace.update({ where: { id: membership.workspaceId }, data: { slackWebhookUrl: trimmed || null } });
  revalidatePath("/");
}

export async function getOrCreateDirectChannel(otherUserId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (otherUserId === session.user.id) throw new Error("Can't message yourself");

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");

  const other = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId: otherUserId, workspaceId: membership.workspaceId } },
  });
  if (!other) throw new Error("That person isn't in your workspace");

  const existing = await prisma.channel.findFirst({
    where: {
      workspaceId: membership.workspaceId,
      isDirect: true,
      AND: [{ members: { some: { id: session.user.id } } }, { members: { some: { id: otherUserId } } }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.channel.create({
    data: { workspaceId: membership.workspaceId, isDirect: true, members: { connect: [{ id: session.user.id }, { id: otherUserId }] } },
    select: { id: true },
  });
  revalidatePath("/");
  return created.id;
}

export async function deleteTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/");
}

export async function updateTaskDescription(taskId: string, description: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { description: description.trim() || null } });
  revalidatePath("/");
}

export async function updateTaskTitle(taskId: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  await assertCanEditTask(session.user.id, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { title: trimmed } });
  revalidatePath("/");
}

export async function moveTaskToList(taskId: string, listId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { listId: true } });
  if (!task) throw new Error("Task not found");
  await assertCanEditTask(session.user.id, taskId);
  if (task.listId === listId) return;

  const [currentList, targetList] = await Promise.all([
    prisma.list.findUnique({ where: { id: task.listId }, select: { spaceId: true } }),
    prisma.list.findUnique({ where: { id: listId }, select: { spaceId: true } }),
  ]);
  if (!targetList || !currentList || targetList.spaceId !== currentList.spaceId) {
    throw new Error("Can't move a task to a different space");
  }

  await prisma.task.update({ where: { id: taskId }, data: { listId } });
  revalidatePath("/");
}

export async function updateProfileName(name: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { name: trimmed } });
  revalidatePath("/");
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
}

export async function updateNotificationPrefs(prefs: Record<string, boolean>) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { notificationPrefs: prefs } });
  revalidatePath("/");
}

export async function markChannelRead(channelId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { members: { select: { id: true } } } });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) return;
  await prisma.channelRead.upsert({
    where: { userId_channelId: { userId: session.user.id, channelId } },
    create: { userId: session.user.id, channelId },
    update: { lastReadAt: new Date() },
  });
  revalidatePath("/");
}

export async function postMessage(channelId: string, body: string, parentMessageId?: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true, members: { select: { id: true } } },
  });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) throw new Error("Forbidden");

  if (parentMessageId) {
    const parent = await prisma.message.findUnique({ where: { id: parentMessageId }, select: { channelId: true } });
    if (!parent || parent.channelId !== channelId) throw new Error("Invalid thread");
  }

  await prisma.message.create({ data: { channelId, authorId: session.user.id, body: trimmed, parentMessageId: parentMessageId ?? null } });

  const actor = session.user.name ?? session.user.email ?? "Someone";
  const memberIds = new Set(channel.members.map((m) => m.id));
  const mentioned = mentionedUserIds(trimmed).filter((id) => memberIds.has(id));
  for (const userId of mentioned) {
    await notify(userId, session.user.id, `${actor} mentioned you in #${channel.name ?? "chat"}`, undefined, "chatMentions");
  }

  revalidatePath("/");
}

export async function postComment(taskId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      listId: true,
      title: true,
      createdById: true,
      assignees: { select: { id: true } },
      list: { select: { space: { select: { workspaceId: true } } } },
    },
  });
  if (!task) return;
  await assertListAccess(session.user.id, task.listId);

  await prisma.comment.create({ data: { taskId, authorId: session.user.id, body: trimmed } });

  const actor = session.user.name ?? session.user.email ?? "Someone";
  const recipients = new Set([task.createdById, ...task.assignees.map((a) => a.id)]);
  for (const userId of recipients) {
    await notify(userId, session.user.id, `${actor} commented on '${task.title}'`, taskId, "comments");
  }

  // ponytail: mentions are validated against workspace membership, not this
  // task's specific space, so a mention can reach someone without space
  // access. Tighten to space-scoped members if that leak matters.
  const mentioned = await filterWorkspaceMembers(task.list.space.workspaceId, mentionedUserIds(trimmed));
  for (const userId of mentioned) {
    if (recipients.has(userId)) continue;
    await notify(userId, session.user.id, `${actor} mentioned you in a comment on '${task.title}'`, taskId, "comments");
  }

  revalidatePath("/");
}

export async function markNotificationRead(notificationId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { id: notificationId, userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/");
}
