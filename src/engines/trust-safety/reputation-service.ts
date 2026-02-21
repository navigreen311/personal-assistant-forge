import type { ReputationStatus, EmailHeaderAnalysis, ThreatLevel } from './types';

// --- Phone reputation constants ---

const HIGH_RISK_PREFIXES: [string, number][] = [
  ['+0', 95],        // Invalid country code
  ['+1555', 85],     // US fictional
  ['+1900', 80],     // US premium rate
  ['+44070', 75],    // UK personal numbering
  ['+234', 60],      // Nigeria, high fraud
  ['+86', 55],       // China, high spam
];

const LOW_RISK_COUNTRY_CODES = ['+1', '+44', '+61', '+49'];
const HIGH_RISK_COUNTRY_CODES = ['+234', '+86', '+233', '+225', '+228', '+92', '+880'];

// --- Email reputation constants ---

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email', 'yopmail.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com', 'mailnesia.com',
  'trashmail.com', 'maildrop.cc', 'fakeinbox.com', 'tempail.com', 'tempr.email',
  'mailcatch.com', 'trash-mail.com', 'mytemp.email', 'mohmal.com', 'getnada.com',
  'emailondeck.com', 'temp-mail.org', '10minutemail.com', 'minutemail.com', 'email-fake.com',
  'crazymailing.com', 'filzmail.com', 'inboxbear.com', 'mailforspam.com', 'harakirimail.com',
  'spamgourmet.com', 'mailexpire.com', 'discard.email', 'deadaddress.com', 'sogetthis.com',
  'mailsac.com', 'burpcollaborator.net', 'mailnull.com', 'jetable.org', 'trashmail.net',
  'spamfree24.org', 'binkmail.com', 'spaml.com', 'uggsrock.com', 'mailzilla.org',
  'bobmail.info', 'nomail.xl.cx', 'rmqkr.net', 'spam4.me',
]);

const TRUSTED_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'protonmail.com', 'icloud.com', 'aol.com',
]);

const SUSPICIOUS_TLDS = new Set(['.xyz', '.top', '.click', '.gq', '.cf', '.tk', '.ml', '.ga']);

// --- Phone reputation ---

function isValidE164(phone: string): boolean {
  return /^\+\d{7,15}$/.test(phone);
}

function getPhonePrefixScore(phone: string): number {
  // Check against known high-risk prefixes first
  for (const [prefix, score] of HIGH_RISK_PREFIXES) {
    if (phone.startsWith(prefix)) return score;
  }

  // Basic heuristic scoring for phones that don't match known prefixes:
  // Start with a baseline and adjust based on format characteristics
  let score = 20; // baseline for unknown numbers

  // Shorter numbers are more suspicious (potential short codes or spoofed)
  const digitCount = phone.replace(/\D/g, '').length;
  if (digitCount < 8) score += 15;
  if (digitCount > 15) score += 10;

  // Numbers with repeated digits are suspicious (e.g., +1111111111)
  const digits = phone.slice(1); // skip the '+'
  const uniqueDigits = new Set(digits.replace(/\D/g, '')).size;
  if (uniqueDigits <= 2) score += 25;
  else if (uniqueDigits <= 3) score += 10;

  // Sequential digit patterns (e.g., 1234567890) are suspicious
  const digitStr = phone.replace(/\D/g, '');
  let sequential = 0;
  for (let i = 1; i < digitStr.length; i++) {
    if (parseInt(digitStr[i]) === parseInt(digitStr[i - 1]) + 1) {
      sequential++;
    }
  }
  if (sequential >= 5) score += 15;

  // Apply country code tier adjustment
  const tier = getCountryCodeRiskTier(phone);
  if (tier === 'low') score = Math.max(5, score - 10);
  else if (tier === 'high') score += 20;

  return Math.min(score, 100);
}

function getCountryCodeRiskTier(phone: string): 'low' | 'medium' | 'high' {
  for (const code of HIGH_RISK_COUNTRY_CODES) {
    if (phone.startsWith(code)) return 'high';
  }
  for (const code of LOW_RISK_COUNTRY_CODES) {
    if (phone.startsWith(code)) return 'low';
  }
  return 'medium';
}

function isUsOrCaNumber(phone: string): boolean {
  return phone.startsWith('+1');
}

