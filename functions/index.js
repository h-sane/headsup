// Firebase Functions SDKs
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Main cloud function: getAiWords
 */
exports.getAiWords = onRequest(
  { cors: true, invoker: "public" },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const { category, difficulty, count, existingWords } = req.body;
      if (!category || !difficulty || !count) {
        res.status(400).send("Missing required parameters.");
        return;
      }

      try {
        logger.info(`Request received for category: ${category}, difficulty: ${difficulty}`);
        const result = await callGeminiAPI(category, difficulty, count, existingWords || []);
        res.status(200).json(result);
      } catch (error) {
        logger.error("Error calling Gemini API:", error);
        res.status(500).send("An error occurred while fetching words from the AI.");
      }
    });
  }
);

/**
 * Calls Gemini 2.5 Flash API with correct roles and structure
 */
async function callGeminiAPI(category, difficulty, count, existingWords = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment.");
  }

  // Prevent overloading Gemini — limit to 50 words per request
  const safeCount = Math.min(count, 50);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const systemPrompt = `You are a 'Heads Up' word generator. Respond ONLY with valid JSON (no markdown, no explanations). Do NOT repeat any of these words: ${existingWords.slice(0, 50).join(", ")}.`;
  const userPrompt = `Generate ${safeCount} ${difficulty}-level words for the category '${category}' suitable for a 'Heads Up' guessing game. Respond ONLY as JSON like {"words": ["word1", "word2", ...]}.`;

  const payload = {
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: [{ text: systemPrompt }] }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048, // Increased token limit
      responseMimeType: "application/json"
    }
  };

  // Attempt up to 3 retries for transient errors
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info(`Calling Gemini (attempt ${attempt}) model=models/gemini-2.5-flash`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      logger.info("🔍 RAW GEMINI RESPONSE:", text);

      if (!response.ok) {
        logger.error(`Generative API returned non-2xx: ${response.status}`, text);
        throw new Error(`Generative API returned ${response.status}`);
      }

      const json = JSON.parse(text);
      const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("Invalid Gemini response format");

      // 🧩 Clean any ```json or ``` wrapper before parsing
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        logger.error("Failed to parse Gemini response:", cleaned);
        throw new Error("Gemini response was not valid JSON");
      }

      return parsed;
    } catch (err) {
      logger.error(`Error calling Gemini API (attempt ${attempt}):`, err);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential backoff
    }
  }
}
