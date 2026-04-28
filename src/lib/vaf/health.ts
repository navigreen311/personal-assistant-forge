// Lightweight health probe for the VAF service. Used by the voice
// pipeline to decide whether to attempt VAF or fall straight back to
// the browser Web Speech API.

const HEALTH_TIMEOUT_MS = 2000;

function vafBaseUrl(): string {
  return process.env.VAF_SERVICE_URL || 'http://localhost:4100';
}

export async function isVAFAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${vafBaseUrl()}/api/v1/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
