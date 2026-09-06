import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resetPassword } from "@/app/actions";

const ACCENT = "oklch(0.68 0.16 35)";
const BORDER = "oklch(0.9 0.006 60)";
const MUTED = "oklch(0.5 0.01 60)";

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

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!reset || reset.expiresAt < new Date()) {
    return (
      <Shell>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
          This reset link isn&apos;t valid or has expired. Request a new one from the <a href="/forgot-password" style={{ color: ACCENT }}>forgot password</a> page.
        </p>
      </Shell>
    );
  }

  async function submit(formData: FormData) {
    "use server";
    let errorMessage: string | null = null;
    try {
      await resetPassword({ token, password: (formData.get("password") as string) ?? "" });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Something went wrong resetting your password. Try again.";
    }
    if (errorMessage) redirect(`/reset-password/${token}?error=${encodeURIComponent(errorMessage)}`);
    redirect("/login?reset=1");
  }

  return (
    <Shell>
      <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Choose a new password.</p>

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "oklch(0.4 0.15 25)", background: "oklch(0.94 0.06 25)", borderRadius: 8, padding: "8px 12px" }}>
          {decodeURIComponent(error)}
        </p>
      )}

      <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
          New password
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
          Reset password
        </button>
      </form>
    </Shell>
  );
}
