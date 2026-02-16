import { PersonaService } from '@/modules/entities/persona.service';
import { prisma } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('PersonaService', () => {
  let service: PersonaService;

  beforeEach(() => {
    service = new PersonaService();
    jest.clearAllMocks();
  });

  describe('getPersonaContext', () => {
    it('should return persona with brand kit info', async () => {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        name: 'MedLink Pro',
        type: 'LLC',
        complianceProfile: ['HIPAA'],
        brandKit: {
          primaryColor: '#2563eb',
          secondaryColor: '#60a5fa',
          toneGuide: 'Professional and empathetic',
        },
        voicePersonaId: 'voice-1',
      });

      const result = await service.getPersonaContext('ent-1');
      expect(result.entityName).toBe('MedLink Pro');
      expect(result.brandKit).toBeDefined();
      expect(result.brandKit!.primaryColor).toBe('#2563eb');
      expect(result.toneGuidance).toBe('Professional and empathetic');
    });

    it('should include compliance disclaimers for HIPAA entity', async () => {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        name: 'Health Corp',
        type: 'LLC',
        complianceProfile: ['HIPAA'],
        brandKit: null,
        voicePersonaId: null,
      });

      const result = await service.getPersonaContext('ent-1');
      expect(result.disclaimers.length).toBeGreaterThan(0);
      expect(result.disclaimers[0]).toContain('Protected Health Information');
    });

    it('should generate response prefix from entity name', async () => {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        name: 'Acme Corp',
        type: 'Corporation',
        complianceProfile: ['GENERAL'],
        brandKit: null,
        voicePersonaId: null,
      });

      const result = await service.getPersonaContext('ent-1');
      expect(result.responsePrefix).toBe('Responding as Acme Corp');
    });
  });

  describe('validateMessageForPersona', () => {
    it('should flag PHI in non-HIPAA entity messages', async () => {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        name: 'General Biz',
        type: 'LLC',
        complianceProfile: ['GENERAL'],
        brandKit: null,
      });

      const result = await service.validateMessageForPersona(
        'ent-1',
        'Patient diagnosis shows elevated levels',
      );
      expect(result.valid).toBe(false);
      expect(result.complianceIssues.length).toBeGreaterThan(0);
      expect(result.complianceIssues[0]).toContain('PHI');
    });

    it('should suggest tone adjustments based on brand kit', async () => {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        name: 'Formal Corp',
        type: 'Corporation',
        complianceProfile: ['GENERAL'],
        brandKit: { toneGuide: 'Formal and professional' },
      });

      const result = await service.validateMessageForPersona(
        'ent-1',
        'Hey guys, gonna send this over real quick',
      );
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toContain('formal');
    });
  });

  describe('getComplianceDisclaimers', () => {
    it('should return HIPAA disclaimer for HIPAA profile', () => {
      const disclaimers = service.getComplianceDisclaimers(['HIPAA']);
      expect(disclaimers).toHaveLength(1);
      expect(disclaimers[0]).toContain('Protected Health Information');
    });

    it('should return GDPR disclaimer for GDPR profile', () => {
      const disclaimers = service.getComplianceDisclaimers(['GDPR']);
      expect(disclaimers).toHaveLength(1);
      expect(disclaimers[0]).toContain('GDPR');
    });

    it('should return empty for GENERAL profile', () => {
      const disclaimers = service.getComplianceDisclaimers(['GENERAL']);
      expect(disclaimers).toHaveLength(0);
    });

    it('should combine multiple disclaimers', () => {
      const disclaimers = service.getComplianceDisclaimers(['HIPAA', 'GDPR', 'SOX']);
      expect(disclaimers).toHaveLength(3);
    });
  });
});
