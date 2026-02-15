import type { DocumentType, BrandKit, Citation } from '@/shared/types';

export type { DocumentType, BrandKit, Citation };

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  category: string;
  content: string;
  variables: TemplateVariable[];
  brandKitRequired: boolean;
  outputFormats: ('DOCX' | 'PDF' | 'MARKDOWN' | 'HTML')[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: 'TEXT' | 'DATE' | 'NUMBER' | 'SELECT' | 'ENTITY_REF' | 'CONTACT_REF';
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface DocumentGeneration {
  templateId: string;
  variables: Record<string, string>;
  entityId: string;
  brandKit?: BrandKit;
  outputFormat: 'DOCX' | 'PDF' | 'MARKDOWN' | 'HTML';
  citationsEnabled: boolean;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  changedBy: string;
  changeDescription: string;
  createdAt: Date;
}

export interface Redline {
  id: string;
  documentId: string;
  version1: number;
  version2: number;
  changes: RedlineChange[];
}

export interface RedlineChange {
  type: 'ADDITION' | 'DELETION' | 'MODIFICATION';
  position: { start: number; end: number };
  originalText?: string;
  newText?: string;
}

export interface ESignRequest {
  id: string;
  documentId: string;
  signers: { name: string; email: string; order: number; status: 'PENDING' | 'SIGNED' | 'DECLINED' }[];
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_SIGNED' | 'COMPLETE' | 'CANCELLED';
  provider: string;
  createdAt: Date;
}

export interface BrandKitConfig {
  entityId: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  fontFamily: string;
  headerTemplate?: string;
  footerTemplate?: string;
  watermark?: string;
}

export interface PresentationSlide {
  order: number;
  title: string;
  content: string;
  layout: 'TITLE' | 'CONTENT' | 'TWO_COLUMN' | 'IMAGE' | 'CHART' | 'BLANK';
  notes?: string;
}
