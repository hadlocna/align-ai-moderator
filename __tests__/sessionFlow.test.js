const { server, wss } = require('../server');
const WebSocket = require('ws');

const delay = ms => new Promise(res => setTimeout(res, ms));

describe('Negotiation session flow', () => {
  let port;

  beforeAll(done => {
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll(done => {
    wss.close(() => server.close(done));
  });

  test('two users can negotiate with topic edits and inputs', async () => {
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);

    const messages1 = [];
    const messages2 = [];
    ws1.on('message', data => messages1.push(JSON.parse(data)));
    ws2.on('message', data => messages2.push(JSON.parse(data)));

    await Promise.all([
      new Promise(res => ws1.on('open', res)),
      new Promise(res => ws2.on('open', res))
    ]);

    ws1.send(JSON.stringify({
      type: 'create_session',
      sessionId: 'test-session',
      topic: 'Initial Topic',
      userName: 'Alice'
    }));
    await delay(100);
    expect(messages1.find(m => m.type === 'session_created')).toBeDefined();

    ws2.send(JSON.stringify({
      type: 'join_session',
      sessionId: 'test-session',
      userName: 'Bob'
    }));
    await delay(100);
    expect(messages1.find(m => m.type === 'participant_joined' && m.userName === 'Bob')).toBeDefined();
    expect(messages2.find(m => m.type === 'participant_joined')).toBeDefined();

    ws1.send(JSON.stringify({
      type: 'relay_message',
      messageType: 'topicModified',
      content: {
        type: 'topicModified',
        topic: 'New Topic',
        userName: 'Alice'
      }
    }));
    await delay(100);
    expect(messages2.find(m => m.messageType === 'topicModified' && m.content.topic === 'New Topic')).toBeDefined();

    ws2.send(JSON.stringify({
      type: 'relay_message',
      messageType: 'topicAgreed',
      content: { type: 'topicAgreed', userName: 'Bob' }
    }));
    await delay(100);
    expect(messages1.find(m => m.messageType === 'topicAgreed')).toBeDefined();

    ws1.send(JSON.stringify({
      type: 'relay_message',
      messageType: 'userInputsSubmitted',
      content: {
        type: 'userInputsSubmitted',
        userName: 'Alice',
        inputs: { objectives: 'o1', mustHaves: 'm1', constraints: 'c1' }
      }
    }));
    await delay(100);
    expect(messages2.find(m => m.messageType === 'userInputsSubmitted' && m.content.userName === 'Alice')).toBeDefined();

    ws2.send(JSON.stringify({
      type: 'relay_message',
      messageType: 'userInputsSubmitted',
      content: {
        type: 'userInputsSubmitted',
        userName: 'Bob',
        inputs: { objectives: 'o2', mustHaves: 'm2', constraints: 'c2' }
      }
    }));
    await delay(100);
    expect(messages1.find(m => m.messageType === 'userInputsSubmitted' && m.content.userName === 'Bob')).toBeDefined();

    ws1.close();
    ws2.close();
  });
});
