import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type KbHit = { id: string; documentId: string; documentName: string; heading: string | null; text: string; rank: number };

/**
 * Full-text search over a client's knowledge base (Postgres tsvector, GIN index).
 * Swap point for embeddings: keep the signature, change the ranking query.
 */
export async function searchKb(clientId: string, query: string, k = 5): Promise<KbHit[]> {
  const q = query.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!q) return [];
  // Strict match first (all terms), then any-term fallback so a short reply still surfaces proof points.
  const strict = await run(clientId, q, k);
  if (strict.length) return strict;
  const terms = [...new Set(q.toLowerCase().split(" ").filter((w) => w.length > 3))];
  if (!terms.length) return [];
  return run(clientId, terms.join(" or "), k);
}

async function run(clientId: string, q: string, k: number): Promise<KbHit[]> {
  const rows = await db
    .select({
      id: schema.kbChunks.id,
      documentId: schema.kbChunks.documentId,
      documentName: schema.kbDocuments.name,
      heading: schema.kbChunks.heading,
      text: schema.kbChunks.chunkText,
      rank: sql<number>`ts_rank_cd(to_tsvector('english', ${schema.kbChunks.chunkText}), websearch_to_tsquery('english', ${q}))`,
    })
    .from(schema.kbChunks)
    .innerJoin(schema.kbDocuments, eq(schema.kbDocuments.id, schema.kbChunks.documentId))
    .where(
      and(
        eq(schema.kbChunks.clientId, clientId),
        eq(schema.kbDocuments.status, "ready"),
        sql`to_tsvector('english', ${schema.kbChunks.chunkText}) @@ websearch_to_tsquery('english', ${q})`,
      ),
    )
    .orderBy(sql`6 desc`)
    .limit(k);
  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}
