CREATE TABLE "gifts" (
	"name" text PRIMARY KEY NOT NULL,
	"tiktok_id" integer,
	"coins" integer DEFAULT 0 NOT NULL,
	"icon_url" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
