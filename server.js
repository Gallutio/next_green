const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Load API key from .env
let API_KEY = "";
try {
    const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
    envText.split("\n").forEach(function (line) {
        const parts = line.split("=");
        if (parts[0].trim() === "DEEPSEEK_API_KEY") {
            API_KEY = parts.slice(1).join("=").trim();
        }
    });
} catch (err) {
    console.error("Could not read .env file:", err.message);
}

app.post("/api/chat", async function (req, res) {
    if (!API_KEY) {
        return res.status(500).json({ error: "API key not configured" });
    }

    try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API_KEY
            },
            body: JSON.stringify({
                model: req.body.model || "deepseek-chat",
                messages: req.body.messages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, function () {
    console.log("Server running at http://localhost:" + PORT);
    console.log("Open http://localhost:" + PORT + "/chat.html in your browser");
});