export async function checkPhoneReputation(phoneNumber: string): Promise<ReputationStatus> {
  if (!isValidE164(phoneNumber)) {
    return {
      channel: 'PHONE',
      identifier: phoneNumber,
      spamScore: 90,
      warmingProgress: 0,
      stirShakenCompliant: false,
      lastChecked: new Date(),
    };
  }

  const spamScore = getPhonePrefixScore(phoneNumber);
  const tier = getCountryCodeRiskTier(phoneNumber);

  // Calculate warming progress inversely proportional to spam score
  // Low spam scores indicate trusted numbers with high warming progress
  let warmingProgress: number;
  if (spamScore <= 15) warmingProgress = 90;
  else if (spamScore <= 30) warmingProgress = 60;
  else if (spamScore <= 50) warmingProgress = 35;
  else if (spamScore <= 70) warmingProgress = 20;
  else warmingProgress = 10;

  // Adjust based on tier when score is in the mid-range
  if (tier === 'low' && warmingProgress < 90) warmingProgress += 10;
  if (tier === 'high' && warmingProgress > 10) warmingProgress -= 10;

  return {
    channel: 'PHONE',
    identifier: phoneNumber,
    spamScore,
    warmingProgress: Math.max(0, Math.min(100, warmingProgress)),
    stirShakenCompliant: isUsOrCaNumber(phoneNumber),
    lastChecked: new Date(),
  };
}

// --- Email reputation ---

function isValidDomain(domain: string): boolean {
  if (!domain || domain.includes(' ') || domain.length > 253) return false;
  return domain.includes('.');
}

function getTld(domain: string): string {
  const lastDot = domain.lastIndexOf('.');
  if (lastDot === -1) return '';
  return domain.slice(lastDot).toLowerCase();
}

function getDomainNameBeforeTld(domain: string): string {
  const lastDot = domain.lastIndexOf('.');
  if (lastDot === -1) return domain;
  return domain.slice(0, lastDot);
}

function countDigits(str: string): number {
  return (str.match(/\d/g) || []).length;
}

export async function checkEmailReputation(domain: string): Promise<ReputationStatus> {
  const lowerDomain = domain.toLowerCase();

  if (!isValidDomain(lowerDomain)) {
    return {
      channel: 'EMAIL',
      identifier: domain,
      spamScore: 90,
      dkimValid: undefined,
      spfValid: undefined,
      dmarcValid: undefined,
      lastChecked: new Date(),
    };
  }

  if (TRUSTED_DOMAINS.has(lowerDomain)) {
    return {
      channel: 'EMAIL',
      identifier: domain,
      spamScore: 5,
      dkimValid: true,
      spfValid: true,
      dmarcValid: true,
      lastChecked: new Date(),
    };
  }

  if (DISPOSABLE_DOMAINS.has(lowerDomain)) {
    return {
      channel: 'EMAIL',
      identifier: domain,
      spamScore: 80,
      dkimValid: false,
      spfValid: false,
      dmarcValid: false,
      lastChecked: new Date(),
    };
  }

  const tld = getTld(lowerDomain);

  if (tld === '.edu') {
    return {
      channel: 'EMAIL',
      identifier: domain,
      spamScore: 10,
      dkimValid: undefined,
      spfValid: undefined,
      dmarcValid: undefined,
      lastChecked: new Date(),
    };
  }

  if (tld === '.gov') {
    return {
      channel: 'EMAIL',
      identifier: domain,
      spamScore: 5,
      dkimValid: undefined,
      spfValid: undefined,
      dmarcValid: undefined,
      lastChecked: new Date(),
    };
  }

  // Heuristic scoring for unknown domains
  let spamScore = 25; // base score for unknown domains

  const nameBeforeTld = getDomainNameBeforeTld(lowerDomain);

  if (nameBeforeTld.length < 4) {
    spamScore += 10;
  }
  if (nameBeforeTld.length > 30) {
    spamScore += 15;
  }
  if (countDigits(nameBeforeTld) >= 4) {
    spamScore += 10;
  }
  if (SUSPICIOUS_TLDS.has(tld)) {
    spamScore += 20;
  }

  return {
    channel: 'EMAIL',
    identifier: domain,
    spamScore: Math.min(spamScore, 100),
    dkimValid: undefined,
    spfValid: undefined,
    dmarcValid: undefined,
    lastChecked: new Date(),
  };
}

// --- Email header analysis (preserved as-is) ---

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

// --- Reputation dashboard ---

export async function getReputationDashboard(entityId: string): Promise<ReputationStatus[]> {
  const results: ReputationStatus[] = [];

  // Determine if entityId looks like a phone number or email domain and check accordingly
  if (entityId.startsWith('+')) {
    results.push(await checkPhoneReputation(entityId));
  } else if (entityId.includes('.')) {
    results.push(await checkEmailReputation(entityId));
  } else {
    // Treat as both phone (with +1 prefix) and email domain
    results.push(await checkPhoneReputation(`+1${entityId}`));
    results.push(await checkEmailReputation(entityId));
  }

  return results;
}
