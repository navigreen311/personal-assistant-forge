# PersonalAssistantForge — Shadow Voice Agent: Definitive Feature Spec

**Claude Code Implementation Prompt — v2.0 (Enhanced)**

## VISION

Shadow is not a chatbot. Shadow is a voice-first AI chief of staff that lives across every surface — in the app, on your phone, in your ear. It talks to you, coaches you through decisions, calls you when something matters, and executes on your behalf. Every PAF page, every workflow, every notification becomes accessible through one conversation that never breaks — whether you started it in the browser, continued on your phone while driving, and finished by tapping a confirmation on your watch.

This document is the single source of truth for the Shadow Agent feature.

---

## PART 1: VOICE SESSION ARCHITECTURE (Cross-Channel Continuity)

### 1.1 The Voice Session Object

Every interaction with Shadow — whether text chat, in-app voice, or phone call — belongs to a single Voice Session. Sessions persist across channels so you can start anywhere and continue anywhere.

Example flow:

```
1. User opens PAF on desktop, asks Shadow about overdue invoices (text)
2. User leaves for a drive, says "Switch this to a call"
3. Shadow calls user's phone, resumes: "We were looking at INV-042..."
4. User says "Send me the link by text"
5. Shadow sends SMS with deep link to INV-042
6. User taps link on mobile, Shadow picks up in-app: "Ready to send
   that reminder to Oak Valley?"

One session. Three channels. Zero lost context.
```

### 1.2 Voice Session Database Model

```sql
CREATE TABLE shadow_voice_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active',  -- active, paused, ended

  -- Channel tracking
  current_channel VARCHAR(20),  -- web_text, web_voice, mobile_voice, phone
  channel_history JSONB,        -- [{channel, started_at, ended_at}]

  -- Context (travels with the session)
  active_entity_id UUID,
  current_page VARCHAR(100),
  current_workflow_id UUID,     -- if in Companion Mode
  current_workflow_step INTEGER,

  -- Audio artifacts
  recording_urls JSONB,         -- [{channel, url, started_at, duration}]
  full_transcript TEXT,
  ai_summary TEXT,

  -- Approvals issued during session
  approvals JSONB,              -- [{action_id, method: 'tap'|'voice_pin'|'confirm_phrase', status}]

  -- Lifecycle
  started_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  ended_at TIMESTAMP,
  total_duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE shadow_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES shadow_voice_sessions(id),
  role VARCHAR(10),           -- user, shadow, system
  content TEXT,
  content_type VARCHAR(20),   -- text, voice_transcript, action_card, navigation
  intent VARCHAR(50),
  tools_used JSONB,
  actions_taken JSONB,
  audio_url TEXT,
  channel VARCHAR(20),        -- which channel this message came from
  confidence FLOAT,           -- intent classification confidence
  latency_ms INTEGER,         -- response time
  created_at TIMESTAMP
);
```

### 1.3 Channel Handoff Protocol

```
HANDOFF TRIGGERS:
- User says: "Switch to a call" / "Call me" / "Continue on my phone"
- User says: "Text me this" / "Send me a link"
- User says: "I'm at my computer now" (phone -> web)
- Auto: user opens mobile app while phone session active
- Auto: user goes idle on one channel, active on another

HANDOFF FLOW:
1. Shadow acknowledges: "Switching to phone. Give me one second."
2. Session state serialized (context, conversation, pending actions)
3. New channel connection established
4. Shadow resumes: "I'm here. We were discussing [context]..."
5. Previous channel shows: "Session continued on [phone/mobile/web]"

RULES:
- Only ONE active channel per session at a time
- Handoff preserves all context, pending approvals, and workflow state
- If handoff fails, Shadow stays on current channel
- Sessions auto-pause after 10 min inactivity, resume on next interaction
- Sessions auto-end after 2 hours of inactivity
```

---

## PART 2: THREE INTERFACE MODES (Unified)

### 2.1 In-App Voice (Desktop + Mobile Web)

```
─── FLOATING ASSISTANT WIDGET ───

Every page in PAF has the Shadow bubble (bottom-right).

COLLAPSED: Purple circle with Shadow avatar + notification badge
EXPANDED: Chat panel with text + voice

┌──────────────────────────────────────────┐
│ Shadow                     [🔇] [─] [✕] │
│ Your AI Chief of Staff                   │
│ ─────────────────────────────────────────│
│                                          │
│ 🤖 Good morning, Ivan. You have 3       │
│    priorities today.                     │
│                                          │
│    1. 🔴 HCQC deadline (3 days)         │
│    2. 🟡 Oak Valley invoice ($4,200)    │
│    3. 🔵 Dr. Martinez meeting prep      │
│                                          │
│    [Handle #1] [Handle #2] [Handle #3]  │
│    [📞 Talk me through all three]       │
│                                          │
│ ─────────────────────────────────────────│
│ [🎤]  Type or speak...        [Send ➤]  │
│ ─────────────────────────────────────────│
│ Sidekick: 🟢 Listening │ Session: 4m    │
└──────────────────────────────────────────┘

VOICE ACTIVATION:
- Click 🎤 button (hold-to-talk or toggle mode, configurable)
- Keyboard shortcut: Ctrl+Shift+S (configurable)
- Wake word: "Hey Shadow" (optional, requires mic permission)

VOICE MODE UI:
┌──────────────────────────────────────────┐
│              🎤 Listening...              │
│                                          │
│     ~~~~ audio waveform animation ~~~~   │
│                                          │
│  "What's on my calendar for today?"      │
│                                          │
│  🤖 (speaking): "You have 3 meetings..." │
│                                          │
│  [🔇 Mute] [⏸ Pause] [📝 Text mode]   │
│  [📞 Switch to phone call]              │
└──────────────────────────────────────────┘

KEY BEHAVIORS:
- Continuous conversation (no re-pressing after each turn)
- Live transcript scrolls below waveform
- Shadow voice output via TTS (VoiceForge persona)
- Auto-speak responses when in voice mode
- User can interrupt Shadow mid-sentence (barge-in)
- Panel persists across page navigation
- Resizable, detachable as floating window
```

