CREATE TABLE "factory_improve_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage" "factory_stage" NOT NULL,
	"source_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"host_id" text,
	"v2_workspace_id" uuid,
	"session_kind" "automation_session_kind",
	"terminal_session_id" text,
	"chat_session_id" uuid,
	"status" "factory_run_status" NOT NULL,
	"proposed_prompt_version_id" uuid,
	"rationale" text,
	"error" text,
	"dispatched_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_proposed_prompt_version_id_factory_stage_prompts_id_fk" FOREIGN KEY ("proposed_prompt_version_id") REFERENCES "public"."factory_stage_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factory_improve_runs_stage_idx" ON "factory_improve_runs" USING btree ("factory_id","stage","created_at");