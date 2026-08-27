ALTER TABLE "players" ADD COLUMN "gift_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "players_gift_coins_idx" ON "players" USING btree ("gift_coins" DESC NULLS LAST);