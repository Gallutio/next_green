const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

let conversationHistory = [];

function addMessage(text, role) {
    const div = document.createElement("div");
    div.className = "message " + role;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    const div = document.createElement("div");
    div.className = "typing-indicator";
    div.id = "typingIndicator";
    div.innerHTML = "<span></span><span></span><span></span>";
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
}

async function sendMessage(text) {
    conversationHistory.push({ role: "user", content: text });
    addMessage(text, "user");
    userInput.value = "";
    sendBtn.disabled = true;
    showTyping();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: conversationHistory
            })
        });

        removeTyping();

        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }

        const data = await response.json();
        const message = data.choices[0].message;
        const reply = message.content || message.reasoning_content || "No response.";

        conversationHistory.push({ role: "assistant", content: reply });
        addMessage(reply, "assistant");
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
    const text = userInput.value.trim();
    if (!text) return;
    sendMessage(text);
});
