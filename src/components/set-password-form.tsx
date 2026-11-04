import { setPasswordWithTokenAction } from "@/actions/auth";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";

export function SetPasswordForm({ token, purpose }: { token: string; purpose: "invite" | "password_reset" }) {
  return (
    <ActionForm action={setPasswordWithTokenAction} submitLabel={purpose === "invite" ? "Create account" : "Set password"} hidden={{ token, purpose }}>
      <Field label="New password" help="At least 10 characters with upper-case, lower-case and a digit.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
    </ActionForm>
  );
}
