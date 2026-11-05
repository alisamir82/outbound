CREATE TYPE "public"."account_health" AS ENUM('healthy', 'warning', 'critical', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'approved', 'applied', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."proposal_type" AS ENUM('subject_line', 'body', 'timing', 'targeting');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"severity" "alert_severity" NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"message" text NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_stats_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"day" text NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"replied" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"client_id" uuid,
	"warmup_enabled" boolean DEFAULT false NOT NULL,
	"warmup_score" integer,
	"daily_limit" integer DEFAULT 0 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"bounce_rate_bp" integer DEFAULT 0 NOT NULL,
	"reply_rate_bp" integer DEFAULT 0 NOT NULL,
	"provider_status" text,
	"health" "account_health" DEFAULT 'unknown' NOT NULL,
	"issues" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "optimization_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"report_id" uuid,
	"type" "proposal_type" NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"expected_impact" text NOT NULL,
	"change" jsonb NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"week_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "data_retention_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "last_weekly_report_key" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_stats_daily" ADD CONSTRAINT "campaign_stats_daily_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_stats_daily" ADD CONSTRAINT "campaign_stats_daily_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_client_idx" ON "alerts" USING btree ("client_id","acknowledged_at","created_at");--> statement-breakpoint
CREATE INDEX "alerts_dedupe_idx" ON "alerts" USING btree ("dedupe_key","acknowledged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_stats_daily_idx" ON "campaign_stats_daily" USING btree ("campaign_id","day");--> statement-breakpoint
CREATE INDEX "campaign_stats_client_idx" ON "campaign_stats_daily" USING btree ("client_id","day");--> statement-breakpoint
CREATE INDEX "email_accounts_client_idx" ON "email_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "proposals_client_status_idx" ON "optimization_proposals" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_client_week_idx" ON "reports" USING btree ("client_id","week_key");