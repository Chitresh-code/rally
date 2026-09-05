"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertListAccess(userId: string, listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: { space: true, guestShares: { where: { userId } } },
  });
  if (!list) throw new Error("List not found");

  const membership = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: list.space.workspaceId } },
  });
  const isGuest = membership?.role === "GUEST";
  const hasAccess = (membership && !isGuest) || list.guestShares.length > 0;
  if (!hasAccess) throw new Error("Forbidden");

  return { isGuest };
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
  await prisma.task.update({ where: { id: taskId }, data: { assignees: { set: [{ id: userId }] } } });
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

export async function postComment(taskId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { listId: true } });
  if (!task) return;
  await assertListAccess(session.user.id, task.listId);

  await prisma.comment.create({ data: { taskId, authorId: session.user.id, body: trimmed } });
  revalidatePath("/");
}
