// ============================================================================
// Shadow Voice Agent — Voice API Route
// POST: Accept audio (multipart/form-data) or text (JSON), process through
// STT -> Agent -> TTS pipeline, return transcript + response + optional audio.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { VoiceInAppHandler } from '@/modules/shadow/interfaces/voice-in-app';
import { BargeInHandler } from '@/modules/shadow/interfaces/barge-in-handler';

// ---------------------------------------------------------------------------
// Singletons (reused across requests)
// ---------------------------------------------------------------------------

const voiceHandler = new VoiceInAppHandler();
const bargeInHandler = new BargeInHandler();

// ---------------------------------------------------------------------------
// POST /api/shadow/voice
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const contentType = req.headers.get('content-type') ?? '';

      // -----------------------------------------------------------------
      // JSON body (text mode fallback)
      // -----------------------------------------------------------------
      if (contentType.includes('application/json')) {
        const body = (await req.json()) as {
          text?: string;
          sessionId?: string;
        };

        if (!body.text || body.text.trim().length === 0) {
          return error('VALIDATION_ERROR', 'Text is required', 400);
        }

        const sessionId = body.sessionId ?? `text_${Date.now()}`;

        // In a full implementation, this would route through the
        // ShadowAgent for intent classification + tool execution.
        // For now, we echo back a structured response.
        return success({
          transcript: body.text,
          response: {
            text: `I heard: "${body.text}". How can I help you with that?`,
            contentType: 'text',
          },
          sessionId,
        });
      }

      // -----------------------------------------------------------------
      // Multipart form-data (audio upload)
      // -----------------------------------------------------------------
      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        const audioFile = formData.get('audio');
        const sessionId = (formData.get('sessionId') as string) ?? `voice_${Date.now()}`;
        const format = (formData.get('format') as string) ?? 'webm';

        if (!audioFile || !(audioFile instanceof Blob)) {
          return error('VALIDATION_ERROR', 'Audio file is required', 400);
        }

        // Convert the Blob to a Buffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        if (audioBuffer.length === 0) {
          return error('VALIDATION_ERROR', 'Audio file is empty', 400);
        }

        // Check for idle prompt before processing
        const idlePrompt = bargeInHandler.checkIdlePrompt(sessionId);

        // Process through STT -> response -> TTS pipeline
        const result = await voiceHandler.processAudioInput({
          audioBuffer,
          sessionId,
          userId: session.userId,
          format,
        });

        // If we got an audio response, stream it back as audio/mpeg
        if (result.audioResponse && result.audioResponse.length > 0) {
          // Next 16's NextResponse BodyInit requires ArrayBuffer — Node's
          // Buffer<ArrayBufferLike> isn't directly assignable. Build a
          // tight ArrayBuffer copy of the audio bytes.
          const audioBody = result.audioResponse.buffer.slice(
            result.audioResponse.byteOffset,
            result.audioResponse.byteOffset + result.audioResponse.byteLength,
          ) as ArrayBuffer;
          return new NextResponse(audioBody, {
            status: 200,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': result.audioResponse.length.toString(),
              'X-Transcript': encodeURIComponent(result.transcript),
              'X-Session-Id': sessionId,
            },
          });
        }

        // Otherwise return JSON with transcript and text response.
        // When the pipeline detected unusable audio quality, surface
        // switchToText: true so the client can swap to keyboard input
        // instead of treating the empty transcript as a silent turn.
        return success({
          transcript: result.transcript,
          response: result.response
            ? {
                text: result.response.text,
                contentType: result.response.contentType,
                citations: result.response.citations,
                actionCards: result.response.actionCards,
              }
            : null,
          sessionId,
          idlePrompt: idlePrompt ?? undefined,
          switchToText: result.switchToText ?? false,
          switchToTextMessage: result.switchToTextMessage,
          sttProvider: result.sttProvider,
          ttsProvider: result.ttsProvider,
          audioQuality: result.audioQuality ?? undefined,
        });
      }

      // -----------------------------------------------------------------
      // Unsupported content type
      // -----------------------------------------------------------------
      return error(
        'VALIDATION_ERROR',
        'Request must be multipart/form-data (audio) or application/json (text)',
        415,
      );
    } catch (err) {
      console.error('[VoiceRoute] Error processing voice request:', err);
      return error('INTERNAL_ERROR', 'Failed to process voice input', 500);
    }
  });
}
