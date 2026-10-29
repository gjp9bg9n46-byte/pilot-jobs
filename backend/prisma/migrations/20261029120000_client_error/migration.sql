-- Errors the app's own boundary caught. Additive; nothing existing is touched.
CREATE TABLE "ClientError" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "runtime" TEXT,
    "screen" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "componentStack" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientError_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientError_pilotId_screen_message_key" ON "ClientError"("pilotId", "screen", "message");
CREATE INDEX "ClientError_lastSeenAt_idx" ON "ClientError"("lastSeenAt");
