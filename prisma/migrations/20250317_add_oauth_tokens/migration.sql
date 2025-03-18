-- Add OAuth token fields to User table
ALTER TABLE "User" ADD COLUMN "accessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "refreshToken" TEXT;
