// AI Negotiation Backend API
// This handles the secure AI-to-AI negotiation process

require('dotenv').config();
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

// Allow configurable model; default to the latest GPT-5 chat model
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-chat-latest';

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
        return `You are an AI advocate speaking as ${this.userName} in a private negotiation about: "${this.topic}".

PRIVATE NOTES ABOUT YOUR SITUATION (CONFIDENTIAL):
- Ideal outcome: ${this.objectives}
- Non-negotiable requirements: ${this.mustHaves}
- Constraints/facts: ${this.constraints}

ROLE:
1. Represent ${this.userName}'s interests as if you are them
2. Never reveal these private notes directly or in backchannel insights
3. Use the notes only as context to craft proposals
4. Seek creative, mutually beneficial solutions while protecting what matters to you
5. Share only what is necessary to reach agreement

COMMUNICATION STYLE:
- Speak in first person ("I") as ${this.userName}
- Professional but approachable
- Focus on finding mutual benefit
- Propose specific, actionable solutions
- Ask clarifying questions when needed

Remember: The other party also has an AI advocate fighting hard for their person's perspective. Work together to find a solution acceptable to both sides.`;
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
                model: OPENAI_MODEL,
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
        return `You are an impartial AI moderator for a private negotiation about: "${this.topic}".

Two AI advocates are each arguing strongly from their person's perspective. Your job:
1. Review proposals from both advocates
2. Identify areas of agreement and conflict
3. Suggest compromises and creative solutions
4. Keep the conversation fair and productive
5. When consensus emerges, craft a final agreement that serves everyone's interests and summarize how it was reached

Key principles:
- Be neutral and fair to both parties
- Seek win-win outcomes
- Respect that advocates may hold private information; don't request or reveal it
- Focus only on what is shared in the conversation
- Synthesize the best elements from both sides

The negotiation should result in a clear, actionable agreement that both people can accept.`;
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
                model: OPENAI_MODEL,
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

        const prompt = `Based on the complete negotiation below, draft the final agreement.

${negotiationSummary}

Return results in TWO parts, in this exact order:

Return ONLY ONE fenced JSON block (\`\`\`json ... \`\`\`) containing exactly one JSON object with this schema (no prose before or after):
{
  "title": string,                          // Short title of the agreement
  "clauses": [ { "title": string, "text": string } ], // 3-7 clear, actionable clauses
  "principles": [ { "label": string, "text": string } ], // 3-6 guiding principles
  "summary": string,                        // 1–3 sentence plain-text summary
  "html": string,                           // OPTIONAL: concise HTML rendering (omit if risk of truncation)
  "analytics": {                            // Negotiation Intelligence Dashboard data
    "health": {
      "fairnessIndex": number,              // 0-100; estimate equality + procedural fairness markers
      "paretoEfficiency": number,           // 0-100; rough Pareto likelihood
      "nashScore": number,                  // 0-100; normalized Nash product proxy
      "claritySmart": number,               // 0-100; SMART/clarity score (who/what/when/if-then)
      "implementability": number,           // 0-100; based on if-then, reminders, review
      "objectiveCriteriaUsed": boolean      // reference to independent standards present
    },
    "interestsCoverage": {
      "user1": [ { "need": string, "type": "mustHave"|"preference", "coverage": "full"|"partial"|"none" } ],
      "user2": [ { "need": string, "type": "mustHave"|"preference", "coverage": "full"|"partial"|"none" } ],
      "tradeOffEfficiency": number          // 0-100; linkage and package trades
    },
    "processStyle": {
      "styleBlend": { "competing": number, "collaborating": number, "compromising": number, "avoiding": number, "accommodating": number },
      "lsmPercent": number,                 // 0-100; linguistic style matching
      "politeness": number,                 // 0-100
      "emotionTone": string                 // e.g., Neutral/Positive
    },
    "tacticsBias": {
      "firstOfferQuality": string,          // e.g., reasonable anchor / extreme anchor / range offer
      "hardballTags": string[],             // e.g., deadline, brinkmanship
      "objectiveCriteriaNotes": string
    },
    "concessions": {
      "narrative": string,                  // plain-language summary of concession dynamics
      "curvePoints": [ number ]             // optional; distance per round
    },
    "coach": {
      "strength": string,
      "opportunity": string,
      "suggestion": string
    },
    "participants": { "user1": string, "user2": string }
  }
}

Notes (grounded in research — fairness/justice, Pareto/Nash, SMART clarity, objective criteria, integrative trades, style/LSM, concession patterns, implementation-intentions):
- The JSON MUST be valid and parseable. Do not include trailing commas or comments.
- The agreement should be specific, fair, and implementable by both parties.`;

        try {
            const response = await openai.chat.completions.create({
                model: OPENAI_MODEL,
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.1
            });

            const raw = response.choices[0].message.content || '';

            // Extract structured JSON from fenced block; if none, try brace slice
            let structured = null;
            try {
                const jsonFence = raw.match(/```json\s*([\s\S]*?)```/i);
                if (jsonFence && jsonFence[1]) {
                    structured = JSON.parse(jsonFence[1]);
                } else {
                    // Fallback: attempt to parse first JSON-like substring
                    const match = raw.match(/\{[\s\S]*\}/);
                    if (match) {
                        structured = JSON.parse(match[0]);
                    }
                }
            } catch (e) {
                // Leave structured as null if parsing fails
                structured = null;
            }

            return { raw, structured };
        } catch (error) {
            console.error('Error generating final agreement:', error);
            throw error;
        }
    }

    getBackchannelInsights() {
        return this.negotiationRounds.map((round, index) => ({
            round: index + 1,
            advocate1: this.advocate1.userName,
            advocate2: this.advocate2.userName,
            proposal1: round.proposal1,
            proposal2: round.proposal2,
            moderation: round.moderation
        }));
    }
}

