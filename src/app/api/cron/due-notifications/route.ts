import { NextRequest, NextResponse } from "next/server";
import { checkDueDateNotifications } from "@/app/actions";

// Vercel Cron fires this hourly (see vercel.json); the DUE_NOTIFY_HOUR gate
// below turns that into "once a day, at a UTC hour you can change via env
// var without editing vercel.json's cron expression."
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetHour = Number(process.env.DUE_NOTIFY_HOUR ?? 8);
  const currentHour = new Date().getUTCHours();
  if (currentHour !== targetHour) {
    return NextResponse.json({ skipped: true, currentHour, targetHour });
  }

  await checkDueDateNotifications();
  return NextResponse.json({ ok: true });
}
