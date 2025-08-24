const { parseAgreementStructured, formatAgreementContent } = require('../agreement-parser');

describe('agreement-parser', () => {
  test('parses HTML code fence with numbered clauses and principles', () => {
    const raw = [
      '```html',
      '<h1>Final Topic Agreement</h1>',
      '<p><strong>1. Tonight\'s Responsibility:</strong> Nathan will handle the dishes tonight.</p>',
      '<p><strong>2. Balancing Contribution:</strong> Fab takes a heavier chore this week.</p>',
      '<h2>Guiding Principles</h2>',
      '<ul>',
      '  <li><strong>Fairness:</strong> Responsibilities are balanced.</li>',
      '  <li><strong>Cleanliness:</strong> Kitchen ends each night clean.</li>',
      '</ul>',
      '```',
      '',
      'Plain-text summary: Agreement balances tonight\'s work and future fairness.'
    ].join('\n');

    const { clauses, principles, summary } = parseAgreementStructured(raw);
    expect(clauses.length).toBe(2);
    expect(clauses[0]).toEqual({ number: 1, title: "Tonight's Responsibility", body: 'Nathan will handle the dishes tonight.' });
    expect(clauses[1].title).toBe('Balancing Contribution');
    expect(principles.length).toBe(2);
    expect(principles[0].label).toBe('Fairness');
    expect(summary).toMatch(/balances tonight's work/);
  });

  test('falls back to text parsing without HTML', () => {
    const raw = [
      'Final Topic Agreement',
      '1. Clause One: Do a thing.',
      '2. Clause Two: Do another thing.',
      'Guiding Principles',
      'Fairness: Balance the chores.',
      'Flexibility: Allow swaps when needed.',
      '',
      'Plain-text summary: Simple fair approach.'
    ].join('\n');

    const { clauses, principles, summary } = parseAgreementStructured(raw);
    expect(clauses.map(c => c.title)).toEqual(['Clause One', 'Clause Two']);
    expect(principles.map(p => p.label)).toEqual(['Fairness', 'Flexibility']);
    expect(summary).toBe('Simple fair approach.');
  });

  test('formatAgreementContent extracts HTML from fence and summary', () => {
    const raw = [
      '```html',
      '<h1>Final X Agreement</h1>',
      '<p><strong>1. A:</strong> B</p>',
      '```',
      '',
      'Plain-text summary: Hello world.'
    ].join('\n');

    const { html, summary } = formatAgreementContent(raw);
    expect(html).toMatch(/<h1>Final X Agreement<\/h1>/);
    expect(summary).toBe('Hello world.');
  });
});
