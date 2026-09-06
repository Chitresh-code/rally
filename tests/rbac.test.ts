// Exercises the RBAC ladder against a real (local dev) Postgres DB:
// requireListAccess/requireEditableTask (src/lib/access.ts) and the
// space-management guards (src/app/actions.ts). All fixtures live under one
// throwaway workspace, deleted in `after`.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@/lib/prisma";
import { requireEditableTask, requireListAccess } from "@/lib/access";
import { assertManagesSpace, assertSpaceAccess } from "@/app/actions";

const ids = {
  workspace: "",
  spaceA: "",
  spaceB: "",
  listA: "",
  listB: "",
  taskA: "",
  owner: "",
  admin: "",
  member: "",
  guest: "",
  outsider: "",
};

before(async () => {
  const workspace = await prisma.workspace.create({ data: { name: "RBAC Test Co", slug: `rbac-test-${Date.now()}` } });
  ids.workspace = workspace.id;

  const [owner, admin, member, guest, outsider] = await Promise.all(
    ["owner", "admin", "member", "guest", "outsider"].map((label) =>
      prisma.user.create({ data: { email: `${label}-${Date.now()}@rbac.test`, name: label } })
    )
  );
  ids.owner = owner.id;
  ids.admin = admin.id;
  ids.member = member.id;
  ids.guest = guest.id;
  ids.outsider = outsider.id;

  await prisma.userMembership.createMany({
    data: [
      { userId: owner.id, workspaceId: workspace.id, role: "OWNER" },
      { userId: admin.id, workspaceId: workspace.id, role: "ADMIN" },
      { userId: member.id, workspaceId: workspace.id, role: "MEMBER" },
      { userId: guest.id, workspaceId: workspace.id, role: "GUEST" },
      // outsider is intentionally left with no membership row at all.
    ],
  });

  const spaceA = await prisma.space.create({ data: { workspaceId: workspace.id, name: "Space A" } });
  const spaceB = await prisma.space.create({ data: { workspaceId: workspace.id, name: "Space B" } });
  ids.spaceA = spaceA.id;
  ids.spaceB = spaceB.id;

  // admin and member manage/belong to Space A only, not Space B.
  await prisma.spaceMember.createMany({
    data: [
      { userId: admin.id, spaceId: spaceA.id },
      { userId: member.id, spaceId: spaceA.id },
    ],
  });

  const listA = await prisma.list.create({ data: { spaceId: spaceA.id, name: "List A" } });
  const listB = await prisma.list.create({ data: { spaceId: spaceB.id, name: "List B" } });
  ids.listA = listA.id;
  ids.listB = listB.id;

  // guest can only see List A via an explicit GuestShare.
  await prisma.guestShare.create({ data: { workspaceId: workspace.id, userId: guest.id, listId: listA.id } });

  const taskA = await prisma.task.create({ data: { listId: listA.id, title: "Task A", createdById: owner.id } });
  ids.taskA = taskA.id;
});

after(async () => {
  // Workspace delete cascades memberships/spaces/lists/spaceMembers/guestShares/tasks;
  // users have no workspaceId so they're deleted separately.
  await prisma.workspace.delete({ where: { id: ids.workspace } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.admin, ids.member, ids.guest, ids.outsider] } } });
});

describe("requireListAccess", () => {
  test("owner can access any list, even outside spaces they manage", async () => {
    await assert.doesNotReject(requireListAccess(ids.owner, ids.listA));
    await assert.doesNotReject(requireListAccess(ids.owner, ids.listB));
  });

  test("admin/member can access lists only in spaces they belong to", async () => {
    await assert.doesNotReject(requireListAccess(ids.admin, ids.listA));
    await assert.rejects(requireListAccess(ids.admin, ids.listB), /Forbidden/);
    await assert.doesNotReject(requireListAccess(ids.member, ids.listA));
    await assert.rejects(requireListAccess(ids.member, ids.listB), /Forbidden/);
  });

  test("guest can access only lists explicitly shared with them", async () => {
    const access = await requireListAccess(ids.guest, ids.listA);
    assert.equal(access.isGuest, true);
    await assert.rejects(requireListAccess(ids.guest, ids.listB), /Forbidden/);
  });

  test("a user with no workspace membership is forbidden everywhere", async () => {
    await assert.rejects(requireListAccess(ids.outsider, ids.listA), /Forbidden/);
  });
});

describe("requireEditableTask", () => {
  test("guests cannot edit tasks even on lists shared with them", async () => {
    await assert.rejects(requireEditableTask(ids.guest, ids.taskA), /Guests cannot edit tasks/);
  });

  test("a member with list access can edit the task", async () => {
    await assert.doesNotReject(requireEditableTask(ids.member, ids.taskA));
  });
});

describe("assertManagesSpace", () => {
  test("owner manages every space regardless of SpaceMember rows", async () => {
    await assert.doesNotReject(assertManagesSpace(ids.owner, "OWNER", ids.spaceB));
  });

  test("admin manages only spaces they're a SpaceMember of", async () => {
    await assert.doesNotReject(assertManagesSpace(ids.admin, "ADMIN", ids.spaceA));
    await assert.rejects(assertManagesSpace(ids.admin, "ADMIN", ids.spaceB), /don't manage this space/);
  });

  test("a plain member can never manage a space", async () => {
    await assert.rejects(assertManagesSpace(ids.member, "MEMBER", ids.spaceA), /Forbidden/);
  });
});

describe("assertSpaceAccess", () => {
  test("owner has access to every space", async () => {
    await assert.doesNotReject(assertSpaceAccess(ids.owner, "OWNER", ids.spaceB));
  });

  test("member has access only to spaces they're a SpaceMember of", async () => {
    await assert.doesNotReject(assertSpaceAccess(ids.member, "MEMBER", ids.spaceA));
    await assert.rejects(assertSpaceAccess(ids.member, "MEMBER", ids.spaceB), /Forbidden/);
  });
});
