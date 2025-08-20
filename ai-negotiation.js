// AI Negotiation Backend API
// This handles the secure AI-to-AI negotiation process

const OpenAI = require('openai');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize OpenAI client (will need API key)
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

// In-memory storage for active negotiations (in production, use Redis)
const activeNegotiations = new Map();

class AIAdvocate {
    constructor(userName, userInputs, topic) {
        this.userName = userName;
        this.objectives = userInputs.objectives;
        this.mustHaves = userInputs.mustHaves;
        this.constraints = userInputs.constraints;
        this.topic = topic;
        this.negotiationHistory = [];
    }

    getSystemPrompt() {
        return `You are an AI advocate representing ${this.userName} in a private negotiation about: "${this.topic}".

YOUR CLIENT'S PRIVATE INFORMATION (CONFIDENTIAL):
- Ideal outcome: ${this.objectives}
- Non-negotiable requirements (red lines): ${this.mustHaves}
- Constraints/facts: ${this.constraints}

YOUR ROLE:
1. Advocate for your client's best interests
2. Never reveal their private details directly 
3. Find creative solutions that meet their needs
4. Be collaborative while protecting their interests
5. Only share what's necessary to reach agreement

COMMUNICATION STYLE:
- Professional but approachable
- Focus on finding mutual benefit
- Propose specific, actionable solutions
- Ask clarifying questions when needed

Remember: The other party has their own AI advocate. Work together to find a solution that works for both sides.`;
    }

    async generateProposal(context = '') {
        if (!openai) {
            throw new Error('OpenAI API not configured');
        }

        const prompt = context 
            ? `Based on the discussion so far: ${context}\n\nGenerate your next proposal or response:`
            : 'Generate your opening proposal for this negotiation:';

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 300,
                temperature: 0.7
            });

            const proposal = response.choices[0].message.content;
            this.negotiationHistory.push({ role: 'advocate', content: proposal });
            return proposal;
        } catch (error) {
            console.error('Error generating proposal:', error);
            throw error;
        }
    }

    addToHistory(role, content) {
        this.negotiationHistory.push({ role, content });
    }
}

class AIModerator {
    constructor(topic, advocate1, advocate2) {
        this.topic = topic;
        this.advocate1 = advocate1;
        this.advocate2 = advocate2;
        this.negotiationRounds = [];
    }

    getSystemPrompt() {
        return `You are an AI moderator facilitating a private negotiation about: "${this.topic}".

Your role is to:
1. Review proposals from both AI advocates
2. Identify areas of agreement and conflict
3. Suggest compromises and creative solutions
4. Guide the negotiation toward a fair resolution
5. Generate the final agreement when consensus is reached

Key principles:
- Be impartial and fair to both parties
- Look for win-win solutions
- Respect both parties' constraints
- Keep discussions productive and focused
- Synthesize the best elements from both sides

The negotiation should result in a specific, actionable agreement that both parties can accept.`;
    }

