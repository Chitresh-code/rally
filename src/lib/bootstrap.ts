import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WORKSPACE_NAME = "Rally";
const WORKSPACE_SLUG = "rally";

// ponytail: keys the "already an owner" check off SEED_OWNER_EMAIL, so rotating
// that env var after bootstrap adds a second OWNER rather than migrating the
// existing one. Add an explicit ownership-transfer action if that's ever needed.
export async function ensureOwnerBootstrap() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("Set SEED_OWNER_EMAIL in .env — Rally needs an owner email to bootstrap the workspace.");

  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { name: WORKSPACE_NAME, slug: WORKSPACE_SLUG },
  });

  const existingOwner = await prisma.userMembership.findFirst({
    where: { workspaceId: workspace.id, role: "OWNER", user: { email: ownerEmail } },
  });
  if (existingOwner) return;

  const pendingInvite = await prisma.invite.findFirst({
    where: { workspaceId: workspace.id, role: "OWNER", email: ownerEmail, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  const url = (token: string) => `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  if (pendingInvite) {
    console.log(`Owner invite already pending for ${ownerEmail}. Accept it here: ${url(pendingInvite.token)}`);
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.invite.create({
    data: {
      email: ownerEmail,
      role: "OWNER",
      token,
      workspaceId: workspace.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  console.log(`No owner yet — invite sent to ${ownerEmail}. Accept it here: ${url(token)}`);
  try {
    await sendMail(ownerEmail, "Set up your Rally workspace", `You're the owner of a new Rally workspace. Set your password to get started: ${url(token)}`);
  } catch (err) {
    console.error("Failed to send owner invite email", err);
  }
}