// API Endpoints

// Provide coaching/feedback on a single user's inputs before negotiation
app.post('/api/input-feedback', async (req, res) => {
    try {
        const { topic, userName = 'User', inputs = {} } = req.body || {};
        const { objectives = '', mustHaves = '', constraints = '' } = inputs;

        // If OpenAI not configured, return a lightweight mock to keep UX unblocked
        if (!openai) {
            return res.json({
                success: true,
                feedback: {
                    overall: 'Consider making each point specific and measurable. Tie boundaries to objective criteria (e.g., schedules, who cooks).',
                    objectives: {
                        feedback: 'Clarify what “equitable” means in practice (e.g., alternating nights, weekend split).',
                        suggestions: ['Add timeframe (e.g., before bed).', 'Mention recognition/visibility if important.'],
                        rewrite: objectives ? objectives : 'My core interests are an equitable workload, feeling recognized, and preserving predictable downtime.'
                    },
                    mustHaves: {
                        feedback: 'Phrase boundaries as positive commitments. Include triggers (e.g., “if one cooks, the other does dishes”).',
                        suggestions: ['Use “must/should” vs. “never/always”.', 'Tie to a nightly cleanliness standard.'],
                        rewrite: mustHaves ? mustHaves : 'Boundaries: the kitchen is clean before bed; rotate duties so one person is not overloaded.'
                    },
                    constraints: {
                        feedback: 'List objective facts (hours, who cooks, deadlines). These become fair standards.',
                        suggestions: ['Include weekly hours per person.', 'Identify typical cooking nights or late shifts.'],
                        rewrite: constraints ? constraints : 'I work ~50 hours/week; partner ~40. Whoever cooks is exempt from dishes that night.'
                    }
                }
            });
        }

        const system = `You are a negotiation coach helping ${userName} prepare private inputs for a negotiation about: "${topic || 'the topic'}".
Return actionable, constructive feedback in JSON (no prose) with keys: overall, objectives{feedback,suggestions[],rewrite}, mustHaves{...}, constraints{...}. Use SMART and objective-criteria principles. Keep tone supportive and specific.`;

        const user = `Inputs from ${userName} (reframed fields):\n
Core interests & priorities:\n${objectives || '(none)'}\n\nNon-negotiables & boundaries:\n${mustHaves || '(none)'}\n\nObjective criteria & context:\n${constraints || '(none)'}\n\nPlease improve clarity, add suggestions, and propose a concise rewrite for each section. Respond as valid JSON only.`;

        const rsp = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0.2,
            max_tokens: 500
        });

        const raw = rsp.choices?.[0]?.message?.content || '';
        let parsed = null;
        try {
            const fence = raw.match(/```json\s*([\s\S]*?)```/i);
            if (fence) parsed = JSON.parse(fence[1]);
            else parsed = JSON.parse(raw);
        } catch (e) {
            // fallback minimal object
            parsed = { overall: 'Consider clarifying each section using concrete, time-bound language.' };
        }

        res.json({ success: true, feedback: parsed });
    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ success: false, error: 'Feedback generation failed' });
    }
});

