const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } }
  }));
});

process.env.OPENAI_API_KEY = 'test';

const { AIAdvocate, AIModerator } = require('../ai-negotiation');

describe('AI negotiation agents', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  test('AIAdvocate uses private inputs in system prompt', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'proposal' } }] });
    const advocate = new AIAdvocate(
      'Alice',
      { objectives: 'win', mustHaves: 'red lines', constraints: 'time' },
      'Salary'
    );

    await advocate.generateProposal();
    expect(mockCreate).toHaveBeenCalled();
    const call = mockCreate.mock.calls[0][0];
    const systemPrompt = call.messages[0].content;
    expect(systemPrompt).toContain('Alice');
    expect(systemPrompt).toContain('win');
    expect(systemPrompt).toContain('red lines');
    expect(systemPrompt).toContain('time');
  });

  test('AIModerator sees proposals from both advocates', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'moderated' } }] });
    const advocate1 = new AIAdvocate('Alice', { objectives: 'o1', mustHaves: 'm1', constraints: 'c1' }, 'Topic');
    const advocate2 = new AIAdvocate('Bob', { objectives: 'o2', mustHaves: 'm2', constraints: 'c2' }, 'Topic');
    const moderator = new AIModerator('Topic', advocate1, advocate2);

    await moderator.moderateRound('proposal from Alice', 'proposal from Bob');
    expect(mockCreate).toHaveBeenCalled();
    const call = mockCreate.mock.calls[0][0];
    const context = call.messages[1].content;
    expect(context).toContain('proposal from Alice');
    expect(context).toContain('proposal from Bob');
    expect(moderator.negotiationRounds).toHaveLength(1);
  });
});
