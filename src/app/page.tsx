import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadRallyAppData } from "@/lib/rally-app-data";
import RallyApp from "./RallyApp";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const appData = await loadRallyAppData({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  if (!appData) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "system-ui, sans-serif" }}>You&apos;re not a member of any workspace yet.</div>;
  }

  return <RallyApp {...appData} />;
}
