'use client';

interface CommandCategory {
  name: string;
  commands: {
    phrase: string;
    description: string;
    examples: string[];
  }[];
}

const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    name: 'Task Management',
    commands: [
      {
        phrase: 'Add task [description]',
        description: 'Create a new task with optional due date and priority',
        examples: [
          'Add task review Q4 financials',
          'Create task send proposal by Friday',
        ],
      },
      {
        phrase: "What's next?",
        description: 'Show your next tasks and agenda items',
        examples: [
          "What's next?",
          'What should I work on?',
        ],
      },
      {
        phrase: 'Set reminder [description] [time]',
        description: 'Create a time-based reminder',
        examples: [
          'Set reminder to follow up Friday',
          'Remind me to call the plumber tomorrow at 9am',
        ],
      },
    ],
  },
  {
    name: 'Communication',
    commands: [
      {
        phrase: 'Draft email to [person] about [subject]',
        description: 'Compose an email draft for review',
        examples: [
          'Draft email to Bobby about the downtown project',
          'Email Dr. Martinez regarding test results',
        ],
      },
      {
        phrase: 'Call [person/place]',
        description: 'Initiate a VoiceForge call handoff',
        examples: [
          'Call the nursing facility',
          'Call Dr. Martinez',
        ],
      },
      {
        phrase: 'Create contact [name]',
        description: 'Add a new contact to your address book',
        examples: [
          'Create contact John Smith',
          'New contact Dr. Sarah Johnson',
        ],
      },
    ],
  },
  {
    name: 'Calendar',
    commands: [
      {
        phrase: 'Schedule meeting with [person] [time]',
        description: 'Book a meeting on your calendar',
        examples: [
          'Schedule meeting with Dr. Martinez tomorrow at 3pm',
          'Book a meeting with the team next Monday',
        ],
      },
    ],
  },
  {
    name: 'Finance',
    commands: [
      {
        phrase: 'Log expense [amount] for [category]',
        description: 'Record a business expense',
        examples: [
          'Log expense $45.50 for office supplies',
          'Add expense $120 for client lunch',
        ],
      },
    ],
  },
  {
    name: 'Navigation & Search',
    commands: [
      {
        phrase: 'Search for [query]',
        description: 'Search across your data',
        examples: [
          'Search for HIPAA compliance docs',
          "Find Bobby's contact info",
        ],
      },
      {
        phrase: 'Add note [content]',
        description: 'Capture a quick note',
        examples: [
          'Add note review compliance checklist before the audit',
          'Note to self check the parking lot drainage',
        ],
      },
      {
        phrase: 'Dictate',
        description: 'Start free-form dictation',
        examples: [
          'Dictate a memo to the team',
          'Start dictation for meeting notes',
        ],
      },
    ],
  },
];

export default function VoiceCommandList() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Voice Commands
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        Say any of these commands after activating the microphone or using the wake word.
      </p>

      <div className="space-y-6">
        {COMMAND_CATEGORIES.map((category) => (
          <div key={category.name}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              {category.name}
            </h3>
            <div className="space-y-3">
              {category.commands.map((cmd) => (
                <div
                  key={cmd.phrase}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="mb-1 font-mono text-sm font-medium text-blue-700">
                    &quot;{cmd.phrase}&quot;
                  </div>
                  <p className="mb-2 text-xs text-gray-600">{cmd.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cmd.examples.map((ex) => (
                      <span
                        key={ex}
                        className="rounded bg-white px-2 py-0.5 text-xs text-gray-500 ring-1 ring-gray-200"
                      >
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
