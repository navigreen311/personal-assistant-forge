import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { uploadFile, getSignedDownloadUrl, deleteFile } from './client';

// --- Types ---

export interface UploadConfig {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ],
  allowedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.txt', '.csv',
  ],
};

export interface UploadResult {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  checksum: string;
}

export interface UploadValidationError {
  field: string;
  message: string;
}

// --- Validation ---

export function validateFile(
  file: { name: string; size: number; type: string },
  config?: Partial<UploadConfig>
): { valid: boolean; errors: UploadValidationError[] } {
  const cfg: UploadConfig = { ...DEFAULT_UPLOAD_CONFIG, ...config };
  const errors: UploadValidationError[] = [];

  if (file.size > cfg.maxFileSizeBytes) {
    errors.push({
      field: 'size',
      message: `File size ${file.size} bytes exceeds maximum ${cfg.maxFileSizeBytes} bytes`,
    });
  }

  if (!cfg.allowedMimeTypes.includes(file.type)) {
    errors.push({
      field: 'mimeType',
      message: `MIME type '${file.type}' is not allowed`,
    });
  }

  const ext = getExtension(file.name);
  if (!cfg.allowedExtensions.includes(ext)) {
    errors.push({
      field: 'extension',
      message: `File extension '${ext}' is not allowed`,
    });
  }

  return { valid: errors.length === 0, errors };
}

// --- Filename / Key Helpers ---

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot).toLowerCase();
}

export function sanitizeFileName(fileName: string): string {
  // Remove path traversal sequences
  let sanitized = fileName.replace(/\.\./g, '');
  // Remove directory separators
  sanitized = sanitized.replace(/[/\\]/g, '');
  // Remove special characters, keep alphanumeric, dots, hyphens, underscores, and spaces
  sanitized = sanitized.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
  // Collapse multiple spaces/dots/dashes
  sanitized = sanitized.replace(/\s+/g, '_');
  sanitized = sanitized.replace(/\.{2,}/g, '.');
  sanitized = sanitized.replace(/-{2,}/g, '-');
  sanitized = sanitized.replace(/_{2,}/g, '_');
  // Trim leading/trailing dots, dashes, underscores
  sanitized = sanitized.replace(/^[.\-_]+|[.\-_]+$/g, '');
  // Limit to 255 characters
  if (sanitized.length > 255) {
    const ext = getExtension(sanitized);
    const base = sanitized.slice(0, 255 - ext.length);
    sanitized = base + ext;
  }

  return sanitized || 'unnamed';
}

export function generateStorageKey(params: {
  entityId: string;
  category: 'documents' | 'images' | 'attachments' | 'exports';
  fileName: string;
}): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = uuidv4();
  const sanitized = sanitizeFileName(params.fileName);
  return `${params.entityId}/${params.category}/${year}/${month}/${uuid}-${sanitized}`;
}

// --- Checksum ---

export async function calculateChecksum(content: Buffer | ArrayBuffer): Promise<string> {
  const buf = content instanceof ArrayBuffer ? Buffer.from(content) : content;
  return createHash('sha256').update(buf).digest('hex');
}

// --- Virus Scan ---
//
// DEV PLACEHOLDER: In development, this always returns clean.
// In production, set the CLAMAV_HOST environment variable (e.g. "clamav:3310")
// to enable real virus scanning via ClamAV's TCP socket protocol.
// Future alternatives: cloud-based scanning (e.g. VirusTotal API, AWS S3
// malware scanning, or Google Cloud DLP).

export async function scanForVirus(
  content: Buffer | ArrayBuffer
): Promise<{ clean: boolean; threat?: string }> {
  const clamavHost = process.env.CLAMAV_HOST;

  if (clamavHost) {
    // Real ClamAV scan via TCP socket (clamd INSTREAM protocol)
    try {
      const { Socket } = await import('net');
      const [host, portStr] = clamavHost.split(':');
      const port = parseInt(portStr || '3310', 10);
      const buf = content instanceof ArrayBuffer ? Buffer.from(content) : content;

      return await new Promise<{ clean: boolean; threat?: string }>((resolve, reject) => {
        const socket = new Socket();
        const chunks: Buffer[] = [];

        socket.setTimeout(30_000);
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('ClamAV scan timed out'));
        });

        socket.connect(port, host, () => {
          // Send INSTREAM command
          socket.write('zINSTREAM\0');
          // Send data length as 4-byte big-endian, then data
          const sizeBuffer = Buffer.alloc(4);
          sizeBuffer.writeUInt32BE(buf.length, 0);
          socket.write(sizeBuffer);
          socket.write(buf);
          // Send zero-length chunk to signal end
          const endBuffer = Buffer.alloc(4, 0);
          socket.write(endBuffer);
        });

        socket.on('data', (data) => chunks.push(data));

        socket.on('end', () => {
          const response = Buffer.concat(chunks).toString('utf-8').trim();
          if (response.includes('OK')) {
            resolve({ clean: true });
          } else {
            // Response format: "stream: <threat> FOUND"
            const match = response.match(/stream:\s*(.+)\s+FOUND/);
            resolve({
              clean: false,
              threat: match ? match[1].trim() : response,
            });
          }
        });

        socket.on('error', (err) => reject(err));
      });
    } catch (err) {
      // If ClamAV is unreachable, fail closed (reject the file)
      return {
        clean: false,
        threat: `Virus scan unavailable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Intentional dev placeholder: no CLAMAV_HOST configured, skip scanning.
  return { clean: true };
}

// --- Upload Processing ---

export async function processUpload(params: {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  entityId: string;
  userId: string;
  category?: 'documents' | 'images' | 'attachments' | 'exports';
  config?: Partial<UploadConfig>;
}): Promise<UploadResult> {
  const { file, fileName, mimeType, entityId, category = 'documents', config } = params;

  // 1. Validate
  const validation = validateFile(
    { name: fileName, size: file.size, type: mimeType },
    config
  );
  if (!validation.valid) {
    const messages = validation.errors.map((e) => e.message).join('; ');
    throw new Error(`UPLOAD_VALIDATION_FAILED: ${messages}`);
  }

  // 2. Read file content
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3. Virus scan
  const scanResult = await scanForVirus(buffer);
  if (!scanResult.clean) {
    throw new Error(`VIRUS_DETECTED: ${scanResult.threat ?? 'Unknown threat'}`);
  }

  // 4. Calculate checksum
  const checksum = await calculateChecksum(buffer);

  // 5. Generate storage key
  const key = generateStorageKey({ entityId, category, fileName });

  // 6. Upload to storage
  const url = await uploadFile(key, buffer, mimeType);

  return {
    key,
    fileName: sanitizeFileName(fileName),
    mimeType,
    sizeBytes: buffer.length,
    url,
    checksum,
  };
}

// --- Delete ---

export async function deleteUpload(key: string): Promise<boolean> {
  try {
    await deleteFile(key);
    return true;
  } catch {
    return false;
  }
}

// --- Presigned URL ---

export async function getAccessUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedDownloadUrl(key, expiresInSeconds);
}
