import {
  getDefaultTemplates,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  templateStore,
} from '@/modules/documents/services/template-service';
import { verifiedEntityIdForTest } from '../../helpers/factories';
import type { DocumentType } from '@/shared/types/index';

const ENTITY_A = verifiedEntityIdForTest('entity-a');
const ENTITY_B = verifiedEntityIdForTest('entity-b');

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

    it('leaves them unowned, which is what makes them shared and read-only', () => {
      expect(getDefaultTemplates().every((t) => t.entityId === undefined)).toBe(true);
    });
  });

  describe('getTemplates', () => {
    it('with no filter returns all built-in templates', async () => {
      const templates = await getTemplates(ENTITY_A);
      expect(templates).toHaveLength(10);
    });

    it('with type filter returns matching only', async () => {
      const templates = await getTemplates(ENTITY_A, 'BRIEF' as DocumentType);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.type === 'BRIEF')).toBe(true);
    });

    it('with category filter returns matching only', async () => {
      const templates = await getTemplates(ENTITY_A, undefined, 'legal');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === 'legal')).toBe(true);
    });

    it("does not list another tenant's custom template", async () => {
      await createTemplate(
        {
          name: 'A private template',
          type: 'BRIEF' as DocumentType,
          category: 'custom',
          content: '# {{title}}',
          variables: [],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      const mine = await getTemplates(ENTITY_A);
      const theirs = await getTemplates(ENTITY_B);

      expect(mine).toHaveLength(11);
      expect(theirs).toHaveLength(10);
      expect(theirs.some((t) => t.name === 'A private template')).toBe(false);
    });

    it('applies the scope even when a filter would otherwise match', async () => {
      await createTemplate(
        {
          name: 'A private legal template',
          type: 'CONTRACT' as DocumentType,
          category: 'legal',
          content: 'x',
          variables: [],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      const theirs = await getTemplates(ENTITY_B, undefined, 'legal');
      expect(theirs.some((t) => t.name === 'A private legal template')).toBe(false);
    });
  });

  describe('getTemplate', () => {
    it('returns a built-in template for any entity', async () => {
      const template = await getTemplate('tpl-exec-brief', ENTITY_A);
      expect(template).not.toBeNull();
      expect(template!.id).toBe('tpl-exec-brief');
      expect(template!.name).toBe('Executive Brief');
    });

    it('returns null for unknown ID', async () => {
      const template = await getTemplate('non-existent', ENTITY_A);
      expect(template).toBeNull();
    });

    it("reports another tenant's template as absent, so an id probe learns nothing", async () => {
      const mine = await createTemplate(
        {
          name: 'Mine',
          type: 'BRIEF' as DocumentType,
          category: 'custom',
          content: 'x',
          variables: [],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      expect(await getTemplate(mine.id, ENTITY_A)).not.toBeNull();
      expect(await getTemplate(mine.id, ENTITY_B)).toBeNull();
    });
  });

  describe('createTemplate', () => {
    it('creates a new template with generated ID, version 1, and timestamps', async () => {
      const template = await createTemplate(
        {
          name: 'Custom Template',
          type: 'BRIEF' as DocumentType,
          category: 'custom',
          content: '# {{title}}',
          variables: [{ name: 'title', label: 'Title', type: 'TEXT', required: true }],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Custom Template');
      expect(template.version).toBe(1);
      expect(template.entityId).toBe('entity-a');
      expect(template.createdAt).toBeInstanceOf(Date);
      expect(template.updatedAt).toBeInstanceOf(Date);
      expect(templateStore.has(template.id)).toBe(true);
    });
  });

  describe('updateTemplate', () => {
    it('increments version and updates a template the entity owns', async () => {
      const original = await createTemplate(
        {
          name: 'Custom Template',
          type: 'BRIEF' as DocumentType,
          category: 'custom',
          content: '# {{title}}',
          variables: [],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      const updated = await updateTemplate(original.id, ENTITY_A, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
      expect(updated.version).toBe(original.version + 1);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
      expect(updated.id).toBe(original.id);
      expect(updated.entityId).toBe('entity-a');
    });

    /**
     * CORRECTED TEST -- it previously asserted the defect.
     *
     * The old version of this suite called `updateTemplate('tpl-exec-brief', ...)`
     * and asserted that the built-in template was rewritten and its version
     * bumped. Built-in templates are shared by every tenant in the process, so
     * that was one tenant editing every other tenant's Executive Brief, encoded
     * as correct behaviour. Built-ins are read-only now.
     */
    it('refuses to modify a shared built-in template', async () => {
      await expect(
        updateTemplate('tpl-exec-brief', ENTITY_A, { name: 'Updated Brief' })
      ).rejects.toThrow('Template tpl-exec-brief not found');

      expect(templateStore.get('tpl-exec-brief')!.name).toBe('Executive Brief');
      expect(templateStore.get('tpl-exec-brief')!.version).toBe(1);
    });

    it("refuses another tenant's template, and changes nothing", async () => {
      const mine = await createTemplate(
        {
          name: 'Mine',
          type: 'BRIEF' as DocumentType,
          category: 'custom',
          content: 'x',
          variables: [],
          brandKitRequired: false,
          outputFormats: ['PDF'],
        },
        ENTITY_A
      );

      await expect(updateTemplate(mine.id, ENTITY_B, { name: 'Hijacked' })).rejects.toThrow(
        'not found'
      );

      expect(templateStore.get(mine.id)!.name).toBe('Mine');
      expect(templateStore.get(mine.id)!.version).toBe(1);
    });

    it('throws for unknown ID', async () => {
      await expect(
        updateTemplate('non-existent', ENTITY_A, { name: 'Nope' })
      ).rejects.toThrow('Template non-existent not found');
    });
  });
});
