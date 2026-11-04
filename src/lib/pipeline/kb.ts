import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db, schema } from "@/db";
import { chunkText } from "@/lib/kb/chunk";
import { extractText, fetchUrlText, type KbSourceType } from "@/lib/kb/extract";

export async function processKbDocument(documentId: string) {
  const doc = await db.query.kbDocuments.findFirst({ where: eq(schema.kbDocuments.id, documentId) });
  if (!doc) throw new Error("document not found");
  try {
    let text: string;
    if (doc.type === "url") {
      if (!doc.sourceUrl) throw new Error("missing URL");
      const r = await fetchUrlText(doc.sourceUrl);
      text = r.text;
      if (doc.name === doc.sourceUrl) await db.update(schema.kbDocuments).set({ name: r.title.slice(0, 120) }).where(eq(schema.kbDocuments.id, documentId));
    } else {
      if (!doc.storageKey) throw new Error("missing file");
      text = await extractText(doc.type as KbSourceType, await readFile(doc.storageKey));
    }
    const chunks = chunkText(text);
    await db.transaction(async (tx) => {
      await tx.delete(schema.kbChunks).where(eq(schema.kbChunks.documentId, documentId));
      if (chunks.length) {
        await tx.insert(schema.kbChunks).values(chunks.map((c, i) => ({ documentId, clientId: doc.clientId, ordinal: i, chunkText: c.text, heading: c.heading })));
      }
      await tx.update(schema.kbDocuments).set({ status: "ready", chunkCount: chunks.length, error: null }).where(eq(schema.kbDocuments.id, documentId));
    });
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, doc.clientId), columns: { onboarding: true } });
    if (client && !client.onboarding.knowledgeBase) {
      await db.update(schema.clients).set({ onboarding: { ...client.onboarding, knowledgeBase: true } }).where(eq(schema.clients.id, doc.clientId));
    }
  } catch (e) {
    await db.update(schema.kbDocuments).set({ status: "failed", error: (e as Error).message }).where(eq(schema.kbDocuments.id, documentId));
    throw e;
  }
}
