import type { Client } from "@/db/schema";
import { Field, Input, Select } from "@/components/ui";

const TIMEZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Riyadh", "Asia/Singapore", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

export function ClientFields({ client }: { client?: Client }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Company name">
        <Input name="name" defaultValue={client?.name} required />
      </Field>
      <Field label="Slug" help="Used in URLs and as the Instantly campaign prefix. Leave blank to derive from the name.">
        <Input name="slug" defaultValue={client?.slug} pattern="[a-z0-9-]+" />
      </Field>
      <Field label="Website">
        <Input name="website" type="url" defaultValue={client?.website ?? ""} placeholder="https://" />
      </Field>
      <Field label="Timezone">
        <Select name="timezone" defaultValue={client?.timezone ?? "UTC"}>
          {TIMEZONES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly AI budget (USD)" help="AI jobs pause for this client when the budget is exhausted.">
        <Input name="tokenBudgetMonthlyUsd" type="number" min={0} defaultValue={client?.tokenBudgetMonthlyUsd ?? 100} />
      </Field>
      <Field label="Instantly campaign prefix" help="All campaigns for this client are named with this prefix in the shared agency account.">
        <Input name="instantlyCampaignPrefix" defaultValue={client?.instantlyCampaignPrefix ?? ""} placeholder="[acme]" />
      </Field>
      <Field label="Instantly workspace ID" help="Optional. Set when the agency plan provides sub-workspaces.">
        <Input name="instantlyWorkspaceId" defaultValue={client?.instantlyWorkspaceId ?? ""} />
      </Field>
      {client ? (
        <Field label="Status">
          <Select name="status" defaultValue={client.status}>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended (users cannot sign in)</option>
          </Select>
        </Field>
      ) : null}
    </div>
  );
}
