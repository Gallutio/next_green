var chatMessages = document.getElementById("chatMessages");
var chatForm = document.getElementById("chatForm");
var userInput = document.getElementById("userInput");
var sendBtn = document.getElementById("sendBtn");
var logSaved = false;

// Fetch the latest log from Supabase to give the AI context
async function fetchLatestLog() {
    try {
        var res = await fetch("/api/logs", { headers: authHeaders() });
        if (!res.ok) return null;
        var logs = await res.json();
        return logs.length > 0 ? logs[0] : null;
    } catch (e) {
        return null;
    }
}

function buildPreviousContext(latest) {
    if (!latest) return "";
    var date = new Date(latest.created_at).toLocaleDateString();
    return "\n\nThe user's most recent log (" + date + "): " +
        "Water usage: " + (latest.water_liters || "not recorded") + " liters, " +
        "Carbon estimate: " + (latest.carbon_kg || "not recorded") + " kg CO2, " +
        "Transport: " + (latest.transport || "not recorded") + ", " +
        "Energy habits: " + (latest.energy || "not recorded") + ", " +
        "Steps to improve: " + (latest.steps ? latest.steps.join(", ") : "none recorded") + ".";
}

var conversationHistory = [];
var userMessageCount = 0;

async function initChat() {
    var latest = await fetchLatestLog();
    conversationHistory = [
        {
            role: "system",
            content: "You are Next Green AI, a sustainability counselor. Your job is to help users log their daily environmental impact and give improvement advice.\n\n" +
                "When you start a conversation, greet the user briefly, then begin asking them questions ONE AT A TIME to fill out their daily eco-log. Ask about:\n" +
                "1. How many liters of water they used today (drinking, showering, dishes, laundry, etc.)\n" +
                "2. How they commuted/traveled today (car, bus, bike, walk, etc.) and approximate distance\n" +
                "3. Their energy usage habits today (lights left on, AC/heating, appliances)\n" +
                "4. Any waste they produced (recycled? composted? threw away?)\n\n" +
                "After gathering answers, estimate their carbon footprint for the day in kg CO2 and suggest 2-3 specific steps to improve.\n\n" +
                "Be friendly, encouraging, and practical with your advice." +
                buildPreviousContext(latest)
        }
    ];
}

initChat();

function addMessage(text, role) {
    var div = document.createElement("div");
    div.className = "message " + role;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    var div = document.createElement("div");
    div.className = "typing-indicator";
    div.id = "typingIndicator";
    div.innerHTML = "<span></span><span></span><span></span>";
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
    var el = document.getElementById("typingIndicator");
    if (el) el.remove();
}

// Build a plain-text version of the conversation for extraction
function getConversationText() {
    var text = "";
    for (var i = 0; i < conversationHistory.length; i++) {
        var msg = conversationHistory[i];
        if (msg.role === "user") {
            text += "User: " + msg.content + "\n";
        } else if (msg.role === "assistant") {
            text += "Assistant: " + msg.content + "\n";
        }
    }
    return text;
}

// Extract data from conversation and save to Supabase
async function extractAndSave() {
    if (logSaved) return;

    // Show saving status
    addMessage("Saving your log to the dashboard...", "assistant");

    try {
        // Step 1: Extract structured data
        var extractRes = await fetch("/api/extract", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
            body: JSON.stringify({ conversation: getConversationText() })
        });

        if (!extractRes.ok) throw new Error("Failed to extract data");

        var ecoData = await extractRes.json();

        // Step 2: Save to Supabase
        var saveRes = await fetch("/api/logs", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
            body: JSON.stringify(ecoData)
        });

        if (!saveRes.ok) throw new Error("Failed to save log");

        logSaved = true;

        // Remove the "saving" message and show success
        var messages = chatMessages.querySelectorAll(".message.assistant");
        var lastMsg = messages[messages.length - 1];
        if (lastMsg) lastMsg.textContent = "Your eco log has been saved! Visit your dashboard to see your stats.";

        // Remove the save button
        var saveBtn = document.getElementById("saveToDashboard");
        if (saveBtn) saveBtn.remove();

    } catch (error) {
        console.error("Save error:", error);
        var messages = chatMessages.querySelectorAll(".message.assistant");
        var lastMsg = messages[messages.length - 1];
        if (lastMsg) lastMsg.textContent = "Sorry, there was an error saving your log. Please try again.";
    }
}

// Show the "Save to Dashboard" button
function showSaveButton() {
    if (logSaved || document.getElementById("saveToDashboard")) return;

    var div = document.createElement("div");
    div.className = "save-btn-container";
    div.innerHTML = '<button id="saveToDashboard" class="save-dashboard-btn">Save to Dashboard</button>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    document.getElementById("saveToDashboard").addEventListener("click", extractAndSave);
}

async function sendMessage(text) {
    conversationHistory.push({ role: "user", content: text });
    addMessage(text, "user");
    userInput.value = "";
    sendBtn.disabled = true;
    userMessageCount++;
    showTyping();

    try {
        var response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: conversationHistory
            })
        });

        removeTyping();

        if (!response.ok) {
            var err = await response.text();
            throw new Error(err);
        }

        var data = await response.json();
        var message = data.choices[0].message;
        var reply = message.content || message.reasoning_content || "No response.";

        conversationHistory.push({ role: "assistant", content: reply });
        addMessage(reply, "assistant");

        // After 4+ user messages, the AI likely has enough info — show save button
        if (userMessageCount >= 4 && !logSaved) {
            showSaveButton();
        }

    } catch (error) {
        removeTyping();
        addMessage("Something went wrong. Please try again.", "error");
        console.error("Chat error:", error);
    }

    sendBtn.disabled = false;
    userInput.focus();
}

chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = userInput.value.trim();
    if (!text) return;
    sendMessage(text);
});
