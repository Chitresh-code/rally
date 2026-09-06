import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { acceptInvite } from "@/app/actions";

const ACCENT = "oklch(0.68 0.16 35)";
const BORDER = "oklch(0.9 0.006 60)";
const MUTED = "oklch(0.5 0.01 60)";

const ROLE_LABEL: Record<string, string> = { OWNER: "owner", ADMIN: "admin", MEMBER: "member", GUEST: "guest" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.985 0.004 60)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        <Image src="/logo-black.png" alt="Rally" width={2029} height={775} priority style={{ height: "auto", width: 80, maxWidth: 2029, maxHeight: 775, alignSelf: "center" }} />
        {children}
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { workspace: true, space: true, list: true },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <Shell>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
          {!invite ? "This invite link isn't valid." : invite.acceptedAt ? "This invite has already been used." : "This invite has expired."} Ask whoever invited you to send a new one.
        </p>
      </Shell>
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });

  async function submit(formData: FormData) {
    "use server";
    let errorMessage: string | null = null;
    try {
      await acceptInvite({
        token,
        name: (formData.get("name") as string) ?? "",
        password: (formData.get("password") as string) ?? "",
      });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Something went wrong accepting this invite. Try again.";
    }
    if (errorMessage) redirect(`/invite/${token}?error=${encodeURIComponent(errorMessage)}`);
    redirect("/login?accepted=1");
  }

  const scope = invite.space ? `space "${invite.space.name}"` : invite.list ? `list "${invite.list.name}"` : `workspace "${invite.workspace.name}"`;

  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
          You&apos;ve been invited to join <strong>{invite.workspace.name}</strong> as {ROLE_LABEL[invite.role] ?? invite.role.toLowerCase()}, with access to {scope}.
        </p>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "oklch(0.4 0.15 25)", background: "oklch(0.94 0.06 25)", borderRadius: 8, padding: "8px 12px" }}>
          {decodeURIComponent(error)}
        </p>
      )}

      {existingUser ? (
        <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>You already have a Rally account ({invite.email}). Accepting will add this access to your existing account.</p>
          <button
            type="submit"
            style={{ fontSize: 14, fontWeight: 700, padding: "10px 12px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
          >
            Accept invite
          </button>
        </form>
      ) : (
        <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
            Your name
            <input name="name" required placeholder="Jordan Tran" style={{ fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, outline: "none", fontFamily: "inherit" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              suppressHydrationWarning
              style={{ fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, outline: "none", fontFamily: "inherit" }}
            />
          </label>
          <button
            type="submit"
            style={{ marginTop: 4, fontSize: 14, fontWeight: 700, padding: "10px 12px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
          >
            Create account
          </button>
        </form>
      )}
    </Shell>
  );
}
