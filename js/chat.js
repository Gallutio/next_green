var chatMessages = document.getElementById("chatMessages");
var chatForm = document.getElementById("chatForm");
var userInput = document.getElementById("userInput");
var sendBtn = document.getElementById("sendBtn");
var logSaved = false;

// Fetch the latest log from Supabase to give the AI context
async function fetchLatestLog() {
    try {
        var res = await fetch("/api/logs", { headers: authHeaders() });
        if (res.status === 401) { handleExpiredSession(); return null; }
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

async function initChat() {
    var latest = await fetchLatestLog();
    conversationHistory = [
        {
            role: "system",
            content: "You are Next Green AI, a sustainability counselor that helps users log their daily environmental impact.\n\n" +
                "TONE: Warm, practical, brief. No filler. One question per turn.\n\n" +
                "GOAL: Gather four concrete numbers/facts, then produce a structured summary.\n\n" +
                "ASK FOR THESE, ONE AT A TIME, IN THIS ORDER:\n" +
                "1. Water: approximate LITERS today (showers ~60L each, toilet flushes ~6L, dishes ~10L, etc.). If the user is vague, give examples and ask for a rough estimate in liters.\n" +
                "2. Transport: mode(s) and total KM. If they say only 'walk' or 'bus', ask roughly how far in km.\n" +
                "3. Energy: ask whether lights/devices were left on when not in use and whether AC/heating/large appliances (oven, dryer, washing machine) ran today. You want to place them in low / moderate / high usage.\n" +
                "4. Waste: did they mostly recycle/compost, a mix, or mostly throw away?\n\n" +
                "RULES:\n" +
                "- If an answer is vague (e.g., 'some', 'yes', 'a bit'), ASK A FOLLOW-UP to pin down a number or a clear low/moderate/high.\n" +
                "- Keep your replies under 3 sentences until the final summary.\n" +
                "- Do not repeat questions you have already asked.\n\n" +
                "FINAL SUMMARY (send exactly one message shaped like this once you have all four answers):\n" +
                "Here is your day at a glance:\n" +
                "- Water: <N> L\n" +
                "- Transport: <mode>, ~<N> km\n" +
                "- Energy: <Low|Moderate|High> \u2014 <one-line reason>\n" +
                "- Waste: <Mostly recycled|Mixed|Mostly landfill>\n" +
                "- Estimated carbon today: ~<N> kg CO2\n\n" +
                "Three things to try tomorrow:\n" +
                "1. <specific tip based on their actual answers>\n" +
                "2. <specific tip>\n" +
                "3. <specific tip>\n\n" +
                "CARBON ESTIMATE: Base your kg CO2 on sensible averages (car ~0.2 kg/km, bus ~0.1 kg/km, electricity ~0.4 kg/kWh, high-use day ~30 kWh, moderate ~15, low ~5, plus food/waste rough factor). Always give a single number, even if rough." +
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

        if (extractRes.status === 401) { handleExpiredSession(); return; }
        if (!extractRes.ok) {
            var extractErr = await extractRes.json().catch(function () { return {}; });
            throw new Error("Extract: " + (extractErr.error || extractRes.status));
        }

        var ecoData = await extractRes.json();

        // Step 2: Save to Supabase
        var saveRes = await fetch("/api/logs", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
            body: JSON.stringify(ecoData)
        });

        if (saveRes.status === 401) { handleExpiredSession(); return; }
        if (!saveRes.ok) {
            var saveErr = await saveRes.json().catch(function () { return {}; });
            throw new Error("Save: " + (saveErr.error || saveRes.status));
        }

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
        if (lastMsg) lastMsg.textContent = "Could not save your log: " + error.message;
    }
}

// Show the "Save to Dashboard" button. Once shown it stays until saved.
function showSaveButton() {
    if (logSaved || document.getElementById("saveToDashboard")) return;

    var div = document.createElement("div");
    div.className = "save-btn-container";
    div.innerHTML =
        '<p class="save-prompt">Looks like the AI has enough to log today. Review the summary above, then save it \u2014 or keep chatting to correct anything.</p>' +
        '<button id="saveToDashboard" class="save-dashboard-btn">Save to Dashboard</button>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    document.getElementById("saveToDashboard").addEventListener("click", extractAndSave);
}

// Did the AI just produce its final summary? We specifically prompted it to
// open that message with "Here is your day at a glance" and include a carbon line.
function isFinalSummary(text) {
    if (!text) return false;
    var lower = text.toLowerCase();
    if (lower.indexOf("day at a glance") !== -1) return true;
    // Fallback: contains a carbon line plus at least 3 of the labelled fields.
    var hits = 0;
    if (/water[:\s].+\dl/i.test(text) || /water[:\s].+liter/i.test(text)) hits++;
    if (/transport[:\s]/i.test(text)) hits++;
    if (/energy[:\s]/i.test(text)) hits++;
    if (/waste[:\s]/i.test(text)) hits++;
    if (/carbon[:\s].+kg/i.test(text) || /kg\s*co/i.test(text)) hits++;
    return hits >= 4;
}

async function sendMessage(text) {
    conversationHistory.push({ role: "user", content: text });
    addMessage(text, "user");
    userInput.value = "";
    sendBtn.disabled = true;
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

        // Show the save button only when the AI has produced its full summary.
        if (!logSaved && isFinalSummary(reply)) {
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
