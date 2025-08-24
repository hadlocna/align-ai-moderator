const WebSocket = require('ws');
const http = require('http');
const { execSync } = require('child_process');
const { version: pkgVersion } = require('./package.json');
const fs = require('fs');
const path = require('path');

let puppeteer = null; // Lazy-load to avoid crashing if not installed

// Determine application version from git commit count
let appVersion = pkgVersion;
try {
    const commitCount = execSync('git rev-list --count HEAD').toString().trim();
    const [major = '0', minor = '0'] = pkgVersion.split('.');
    appVersion = `${major}.${minor}.${commitCount}`;
} catch (err) {
    console.error('Could not determine app version from git:', err);
}

// Create HTTP server for health checks, version info, and PDF generation
const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', connections: wss.clients.size }));
    } else if (req.url === '/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: appVersion }));
    } else if (req.url.startsWith('/api/pdf/agreement') && req.method === 'POST') {
        try {
            // Collect JSON body
            let body = '';
            req.on('data', chunk => { body += chunk; });
            await new Promise(resolve => req.on('end', resolve));

            let payload = {};
            try { payload = JSON.parse(body || '{}'); } catch (e) {}

            const {
                html = '<p>No content</p>',
                title = 'Align Certified Agreement',
                topic = 'Agreement',
                filename = 'agreement.pdf',
                agreementId = ''
            } = payload || {};

            // Resolve watermark file - prefer group/ path if present
            const rootDir = __dirname;
            const candidatePaths = [
                path.join(rootDir, 'group', 'Align Certified.png'),
                path.join(rootDir, 'Align Certified.png')
            ];
            let watermarkDataUrl = '';
            for (const p of candidatePaths) {
                if (fs.existsSync(p)) {
                    const b64 = fs.readFileSync(p).toString('base64');
                    watermarkDataUrl = `data:image/png;base64,${b64}`;
                    break;
                }
            }

            // Embed logo if available
            const logoPath = path.join(rootDir, 'Align_Logo.png');
            let logoDataUrl = '';
            if (fs.existsSync(logoPath)) {
                const b64 = fs.readFileSync(logoPath).toString('base64');
                logoDataUrl = `data:image/png;base64,${b64}`;
            }

            // Lazy import puppeteer
            if (!puppeteer) {
                try {
                    puppeteer = require('puppeteer');
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Puppeteer not installed' }));
                }
            }

            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            try {
                const page = await browser.newPage();
                const safeTopic = escapeHtml(topic);
                const safeId = escapeHtml(agreementId || '');
                const docHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: Letter; margin: 0.75in; }
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; }
    h1,h2,h3 { margin: 0 0 8px 0; }
    p { line-height: 1.5; }
    .header { text-align: center; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 12px; }
    .logo { height: 28px; }
    .topic { font-size: 18px; font-weight: 700; color: #1f2937; }
    .container { position: relative; }
    .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.1; }
    .watermark img { max-width: 70%; transform: rotate(-25deg); filter: grayscale(100%); }
    .content { position: relative; z-index: 1; }
  </style>
  </head>
  <body>
    <div class="container">
      ${watermarkDataUrl ? `<div class="watermark"><img src="${watermarkDataUrl}" alt="watermark" /></div>` : ''}
      <div class="content">
        <div class="header">
          ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Align"/>` : ''}
          <div class="topic">${safeTopic}${safeId ? ` • ${safeId}` : ''}</div>
        </div>
        <div style="height:8px"></div>
        <div style="height:1px;background:#e5e7eb"></div>
        ${html}
      </div>
    </div>
  </body>
</html>`;

                await page.setContent(docHtml, { waitUntil: 'networkidle0' });

                // Header/footer with page numbers
                const headerTemplate = `
                  <div style="font-size:8px;width:100%;padding:0 0.5in;color:#6b7280;display:flex;justify-content:space-between;align-items:center;">
                    <span>Align • Certified Agreement</span>
                    <span>${safeTopic}${safeId ? ` • ${safeId}` : ''}</span>
                  </div>`;
                const footerTemplate = `
                  <div style="font-size:8px;width:100%;padding:0 0.5in;color:#6b7280;display:flex;justify-content:flex-end;">
                    <span class="pageNumber"></span> / <span class="totalPages"></span>
                  </div>`;

                const pdfBuffer = await page.pdf({
                    format: 'Letter',
                    printBackground: true,
                    displayHeaderFooter: true,
                    headerTemplate,
                    footerTemplate,
                    margin: { top: '1in', bottom: '0.8in', left: '0.75in', right: '0.75in' }
                });

                // Hashes for verification (hash of content and of the final PDF)
                const crypto = require('crypto');
                const contentHash = crypto.createHash('sha256').update(String(html || '') + '|' + String(topic || '')).digest('hex');
                const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

                res.writeHead(200, {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${sanitizeFilename(filename || `Agreement_${slugify(topic)}.pdf`)}"`,
                    'X-Content-SHA256': contentHash,
                    'X-PDF-SHA256': pdfHash
                });
                return res.end(pdfBuffer);
            } finally {
                await browser.close();
            }
        } catch (err) {
            console.error('PDF generation error', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to generate PDF', details: String(err && err.message || err) }));
        }
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
const sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > 14400000) { // 4 hours
            console.log(`Cleaning up expired session: ${sessionId}`);
            sessions.delete(sessionId);
        }
    }
}, 600000); // Check every 10 minutes
sessionCleanupInterval.unref();

// Keep-alive mechanism for Render
const keepAliveInterval = setInterval(() => {
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
keepAliveInterval.unref();

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
    const { sessionId, userName, topic } = message;
    
    let session = sessions.get(sessionId);
    if (!session) {
        // Session not found on server, but client thinks it should exist
        // This happens when server restarts or session expires while client was away
        // Recreate the session if we have topic info
        if (topic) {
            console.log(`Recreating expired session: ${sessionId} with topic: ${topic}`);
            session = {
                sessionId,
                topic,
                createdAt: Date.now(),
                participants: []
            };
            sessions.set(sessionId, session);
        } else {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Session not found or expired' 
            }));
            return;
        }
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

// Only start the server automatically if this file is executed directly.
if (require.main === module) {
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
}

// Export server and wss for testing
module.exports = { server, wss, sessions };

// Helpers
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeFilename(name) {
    return String(name || 'file.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
