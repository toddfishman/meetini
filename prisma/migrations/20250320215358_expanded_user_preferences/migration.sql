/*
  Warnings:

  - You are about to drop the column `confidence` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `lastContact` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the `ContactHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_preferences` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,type,value]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `Contact` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `Contact` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ContactHistory" DROP CONSTRAINT "ContactHistory_contactId_fkey";

-- DropForeignKey
ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_userId_fkey";

-- DropIndex
DROP INDEX "Contact_email_idx";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "confidence",
DROP COLUMN "email",
DROP COLUMN "lastContact",
DROP COLUMN "reason",
DROP COLUMN "source",
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "value" TEXT NOT NULL,
ALTER COLUMN "name" DROP NOT NULL;

-- DropTable
DROP TABLE "ContactHistory";

-- DropTable
DROP TABLE "user_preferences";

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workingHours" JSONB NOT NULL,
    "workDays" INTEGER[],
    "timezone" TEXT NOT NULL,
    "bufferTime" INTEGER NOT NULL DEFAULT 15,
    "maxMeetingsPerDay" INTEGER NOT NULL DEFAULT 8,
    "focusTimeBlocks" JSONB[],
    "homeLocation" TEXT,
    "officeLocation" TEXT,
    "maxTravelTime" INTEGER NOT NULL DEFAULT 30,
    "maxTravelDistance" INTEGER NOT NULL DEFAULT 5,
    "preferredTransport" TEXT NOT NULL DEFAULT 'driving',
    "gpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "noGoZones" TEXT[],
    "defaultDuration" INTEGER NOT NULL DEFAULT 30,
    "preferredTimes" JSONB[],
    "virtualMeetingUrl" TEXT,
    "defaultMeetingType" TEXT NOT NULL DEFAULT 'virtual',
    "preferredPlatforms" TEXT[],
    "personalEvents" JSONB[],
    "mealTimes" JSONB[],
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "travelAlerts" BOOLEAN NOT NULL DEFAULT true,
    "weatherAlerts" BOOLEAN NOT NULL DEFAULT true,
    "defaultCalendarId" TEXT,
    "calendarVisibility" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_type_value_key" ON "Contact"("userId", "type", "value");

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
