import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { Client, ProposedSlot } from "@/db/schema";
import { GoogleCalendar } from "./google";
import { MicrosoftCalendar } from "./microsoft";
import { MockCalendar } from "./mock";
import { refreshTokens } from "./oauth";
import type { BusyInterval, CalendarProvider, StoredTokens } from "./types";

export async function getCalendarForClient(clientId: string): Promise<CalendarProvider | null> {
  const conn = await db.query.calendarConnections.findFirst({ where: eq(schema.calendarConnections.clientId, clientId) });
  if (!conn) return null;
  if (conn.provider === "mock") return new MockCalendar();
  let tokens = decryptJson<StoredTokens>(conn.tokenCiphertext);
  const refreshed = await refreshTokens(conn.provider, tokens);
  if (refreshed !== tokens) {
    tokens = refreshed;
    await db.update(schema.calendarConnections).set({ tokenCiphertext: encryptJson(tokens) }).where(eq(schema.calendarConnections.id, conn.id));
  }
  return conn.provider === "google" ? new GoogleCalendar(tokens, conn.calendarId) : new MicrosoftCalendar(tokens);
}

/** Wall-clock parts of an instant in a timezone. */
function partsIn(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { weekday, year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Converts a wall-clock time in tz to a UTC instant (iterative offset correction). */
function zoned(tz: string, y: number, m: number, d: number, h: number, min: number): Date {
  let guess = new Date(Date.UTC(y, m - 1, d, h, min));
  for (let i = 0; i < 3; i++) {
    const p = partsIn(tz, guess);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = Date.UTC(y, m - 1, d, h, min) - asUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

export function isWithinBusinessHours(client: Pick<Client, "timezone" | "businessHours">, at = new Date()) {
  const p = partsIn(client.timezone, at);
  if (!client.businessHours.days.includes(p.weekday)) return false;
  const [sh, sm] = client.businessHours.start.split(":").map(Number);
  const [eh, em] = client.businessHours.end.split(":").map(Number);
  const mins = p.hour * 60 + p.minute;
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

/** Next instant inside business hours (today if still open, else the next business morning). */
export function nextBusinessTime(client: Pick<Client, "timezone" | "businessHours">, from = new Date()): Date {
  if (isWithinBusinessHours(client, from)) return from;
  const [sh, sm] = client.businessHours.start.split(":").map(Number);
  for (let i = 0; i < 14; i++) {
    const day = new Date(from.getTime() + i * 86_400_000);
    const p = partsIn(client.timezone, day);
    if (!client.businessHours.days.includes(p.weekday)) continue;
    const start = zoned(client.timezone, p.year, p.month, p.day, sh, sm);
    if (start > from) return start;
  }
  return from;
}

/**
 * Proposes up to `count` free slots over the next business days, starting at least
 * 24h out, in the client's business hours, avoiding busy intervals.
 */
export async function proposeSlots(client: Pick<Client, "timezone" | "businessHours" | "replySettings">, calendar: CalendarProvider, count = 3): Promise<ProposedSlot[]> {
  const duration = client.replySettings.meetingDurationMin || 30;
  const from = new Date(Date.now() + 24 * 3600 * 1000);
  const to = new Date(from.getTime() + 7 * 86_400_000);
  let busy: BusyInterval[] = [];
  try {
    busy = await calendar.freeBusy(from, to);
  } catch (e) {
    console.warn("[calendar] freeBusy failed, proposing without availability:", (e as Error).message);
  }
  const [sh, sm] = client.businessHours.start.split(":").map(Number);
  const [eh, em] = client.businessHours.end.split(":").map(Number);
  const preferredHours = [10, 11, 14, 15, 16]; // spread proposals across the day
  const slots: ProposedSlot[] = [];
  const usedDays = new Set<string>();
  for (let i = 0; i < 8 && slots.length < count; i++) {
    const day = new Date(from.getTime() + i * 86_400_000);
    const p = partsIn(client.timezone, day);
    if (!client.businessHours.days.includes(p.weekday)) continue;
    for (const hour of preferredHours) {
      if (hour < sh || hour * 60 + duration > eh * 60 + em) continue;
      const start = zoned(client.timezone, p.year, p.month, p.day, hour, 0);
      const end = new Date(start.getTime() + duration * 60_000);
      if (start < from) continue;
      if (busy.some((b) => b.start < end && b.end > start)) continue;
      const key = `${p.year}-${p.month}-${p.day}`;
      if (usedDays.has(key)) continue; // one slot per day for variety
      usedDays.add(key);
      slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), label: formatSlot(start, client.timezone) });
      break;
    }
  }
  void sm;
  return slots;
}

export function formatSlot(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(d);
}