### 2.2 Phone Call (Twilio + VoiceForge)

```
─── USER CALLS SHADOW ───
Dedicated number: +1-XXX-SHADOW (configured in settings)

Ring -> Shadow answers:
"Hey Ivan, it's Shadow. What's up?"

Full conversational AI. Same capabilities as in-app:
- Read/act on all modules
- Execute multi-step tasks
- Navigate decisions
- Trigger VoiceForge calls to third parties

SMS COMPANION:
During phone calls, Shadow can send supporting SMS:
- Links to invoices, tasks, documents
- Confirmation cards: "Reply YES to confirm sending"
- Summary after call ends

VOICEMAIL:
If Shadow calls user and gets voicemail:
"Hey Ivan, Shadow here. Quick update: [30-second summary].
No action needed right now. I'll text you the details.
Call me back if you want to discuss."
-> Sends SMS with summary + action links

─── SHADOW CALLS USER ───
See Part 5: Proactive Intelligence
```

### 2.3 Mobile App

```
PAF Mobile adds dedicated Shadow experience:

─── HOME SCREEN ───
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │
│ │      🤖 Shadow                   │ │
│ │  "3 priorities today. Your first │ │
│ │   meeting is in 45 minutes."     │ │
│ │                                  │ │
│ │  [🎤 Talk to Shadow]            │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ─── TODAY ───                        │
│ • 9:00 AM: MedLink standup           │
│ • 2 urgent emails                    │
│ • INV-042 overdue (5 days)           │
│                                      │
│ ──── NAV BAR ────                    │
│ [🏠 Home] [💬 Chat] [📞 Call] [⚙]  │
└──────────────────────────────────────┘

─── CALL TAB (full-screen voice) ───
┌──────────────────────────────────────┐
│                                      │
│          🤖 Shadow                   │
│       "Listening..."                 │
│                                      │
│     ~~~~ waveform ~~~~               │
│                                      │
│     Connected: 2:34                  │
│                                      │
│  Live transcript:                    │
│  You: "What emails need attention?"  │
│  Shadow: "You have 2 urgent from..." │
│                                      │
│  [🔇 Mute] [🔊 Speaker] [⏸ Hold]   │
│         [🔴 End Call]                │
└──────────────────────────────────────┘

MOBILE-SPECIFIC:
- Push notifications from Shadow (actionable: approve/dismiss)
- Home screen widget: "Talk to Shadow" one-tap
- Background listening mode (optional)
- Haptic feedback for urgent items
- Offline: queues messages, syncs when connected
- Bluetooth/AirPods/CarPlay support for hands-free
```

---

## PART 3: UI GUIDANCE LAYER (Voice-Guided Navigation)

### 3.1 Page Map API

Every PAF page registers itself with Shadow so it knows what's on screen and what actions are available. This is the foundation for voice-driven UI control.

```typescript
// Every page component registers with Shadow on mount
interface PageMap {
  pageId: string;              // 'finance.invoices'
  title: string;               // 'Invoices'
  description: string;         // 'Manage accounts receivable'

  // What's visible on screen right now
  visibleObjects: VisibleObject[];

  // What actions the user can take
  availableActions: PageAction[];

  // Current filters/state
  activeFilters: Record<string, string>;
  activeEntity: string;
}

interface VisibleObject {
  id: string;                  // 'inv-042'
  type: string;                // 'invoice'
  label: string;               // 'INV-042 — Oak Valley SNF — $4,200'
  status?: string;             // 'overdue'
  priority?: string;           // 'high'
  selector: string;            // CSS selector for UI highlighting
  deepLink: string;            // '/finance/invoices/inv-042'
}

interface PageAction {
  id: string;                  // 'create_invoice'
  label: string;               // 'Create new invoice'
  shortcut?: string;           // 'Ctrl+N'
  voiceTriggers: string[];     // ['create invoice', 'new invoice', 'add invoice']
  requiredFields?: FormField[];// fields if this opens a form
  confirmationLevel: 'none' | 'tap' | 'confirm_phrase' | 'voice_pin';
  reversible: boolean;
  blastRadius: 'self' | 'entity' | 'external'; // who's affected
  handler: () => void;         // function to execute
}

interface FormField {
  id: string;                  // 'client_name'
  label: string;               // 'Client'
  type: string;                // 'search_dropdown'
  required: boolean;
  voiceHint: string;           // "Who is this invoice for?"
  currentValue?: any;
}

// Registration (called in useEffect of each page)
useEffect(() => {
  shadowAgent.registerPage({
    pageId: 'finance.invoices',
    title: 'Invoices',
    visibleObjects: invoices.map(inv => ({
      id: inv.id,
      label: `${inv.number} — ${inv.client} — $${inv.amount}`,
      status: inv.status,
      selector: `#invoice-${inv.id}`,
      deepLink: `/finance/invoices/${inv.id}`
    })),
    availableActions: [
      {
        id: 'create_invoice',
        label: 'Create new invoice',
        voiceTriggers: ['create invoice', 'new invoice'],
        confirmationLevel: 'none',
        reversible: true,
        blastRadius: 'self',
        handler: () => openCreateModal()
      },
      {
        id: 'send_reminder',
        label: 'Send payment reminder',
        voiceTriggers: ['remind', 'send reminder', 'follow up'],
        confirmationLevel: 'confirm_phrase',
        reversible: false,
        blastRadius: 'external',
        handler: (invoiceId) => sendReminder(invoiceId)
      }
    ]
  });
}, [invoices]);
```

### 3.2 Guided Walkthrough Mode

Shadow can visually guide users through any page, highlighting UI elements and explaining what they do. Triggered by asking "How do I..." or "Walk me through..."

```
User: "Walk me through sending a payment reminder"

