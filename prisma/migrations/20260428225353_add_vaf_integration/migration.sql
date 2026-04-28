-- VAF (VisionAudioForge) integration: additive schema additions.
-- All new columns are nullable or defaulted so existing rows continue to validate.
-- Foundation PR (WS04). Merged first; WS01/WS02/WS03 build on top.

-- AlterTable: add VAF voice/audio/sentiment columns to ShadowMessage
ALTER TABLE "ShadowMessage" ADD COLUMN "stt_provider" VARCHAR(20);
ALTER TABLE "ShadowMessage" ADD COLUMN "tts_provider" VARCHAR(20);
ALTER TABLE "ShadowMessage" ADD COLUMN "audio_quality" JSONB;
ALTER TABLE "ShadowMessage" ADD COLUMN "sentiment" JSONB;

-- CreateTable: per-user VAF integration configuration
CREATE TABLE "vaf_integration_config" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    -- Voice pipeline
    "stt_provider" VARCHAR(20) NOT NULL DEFAULT 'vaf',
    "tts_provider" VARCHAR(20) NOT NULL DEFAULT 'vaf',
    "audio_enhancement" BOOLEAN NOT NULL DEFAULT true,
    "noise_cancellation" BOOLEAN NOT NULL DEFAULT true,
    "echo_suppression" BOOLEAN NOT NULL DEFAULT true,

    -- Voiceprint
    "voiceprint_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "voiceprint_enrolled_at" TIMESTAMP(3),
    "voiceprint_use_for_auth" BOOLEAN NOT NULL DEFAULT false,

    -- Sentiment
    "sentiment_on_voiceforge_calls" BOOLEAN NOT NULL DEFAULT true,
    "sentiment_alert_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,

    -- Meeting intelligence
    "auto_process_meetings" BOOLEAN NOT NULL DEFAULT false,
    "auto_extract_action_items" BOOLEAN NOT NULL DEFAULT true,
    "auto_create_tasks" BOOLEAN NOT NULL DEFAULT true,

    -- Vision
    "document_analysis_enabled" BOOLEAN NOT NULL DEFAULT true,
    "screen_vision_fallback" BOOLEAN NOT NULL DEFAULT false,

    -- Translation
    "primary_language" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "secondary_language" VARCHAR(10),
    "auto_detect_language" BOOLEAN NOT NULL DEFAULT false,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaf_integration_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one config row per user
CREATE UNIQUE INDEX "vaf_integration_config_user_id_key" ON "vaf_integration_config"("user_id");

-- AddForeignKey
ALTER TABLE "vaf_integration_config" ADD CONSTRAINT "vaf_integration_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
