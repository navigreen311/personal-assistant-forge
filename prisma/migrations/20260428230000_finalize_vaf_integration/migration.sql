-- VAF integration finalization: schema columns that the WS02 voiceprint-auth
-- and WS03 meeting-processor needed but couldn't add (foundation tier was
-- already merged before the gap was identified).
--
-- All additions are nullable so existing rows validate.

-- AlterTable: ShadowAuthEvent gets a userId column so events are queryable
-- per user without parsing the actionAttempted free-text field.
ALTER TABLE "ShadowAuthEvent" ADD COLUMN "userId" TEXT;
CREATE INDEX "ShadowAuthEvent_userId_idx" ON "ShadowAuthEvent"("userId");

-- AlterTable: CalendarEvent gets a recordingUrl column so the meeting
-- processor can read it directly instead of parsing meetingNotes.
ALTER TABLE "CalendarEvent" ADD COLUMN "recordingUrl" TEXT;
