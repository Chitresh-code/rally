import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

const ACCENT = "oklch(0.68 0.16 35)";
const BORDER = "oklch(0.9 0.006 60)";
const MUTED = "oklch(0.5 0.01 60)";

async function loginWithPassword(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`);
    }
    throw error;
  }
}

async function loginWithEmail(formData: FormData) {
  "use server";
  try {
    await signIn("nodemailer", {
      email: formData.get("email"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`);
    }
    throw error;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email or password isn't right.",
  Default: "Something went wrong signing you in. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; accepted?: string }>;
}) {
  const { error, sent, accepted } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default : null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.985 0.004 60)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Image src="/logo-black.png" alt="Rally" width={2029} height={775} priority style={{ height: "auto", width: 80, maxWidth: 2029, maxHeight: 775, alignSelf: "center" }} />
          <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Sign in to your workspace</p>
        </div>

        {sent && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "oklch(0.4 0.1 150)",
              background: "oklch(0.94 0.05 150)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            Check your email for a sign-in link.
          </p>
        )}
        {accepted && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "oklch(0.4 0.1 150)",
              background: "oklch(0.94 0.05 150)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            Invite accepted. Sign in with your password.
          </p>
        )}
        {errorMessage && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "oklch(0.4 0.15 25)",
              background: "oklch(0.94 0.06 25)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            {errorMessage}
          </p>
        )}

        <form action={loginWithPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              suppressHydrationWarning
              style={{
                fontSize: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "oklch(0.35 0.01 60)" }}>
            Password
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••"
              suppressHydrationWarning
              style={{
                fontSize: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 4,
              fontSize: 14,
              fontWeight: 700,
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: ACCENT,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign in
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: BORDER }} />
          <span style={{ fontSize: 12, color: MUTED }}>or</span>
          <div style={{ flex: 1, height: 1, background: BORDER }} />
        </div>

        <form action={loginWithEmail} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            suppressHydrationWarning
            style={{
              fontSize: 14,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: "#fff",
              color: "oklch(0.3 0.01 60)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Send magic link
          </button>
        </form>
      </div>
    </div>
  );
}
