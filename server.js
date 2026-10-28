
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const RUNWAY_API_SECRET = process.env.RUNWAY_API_SECRET;
const RUNWAY_BASE = "https://api.dev.runwayml.com";
const PUBLIC_DIR = __dirname;

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
      if (data.length > 20000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

async function runwayFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${RUNWAY_API_SECRET}`,
      "X-Runway-Version": "2024-11-06",
      ...(options.headers || {})
    }
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  if (req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      const html = fs.readFileSync(
        path.join(PUBLIC_DIR, "index.html"),
        "utf8"
      );
      return send(res, 200, html, "text/html; charset=utf-8");
    } catch {
      return send(res, 500, {
        error: "App page could not be loaded. Check index.html."
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {
      ok: true,
      service: "AIPromptStudio backend"
    });
  }

  if (!RUNWAY_API_SECRET) {
    return send(res, 500, {
      error: "Server admin must set RUNWAY_API_SECRET in Render Environment."
    });
  }

  if (req.method === "POST" && url.pathname === "/generate-video") {
    let body;

    try {
      body = await readJson(req);
    } catch (e) {
      return send(res, 400, {
        error: e.message || "Invalid JSON."
      });
    }

    const promptText = String(body.promptText || "").trim();

    if (!promptText) {
      return send(res, 400, {
        error: "Video prompt is required."
      });
    }

    if (promptText.length > 1000) {
      return send(res, 400, {
        error: "Prompt must be 1000 characters or fewer."
      });
    }

    try {
      const response = await runwayFetch(
        `${RUNWAY_BASE}/v1/text_to_video`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gen4.5",
            promptText,
            ratio: "1280:720",
            duration: 5
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return send(res, response.status, {
          error: data.error || data.message ||
            "Runway API request failed."
        });
      }

      return send(res, 200, {
        taskId: data.id,
        status: data.status || "PENDING"
      });

    } catch {
      return send(res, 502, {
        error: "Could not connect to Runway API."
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/video-status") {
    const id = url.searchParams.get("id");

    if (!id || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
      return send(res, 400, {
        error: "Invalid task ID."
      });
    }

    try {
      const response = await runwayFetch(
        `${RUNWAY_BASE}/v1/tasks/${encodeURIComponent(id)}`,
        { method: "GET" }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return send(res, response.status, {
          error: data.error || data.message ||
            "Status check failed."
        });
      }

      return send(res, 200, {
        taskId: data.id,
        status: data.status,
        videoUrl: Array.isArray(data.output)
          ? (data.output[0] || null)
          : null,
        error: data.failure || data.error || null
      });

    } catch {
      return send(res, 502, {
        error: "Could not check video status."
      });
    }
  }

  return send(res, 404, {
    error: "Not found."
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AIPromptStudio server listening on port ${PORT}`);
});

