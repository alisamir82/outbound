import type { CalendarProvider } from "./types";

/** Demo calendar: always free, events get a fake id. */
export class MockCalendar implements CalendarProvider {
  readonly key = "mock" as const;
  async freeBusy() {
    return [];
  }
  async createEvent(input: { start: Date }) {
    return { id: `mock-event-${input.start.getTime()}` };
  }
}
