const WebSocket = require('ws');
const http = require('http');

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', connections: wss.clients.size }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// In-memory sessions (ephemeral, no persistence)
const sessions = new Map();

// Auto-cleanup sessions older than 4 hours (for mobile persistence)
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > 14400000) { // 4 hours
            console.log(`Cleaning up expired session: ${sessionId}`);
            sessions.delete(sessionId);
        }
    }
}, 600000); // Check every 10 minutes

// Keep-alive mechanism for Render
setInterval(() => {
    console.log(`Keep-alive: ${sessions.size} active sessions, ${wss.clients.size} connections`);
    
    // Send ping to all connected clients to keep connections alive
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (error) {
                console.error('Error sending keep-alive ping:', error);
            }
        }
    });
}, 45000); // Every 45 seconds

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    ws.sessionId = null;
    ws.userName = null;
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'create_session':
                    handleCreateSession(ws, message);
                    break;
                case 'join_session':
                    handleJoinSession(ws, message);
                    break;
                case 'relay_message':
                    handleRelayMessage(ws, message);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid message format' 
            }));
        }
    });
    
    ws.on('close', () => {
        if (ws.sessionId && ws.userName) {
            const session = sessions.get(ws.sessionId);
            if (session) {
                // Remove user from session
                session.participants = session.participants.filter(p => p.ws !== ws);
                
                // Notify remaining participants
                session.participants.forEach(participant => {
                    if (participant.ws.readyState === WebSocket.OPEN) {
                        participant.ws.send(JSON.stringify({
                            type: 'participant_left',
                            userName: ws.userName
                        }));
                    }
                });
                
                // Clean up empty sessions
                if (session.participants.length === 0) {
                    console.log(`Removing empty session: ${ws.sessionId}`);
                    sessions.delete(ws.sessionId);
                }
            }
        }
        console.log('WebSocket connection closed');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleCreateSession(ws, message) {
    const { sessionId, topic, userName } = message;
    
    if (sessions.has(sessionId)) {
        // Session exists - check if creator is reconnecting
        const session = sessions.get(sessionId);
        const creator = session.participants.find(p => p.isCreator && p.userName === userName);
        
        if (creator) {
            // Creator reconnecting - update their WebSocket
            console.log(`Creator ${userName} reconnecting to session: ${sessionId}`);
            creator.ws = ws;
            ws.sessionId = sessionId;
            ws.userName = userName;
            
            ws.send(JSON.stringify({ 
                type: 'session_created',
                sessionId,
                topic: session.topic
            }));
            return;
        } else {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Session already exists' 
            }));
            return;
        }
    }
    
    const session = {
        sessionId,
        topic,
        createdAt: Date.now(),
        participants: [{ userName, ws, isCreator: true }]
    };
    
    sessions.set(sessionId, session);
    ws.sessionId = sessionId;
    ws.userName = userName;
    
    ws.send(JSON.stringify({ 
        type: 'session_created',
        sessionId,
        topic
    }));
    
    console.log(`Session created: ${sessionId} by ${userName}`);
}

function handleJoinSession(ws, message) {
    const { sessionId, userName } = message;
    
    const session = sessions.get(sessionId);
    if (!session) {
        ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Session not found or expired' 
        }));
        return;
    }
    
    // Check if user is reconnecting (same userName)
    const existingParticipant = session.participants.find(p => p.userName === userName);
    
    if (existingParticipant) {
        // User is reconnecting - replace their WebSocket connection
        console.log(`${userName} reconnecting to session: ${sessionId}`);
        existingParticipant.ws = ws;
    } else {
        // Check if session is full (limit to 2 participants for now)
        if (session.participants.length >= 2) {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Session is full' 
            }));
            return;
        }
        
        // Add new participant
        session.participants.push({ userName, ws, isCreator: false });
        console.log(`${userName} joined session: ${sessionId}`);
    }
    ws.sessionId = sessionId;
    ws.userName = userName;
    
    // Notify all participants
    session.participants.forEach(participant => {
        if (participant.ws.readyState === WebSocket.OPEN) {
            participant.ws.send(JSON.stringify({
                type: 'participant_joined',
                userName: userName,
                topic: session.topic,
                participantCount: session.participants.length
            }));
        }
    });
    
    console.log(`${userName} joined session: ${sessionId}`);
}

function handleRelayMessage(ws, message) {
    const { content, messageType } = message;
    
    if (!ws.sessionId || !ws.userName) {
        ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Not connected to a session' 
        }));
        return;
    }
    
    const session = sessions.get(ws.sessionId);
    if (!session) {
        ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Session not found' 
        }));
        return;
    }
    
    // Relay message to other participants
    session.participants.forEach(participant => {
        if (participant.ws !== ws && participant.ws.readyState === WebSocket.OPEN) {
            participant.ws.send(JSON.stringify({
                type: 'message_received',
                messageType,
                content,
                from: ws.userName,
                timestamp: Date.now()
            }));
        }
    });
    
    // Send confirmation back to sender
    ws.send(JSON.stringify({
        type: 'message_sent',
        messageType,
        content,
        timestamp: Date.now()
    }));
}

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`Privacy-first signaling server running on port ${PORT}`);
    console.log('No data persistence - all sessions are ephemeral');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    wss.close(() => {
        server.close(() => {
            process.exit(0);
        });
    });
});