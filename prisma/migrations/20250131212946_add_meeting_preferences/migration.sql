-- CreateTable
CREATE TABLE "MeetingPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationPreferences" TEXT NOT NULL,
    "virtualMeetings" TEXT NOT NULL,
    "schedulingRules" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPreferences_userId_key" ON "MeetingPreferences"("userId");

-- AddForeignKey
ALTER TABLE "MeetingPreferences" ADD CONSTRAINT "MeetingPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
