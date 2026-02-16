import {
  getDefaultTemplates,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  templateStore,
} from '@/modules/documents/services/template-service';
import type { DocumentType } from '@/shared/types/index';

describe('template-service', () => {
  beforeEach(() => {
    // Reset store to defaults
    templateStore.clear();
    for (const tpl of getDefaultTemplates()) {
      templateStore.set(tpl.id, tpl);
    }
  });

  describe('getDefaultTemplates', () => {
    it('returns 10 default templates', () => {
      const templates = getDefaultTemplates();
      expect(templates).toHaveLength(10);
      expect(templates.every((t) => t.id.startsWith('tpl-'))).toBe(true);
    });
  });

  describe('getTemplates', () => {
    it('with no filter returns all templates', async () => {
      const templates = await getTemplates();
      expect(templates).toHaveLength(10);
    });

    it('with type filter returns matching only', async () => {
      const templates = await getTemplates('BRIEF' as DocumentType);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.type === 'BRIEF')).toBe(true);
    });

    it('with category filter returns matching only', async () => {
      const templates = await getTemplates(undefined, 'legal');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === 'legal')).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('returns the template for a known ID', async () => {
      const template = await getTemplate('tpl-exec-brief');
      expect(template).not.toBeNull();
      expect(template!.id).toBe('tpl-exec-brief');
      expect(template!.name).toBe('Executive Brief');
    });

    it('returns null for unknown ID', async () => {
      const template = await getTemplate('non-existent');
      expect(template).toBeNull();
    });
  });

  describe('createTemplate', () => {
    it('creates a new template with generated ID, version 1, and timestamps', async () => {
      const template = await createTemplate({
        name: 'Custom Template',
        type: 'BRIEF' as DocumentType,
        category: 'custom',
        content: '# {{title}}',
        variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }],
        brandKitRequired: false,
        outputFormats: ['PDF'],
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Custom Template');
      expect(template.version).toBe(1);
      expect(template.createdAt).toBeInstanceOf(Date);
      expect(template.updatedAt).toBeInstanceOf(Date);
      expect(templateStore.has(template.id)).toBe(true);
    });
  });

  describe('updateTemplate', () => {
    it('increments version and updates the template', async () => {
      const original = await getTemplate('tpl-exec-brief');
      expect(original).not.toBeNull();

      const updated = await updateTemplate('tpl-exec-brief', { name: 'Updated Brief' });

      expect(updated.name).toBe('Updated Brief');
      expect(updated.version).toBe(original!.version + 1);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(original!.updatedAt.getTime());
      expect(updated.id).toBe('tpl-exec-brief');
    });

    it('throws for unknown ID', async () => {
      await expect(updateTemplate('non-existent', { name: 'Nope' })).rejects.toThrow(
        'Template non-existent not found'
      );
    });
  });
});
