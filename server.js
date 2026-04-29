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
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eq = trimmed.indexOf("=");
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        // Strip optional surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key === "DEEPSEEK_API_KEY") API_KEY = value;
        if (key === "SUPABASE_URL") SUPABASE_URL = value;
        if (key === "SUPABASE_KEY") SUPABASE_KEY = value;
    });
} catch (err) {
    console.error("Could not read .env file:", err.message);
}

// Fall back to process.env (used when deployed on Vercel or similar platforms)
if (!API_KEY) API_KEY = process.env.DEEPSEEK_API_KEY || "";
if (!SUPABASE_URL) SUPABASE_URL = process.env.SUPABASE_URL || "";
if (!SUPABASE_KEY) SUPABASE_KEY = process.env.SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("Warning: SUPABASE_URL / SUPABASE_KEY missing in .env \u2014 auth will fail.");
}
if (!API_KEY) {
    console.warn("Warning: DEEPSEEK_API_KEY missing in .env \u2014 chat will fail.");
}

// Map opaque Supabase/GoTrue errors to something a user can act on.
// Prefers the stable error.code field, falls back to matching the text.
function friendlyAuthError(error) {
    const code = error && error.code ? String(error.code).toLowerCase() : "";
    const message = error && error.message ? String(error.message) : "";
    const lower = message.toLowerCase();

    if (code === "user_already_exists" || lower.includes("user already registered")) {
        return "An account with that email already exists. Try logging in.";
    }
    if (code === "invalid_credentials" || lower.includes("invalid login credentials")) {
        return "Wrong email or password.";
    }
    if (code === "email_not_confirmed" || lower.includes("email not confirmed")) {
        return "Check your inbox for a confirmation email before logging in.";
    }
    if (code === "weak_password" || lower.includes("password should be at least") || lower.includes("did not match the expected pattern")) {
        return "Password does not meet the requirements. Use at least 8 characters with upper and lower case letters, a number, and a symbol.";
    }
    if (code === "validation_failed" || lower.includes("unable to validate email")) {
        return "That email address is not valid.";
    }
    if (code === "over_email_send_rate_limit") {
        return "Too many attempts. Wait a minute and try again.";
    }
    return message || "Something went wrong. Try again.";
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
        console.error("Signup error from Supabase:", error.code, "-", error.message);
        return res.status(400).json({ error: friendlyAuthError(error) });
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
        console.error("Login error from Supabase:", error.code, "-", error.message);
        return res.status(400).json({ error: friendlyAuthError(error) });
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
                content:
                    "You extract structured eco-log data from a conversation. Respond with ONLY a valid JSON object, no prose, no code fences.\n\n" +
                    "Schema:\n" +
                    "{\n" +
                    "  \"waterLiters\": NUMBER_OR_NULL,     // total liters used today\n" +
                    "  \"carbonKg\": NUMBER_OR_NULL,        // total kg CO2 for the day (always estimate if any data present)\n" +
                    "  \"transport\": STRING_OR_NULL,       // short readable label like \"Walked 3 km\" or \"Car, ~15 km\" or \"Bus + walk\"\n" +
                    "  \"energy\": STRING_OR_NULL,          // one of: \"Low\", \"Moderate\", \"High\" optionally followed by a short reason. e.g. \"Moderate \\u2014 AC ran 2h\"\n" +
                    "  \"waste\": STRING_OR_NULL,           // one of: \"Mostly recycled\", \"Mixed\", \"Mostly landfill\"\n" +
                    "  \"steps\": [\"step1\", \"step2\", \"step3\"]   // 2-3 concrete tips from the assistant's summary\n" +
                    "}\n\n" +
                    "RULES:\n" +
                    "- Do NOT echo raw user replies like \"yes\", \"no\", \"some\". Translate them into the labels above based on context.\n" +
                    "- If the user said \"yes\" to \"did you leave lights on?\", set energy to \"High\" or \"Moderate\" based on how much.\n" +
                    "- If the conversation didn't cover a field at all, use null.\n" +
                    "- carbonKg must be a single number (approximate is fine). Never leave it null if there is any data on transport/energy/waste.\n" +
                    "- transport must include a rough distance when possible.\n" +
                    "- steps should be imperative and specific (\"Switch one car trip to the bus\", not \"be greener\")."
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
        console.error("Extract exception:", error);
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
            console.error("Supabase insert error:", error.code, "-", error.message, error.details || "");
            return res.status(400).json({ error: error.message });
        }

        res.json(data[0]);
    } catch (error) {
        console.error("Save log exception:", error);
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

// Fallback: serve the friendly 404 page for any unmatched non-API route.
app.use(function (req, res) {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Not found" });
    }
    res.status(404).sendFile(path.join(__dirname, "404.html"));
});

const PORT = 3000;
app.listen(PORT, function () {
    console.log("Server running at http://localhost:" + PORT);
    console.log("Open http://localhost:" + PORT + "/login.html in your browser");
});