Shadow (voice + UI):
"Sure. I'll walk you through it.

Step 1: You're on the Finance page. I'm highlighting the
Invoices card. Tap it or say 'open invoices'."
-> UI: Invoices card pulses with blue highlight + tooltip

User: "Open invoices" (or taps)
-> Navigates to Invoices sub-page

Shadow: "Great. Now I can see INV-042 is overdue. I'm
highlighting it. Tap it or say 'select INV-042'."
-> UI: INV-042 row highlighted

User: "Select it"
-> Opens invoice detail

Shadow: "Here's the invoice. To send a reminder, tap the
'Send Reminder' button, or I can do it for you right now.
What do you prefer?"
-> UI: Send Reminder button highlighted

User: "You do it"

Shadow: "This will email Oak Valley SNF's accounts payable.
Say 'confirm send' to proceed."

User: "Confirm send"

Shadow: "Done. Payment reminder sent to Oak Valley. I've
also set a follow-up for 3 days from now. Anything else?"

UI HIGHLIGHTING SYSTEM:
- Pulsing blue border around target element
- Dark overlay on rest of page (spotlight effect)
- Tooltip arrow pointing to element with Shadow's instruction
- "Next" / "Skip" / "Do it for me" floating buttons
- Works on web (CSS overlays) and mobile (native highlights)
```

### 3.3 Voice Form-Fill

Shadow can fill out any form via voice, asking only for missing required fields.

```
User: "Create a task: call Oak Valley about overdue invoice,
       due tomorrow 10am, assign to me"

Shadow parses:
- Title: "Call Oak Valley about overdue invoice" ✅
- Due date: tomorrow 10am ✅
- Assignee: user (me) ✅
- Entity: ? (missing — infer from "Oak Valley" -> MedLink)
- Priority: ? (missing)

Shadow: "Got it. Creating the task. I'm guessing this is
MedLink since Oak Valley is a MedLink client. What priority —
high, medium, or low?"

User: "High"

Shadow: "Done. Task created:
'Call Oak Valley about overdue invoice'
Due: Feb 23, 10:00 AM │ Priority: High │ Entity: MedLink
[View task]"

FORM-FILL RULES:
- Pre-fill everything that can be inferred from context
- Ask only for REQUIRED fields that can't be inferred
- Ask one question at a time (never a list of 5 blanks)
- Entity inference: match keywords to contacts/entities in system
- Date inference: "tomorrow", "next week", "Friday" -> exact dates
- Allow corrections: "Actually make that medium priority"
```

---

## PART 4: "TALK ME THROUGH IT" (Notification Coaching)

### 4.1 Universal Action on Notifications

Every P0 and P1 notification in PAF gets a "Talk me through this" button. This is the signature feature that makes Shadow feel like a real assistant.

```
NOTIFICATION CARD (appears anywhere: dashboard, inbox, notifications panel):
┌──────────────────────────────────────────────────────────────┐
│ 🔴 P0: HCQC Compliance Deadline in 3 Days                   │
│ Your nursing pool licensing renewal package is due Feb 25.   │
│ Required: updated staff roster + TB clearance records.       │
│                                                              │
│ [📋 View details] [✅ Mark handled]                          │
│ [📞 Talk me through this]  <- THE KEY FEATURE               │
└──────────────────────────────────────────────────────────────┘

When user taps "📞 Talk me through this":

IF user is in-app (web/mobile):
-> Instant Voice Session starts
-> Shadow speaks: "Let's handle the HCQC deadline together.
   Here's the situation: your licensing renewal is due in 3 days.
   They need two things — the updated staff roster and TB clearance
   records. I've already checked: the HCQC compliance workflow has
   both documents ready. Want me to send them now, or do you want
   to review first?"

IF user is away/offline:
-> Shadow calls user's phone
-> Same conversational guidance
-> SMS fallback if no answer

COACHING BEHAVIOR:
Shadow doesn't just read the notification — it:
1. Explains the situation in plain language
2. Shows what's already been done (workflows, drafts)
3. Presents options with clear consequences
4. Recommends an action based on context
5. Executes on verbal approval
6. Confirms and schedules follow-up
```

### 4.2 Context-Rich Coaching Examples

```
─── OVERDUE INVOICE ───
📞 "Oak Valley's invoice is 5 days overdue — this is the third
time they've been late. Last time it took a phone call to get
payment. I recommend we skip the email reminder and go straight
to a VoiceForge call to their AP department. Want me to place
that call now?"

─── WORKFLOW FAILURE ───
📞 "The weekly compliance check workflow failed at step 3 — it
couldn't verify two nurses' TB clearance dates because the records
are expired. I've identified the nurses: Maria Santos and James
Park. I can have VoiceForge call them to get updated clearance
dates, or I can flag this for Sarah to handle. Which do you prefer?"

─── CALENDAR CONFLICT ───
📞 "You have a conflict tomorrow at 2pm: your weekly review overlaps
with Dr. Martinez's rescheduled appointment. Martinez is a priority
contact for MedLink. I'd recommend moving the weekly review to 3pm —
everyone else is available then. Should I make that switch?"

─── CRISIS ALERT ───
📞 "This is urgent. A potential data breach was detected 5 minutes
ago. I've already activated the war room, surfaced the incident
response playbook, and notified your CTO and security lead. The
playbook says step 1 is isolating the affected system. Want me to
walk you through the breach response step by step?"

