import Image from "next/image";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/app/actions";

const ACCENT = "oklch(0.68 0.16 35)";
const BORDER = "oklch(0.9 0.006 60)";
const MUTED = "oklch(0.5 0.01 60)";

async function submit(formData: FormData) {
  "use server";
  await requestPasswordReset((formData.get("email") as string) ?? "");
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;

  return (
    <div style={{ minHeight: "100dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.985 0.004 60)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Image src="/logo-black.png" alt="Rally" width={2029} height={775} priority style={{ height: "auto", width: 80, maxWidth: 2029, maxHeight: 775, alignSelf: "center" }} />
          <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Reset your password</p>
        </div>

        {sent ? (
          <p style={{ margin: 0, fontSize: 13, color: "oklch(0.4 0.1 150)", background: "oklch(0.94 0.05 150)", borderRadius: 8, padding: "8px 12px" }}>
            If that email has an account, we&apos;ve sent a link to reset the password. It expires in 1 hour.
          </p>
        ) : (
          <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
              Email
              <input
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                suppressHydrationWarning
                style={{ fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, outline: "none", fontFamily: "inherit" }}
              />
            </label>
            <button
              type="submit"
              style={{ marginTop: 4, fontSize: 14, fontWeight: 700, padding: "10px 12px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
            >
              Send reset link
            </button>
          </form>
        )}

        <a href="/login" style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
          Back to sign in
        </a>
      </div>
    </div>
  );
}
