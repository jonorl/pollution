-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Reading" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL DEFAULT 'esp32-01',
    "pm1_0" INTEGER NOT NULL,
    "pm2_5" INTEGER NOT NULL,
    "pm10" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reading_createdAt_idx" ON "Reading"("createdAt");

-- CreateIndex
CREATE INDEX "Reading_deviceId_idx" ON "Reading"("deviceId");

