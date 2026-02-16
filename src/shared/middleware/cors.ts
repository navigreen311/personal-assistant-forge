import type { NextRequest } from 'next/server';

// --- Types ---

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

// --- Defaults ---

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization'];
const DEFAULT_MAX_AGE = 86400;

function getDefaultOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim());
  }
  return ['http://localhost:3000'];
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) {
    // WARNING: Wildcard origin is for development only. Do not use in production.
    return true;
  }
  return allowedOrigins.includes(origin);
}

// --- Core Functions ---

export function applyCorsHeaders(
  response: Response,
  origin: string,
  config: CorsConfig
): Response {
  const allowedOrigins = config.allowedOrigins.length > 0
    ? config.allowedOrigins
    : getDefaultOrigins();

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return response;
  }

  const methods = config.allowedMethods ?? DEFAULT_METHODS;
  const headers = config.allowedHeaders ?? DEFAULT_HEADERS;
  const maxAge = config.maxAge ?? DEFAULT_MAX_AGE;
  const credentials = config.credentials ?? true;

  // Clone response to add headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  newResponse.headers.set('Access-Control-Allow-Origin', origin);
  newResponse.headers.set('Access-Control-Allow-Methods', methods.join(', '));
  newResponse.headers.set('Access-Control-Allow-Headers', headers.join(', '));
  newResponse.headers.set('Access-Control-Max-Age', maxAge.toString());

  if (credentials) {
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (config.exposedHeaders && config.exposedHeaders.length > 0) {
    newResponse.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  }

  return newResponse;
}

export function handlePreflight(
  request: NextRequest,
  config: CorsConfig
): Response {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigins = config.allowedOrigins.length > 0
    ? config.allowedOrigins
    : getDefaultOrigins();

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return new Response(null, { status: 403 });
  }

  const methods = config.allowedMethods ?? DEFAULT_METHODS;
  const headers = config.allowedHeaders ?? DEFAULT_HEADERS;
  const maxAge = config.maxAge ?? DEFAULT_MAX_AGE;
  const credentials = config.credentials ?? true;

  const responseHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': headers.join(', '),
    'Access-Control-Max-Age': maxAge.toString(),
  };

  if (credentials) {
    responseHeaders['Access-Control-Allow-Credentials'] = 'true';
  }

  if (config.exposedHeaders && config.exposedHeaders.length > 0) {
    responseHeaders['Access-Control-Expose-Headers'] = config.exposedHeaders.join(', ');
  }

  return new Response(null, { status: 204, headers: responseHeaders });
}

export function withCors(
  config: CorsConfig
): (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => Promise<Response> {
  return async (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return handlePreflight(req, config);
    }

    const origin = req.headers.get('origin') ?? '';
    const response = await handler(req);
    return applyCorsHeaders(response, origin, config);
  };
}
