export interface WorkflowStep {
  step: string;
  title: string;
  description: string;
  accent: string;
  iconName: string;
}

export const workflowData = {
  eyebrow: 'THE INTELLIGENT FLOW',
  headline: 'From an idea to continuous growth.',
  subtext:
    'ThreadPilot combines AI, automation and intelligent analytics to help you show up consistently and get better over time.',
  steps: [
    {
      step: '01',
      title: 'Create',
      description: 'Turn your thoughts and outlines into high-signal drafts with guided AI assistance.',
      accent: '#FF7048',
      iconName: 'feather',
    },
    {
      step: '02',
      title: 'Personalize',
      description: 'Tailor drafts to mirror your authentic sentence structure, tone, and pacing.',
      accent: '#8B5CF6',
      iconName: 'fingerprint',
    },
    {
      step: '03',
      title: 'Schedule',
      description: 'Plan your calendar with intelligent publishing recommendations based on activity.',
      accent: '#00ADB5',
      iconName: 'calendar',
    },
    {
      step: '04',
      title: 'Publish',
      description: 'Post directly to Threads through official Meta Graph API OAuth with zero manual friction.',
      accent: '#A855F7',
      iconName: 'send',
    },
    {
      step: '05',
      title: 'Analyze',
      description: 'Track audience responses, reach patterns, and reply sentiment in real time.',
      accent: '#22D3EE',
      iconName: 'bar-chart',
    },
    {
      step: '06',
      title: 'Learn',
      description: 'Convert real-world feedback into continuous updates for your personal style model.',
      accent: '#84CC16',
      iconName: 'refresh-cw',
    },
  ] as WorkflowStep[],
};
