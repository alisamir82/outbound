import { eq } from "drizzle-orm";
import { resetSkillOverrideAction, saveSkillOverrideAction } from "@/actions/skills";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { SKILLS, type SkillKey } from "@/lib/ai/skills";
import { requireClientScope } from "@/lib/session";

export default async function SkillsPage() {
  const { clientId, canManage } = await requireClientScope();
  const overrides = await db.query.skillOverrides.findMany({ where: eq(schema.skillOverrides.clientId, clientId) });
  const byKey = new Map(overrides.map((o) => [o.skillKey, o]));
  const keys = Object.keys(SKILLS) as SkillKey[];
  return (
    <>
      <PageHeader title="AI skills" subtitle="The instructions Claude follows for this workspace. Global defaults apply unless you override them here." />
      <div className="space-y-6">
        {keys.map((key) => {
          const def = SKILLS[key];
          const o = byKey.get(key);
          return (
            <Card
              key={key}
              title={def.title}
              actions={
                o ? (
                  <div className="flex items-center gap-2">
                    <Badge tone="amber">Overridden</Badge>
                    {canManage ? (
                      <form action={resetSkillOverrideAction.bind(null, key)}>
                        <Button variant="ghost" className="h-7 text-xs">
                          Reset to default
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <Badge>Default</Badge>
                )
              }
            >
              <p className="mb-3 text-sm text-zinc-500">{def.description}</p>
              {canManage ? (
                <ActionForm action={saveSkillOverrideAction} submitLabel="Save override" hidden={{ skillKey: key }}>
                  <Textarea name="content" rows={14} defaultValue={o?.content ?? def.content} className="font-mono text-xs" />
                </ActionForm>
              ) : (
                <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs">{o?.content ?? def.content}</pre>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
