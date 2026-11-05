export type BusyInterval = { start: Date; end: Date };

export interface CalendarProvider {
  readonly key: "google" | "microsoft" | "mock";
  freeBusy(from: Date, to: Date): Promise<BusyInterval[]>;
  createEvent(input: { title: string; description: string; start: Date; end: Date; attendeeEmail: string; attendeeName?: string }): Promise<{ id: string }>;
}

export type StoredTokens = { accessToken: string; refreshToken?: string; expiresAt: number };
