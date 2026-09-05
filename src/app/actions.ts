"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { mentionedUserIds } from "@/lib/mentions";

async function myMembership(userId: string) {
  return prisma.userMembership.findFirst({ where: { userId } });
}

async function notify(userId: string, actorId: string, text: string, taskId?: string) {
  if (userId === actorId) return;
  await prisma.notification.create({ data: { userId, text, taskId } });
}

async function filterWorkspaceMembers(workspaceId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.userMembership.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function assertListAccess(userId: string, listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: {
      space: { include: { members: { where: { userId } } } },
      guestShares: { where: { userId } },
    },
  });
  if (!list) throw new Error("List not found");

  const membership = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: list.space.workspaceId } },
  });

  if (!membership) {
    if (list.guestShares.length > 0) return { isGuest: true };
    throw new Error("Forbidden");
  }
  if (membership.role === "GUEST") {
    if (list.guestShares.length === 0) throw new Error("Forbidden");
    return { isGuest: true };
  }
  if (membership.role === "OWNER") return { isGuest: false };

  if (list.space.members.length === 0) throw new Error("Forbidden");
  return { isGuest: false };
}

export async function createTask(listId: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = title.trim();
  if (!trimmed) return;

  const { isGuest } = await assertListAccess(session.user.id, listId);
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
    await assertListAccess(session.user.id, input.listId);
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
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { listId: true } });
  if (!task) throw new Error("Task not found");
  const { isGuest } = await assertListAccess(userId, task.listId);
  if (isGuest) throw new Error("Guests cannot edit tasks");
}

export async function updateTaskStatus(taskId: string, status: keyof typeof STATUS_DB) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
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

export async function updateTaskAssignee(taskId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await assertCanEditTask(session.user.id, taskId);
  const task = await prisma.task.update({ where: { id: taskId }, data: { assignees: { set: [{ id: userId }] } } });
  const actor = session.user.name ?? session.user.email ?? "Someone";
  await notify(userId, session.user.id, `${actor} assigned you to '${task.title}'`, taskId);
  revalidatePath("/");
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

export async function postMessage(channelId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true, members: { select: { id: true } } },
  });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) throw new Error("Forbidden");

  await prisma.message.create({ data: { channelId, authorId: session.user.id, body: trimmed } });

  const actor = session.user.name ?? session.user.email ?? "Someone";
  const memberIds = new Set(channel.members.map((m) => m.id));
  const mentioned = mentionedUserIds(trimmed).filter((id) => memberIds.has(id));
  for (const userId of mentioned) {
    await notify(userId, session.user.id, `${actor} mentioned you in #${channel.name ?? "chat"}`);
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
    await notify(userId, session.user.id, `${actor} commented on '${task.title}'`, taskId);
  }

  // ponytail: mentions are validated against workspace membership, not this
  // task's specific space, so a mention can reach someone without space
  // access. Tighten to space-scoped members if that leak matters.
  const mentioned = await filterWorkspaceMembers(task.list.space.workspaceId, mentionedUserIds(trimmed));
  for (const userId of mentioned) {
    if (recipients.has(userId)) continue;
    await notify(userId, session.user.id, `${actor} mentioned you in a comment on '${task.title}'`, taskId);
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
