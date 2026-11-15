const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HF_TOKEN = "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"; // আপনার আসল Hugging Face টোকেন এখানে বসাবেন
const PUBLIC_DIR = __dirname;

function sendRes(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } 
      catch (e) { reject(new Error("Invalid JSON.")); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ফ্রন্টএন্ড বা হোমপেজ লোড করার জন্য
  if (req.method === 'GET' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
      return sendRes(res, 200, html, 'text/html; charset=utf-8');
    } catch (e) {
      return sendRes(res, 500, { error: "App page could not be loaded." });
    }
  }

  // Hugging Face ফ্রি এপিআই দিয়ে ভিডিও বা ইমেজ জেনারেট করার রাউট
  if (req.method === 'POST' && parsedUrl.pathname === '/generate') {
    try {
      const body = await readJson(req);
      const prompt = body.prompt;

      if (!prompt) {
        return sendRes(res, 400, { error: "Prompt is required." });
      }

      // Hugging Face ফ্রি ভিডিও মডেল এন্ডপয়েন্ট
      const hfResponse = await fetch("https://router.huggingface.co/hf-inference/models/cerspense/zeroscope_v2_576w", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      });

      if (!hfResponse.ok) {
        const errText = await hfResponse.text();
        return sendRes(res, hfResponse.status, { error: errText });
      }

      const buffer = await hfResponse.arrayBuffer();
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.byteLength
      });
      return res.end(Buffer.from(buffer));

    } catch (error) {
      return sendRes(res, 500, { error: error.message });
    }
  }

  return sendRes(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
