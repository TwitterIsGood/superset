CREATE TABLE `task_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`type` text NOT NULL,
	`position` real NOT NULL,
	`progress_percent` real,
	`external_provider` text,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_statuses_organization_id_idx` ON `task_statuses` (`organization_id`);--> statement-breakpoint
CREATE INDEX `task_statuses_type_idx` ON `task_statuses` (`type`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `status_id` text REFERENCES task_statuses(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee_external_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee_display_name` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee_avatar_url` text;--> statement-breakpoint
CREATE INDEX `tasks_creator_id_idx` ON `tasks` (`creator_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_id_idx` ON `tasks` (`status_id`);--> statement-breakpoint
CREATE INDEX `tasks_external_provider_idx` ON `tasks` (`external_provider`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_external_id_idx` ON `tasks` (`assignee_external_id`);