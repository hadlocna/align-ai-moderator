const request = require('supertest');
const { app, AIAdvocate, AIModerator } = require('../ai-negotiation');

describe('AI API Interface Tests', () => {
    const mockUser1Data = {
        userName: 'Alice',
        inputs: {
            objectives: 'I want a fair split of household chores',
            mustHaves: 'No dishes every single day',
            constraints: 'Work long hours during week'
        }
    };
    
    const mockUser2Data = {
        userName: 'Bob', 
        inputs: {
            objectives: 'Need partner to take on more responsibilities',
            mustHaves: 'Dishes must be done every night',
            constraints: 'Kitchen cleanliness is non-negotiable'
        }
    };
    
    test('should return healthy status', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);
            
        expect(response.body.status).toBe('healthy');
        expect(response.body).toHaveProperty('openaiConfigured');
        expect(response.body).toHaveProperty('activeNegotiations');
    });
    
    test('should validate required fields for negotiation start', async () => {
        const response = await request(app)
            .post('/api/start-negotiation')
            .send({})
            .expect(400);
            
        expect(response.body.error).toBe('Missing required fields');
    });
    
    test('should validate sessionId field', async () => {
        const response = await request(app)
            .post('/api/start-negotiation')
            .send({
                topic: 'Test Topic',
                user1Data: mockUser1Data,
                user2Data: mockUser2Data
            })
            .expect(400);
            
        expect(response.body.error).toBe('Missing required fields');
    });
    
    test('should validate topic field', async () => {
        const response = await request(app)
            .post('/api/start-negotiation')
            .send({
                sessionId: 'test-123',
                user1Data: mockUser1Data,
                user2Data: mockUser2Data
            })
            .expect(400);
            
        expect(response.body.error).toBe('Missing required fields');
    });
    
    test('should validate user data fields', async () => {
        const response = await request(app)
            .post('/api/start-negotiation')
            .send({
                sessionId: 'test-123',
                topic: 'Test Topic',
                user1Data: mockUser1Data
                // Missing user2Data
            })
            .expect(400);
            
        expect(response.body.error).toBe('Missing required fields');
    });
    
    describe('AIAdvocate Class', () => {
        test('should create advocate with user data', () => {
            const advocate = new AIAdvocate('TestUser', {
                objectives: 'Test objective',
                mustHaves: 'Test requirement',
                constraints: 'Test constraint'
            }, 'Test Topic');
            
            expect(advocate.userName).toBe('TestUser');
            expect(advocate.objectives).toBe('Test objective');
            expect(advocate.mustHaves).toBe('Test requirement');
            expect(advocate.constraints).toBe('Test constraint');
            expect(advocate.topic).toBe('Test Topic');
            expect(advocate.negotiationHistory).toEqual([]);
        });
        
        test('should generate system prompt correctly', () => {
            const advocate = new AIAdvocate('Alice', mockUser1Data.inputs, 'Household Chores');
            const prompt = advocate.getSystemPrompt();
            
            expect(prompt).toContain('Alice');
            expect(prompt).toContain('Household Chores');
            expect(prompt).toContain(mockUser1Data.inputs.objectives);
            expect(prompt).toContain(mockUser1Data.inputs.mustHaves);
            expect(prompt).toContain(mockUser1Data.inputs.constraints);
        });
        
        test('should add entries to negotiation history', () => {
            const advocate = new AIAdvocate('TestUser', mockUser1Data.inputs, 'Test Topic');
            
            advocate.addToHistory('opponent', 'Opponent message');
            advocate.addToHistory('moderator', 'Moderator message');
            
            expect(advocate.negotiationHistory).toHaveLength(2);
            expect(advocate.negotiationHistory[0]).toEqual({ role: 'opponent', content: 'Opponent message' });
            expect(advocate.negotiationHistory[1]).toEqual({ role: 'moderator', content: 'Moderator message' });
        });
    });
    
    describe('AIModerator Class', () => {
        let advocate1, advocate2, moderator;
        
        beforeEach(() => {
            advocate1 = new AIAdvocate('Alice', mockUser1Data.inputs, 'Test Topic');
            advocate2 = new AIAdvocate('Bob', mockUser2Data.inputs, 'Test Topic');
            moderator = new AIModerator('Test Topic', advocate1, advocate2);
        });
        
        test('should create moderator with advocates', () => {
            expect(moderator.topic).toBe('Test Topic');
            expect(moderator.advocate1).toBe(advocate1);
            expect(moderator.advocate2).toBe(advocate2);
            expect(moderator.negotiationRounds).toEqual([]);
        });
        
        test('should generate system prompt correctly', () => {
            const prompt = moderator.getSystemPrompt();
            
            expect(prompt).toContain('Test Topic');
            expect(prompt).toContain('moderator');
            expect(prompt).toContain('fair');
            expect(prompt).toContain('agreement');
        });
        
        test('should track negotiation rounds', () => {
            const mockRound = {
                proposal1: 'Alice proposal',
                proposal2: 'Bob proposal', 
                moderation: 'Moderator response',
                timestamp: Date.now()
            };
            
            moderator.negotiationRounds.push(mockRound);
            
            expect(moderator.negotiationRounds).toHaveLength(1);
            expect(moderator.negotiationRounds[0]).toEqual(mockRound);
        });
        
        test('should generate backchannel insights', () => {
            moderator.negotiationRounds.push({
                proposal1: 'Alice proposal',
                proposal2: 'Bob proposal',
                moderation: 'This is a moderator response that should be truncated because it is longer than 150 characters and we want to test the substring functionality',
                timestamp: Date.now()
            });
            
            const insights = moderator.getBackchannelInsights();
            
            expect(insights).toHaveLength(1);
            expect(insights[0]).toContain('Round 1:');
            expect(insights[0].length).toBeLessThanOrEqual(153); // "Round 1: " + 150 + "..."
        });
    });
    
    test('should handle negotiation status endpoint for non-existent session', async () => {
        const response = await request(app)
            .get('/api/negotiation-status/non-existent-session')
            .expect(404);
            
        expect(response.body.error).toBe('Negotiation not found');
    });
    
    describe('Error Handling', () => {
        test('should handle OpenAI API errors gracefully', async () => {
            // This test will depend on OpenAI being available and configured
            // For now, we'll test the validation and structure
            const response = await request(app)
                .post('/api/start-negotiation')
                .send({
                    sessionId: 'test-error-123',
                    topic: 'Error Test Topic',
                    user1Data: mockUser1Data,
                    user2Data: mockUser2Data
                });
                
            // Should either succeed (if OpenAI is configured) or fail gracefully
            expect([200, 500]).toContain(response.status);
            
            if (response.status === 500) {
                expect(response.body).toHaveProperty('error');
                expect(response.body).toHaveProperty('message');
            } else {
                expect(response.body).toHaveProperty('success');
                expect(response.body).toHaveProperty('result');
            }
        });
        
        test('should handle malformed user input data', async () => {
            const response = await request(app)
                .post('/api/start-negotiation')
                .send({
                    sessionId: 'test-malformed-123',
                    topic: 'Malformed Test',
                    user1Data: {
                        userName: 'Alice'
                        // Missing inputs
                    },
                    user2Data: mockUser2Data
                });
                
            // Should fail due to missing inputs structure
            expect(response.status).toBe(500);
        });
    });
    
    describe('Integration Tests', () => {
        test('should maintain session state during negotiation', async () => {
            const sessionId = 'integration-test-' + Date.now();
            
            // Start negotiation
            const startResponse = await request(app)
                .post('/api/start-negotiation')
                .send({
                    sessionId,
                    topic: 'Integration Test Topic',
                    user1Data: mockUser1Data,
                    user2Data: mockUser2Data
                });
                
            // If OpenAI is configured, check status
            if (startResponse.status === 200) {
                const statusResponse = await request(app)
                    .get(`/api/negotiation-status/${sessionId}`)
                    .expect(200);
                    
                expect(statusResponse.body).toHaveProperty('status');
                expect(statusResponse.body).toHaveProperty('rounds');
            }
        });
    });
});