─── CASH FLOW WARNING ───
📞 "Your 90-day cash flow forecast shows a potential shortfall in
April if the telehealth contract doesn't renew. You'd need about
$8,000 extra monthly revenue to stay healthy. Two options: I can
draft a contract renewal proposal for telehealth, or we can look
at new facility contracts from your pipeline. What's your thinking?"
```

---

## PART 5: WORKFLOW COMPANION MODE

### 5.1 Formal Step-by-Step Voice Guidance

When Shadow walks you through a workflow, it enters "Companion Mode" — a structured voice experience that guides you through each step like a co-pilot reading a checklist.

```
ACTIVATION:
- "Shadow, walk me through the HCQC compliance workflow"
- Clicking "📞 Talk me through this" on a workflow notification
- Shadow suggests: "The compliance check is due. Want me to walk
  you through it?"

─── COMPANION MODE SESSION ───

Shadow: "Entering Companion Mode. We're running the HCQC Compliance
Pack workflow. 7 steps total. Estimated time: 12 minutes.

Step 1 of 7: VERIFY STAFF ROSTER
I need to verify all active nurses have current credentials.
I've already pulled the roster — 15 nurses active.

13 are fully verified. ✅
2 need attention: Maria Santos (TB expired) and James Park
(BLS cert expired 2 weeks ago).

Three options:
A) I handle it — VoiceForge calls Maria and James to get updates
B) You handle it — I'll create tasks for you
C) Delegate — I'll assign to Sarah

Which one?"

User: "A, you handle it"

Shadow: "Got it. I'm scheduling VoiceForge calls to both.
Maria: 702-555-0199, James: 702-555-0201.
I'll update you when done. Moving to step 2.

Step 2 of 7: COMPILE TB CLEARANCE RECORDS
All TB records are current except Maria's, which depends on
step 1. I'll proceed with the 14 verified records and add
Maria's once VoiceForge confirms. Automatic. Moving on.

Step 3 of 7: GENERATE SUBMISSION PACKAGE
Creating the HCQC submission package with staff roster,
TB records, and licensing documentation...
Package generated. ✅

Step 4 of 7: REVIEW PACKAGE
I've created the package. It's 24 pages. Want me to:
A) Summarize the key sections
B) Open it for your review
C) Skip review — you trust the automated check"

...continues through all 7 steps...

Shadow: "Companion Mode complete. All 7 steps finished.
Summary:
- Package submitted to HCQC ✅
- 2 VoiceForge calls pending (Maria, James)
- Follow-up set for Feb 26 to confirm receipt
- Total time: 8 minutes (4 minutes saved vs manual)

Want me to send you a summary by email?"
```

### 5.2 Companion Mode State Management

```
During Companion Mode, Shadow tracks:
{
  workflow_id: "hcqc-compliance-pack",
  workflow_name: "HCQC Compliance Pack",
  total_steps: 7,
  current_step: 3,
  step_status: [
    { step: 1, status: "complete", decision: "ai_handle", duration: 45 },
    { step: 2, status: "complete", decision: "automatic", duration: 12 },
    { step: 3, status: "in_progress" },
    ...
  ],
  pending_actions: [
    { type: "voiceforge_call", target: "Maria Santos", status: "scheduled" },
    { type: "voiceforge_call", target: "James Park", status: "scheduled" }
  ],
  blocked_by: [],
  time_started: "2026-02-22T14:30:00Z",
  estimated_remaining: "4 minutes"
}

USER CAN:
- "Skip this step" -> Shadow notes skipped, moves forward
- "Pause" -> Shadow saves state, resumes later (even on different channel)
- "Go back to step 2" -> Shadow returns to a previous step
- "Just finish it" -> Shadow auto-completes remaining steps with defaults
- "What step are we on?" -> Shadow recaps progress
- "Let me do this one manually" -> Shadow waits, marks complete on return
```

---

## PART 6: VOICE SAFETY & APPROVALS

### 6.1 UI Action Safety Layer

Every action Shadow can take has a safety classification. This prevents accidental or harmful actions during fast voice conversations.

```typescript
interface ActionSafety {
  // How risky is this action?
  confirmationLevel: 'none' | 'tap' | 'confirm_phrase' | 'voice_pin';

  // Can it be undone?
  reversible: boolean;

  // Who's affected?
  blastRadius: 'self' | 'entity' | 'external' | 'public';

  // How many people?
  affectedCount?: number;

  // Does it cost money?
  financialImpact?: number;
}

