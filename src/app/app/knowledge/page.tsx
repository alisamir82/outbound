import { desc, eq } from "drizzle-orm";
import { addKbTextAction, addKbUrlAction, deleteKbDocumentAction, reprocessKbDocumentAction, uploadKbFileAction } from "@/actions/kb";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Badge, Button, Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export const metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  const { clientId, canManage } = await requireClientScope();
  const docs = await db.query.kbDocuments.findMany({ where: eq(schema.kbDocuments.clientId, clientId), orderBy: desc(schema.kbDocuments.createdAt) });
  const processing = docs.some((d) => d.status === "processing");
  return (
    <>
      <PageHeader title="Knowledge base" subtitle="Case studies, decks, pricing notes and web pages Claude may cite when replying. Only facts from here are used." />
      <AutoRefresh active={processing} />
      {canManage ? (
        <div className="mb-6 grid gap-6 md:grid-cols-3">
          <Card title="Upload a file">
            <ActionForm action={uploadKbFileAction} submitLabel="Upload">
              <Field label="PDF, DOCX, PPTX, TXT or MD (max 25 MB)">
                <input type="file" name="file" accept=".pdf,.docx,.pptx,.txt,.md" className="block w-full text-sm" required />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Add a web page">
            <ActionForm action={addKbUrlAction} submitLabel="Fetch page">
              <Field label="URL">
                <Input name="url" type="url" placeholder="https://example.com/case-studies/acme" required />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Paste a note">
            <ActionForm action={addKbTextAction} submitLabel="Add note">
              <Field label="Name">
                <Input name="name" placeholder="Objection handling: pricing" required />
              </Field>
              <Field label="Text">
                <Textarea name="text" rows={4} required />
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}
      <Table head={["Document", "Type", "Status", "Chunks", "Added", ""]}>
        {docs.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2">
              <div className="font-medium">{d.name}</div>
              {d.sourceUrl ? <div className="text-xs text-zinc-500">{d.sourceUrl}</div> : null}
              {d.error ? <div className="text-xs text-red-600">{d.error}</div> : null}
            </td>
            <td className="px-4 py-2 uppercase text-zinc-500">{d.type}</td>
            <td className="px-4 py-2">
              <Badge tone={d.status === "ready" ? "green" : d.status === "failed" ? "red" : "amber"}>{d.status}</Badge>
            </td>
            <td className="px-4 py-2">{d.chunkCount}</td>
            <td className="px-4 py-2 text-zinc-500">{d.createdAt.toLocaleDateString()}</td>
            <td className="px-4 py-2 text-right">
              {canManage ? (
                <div className="flex justify-end gap-1">
                  {d.status === "failed" ? (
                    <form action={reprocessKbDocumentAction.bind(null, d.id)}>
                      <Button variant="ghost" className="h-7 text-xs">Retry</Button>
                    </form>
                  ) : null}
                  <form action={deleteKbDocumentAction.bind(null, d.id)}>
                    <Button variant="ghost" className="h-7 text-xs text-red-700">Delete</Button>
                  </form>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
        {docs.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
              Empty. Until you add material, Claude will escalate any question it cannot answer.
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
