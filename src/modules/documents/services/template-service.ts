import { v4 as uuidv4 } from 'uuid';
import type { DocumentType } from '@/shared/types';
import type { DocumentTemplate } from '../types';

const templateStore = new Map<string, DocumentTemplate>();

export function getDefaultTemplates(): DocumentTemplate[] {
  const now = new Date();
  return [
    { id: 'tpl-exec-brief', name: 'Executive Brief', type: 'BRIEF' as DocumentType, category: 'business', content: '# {{title}}\n\n**Prepared for:** {{recipient}}\n**Date:** {{date}}\n\n## Executive Summary\n{{summary}}\n\n## Key Points\n{{keyPoints}}\n\n## Recommendations\n{{recommendations}}', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'recipient', label: 'Recipient', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'summary', label: 'Summary', type: 'TEXT', required: true }, { name: 'keyPoints', label: 'Key Points', type: 'TEXT', required: true }, { name: 'recommendations', label: 'Recommendations', type: 'TEXT', required: false }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF', 'MARKDOWN', 'HTML'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-memo', name: 'Internal Memo', type: 'MEMO' as DocumentType, category: 'business', content: '# MEMORANDUM\n\n**To:** {{to}}\n**From:** {{from}}\n**Date:** {{date}}\n**Re:** {{subject}}\n\n---\n\n{{body}}', variables: [{ name: 'to', label: 'To', type: 'TEXT', required: true }, { name: 'from', label: 'From', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'subject', label: 'Subject', type: 'TEXT', required: true }, { name: 'body', label: 'Body', type: 'TEXT', required: true }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF', 'MARKDOWN'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-sop', name: 'Standard Operating Procedure', type: 'SOP' as DocumentType, category: 'operations', content: '# SOP: {{title}}\n\n**Department:** {{department}}\n**Effective Date:** {{date}}\n**Version:** {{version}}\n\n## Purpose\n{{purpose}}\n\n## Scope\n{{scope}}\n\n## Procedure\n{{procedure}}', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'department', label: 'Department', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'version', label: 'Version', type: 'TEXT', required: false, defaultValue: '1.0' }, { name: 'purpose', label: 'Purpose', type: 'TEXT', required: true }, { name: 'scope', label: 'Scope', type: 'TEXT', required: true }, { name: 'procedure', label: 'Procedure', type: 'TEXT', required: true }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF', 'MARKDOWN'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-minutes', name: 'Meeting Minutes', type: 'MINUTES' as DocumentType, category: 'meetings', content: '# Meeting Minutes: {{title}}\n\n**Date:** {{date}}\n**Attendees:** {{attendees}}\n\n## Agenda\n{{agenda}}\n\n## Discussion\n{{discussion}}\n\n## Action Items\n{{actionItems}}', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'attendees', label: 'Attendees', type: 'TEXT', required: true }, { name: 'agenda', label: 'Agenda', type: 'TEXT', required: true }, { name: 'discussion', label: 'Discussion', type: 'TEXT', required: true }, { name: 'actionItems', label: 'Action Items', type: 'TEXT', required: false }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF', 'MARKDOWN'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-invoice', name: 'Invoice', type: 'INVOICE' as DocumentType, category: 'finance', content: '# INVOICE\n\n**Invoice #:** {{invoiceNumber}}\n**Date:** {{date}}\n**Due Date:** {{dueDate}}\n\n**Bill To:**\n{{billTo}}\n\n## Items\n{{items}}\n\n**Total:** {{total}}', variables: [{ name: 'invoiceNumber', label: 'Invoice Number', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'dueDate', label: 'Due Date', type: 'DATE', required: true }, { name: 'billTo', label: 'Bill To', type: 'TEXT', required: true }, { name: 'items', label: 'Items', type: 'TEXT', required: true }, { name: 'total', label: 'Total', type: 'NUMBER', required: true }], brandKitRequired: true, outputFormats: ['PDF', 'HTML'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-sow', name: 'Statement of Work', type: 'SOW' as DocumentType, category: 'legal', content: '# Statement of Work\n\n**Project:** {{projectName}}\n**Client:** {{client}}\n**Date:** {{date}}\n\n## Scope of Work\n{{scope}}\n\n## Deliverables\n{{deliverables}}\n\n## Timeline\n{{timeline}}\n\n## Budget\n{{budget}}', variables: [{ name: 'projectName', label: 'Project Name', type: 'TEXT', required: true }, { name: 'client', label: 'Client', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'scope', label: 'Scope', type: 'TEXT', required: true }, { name: 'deliverables', label: 'Deliverables', type: 'TEXT', required: true }, { name: 'timeline', label: 'Timeline', type: 'TEXT', required: true }, { name: 'budget', label: 'Budget', type: 'NUMBER', required: true }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-proposal', name: 'Business Proposal', type: 'PROPOSAL' as DocumentType, category: 'sales', content: '# {{title}}\n\n**Prepared for:** {{client}}\n**Prepared by:** {{author}}\n**Date:** {{date}}\n\n## Problem\n{{problem}}\n\n## Solution\n{{solution}}\n\n## Investment\n{{investment}}\n\n## Next Steps\n{{nextSteps}}', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'client', label: 'Client', type: 'TEXT', required: true }, { name: 'author', label: 'Author', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'problem', label: 'Problem', type: 'TEXT', required: true }, { name: 'solution', label: 'Solution', type: 'TEXT', required: true }, { name: 'investment', label: 'Investment', type: 'TEXT', required: true }, { name: 'nextSteps', label: 'Next Steps', type: 'TEXT', required: false }], brandKitRequired: true, outputFormats: ['DOCX', 'PDF', 'HTML'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-contract', name: 'Contract Agreement', type: 'CONTRACT' as DocumentType, category: 'legal', content: '# CONTRACT AGREEMENT\n\n**Parties:** {{partyA}} and {{partyB}}\n**Effective Date:** {{date}}\n\n## Terms\n{{terms}}\n\n## Obligations\n{{obligations}}\n\n## Signatures\n{{signatures}}', variables: [{ name: 'partyA', label: 'Party A', type: 'TEXT', required: true }, { name: 'partyB', label: 'Party B', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'terms', label: 'Terms', type: 'TEXT', required: true }, { name: 'obligations', label: 'Obligations', type: 'TEXT', required: true }, { name: 'signatures', label: 'Signatures', type: 'TEXT', required: false }], brandKitRequired: false, outputFormats: ['DOCX', 'PDF'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-report', name: 'Quarterly Report', type: 'REPORT' as DocumentType, category: 'reporting', content: '# {{title}} - {{quarter}}\n\n**Date:** {{date}}\n\n## Summary\n{{summary}}\n\n## Key Metrics\n{{metrics}}\n\n## Highlights\n{{highlights}}\n\n## Outlook\n{{outlook}}', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'quarter', label: 'Quarter', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'summary', label: 'Summary', type: 'TEXT', required: true }, { name: 'metrics', label: 'Metrics', type: 'TEXT', required: true }, { name: 'highlights', label: 'Highlights', type: 'TEXT', required: true }, { name: 'outlook', label: 'Outlook', type: 'TEXT', required: false }], brandKitRequired: true, outputFormats: ['DOCX', 'PDF', 'HTML'], version: 1, createdAt: now, updatedAt: now },
    { id: 'tpl-deck', name: 'Board Deck', type: 'DECK' as DocumentType, category: 'presentations', content: '# {{title}}\n\n**Presented by:** {{presenter}}\n**Date:** {{date}}\n\n---\n\n## Agenda\n{{agenda}}\n\n## Overview\n{{overview}}\n\n## Financials\n{{financials}}\n\n## Q&A', variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }, { name: 'presenter', label: 'Presenter', type: 'TEXT', required: true }, { name: 'date', label: 'Date', type: 'DATE', required: true }, { name: 'agenda', label: 'Agenda', type: 'TEXT', required: true }, { name: 'overview', label: 'Overview', type: 'TEXT', required: true }, { name: 'financials', label: 'Financials', type: 'TEXT', required: true }], brandKitRequired: true, outputFormats: ['PDF', 'HTML'], version: 1, createdAt: now, updatedAt: now },
  ];
}

// Seed defaults
for (const tpl of getDefaultTemplates()) {
  templateStore.set(tpl.id, tpl);
}

export async function getTemplates(type?: DocumentType, category?: string): Promise<DocumentTemplate[]> {
  const results: DocumentTemplate[] = [];
  for (const tpl of templateStore.values()) {
    if (type && tpl.type !== type) continue;
    if (category && tpl.category !== category) continue;
    results.push(tpl);
  }
  return results;
}

export async function getTemplate(templateId: string): Promise<DocumentTemplate | null> {
  return templateStore.get(templateId) || null;
}

export async function createTemplate(
  template: Omit<DocumentTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<DocumentTemplate> {
  const now = new Date();
  const newTemplate: DocumentTemplate = {
    ...template,
    id: uuidv4(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  templateStore.set(newTemplate.id, newTemplate);
  return newTemplate;
}

export async function updateTemplate(
  templateId: string,
  updates: Partial<DocumentTemplate>
): Promise<DocumentTemplate> {
  const template = templateStore.get(templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const updated: DocumentTemplate = {
    ...template,
    ...updates,
    id: templateId,
    version: template.version + 1,
    updatedAt: new Date(),
  };
  templateStore.set(templateId, updated);
  return updated;
}

export { templateStore };
