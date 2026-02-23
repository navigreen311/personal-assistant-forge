import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

function log(msg: string) {
  console.log(`  → ${msg}`);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌱 Starting seed...\n');

  // -- Clear existing data (reverse dependency order) --
  log('Clearing existing data...');
  // Shadow Voice Agent tables (must delete before User/Entity/Contact)
  await prisma.contactCallPreference.deleteMany();
  await prisma.voiceforgeConsentConfig.deleteMany();
  await prisma.voiceforgeCallPlaybook.deleteMany();
  await prisma.shadowOutreach.deleteMany();
  await prisma.shadowRetentionConfig.deleteMany();
  await prisma.shadowOverrideLog.deleteMany();
  await prisma.shadowPreference.deleteMany();
  await prisma.shadowTrigger.deleteMany();
  await prisma.shadowChannelEffectiveness.deleteMany();
  await prisma.shadowProactiveConfig.deleteMany();
  await prisma.shadowEntityProfile.deleteMany();
  await prisma.shadowSafetyConfig.deleteMany();
  await prisma.shadowAuthEvent.deleteMany();
  await prisma.shadowTrustedDevice.deleteMany();
  await prisma.shadowSessionOutcome.deleteMany();
  await prisma.shadowConsentReceipt.deleteMany();
  await prisma.shadowMessage.deleteMany();
  await prisma.shadowVoiceSession.deleteMany();
  // Core tables
  await prisma.runbook.deleteMany();
  await prisma.voicePersona.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.memoryEntry.deleteMany();
  await prisma.consentReceipt.deleteMany();
  await prisma.actionLog.deleteMany();
  await prisma.financialRecord.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.call.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.knowledgeEntry.deleteMany();
  await prisma.document.deleteMany();
  await prisma.message.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.user.deleteMany();
  log('Cleared.');

  // =========================================================================
  // USERS
  // =========================================================================
  log('Seeding users...');

  const marcus = await prisma.user.create({
    data: {
      name: 'Marcus Thompson',
      email: 'marcus@example.com',
      timezone: 'America/Chicago',
      chronotype: 'EARLY_BIRD',
      preferences: {
        defaultTone: 'DIRECT',
        attentionBudget: 8,
        focusHours: [{ start: '06:00', end: '10:00' }],
        vipContacts: [],
        meetingFreedays: [0, 6],
        autonomyLevel: 'EXECUTE_WITH_APPROVAL',
      },
    },
  });

  const sarah = await prisma.user.create({
    data: {
      name: 'Sarah Chen',
      email: 'sarah@example.com',
      timezone: 'America/New_York',
      chronotype: 'NIGHT_OWL',
      preferences: {
        defaultTone: 'DIPLOMATIC',
        attentionBudget: 12,
        focusHours: [{ start: '20:00', end: '23:00' }],
        vipContacts: [],
        meetingFreedays: [0],
        autonomyLevel: 'SUGGEST',
      },
    },
  });

  log(`done (2 created: ${marcus.id}, ${sarah.id})`);

  // =========================================================================
  // ENTITIES
  // =========================================================================
  log('Seeding entities...');

  const medlink = await prisma.entity.create({
    data: {
      userId: marcus.id,
      name: 'MedLink Pro',
      type: 'LLC',
      complianceProfile: ['HIPAA', 'GDPR'],
      brandKit: {
        primaryColor: '#0077B6',
        secondaryColor: '#00B4D8',
        toneGuide: 'Professional, empathetic, HIPAA-conscious',
      },
      voicePersonaId: 'medlink-professional',
    },
  });

  const creForge = await prisma.entity.create({
    data: {
      userId: marcus.id,
      name: 'CRE Forge',
      type: 'LLC',
      complianceProfile: ['REAL_ESTATE', 'SOX'],
      brandKit: {
        primaryColor: '#2D6A4F',
        secondaryColor: '#95D5B2',
        toneGuide: 'Confident, data-driven, relationship-focused',
      },
      phoneNumbers: ['+15551234567'],
    },
  });

  const personal = await prisma.entity.create({
    data: {
      userId: marcus.id,
      name: 'Personal',
      type: 'Personal',
      complianceProfile: ['GENERAL'],
    },
  });

  log(`done (3 created)`);

  // =========================================================================
  // CONTACTS
  // =========================================================================
  log('Seeding contacts...');

  // --- MedLink Pro contacts ---
  const drMartinez = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Dr. Elena Martinez',
      email: 'elena.martinez@medlink.example.com',
      phone: '+15559001001',
      channels: [
        { type: 'EMAIL', handle: 'elena.martinez@medlink.example.com' },
        { type: 'SMS', handle: '+15559001001' },
      ],
      relationshipScore: 85,
      lastTouch: daysAgo(2),
      commitments: [
        { id: 'c1', description: 'Review EHR integration specs', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(7), createdAt: daysAgo(5) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIPLOMATIC', timezone: 'America/Chicago' },
      tags: ['VIP', 'physician'],
    },
  });

  const jamesWu = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'James Wu',
      email: 'james.wu@meddevices.example.com',
      channels: [{ type: 'EMAIL', handle: 'james.wu@meddevices.example.com' }],
      relationshipScore: 60,
      lastTouch: daysAgo(10),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['vendor'],
    },
  });

  const nurseOwens = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Nurse Patricia Owens',
      email: 'p.owens@clinic.example.com',
      phone: '+15559001003',
      channels: [
        { type: 'EMAIL', handle: 'p.owens@clinic.example.com' },
        { type: 'SMS', handle: '+15559001003' },
      ],
      relationshipScore: 75,
      lastTouch: daysAgo(3),
      commitments: [
        { id: 'c2', description: 'Send patient portal feedback', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(3), createdAt: daysAgo(2) },
      ],
      preferences: { preferredChannel: 'SMS', preferredTone: 'WARM' },
      tags: ['clinic'],
    },
  });

  const drPatel = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Dr. Raj Patel',
      email: 'raj.patel@specialist.example.com',
      channels: [{ type: 'EMAIL', handle: 'raj.patel@specialist.example.com' }],
      relationshipScore: 45,
      lastTouch: daysAgo(30),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
      tags: ['specialist'],
    },
  });

  const lindaHoffman = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Linda Hoffman',
      email: 'linda.hoffman@insurance.example.com',
      channels: [{ type: 'EMAIL', handle: 'linda.hoffman@insurance.example.com' }],
      relationshipScore: 55,
      lastTouch: daysAgo(14),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['insurance'],
    },
  });

  const tomBaker = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Tom Baker',
      email: 'tom.baker@itconsult.example.com',
      phone: '+15559001006',
      channels: [
        { type: 'EMAIL', handle: 'tom.baker@itconsult.example.com' },
        { type: 'SMS', handle: '+15559001006' },
      ],
      relationshipScore: 70,
      lastTouch: daysAgo(5),
      commitments: [
        { id: 'c3', description: 'Deliver HIPAA compliance audit report', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(14), createdAt: daysAgo(7) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['vendor', 'tech'],
    },
  });

  const mariaSantos = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: 'Maria Santos',
      email: 'maria.santos@advocate.example.com',
      channels: [{ type: 'EMAIL', handle: 'maria.santos@advocate.example.com' }],
      relationshipScore: 65,
      lastTouch: daysAgo(8),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'EMPATHETIC' },
      tags: ['advocate'],
    },
  });

  const drObrien = await prisma.contact.create({
    data: {
      entityId: medlink.id,
      name: "Dr. Kevin O'Brien",
      email: 'kevin.obrien@board.example.com',
      phone: '+15559001008',
      channels: [
        { type: 'EMAIL', handle: 'kevin.obrien@board.example.com' },
        { type: 'SMS', handle: '+15559001008' },
      ],
      relationshipScore: 90,
      lastTouch: daysAgo(1),
      commitments: [
        { id: 'c4', description: 'Board meeting prep materials', direction: 'TO', status: 'OPEN', dueDate: daysFromNow(5), createdAt: daysAgo(3) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
      tags: ['VIP', 'advisor'],
    },
  });

  // --- CRE Forge contacts ---
  const bobbyCastellano = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Robert "Bobby" Castellano',
      email: 'bobby@castellanorealty.example.com',
      phone: '+15559002001',
      channels: [
        { type: 'EMAIL', handle: 'bobby@castellanorealty.example.com' },
        { type: 'SMS', handle: '+15559002001' },
      ],
      relationshipScore: 80,
      lastTouch: daysAgo(1),
      commitments: [
        { id: 'c5', description: 'Send comparable property analysis', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(3), createdAt: daysAgo(2) },
      ],
      preferences: { preferredChannel: 'SMS', preferredTone: 'CASUAL' },
      tags: ['VIP', 'broker'],
    },
  });

  const dianeFoster = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Diane Foster',
      email: 'diane.foster@inspect.example.com',
      channels: [{ type: 'EMAIL', handle: 'diane.foster@inspect.example.com' }],
      relationshipScore: 55,
      lastTouch: daysAgo(20),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['inspector'],
    },
  });

  const michaelTran = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Michael Tran',
      email: 'michael.tran@zoninglaw.example.com',
      phone: '+15559002003',
      channels: [
        { type: 'EMAIL', handle: 'michael.tran@zoninglaw.example.com' },
        { type: 'SMS', handle: '+15559002003' },
      ],
      relationshipScore: 70,
      lastTouch: daysAgo(7),
      commitments: [
        { id: 'c6', description: 'Zoning variance application review', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(10), createdAt: daysAgo(5) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
      tags: ['legal'],
    },
  });

  const jenniferWright = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Jennifer Wright',
      email: 'jennifer.wright@lender.example.com',
      channels: [{ type: 'EMAIL', handle: 'jennifer.wright@lender.example.com' }],
      relationshipScore: 65,
      lastTouch: daysAgo(12),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIPLOMATIC' },
      tags: ['lender'],
    },
  });

  const carlosMendez = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Carlos Mendez',
      email: 'carlos@mendezgc.example.com',
      phone: '+15559002005',
      channels: [
        { type: 'EMAIL', handle: 'carlos@mendezgc.example.com' },
        { type: 'SMS', handle: '+15559002005' },
      ],
      relationshipScore: 75,
      lastTouch: daysAgo(4),
      commitments: [
        { id: 'c7', description: 'Submit renovation bid for downtown project', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(7), createdAt: daysAgo(3) },
      ],
      preferences: { preferredChannel: 'SMS', preferredTone: 'CASUAL' },
      tags: ['contractor'],
    },
  });

  const amyLiu = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Amy Liu',
      email: 'amy.liu@titleco.example.com',
      channels: [{ type: 'EMAIL', handle: 'amy.liu@titleco.example.com' }],
      relationshipScore: 50,
      lastTouch: daysAgo(25),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['title'],
    },
  });

  const davidPark = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'David Park',
      email: 'david.park@envassess.example.com',
      channels: [{ type: 'EMAIL', handle: 'david.park@envassess.example.com' }],
      relationshipScore: 40,
      lastTouch: daysAgo(45),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
      tags: ['environmental'],
    },
  });

  const susanMiller = await prisma.contact.create({
    data: {
      entityId: creForge.id,
      name: 'Susan Miller',
      email: 'susan.miller@propmgmt.example.com',
      phone: '+15559002008',
      channels: [
        { type: 'EMAIL', handle: 'susan.miller@propmgmt.example.com' },
        { type: 'SMS', handle: '+15559002008' },
      ],
      relationshipScore: 85,
      lastTouch: daysAgo(1),
      commitments: [
        { id: 'c8', description: 'Monthly property report', direction: 'FROM', status: 'FULFILLED', createdAt: daysAgo(30) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'DIRECT' },
      tags: ['VIP'],
    },
  });

  // --- Personal contacts ---
  const alexThompson = await prisma.contact.create({
    data: {
      entityId: personal.id,
      name: 'Alex Thompson',
      phone: '+15559003001',
      channels: [{ type: 'SMS', handle: '+15559003001' }],
      relationshipScore: 95,
      lastTouch: daysAgo(1),
      commitments: [],
      preferences: { preferredChannel: 'SMS', preferredTone: 'CASUAL' },
      tags: ['family'],
    },
  });

  const jordanKim = await prisma.contact.create({
    data: {
      entityId: personal.id,
      name: 'Jordan Kim',
      phone: '+15559003002',
      channels: [{ type: 'SMS', handle: '+15559003002' }],
      relationshipScore: 60,
      lastTouch: daysAgo(3),
      commitments: [
        { id: 'c9', description: 'Adjust training plan for marathon', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(5), createdAt: daysAgo(2) },
      ],
      preferences: { preferredChannel: 'SMS', preferredTone: 'CASUAL' },
      tags: ['fitness'],
    },
  });

  const rebeccaHall = await prisma.contact.create({
    data: {
      entityId: personal.id,
      name: 'Rebecca Hall',
      email: 'rebecca.hall@accounting.example.com',
      channels: [{ type: 'EMAIL', handle: 'rebecca.hall@accounting.example.com' }],
      relationshipScore: 70,
      lastTouch: daysAgo(15),
      commitments: [
        { id: 'c10', description: 'Q1 tax estimate review', direction: 'FROM', status: 'OPEN', dueDate: daysFromNow(20), createdAt: daysAgo(10) },
      ],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
      tags: ['finance'],
    },
  });

  const coachDavis = await prisma.contact.create({
    data: {
      entityId: personal.id,
      name: 'Coach Mike Davis',
      email: 'mike.davis@coaching.example.com',
      phone: '+15559003004',
      channels: [
        { type: 'EMAIL', handle: 'mike.davis@coaching.example.com' },
        { type: 'SMS', handle: '+15559003004' },
      ],
      relationshipScore: 55,
      lastTouch: daysAgo(7),
      commitments: [],
      preferences: { preferredChannel: 'EMAIL', preferredTone: 'WARM' },
      tags: ['coaching'],
    },
  });

  const allContacts = [
    drMartinez, jamesWu, nurseOwens, drPatel, lindaHoffman, tomBaker, mariaSantos, drObrien,
    bobbyCastellano, dianeFoster, michaelTran, jenniferWright, carlosMendez, amyLiu, davidPark, susanMiller,
    alexThompson, jordanKim, rebeccaHall, coachDavis,
  ];
  log(`done (${allContacts.length} created)`);

  // =========================================================================
  // PROJECTS
  // =========================================================================
  log('Seeding projects...');

  const projects = await Promise.all([
    // MedLink Pro projects
    prisma.project.create({
      data: {
        name: 'EHR Integration Phase 2',
        entityId: medlink.id,
        description: 'Integrate with Epic and Cerner EHR systems for bi-directional data sync',
        status: 'IN_PROGRESS',
        health: 'YELLOW',
        milestones: [
          { id: 'm1', title: 'API authentication complete', dueDate: daysAgo(5), status: 'DONE' },
          { id: 'm2', title: 'Read-only data sync', dueDate: daysFromNow(10), status: 'IN_PROGRESS' },
          { id: 'm3', title: 'Write-back capability', dueDate: daysFromNow(30), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Telehealth Platform Launch',
        entityId: medlink.id,
        description: 'Build HIPAA-compliant video consultation platform',
        status: 'TODO',
        health: 'GREEN',
        milestones: [
          { id: 'm4', title: 'Vendor selection', dueDate: daysFromNow(14), status: 'IN_PROGRESS' },
          { id: 'm5', title: 'MVP development', dueDate: daysFromNow(60), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'HIPAA Compliance Audit',
        entityId: medlink.id,
        description: 'Annual HIPAA compliance review and gap analysis',
        status: 'IN_PROGRESS',
        health: 'RED',
        milestones: [
          { id: 'm6', title: 'Documentation review', dueDate: daysAgo(3), status: 'DONE' },
          { id: 'm7', title: 'Technical controls audit', dueDate: daysFromNow(5), status: 'IN_PROGRESS' },
          { id: 'm8', title: 'Remediation plan', dueDate: daysFromNow(20), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Patient Portal Redesign',
        entityId: medlink.id,
        description: 'Modernize patient-facing portal with better UX and accessibility',
        status: 'TODO',
        health: 'GREEN',
        milestones: [
          { id: 'm9', title: 'User research complete', dueDate: daysFromNow(21), status: 'TODO' },
          { id: 'm10', title: 'Design mockups approved', dueDate: daysFromNow(45), status: 'TODO' },
        ],
      },
    }),
    // CRE Forge projects
    prisma.project.create({
      data: {
        name: 'Downtown Mixed-Use Development',
        entityId: creForge.id,
        description: 'Acquire and develop 5-story mixed-use building at 400 Main St',
        status: 'IN_PROGRESS',
        health: 'YELLOW',
        milestones: [
          { id: 'm11', title: 'Due diligence complete', dueDate: daysAgo(10), status: 'DONE' },
          { id: 'm12', title: 'Financing secured', dueDate: daysFromNow(15), status: 'IN_PROGRESS' },
          { id: 'm13', title: 'Construction start', dueDate: daysFromNow(60), status: 'TODO' },
          { id: 'm14', title: 'Certificate of occupancy', dueDate: daysFromNow(365), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Industrial Park Acquisition',
        entityId: creForge.id,
        description: 'Evaluate and acquire 20-acre industrial park for portfolio',
        status: 'TODO',
        health: 'GREEN',
        milestones: [
          { id: 'm15', title: 'Market analysis', dueDate: daysFromNow(14), status: 'TODO' },
          { id: 'm16', title: 'LOI submitted', dueDate: daysFromNow(30), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Property Management SaaS MVP',
        entityId: creForge.id,
        description: 'Internal tool for tracking property performance and tenant management',
        status: 'IN_PROGRESS',
        health: 'GREEN',
        milestones: [
          { id: 'm17', title: 'Core dashboard built', dueDate: daysAgo(7), status: 'DONE' },
          { id: 'm18', title: 'Tenant portal', dueDate: daysFromNow(21), status: 'IN_PROGRESS' },
          { id: 'm19', title: 'Financial reporting', dueDate: daysFromNow(45), status: 'TODO' },
        ],
      },
    }),
    // Personal projects
    prisma.project.create({
      data: {
        name: 'Home Renovation',
        entityId: personal.id,
        description: 'Kitchen and master bath renovation',
        status: 'IN_PROGRESS',
        health: 'YELLOW',
        milestones: [
          { id: 'm20', title: 'Design finalized', dueDate: daysAgo(14), status: 'DONE' },
          { id: 'm21', title: 'Kitchen demo complete', dueDate: daysFromNow(7), status: 'IN_PROGRESS' },
          { id: 'm22', title: 'Final walkthrough', dueDate: daysFromNow(90), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Investment Portfolio Review',
        entityId: personal.id,
        description: 'Annual review and rebalancing of investment portfolio',
        status: 'TODO',
        health: 'GREEN',
        milestones: [
          { id: 'm23', title: 'Gather statements', dueDate: daysFromNow(7), status: 'TODO' },
          { id: 'm24', title: 'Meet with advisor', dueDate: daysFromNow(21), status: 'TODO' },
        ],
      },
    }),
    prisma.project.create({
      data: {
        name: 'Marathon Training Plan',
        entityId: personal.id,
        description: 'Train for Chicago Marathon in October',
        status: 'IN_PROGRESS',
        health: 'GREEN',
        milestones: [
          { id: 'm25', title: 'Base building phase', dueDate: daysAgo(30), status: 'DONE' },
          { id: 'm26', title: 'Peak mileage week', dueDate: daysFromNow(60), status: 'TODO' },
          { id: 'm27', title: 'Taper', dueDate: daysFromNow(80), status: 'TODO' },
        ],
      },
    }),
  ]);

  log(`done (${projects.length} created)`);

  // =========================================================================
  // TASKS  (50+)
  // =========================================================================
  log('Seeding tasks...');

  const taskData: Array<{
    title: string;
    description?: string;
    entityId: string;
    projectId?: string;
    priority: string;
    status: string;
    dueDate?: Date;
    dependencies?: string[];
    assigneeId?: string;
    tags?: string[];
  }> = [
    // --- MedLink Pro tasks ---
    { title: 'Configure Epic FHIR API credentials', entityId: medlink.id, projectId: projects[0].id, priority: 'P0', status: 'DONE', dueDate: daysAgo(7), assigneeId: marcus.id, tags: ['integration'] },
    { title: 'Implement patient data read endpoint', entityId: medlink.id, projectId: projects[0].id, priority: 'P0', status: 'IN_PROGRESS', dueDate: daysFromNow(5), assigneeId: marcus.id, tags: ['integration', 'api'] },
    { title: 'Build Cerner OAuth2 flow', entityId: medlink.id, projectId: projects[0].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(15), tags: ['integration', 'auth'] },
    { title: 'Write EHR data mapping tests', entityId: medlink.id, projectId: projects[0].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(12), tags: ['testing'] },
    { title: 'Design write-back conflict resolution', entityId: medlink.id, projectId: projects[0].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(25), tags: ['architecture'] },
    { title: 'Research telehealth video SDK vendors', entityId: medlink.id, projectId: projects[1].id, priority: 'P1', status: 'IN_PROGRESS', dueDate: daysFromNow(7), assigneeId: marcus.id, tags: ['research'] },
    { title: 'Draft telehealth HIPAA data flow diagram', entityId: medlink.id, projectId: projects[1].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(14), tags: ['compliance'] },
    { title: 'Collect BAA from video platform vendor', entityId: medlink.id, projectId: projects[1].id, priority: 'P0', status: 'BLOCKED', dueDate: daysFromNow(10), tags: ['compliance', 'legal'] },
    { title: 'Review access control logs', entityId: medlink.id, projectId: projects[2].id, priority: 'P0', status: 'IN_PROGRESS', dueDate: daysFromNow(3), assigneeId: marcus.id, tags: ['audit'] },
    { title: 'Update encryption-at-rest documentation', entityId: medlink.id, projectId: projects[2].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(8), tags: ['audit', 'docs'] },
    { title: 'Schedule penetration test', entityId: medlink.id, projectId: projects[2].id, priority: 'P0', status: 'DONE', dueDate: daysAgo(2), tags: ['security'] },
    { title: 'Remediate SQL injection finding', entityId: medlink.id, projectId: projects[2].id, priority: 'P0', status: 'IN_PROGRESS', dueDate: daysFromNow(2), assigneeId: marcus.id, tags: ['security', 'urgent'] },
    { title: 'Conduct patient portal user interviews', entityId: medlink.id, projectId: projects[3].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(21), tags: ['research', 'ux'] },
    { title: 'Audit current portal accessibility (WCAG)', entityId: medlink.id, projectId: projects[3].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(14), tags: ['accessibility'] },
    { title: 'Follow up with Dr. Martinez on EHR specs', entityId: medlink.id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(2), assigneeId: marcus.id, tags: ['communication'] },
    { title: 'Renew HIPAA training certificates', entityId: medlink.id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(30), tags: ['compliance'] },
    { title: 'Update insurance billing codes for Q1', entityId: medlink.id, priority: 'P1', status: 'DONE', dueDate: daysAgo(10), tags: ['billing'] },
    { title: 'Order new medical device samples from James', entityId: medlink.id, priority: 'P2', status: 'CANCELLED', tags: ['procurement'] },

    // --- CRE Forge tasks ---
    { title: 'Review Phase 1 environmental report', entityId: creForge.id, projectId: projects[4].id, priority: 'P0', status: 'DONE', dueDate: daysAgo(15), tags: ['due-diligence'] },
    { title: 'Submit zoning variance application', entityId: creForge.id, projectId: projects[4].id, priority: 'P0', status: 'IN_PROGRESS', dueDate: daysFromNow(5), assigneeId: marcus.id, tags: ['legal', 'zoning'] },
    { title: 'Negotiate construction loan terms', entityId: creForge.id, projectId: projects[4].id, priority: 'P0', status: 'BLOCKED', dueDate: daysFromNow(10), tags: ['financing'] },
    { title: 'Get contractor bids for renovation', entityId: creForge.id, projectId: projects[4].id, priority: 'P1', status: 'IN_PROGRESS', dueDate: daysFromNow(7), tags: ['construction'] },
    { title: 'Commission property appraisal', entityId: creForge.id, projectId: projects[4].id, priority: 'P1', status: 'DONE', dueDate: daysAgo(5), tags: ['valuation'] },
    { title: 'Draft tenant improvement allowances', entityId: creForge.id, projectId: projects[4].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(30), tags: ['leasing'] },
    { title: 'Analyze industrial park cap rates', entityId: creForge.id, projectId: projects[5].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(10), tags: ['analysis'] },
    { title: 'Tour industrial park properties', entityId: creForge.id, projectId: projects[5].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(14), tags: ['site-visit'] },
    { title: 'Build tenant dashboard module', entityId: creForge.id, projectId: projects[6].id, priority: 'P0', status: 'IN_PROGRESS', dueDate: daysFromNow(14), assigneeId: marcus.id, tags: ['development'] },
    { title: 'Integrate QuickBooks for financial reports', entityId: creForge.id, projectId: projects[6].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(30), tags: ['integration'] },
    { title: 'Deploy SaaS MVP to staging', entityId: creForge.id, projectId: projects[6].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(21), tags: ['deployment'] },
    { title: 'Call Bobby about downtown comparables', entityId: creForge.id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(1), assigneeId: marcus.id, tags: ['communication'] },
    { title: 'Review Susan Miller quarterly report', entityId: creForge.id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(5), tags: ['review'] },
    { title: 'File property tax appeal for Unit 12B', entityId: creForge.id, priority: 'P1', status: 'IN_PROGRESS', dueDate: daysFromNow(10), tags: ['tax'] },
    { title: 'Renew property insurance policies', entityId: creForge.id, priority: 'P0', status: 'TODO', dueDate: daysFromNow(15), tags: ['insurance'] },
    { title: 'Schedule HVAC inspection for Building A', entityId: creForge.id, priority: 'P2', status: 'DONE', dueDate: daysAgo(3), tags: ['maintenance'] },
    { title: 'Update CRM with new broker contacts', entityId: creForge.id, priority: 'P2', status: 'CANCELLED', tags: ['admin'] },

    // --- Personal tasks ---
    { title: 'Select kitchen countertop material', entityId: personal.id, projectId: projects[7].id, priority: 'P1', status: 'IN_PROGRESS', dueDate: daysFromNow(3), tags: ['renovation'] },
    { title: 'Schedule plumber for bathroom rough-in', entityId: personal.id, projectId: projects[7].id, priority: 'P0', status: 'TODO', dueDate: daysFromNow(5), tags: ['renovation'] },
    { title: 'Approve cabinet design drawings', entityId: personal.id, projectId: projects[7].id, priority: 'P1', status: 'DONE', dueDate: daysAgo(7), tags: ['renovation'] },
    { title: 'Gather brokerage account statements', entityId: personal.id, projectId: projects[8].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(7), tags: ['finance'] },
    { title: 'Research Roth conversion strategy', entityId: personal.id, projectId: projects[8].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(14), tags: ['finance', 'research'] },
    { title: 'Complete 18-mile training run', entityId: personal.id, projectId: projects[9].id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(3), tags: ['fitness'] },
    { title: 'Buy new running shoes', entityId: personal.id, projectId: projects[9].id, priority: 'P2', status: 'DONE', dueDate: daysAgo(5), tags: ['fitness', 'shopping'] },
    { title: 'Schedule sports massage', entityId: personal.id, projectId: projects[9].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(7), tags: ['fitness', 'recovery'] },
    { title: 'Call Alex about family reunion planning', entityId: personal.id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(5), tags: ['family'] },
    { title: 'Pay quarterly estimated taxes', entityId: personal.id, priority: 'P0', status: 'TODO', dueDate: daysFromNow(15), tags: ['finance', 'tax'] },
    { title: 'Book dentist appointment', entityId: personal.id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(30), tags: ['health'] },
    { title: 'Organize digital photo library', entityId: personal.id, priority: 'P2', status: 'CANCELLED', tags: ['admin'] },
    { title: 'Review home insurance renewal', entityId: personal.id, priority: 'P1', status: 'TODO', dueDate: daysFromNow(20), tags: ['insurance'] },
    { title: 'Update emergency contact list', entityId: personal.id, priority: 'P2', status: 'DONE', dueDate: daysAgo(2), tags: ['admin'] },
    { title: 'Clean out garage for renovation staging', entityId: personal.id, projectId: projects[7].id, priority: 'P1', status: 'DONE', dueDate: daysAgo(14), tags: ['renovation'] },
    { title: 'Meal prep for training week', entityId: personal.id, projectId: projects[9].id, priority: 'P2', status: 'TODO', dueDate: daysFromNow(1), tags: ['fitness', 'nutrition'] },
  ];

  // Create tasks with dependency wiring (some tasks depend on others)
  const createdTasks = [];
  for (const t of taskData) {
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        entityId: t.entityId,
        projectId: t.projectId,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        dependencies: t.dependencies ?? [],
        assigneeId: t.assigneeId,
        tags: t.tags ?? [],
      },
    });
    createdTasks.push(task);
  }

  // Wire up some dependencies (task 2 depends on task 1, task 5 depends on task 2, etc.)
  await prisma.task.update({ where: { id: createdTasks[1].id }, data: { dependencies: [createdTasks[0].id] } });
  await prisma.task.update({ where: { id: createdTasks[4].id }, data: { dependencies: [createdTasks[1].id] } });
  await prisma.task.update({ where: { id: createdTasks[20].id }, data: { dependencies: [createdTasks[19].id] } });

  log(`done (${createdTasks.length} created)`);

  // =========================================================================
  // MESSAGES (30+)
  // =========================================================================
  log('Seeding messages...');

  const thread1 = 'thread-ehr-integration';
  const thread2 = 'thread-downtown-deal';
  const thread3 = 'thread-hipaa-audit';

  const messagesData = [
    // Thread 1: EHR Integration (MedLink)
    { channel: 'EMAIL', senderId: drMartinez.id, recipientId: marcus.id, entityId: medlink.id, threadId: thread1, subject: 'EHR Integration Specs - Review Required', body: 'Marcus, attached are the updated EHR integration specifications. Please review the FHIR resource mappings by Friday. The patient demographics section needs special attention for HIPAA compliance.', triageScore: 8, intent: 'REQUEST', sensitivity: 'CONFIDENTIAL' },
    { channel: 'EMAIL', senderId: drMartinez.id, recipientId: marcus.id, entityId: medlink.id, threadId: thread1, subject: 'Re: EHR Integration Specs - Review Required', body: 'Follow-up: Also need to discuss the lab results data flow. Can we schedule a 30-minute call this week?', triageScore: 7, intent: 'REQUEST', sensitivity: 'CONFIDENTIAL' },
    { channel: 'SLACK', senderId: tomBaker.id, recipientId: marcus.id, entityId: medlink.id, threadId: thread1, body: 'Hey Marcus, the FHIR sandbox is ready for testing. Credentials in the shared vault. Let me know if you hit any auth issues.', triageScore: 6, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: jamesWu.id, recipientId: marcus.id, entityId: medlink.id, subject: 'New Medical Device Catalog - Q1 2026', body: 'Please find attached our updated medical device catalog with pricing for Q1 2026. Happy to schedule a demo for any items of interest.', triageScore: 3, intent: 'FYI', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: nurseOwens.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Patient Portal Feedback from Staff', body: 'Our clinical staff has collected feedback on the current patient portal. Main issues: slow load times, confusing medication refill flow, and lack of Spanish language support. Detailed notes attached.', triageScore: 6, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: drObrien.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Board Meeting Agenda - Next Thursday', body: 'Marcus, please prepare a 10-minute update on the EHR integration project and HIPAA audit status for the board meeting. I will need the slides by Tuesday EOD.', triageScore: 9, intent: 'REQUEST', sensitivity: 'CONFIDENTIAL' },
    { channel: 'SMS', senderId: drObrien.id, recipientId: marcus.id, entityId: medlink.id, body: 'Quick heads up - the board chair wants to discuss the telehealth platform budget at the meeting too. Can you add a slide?', triageScore: 8, intent: 'URGENT', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: lindaHoffman.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Insurance Billing Code Updates', body: 'Updated billing codes for the new telehealth services have been approved. Please update your systems before March 1st.', triageScore: 5, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: drPatel.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Specialist Referral Integration', body: 'Would it be possible to add a referral workflow in the EHR integration? Our office receives about 50 referrals per week and manual processing is becoming unsustainable.', triageScore: 4, intent: 'INQUIRY', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: mariaSantos.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Patient Accessibility Concerns', body: 'Several patients have reported difficulty navigating the appointment scheduling system. I have compiled a list of specific accessibility issues we should address.', triageScore: 5, intent: 'UPDATE', sensitivity: 'INTERNAL' },

    // Thread 2: Downtown Deal (CRE Forge)
    { channel: 'EMAIL', senderId: bobbyCastellano.id, recipientId: marcus.id, entityId: creForge.id, threadId: thread2, subject: 'Downtown 400 Main St - Comparable Analysis', body: 'Marcus, I pulled comps for the downtown mixed-use. Three recent sales in the area: 350 Main ($4.2M), 425 Commerce ($3.8M), 500 Market ($5.1M). Cap rates ranging 6.2-7.1%. Let me know when you want to discuss.', triageScore: 8, intent: 'UPDATE', sensitivity: 'CONFIDENTIAL' },
    { channel: 'SMS', senderId: bobbyCastellano.id, recipientId: marcus.id, entityId: creForge.id, threadId: thread2, body: 'Just heard another buyer is sniffing around 400 Main. We should move fast on the LOI.', triageScore: 9, intent: 'URGENT', sensitivity: 'CONFIDENTIAL' },
    { channel: 'EMAIL', senderId: michaelTran.id, recipientId: marcus.id, entityId: creForge.id, threadId: thread2, subject: 'Zoning Variance - 400 Main St', body: 'Marcus, the zoning variance application is ready for review. The hearing is scheduled for March 15th. We need to submit by March 1st. Please review the attached documents and let me know of any changes.', triageScore: 7, intent: 'REQUEST', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: jenniferWright.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Construction Loan Pre-Approval', body: 'Good news - your construction loan has been pre-approved for $3.5M at 7.25% variable. Final terms pending the appraisal and environmental clearance. Full term sheet attached.', triageScore: 8, intent: 'UPDATE', sensitivity: 'CONFIDENTIAL' },
    { channel: 'EMAIL', senderId: carlosMendez.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Renovation Bid - 400 Main St', body: 'Attached is our detailed bid for the renovation work at 400 Main. Total estimate: $1.2M with a 6-month timeline. Includes all structural, mechanical, and finish work. Happy to walk through the numbers.', triageScore: 7, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: dianeFoster.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Inspection Report - 400 Main St', body: 'Property inspection complete. Overall condition: Good. Minor issues: roof flashing needs repair (est. $15K), HVAC system has 3-5 years remaining life. Full report attached.', triageScore: 6, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: davidPark.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Phase I ESA Results', body: 'Phase I Environmental Site Assessment is complete for 400 Main St. No recognized environmental conditions (RECs) identified. The property has a clean environmental history. Full report attached.', triageScore: 5, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: susanMiller.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Monthly Property Performance Report', body: 'Attached is the monthly property performance report. Portfolio occupancy: 94%. Three lease renewals pending. One maintenance escalation at Building C (water heater replacement needed).', triageScore: 6, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'SMS', senderId: susanMiller.id, recipientId: marcus.id, entityId: creForge.id, body: 'Tenant at Unit 5B is requesting early lease termination. Should I schedule a meeting to discuss?', triageScore: 7, intent: 'REQUEST', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: amyLiu.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Title Search Update', body: 'Title search for 400 Main St is progressing. Found one minor easement for utility access on the north side. Should not impact development plans. Expect final title commitment by end of week.', triageScore: 4, intent: 'UPDATE', sensitivity: 'INTERNAL' },

    // Thread 3: HIPAA audit
    { channel: 'SLACK', senderId: tomBaker.id, recipientId: marcus.id, entityId: medlink.id, threadId: thread3, body: 'HIPAA audit finding: three user accounts with admin privileges have not rotated passwords in 90+ days. Flagging as high priority.', triageScore: 9, intent: 'URGENT', sensitivity: 'RESTRICTED' },
    { channel: 'SLACK', senderId: tomBaker.id, recipientId: marcus.id, entityId: medlink.id, threadId: thread3, body: 'Also found: audit logging is not capturing failed login attempts. Need to update the logging configuration.', triageScore: 7, intent: 'UPDATE', sensitivity: 'RESTRICTED' },

    // Personal messages
    { channel: 'SMS', senderId: alexThompson.id, recipientId: marcus.id, entityId: personal.id, body: 'Hey bro! Are we still on for dinner this Saturday? Mom wants to know if you are bringing dessert.', triageScore: 3, intent: 'INQUIRY', sensitivity: 'INTERNAL' },
    { channel: 'SMS', senderId: jordanKim.id, recipientId: marcus.id, entityId: personal.id, body: 'Great run today! I adjusted your training plan - adding hill repeats on Tuesdays. Check the app for the updated schedule.', triageScore: 2, intent: 'UPDATE', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: rebeccaHall.id, recipientId: marcus.id, entityId: personal.id, subject: 'Q1 Estimated Tax Payment Reminder', body: 'Marcus, your Q1 estimated tax payment of $12,500 is due April 15th. I recommend we also discuss the Roth conversion strategy at our next meeting. Available next week?', triageScore: 6, intent: 'REQUEST', sensitivity: 'CONFIDENTIAL' },
    { channel: 'EMAIL', senderId: coachDavis.id, recipientId: marcus.id, entityId: personal.id, subject: 'Monthly Check-In', body: 'Marcus, it is time for our monthly check-in. I would like to discuss your progress on the work-life balance goals we set last month. How about Thursday at 4pm?', triageScore: 3, intent: 'REQUEST', sensitivity: 'INTERNAL' },
    { channel: 'SMS', senderId: alexThompson.id, recipientId: marcus.id, entityId: personal.id, body: 'Also, can you help me pick a gift for Mom birthday? She turns 65 next month.', triageScore: 2, intent: 'INQUIRY', sensitivity: 'INTERNAL' },
    { channel: 'EMAIL', senderId: drObrien.id, recipientId: marcus.id, entityId: medlink.id, subject: 'Confidential: Strategic Partnership Discussion', body: 'Marcus, I had an initial conversation with HealthTech Innovations about a potential partnership for the telehealth platform. Very early stage but promising. Let us discuss offline.', triageScore: 9, intent: 'FYI', sensitivity: 'RESTRICTED' },
    { channel: 'EMAIL', senderId: bobbyCastellano.id, recipientId: marcus.id, entityId: creForge.id, subject: 'Off-Market Industrial Property Lead', body: 'Got a lead on a 15-acre industrial property near the expressway. Owner looking for a quick close. Could be a good add to the portfolio. Want me to set up a tour?', triageScore: 7, intent: 'INQUIRY', sensitivity: 'CONFIDENTIAL' },
    { channel: 'SLACK', senderId: nurseOwens.id, recipientId: marcus.id, entityId: medlink.id, body: 'Quick question - when is the patient portal scheduled for the redesign? Getting a lot of questions from patients about the medication refill issue.', triageScore: 5, intent: 'INQUIRY', sensitivity: 'INTERNAL' },
  ];

  const createdMessages = [];
  for (const m of messagesData) {
    const msg = await prisma.message.create({ data: m });
    createdMessages.push(msg);
  }

  log(`done (${createdMessages.length} created)`);

  // =========================================================================
  // CALLS (10+)
  // =========================================================================
  log('Seeding calls...');

  const callsData = [
    {
      entityId: medlink.id, contactId: drMartinez.id, direction: 'OUTBOUND', personaId: 'medlink-professional', outcome: 'CONNECTED', duration: 1200, sentiment: 0.8,
      transcript: 'Call with Dr. Martinez regarding EHR integration specs. Discussed FHIR resource mappings and patient demographic data flows. Agreed on bi-weekly sync meetings.',
      actionItems: ['Schedule bi-weekly EHR sync', 'Send updated FHIR mapping document', 'Review lab results data flow by Friday'],
    },
    {
      entityId: medlink.id, contactId: drObrien.id, direction: 'INBOUND', outcome: 'CONNECTED', duration: 900, sentiment: 0.6,
      transcript: 'Dr. O\'Brien called about board meeting preparation. Needs slides by Tuesday. Also wants budget projections for telehealth platform.',
      actionItems: ['Prepare board presentation slides', 'Add telehealth budget slide', 'Send draft by Monday for review'],
    },
    {
      entityId: medlink.id, contactId: tomBaker.id, direction: 'OUTBOUND', outcome: 'CONNECTED', duration: 1800, sentiment: 0.5,
      transcript: 'HIPAA audit status call with Tom Baker. Discussed three critical findings: password rotation, audit logging gaps, and admin account review. Remediation plan needed within 2 weeks.',
      actionItems: ['Force password rotation for flagged accounts', 'Update logging configuration', 'Review admin access permissions'],
    },
    {
      entityId: creForge.id, contactId: bobbyCastellano.id, direction: 'OUTBOUND', outcome: 'CONNECTED', duration: 600, sentiment: 0.9,
      transcript: 'Quick call with Bobby about 400 Main St comparable analysis. Market is competitive but pricing is in range. Need to expedite LOI.',
      actionItems: ['Review comparable analysis spreadsheet', 'Draft LOI by end of week'],
    },
    {
      entityId: creForge.id, contactId: michaelTran.id, direction: 'INBOUND', outcome: 'CONNECTED', duration: 1500, sentiment: 0.7,
      transcript: 'Michael called about zoning variance application. Everything looks good but need to address parking requirement concern. Hearing scheduled March 15th.',
      actionItems: ['Review parking study', 'Submit variance application by March 1st'],
    },
    {
      entityId: creForge.id, contactId: carlosMendez.id, direction: 'OUTBOUND', outcome: 'VOICEMAIL', duration: 60, sentiment: null,
      transcript: null,
      actionItems: ['Call back Carlos about renovation bid clarification'],
    },
    {
      entityId: creForge.id, contactId: susanMiller.id, direction: 'INBOUND', outcome: 'CONNECTED', duration: 720, sentiment: 0.7,
      transcript: 'Susan called about Unit 5B early termination request and Building C water heater issue. Discussed options for tenant retention.',
      actionItems: ['Review Unit 5B lease terms', 'Get water heater replacement quotes', 'Schedule tenant meeting'],
    },
    {
      entityId: personal.id, contactId: alexThompson.id, direction: 'OUTBOUND', outcome: 'CONNECTED', duration: 480, sentiment: 0.95,
      transcript: 'Caught up with Alex about family dinner Saturday. Discussed Mom birthday gift ideas. Will bring dessert.',
      actionItems: ['Buy dessert for Saturday dinner', 'Research gift ideas for Mom'],
    },
    {
      entityId: personal.id, contactId: rebeccaHall.id, direction: 'INBOUND', outcome: 'CONNECTED', duration: 900, sentiment: 0.6,
      transcript: 'Rebecca called about Q1 tax estimate and Roth conversion discussion. Recommends converting $50K this year while income is lower.',
      actionItems: ['Make Q1 estimated tax payment', 'Review Roth conversion numbers', 'Schedule follow-up meeting next week'],
    },
    {
      entityId: medlink.id, contactId: drPatel.id, direction: 'OUTBOUND', outcome: 'NO_ANSWER', duration: 30, sentiment: null,
      transcript: null,
      actionItems: ['Try calling Dr. Patel again tomorrow'],
    },
    {
      entityId: creForge.id, contactId: jenniferWright.id, direction: 'INBOUND', outcome: 'CONNECTED', duration: 1100, sentiment: 0.75,
      transcript: 'Jennifer called with construction loan details. Pre-approved at $3.5M, 7.25% variable. Need to provide final appraisal and environmental clearance for firm commitment.',
      actionItems: ['Collect final appraisal report', 'Send Phase I ESA to lender', 'Review term sheet with attorney'],
    },
  ];

  const createdCalls = [];
  for (const c of callsData) {
    const call = await prisma.call.create({ data: c });
    createdCalls.push(call);
  }

  log(`done (${createdCalls.length} created)`);

  // =========================================================================
  // WORKFLOWS (5+)
  // =========================================================================
  log('Seeding workflows...');

  const workflowsData = [
    {
      name: 'Morning Briefing Generator',
      entityId: medlink.id,
      triggers: [{ type: 'TIME', config: { cron: '0 6 * * 1-5', timezone: 'America/Chicago' } }],
      steps: [
        { id: 'w1s1', type: 'ACTION', config: { action: 'gather_overnight_messages', priority_threshold: 5 }, nextStepId: 'w1s2' },
        { id: 'w1s2', type: 'ACTION', config: { action: 'compile_calendar_summary' }, nextStepId: 'w1s3' },
        { id: 'w1s3', type: 'AI_DECISION', config: { action: 'prioritize_items', model: 'gpt-4' }, nextStepId: 'w1s4' },
        { id: 'w1s4', type: 'ACTION', config: { action: 'send_briefing', channel: 'EMAIL' } },
      ],
      status: 'ACTIVE',
      lastRun: daysAgo(1),
      successRate: 0.95,
    },
    {
      name: 'Urgent Message Escalation',
      entityId: medlink.id,
      triggers: [{ type: 'EVENT', config: { event: 'message.received', condition: { triageScore: { gte: 8 } } } }],
      steps: [
        { id: 'w2s1', type: 'CONDITION', config: { check: 'is_focus_hours' }, nextStepId: 'w2s2', errorStepId: 'w2s3' },
        { id: 'w2s2', type: 'DELAY', config: { duration: '30m', reason: 'focus_hours_protection' }, nextStepId: 'w2s3' },
        { id: 'w2s3', type: 'ACTION', config: { action: 'send_push_notification' }, nextStepId: 'w2s4' },
        { id: 'w2s4', type: 'HUMAN_APPROVAL', config: { timeout: '15m', escalate_on_timeout: true } },
      ],
      status: 'ACTIVE',
      lastRun: daysAgo(0),
      successRate: 0.88,
    },
    {
      name: 'Weekly Entity Health Report',
      entityId: creForge.id,
      triggers: [{ type: 'TIME', config: { cron: '0 9 * * 1', timezone: 'America/Chicago' } }],
      steps: [
        { id: 'w3s1', type: 'ACTION', config: { action: 'aggregate_entity_metrics' }, nextStepId: 'w3s2' },
        { id: 'w3s2', type: 'AI_DECISION', config: { action: 'analyze_trends', lookback_weeks: 4 }, nextStepId: 'w3s3' },
        { id: 'w3s3', type: 'ACTION', config: { action: 'generate_report', format: 'pdf' }, nextStepId: 'w3s4' },
        { id: 'w3s4', type: 'ACTION', config: { action: 'send_email', recipients: ['marcus@example.com'] } },
      ],
      status: 'ACTIVE',
      lastRun: daysAgo(5),
      successRate: 1.0,
    },
    {
      name: 'New Contact Onboarding',
      entityId: medlink.id,
      triggers: [{ type: 'EVENT', config: { event: 'contact.created' } }],
      steps: [
        { id: 'w4s1', type: 'ACTION', config: { action: 'enrich_contact_data', sources: ['linkedin', 'clearbit'] }, nextStepId: 'w4s2' },
        { id: 'w4s2', type: 'AI_DECISION', config: { action: 'classify_contact_type' }, nextStepId: 'w4s3' },
        { id: 'w4s3', type: 'HUMAN_APPROVAL', config: { action: 'review_classification', timeout: '24h' } },
      ],
      status: 'DRAFT',
      successRate: 0,
    },
    {
      name: 'Invoice Payment Reminder',
      entityId: creForge.id,
      triggers: [{ type: 'CONDITION', config: { condition: 'invoice.dueDate <= now() + 3d AND invoice.status == PENDING' } }],
      steps: [
        { id: 'w5s1', type: 'ACTION', config: { action: 'check_payment_status' }, nextStepId: 'w5s2' },
        { id: 'w5s2', type: 'CONDITION', config: { check: 'is_still_unpaid' }, nextStepId: 'w5s3' },
        { id: 'w5s3', type: 'ACTION', config: { action: 'send_reminder_email', template: 'payment_reminder' }, nextStepId: 'w5s4' },
        { id: 'w5s4', type: 'DELAY', config: { duration: '3d' }, nextStepId: 'w5s5' },
        { id: 'w5s5', type: 'HUMAN_APPROVAL', config: { action: 'escalate_to_collections' } },
      ],
      status: 'ACTIVE',
      lastRun: daysAgo(2),
      successRate: 0.92,
    },
    {
      name: 'Compliance Document Review',
      entityId: medlink.id,
      triggers: [{ type: 'TIME', config: { cron: '0 8 1 * *', timezone: 'America/Chicago' } }],
      steps: [
        { id: 'w6s1', type: 'ACTION', config: { action: 'scan_expiring_documents', days_ahead: 30 }, nextStepId: 'w6s2' },
        { id: 'w6s2', type: 'ACTION', config: { action: 'create_renewal_tasks' } },
      ],
      status: 'ACTIVE',
      lastRun: daysAgo(14),
      successRate: 1.0,
    },
  ];

  const createdWorkflows = [];
  for (const w of workflowsData) {
    const wf = await prisma.workflow.create({ data: w });
    createdWorkflows.push(wf);
  }

  log(`done (${createdWorkflows.length} created)`);

  // =========================================================================
  // FINANCIAL RECORDS (15+)
  // =========================================================================
  log('Seeding financial records...');

  const financialData = [
    // MedLink Pro
    { entityId: medlink.id, type: 'INVOICE', amount: 45000, status: 'PENDING', dueDate: daysFromNow(15), category: 'Consulting', vendor: 'Epic Systems', description: 'EHR integration consulting - Phase 2' },
    { entityId: medlink.id, type: 'EXPENSE', amount: 2500, status: 'PAID', category: 'Software', vendor: 'FHIR Sandbox', description: 'Annual FHIR testing environment license' },
    { entityId: medlink.id, type: 'BILL', amount: 8500, status: 'PENDING', dueDate: daysFromNow(7), category: 'IT Services', vendor: 'Tom Baker IT Consulting', description: 'HIPAA compliance audit - February' },
    { entityId: medlink.id, type: 'EXPENSE', amount: 1200, status: 'PAID', category: 'Training', description: 'HIPAA training renewal - 5 staff members' },
    { entityId: medlink.id, type: 'INVOICE', amount: 15000, status: 'OVERDUE', dueDate: daysAgo(10), category: 'Hardware', vendor: 'James Wu Medical Devices', description: 'Medical device order - October batch' },

    // CRE Forge
    { entityId: creForge.id, type: 'EXPENSE', amount: 3500, status: 'PAID', category: 'Legal', vendor: 'Tran & Associates', description: 'Zoning variance application preparation' },
    { entityId: creForge.id, type: 'BILL', amount: 12000, status: 'PENDING', dueDate: daysFromNow(10), category: 'Inspection', vendor: 'Foster Property Inspections', description: 'Property inspection - 400 Main St' },
    { entityId: creForge.id, type: 'EXPENSE', amount: 4800, status: 'PAID', category: 'Environmental', vendor: 'Park Environmental Services', description: 'Phase I ESA - 400 Main St' },
    { entityId: creForge.id, type: 'INVOICE', amount: 1200000, status: 'PENDING', dueDate: daysFromNow(30), category: 'Construction', vendor: 'Mendez General Contracting', description: 'Renovation bid - 400 Main St (deposit)' },
    { entityId: creForge.id, type: 'PAYMENT', amount: 25000, status: 'PAID', category: 'Property Management', vendor: 'Miller Property Management', description: 'Monthly management fee - February' },
    { entityId: creForge.id, type: 'BILL', amount: 7500, status: 'OVERDUE', dueDate: daysAgo(5), category: 'Insurance', description: 'Property insurance premium - Q1' },
    { entityId: creForge.id, type: 'EXPENSE', amount: 950, status: 'PAID', category: 'Appraisal', vendor: 'Metro Appraisal Group', description: 'Property appraisal - 400 Main St' },

    // Personal
    { entityId: personal.id, type: 'BILL', amount: 12500, status: 'PENDING', dueDate: daysFromNow(15), category: 'Tax', description: 'Q1 estimated tax payment' },
    { entityId: personal.id, type: 'EXPENSE', amount: 35000, status: 'PAID', category: 'Home Renovation', vendor: 'Kitchen Design Co', description: 'Kitchen renovation deposit' },
    { entityId: personal.id, type: 'EXPENSE', amount: 280, status: 'PAID', category: 'Fitness', vendor: 'Running Warehouse', description: 'New running shoes - marathon training' },
    { entityId: personal.id, type: 'BILL', amount: 1800, status: 'PENDING', dueDate: daysFromNow(20), category: 'Insurance', description: 'Home insurance annual premium' },
  ];

  const createdFinancials = [];
  for (const f of financialData) {
    const fr = await prisma.financialRecord.create({ data: f });
    createdFinancials.push(fr);
  }

  log(`done (${createdFinancials.length} created)`);

  // =========================================================================
  // RULES (8+)
  // =========================================================================
  log('Seeding rules...');

  const rulesData = [
    {
      name: 'Auto-escalate P0 tasks',
      scope: 'GLOBAL',
      condition: { field: 'priority', operator: 'eq', value: 'P0', model: 'task' },
      action: { type: 'notify', channel: 'push', urgency: 'high', message: 'P0 task requires immediate attention' },
      precedence: 100,
      createdBy: 'HUMAN',
      isActive: true,
    },
    {
      name: 'HIPAA message screening',
      scope: 'ENTITY',
      entityId: medlink.id,
      condition: { field: 'sensitivity', operator: 'in', value: ['RESTRICTED', 'REGULATED'], model: 'message' },
      action: { type: 'flag_review', reviewer: 'compliance_officer', block_send: true },
      precedence: 200,
      createdBy: 'HUMAN',
      isActive: true,
    },
    {
      name: 'After-hours call routing',
      scope: 'ENTITY',
      entityId: creForge.id,
      condition: { field: 'time', operator: 'outside', value: { start: '08:00', end: '18:00' }, model: 'call' },
      action: { type: 'route', destination: 'voicemail', notification: 'sms', delay: '30m' },
      precedence: 50,
      createdBy: 'HUMAN',
      isActive: true,
    },
    {
      name: 'VIP contact priority boost',
      scope: 'GLOBAL',
      condition: { field: 'tags', operator: 'contains', value: 'VIP', model: 'contact' },
      action: { type: 'boost_priority', amount: 2, apply_to: ['messages', 'tasks'] },
      precedence: 150,
      createdBy: 'AI',
      isActive: true,
    },
    {
      name: 'Focus hours protection',
      scope: 'GLOBAL',
      condition: { field: 'time', operator: 'within', value: { start: '06:00', end: '10:00' }, model: 'notification' },
      action: { type: 'suppress', exceptions: ['P0_tasks', 'VIP_contacts'], queue_for_later: true },
      precedence: 300,
      createdBy: 'HUMAN',
      isActive: true,
    },
    {
      name: 'Meeting-free day enforcement',
      scope: 'GLOBAL',
      condition: { field: 'dayOfWeek', operator: 'in', value: [0, 6], model: 'calendar_event' },
      action: { type: 'block', reason: 'Meeting-free day', suggest_alternatives: true },
      precedence: 250,
      createdBy: 'HUMAN',
      isActive: true,
    },
    {
      name: 'Auto-archive completed tasks',
      scope: 'GLOBAL',
      condition: { field: 'status', operator: 'eq', value: 'DONE', age_days: 30, model: 'task' },
      action: { type: 'archive', notify: false },
      precedence: 10,
      createdBy: 'AI',
      isActive: true,
    },
    {
      name: 'Financial approval threshold',
      scope: 'ENTITY',
      entityId: creForge.id,
      condition: { field: 'amount', operator: 'gte', value: 10000, model: 'financial_record' },
      action: { type: 'require_approval', approver: 'owner', notification: 'email' },
      precedence: 200,
      createdBy: 'HUMAN',
      isActive: true,
    },
  ];

  const createdRules = [];
  for (const r of rulesData) {
    const rule = await prisma.rule.create({ data: r });
    createdRules.push(rule);
  }

  log(`done (${createdRules.length} created)`);

  // =========================================================================
  // ACTION LOGS (10+)
  // =========================================================================
  log('Seeding action logs...');

  const actionLogsData = [
    { actor: 'AI', actorId: null, actionType: 'triage_message', target: `message:${createdMessages[0].id}`, reason: 'Auto-triaged incoming message from VIP contact', blastRadius: 'LOW', reversible: true, status: 'EXECUTED' },
    { actor: 'HUMAN', actorId: marcus.id, actionType: 'approve_task', target: `task:${createdTasks[0].id}`, reason: 'Approved EHR API credential configuration', blastRadius: 'MEDIUM', reversible: true, status: 'EXECUTED' },
    { actor: 'AI', actorId: null, actionType: 'send_notification', target: `user:${marcus.id}`, reason: 'P0 task approaching deadline', blastRadius: 'LOW', reversible: false, status: 'EXECUTED' },
    { actor: 'AI', actorId: null, actionType: 'generate_briefing', target: `entity:${medlink.id}`, reason: 'Morning briefing workflow triggered', blastRadius: 'LOW', reversible: true, status: 'EXECUTED' },
    { actor: 'HUMAN', actorId: marcus.id, actionType: 'update_contact', target: `contact:${drMartinez.id}`, reason: 'Updated relationship score after productive call', blastRadius: 'LOW', reversible: true, status: 'EXECUTED' },
    { actor: 'AI', actorId: null, actionType: 'escalate_message', target: `message:${createdMessages[5].id}`, reason: 'High triage score message from board advisor', blastRadius: 'MEDIUM', reversible: true, status: 'EXECUTED' },
    { actor: 'SYSTEM', actorId: null, actionType: 'archive_task', target: `task:${createdTasks[16].id}`, reason: 'Auto-archived completed task older than 30 days', blastRadius: 'LOW', reversible: true, rollbackPath: '/api/tasks/restore', status: 'EXECUTED' },
    { actor: 'AI', actorId: null, actionType: 'draft_response', target: `message:${createdMessages[3].id}`, reason: 'Auto-drafted response to vendor catalog email', blastRadius: 'MEDIUM', reversible: true, status: 'PENDING' },
    { actor: 'HUMAN', actorId: marcus.id, actionType: 'approve_payment', target: `financial:${createdFinancials[1].id}`, reason: 'Approved FHIR sandbox license payment', blastRadius: 'HIGH', reversible: false, status: 'EXECUTED', cost: 2500 },
    { actor: 'AI', actorId: null, actionType: 'flag_compliance', target: `message:${createdMessages[20].id}`, reason: 'HIPAA screening rule triggered - message contains restricted content', blastRadius: 'HIGH', reversible: true, status: 'EXECUTED' },
    { actor: 'SYSTEM', actorId: null, actionType: 'rotate_credentials', target: 'system:admin_accounts', reason: 'HIPAA audit finding - forced password rotation', blastRadius: 'CRITICAL', reversible: false, status: 'EXECUTED' },
  ];

  const createdActionLogs = [];
  for (const al of actionLogsData) {
    const actionLog = await prisma.actionLog.create({ data: al });
    createdActionLogs.push(actionLog);
  }

  log(`done (${createdActionLogs.length} created)`);

  // =========================================================================
  // CONSENT RECEIPTS (5+)
  // =========================================================================
  log('Seeding consent receipts...');

  const consentData = [
    { actionId: createdActionLogs[0].id, description: 'AI triaged and prioritized incoming message', reason: 'Automated triage workflow', impacted: [drMartinez.id, marcus.id], reversible: true, confidence: 0.92 },
    { actionId: createdActionLogs[3].id, description: 'AI generated morning briefing digest', reason: 'Scheduled morning briefing workflow', impacted: [marcus.id], reversible: true, confidence: 0.95 },
    { actionId: createdActionLogs[5].id, description: 'AI escalated high-priority message to push notification', reason: 'Urgent message escalation rule', impacted: [drObrien.id, marcus.id], reversible: true, confidence: 0.88 },
    { actionId: createdActionLogs[7].id, description: 'AI drafted response to vendor email', reason: 'Auto-response for low-priority vendor communications', impacted: [jamesWu.id], reversible: true, rollbackLink: '/api/drafts/delete', confidence: 0.75 },
    { actionId: createdActionLogs[9].id, description: 'AI flagged message for HIPAA compliance review', reason: 'HIPAA message screening rule triggered', impacted: [tomBaker.id, marcus.id], reversible: true, confidence: 0.97 },
    { actionId: createdActionLogs[10].id, description: 'System forced password rotation for admin accounts', reason: 'HIPAA audit remediation', impacted: [marcus.id], reversible: false, confidence: 1.0 },
  ];

  const createdConsents = [];
  for (const c of consentData) {
    const consent = await prisma.consentReceipt.create({ data: c });
    createdConsents.push(consent);
  }

  log(`done (${createdConsents.length} created)`);

  // =========================================================================
  // MEMORY ENTRIES (10+)
  // =========================================================================
  log('Seeding memory entries...');

  const memoryData = [
    { userId: marcus.id, type: 'LONG_TERM', content: 'Dr. Martinez prefers email for formal communications and SMS for quick questions', context: 'contact_preferences', strength: 0.95 },
    { userId: marcus.id, type: 'LONG_TERM', content: 'Bobby Castellano works best with casual, brief communications. Always leads with numbers.', context: 'contact_preferences', strength: 0.9 },
    { userId: marcus.id, type: 'WORKING', content: 'EHR Integration Phase 2 is behind schedule by ~1 week. FHIR mapping complexity underestimated.', context: 'project_status', strength: 0.85 },
    { userId: marcus.id, type: 'WORKING', content: 'HIPAA audit has 3 critical findings that need remediation within 2 weeks', context: 'compliance', strength: 0.95 },
    { userId: marcus.id, type: 'SHORT_TERM', content: 'Board meeting next Thursday - need slides by Tuesday', context: 'deadlines', strength: 1.0 },
    { userId: marcus.id, type: 'SHORT_TERM', content: 'Another buyer interested in 400 Main St - need to expedite LOI', context: 'deals', strength: 1.0 },
    { userId: marcus.id, type: 'EPISODIC', content: 'Last call with Dr. Martinez was very productive. She responded well to data-driven presentation of EHR integration benefits.', context: 'interaction_history', strength: 0.8 },
    { userId: marcus.id, type: 'EPISODIC', content: 'Jennifer Wright mentioned she could improve loan terms if we provide environmental clearance early', context: 'negotiation_intel', strength: 0.85 },
    { userId: marcus.id, type: 'LONG_TERM', content: 'Marcus runs best in early morning (5-6am). Schedule training runs before focus hours.', context: 'personal_habits', strength: 0.9 },
    { userId: marcus.id, type: 'WORKING', content: 'Kitchen renovation is on track but countertop material selection is blocking next phase', context: 'personal_projects', strength: 0.7 },
    { userId: sarah.id, type: 'LONG_TERM', content: 'Prefers diplomatic tone in all external communications. Highly detail-oriented.', context: 'user_profile', strength: 0.95 },
    { userId: sarah.id, type: 'WORKING', content: 'Night owl - most productive between 8pm-11pm. Avoid scheduling calls during this time.', context: 'work_patterns', strength: 0.9 },
  ];

  const createdMemories = [];
  for (const m of memoryData) {
    const mem = await prisma.memoryEntry.create({ data: m });
    createdMemories.push(mem);
  }

  log(`done (${createdMemories.length} created)`);

  // =========================================================================
  // DECISIONS (5+)
  // =========================================================================
  log('Seeding decisions...');

  const decisionsData = [
    {
      entityId: medlink.id,
      title: 'EHR Vendor Selection',
      type: 'strategic',
      status: 'in_review',
      options: [
        { id: 'opt1', label: 'Epic Systems', description: 'Industry leader in EHR', pros: ['Market leader', 'Comprehensive features', 'Large support network'], cons: ['High cost', 'Long implementation'], score: 8 },
        { id: 'opt2', label: 'Cerner', description: 'Strong mid-market EHR', pros: ['Lower cost', 'Faster deployment', 'Good interoperability'], cons: ['Smaller ecosystem', 'Fewer integrations'], score: 7 },
        { id: 'opt3', label: 'Athenahealth', description: 'Cloud-native EHR platform', pros: ['Cloud-first', 'Modern UI', 'Quick updates'], cons: ['Less customizable', 'Newer platform'], score: 6 },
      ],
      matrix: {
        criteria: ['cost', 'features', 'support', 'integration', 'compliance'],
        weights: [0.25, 0.30, 0.15, 0.20, 0.10],
        scores: { opt1: [5, 9, 9, 8, 9], opt2: [7, 7, 7, 7, 8], opt3: [8, 6, 6, 6, 7] },
      },
      deadline: daysFromNow(30),
      stakeholders: [
        { userId: marcus.id, role: 'decision_maker', vote: null },
        { userId: sarah.id, role: 'advisor', vote: 'opt1' },
      ],
    },
    {
      entityId: creForge.id,
      title: 'Office Lease Renewal',
      type: 'financial',
      status: 'open',
      options: [
        { id: 'opt1', label: 'Renew Current Lease', description: 'Stay at current location with updated terms', pros: ['No moving costs', 'Established location'], cons: ['Higher rent increase', 'Limited space'], score: 6 },
        { id: 'opt2', label: 'Relocate Downtown', description: 'Move to new downtown office space', pros: ['More space', 'Better location', 'Modern amenities'], cons: ['Moving costs', 'Disruption'], score: 7 },
      ],
      matrix: {
        criteria: ['cost', 'location', 'size', 'amenities'],
        weights: [0.35, 0.25, 0.25, 0.15],
        scores: { opt1: [7, 6, 4, 5], opt2: [5, 9, 8, 9] },
      },
    },
    {
      entityId: medlink.id,
      title: 'Telehealth Platform Choice',
      type: 'product',
      status: 'decided',
      options: [
        { id: 'opt1', label: 'Vendor A - TeleDoc', description: 'Established telehealth provider', pros: ['Proven track record'], cons: ['Higher cost'], score: 7 },
        { id: 'opt2', label: 'Vendor B - VirtualCare', description: 'Innovative telehealth startup', pros: ['Modern tech', 'Better pricing', 'HIPAA built-in'], cons: ['Newer company'], score: 9 },
      ],
      outcome: 'Selected Vendor B - VirtualCare',
      rationale: 'VirtualCare offers better pricing, modern technology stack, and built-in HIPAA compliance which reduces our compliance burden. Their API-first approach aligns with our integration strategy.',
      decidedAt: daysAgo(5),
      decidedBy: marcus.id,
      stakeholders: [
        { userId: marcus.id, role: 'decision_maker', vote: 'opt2' },
      ],
    },
    {
      entityId: creForge.id,
      title: 'Investment Property Bid',
      type: 'financial',
      status: 'open',
      options: [
        { id: 'opt1', label: 'Aggressive Bid ($4.5M)', description: 'Above asking to secure deal', pros: ['Higher chance of acceptance'], cons: ['Overpaying risk'], score: 5 },
        { id: 'opt2', label: 'Market Value Bid ($4.0M)', description: 'At market value', pros: ['Fair price', 'Room for negotiation'], cons: ['May lose to higher bidder'], score: 7 },
        { id: 'opt3', label: 'Conservative Bid ($3.7M)', description: 'Below asking with contingencies', pros: ['Best value if accepted'], cons: ['Likely rejected'], score: 4 },
      ],
      deadline: daysFromNow(14),
    },
    {
      entityId: personal.id,
      title: 'Personal Vehicle Purchase',
      type: 'financial',
      status: 'deferred',
      options: [
        { id: 'opt1', label: 'Tesla Model Y', description: 'Electric SUV', pros: ['Zero emissions', 'Low maintenance', 'Tech features'], cons: ['Higher upfront cost', 'Charging infrastructure'], score: 7 },
        { id: 'opt2', label: 'Toyota RAV4 Hybrid', description: 'Hybrid SUV', pros: ['Reliable', 'Lower cost', 'No range anxiety'], cons: ['Less tech', 'Some emissions'], score: 8 },
      ],
      rationale: 'Deferring decision until Q3 when current lease expires.',
    },
  ];

  const createdDecisions = [];
  for (const d of decisionsData) {
    const decision = await prisma.decision.create({ data: d });
    createdDecisions.push(decision);
  }

  log(`done (${createdDecisions.length} created)`);

  // =========================================================================
  // BUDGETS (6+)
  // =========================================================================
  log('Seeding budgets...');

  const budgetsData = [
    {
      entityId: medlink.id,
      name: 'Marketing Q1',
      amount: 50000,
      spent: 12500,
      period: 'quarterly',
      category: 'marketing',
      startDate: daysAgo(45),
      endDate: daysFromNow(45),
      alerts: [
        { threshold: 75, type: 'percentage', notified: false },
        { threshold: 90, type: 'percentage', notified: false },
      ],
      status: 'active',
    },
    {
      entityId: medlink.id,
      name: 'Engineering Salaries',
      amount: 2500000,
      spent: 2100000,
      period: 'monthly',
      category: 'engineering',
      startDate: daysAgo(25),
      endDate: daysFromNow(5),
      alerts: [
        { threshold: 90, type: 'percentage', notified: true },
      ],
      status: 'active',
    },
    {
      entityId: creForge.id,
      name: 'Property Maintenance',
      amount: 100000,
      spent: 45000,
      period: 'monthly',
      category: 'operations',
      startDate: daysAgo(20),
      endDate: daysFromNow(10),
      status: 'active',
    },
    {
      entityId: creForge.id,
      name: 'Legal Fees',
      amount: 200000,
      spent: 87500,
      period: 'yearly',
      category: 'legal',
      startDate: daysAgo(180),
      endDate: daysFromNow(185),
      alerts: [
        { threshold: 50, type: 'percentage', notified: true },
        { threshold: 75, type: 'percentage', notified: false },
      ],
      status: 'active',
    },
    {
      entityId: medlink.id,
      name: 'Travel Budget',
      amount: 30000,
      spent: 8000,
      period: 'quarterly',
      category: 'travel',
      startDate: daysAgo(30),
      endDate: daysFromNow(60),
      status: 'active',
    },
    {
      entityId: personal.id,
      name: 'Personal Savings',
      amount: 500000,
      spent: 0,
      period: 'monthly',
      category: 'savings',
      startDate: daysAgo(15),
      endDate: daysFromNow(15),
      notes: 'Monthly savings target',
      status: 'active',
    },
  ];

  const createdBudgets = [];
  for (const b of budgetsData) {
    const budget = await prisma.budget.create({ data: b });
    createdBudgets.push(budget);
  }

  log(`done (${createdBudgets.length} created)`);

  // =========================================================================
  // NOTIFICATIONS (10+)
  // =========================================================================
  log('Seeding notifications...');

  const notificationsData = [
    { userId: marcus.id, entityId: medlink.id, type: 'task_due', title: 'Task Due Soon', body: 'Remediate SQL injection finding is due in 2 days', read: false, priority: 'urgent', actionUrl: '/tasks?filter=due-soon' },
    { userId: marcus.id, entityId: medlink.id, type: 'message_received', title: 'New Message from Dr. O\'Brien', body: 'Board Meeting Agenda - Next Thursday. Please prepare a 10-minute update.', read: true, readAt: daysAgo(1), priority: 'high', actionUrl: '/messages?thread=board' },
    { userId: marcus.id, entityId: creForge.id, type: 'alert', title: 'Competing Buyer Alert', body: 'Another buyer is interested in 400 Main St. Consider expediting the LOI.', read: false, priority: 'urgent', actionUrl: '/deals/400-main' },
    { userId: marcus.id, entityId: medlink.id, type: 'workflow_completed', title: 'Morning Briefing Generated', body: 'Your daily briefing for MedLink Pro is ready to review.', read: true, readAt: daysAgo(0), priority: 'normal', actionUrl: '/briefings/today' },
    { userId: marcus.id, entityId: creForge.id, type: 'payment', title: 'Invoice Payment Due', body: 'Property inspection invoice from Foster Inspections ($12,000) is due in 10 days.', read: false, priority: 'normal', actionUrl: '/financials?filter=pending' },
    { userId: marcus.id, entityId: medlink.id, type: 'system', title: 'HIPAA Audit Finding', body: 'Three user accounts with admin privileges have not rotated passwords in 90+ days.', read: true, readAt: daysAgo(2), priority: 'high', actionUrl: '/compliance/audit' },
    { userId: marcus.id, entityId: personal.id, type: 'task_due', title: 'Tax Payment Reminder', body: 'Q1 estimated tax payment of $12,500 is due in 15 days.', read: false, priority: 'high', actionUrl: '/tasks?filter=tax' },
    { userId: marcus.id, entityId: medlink.id, type: 'message_received', title: 'Patient Portal Feedback', body: 'Nurse Owens shared clinical staff feedback on the current patient portal.', read: false, priority: 'normal', actionUrl: '/messages?from=owens' },
    { userId: sarah.id, entityId: medlink.id, type: 'system', title: 'Welcome to PAF', body: 'Your Personal Assistant Forge account has been set up. Start by configuring your preferences.', read: true, readAt: daysAgo(10), priority: 'low', actionUrl: '/settings' },
    { userId: sarah.id, entityId: null, type: 'system', title: 'Weekly Summary Available', body: 'Your weekly activity summary is ready for review.', read: false, priority: 'low', actionUrl: '/reports/weekly' },
    { userId: marcus.id, entityId: creForge.id, type: 'alert', title: 'Budget Alert: Engineering', body: 'Engineering Salaries budget is at 84% utilization for this period.', read: false, priority: 'high', metadata: { budgetName: 'Engineering Salaries', utilization: 84 } },
    { userId: marcus.id, entityId: medlink.id, type: 'workflow_completed', title: 'Contact Enrichment Complete', body: 'Contact data enrichment workflow completed for 3 new contacts.', read: true, readAt: daysAgo(3), priority: 'low' },
  ];

  const createdNotifications = [];
  for (const n of notificationsData) {
    const notification = await prisma.notification.create({ data: n });
    createdNotifications.push(notification);
  }

  log(`done (${createdNotifications.length} created)`);

  // =========================================================================
  // VOICE PERSONAS (4+)
  // =========================================================================
  log('Seeding voice personas...');

  const voicePersonasData = [
    {
      entityId: medlink.id,
      name: 'Professional',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      provider: 'elevenlabs',
      settings: { speed: 1.0, pitch: 0, stability: 0.75, similarity: 0.85, style: 0.3, speakerBoost: true },
      description: 'Default professional voice for patient and clinical communications',
      isDefault: true,
    },
    {
      entityId: medlink.id,
      name: 'Friendly',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      provider: 'elevenlabs',
      settings: { speed: 1.1, pitch: 0.05, stability: 0.65, similarity: 0.80, style: 0.5, speakerBoost: false },
      description: 'Warmer tone for patient follow-ups and wellness check-ins',
      isDefault: false,
    },
    {
      entityId: creForge.id,
      name: 'Executive',
      voiceId: 'en-US-GuyNeural',
      provider: 'azure',
      settings: { speed: 0.9, pitch: -0.05, stability: 0.85, similarity: 0.90, style: 0.2, speakerBoost: true },
      description: 'Authoritative tone for investor calls and executive presentations',
      isDefault: true,
    },
    {
      entityId: personal.id,
      name: 'Casual',
      voiceId: 'en-US-Wavenet-D',
      provider: 'google',
      settings: { speed: 1.0, pitch: 0, stability: 0.60, similarity: 0.75, style: 0.6, speakerBoost: false },
      description: 'Relaxed tone for personal communications and reminders',
      isDefault: true,
    },
  ];

  const createdVoicePersonas = [];
  for (const vp of voicePersonasData) {
    const persona = await prisma.voicePersona.create({ data: vp });
    createdVoicePersonas.push(persona);
  }

  log(`done (${createdVoicePersonas.length} created)`);

  // =========================================================================
  // RUNBOOKS (5+)
  // =========================================================================
  log('Seeding runbooks...');

  const runbooksData = [
    {
      entityId: medlink.id,
      name: 'Patient Data Breach Response',
      description: 'Standard operating procedure for responding to potential patient data breaches per HIPAA requirements',
      steps: [
        { id: 'rb1s1', order: 1, action: 'detect_and_log', params: { log_level: 'critical', notify: ['security_team'] }, onSuccess: 'rb1s2', onFailure: 'rb1s6', timeout: 300 },
        { id: 'rb1s2', order: 2, action: 'contain_breach', params: { isolate_systems: true, disable_accounts: true }, onSuccess: 'rb1s3', onFailure: 'rb1s6', timeout: 600 },
        { id: 'rb1s3', order: 3, action: 'assess_impact', params: { check_records: true, identify_affected: true }, onSuccess: 'rb1s4', onFailure: 'rb1s6', timeout: 1800 },
        { id: 'rb1s4', order: 4, action: 'notify_authorities', params: { hhs_notification: true, state_ag: true, deadline_days: 60 }, onSuccess: 'rb1s5', onFailure: 'rb1s6', timeout: 3600 },
        { id: 'rb1s5', order: 5, action: 'remediate', params: { patch_vulnerabilities: true, update_policies: true }, onSuccess: 'rb1s6', onFailure: null, timeout: 86400 },
        { id: 'rb1s6', order: 6, action: 'post_incident_review', params: { generate_report: true, update_runbook: true }, onSuccess: null, onFailure: null, timeout: 604800 },
      ],
      variables: [
        { name: 'incident_id', type: 'string', defaultValue: null, required: true, description: 'Unique identifier for this incident' },
        { name: 'severity', type: 'string', defaultValue: 'high', required: true, description: 'Severity level: low, medium, high, critical' },
      ],
      category: 'incident',
      trigger: 'manual',
      isActive: true,
      version: 2,
      createdBy: marcus.id,
    },
    {
      entityId: creForge.id,
      name: 'New Tenant Onboarding',
      description: 'Onboarding process for new commercial tenants',
      steps: [
        { id: 'rb2s1', order: 1, action: 'send_welcome_package', params: { template: 'tenant_welcome', include_handbook: true }, onSuccess: 'rb2s2', onFailure: null, timeout: 86400 },
        { id: 'rb2s2', order: 2, action: 'collect_documents', params: { required: ['insurance_cert', 'business_license', 'signed_lease'] }, onSuccess: 'rb2s3', onFailure: null, timeout: 604800 },
        { id: 'rb2s3', order: 3, action: 'provision_access', params: { key_cards: true, parking: true, building_portal: true }, onSuccess: 'rb2s4', onFailure: null, timeout: 172800 },
        { id: 'rb2s4', order: 4, action: 'schedule_orientation', params: { duration_minutes: 60, include_fire_safety: true }, onSuccess: 'rb2s5', onFailure: null, timeout: 604800 },
        { id: 'rb2s5', order: 5, action: 'follow_up_survey', params: { send_after_days: 30, template: 'tenant_satisfaction' }, onSuccess: null, onFailure: null, timeout: 2592000 },
      ],
      variables: [
        { name: 'tenant_name', type: 'string', defaultValue: null, required: true, description: 'Name of the new tenant' },
        { name: 'unit_number', type: 'string', defaultValue: null, required: true, description: 'Unit or suite number' },
        { name: 'lease_start_date', type: 'date', defaultValue: null, required: true, description: 'Lease commencement date' },
      ],
      category: 'onboarding',
      trigger: 'manual',
      isActive: true,
      createdBy: marcus.id,
    },
    {
      entityId: medlink.id,
      name: 'Monthly Compliance Check',
      description: 'Monthly HIPAA and regulatory compliance verification',
      steps: [
        { id: 'rb3s1', order: 1, action: 'audit_access_logs', params: { lookback_days: 30, flag_anomalies: true }, onSuccess: 'rb3s2', onFailure: null, timeout: 3600 },
        { id: 'rb3s2', order: 2, action: 'verify_encryption', params: { check_at_rest: true, check_in_transit: true }, onSuccess: 'rb3s3', onFailure: null, timeout: 1800 },
        { id: 'rb3s3', order: 3, action: 'review_user_permissions', params: { check_inactive: true, days_threshold: 90 }, onSuccess: 'rb3s4', onFailure: null, timeout: 3600 },
        { id: 'rb3s4', order: 4, action: 'generate_compliance_report', params: { format: 'pdf', recipients: ['compliance_officer'] }, onSuccess: null, onFailure: null, timeout: 1800 },
      ],
      category: 'compliance',
      trigger: 'scheduled',
      schedule: '0 9 1 * *',
      isActive: true,
      lastRunAt: daysAgo(14),
      runCount: 8,
      createdBy: marcus.id,
    },
    {
      entityId: medlink.id,
      name: 'Server Deployment',
      description: 'Production server deployment procedure with rollback capability',
      steps: [
        { id: 'rb4s1', order: 1, action: 'run_tests', params: { suite: 'full', environment: 'staging' }, onSuccess: 'rb4s2', onFailure: null, timeout: 1800 },
        { id: 'rb4s2', order: 2, action: 'create_backup', params: { type: 'full', retention_days: 30 }, onSuccess: 'rb4s3', onFailure: null, timeout: 3600 },
        { id: 'rb4s3', order: 3, action: 'deploy_to_staging', params: { environment: 'staging', canary: true }, onSuccess: 'rb4s4', onFailure: 'rb4s7', timeout: 1800 },
        { id: 'rb4s4', order: 4, action: 'run_smoke_tests', params: { endpoints: ['health', 'api', 'auth'] }, onSuccess: 'rb4s5', onFailure: 'rb4s7', timeout: 600 },
        { id: 'rb4s5', order: 5, action: 'deploy_to_production', params: { strategy: 'blue_green', health_check_interval: 30 }, onSuccess: 'rb4s6', onFailure: 'rb4s7', timeout: 3600 },
        { id: 'rb4s6', order: 6, action: 'verify_production', params: { monitor_minutes: 15, alert_on_error_rate: 0.01 }, onSuccess: null, onFailure: 'rb4s7', timeout: 900 },
        { id: 'rb4s7', order: 7, action: 'rollback', params: { restore_backup: true, notify_team: true }, onSuccess: null, onFailure: null, timeout: 1800 },
      ],
      variables: [
        { name: 'version', type: 'string', defaultValue: null, required: true, description: 'Version tag to deploy' },
        { name: 'deployer', type: 'string', defaultValue: null, required: true, description: 'Person initiating the deployment' },
      ],
      category: 'deployment',
      trigger: 'manual',
      isActive: true,
      lastRunAt: daysAgo(7),
      runCount: 23,
      version: 3,
      createdBy: marcus.id,
    },
    {
      entityId: creForge.id,
      name: 'Property Inspection Workflow',
      description: 'Standard property inspection and reporting workflow',
      steps: [
        { id: 'rb5s1', order: 1, action: 'schedule_inspection', params: { advance_notice_days: 7, notify_tenant: true }, onSuccess: 'rb5s2', onFailure: null, timeout: 604800 },
        { id: 'rb5s2', order: 2, action: 'conduct_inspection', params: { checklist: ['structural', 'electrical', 'plumbing', 'hvac', 'safety'] }, onSuccess: 'rb5s3', onFailure: null, timeout: 14400 },
        { id: 'rb5s3', order: 3, action: 'document_findings', params: { photos_required: true, severity_rating: true }, onSuccess: 'rb5s4', onFailure: null, timeout: 86400 },
        { id: 'rb5s4', order: 4, action: 'generate_report', params: { format: 'pdf', include_photos: true, distribute_to: ['owner', 'property_manager'] }, onSuccess: 'rb5s5', onFailure: null, timeout: 172800 },
        { id: 'rb5s5', order: 5, action: 'create_maintenance_tasks', params: { auto_prioritize: true, assign_to: 'property_manager' }, onSuccess: null, onFailure: null, timeout: 86400 },
      ],
      category: 'maintenance',
      trigger: 'scheduled',
      schedule: '0 9 15 * *',
      isActive: true,
      lastRunAt: daysAgo(15),
      runCount: 12,
      createdBy: marcus.id,
    },
  ];

  const createdRunbooks = [];
  for (const rb of runbooksData) {
    const runbook = await prisma.runbook.create({ data: rb });
    createdRunbooks.push(runbook);
  }

  log(`done (${createdRunbooks.length} created)`);

  // =========================================================================
  // SHADOW VOICE AGENT TABLES
  // =========================================================================
  log('Seeding Shadow Voice Agent tables...');

  // --- ShadowSafetyConfig for both users ---
  const marcusSafetyConfig = await prisma.shadowSafetyConfig.upsert({
    where: { userId: marcus.id },
    update: {},
    create: {
      userId: marcus.id,
      voicePin: '7742',
      requirePinForFinancial: true,
      requirePinForExternal: true,
      requirePinForCrisis: true,
      maxBlastRadiusWithoutPin: 'entity',
      phoneConfirmationMode: 'voice_pin',
      alwaysAnnounceBlastRadius: true,
    },
  });

  const sarahSafetyConfig = await prisma.shadowSafetyConfig.upsert({
    where: { userId: sarah.id },
    update: {},
    create: {
      userId: sarah.id,
      voicePin: '3319',
      requirePinForFinancial: true,
      requirePinForExternal: false,
      requirePinForCrisis: true,
      maxBlastRadiusWithoutPin: 'internal',
      phoneConfirmationMode: 'voice_pin',
      alwaysAnnounceBlastRadius: false,
    },
  });

  log('  ShadowSafetyConfig: 2 created');

  // --- ShadowProactiveConfig for both users ---
  const marcusProactiveConfig = await prisma.shadowProactiveConfig.upsert({
    where: { userId: marcus.id },
    update: {},
    create: {
      userId: marcus.id,
      briefingEnabled: true,
      briefingTime: '06:30',
      briefingChannel: 'in_app',
      briefingContent: ['tasks_due', 'calendar_summary', 'financial_alerts', 'vip_messages'],
      callTriggers: { urgentTask: true, vipMessage: true, financialThreshold: 1000 },
      vipBreakoutContacts: [],
      callWindowStart: '07:00',
      callWindowEnd: '20:00',
      quietHoursStart: '21:00',
      quietHoursEnd: '06:00',
      cooldownMinutes: 30,
      maxCallsPerDay: 8,
      maxCallsPerHour: 3,
      digestEnabled: true,
      digestTime: '18:00',
      escalationConfig: { levels: ['in_app', 'sms', 'call'], delayMinutes: [0, 5, 15] },
    },
  });

  const sarahProactiveConfig = await prisma.shadowProactiveConfig.upsert({
    where: { userId: sarah.id },
    update: {},
    create: {
      userId: sarah.id,
      briefingEnabled: true,
      briefingTime: '09:00',
      briefingChannel: 'in_app',
      briefingContent: ['tasks_due', 'calendar_summary'],
      vipBreakoutContacts: [],
      callWindowStart: '10:00',
      callWindowEnd: '22:00',
      quietHoursStart: '23:00',
      quietHoursEnd: '09:00',
      cooldownMinutes: 60,
      maxCallsPerDay: 5,
      maxCallsPerHour: 2,
      digestEnabled: false,
    },
  });

  log('  ShadowProactiveConfig: 2 created');

  // --- ShadowEntityProfile for all 3 entities ---
  const medlinkProfile = await prisma.shadowEntityProfile.upsert({
    where: { entityId: medlink.id },
    update: {},
    create: {
      entityId: medlink.id,
      voicePersona: 'professional-healthcare',
      tone: 'professional-empathetic',
      signature: 'MedLink Pro - Your Healthcare Partner',
      greeting: 'Hello, this is Shadow calling on behalf of MedLink Pro.',
      disclaimers: ['This call may be recorded for quality assurance.', 'HIPAA-compliant communication protocols are in effect.'],
      allowedDisclosures: ['appointment_details', 'general_availability', 'public_contact_info'],
      neverDisclose: ['patient_records', 'diagnosis_info', 'billing_details', 'ssn'],
      complianceProfiles: ['HIPAA', 'GDPR'],
      vipContacts: [],
      proactiveEnabled: true,
      financialPinThreshold: 250,
      blastRadiusPinThreshold: 'external',
    },
  });

  const creForgeProfile = await prisma.shadowEntityProfile.upsert({
    where: { entityId: creForge.id },
    update: {},
    create: {
      entityId: creForge.id,
      voicePersona: 'confident-business',
      tone: 'confident-friendly',
      signature: 'CRE Forge - Commercial Real Estate',
      greeting: 'Hi, this is Shadow calling from CRE Forge.',
      disclaimers: ['This call may be recorded for quality and training purposes.'],
      allowedDisclosures: ['property_listings', 'market_data', 'appointment_availability'],
      neverDisclose: ['financial_terms', 'tenant_details', 'internal_valuations'],
      complianceProfiles: ['REAL_ESTATE', 'SOX'],
      vipContacts: [],
      proactiveEnabled: true,
      financialPinThreshold: 500,
      blastRadiusPinThreshold: 'external',
    },
  });

  const personalProfile = await prisma.shadowEntityProfile.upsert({
    where: { entityId: personal.id },
    update: {},
    create: {
      entityId: personal.id,
      voicePersona: 'casual-assistant',
      tone: 'warm-casual',
      greeting: 'Hey, this is Shadow.',
      disclaimers: [],
      allowedDisclosures: [],
      neverDisclose: [],
      complianceProfiles: ['GENERAL'],
      vipContacts: [],
      proactiveEnabled: true,
      financialPinThreshold: 500,
      blastRadiusPinThreshold: 'external',
    },
  });

  log('  ShadowEntityProfile: 3 created');

  // --- ShadowRetentionConfig for all 3 entities ---
  const medlinkRetention = await prisma.shadowRetentionConfig.upsert({
    where: { entityId: medlink.id },
    update: {},
    create: {
      entityId: medlink.id,
      storeRecordings: true,
      storeTranscripts: true,
      storeMessages: true,
      recordingRetentionDays: 365,
      transcriptRetentionDays: 2555,
      messageRetentionDays: 2555,
      consentRetentionDays: 2555,
      noRecordingMode: false,
      ephemeralMode: false,
    },
  });

  const creForgeRetention = await prisma.shadowRetentionConfig.upsert({
    where: { entityId: creForge.id },
    update: {},
    create: {
      entityId: creForge.id,
      storeRecordings: true,
      storeTranscripts: true,
      storeMessages: true,
      recordingRetentionDays: 180,
      transcriptRetentionDays: 365,
      messageRetentionDays: 365,
      consentRetentionDays: 2555,
      noRecordingMode: false,
      ephemeralMode: false,
    },
  });

  const personalRetention = await prisma.shadowRetentionConfig.upsert({
    where: { entityId: personal.id },
    update: {},
    create: {
      entityId: personal.id,
      storeRecordings: false,
      storeTranscripts: true,
      storeMessages: true,
      recordingRetentionDays: 30,
      transcriptRetentionDays: 90,
      messageRetentionDays: 90,
      consentRetentionDays: 365,
      noRecordingMode: true,
      ephemeralMode: false,
    },
  });

  log('  ShadowRetentionConfig: 3 created');

  // --- ShadowTrustedDevice entries ---
  const trustedDevices = await Promise.all([
    prisma.shadowTrustedDevice.create({
      data: {
        userId: marcus.id,
        deviceType: 'mobile',
        deviceFingerprint: 'fp_iphone15pro_marcus_001',
        phoneNumber: '+15559990001',
        name: "Marcus's iPhone 15 Pro",
        isActive: true,
      },
    }),
    prisma.shadowTrustedDevice.create({
      data: {
        userId: marcus.id,
        deviceType: 'desktop',
        deviceFingerprint: 'fp_macbookpro_marcus_001',
        name: "Marcus's MacBook Pro",
        isActive: true,
      },
    }),
    prisma.shadowTrustedDevice.create({
      data: {
        userId: sarah.id,
        deviceType: 'mobile',
        deviceFingerprint: 'fp_pixel8_sarah_001',
        phoneNumber: '+15559990002',
        name: "Sarah's Pixel 8",
        isActive: true,
      },
    }),
  ]);

  log(`  ShadowTrustedDevice: ${trustedDevices.length} created`);

  // --- VoiceforgeCallPlaybook entries ---
  const callPlaybooks = await Promise.all([
    prisma.voiceforgeCallPlaybook.create({
      data: {
        name: 'Appointment Confirmation',
        entityId: medlink.id,
        scenario: 'Confirm upcoming appointments with patients or providers',
        openingScript: 'Hello, this is Shadow calling on behalf of MedLink Pro. I am calling to confirm your upcoming appointment.',
        dataAllowed: ['appointment_date', 'appointment_time', 'provider_name', 'location'],
        neverDisclose: ['diagnosis', 'treatment_details', 'billing_info'],
        escalationTriggers: ['patient_distress', 'medical_emergency', 'complaint'],
        escalationAction: 'transfer_to_human',
        maxDuration: 180,
        outcomeFields: ['confirmed', 'rescheduled', 'cancelled', 'no_answer'],
      },
    }),
    prisma.voiceforgeCallPlaybook.create({
      data: {
        name: 'Property Showing Follow-Up',
        entityId: creForge.id,
        scenario: 'Follow up with prospects after a property showing',
        openingScript: 'Hi, this is Shadow calling from CRE Forge. I wanted to follow up on your recent property viewing.',
        dataAllowed: ['property_address', 'listing_price', 'showing_date', 'agent_name'],
        neverDisclose: ['seller_motivation', 'other_offers', 'internal_valuation'],
        escalationTriggers: ['serious_buyer_interest', 'legal_question', 'complaint'],
        escalationAction: 'transfer_to_agent',
        maxDuration: 300,
        outcomeFields: ['interested', 'not_interested', 'wants_callback', 'made_offer'],
      },
    }),
    prisma.voiceforgeCallPlaybook.create({
      data: {
        name: 'Vendor Payment Reminder',
        entityId: creForge.id,
        scenario: 'Remind vendors about upcoming or overdue invoices',
        openingScript: 'Hello, this is Shadow calling from CRE Forge regarding an outstanding invoice.',
        dataAllowed: ['invoice_number', 'amount_due', 'due_date'],
        neverDisclose: ['internal_budget', 'other_vendor_rates', 'project_financials'],
        escalationTriggers: ['dispute', 'payment_plan_request', 'legal_threat'],
        escalationAction: 'transfer_to_accounts',
        maxDuration: 240,
        outcomeFields: ['payment_confirmed', 'dispute_raised', 'payment_plan', 'no_answer'],
      },
    }),
  ]);

  log(`  VoiceforgeCallPlaybook: ${callPlaybooks.length} created`);

  // --- VoiceforgeConsentConfig entries ---
  const consentConfigs = await Promise.all([
    prisma.voiceforgeConsentConfig.create({
      data: {
        entityId: medlink.id,
        jurisdiction: 'US-TX',
        consentType: 'one_party',
        consentScript: 'This call may be recorded for quality assurance and compliance purposes. By continuing, you consent to recording.',
        perContactTypeToggles: { patient: true, provider: true, vendor: true, insurance: true },
        storageToggles: { recording: true, transcript: true, summary: true },
        autoDeleteAfterDays: 2555,
        redactionToggles: { ssn: true, dob: true, medical_record_number: true },
      },
    }),
    prisma.voiceforgeConsentConfig.create({
      data: {
        entityId: creForge.id,
        jurisdiction: 'US-TX',
        consentType: 'one_party',
        consentScript: 'This call may be recorded for quality and training purposes.',
        perContactTypeToggles: { client: true, vendor: true, prospect: true },
        storageToggles: { recording: true, transcript: true, summary: true },
        autoDeleteAfterDays: 365,
        redactionToggles: { ssn: true, bank_account: true },
      },
    }),
  ]);

  log(`  VoiceforgeConsentConfig: ${consentConfigs.length} created`);

  // --- ShadowPreference entries ---
  const shadowPreferences = await Promise.all([
    prisma.shadowPreference.create({
      data: {
        userId: marcus.id,
        preferenceKey: 'voice_speed',
        preferenceValue: '1.1',
        learnedFrom: 'explicit',
        confidence: 1.0,
      },
    }),
    prisma.shadowPreference.create({
      data: {
        userId: marcus.id,
        preferenceKey: 'summary_length',
        preferenceValue: 'concise',
        learnedFrom: 'explicit',
        confidence: 1.0,
      },
    }),
    prisma.shadowPreference.create({
      data: {
        userId: marcus.id,
        preferenceKey: 'notification_channel',
        preferenceValue: 'sms',
        learnedFrom: 'observed',
        confidence: 0.85,
      },
    }),
    prisma.shadowPreference.create({
      data: {
        userId: sarah.id,
        preferenceKey: 'voice_speed',
        preferenceValue: '1.0',
        learnedFrom: 'explicit',
        confidence: 1.0,
      },
    }),
    prisma.shadowPreference.create({
      data: {
        userId: sarah.id,
        preferenceKey: 'summary_length',
        preferenceValue: 'detailed',
        learnedFrom: 'explicit',
        confidence: 1.0,
      },
    }),
  ]);

  log(`  ShadowPreference: ${shadowPreferences.length} created`);

  // --- ShadowTrigger entries ---
  const shadowTriggers = await Promise.all([
    prisma.shadowTrigger.create({
      data: {
        userId: marcus.id,
        triggerName: 'VIP Message Alert',
        triggerType: 'message_received',
        conditions: { contactTags: ['VIP'], triageScoreMin: 8 },
        action: { type: 'notify', channel: 'sms', template: 'vip_message_alert' },
        enabled: true,
        cooldownMinutes: 15,
      },
    }),
    prisma.shadowTrigger.create({
      data: {
        userId: marcus.id,
        triggerName: 'Overdue Task Escalation',
        triggerType: 'task_overdue',
        conditions: { overdueDays: 2, priorityMin: 'P1' },
        action: { type: 'call', template: 'overdue_task_reminder', maxRetries: 2 },
        enabled: true,
        cooldownMinutes: 120,
      },
    }),
    prisma.shadowTrigger.create({
      data: {
        userId: marcus.id,
        triggerName: 'Financial Threshold Alert',
        triggerType: 'financial_event',
        conditions: { amountMin: 5000, types: ['INVOICE', 'PAYMENT'] },
        action: { type: 'notify', channel: 'in_app', template: 'financial_alert' },
        enabled: true,
        cooldownMinutes: 60,
      },
    }),
    prisma.shadowTrigger.create({
      data: {
        userId: sarah.id,
        triggerName: 'Calendar Conflict Alert',
        triggerType: 'calendar_conflict',
        conditions: { windowMinutes: 30 },
        action: { type: 'notify', channel: 'in_app', template: 'calendar_conflict' },
        enabled: true,
        cooldownMinutes: 30,
      },
    }),
  ]);

  log(`  ShadowTrigger: ${shadowTriggers.length} created`);

  log('Shadow Voice Agent seeding complete.');

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n✅ Seed complete! Summary:');
  console.log(`   Users:             ${2}`);
  console.log(`   Entities:          ${3}`);
  console.log(`   Contacts:          ${allContacts.length}`);
  console.log(`   Projects:          ${projects.length}`);
  console.log(`   Tasks:             ${createdTasks.length}`);
  console.log(`   Messages:          ${createdMessages.length}`);
  console.log(`   Calls:             ${createdCalls.length}`);
  console.log(`   Workflows:         ${createdWorkflows.length}`);
  console.log(`   Financial Records: ${createdFinancials.length}`);
  console.log(`   Rules:             ${createdRules.length}`);
  console.log(`   Action Logs:       ${createdActionLogs.length}`);
  console.log(`   Consent Receipts:  ${createdConsents.length}`);
  console.log(`   Memory Entries:    ${createdMemories.length}`);
  console.log(`   Decisions:         ${createdDecisions.length}`);
  console.log(`   Budgets:           ${createdBudgets.length}`);
  console.log(`   Notifications:     ${createdNotifications.length}`);
  console.log(`   Voice Personas:    ${createdVoicePersonas.length}`);
  console.log(`   Runbooks:          ${createdRunbooks.length}`);
  console.log('   --- Shadow Voice Agent ---');
  console.log(`   Safety Configs:    ${2}`);
  console.log(`   Proactive Configs: ${2}`);
  console.log(`   Entity Profiles:   ${3}`);
  console.log(`   Retention Configs: ${3}`);
  console.log(`   Trusted Devices:   ${trustedDevices.length}`);
  console.log(`   Call Playbooks:    ${callPlaybooks.length}`);
  console.log(`   Consent Configs:   ${consentConfigs.length}`);
  console.log(`   Preferences:       ${shadowPreferences.length}`);
  console.log(`   Triggers:          ${shadowTriggers.length}`);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
