import { inviteUserAction } from "@/actions/clients";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";

export function InviteForm({ clientId, roles }: { clientId: string | null; roles: { value: string; label: string }[] }) {
  return (
    <ActionForm action={inviteUserAction} submitLabel="Send invitation" hidden={{ clientId: clientId ?? "" }} className="grid gap-3 md:grid-cols-4 md:items-end">
      <Field label="Name">
        <Input name="name" required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" required />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={roles[0].value}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}
