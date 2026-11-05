import Link from "next/link";
import { forgotPasswordAction } from "@/actions/auth";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">Enter your email and we will send you a magic link to set a new password.</p>
      <ActionForm action={forgotPasswordAction} submitLabel="Send reset link">
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-zinc-600 underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
