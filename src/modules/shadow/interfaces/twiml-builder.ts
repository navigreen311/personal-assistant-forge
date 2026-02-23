// ============================================================================
// Shadow Voice Agent — TwiML Builder
// Fluent builder for constructing Twilio Markup Language (TwiML) XML responses.
// ============================================================================

import type { GatherOptions, RecordOptions } from './phone-types';

const DEFAULT_VOICE = 'Polly.Matthew';

export class TwiMLBuilder {
  private parts: string[] = [];
  private voice: string;

  constructor(voice?: string) {
    this.voice = voice ?? DEFAULT_VOICE;
  }

  /**
   * Add a <Say> verb to speak text to the caller.
   */
  say(text: string, voice?: string): this {
    const v = this.escapeXml(voice ?? this.voice);
    const t = this.escapeXml(text);
    this.parts.push(`<Say voice="${v}">${t}</Say>`);
    return this;
  }

  /**
   * Add a <Gather> verb to collect speech or DTMF input.
   * Wraps a <Say> prompt inside the <Gather> if prompt text is provided.
   */
  gather(options: GatherOptions, prompt?: string): this {
    const attrs = this.buildGatherAttributes(options);
    if (prompt) {
      const v = this.escapeXml(this.voice);
      const t = this.escapeXml(prompt);
      this.parts.push(`<Gather${attrs}><Say voice="${v}">${t}</Say></Gather>`);
    } else {
      this.parts.push(`<Gather${attrs} />`);
    }
    return this;
  }

  /**
   * Add a <Record> verb to record audio from the caller.
   */
  record(options: RecordOptions): this {
    const attrs: string[] = [];
    if (options.maxLength !== undefined) {
      attrs.push(`maxLength="${options.maxLength}"`);
    }
    if (options.action) {
      attrs.push(`action="${this.escapeXml(options.action)}"`);
    }
    if (options.transcribe !== undefined) {
      attrs.push(`transcribe="${options.transcribe}"`);
    }
    if (options.playBeep !== undefined) {
      attrs.push(`playBeep="${options.playBeep}"`);
    }
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    this.parts.push(`<Record${attrStr} />`);
    return this;
  }

  /**
   * Add a <Redirect> verb to redirect the call to another TwiML URL.
   */
  redirect(url: string): this {
    this.parts.push(`<Redirect>${this.escapeXml(url)}</Redirect>`);
    return this;
  }

  /**
   * Add a <Pause> verb to insert silence.
   */
  pause(length?: number): this {
    if (length !== undefined && length > 0) {
      this.parts.push(`<Pause length="${length}" />`);
    } else {
      this.parts.push(`<Pause />`);
    }
    return this;
  }

  /**
   * Add an <Sms> verb to send an SMS during the call.
   */
  sms(to: string, body: string): this {
    this.parts.push(`<Sms to="${this.escapeXml(to)}">${this.escapeXml(body)}</Sms>`);
    return this;
  }

  /**
   * Add a <Hangup> verb to end the call.
   */
  hangup(): this {
    this.parts.push(`<Hangup />`);
    return this;
  }

  /**
   * Add raw TwiML content.
   */
  raw(twiml: string): this {
    this.parts.push(twiml);
    return this;
  }

  /**
   * Build the complete TwiML XML document string.
   */
  build(): string {
    const body = this.parts.join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${body}\n</Response>`;
  }

  /**
   * Reset the builder for reuse.
   */
  reset(): this {
    this.parts = [];
    return this;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private buildGatherAttributes(options: GatherOptions): string {
    const attrs: string[] = [];
    if (options.input) {
      attrs.push(`input="${this.escapeXml(options.input)}"`);
    }
    if (options.action) {
      attrs.push(`action="${this.escapeXml(options.action)}"`);
    }
    if (options.speechTimeout) {
      attrs.push(`speechTimeout="${this.escapeXml(options.speechTimeout)}"`);
    }
    if (options.language) {
      attrs.push(`language="${this.escapeXml(options.language)}"`);
    }
    if (options.timeout !== undefined) {
      attrs.push(`timeout="${options.timeout}"`);
    }
    if (options.numDigits !== undefined) {
      attrs.push(`numDigits="${options.numDigits}"`);
    }
    return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Create a new TwiML builder with the default Shadow voice.
 */
export function createTwiMLBuilder(voice?: string): TwiMLBuilder {
  return new TwiMLBuilder(voice);
}
