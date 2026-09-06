import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertListAccess } from "@/app/actions";
import { readAttachmentFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: { url: true, filename: true, mimeType: true, task: { select: { listId: true } } },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  try {
    await assertListAccess(session.user.id, attachment.task.listId);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const buffer = await readAttachmentFile(attachment.url);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
