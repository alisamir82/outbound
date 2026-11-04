import type { CalendarProvider, StoredTokens } from "./types";

export class GoogleCalendar implements CalendarProvider {
  readonly key = "google" as const;
  constructor(private tokens: StoredTokens, private calendarId = "primary") {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Google Calendar ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async freeBusy(from: Date, to: Date) {
    const out = await this.api<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>("/freeBusy", {
      method: "POST",
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: this.calendarId }] }),
    });
    return (out.calendars[this.calendarId]?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  async createEvent(input: { title: string; description: string; start: Date; end: Date; attendeeEmail: string; attendeeName?: string }) {
    const ev = await this.api<{ id: string }>(`/calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=all`, {
      method: "POST",
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
        attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
      }),
    });
    return { id: ev.id };
  }
}
