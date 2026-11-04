import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
export const threadStatus = pgEnum("thread_status", ["open", "awaiting_approval", "escalated", "replied", "closed", "unsubscribed"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageSender = pgEnum("message_sender", ["lead", "agent", "human", "sequence"]);
export const draftStatus = pgEnum("draft_status", ["pending", "approved", "edited", "rejected", "auto_sent", "escalated", "superseded"]);
export const kbDocStatus = pgEnum("kb_doc_status", ["processing", "ready", "failed"]);
export const calendarProvider = pgEnum("calendar_provider", ["google", "microsoft", "mock"]);
export const meetingStatus = pgEnum("meeting_status", ["proposed", "booked", "cancelled"]);
export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "generating",
  "review",
  "approved",
  "pushing",
  "pushed",
  "active",
  "paused",
  "failed",
]);

export type ReplySettings = {
  senderName: string;
  signature: string;
  bookingLink: string;
  meetingDurationMin: number;
  /** Autonomous mode: drafts below this confidence are escalated to a human. */
  minConfidence: number;
  maxAgentRepliesPerThread: number;
  businessHoursOnly: boolean;
};

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
  replySettings: jsonb("reply_settings")
    .$type<ReplySettings>()
    .notNull()
    .default({
      senderName: "",
      signature: "",
      bookingLink: "",
      meetingDurationMin: 30,
      minConfidence: 0.8,
      maxAgentRepliesPerThread: 3,
      businessHoursOnly: true,
    }),
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
    campaignId: uuid("campaign_id").references((): AnyPgColumn => campaigns.id, { onDelete: "set null" }),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    pushError: text("push_error"),
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
// Campaigns
// ---------------------------------------------------------------------------
export type SequenceStep = { subject: string; body: string; delayDays: number };

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    icpId: uuid("icp_id").references(() => icps.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    brief: text("brief"),
    sequence: jsonb("sequence").$type<SequenceStep[]>().notNull().default([]),
    instantlyCampaignId: text("instantly_campaign_id"),
    autonomousMode: boolean("autonomous_mode").notNull().default(false),
    stats: jsonb("stats")
      .$type<{ sent: number; opened: number; replied: number; bounced: number; meetings: number }>()
      .notNull()
      .default({ sent: 0, opened: 0, replied: 0, bounced: 0, meetings: 0 }),
    error: text("error"),
    copyApprovedBy: uuid("copy_approved_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("campaigns_client_idx").on(t.clientId)],
);

/** Per-client override of a global skill (global skills live in src/lib/ai/skills/*.md). */
export const skillOverrides = pgTable(
  "skill_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    content: text("content").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("skill_overrides_client_key_idx").on(t.clientId, t.skillKey)],
);

// ---------------------------------------------------------------------------
// Replies: threads, messages, drafts, meetings
// ---------------------------------------------------------------------------
export type ReplyClassification =
  | "interested"
  | "question"
  | "objection"
  | "not_now"
  | "wrong_person"
  | "out_of_office"
  | "unsubscribe"
  | "hostile"
  | "other";

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    subject: text("subject"),
    /** Instantly sending account the lead replied to; needed to reply from the same mailbox. */
    emailAccount: text("email_account"),
    status: threadStatus("status").notNull().default("open"),
    lastClassification: text("last_classification").$type<ReplyClassification>(),
    agentReplyCount: integer("agent_reply_count").notNull().default(0),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("threads_client_status_idx").on(t.clientId, t.status, t.lastEventAt), uniqueIndex("threads_lead_idx").on(t.leadId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    sender: messageSender("sender").notNull(),
    subject: text("subject"),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    classification: text("classification").$type<ReplyClassification>(),
    confidence: integer("confidence"), // 0-100
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    draftId: uuid("draft_id"),
    instantlyMessageId: text("instantly_message_id"),
    kbChunkIds: text("kb_chunk_ids").array().notNull().default(sql`'{}'::text[]`),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.sentAt), uniqueIndex("messages_instantly_idx").on(t.instantlyMessageId)],
);

export type ProposedSlot = { startAt: string; endAt: string; label: string };

export const replyDrafts = pgTable(
  "reply_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    inboundMessageId: uuid("inbound_message_id").references(() => messages.id, { onDelete: "set null" }),
    classification: text("classification").$type<ReplyClassification>().notNull(),
    confidence: integer("confidence").notNull(), // 0-100
    draftText: text("draft_text").notNull(),
    reasoning: text("reasoning"),
    wantsMeeting: boolean("wants_meeting").notNull().default(false),
    proposedSlots: jsonb("proposed_slots").$type<ProposedSlot[]>().notNull().default([]),
    kbChunkIds: text("kb_chunk_ids").array().notNull().default(sql`'{}'::text[]`),
    status: draftStatus("status").notNull().default("pending"),
    escalationReasons: text("escalation_reasons").array().notNull().default(sql`'{}'::text[]`),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drafts_client_status_idx").on(t.clientId, t.status, t.createdAt), index("drafts_thread_idx").on(t.threadId)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "set null" }),
    provider: calendarProvider("provider").notNull(),
    externalEventId: text("external_event_id"),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: meetingStatus("status").notNull().default("booked"),
    bookedBy: text("booked_by").notNull().default("agent"), // agent | human
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meetings_client_idx").on(t.clientId, t.startAt)],
);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    provider: calendarProvider("provider").notNull(),
    accountEmail: text("account_email").notNull(),
    /** AES-GCM encrypted JSON { accessToken, refreshToken, expiresAt } */
    tokenCiphertext: text("token_ciphertext").notNull(),
    calendarId: text("calendar_id").notNull().default("primary"),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("calendar_client_idx").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(), // pdf | docx | pptx | txt | md | url
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    status: kbDocStatus("status").notNull().default("processing"),
    chunkCount: integer("chunk_count").notNull().default(0),
    error: text("error"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("kb_docs_client_idx").on(t.clientId)],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    chunkText: text("chunk_text").notNull(),
    heading: text("heading"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kb_chunks_doc_idx").on(t.documentId, t.ordinal), index("kb_chunks_client_idx").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Inbound webhooks (raw, for replay and debugging)
// ---------------------------------------------------------------------------
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("webhook_events_received_idx").on(t.receivedAt)],
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
  campaign: one(campaigns, { fields: [leads.campaignId], references: [campaigns.id] }),
}));
export const leadRunsRelations = relations(leadRuns, ({ one, many }) => ({
  icp: one(icps, { fields: [leadRuns.icpId], references: [icps.id] }),
  leads: many(leads),
}));
export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  icp: one(icps, { fields: [campaigns.icpId], references: [icps.id] }),
  leads: many(leads),
}));
export const threadsRelations = relations(threads, ({ one, many }) => ({
  lead: one(leads, { fields: [threads.leadId], references: [leads.id] }),
  campaign: one(campaigns, { fields: [threads.campaignId], references: [campaigns.id] }),
  messages: many(messages),
  drafts: many(replyDrafts),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
}));
export const replyDraftsRelations = relations(replyDrafts, ({ one }) => ({
  thread: one(threads, { fields: [replyDrafts.threadId], references: [threads.id] }),
}));
export const kbDocumentsRelations = relations(kbDocuments, ({ many }) => ({
  chunks: many(kbChunks),
}));
export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  document: one(kbDocuments, { fields: [kbChunks.documentId], references: [kbDocuments.id] }),
}));

export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Icp = typeof icps.$inferSelect;
export type LeadRun = typeof leadRuns.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ReplyDraft = typeof replyDrafts.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type KbDocument = typeof kbDocuments.$inferSelect;
export type KbChunk = typeof kbChunks.$inferSelect;
