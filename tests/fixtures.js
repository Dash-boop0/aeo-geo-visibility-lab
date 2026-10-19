// Small hand-built project used for hand-computed metric tests.
// Expected values are worked out in the comments of metrics.test.js.
export function fixtureProject() {
  return {
    id: 'p-fixture',
    name: 'Fixture (synthetic)',
    description: '',
    illustrative: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    brands: [
      { id: 'T', name: 'Target Co (fictional)', role: 'target', domains: ['t.example.com'], aliases: ['TargetCo'] },
      { id: 'C1', name: 'Rival One (fictional)', role: 'competitor', domains: ['c1.example.com'], aliases: [] },
      { id: 'C2', name: 'Rival Two (fictional)', role: 'competitor', domains: ['c2.example.org'], aliases: [] },
    ],
    questions: [
      { id: 'q1', text: 'Best tools for X?', intent: 'discovery', notes: '' },
      { id: 'q2', text: 'Target Co vs Rival One?', intent: 'comparison', notes: '' },
      { id: 'q3', text: 'How does X work?', intent: 'informational', notes: '' },
    ],
    observations: [
      obs('o1', 'q1', 'A', '2026-01-01', ['T', 'C1'], ['https://www.t.example.com/x', 'https://review.example.org/a']),
      obs('o2', 'q2', 'A', '2026-01-01', ['C1'], ['https://c1.example.com/p'], ['review.example.org']),
      obs('o3', 'q3', 'A', '2026-01-01', []),
      obs('o4', 'q1', 'B', '2026-01-01', ['T'], [], ['docs.t.example.com']),
      obs('o5', 'q1', 'A', '2026-02-01', ['T', 'C1', 'C2'], ['https://review.example.org/b', 'https://review.example.org/c']),
      obs('o6', 'q2', 'A', '2026-02-01', ['C2']),
    ],
  };
}

export function obs(id, questionId, platform, date, brandsMentioned, citedUrls = [], citedDomains = [], run = 1) {
  return {
    id, questionId, platform, date, run, prompt: 'p', settings: '', answerSummary: 's',
    brandsMentioned, citedUrls, citedDomains, notes: '',
  };
}
