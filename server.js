const express = require("express");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Load env vars from .env
let API_KEY = "";
let SUPABASE_URL = "";
let SUPABASE_KEY = "";
try {
    const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
    envText.split("\n").forEach(function (line) {
        const parts = line.split("=");
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim();
        if (key === "DEEPSEEK_API_KEY") API_KEY = value;
        if (key === "SUPABASE_URL") SUPABASE_URL = value;
        if (key === "SUPABASE_KEY") SUPABASE_KEY = value;
    });
} catch (err) {
    console.error("Could not read .env file:", err.message);
}

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware: extract user from token
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = data.user;
    next();
}

// Auth: Sign up
app.post("/api/auth/signup", async function (req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: undefined, data: {} }
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // If email confirmation is required, session will be null
    if (!data.session) {
        return res.json({ confirmEmail: true });
    }

    res.json({
        token: data.session.access_token,
        user: { id: data.user.id, email: data.user.email }
    });
});

// Auth: Log in
app.post("/api/auth/login", async function (req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.json({
        token: data.session.access_token,
        user: { id: data.user.id, email: data.user.email }
    });
});

// Auth: Get current user
app.get("/api/auth/me", authenticate, function (req, res) {
    res.json({ id: req.user.id, email: req.user.email });
});

// Chat endpoint
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

// Extract eco data from conversation
app.post("/api/extract", authenticate, async function (req, res) {
    if (!API_KEY) {
        return res.status(500).json({ error: "API key not configured" });
    }

    try {
        const extractMessages = [
            {
                role: "system",
                content: "You are a data extraction assistant. Given a conversation about someone's daily environmental habits, extract the data into a JSON object. Respond with ONLY a valid JSON object, no other text. Use this exact format:\n{\"waterLiters\":NUMBER_OR_NULL,\"carbonKg\":NUMBER_OR_NULL,\"transport\":\"STRING_OR_NULL\",\"energy\":\"STRING_OR_NULL\",\"waste\":\"STRING_OR_NULL\",\"steps\":[\"step1\",\"step2\",\"step3\"]}\n\nIf a field wasn't discussed, use null. For steps, include improvement suggestions the assistant gave. For carbonKg, estimate based on the info provided."
            },
            {
                role: "user",
                content: "Extract eco data from this conversation:\n\n" + req.body.conversation
            }
        ];

        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API_KEY
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: extractMessages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const reply = data.choices[0].message.content;
        // Extract JSON from the response (handle possible markdown code blocks)
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(400).json({ error: "Could not extract data" });
        }

        const extracted = JSON.parse(jsonMatch[0]);
        res.json(extracted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save eco log (protected)
app.post("/api/logs", authenticate, async function (req, res) {
    try {
        const { waterLiters, carbonKg, transport, energy, waste, steps } = req.body;
        const { data, error } = await supabase
            .from("eco_logs")
            .insert([{
                water_liters: waterLiters,
                carbon_kg: carbonKg,
                transport: transport,
                energy: energy,
                waste: waste,
                steps: steps,
                user_id: req.user.id
            }])
            .select();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get eco logs (protected, filtered by user)
app.get("/api/logs", authenticate, async function (req, res) {
    try {
        const { data, error } = await supabase
            .from("eco_logs")
            .select("*")
            .eq("user_id", req.user.id)
            .order("created_at", { ascending: false })
            .limit(20);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, function () {
    console.log("Server running at http://localhost:" + PORT);
    console.log("Open http://localhost:" + PORT + "/login.html in your browser");
});
