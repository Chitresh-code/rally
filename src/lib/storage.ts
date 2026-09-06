import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

// ponytail: local disk storage, fine for a single-instance deployment.
// Swap for an S3-compatible adapter (same three functions) once this runs
// on more than one instance or needs durability across deploys.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "attachments");

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Saves the file under a server-generated key (never the user's filename) and returns that key. */
export async function saveAttachmentFile(file: File): Promise<string> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  const key = crypto.randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_ROOT, key), buffer);
  return key;
}

export async function readAttachmentFile(key: string): Promise<Buffer> {
  return readFile(path.join(STORAGE_ROOT, key));
}

export async function deleteAttachmentFile(key: string): Promise<void> {
  await unlink(path.join(STORAGE_ROOT, key));
}
