CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`reading` text DEFAULT '' NOT NULL,
	`formed_year` integer DEFAULT 0 NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photo_url` text,
	`spotify_artist_url` text,
	`members` text DEFAULT '[]' NOT NULL,
	`genres` text DEFAULT '[]' NOT NULL,
	`tracks` text DEFAULT '[]' NOT NULL,
	`interview` text DEFAULT '[]' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`researched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_slug_unique` ON `artists` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artists_spotify` ON `artists` (`spotify_artist_url`) WHERE "artists"."spotify_artist_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_artists_name` ON `artists` (`name`);--> statement-breakpoint
CREATE TABLE `gig_artists` (
	`gig_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	`curator_note` text,
	PRIMARY KEY(`gig_id`, `artist_id`),
	FOREIGN KEY (`gig_id`) REFERENCES `gigs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_gig_artists_artist` ON `gig_artists` (`artist_id`);--> statement-breakpoint
CREATE TABLE `gigs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`flyer_url` text,
	`flyer_hash` text,
	`title` text DEFAULT '' NOT NULL,
	`date` text,
	`venue` text,
	`source_url` text,
	`intro` text DEFAULT '' NOT NULL,
	`ai_raw` text,
	`ai_warnings` text DEFAULT '[]' NOT NULL,
	`analyzed_at` integer,
	`created_at` integer NOT NULL,
	`published_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gigs_slug_unique` ON `gigs` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_gigs_status_published` ON `gigs` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_gigs_flyer_hash` ON `gigs` (`flyer_hash`);