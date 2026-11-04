import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { ActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <>
      {sp.reset ? <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password set. You can sign in now.</p> : null}
      <ActionForm action={loginAction} submitLabel="Sign in" hidden={{ next }}>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-zinc-600 underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}