// Input feedback endpoint
app.post('/api/input-feedback', async (req, res) => {
    try {
        const { topic = '', userName = 'User', inputs = {} } = req.body || {};
        const objectives = String(inputs.objectives || '').trim();
        const mustHaves = String(inputs.mustHaves || '').trim();
        const constraints = String(inputs.constraints || '').trim();

        if (!objectives && !mustHaves && !constraints) {
            return res.status(400).json({ error: 'No inputs provided' });
        }

        // If OpenAI not configured, return heuristic feedback
        if (!openai) {
            return res.json({ success: true, feedback: heuristicFeedback({ objectives, mustHaves, constraints, topic, userName }) });
        }

        const system = `You are an AI coach helping a user improve private inputs before an AI-to-AI negotiation. Your job is to transform vague, positional statements into specific, interest-based, and actionable inputs. Use this framework:
1) The "Why" Test (Clarifying Interests)
2) The Specificity Check (Make it Measurable)
3) The Objective Criteria Prompt (Ground in reality)
4) The Solution-Space Expander (Move from "No" to "How")

Return ONLY one compact JSON object (no prose) with this exact schema:
{
  "objectives": { "feedback": string, "suggestions": string[], "rewrite": string },
  "mustHaves": { "feedback": string, "suggestions": string[], "rewrite": string },
  "constraints": { "feedback": string, "suggestions": string[], "rewrite": string },
  "overall": string
}
Rules:
- Be concise and practical.
- If a field is empty, give constructive guidance to elicit content.
- Keep "rewrite" as a single improved paragraph or bullet list for that bucket.`;

        const user = `Context:
Topic: ${topic}
User: ${userName}

User Inputs:
OBJECTIVES:\n${objectives || '(empty)'}

MUST-HAVES:\n${mustHaves || '(empty)'}

CONSTRAINTS:\n${constraints || '(empty)'}

Provide JSON as specified.`;

        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            max_tokens: 600,
            temperature: 0.3
        });

        const raw = response.choices?.[0]?.message?.content || '';
        let feedback = null;
        try {
            const fence = raw.match(/```json\s*([\s\S]*?)```/i);
            const jsonStr = fence ? fence[1] : raw;
            feedback = JSON.parse(jsonStr);
        } catch (e) {
            // As a fallback, return heuristic feedback
            feedback = heuristicFeedback({ objectives, mustHaves, constraints, topic, userName });
        }

        return res.json({ success: true, feedback });
    } catch (err) {
        console.error('input-feedback error', err);
        return res.status(500).json({ error: 'Feedback generation failed' });
    }
});

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
            agreement: finalAgreement.raw,
            structured: finalAgreement.structured || null,
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
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`AI Negotiation API running on port ${PORT}`);
        console.log(`OpenAI configured: ${!!openai}`);
    });
}

module.exports = { AIAdvocate, AIModerator, app };

// Heuristic fallback when OpenAI is unavailable
function heuristicFeedback({ objectives, mustHaves, constraints, topic, userName }) {
    const f = (text) => text.toLowerCase();
    const make = (name, text) => {
        const issues = [];
        if (!text) {
            return {
                feedback: `No ${name} provided. Add a few sentences so your AI can advocate effectively.`,
                suggestions: [
                    'State the why behind what you want',
                    'Add specifics (who/what/when/how much)',
                    'Reference any objective criteria or schedules'
                ],
                rewrite: ''
            };
        }
        const t = f(text);
        if (/(always|never|must|refuse)/.test(t)) issues.push('Consider the Solution-Space Expander: articulate the non-negotiable outcome, but allow flexible ways to achieve it.');
        if (/(fair|reasonable|soon|often|regularly|sometimes)/.test(t)) issues.push('Specificity Check: replace vague terms with measurable definitions (e.g., percent/time/frequency).');
        if (/(feel|feels|upset|tired|overwhelmed)/.test(t)) issues.push('Objective Criteria: supplement feelings with quick facts, lists, or schedules.');
        if (!/(because|so that|so i can|why)/.test(t)) issues.push('Why Test: add a brief why to clarify interests.');

        const suggestions = issues.length ? issues : ['Looks good. Consider adding 1–2 concrete examples to strengthen it.'];
        return {
            feedback: suggestions.join(' '),
            suggestions,
            rewrite: text
        };
    };

    return {
        objectives: make('objectives', objectives),
        mustHaves: make('must-haves', mustHaves),
        constraints: make('constraints', constraints),
        overall: 'Tighten language, clarify the why behind your positions, quantify where possible, and ground feelings with brief, objective references.'
    };
}
