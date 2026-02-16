import type { ReputationStatus, EmailHeaderAnalysis, ThreatLevel } from './types';

export async function checkPhoneReputation(phoneNumber: string): Promise<ReputationStatus> {
  // Simulated reputation data for placeholder implementation
  const isClean = !phoneNumber.startsWith('+1555'); // 555 numbers are "dirty" in simulation

  return {
    channel: 'PHONE',
    identifier: phoneNumber,
    spamScore: isClean ? Math.floor(Math.random() * 15) : Math.floor(Math.random() * 40 + 60),
    warmingProgress: isClean ? Math.floor(Math.random() * 40 + 60) : Math.floor(Math.random() * 30),
    stirShakenCompliant: isClean,
    lastChecked: new Date(),
  };
}

export async function checkEmailReputation(domain: string): Promise<ReputationStatus> {
  // Simulated reputation data
  const trustedDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'protonmail.com'];
  const isTrusted = trustedDomains.includes(domain.toLowerCase());

  return {
    channel: 'EMAIL',
    identifier: domain,
    spamScore: isTrusted ? Math.floor(Math.random() * 10) : Math.floor(Math.random() * 50 + 20),
    dkimValid: isTrusted,
    spfValid: isTrusted,
    dmarcValid: isTrusted,
    lastChecked: new Date(),
  };
}

export function analyzeEmailHeaders(headers: Record<string, string>): EmailHeaderAnalysis {
  const from = headers['from'] ?? headers['From'] ?? '';
  const domainMatch = from.match(/@([a-zA-Z0-9.-]+)/);
  const fromDomain = domainMatch ? domainMatch[1] : 'unknown';

  const dkimHeader = headers['dkim-signature'] ?? headers['DKIM-Signature'] ?? '';
  const receivedSpf = headers['received-spf'] ?? headers['Received-SPF'] ?? '';
  const dmarcHeader = headers['dmarc'] ?? headers['Authentication-Results'] ?? '';

  const dkimStatus = dkimHeader ? 'PASS' as const : 'MISSING' as const;
  const spfStatus = receivedSpf.toLowerCase().includes('pass')
    ? 'PASS' as const
    : receivedSpf
      ? 'FAIL' as const
      : 'MISSING' as const;
  const dmarcStatus = dmarcHeader.toLowerCase().includes('dmarc=pass')
    ? 'PASS' as const
    : dmarcHeader.toLowerCase().includes('dmarc=')
      ? 'FAIL' as const
      : 'MISSING' as const;

  const details: string[] = [];

  if (dkimStatus !== 'PASS') details.push(`DKIM: ${dkimStatus}`);
  if (spfStatus !== 'PASS') details.push(`SPF: ${spfStatus}`);
  if (dmarcStatus !== 'PASS') details.push(`DMARC: ${dmarcStatus}`);

  // Detect domain spoofing: if Reply-To domain differs from From domain
  const replyTo = headers['reply-to'] ?? headers['Reply-To'] ?? '';
  const replyDomainMatch = replyTo.match(/@([a-zA-Z0-9.-]+)/);
  const replyDomain = replyDomainMatch ? replyDomainMatch[1] : null;
  const isSpoofed = replyDomain !== null && replyDomain !== fromDomain;

  if (isSpoofed) details.push(`Possible spoofing: From domain (${fromDomain}) differs from Reply-To (${replyDomain})`);

  let riskLevel: ThreatLevel = 'NONE';
  const failCount = [dkimStatus, spfStatus, dmarcStatus].filter(s => s !== 'PASS').length;
  if (isSpoofed) riskLevel = 'HIGH';
  else if (failCount >= 3) riskLevel = 'HIGH';
  else if (failCount >= 2) riskLevel = 'MEDIUM';
  else if (failCount >= 1) riskLevel = 'LOW';

  if (details.length === 0) details.push('All email authentication checks passed.');

  return {
    fromDomain,
    dkimStatus,
    spfStatus,
    dmarcStatus,
    isSpoofed,
    riskLevel,
    details,
  };
}

export async function getReputationDashboard(entityId: string): Promise<ReputationStatus[]> {
  // Placeholder: returns simulated data for demo entity
  const phoneRep = await checkPhoneReputation(`+1${entityId.slice(0, 10)}`);
  const emailRep = await checkEmailReputation(`entity-${entityId.slice(0, 8)}.com`);

  return [phoneRep, emailRep];
}
