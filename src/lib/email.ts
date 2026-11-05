import { Resend } from "resend";

type Mail = { to: string; subject: string; html: string; text?: string };

let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMail(mail: Mail): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "AI Outbound <no-reply@example.com>";
  if (!resend) {
    console.log(`\n[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text ?? mail.html}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from, ...mail });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export function inviteEmail(opts: { to: string; inviterName: string; clientName: string | null; token: string }) {
  const url = `${appUrl()}/accept-invite/${opts.token}`;
  const where = opts.clientName ? `the ${opts.clientName} workspace` : "the platform admin console";
  return sendMail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to AI Outbound`,
    text: `You have been invited to ${where}. Set your password here (valid 7 days): ${url}`,
    html: `<p>You have been invited to ${where}.</p><p><a href="${url}">Set your password</a> (link valid for 7 days).</p>`,
  });
}

export function passwordResetEmail(opts: { to: string; token: string }) {
  const url = `${appUrl()}/reset-password/${opts.token}`;
  return sendMail({
    to: opts.to,
    subject: "Reset your AI Outbound password",
    text: `Use this link to set a new password (valid 1 hour): ${url}`,
    html: `<p><a href="${url}">Set a new password</a> (link valid for 1 hour).</p><p>If you did not request this, ignore this email.</p>`,
  });
}
