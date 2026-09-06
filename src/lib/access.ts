import { prisma } from "@/lib/prisma";

export type ListAccess = {
  isGuest: boolean;
  workspaceId: string;
  spaceId: string;
};

export type EditableTask = {
  id: string;
  listId: string;
  workspaceId: string;
  spaceId: string;
};

export async function requireListAccess(userId: string, listId: string): Promise<ListAccess> {
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

  if (!membership) throw new Error("Forbidden");

  if (membership.role === "GUEST") {
    if (list.guestShares.length === 0) throw new Error("Forbidden");
    return { isGuest: true, workspaceId: list.space.workspaceId, spaceId: list.spaceId };
  }

  if (membership.role === "OWNER") {
    return { isGuest: false, workspaceId: list.space.workspaceId, spaceId: list.spaceId };
  }

  if (list.space.members.length === 0) throw new Error("Forbidden");
  return { isGuest: false, workspaceId: list.space.workspaceId, spaceId: list.spaceId };
}

export async function requireEditableTask(userId: string, taskId: string): Promise<EditableTask> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, listId: true } });
  if (!task) throw new Error("Task not found");

  const access = await requireListAccess(userId, task.listId);
  if (access.isGuest) throw new Error("Guests cannot edit tasks");

  return { id: task.id, listId: task.listId, workspaceId: access.workspaceId, spaceId: access.spaceId };
}
