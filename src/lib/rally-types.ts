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
