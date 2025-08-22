const WebSocket = require('ws');
const { server, wss, sessions } = require('../server');
const request = require('supertest');
const http = require('http');

describe('P2P Communication Tests', () => {
    let testServer;
    let wsClients = [];
    
    beforeAll((done) => {
        testServer = server.listen(0, () => {
            const port = testServer.address().port;
            console.log(`Test server running on port ${port}`);
            done();
        });
    });
    
    afterAll((done) => {
        // Close all WebSocket connections
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        testServer.close(done);
    });
    
    beforeEach(() => {
        // Clear sessions before each test
        sessions.clear();
        wsClients = [];
    });
    
    function createWebSocketConnection() {
        const port = testServer.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        wsClients.push(ws);
        return ws;
    }
    
    test('should establish WebSocket connection', (done) => {
        const ws = createWebSocketConnection();
        
        ws.on('open', () => {
            expect(ws.readyState).toBe(WebSocket.OPEN);
            done();
        });
        
        ws.on('error', done);
    });
    
    test('should create and join a session successfully', (done) => {
        const creator = createWebSocketConnection();
        const joiner = createWebSocketConnection();
        
        let creatorReady = false;
        let joinerReady = false;
        
        creator.on('open', () => {
            creator.send(JSON.stringify({
                type: 'create_session',
                sessionId: 'test-session-123',
                topic: 'Test Topic',
                userName: 'Alice'
            }));
        });
        
        creator.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'session_created') {
                creatorReady = true;
                // Now join with second client
                joiner.send(JSON.stringify({
                    type: 'join_session',
                    sessionId: 'test-session-123',
                    userName: 'Bob',
                    topic: 'Test Topic'
                }));
            }
            if (message.type === 'participant_joined' && message.userName === 'Bob') {
                expect(message.participantCount).toBe(2);
                if (creatorReady && joinerReady) done();
            }
        });
        
        joiner.on('open', () => {
            // Wait for creator to create session first
        });
        
        joiner.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'participant_joined' && message.userName === 'Bob') {
                joinerReady = true;
                if (creatorReady && joinerReady) done();
            }
        });
    });
    
    test('should relay messages between participants', (done) => {
        const creator = createWebSocketConnection();
        const joiner = createWebSocketConnection();
        
        let sessionReady = false;
        
        creator.on('open', () => {
            creator.send(JSON.stringify({
                type: 'create_session',
                sessionId: 'test-relay-123',
                topic: 'Message Relay Test',
                userName: 'Alice'
            }));
        });
        
        creator.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'session_created') {
                joiner.send(JSON.stringify({
                    type: 'join_session',
                    sessionId: 'test-relay-123',
                    userName: 'Bob',
                    topic: 'Message Relay Test'
                }));
            }
            if (message.type === 'participant_joined') {
                sessionReady = true;
                // Send test message
                creator.send(JSON.stringify({
                    type: 'relay_message',
                    messageType: 'topicModified',
                    content: {
                        type: 'topicModified',
                        topic: 'Updated Topic',
                        userName: 'Alice'
                    }
                }));
            }
        });
        
        joiner.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'message_received' && message.messageType === 'topicModified') {
                expect(message.content.topic).toBe('Updated Topic');
                expect(message.from).toBe('Alice');
                done();
            }
        });
    });
    
    test('should handle session recreation when session expires', (done) => {
        const joiner = createWebSocketConnection();
        
        joiner.on('open', () => {
            // Try to join non-existent session with topic (should recreate)
            joiner.send(JSON.stringify({
                type: 'join_session',
                sessionId: 'expired-session-123',
                userName: 'Bob',
                topic: 'Recreated Topic'
            }));
        });
        
        joiner.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'participant_joined') {
                expect(message.topic).toBe('Recreated Topic');
                expect(sessions.has('expired-session-123')).toBe(true);
                done();
            }
        });
    });
    
    test('should handle reconnection for existing participants', (done) => {
        const creator = createWebSocketConnection();
        
        creator.on('open', () => {
            creator.send(JSON.stringify({
                type: 'create_session',
                sessionId: 'reconnect-test-123',
                topic: 'Reconnection Test',
                userName: 'Alice'
            }));
        });
        
        creator.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'session_created') {
                // Close and reconnect
                creator.close();
                
                setTimeout(() => {
                    const reconnectedCreator = createWebSocketConnection();
                    
                    reconnectedCreator.on('open', () => {
                        reconnectedCreator.send(JSON.stringify({
                            type: 'create_session',
                            sessionId: 'reconnect-test-123',
                            topic: 'Reconnection Test',
                            userName: 'Alice'
                        }));
                    });
                    
                    reconnectedCreator.on('message', (reconnectData) => {
                        const reconnectMessage = JSON.parse(reconnectData);
                        if (reconnectMessage.type === 'session_created') {
                            // Should reconnect successfully
                            expect(reconnectMessage.sessionId).toBe('reconnect-test-123');
                            done();
                        }
                    });
                }, 100);
            }
        });
    });
    
    test('should clean up sessions when all participants leave', (done) => {
        const creator = createWebSocketConnection();
        
        creator.on('open', () => {
            creator.send(JSON.stringify({
                type: 'create_session',
                sessionId: 'cleanup-test-123',
                topic: 'Cleanup Test',
                userName: 'Alice'
            }));
        });
        
        creator.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'session_created') {
                expect(sessions.has('cleanup-test-123')).toBe(true);
                
                // Close connection
                creator.close();
                
                // Give time for cleanup
                setTimeout(() => {
                    expect(sessions.has('cleanup-test-123')).toBe(false);
                    done();
                }, 100);
            }
        });
    });
    
    test('should handle ping/pong for keep-alive', (done) => {
        const client = createWebSocketConnection();
        
        client.on('open', () => {
            client.send(JSON.stringify({
                type: 'ping'
            }));
        });
        
        client.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'pong') {
                done();
            }
        });
    });
    
    test('should limit sessions to 2 participants', (done) => {
        const creator = createWebSocketConnection();
        const joiner1 = createWebSocketConnection();
        const joiner2 = createWebSocketConnection();
        
        creator.on('open', () => {
            creator.send(JSON.stringify({
                type: 'create_session',
                sessionId: 'limit-test-123',
                topic: 'Limit Test',
                userName: 'Alice'
            }));
        });
        
        creator.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'session_created') {
                // First joiner should succeed
                joiner1.send(JSON.stringify({
                    type: 'join_session',
                    sessionId: 'limit-test-123',
                    userName: 'Bob',
                    topic: 'Limit Test'
                }));
            }
            if (message.type === 'participant_joined' && message.userName === 'Bob') {
                // Second joiner should fail
                joiner2.send(JSON.stringify({
                    type: 'join_session',
                    sessionId: 'limit-test-123',
                    userName: 'Charlie',
                    topic: 'Limit Test'
                }));
            }
        });
        
        joiner2.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'error' && message.message === 'Session is full') {
                done();
            }
        });
    });
});