-- CreateTable
CREATE TABLE "MeetiniInvite" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetiniInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedTime" (
    "id" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "meetiniInviteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetiniParticipant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isMeetiniUser" BOOLEAN NOT NULL DEFAULT false,
    "meetiniInviteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetiniParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetiniInvite_createdBy_idx" ON "MeetiniInvite"("createdBy");

-- CreateIndex
CREATE INDEX "MeetiniInvite_status_idx" ON "MeetiniInvite"("status");

-- CreateIndex
CREATE INDEX "ProposedTime_meetiniInviteId_idx" ON "ProposedTime"("meetiniInviteId");

-- CreateIndex
CREATE INDEX "MeetiniParticipant_meetiniInviteId_idx" ON "MeetiniParticipant"("meetiniInviteId");

-- CreateIndex
CREATE INDEX "MeetiniParticipant_email_idx" ON "MeetiniParticipant"("email");

-- AddForeignKey
ALTER TABLE "ProposedTime" ADD CONSTRAINT "ProposedTime_meetiniInviteId_fkey" FOREIGN KEY ("meetiniInviteId") REFERENCES "MeetiniInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetiniParticipant" ADD CONSTRAINT "MeetiniParticipant_meetiniInviteId_fkey" FOREIGN KEY ("meetiniInviteId") REFERENCES "MeetiniInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
