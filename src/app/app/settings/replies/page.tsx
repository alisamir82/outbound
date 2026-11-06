import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connectMockCalendarAction, disconnectCalendarAction, saveReplySettingsAction } from "@/actions/reply-settings";
import { ActionForm } from "@/components/forms";
import { Slider } from "@/components/slider";
import { Textarea } from "@/components/textarea";
import { Badge, Button, Card, Field, Input, LinkButton, PageHeader, Select, Switch } from "@/components/ui";
import { db, schema } from "@/db";
import { getIntegration } from "@/lib/settings";
import { requireClientScope } from "@/lib/session";

const TIMEZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Riyadh", "Asia/Singapore", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const metadata = { title: "Reply settings" };

export default async function ReplySettingsPage({ searchParams }: PageProps<"/app/settings/replies">) {
  const { clientId, canManage } = await requireClientScope();
  const sp = await searchParams;
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client) notFound();
  const conn = await db.query.calendarConnections.findFirst({ where: eq(schema.calendarConnections.clientId, clientId) });
  const [google, microsoft] = await Promise.all([getIntegration("google_calendar"), getIntegration("microsoft_calendar")]);
  const googleReady = Boolean(google.value.clientId && google.hasSecrets.includes("clientSecret"));
  const microsoftReady = Boolean(microsoft.value.clientId && microsoft.hasSecrets.includes("clientSecret"));
  const rs = client.replySettings;
  const notice = typeof sp.calendar === "string" ? sp.calendar : null;

  return (
    <>
      <PageHeader title="Reply settings" subtitle="How Claude signs, books and when it may send on its own." />
      {notice ? (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${notice === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {notice === "connected" ? "Calendar connected." : notice === "not_configured" ? "The agency has not configured this calendar provider yet. Ask your platform admin." : `Calendar connection failed: ${notice}`}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Sender, booking and guardrails">
            <fieldset disabled={!canManage}>
              <ActionForm action={saveReplySettingsAction} submitLabel="Save settings">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Sender name" help="How replies are signed, e.g. the account owner.">
                    <Input name="senderName" defaultValue={rs.senderName} placeholder="Dana Owner" />
                  </Field>
                  <Field label="Booking link (fallback)" help="Used when no calendar is connected.">
                    <Input name="bookingLink" type="url" defaultValue={rs.bookingLink} placeholder="https://calendly.com/…" />
                  </Field>
                </div>
                <Field label="Signature">
                  <Textarea name="signature" rows={2} defaultValue={rs.signature} placeholder="Dana Owner · Head of Growth, Acme" />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Meeting length">
                    <Slider name="meetingDurationMin" min={15} max={120} step={5} defaultValue={rs.meetingDurationMin} suffix="m" labels={["15m", "2h"]} />
                  </Field>
                  <Field label="Autonomous: min confidence" help="Drafts below this are escalated instead of sent.">
                    <Slider name="minConfidence" min={50} max={100} defaultValue={Math.round(rs.minConfidence * 100)} suffix="%" labels={["cautious 50%", "strict 100%"]} />
                  </Field>
                  <Field label="Autonomous: max agent replies per thread">
                    <Slider name="maxAgentRepliesPerThread" min={1} max={10} defaultValue={rs.maxAgentRepliesPerThread} labels={["1", "10"]} />
                  </Field>
                </div>
                <Switch name="businessHoursOnly" defaultChecked={rs.businessHoursOnly} label="Autonomous replies only during business hours" help="Outside those hours drafts are queued for the next opening." />
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Timezone">
                    <Select name="timezone" defaultValue={client.timezone}>
                      {TIMEZONES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Business hours start">
                    <Input name="start" type="time" defaultValue={client.businessHours.start} />
                  </Field>
                  <Field label="Business hours end">
                    <Input name="end" type="time" defaultValue={client.businessHours.end} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => (
                    <label key={d} className="cursor-pointer">
                      <input type="checkbox" name="days" value={i} defaultChecked={client.businessHours.days.includes(i)} className="peer sr-only" />
                      <span className="inline-flex min-h-8 items-center rounded-full border border-stone-300 bg-white px-3.5 text-sm text-stone-600 shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-brand-400 hover:text-brand-700 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-checked:shadow-md peer-checked:shadow-brand-600/25 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600">
                        {d}
                      </span>
                    </label>
                  ))}
                </div>
              </ActionForm>
            </fieldset>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Calendar">
            {conn ? (
              <div className="space-y-3 text-sm">
                <p>
                  Connected: <Badge tone="green">{conn.provider}</Badge> <span className="text-zinc-600">{conn.accountEmail}</span>
                </p>
                <p className="text-xs text-zinc-500">Claude proposes free slots from this calendar and books confirmed meetings with the lead as attendee.</p>
                {canManage ? (
                  <form action={disconnectCalendarAction}>
                    <Button variant="secondary" className="h-8 text-xs">Disconnect</Button>
                  </form>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-zinc-600">No calendar connected. Replies will use the booking link instead.</p>
                {canManage ? (
                  <div className="flex flex-col gap-2">
                    {googleReady ? <LinkButton href="/api/calendar/google/start" variant="secondary">Connect Google Calendar</LinkButton> : <span className="text-xs text-zinc-400">Google Calendar: not configured by the agency</span>}
                    {microsoftReady ? <LinkButton href="/api/calendar/microsoft/start" variant="secondary">Connect Outlook Calendar</LinkButton> : <span className="text-xs text-zinc-400">Outlook: not configured by the agency</span>}
                    <form action={connectMockCalendarAction}>
                      <Button variant="ghost" className="h-8 text-xs">Use a demo calendar (always free)</Button>
                    </form>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
          <Card title="How autonomous mode decides">
            <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
              <li>Only campaigns with autonomous mode on. Everything else waits for one click.</li>
              <li>Escalates on low confidence, pricing, discounts, contracts, legal, security questionnaires, hostile tone, or an unanswerable question.</li>
              <li>Unsubscribe requests are honoured immediately, never replied to.</li>
              <li>Stops after the per-thread reply limit and hands over.</li>
              <li>Sends only in business hours when that option is on.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
