const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SERVER_ID = Date.now().toString(36);

// State
let config = {
    buzzers: [
        { id: '1', color: '#ff9999', label: 'Red' },
        { id: '2', color: '#99ff99', label: 'Green' },
        { id: '3', color: '#9999ff', label: 'Blue' },
        { id: '4', color: '#ffff99', label: 'Yellow' }
    ],
    theme: 'light'
};

// Events: { buzzerId, timestamp, order }
let buzzes = [];
let clients = [];

function sendEventsToAll() {
    const data = JSON.stringify({ type: 'update', buzzes, config });
    clients.forEach(res => {
        res.write(`data: ${data}\n\n`);
    });
}

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // CORS for development if needed, though we serve static
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/api/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const newClient = res;
        clients.push(newClient);

        // Send initial state
        res.write(`data: ${JSON.stringify({ type: 'update', buzzes, config })}\n\n`);

        req.on('close', () => {
            clients = clients.filter(c => c !== newClient);
        });
        return;
    }

    if (req.url === '/api/buzz' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body);
                // Check if this buzzer already buzzed
                if (!buzzes.find(b => b.buzzerId === id)) {
                    const now = Date.now();
                    const firstBuzz = buzzes[0];
                    const diff = firstBuzz ? now - firstBuzz.timestamp : 0;

                    buzzes.push({
                        buzzerId: id,
                        timestamp: now,
                        diff: diff
                    });

                    sendEventsToAll();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    if (req.url === '/api/reset' && req.method === 'POST') {
        buzzes = []; // Clear buzzes
        sendEventsToAll();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    if (req.url === '/api/theme' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { theme } = JSON.parse(body);
                if (theme === 'dark' || theme === 'light') {
                    config = { ...config, theme };
                    sendEventsToAll();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(400);
                    res.end('Invalid theme');
                }
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    if (req.url === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const newConfig = JSON.parse(body);
                if (newConfig.buzzers && Array.isArray(newConfig.buzzers)) {
                    config = { ...config, ...newConfig, buzzers: newConfig.buzzers };
                    // Ideally check if removed buzzers are in 'buzzes' and clean up,
                    // but keeping it simple.
                    sendEventsToAll();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(400);
                    res.end('Invalid config');
                }
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // Static File Serving
    // Remove query params for file lookup
    const cleanUrl = req.url.split('?')[0];
    let filePath = path.join(__dirname, '../frontend/public' + cleanUrl);
    if (cleanUrl === '/') {
        filePath = path.join(__dirname, '../frontend/public/index.html');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
    case '.js':
        contentType = 'text/javascript';
        break;
    case '.css':
        contentType = 'text/css';
        break;
    case '.json':
        contentType = 'application/json';
        break;
    case '.png':
        contentType = 'image/png';
        break;
    case '.jpg':
        contentType = 'image/jpg';
        break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            if (req.url === '/' || filePath.endsWith('index.html')) {
                let html = content.toString();
                html = html.replace('main.css', `main.css?v=${SERVER_ID}`);
                html = html.replace('main.js', `main.js?v=${SERVER_ID}`);
                content = Buffer.from(html);
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });

});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        clients.forEach(client => {
            if (!client.writableEnded) {
                client.end();
            }
        });
        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 10000);
});

// Handle SIGTERM (termination signal)
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    server.close(() => {
        console.log('Server closed');
        clients.forEach(client => {
            if (!client.writableEnded) {
                client.end();
            }
        });
        process.exit(0);
    });
});
