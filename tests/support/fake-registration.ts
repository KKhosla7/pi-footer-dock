/** A registration written the way an extension author's tool would, from the document alone. */
export const registration = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  ext: 'acme',
  label: 'Acme',
  items: [
    {
      id: 'status',
      region: 'row2.right',
      at: {
        xl: { text: 'Acme: 3 jobs running', icon: 'dot', tone: 'success' },
        md: { text: '3 jobs', icon: 'dot', tone: 'success' },
        xs: 'hide',
      },
      clicks: { icon: 'event' },
      explain: {
        title: 'Acme jobs',
        reports: ['How many Acme jobs are running now.'],
        missingWhen: ['Acme is not running.'],
        blocks: [
          { kind: 'facts', rows: [{ label: 'Running', value: '3', tone: 'success' }] },
          { kind: 'meters', rows: [{ label: 'Load', fraction: 0.4, text: '40%' }] },
          { kind: 'table', head: ['Job', 'State'], rows: [['build', 'running']] },
          { kind: 'bullets', items: [{ term: 'build', text: 'compiling' }] },
        ],
      },
    },
    { id: 'quiet', region: 'row3.left', at: { xl: { text: 'a third row', tone: 'muted' } } },
  ],
  settings: {
    note: 'How Acme shows itself.',
    rows: [
      {
        id: 'mode',
        label: 'Mode',
        description: 'How much to say.',
        values: ['brief', 'full'],
        current: 'brief',
      },
    ],
  },
  ...extra,
});