// EXAMPLES:
const actionSafetyMap = {
  // LOW RISK — no confirmation needed
  navigate_page:         { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
  read_data:             { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
  create_task:           { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
  draft_email:           { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
  classify_email:        { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
  search_knowledge:      { confirmationLevel: 'none', reversible: true, blastRadius: 'self' },

  // MEDIUM RISK — tap or verbal confirm
  send_email_single:     { confirmationLevel: 'confirm_phrase', reversible: false, blastRadius: 'external', affectedCount: 1 },
  modify_calendar:       { confirmationLevel: 'tap', reversible: true, blastRadius: 'entity' },
  complete_task:         { confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },
  trigger_workflow:      { confirmationLevel: 'confirm_phrase', reversible: false, blastRadius: 'entity' },
  create_invoice:        { confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },

  // HIGH RISK — require "CONFIRM [action]" or voice PIN
  send_email_bulk:       { confirmationLevel: 'voice_pin', reversible: false, blastRadius: 'external', affectedCount: 50 },
  place_voiceforge_call: { confirmationLevel: 'confirm_phrase', reversible: false, blastRadius: 'external' },
  send_invoice:          { confirmationLevel: 'confirm_phrase', reversible: false, blastRadius: 'external' },
  declare_crisis:        { confirmationLevel: 'voice_pin', reversible: false, blastRadius: 'entity' },
  delete_data:           { confirmationLevel: 'voice_pin', reversible: false, blastRadius: 'self' },
  make_payment:          { confirmationLevel: 'voice_pin', reversible: false, blastRadius: 'external' },
  activate_phone_tree:   { confirmationLevel: 'voice_pin', reversible: false, blastRadius: 'external' },
};
```

### 6.2 Confirmation Flows

```
─── LEVEL: NONE ───
Shadow just does it.
"Created a task: 'Call Oak Valley'. ✅"

─── LEVEL: TAP ───
Shadow shows action card with button.
"I'll modify tomorrow's 2pm meeting. [✅ Approve] [❌ Cancel]"
On phone: "Say 'yes' or 'no' to confirm."

─── LEVEL: CONFIRM_PHRASE ───
Shadow requires a specific spoken phrase.
"This will send a payment reminder to Oak Valley SNF.
Say 'confirm send' to proceed."

Accepted: "confirm send", "confirmed", "yes send it"
Rejected: "cancel", "no", "wait", "stop"

─── LEVEL: VOICE_PIN ───
Shadow requires the user's configured PIN (4-6 digits).
"This will declare a crisis and activate the phone tree,
notifying 3 people. Enter your PIN or say your PIN digits."

User: "seven two four one"
Shadow: "Confirmed. Crisis declared. War room activated."

BLAST RADIUS CALLOUTS (always announced before confirmation):
Shadow: "Heads up — this will email 50 recipients at once."
Shadow: "This will cost approximately $45 in VoiceForge calls."
Shadow: "This triggers the phone tree — 3 people will be called."
Shadow: "This deletes 142 records. This cannot be undone."
```

### 6.3 Voice Safety Configuration

```sql
CREATE TABLE shadow_safety_config (
  user_id UUID PRIMARY KEY,
  voice_pin VARCHAR(10),           -- encrypted 4-6 digit PIN
  require_pin_for_financial BOOLEAN DEFAULT true,
  require_pin_for_external_comms BOOLEAN DEFAULT false, -- upgrades external sends to PIN
  require_pin_for_crisis BOOLEAN DEFAULT true,
  max_blast_radius_without_pin INTEGER DEFAULT 5,  -- auto-requires PIN if >5 affected
  phone_confirmation_mode VARCHAR(20) DEFAULT 'confirm_phrase', -- tap not available on phone
  always_announce_blast_radius BOOLEAN DEFAULT true
);
```

---

## PART 7: BARGE-IN & INTERRUPTION HANDLING

### 7.1 Barge-In (User Interrupts Shadow)

Shadow supports natural interruption — just like talking to a real person.

```
BEHAVIOR:
- Shadow is speaking: "You have 3 meetings today. First is the—"
- User cuts in: "Stop. What about the invoice?"
- Shadow immediately stops speaking
- Shadow acknowledges the interrupt: "Got it. Let me pull up
  the invoice."
- Shadow resumes with new context, doesn't repeat old content

TECHNICAL:
- Voice Activity Detection (VAD) monitors user's mic during Shadow speech
- When user speech detected: immediately stop TTS output
- Buffer last 2 seconds of user audio for intent classification
- Shadow's response references what it was saying if relevant

EXAMPLES:
Shadow: "I've drafted a reply to Dr. Martinez—"
User: "Wait, make it more formal."
Shadow: "Sure. I'll adjust the tone. Here's the updated draft..."

Shadow: "Step 4 involves reviewing the compliance pack—"
User: "Skip it. Move to step 5."
Shadow: "Skipping step 4. Step 5: submit the package to HCQC..."

Shadow: "Your options are: A, send a reminder—"
User: "B."
Shadow: "Option B it is. Placing the VoiceForge call now."
```

### 7.2 Pause & Resume

```
User: "Pause" / "Hold on" / "Give me a second"
Shadow: "Take your time. I'm here when you're ready."
-> Session state saved, timer paused
-> Shadow stays quiet until user speaks again

User: "Okay, continue"
Shadow: "Where we left off: we were on step 3 of the compliance
workflow. The package is ready for review. Want me to continue?"

AUTOMATIC RESUME (if idle > 2 minutes during active task):
Shadow: "Hey Ivan, still there? We're on step 3 of the compliance
workflow. Want to continue or should I pause this for later?"
```

---

## PART 8: AMBIENT SIDEKICK MODE

### 8.1 Background Presence

Sidekick Mode keeps Shadow quietly available without being intrusive. Shadow listens but only speaks when something important happens or the user addresses it.

```
ACTIVATION:
- Toggle in Shadow widget: [🟢 Sidekick: ON]
- "Shadow, go into sidekick mode"
- Auto-activates during focus blocks (from Attention Governor)

BEHAVIOR:
Shadow stays silent UNLESS:
1. User addresses Shadow ("Hey Shadow..." / presses 🎤)
2. P0 notification arrives (respects Attention Governor budget)
3. Scheduled event triggers (briefing time, meeting prep)
4. Workflow needs approval (pending action timeout)

VISUAL INDICATOR:
- Small green dot on Shadow bubble = Sidekick active
- Pulses briefly when Shadow "notices" something but doesn't interrupt
- User can hover/tap the pulse to see what Shadow noticed

WHAT SHADOW NOTICES (silently, for later):
Shadow: [queued] "You spent 45 min on that email thread.
Want me to draft the response next time?"

Shadow: [queued] "Sarah updated the Oak Valley task —
they confirmed payment by Friday."

Shadow: [queued] "Your 3pm meeting was cancelled by
Dr. Kim. You now have a free block."

-> These queue up as "Shadow observations" in the widget.
  User can expand them anytime or ask "What did you notice?"
```

### 8.2 Smart Interruption Logic

```
Sidekick uses Attention Governor to decide when to speak:

CHECK BEFORE INTERRUPTING:
1. Is attention budget available? (if not -> queue)
2. Is DND active? (if yes -> only P0 with VIP breakthrough)
3. Is user in focus block? (if yes -> only P0 + crisis)
4. Is user mid-sentence? (if yes -> wait until natural pause)
5. Has user dismissed similar notifications recently? (if yes -> queue)

IF INTERRUPT JUSTIFIED:
Shadow: [gentle audio chime]
"Quick heads up — HCQC just emailed about your deadline.
Want me to handle it or tell you later?"

USER RESPONSE OPTIONS:
- "Handle it" -> Shadow takes action
- "Tell me later" -> queued for next briefing/check-in
- "Not now" -> silence, add to queued observations
- [No response in 10 sec] -> queued silently
```

---

## PART 9: PROACTIVE INTELLIGENCE (Enhanced)

### 9.1 Morning Briefing

Configurable: time, delivery method, content.

```
DEFAULT: 8:00 AM, in-app + optional phone call

Shadow (voice):
"Good morning, Ivan. It's Monday, February 23rd. Here's your day:

📅 CALENDAR: 4 meetings. First at 9am. Your 2pm with Dr. Martinez
   has no prep pack — should I generate one?

📥 INBOX: 23 new overnight. 1 urgent from HCQC. 8 need replies.
   14 FYI. I've drafted responses for the 8.

✅ TASKS: 2 overdue — both delegated to Sarah, no update in 3 days.
   5 due today. Nothing blocked.

💰 FINANCE: Cash flow positive. Oak Valley paid! $4,200 received
   this morning. Monthly SaaS at $1,240 of $1,500 budget.

⚡ ENERGY: Based on 7.5h sleep, your peak hours are 9-11am.
   I've front-loaded complex tasks.

My recommendations:
1. Handle the HCQC email first — deadline in 2 days
2. Message Sarah about overdue tasks
3. Review and approve the 8 draft responses

What would you like to tackle first?"
```

### 9.2 Proactive Calling Rules (Anti-Spam)

```sql
CREATE TABLE shadow_proactive_config (
  user_id UUID PRIMARY KEY,

  -- Morning briefing
  briefing_enabled BOOLEAN DEFAULT true,
  briefing_time TIME DEFAULT '08:00',
  briefing_channel VARCHAR(20) DEFAULT 'in_app', -- in_app, phone, both
  briefing_content JSONB, -- which sections to include

  -- Call triggers
  call_on_p0 BOOLEAN DEFAULT true,
  call_on_crisis BOOLEAN DEFAULT true,
  call_on_workflow_block BOOLEAN DEFAULT true,
  call_on_overdue_24h BOOLEAN DEFAULT false,
  call_on_daily_briefing BOOLEAN DEFAULT false,
  call_on_eod_summary BOOLEAN DEFAULT false,

  -- VIP breakout (always call regardless of DND/quiet hours)
  vip_contacts JSONB,      -- contact IDs that always break through
  vip_keywords TEXT[],      -- keywords in emails that always break through

  -- Anti-spam protections
  call_window_start TIME DEFAULT '09:00',
  call_window_end TIME DEFAULT '18:00',
  call_window_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- Mon-Fri
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  quiet_hours_emergency_override BOOLEAN DEFAULT true, -- P0+crisis bypass

  -- Cooldowns
  min_minutes_between_calls INTEGER DEFAULT 30,
  max_calls_per_day INTEGER DEFAULT 5,
  max_calls_per_hour INTEGER DEFAULT 2,

  -- Digest option
  digest_call_enabled BOOLEAN DEFAULT false,  -- batch items into one call
  digest_call_time TIME DEFAULT '12:00',      -- when to make digest call
  digest_min_items INTEGER DEFAULT 3,         -- min items to trigger digest

  -- Escalation
  escalation_attempts INTEGER DEFAULT 3,
  escalation_interval_minutes INTEGER DEFAULT 15,
  escalation_fallback VARCHAR(20) DEFAULT 'sms' -- sms, phone_tree, none
);
```

### 9.3 Escalation Protocol (Enhanced)

```
ESCALATION LADDER (when Shadow needs to reach user):

Attempt 1: In-app notification + push notification
  Wait: 5 minutes

Attempt 2: Phone call
  If answered -> deliver message
  If voicemail -> leave summary + send SMS
  Wait: 15 minutes

Attempt 3: SMS with action links
  "⚠ Shadow: HCQC deadline in 24h. Compliance pack ready.
  Reply SEND to submit, or CALL for walkthrough."
  Wait: 15 minutes

Attempt 4: Second phone call
  Wait: 15 minutes

Attempt 5 (crisis only): Activate phone tree
  -> Notifies configured escalation contacts

COOLDOWN RULES:
- Same trigger type: minimum 30 min between calls
- If user dismisses twice: don't call again for this item (SMS only)
- If user says "stop calling": add to do-not-call for 24h
- All escalation logged in shadow_outreach table
```

---

## PART 10: LATENCY, RELIABILITY & FALLBACKS

### 10.1 Latency Targets

```
VOICE PIPELINE TARGETS:
- Speech-to-text (Whisper): < 500ms
- Intent classification: < 100ms
- Tool execution: < 1000ms (API calls)
- Response generation: < 800ms (streaming start)
- Text-to-speech: < 300ms (first audio chunk)
- Total end-to-end: < 2 seconds (user finishes speaking -> Shadow starts speaking)

ACCEPTABLE DEGRADATION:
- < 2 sec: Feels instant ✅
- 2-4 sec: Feels natural (like thinking) ✅
- 4-6 sec: Shadow says "Let me check..." (filler)
- > 6 sec: Shadow says "This is taking a moment. Bear with me..."
- > 10 sec: Switch to text + loading indicator
```

### 10.2 Fallback Chain

```
IF voice pipeline is slow/offline:

IN-APP:
1. Try voice response (TTS)
2. If TTS fails -> display text response immediately
3. If STT fails -> "I couldn't hear that. Could you type it?"
4. If agent is down -> show cached last briefing + "Shadow is
   temporarily unavailable. Try again in a moment."

PHONE:
1. Try conversational voice
2. If latency > 4s -> use filler phrases while processing
3. If agent is down -> "I'm having trouble right now. Let me
   text you a summary instead." -> Send SMS
4. If Twilio is down -> SMS-only mode with action links

MOBILE:
1. Try in-app voice
2. Fall back to text chat
3. If offline -> queue messages, show "Messages will send when
   you're back online"
4. Push notifications still work independently
```

### 10.3 Graceful Audio Handling

```
POOR CONNECTION:
Shadow detects audio quality degradation (packet loss, noise):
"It sounds like the connection is rough. Want me to switch to
text, or should I try calling your phone instead?"

BACKGROUND NOISE:
Shadow detects noise floor is high:
- Increases VAD sensitivity threshold
- Uses noise cancellation on user's input
- If still can't understand: "It's noisy on your end. I'll
  switch to text for now."

MULTI-SPEAKER:
Shadow detects multiple voices:
- Only respond to voice that matches user's voiceprint (if configured)
- If unsure: "I heard multiple people. Was that you, Ivan?"
```

---

## PART 11: SHADOW SETTINGS PAGE (Complete)

### 11.1 Sidebar Placement

```
Add to sidebar:

ASSISTANT
  └── Shadow   <- NEW (top-level section, not buried in PLATFORM)

Or alternatively, Shadow gets an always-visible icon in the
top navigation bar next to the notification bell:
[🔍 Search] ... [🔔] [🤖 Shadow] [+] [Avatar]
```

### 11.2 Full Settings Page

```
Route: /shadow (or /assistant/shadow)

┌──────────────────────────────────────────────────────────────┐
│ Shadow — Your AI Assistant                                   │
│ Configure how Shadow talks to you, when it reaches out,      │
│ and what it can do on its own.                               │
│                                                              │
│ Tabs: [ General | Voice & Phone | Proactive | Safety |       │
│         Permissions | History ]                              │
│                                                              │
│ ═══ GENERAL ═══                                              │
│                                                              │
│ ─── PERSONALITY ───                                          │
│ Assistant name:  [Shadow________]                            │
│ Tone:           [Professional-warm ▾]                        │
│ Verbosity:      [Concise ▾ | Normal | Detailed]              │
│ Proactivity:    [High ▾ | Medium | Low | Minimal]            │
│                                                              │
│ ─── IN-APP ───                                               │
│ Show floating bubble:    ☑ All pages                         │
│ Default input mode:      [Text ▾ | Voice]                    │
│ Auto-speak responses:    ☐ Only when I use voice             │
│ Wake word ("Hey Shadow"): ☐ Disabled                         │
│ Keyboard shortcut:       [Ctrl+Shift+S]                      │
│ Sidekick mode default:   ☑ On during focus blocks            │
│                                                              │
│ ═══ VOICE & PHONE ═══                                        │
│                                                              │
│ ─── VOICE ───                                                │
│ Voice persona:    [Professional Male ▾]                      │
│ Speech speed:     [Normal ▾]                                 │
│ Language:         [English (US) ▾]                            │
│ [🔊 Test voice]                                              │
│                                                              │
│ ─── PHONE ───                                                │
│ Shadow's number:  +1-702-555-7423 (555-SHAD)                 │
│ My phone number:  [+1-702-XXX-XXXX]                          │
│ Inbound calls:    ☑ Enabled                                  │
│ Outbound calls:   ☑ Enabled                                  │
│ Leave voicemail:  ☑ If I don't answer                        │
│ Record calls:     ☑ For review and training                  │
│ Auto-transcribe:  ☑ Save transcripts                         │
│ CarPlay/Bluetooth:☑ Enable hands-free                        │
│                                                              │
│ ═══ PROACTIVE ═══                                            │
│                                                              │
│ ─── MORNING BRIEFING ───                                     │
│ Enabled: ☑                                                   │
│ Time: [8:00 AM]                                              │
│ Delivery: [In-app ▾ | Phone call | Both]                     │
│ Include: ☑ Calendar ☑ Inbox ☑ Tasks ☑ Finance ☑ Energy      │
│                                                              │
│ ─── END-OF-DAY SUMMARY ───                                   │
│ Enabled: ☐                                                   │
│ Time: [6:00 PM]                                              │
│ Delivery: [In-app ▾]                                         │
│                                                              │
│ ─── PROACTIVE CALLS ───                                      │
│ Call me for:                                                 │
│ ☑ P0 urgent notifications                                   │
│ ☑ Crisis declarations                                        │
│ ☑ Workflow blocks needing my decision                        │
│ ☐ Overdue tasks past 24h                                     │
│ ☐ Daily briefing                                             │
│ ☐ End-of-day summary                                         │
│                                                              │
│ ─── CALL WINDOW ───                                          │
│ Active hours: [9:00 AM] to [6:00 PM]                        │
│ Days: ☑ Mon ☑ Tue ☑ Wed ☑ Thu ☑ Fri ☐ Sat ☐ Sun            │
│ Quiet hours: [10:00 PM] to [7:00 AM]                        │
│ Emergency override (P0 + crisis): ☑ Always break through    │
│                                                              │
│ ─── ANTI-SPAM ───                                            │
│ Min time between calls: [30 minutes]                         │
│ Max calls per day: [5]                                       │
│ Digest call: ☐ Batch items into one call at [12:00 PM]      │
│                                                              │
│ ─── VIP BREAKOUT ───                                         │
│ Always break through for:                                    │
│ Contacts: [Dr. Martinez ×] [Board Members ×] [+ Add]        │
│ Keywords: [HCQC ×] [emergency ×] [lawsuit ×] [+ Add]        │
│                                                              │
│ ═══ SAFETY ═══                                               │
│                                                              │
│ Voice PIN:      [****] [Change PIN]                          │
│ Require PIN for:                                             │
│   ☑ Financial actions (payments, high-value invoices)        │
│   ☑ Crisis declarations                                      │
│   ☐ External communications (emails, calls)                  │
│   ☑ Data deletion                                            │
│                                                              │
│ Auto-require PIN when:                                       │
│   Blast radius > [5] people                                  │
│   Financial impact > [$500]                                  │
│                                                              │
│ Always announce:                                             │
│   ☑ Number of people affected before sending                 │
│   ☑ Financial cost before executing                          │
│   ☑ Irreversibility warning before destructive actions       │
│                                                              │
│ ═══ PERMISSIONS ═══                                          │
│ (Links to Trust & Safety -> Permissions for full matrix)     │
│                                                              │
│ Shadow can do WITHOUT asking:                                │
│ ☑ Navigate UI / read all data                                │
│ ☑ Classify and triage                                        │
│ ☑ Draft (but not send)                                       │
│ ☑ Create tasks / knowledge entries                           │
│ ☐ Send emails (requires confirm)                             │
│ ☐ Place calls (requires confirm)                             │
│ ☐ Trigger workflows (requires confirm)                       │
│ ☐ Financial actions (requires PIN)                           │
│                                                              │
│ Autonomy level: [Ask before acting ▾]                        │
│ (Adoption journey upgrades this as trust builds)             │
│                                                              │
│ ═══ HISTORY ═══                                              │
│                                                              │
│ [🔍 Search conversations...]  [Channel ▾] [Date range]      │
│                                                              │
│ | Date | Channel | Duration | Messages | Summary |           │
│ | Feb 22 | Web voice | 5m | 12 | Morning priorities |       │
│ | Feb 22 | Phone | 3m | 8 | Oak Valley follow-up |          │
│ | Feb 21 | Web text | 2m | 6 | HCQC compliance check |     │
│                                                              │
│ Click -> full transcript + actions taken + audio playback    │
│                                                              │
│ ─── STATS ───                                                │
│ Total sessions: 47                                           │
│ Voice sessions: 23 (49%)                                     │
│ Phone calls: 8 (17%)                                         │
│ Actions executed: 134                                        │
│ Time saved this month: 12.4 hours                            │
│                                                              │
│ [📤 Export history] [🗑 Clear history]                        │
└──────────────────────────────────────────────────────────────┘
```

---

## PART 12: IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1-2)

```
DELIVER:
- Shadow Agent service (core runtime, intent classifier, tool router)
- Voice Session model + database tables
- In-app floating chat widget (text mode)
- WebSocket connection for real-time streaming
- Page Map API (register 5 core pages: Dashboard, Inbox, Tasks, Calendar, Finance)
- Basic tool access: navigate, read data, create tasks, draft emails
- Context engine: current page, active entity, user prefs

TEST: User can text-chat with Shadow, get answers about their data,
and have Shadow navigate the UI.
```

### Phase 2: Voice In-App (Week 3-4)

```
DELIVER:
- Whisper STT integration (real-time transcription)
- VoiceForge TTS output (Shadow speaks)
- Continuous conversation mode (no re-pressing)
- Barge-in support (interrupt Shadow mid-speech)
- Voice form-fill (create task/event/email by voice)
- UI highlighting system (guided walkthrough)
- Page Map registration for ALL pages

TEST: User can have a full voice conversation with Shadow in the browser.
Shadow can walk user through any page with visual highlights.
```

### Phase 3: Intelligence + Safety (Week 5-6)

```
DELIVER:
- Full module tool access (all PAF APIs wired)
- Action cards (approve/reject/navigate inline in chat)
- Multi-turn conversation with session memory
- UI Action Safety Layer (confirmation levels per action)
- Voice PIN system
- Blast radius announcements
- Morning briefing (in-app delivery)
- Sidekick Mode (ambient background)

TEST: User can execute complex multi-step tasks through voice.
Safety guardrails prevent accidental high-impact actions.
```

### Phase 4: Phone + Proactive (Week 7-8)

```
DELIVER:
- Twilio inbound (user calls Shadow's number)
- Twilio outbound (Shadow calls user)
- SMS fallback + confirmation links
- Voicemail detection + message leaving
- "Talk me through this" button on all P0/P1 notifications
- Workflow Companion Mode
- Proactive calling rules (triggers, cooldowns, call windows)
- VIP breakout + quiet hours
- Escalation protocol

TEST: Shadow can call user for important items. User can call Shadow
from any phone. Full Companion Mode walkthrough works over phone.
```

### Phase 5: Mobile + Polish (Week 9-10)

```
DELIVER:
- Mobile app Shadow tab (home, chat, call)
- Push notification integration (actionable)
- Home screen "Talk to Shadow" widget
- Channel handoff (web <-> phone <-> mobile)
- Background/CarPlay/Bluetooth support
- Shadow settings page (all tabs)
- Conversation history + search
- Session analytics (time saved, actions taken)
- Digest call option
- End-of-day summary

TEST: Full cross-channel experience. Start on web, continue on phone,
finish on mobile. All context preserved.
```

---

## PART 13: SUCCESS METRICS

```
ADOPTION:
- % of users who interact with Shadow daily
- Voice vs text interaction ratio
- Average session length
- Companion Mode completion rate
- "Talk me through this" click-through rate

EFFECTIVENESS:
- Tasks completed via Shadow vs manual
- Time saved per week (attributed to Shadow)
- Decision speed (time from notification -> action with Shadow vs without)
- Workflow completion time with Companion Mode vs manual

TRUST:
- Permission level progression (Ask -> Confirm -> Auto)
- Override rate (how often users change Shadow's suggestions)
- PIN-required actions approved vs rejected ratio
- Proactive call answer rate

SATISFACTION:
- Barge-in rate (lower = Shadow isn't rambling)
- "Not now" / dismiss rate on proactive items
- Unsubscribe rate from proactive calls
- Session rating (optional post-session thumbs up/down)
```
