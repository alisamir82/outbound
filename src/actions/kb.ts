"use server";

import { and, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { detectType } from "@/lib/kb/extract";
import { enqueue } from "@/lib/queue";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

const MAX_BYTES = 25 * 1024 * 1024;
const uploadDir = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export async function uploadKbFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can manage the knowledge base" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (file.size > MAX_BYTES) return { error: "File is larger than 25 MB" };
  const type = detectType(file.name, file.type);
  if (!type) return { error: "Supported formats: PDF, DOCX, PPTX, TXT, MD" };

  const [doc] = await db
    .insert(schema.kbDocuments)
    .values({ clientId, name: file.name, type, sizeBytes: file.size, uploadedBy: user.id })
    .returning();
  const dir = path.join(/*turbopackIgnore: true*/ uploadDir(), clientId);
  await mkdir(dir, { recursive: true });
  const storageKey = path.join(/*turbopackIgnore: true*/ dir, `${doc.id}.${type}`);
  await writeFile(storageKey, Buffer.from(await file.arrayBuffer()));
  await db.update(schema.kbDocuments).set({ storageKey }).where(eq(schema.kbDocuments.id, doc.id));
  await enqueue("agent/kb-document", { documentId: doc.id }, { jobId: `kb-${doc.id}` });
  await audit({ actorUserId: user.id, clientId, action: "kb.uploaded", entityType: "kb_document", entityId: doc.id, diff: { name: file.name, type } });
  revalidatePath("/app/knowledge");
  return { success: `${file.name} uploaded, processing…` };
}

export async function addKbUrlAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can manage the knowledge base" };
  const parsed = z.string().url().safeParse(formData.get("url"));
  if (!parsed.success) return { error: "Enter a valid URL" };
  const [doc] = await db.insert(schema.kbDocuments).values({ clientId, name: parsed.data, type: "url", sourceUrl: parsed.data, uploadedBy: user.id }).returning();
  await enqueue("agent/kb-document", { documentId: doc.id }, { jobId: `kb-${doc.id}` });
  await audit({ actorUserId: user.id, clientId, action: "kb.url_added", entityType: "kb_document", entityId: doc.id, diff: { url: parsed.data } });
  revalidatePath("/app/knowledge");
  return { success: "URL added, fetching…" };
}

export async function addKbTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can manage the knowledge base" };
  const name = String(formData.get("name") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (name.length < 2 || text.length < 50) return { error: "Give the note a name and at least a paragraph of text" };
  const [doc] = await db.insert(schema.kbDocuments).values({ clientId, name, type: "txt", sizeBytes: text.length, uploadedBy: user.id }).returning();
  const dir = path.join(/*turbopackIgnore: true*/ uploadDir(), clientId);
  await mkdir(dir, { recursive: true });
  const storageKey = path.join(/*turbopackIgnore: true*/ dir, `${doc.id}.txt`);
  await writeFile(storageKey, text, "utf8");
  await db.update(schema.kbDocuments).set({ storageKey }).where(eq(schema.kbDocuments.id, doc.id));
  await enqueue("agent/kb-document", { documentId: doc.id }, { jobId: `kb-${doc.id}` });
  await audit({ actorUserId: user.id, clientId, action: "kb.note_added", entityType: "kb_document", entityId: doc.id });
  revalidatePath("/app/knowledge");
  return { success: `${name} added` };
}

export async function deleteKbDocumentAction(documentId: string) {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  const rows = await db.delete(schema.kbDocuments).where(and(eq(schema.kbDocuments.id, documentId), eq(schema.kbDocuments.clientId, clientId))).returning({ id: schema.kbDocuments.id });
  if (rows.length) await audit({ actorUserId: user.id, clientId, action: "kb.deleted", entityType: "kb_document", entityId: documentId });
  revalidatePath("/app/knowledge");
}

export async function reprocessKbDocumentAction(documentId: string) {
  const { clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  const doc = await db.query.kbDocuments.findFirst({ where: and(eq(schema.kbDocuments.id, documentId), eq(schema.kbDocuments.clientId, clientId)) });
  if (!doc) return;
  await db.update(schema.kbDocuments).set({ status: "processing", error: null }).where(eq(schema.kbDocuments.id, documentId));
  await enqueue("agent/kb-document", { documentId }, { jobId: `kb-${documentId}-${Date.now()}` });
  revalidatePath("/app/knowledge");
}
