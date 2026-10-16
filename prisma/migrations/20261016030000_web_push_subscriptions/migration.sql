-- Web push subscriptions (additive)
CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_person_id_idx" ON "push_subscriptions"("person_id");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
