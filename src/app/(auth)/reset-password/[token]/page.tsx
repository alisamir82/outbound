import Link from "next/link";
import { tokenIsValid } from "@/actions/auth";
import { SetPasswordForm } from "@/components/set-password-form";

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  if (!(await tokenIsValid(token, "password_reset")))
    return (
      <p className="text-sm text-zinc-700">
        This link is invalid or has expired.{" "}
        <Link href="/forgot-password" className="underline">
          Request a new one
        </Link>
        .
      </p>
    );
  return <SetPasswordForm token={token} purpose="password_reset" />;
}
