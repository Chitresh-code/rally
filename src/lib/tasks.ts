import { requireEditableTask, requireListAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export type TaskStatusInput = "todo" | "in_progress" | "review" | "done";
export type TaskPriorityInput = "low" | "normal" | "high" | "urgent";
export type CustomFieldTypeInput = "TEXT" | "NUMBER" | "DATE" | "DROPDOWN";

type AttachmentInput = {
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
};

const statusByInput = { todo: "TODO", in_progress: "IN_PROGRESS", review: "IN_REVIEW", done: "DONE" } as const;
const priorityByInput = { low: "LOW", normal: "MEDIUM", high: "HIGH", urgent: "URGENT" } as const;

export async function createTask(actorId: string, listId: string, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;

  const access = await requireListAccess(actorId, listId);
  if (access.isGuest) throw new Error("Guests cannot create tasks");

  await prisma.task.create({
    data: {
      listId,
      title: trimmedTitle,
      createdById: actorId,
      assignees: { connect: [{ id: actorId }] },
    },
  });
}

export async function updateTaskStatus(actorId: string, taskId: string, status: TaskStatusInput) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: statusByInput[status] } });
}

export async function updateTaskPriority(actorId: string, taskId: string, priority: TaskPriorityInput) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { priority: priorityByInput[priority] } });
}

export async function updateTaskDueDate(actorId: string, taskId: string, dueDate: string | null) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { dueDate: dueDate ? new Date(dueDate) : null } });
}

export async function deleteTask(actorId: string, taskId: string) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}

export async function updateTaskDescription(actorId: string, taskId: string, description: string) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { description: description.trim() || null } });
}

export async function updateTaskTitle(actorId: string, taskId: string, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;

  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { title: trimmedTitle } });
}

export async function moveTaskToList(actorId: string, taskId: string, listId: string) {
  const task = await requireEditableTask(actorId, taskId);
  if (task.listId === listId) return;

  const [currentList, targetList] = await Promise.all([
    prisma.list.findUnique({ where: { id: task.listId }, select: { spaceId: true } }),
    prisma.list.findUnique({ where: { id: listId }, select: { spaceId: true } }),
  ]);

  if (!targetList || !currentList || targetList.spaceId !== currentList.spaceId) {
    throw new Error("Can't move a task to a different space");
  }

  await prisma.task.update({ where: { id: taskId }, data: { listId } });
}

export async function addTaskAssignee(actorId: string, taskId: string, assigneeId: string) {
  const task = await requireEditableTask(actorId, taskId);
  const assigneeAccess = await requireListAccess(assigneeId, task.listId).catch(() => null);
  if (!assigneeAccess || assigneeAccess.isGuest) throw new Error("That person doesn't have access to this task's space");

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { assignees: { connect: [{ id: assigneeId }] } },
    select: { title: true },
  });

  return updatedTask.title;
}

export async function removeTaskAssignee(actorId: string, taskId: string, assigneeId: string) {
  await requireEditableTask(actorId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { assignees: { disconnect: [{ id: assigneeId }] } } });
}

export async function addChecklistItem(actorId: string, taskId: string, text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  await requireEditableTask(actorId, taskId);
  const position = await prisma.checklistItem.count({ where: { taskId } });
  await prisma.checklistItem.create({ data: { taskId, text: trimmedText, position } });
}

export async function toggleChecklistItem(actorId: string, itemId: string, done: boolean) {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) throw new Error("Checklist item not found");

  await requireEditableTask(actorId, item.taskId);
  await prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
}

export async function deleteChecklistItem(actorId: string, itemId: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) return;

  await requireEditableTask(actorId, item.taskId);
  await prisma.checklistItem.delete({ where: { id: itemId } });
}

export async function createCustomField(actorId: string, listId: string, name: string, type: CustomFieldTypeInput, options: string[]) {
  const trimmedName = name.trim();
  if (!trimmedName) return;

  const access = await requireListAccess(actorId, listId);
  if (access.isGuest) throw new Error("Guests cannot add custom fields");

  const position = await prisma.customField.count({ where: { listId } });
  await prisma.customField.create({ data: { listId, name: trimmedName, type, options: type === "DROPDOWN" ? options.filter(Boolean) : [], position } });
}

export async function deleteCustomField(actorId: string, fieldId: string) {
  const field = await prisma.customField.findUnique({ where: { id: fieldId }, select: { listId: true } });
  if (!field) return;

  const access = await requireListAccess(actorId, field.listId);
  if (access.isGuest) throw new Error("Guests cannot delete custom fields");
  await prisma.customField.delete({ where: { id: fieldId } });
}

export async function setCustomFieldValue(actorId: string, taskId: string, fieldId: string, value: string) {
  const task = await requireEditableTask(actorId, taskId);
  const field = await prisma.customField.findFirst({ where: { id: fieldId, listId: task.listId }, select: { id: true } });
  if (!field) throw new Error("Custom field not found for this task");

  if (!value.trim()) {
    await prisma.customFieldValue.deleteMany({ where: { taskId, customFieldId: fieldId } });
    return;
  }

  await prisma.customFieldValue.upsert({
    where: { taskId_customFieldId: { taskId, customFieldId: fieldId } },
    update: { value },
    create: { taskId, customFieldId: fieldId, value },
  });
}

async function wouldCreateDependencyCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  if (taskId === dependsOnId) return true;

  const visited = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const currentId = stack.pop()!;
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const dependencies = await prisma.taskDependency.findMany({ where: { taskId: currentId }, select: { dependsOnId: true } });
    for (const dependency of dependencies) stack.push(dependency.dependsOnId);
  }

  return false;
}

export async function addTaskDependency(actorId: string, taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) throw new Error("A task can't depend on itself");

  await requireEditableTask(actorId, taskId);
  const dependency = await prisma.task.findUnique({ where: { id: dependsOnId }, select: { listId: true } });
  if (!dependency) throw new Error("Task not found");
  await requireListAccess(actorId, dependency.listId);

  if (await wouldCreateDependencyCycle(taskId, dependsOnId)) throw new Error("That would create a circular dependency");
  await prisma.taskDependency.upsert({ where: { taskId_dependsOnId: { taskId, dependsOnId } }, update: {}, create: { taskId, dependsOnId } });
}

export async function removeTaskDependency(actorId: string, taskId: string, dependsOnId: string) {
  await requireEditableTask(actorId, taskId);
  await prisma.taskDependency.deleteMany({ where: { taskId, dependsOnId } });
}

export async function createAttachment(actorId: string, taskId: string, attachment: AttachmentInput) {
  await requireEditableTask(actorId, taskId);
  await prisma.attachment.create({
    data: {
      taskId,
      url: attachment.storageKey,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      uploadedById: actorId,
    },
  });
}

export async function deleteAttachment(actorId: string, attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, url: true } });
  if (!attachment) return null;

  await requireEditableTask(actorId, attachment.taskId);
  await prisma.attachment.delete({ where: { id: attachmentId } });
  return attachment.url;
}
