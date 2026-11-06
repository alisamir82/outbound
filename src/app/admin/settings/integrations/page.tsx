import { saveIntegrationAction } from "@/actions/settings";
import { ActionForm } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Switch } from "@/components/ui";
import { getIntegration, INTEGRATIONS, type IntegrationKey } from "@/lib/settings";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const keys = Object.keys(INTEGRATIONS) as IntegrationKey[];
  const configs = await Promise.all(keys.map((k) => getIntegration(k)));

  return (
    <>
      <PageHeader title="Integrations" subtitle="Platform-wide providers. Secrets are encrypted at rest and never shown again after saving." />
      <div className="space-y-6">
        {keys.map((key, i) => {
          const def = INTEGRATIONS[key];
          const cfg = configs[i];
          return (
            <Card key={key} title={def.title}>
              <p className="mb-4 text-sm text-zinc-500">{def.description}</p>
              <ActionForm action={saveIntegrationAction} submitLabel="Save" hidden={{ key }}>
                <div className="grid gap-4 md:grid-cols-2">
                  {def.fields.map((f) => {
                    const v = cfg.value[f.name];
                    if (f.type === "select")
                      return (
                        <Field key={f.name} label={f.label} help={f.help}>
                          <Select name={f.name} defaultValue={String(v ?? f.options?.[0]?.value ?? "")}>
                            {f.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      );
                    if (f.type === "boolean") return <Switch key={f.name} name={f.name} defaultChecked={Boolean(v)} label={f.label} />;
                    if (f.type === "secret")
                      return (
                        <Field key={f.name} label={f.label} help={cfg.hasSecrets.includes(f.name) ? `Set. Leave blank to keep, or type __clear__ to remove.${f.help ? " " + f.help : ""}` : f.help}>
                          <Input name={f.name} type="password" autoComplete="off" placeholder={cfg.hasSecrets.includes(f.name) ? "••••••••" : ""} />
                        </Field>
                      );
                    return (
                      <Field key={f.name} label={f.label} help={f.help}>
                        <Input name={f.name} type={f.type === "number" ? "number" : "text"} defaultValue={v == null ? "" : String(v)} />
                      </Field>
                    );
                  })}
                </div>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
