import { tokenIsValid } from "@/actions/auth";
import { SetPasswordForm } from "@/components/set-password-form";

export const metadata = { title: "Accept invite" };

export default async function AcceptInvitePage({ params }: PageProps<"/accept-invite/[token]">) {
  const { token } = await params;
  if (!(await tokenIsValid(token, "invite")))
    return <p className="text-sm text-zinc-700">This invitation is invalid or has expired. Ask your administrator to send a new one.</p>;
  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">Welcome. Choose a password to activate your account.</p>
      <SetPasswordForm token={token} purpose="invite" />
    </>
  );
}
