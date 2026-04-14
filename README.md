# NextGreen

A browser app where you chat with an AI about your day and it turns the conversation into a carbon-footprint log you can track over time.

Built as a Grade 9 Intro to Computer Programming project at International School Manila.

## What it does

You log in, open the chat, and the AI asks a few questions — how much water you used, how you got around, what you did with energy and waste. Once it has enough, it writes a summary with a rough CO₂ estimate for the day. You save that to your dashboard and you can come back to compare days against each other and against world averages.

## Running it

You need Node 18+ and a Supabase project with an `eco_logs` table (columns: `id`, `user_id`, `water_liters`, `carbon_kg`, `transport`, `energy`, `waste`, `steps`, `created_at`).

1. `npm install`
2. Create a `.env` file with:
   ```
   DEEPSEEK_API_KEY=your_deepseek_key
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_service_role_key
   ```
3. `node server.js` and open `http://localhost:3000/login.html`

## Stack

Plain HTML/CSS/JS on the front end. Express on the server. Supabase for auth and the database. DeepSeek for the chat and data extraction.

## Team

- Guillermo Camba Vazquez — front and back end
- Ethan Nalinakshan — front end
- Sabina Lee — content writing
- Yoojoun (Alex) Song — images and visuals
- Alex Vasquez — writing
