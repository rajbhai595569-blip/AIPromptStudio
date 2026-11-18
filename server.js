
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        try {
            const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(html);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'HTML file not found' }));
        }
    }

    if (req.method === 'POST' && url.pathname === '/generate') {
        try {
            let body = '';
            for await (const chunk of req) { body += chunk; }
            const data = JSON.parse(body);

            if (!data.prompt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Prompt is required' }));
            }

            const response = await fetch("https://api-inference.huggingface.co/models/cerspense/zeroscope_v2_576w", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ inputs: data.prompt })
            });

            if (!response.ok) {
                const errText = await response.text();
                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: errText }));
            }

            const buffer = await response.arrayBuffer();
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': buffer.byteLength
            });
            return res.end(Buffer.from(buffer));

        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
        }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
