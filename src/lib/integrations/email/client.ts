import sgMail from '@sendgrid/mail';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export type EmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, unknown>;
};

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const from = options.from ?? process.env.EMAIL_FROM ?? 'noreply@personalassistantforge.com';

  try {
    await sgMail.send({
      to: options.to,
      from,
      subject: options.subject,
      text: options.text ?? '',
      html: options.html ?? '',
      replyTo: options.replyTo,
      templateId: options.templateId,
      dynamicTemplateData: options.dynamicTemplateData,
    });
    return true;
  } catch (error) {
    console.error('[Email] Send failed:', error);
    return false;
  }
}

export async function sendBulkEmail(messages: EmailOptions[]): Promise<number> {
  let sent = 0;
  for (const msg of messages) {
    if (await sendEmail(msg)) sent++;
  }
  return sent;
}
