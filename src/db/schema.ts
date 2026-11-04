import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = pgEnum("user_role", ["super_admin", "client_admin", "client_user"]);
export const clientStatus = pgEnum("client_status", ["onboarding", "active", "suspended"]);
export const tokenPurpose = pgEnum("token_purpose", ["invite", "password_reset"]);
export const leadStatus = pgEnum("lead_status", [
  "new",
  "approved",
  "pushed",
  "replied",
  "meeting",
  "unsubscribed",
  "bounced",
  "rejected",
]);
export const verificationStatus = pgEnum("verification_status", [
  "unverified",
  "valid",
  "invalid",
  "catch_all",
  "unknown",
]);
export const leadRunStatus = pgEnum("lead_run_status", [
  "queued",
  "sourcing",
  "verifying",
  "qualifying",
  "review",
  "pushed",
  "failed",
]);
export const agentRunStatus = pgEnum("agent_run_status", ["running", "succeeded", "failed", "budget_exceeded"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: clientStatus("status").notNull().default("onboarding"),
  website: text("website"),
  instantlyWorkspaceId: text("instantly_workspace_id"),
  /** Prefix applied to Instantly campaign names so clients are distinguishable in one account. */
  instantlyCampaignPrefix: text("instantly_campaign_prefix"),
  tokenBudgetMonthlyUsd: integer("token_budget_monthly_usd").notNull().default(100),
  timezone: text("timezone").notNull().default("UTC"),
  businessHours: jsonb("business_hours")
    .$type<{ start: string; end: string; days: number[] }>()
    .notNull()
    .default({ start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] }),
  blockedRegions: text("blocked_regions").array().notNull().default(sql`'{}'::text[]`),
  onboarding: jsonb("onboarding")
    .$type<{ profile: boolean; knowledgeBase: boolean; calendar: boolean; icp: boolean }>()
    .notNull()
    .default({ profile: false, knowledgeBase: false, calendar: false, icp: false }),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").notNull(),
    /** null for super_admin */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`), index("users_client_idx").on(t.clientId)],
);

/** One-time tokens for invites and password resets (magic links). Stored hashed. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Platform settings (integrations configured by Super Admin, secrets encrypted)
// ---------------------------------------------------------------------------
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  /** Non-secret config, e.g. { enabled: true, dailyCreditCap: 500 } */
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  /** AES-256-GCM encrypted JSON of secret fields, e.g. { apiKey } */
  secretCiphertext: text("secret_ciphertext"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Lead generation
// ---------------------------------------------------------------------------
export const icps = pgTable(
  "icps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    prompt: text("prompt").notNull(),
    spec: jsonb("spec").$type<IcpSpec>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("icps_client_idx").on(t.clientId)],
);

export type IcpSpec = {
  industries: string[];
  companySizes: string[];
  geographies: string[];
  titles: string[];
  painPoints: string[];
  disqualifiers: string[];
  valueProposition: string;
};

export const leadRuns = pgTable(
  "lead_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    icpId: uuid("icp_id").references(() => icps.id, { onDelete: "set null" }),
    source: text("source").notNull(), // mock | apollo | csv | connected
    status: leadRunStatus("status").notNull().default("queued"),
    requestedCount: integer("requested_count").notNull().default(50),
    counts: jsonb("counts")
      .$type<{ sourced: number; deduped: number; verified: number; qualified: number; pushed: number }>()
      .notNull()
      .default({ sourced: 0, deduped: 0, verified: 0, qualified: 0, pushed: 0 }),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("lead_runs_client_idx").on(t.clientId)],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    leadRunId: uuid("lead_run_id").references(() => leadRuns.id, { onDelete: "set null" }),
    icpId: uuid("icp_id").references(() => icps.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    title: text("title"),
    company: text("company"),
    domain: text("domain"),
    country: text("country"),
    linkedinUrl: text("linkedin_url"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    verification: verificationStatus("verification").notNull().default("unverified"),
    score: integer("score"), // 1..5
    qualification: text("qualification"),
    status: leadStatus("status").notNull().default("new"),
    instantlyLeadId: text("instantly_lead_id"),
    campaignId: uuid("campaign_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("leads_client_email_idx").on(t.clientId, sql`lower(${t.email})`),
    index("leads_run_idx").on(t.leadRunId),
    index("leads_status_idx").on(t.clientId, t.status),
  ],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = global suppression across all clients */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    value: text("value").notNull(), // email or domain, lowercased
    reason: text("reason").notNull(), // unsubscribe | bounce | manual | complaint
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("suppressions_value_idx").on(t.value)],
);

// ---------------------------------------------------------------------------
// AI accounting
// ---------------------------------------------------------------------------
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    trigger: text("trigger").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    status: agentRunStatus("status").notNull().default("running"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_runs_client_idx").on(t.clientId, t.startedAt)],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_client_idx").on(t.clientId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const clientsRelations = relations(clients, ({ many }) => ({
  users: many(users),
  icps: many(icps),
  leads: many(leads),
}));
export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
}));
export const icpsRelations = relations(icps, ({ one }) => ({
  client: one(clients, { fields: [icps.clientId], references: [clients.id] }),
}));
export const leadsRelations = relations(leads, ({ one }) => ({
  client: one(clients, { fields: [leads.clientId], references: [clients.id] }),
  run: one(leadRuns, { fields: [leads.leadRunId], references: [leadRuns.id] }),
}));

export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Icp = typeof icps.$inferSelect;
