CREATE TABLE `model_provider_models` (
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`last_fetched_at` text,
	`position` integer NOT NULL,
	PRIMARY KEY(`provider_id`, `model_id`),
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_provider_models_provider_id_idx` ON `model_provider_models` (`provider_id`);--> statement-breakpoint
CREATE INDEX `model_provider_models_model_id_idx` ON `model_provider_models` (`model_id`);--> statement-breakpoint
CREATE TABLE `model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`proxy_url` text,
	`enabled` integer NOT NULL,
	`secret_encrypted` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_providers_created_at_idx` ON `model_providers` (`created_at`);