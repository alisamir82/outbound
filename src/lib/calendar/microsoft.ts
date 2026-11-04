import type { CalendarProvider, StoredTokens } from "./types";

export class MicrosoftCalendar implements CalendarProvider {
  readonly key = "microsoft" as const;
  constructor(private tokens: StoredTokens) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Microsoft Graph ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async freeBusy(from: Date, to: Date) {
    const out = await this.api<{ value: { start: { dateTime: string }; end: { dateTime: string }; showAs: string }[] }>(
      `/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end,showAs&$top=500`,
    );
    return out.value.filter((e) => e.showAs !== "free").map((e) => ({ start: new Date(e.start.dateTime + "Z"), end: new Date(e.end.dateTime + "Z") }));
  }

  async createEvent(input: { title: string; description: string; start: Date; end: Date; attendeeEmail: string; attendeeName?: string }) {
    const ev = await this.api<{ id: string }>("/me/events", {
      method: "POST",
      body: JSON.stringify({
        subject: input.title,
        body: { contentType: "Text", content: input.description },
        start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
        end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
        attendees: [{ emailAddress: { address: input.attendeeEmail, name: input.attendeeName }, type: "required" }],
      }),
    });
    return { id: ev.id };
  }
}