    async moderateRound(proposal1, proposal2) {
        if (!openai) {
            throw new Error('OpenAI API not configured');
        }

        const context = `
PROPOSAL FROM ${this.advocate1.userName}'s AI:
${proposal1}

PROPOSAL FROM ${this.advocate2.userName}'s AI:
${proposal2}

Please moderate this round by:
1. Identifying key points from each side
2. Finding areas of potential agreement
3. Suggesting next steps or compromises
4. Determining if we're ready for a final agreement
`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: context }
                ],
                max_tokens: 400,
                temperature: 0.3
            });

            const moderation = response.choices[0].message.content;
            this.negotiationRounds.push({
                proposal1,
                proposal2,
                moderation,
                timestamp: Date.now()
            });

            return moderation;
        } catch (error) {
            console.error('Error moderating round:', error);
            throw error;
        }
    }

    async generateFinalAgreement() {
        if (!openai) {
            throw new Error('OpenAI API not configured');
        }

        const negotiationSummary = this.negotiationRounds
            .map((round, index) => `Round ${index + 1}:\n- ${this.advocate1.userName}: ${round.proposal1}\n- ${this.advocate2.userName}: ${round.proposal2}\n- Moderator: ${round.moderation}`)
            .join('\n\n');

        const prompt = `Based on the complete negotiation below, generate a final agreement:

${negotiationSummary}

Please provide:
1. A clear, actionable final agreement in HTML format
2. A brief summary of how this agreement was reached (for transparency)

The agreement should be specific, fair, and implementable by both parties.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 600,
                temperature: 0.1
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error generating final agreement:', error);
            throw error;
        }
    }

    getBackchannelInsights() {
        return this.negotiationRounds.map((round, index) => 
            `Round ${index + 1}: ${round.moderation.substring(0, 150)}...`
        );
    }
}

// API Endpoints

app.post('/api/start-negotiation', async (req, res) => {
    try {
        const { sessionId, topic, user1Data, user2Data } = req.body;

        if (!sessionId || !topic || !user1Data || !user2Data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create AI advocates for both users
        const advocate1 = new AIAdvocate(user1Data.userName, user1Data.inputs, topic);
        const advocate2 = new AIAdvocate(user2Data.userName, user2Data.inputs, topic);
        
        // Create moderator
        const moderator = new AIModerator(topic, advocate1, advocate2);

        // Store negotiation session
        activeNegotiations.set(sessionId, {
            advocate1,
            advocate2,
            moderator,
            status: 'active',
            createdAt: Date.now()
        });

        // Start the negotiation process
        const result = await runNegotiation(sessionId);

        res.json({
            success: true,
            sessionId,
            result
        });

    } catch (error) {
        console.error('Error starting negotiation:', error);
        res.status(500).json({ 
            error: 'Negotiation failed to start',
            message: error.message 
        });
    }
});

async function runNegotiation(sessionId) {
    const negotiation = activeNegotiations.get(sessionId);
    if (!negotiation) {
        throw new Error('Negotiation session not found');
    }

    const { advocate1, advocate2, moderator } = negotiation;
    
    try {
        // Run 3-4 rounds of negotiation
        for (let round = 0; round < 3; round++) {
            // Get proposals from both advocates
            const context = round === 0 ? '' : `Previous rounds: ${JSON.stringify(moderator.negotiationRounds)}`;
            
            const proposal1 = await advocate1.generateProposal(context);
            const proposal2 = await advocate2.generateProposal(context);
            
            // Moderate the round
            const moderation = await moderator.moderateRound(proposal1, proposal2);
            
            // Add to advocate histories
            advocate1.addToHistory('opponent', proposal2);
            advocate1.addToHistory('moderator', moderation);
            advocate2.addToHistory('opponent', proposal1);
            advocate2.addToHistory('moderator', moderation);
            
            console.log(`Round ${round + 1} completed for session ${sessionId}`);
        }

        // Generate final agreement
        const finalAgreement = await moderator.generateFinalAgreement();
        const backchannelInsights = moderator.getBackchannelInsights();

        // Clean up session
        negotiation.status = 'completed';
        
        return {
            agreement: finalAgreement,
            backchannel: backchannelInsights,
            rounds: moderator.negotiationRounds.length
        };

    } catch (error) {
        negotiation.status = 'failed';
        throw error;
    }
}

app.get('/api/negotiation-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const negotiation = activeNegotiations.get(sessionId);
    
    if (!negotiation) {
        return res.status(404).json({ error: 'Negotiation not found' });
    }
    
    res.json({
        status: negotiation.status,
        rounds: negotiation.moderator.negotiationRounds.length
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        openaiConfigured: !!openai,
        activeNegotiations: activeNegotiations.size 
    });
});

// Cleanup old negotiations
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, negotiation] of activeNegotiations.entries()) {
        if (now - negotiation.createdAt > 7200000) { // 2 hours
            activeNegotiations.delete(sessionId);
            console.log(`Cleaned up old negotiation: ${sessionId}`);
        }
    }
}, 600000); // Every 10 minutes

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`AI Negotiation API running on port ${PORT}`);
    console.log(`OpenAI configured: ${!!openai}`);
});

module.exports = { AIAdvocate, AIModerator };