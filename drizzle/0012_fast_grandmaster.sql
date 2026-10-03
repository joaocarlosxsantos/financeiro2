ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" varchar(32);--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_transfer_leg_key" ON "transactions" USING btree ("transfer_group_id","kind") WHERE "transactions"."transfer_group_id" is not null;