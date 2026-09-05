import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@rally.local" },
    update: {},
    create: { email: "owner@rally.local", name: "Rally Owner", passwordHash },
  });
  const mina = await prisma.user.upsert({
    where: { email: "mina@rally.local" },
    update: {},
    create: { email: "mina@rally.local", name: "Mina Kwon", passwordHash },
  });
  const priya = await prisma.user.upsert({
    where: { email: "priya@rally.local" },
    update: {},
    create: { email: "priya@rally.local", name: "Priya Shah", passwordHash },
  });
  const guest = await prisma.user.upsert({
    where: { email: "guest@rally.local" },
    update: {},
    create: { email: "guest@rally.local", name: "Alex Rivera", passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "rally" },
    update: {},
    create: { name: "Rally", slug: "rally" },
  });

  for (const [userId, role] of [
    [owner.id, "OWNER"],
    [mina.id, "MEMBER"],
    [priya.id, "MEMBER"],
    [guest.id, "GUEST"],
  ] as const) {
    await prisma.userMembership.upsert({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
      update: {},
      create: { userId, workspaceId: workspace.id, role },
    });
  }

  async function ensureSpace(name: string) {
    const existing = await prisma.space.findFirst({ where: { workspaceId: workspace.id, name } });
    return existing ?? prisma.space.create({ data: { workspaceId: workspace.id, name } });
  }
  async function ensureList(spaceId: string, name: string, isSprint = false) {
    const existing = await prisma.list.findFirst({ where: { spaceId, name } });
    return existing ?? prisma.list.create({ data: { spaceId, name, isSprint } });
  }

  const engineering = await ensureSpace("Engineering");
  const clientWork = await ensureSpace("Client Work");
  const backlog = await ensureList(engineering.id, "Backlog");
  const sprint1 = await ensureList(engineering.id, "Sprint 1", true);
  const websiteRedesign = await ensureList(clientWork.id, "Website Redesign", true);

  await prisma.guestShare.upsert({
    where: { userId_listId: { userId: guest.id, listId: websiteRedesign.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: guest.id, listId: websiteRedesign.id },
  });

  const tasks = [
    { listId: sprint1.id, title: "Fix login bug", status: "IN_PROGRESS", priority: "URGENT", dueDate: "2026-09-08", assignee: owner, desc: "Users on Safari are getting logged out after roughly two minutes. Looks like a session cookie issue." },
    { listId: backlog.id, title: "Set up CI pipeline", status: "TODO", priority: "HIGH", dueDate: "2026-09-10", assignee: mina, desc: "Run lint, typecheck and tests on every PR before merge." },
    { listId: sprint1.id, title: "Design task detail modal", status: "IN_PROGRESS", priority: "MEDIUM", dueDate: "2026-09-12", assignee: owner, desc: "Slide-over panel with assignee, priority, due date, checklist and comments.", subtasks: [{ title: "Layout", status: "DONE" }, { title: "Assignee field", status: "DONE" }, { title: "Checklist section", status: "DONE" }, { title: "Comments section", status: "TODO" }, { title: "Wire to real data", status: "TODO" }] },
    { listId: backlog.id, title: "Write onboarding docs", status: "TODO", priority: "LOW", dueDate: "2026-09-15", assignee: priya, desc: "One-pager for new team members covering workspace, spaces, lists and roles." },
    { listId: sprint1.id, title: "Guest share links", status: "IN_REVIEW", priority: "HIGH", dueDate: "2026-09-09", assignee: mina, desc: "Generate a scoped share link so guests only see one list.", subtasks: [{ title: "Schema", status: "DONE" }, { title: "Server-side scoping", status: "DONE" }, { title: "Guest sidebar UI", status: "DONE" }, { title: "Share link UI", status: "DONE" }] },
    { listId: backlog.id, title: "Slack notification webhook", status: "TODO", priority: "MEDIUM", dueDate: "2026-09-18", assignee: owner, desc: "Push task-assigned and due-soon events to a chosen Slack channel." },
    { listId: sprint1.id, title: "Fix mobile nav overlap", status: "DONE", priority: "MEDIUM", dueDate: "2026-09-05", assignee: priya, desc: "Bottom tab bar overlapped the composer on small screens." },
    { listId: sprint1.id, title: "Sprint 14 retro notes", status: "DONE", priority: "LOW", dueDate: "2026-09-05", assignee: mina, desc: "What went well, what to change for Sprint 15." },
    { listId: websiteRedesign.id, title: "Homepage redesign", status: "IN_PROGRESS", priority: "HIGH", dueDate: "2026-09-20", assignee: owner, desc: "New hero section and updated nav per the approved wireframes." },
    { listId: websiteRedesign.id, title: "Update pricing page copy", status: "TODO", priority: "MEDIUM", dueDate: "2026-09-22", assignee: priya, desc: "Reflect the new three-tier pricing structure." },
    { listId: websiteRedesign.id, title: "QA pass on staging", status: "IN_REVIEW", priority: "URGENT", dueDate: "2026-09-19", assignee: mina, desc: "Full pass before Friday client review." },
  ] as const;

  for (const t of tasks) {
    const existing = await prisma.task.findFirst({ where: { listId: t.listId, title: t.title } });
    if (existing) continue;
    const task = await prisma.task.create({
      data: {
        listId: t.listId,
        title: t.title,
        description: t.desc,
        status: t.status,
        priority: t.priority,
        dueDate: new Date(t.dueDate),
        createdById: owner.id,
        assignees: { connect: [{ id: t.assignee.id }] },
      },
    });
    if ("subtasks" in t && t.subtasks) {
      for (const st of t.subtasks) {
        await prisma.task.create({
          data: { listId: t.listId, title: st.title, status: st.status, createdById: owner.id, parentId: task.id },
        });
      }
    }
  }

  const loginBug = await prisma.task.findFirst({ where: { listId: sprint1.id, title: "Fix login bug" } });
  if (loginBug) {
    const existingComments = await prisma.comment.count({ where: { taskId: loginBug.id } });
    if (existingComments === 0) {
      await prisma.comment.createMany({
        data: [
          { taskId: loginBug.id, authorId: mina.id, body: "Repro'd on Safari 17, looks like the cookie is missing SameSite." },
          { taskId: loginBug.id, authorId: owner.id, body: "Good catch, pushing a fix now." },
        ],
      });
    }
  }

  console.log(`Seeded workspace "${workspace.name}" (owner/mina/priya/guest, password: password123)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
