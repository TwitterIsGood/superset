CREATE TYPE "public"."control_chat_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."control_chat_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."control_chat_session_status" AS ENUM('idle', 'running', 'archived');--> statement-breakpoint
CREATE TYPE "public"."control_chat_tool_call_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."control_chat_tool_target_kind" AS ENUM('cloud', 'host', 'workspace');--> statement-breakpoint
CREATE TABLE "automation_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"author_user_id" uuid,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"summary" text,
	"previous_version_id" uuid,
	"restored_from_version_id" uuid,
	"control_chat_session_id" uuid,
	"control_chat_run_id" uuid,
	"source_instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"role" "control_chat_message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_chat_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"started_by_user_id" uuid,
	"status" "control_chat_run_status" DEFAULT 'queued' NOT NULL,
	"origin_host_id" text,
	"execution_host_id" text,
	"permission_mode" text DEFAULT 'bypassPermissions' NOT NULL,
	"model_provider_id" uuid,
	"model_id" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "control_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text DEFAULT 'Control Chat' NOT NULL,
	"status" "control_chat_session_status" DEFAULT 'idle' NOT NULL,
	"active_run_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_chat_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"target_kind" "control_chat_tool_target_kind" DEFAULT 'cloud' NOT NULL,
	"target_host_id" text,
	"target_workspace_id" uuid,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"status" "control_chat_tool_call_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD COLUMN "source_instruction" text;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD COLUMN "source_summary" text;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD COLUMN "control_chat_session_id" uuid;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD COLUMN "control_chat_run_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_control_chat_session_id_control_chat_sessions_id_fk" FOREIGN KEY ("control_chat_session_id") REFERENCES "public"."control_chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_control_chat_run_id_control_chat_runs_id_fk" FOREIGN KEY ("control_chat_run_id") REFERENCES "public"."control_chat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_previous_version_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."automation_config_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_config_versions" ADD CONSTRAINT "automation_config_versions_restored_from_version_id_fk" FOREIGN KEY ("restored_from_version_id") REFERENCES "public"."automation_config_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_messages" ADD CONSTRAINT "control_chat_messages_session_id_control_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."control_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_messages" ADD CONSTRAINT "control_chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_messages" ADD CONSTRAINT "control_chat_messages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_runs" ADD CONSTRAINT "control_chat_runs_session_id_control_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."control_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_runs" ADD CONSTRAINT "control_chat_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_runs" ADD CONSTRAINT "control_chat_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_runs" ADD CONSTRAINT "control_chat_runs_model_provider_id_model_providers_id_fk" FOREIGN KEY ("model_provider_id") REFERENCES "public"."model_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_sessions" ADD CONSTRAINT "control_chat_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_sessions" ADD CONSTRAINT "control_chat_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_tool_calls" ADD CONSTRAINT "control_chat_tool_calls_run_id_control_chat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."control_chat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_tool_calls" ADD CONSTRAINT "control_chat_tool_calls_session_id_control_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."control_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_tool_calls" ADD CONSTRAINT "control_chat_tool_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_chat_tool_calls" ADD CONSTRAINT "control_chat_tool_calls_target_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("target_workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_config_versions_automation_idx" ON "automation_config_versions" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_config_versions_author_idx" ON "automation_config_versions" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "automation_config_versions_control_chat_session_idx" ON "automation_config_versions" USING btree ("control_chat_session_id");--> statement-breakpoint
CREATE INDEX "control_chat_messages_session_created_idx" ON "control_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "control_chat_messages_org_idx" ON "control_chat_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "control_chat_messages_created_by_idx" ON "control_chat_messages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "control_chat_runs_session_idx" ON "control_chat_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "control_chat_runs_org_idx" ON "control_chat_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "control_chat_runs_status_idx" ON "control_chat_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "control_chat_runs_started_by_idx" ON "control_chat_runs" USING btree ("started_by_user_id");--> statement-breakpoint
CREATE INDEX "control_chat_sessions_org_idx" ON "control_chat_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "control_chat_sessions_owner_idx" ON "control_chat_sessions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "control_chat_sessions_active_idx" ON "control_chat_sessions" USING btree ("active_run_id");--> statement-breakpoint
CREATE INDEX "control_chat_sessions_last_active_idx" ON "control_chat_sessions" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "control_chat_tool_calls_run_idx" ON "control_chat_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "control_chat_tool_calls_session_idx" ON "control_chat_tool_calls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "control_chat_tool_calls_org_idx" ON "control_chat_tool_calls" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "control_chat_tool_calls_tool_idx" ON "control_chat_tool_calls" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "control_chat_tool_calls_target_host_idx" ON "control_chat_tool_calls" USING btree ("target_host_id");--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD CONSTRAINT "capability_package_versions_control_chat_session_id_control_chat_sessions_id_fk" FOREIGN KEY ("control_chat_session_id") REFERENCES "public"."control_chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD CONSTRAINT "capability_package_versions_control_chat_run_id_control_chat_runs_id_fk" FOREIGN KEY ("control_chat_run_id") REFERENCES "public"."control_chat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_package_versions_control_chat_session_idx" ON "capability_package_versions" USING btree ("control_chat_session_id");