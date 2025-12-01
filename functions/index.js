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
 * Helper to get specific rules for each category to prevent bad data
 */
function getCategoryInstruction(category) {
    switch (category) {
        case 'Movies':
            return "Provide specific, famous Movie Titles only. Do NOT provide genres, actors, or generic terms like 'Cinema' or 'Screen'. Example: 'Titanic', 'The Matrix', 'Inception'.";
        
        case 'Celebrities':
            // UPDATED STRICTER RULE:
            return "Provide specific full names of famous real-life people only (Actors, Singers, Athletes, Politicians). Do NOT provide generic professions like 'Actor', 'Singer', 'Athlete' or 'Player'. Example: 'Taylor Swift', 'Cristiano Ronaldo', 'Barack Obama'.";
        
        case 'Animals':
            return "Provide specific animal names (e.g. 'Lion', 'Eagle', 'Shark'). Do NOT provide classes like 'Mammal', 'Bird', or 'Fish'.";
        
        case 'Science':
            return "Provide specific scientific terms, elements, or concepts (e.g. 'Gravity', 'Photosynthesis', 'Oxygen'). Do NOT provide school subjects like 'Biology' or 'Physics'.";
        
        case 'History':
            return "Provide specific historical events or famous historical figures (e.g. 'World War II', 'Julius Caesar'). Do NOT provide eras like 'Ancient' or 'Modern'.";
        
        case 'Random Words':
             return "Provide random, distinct nouns or objects. Avoid simple colors or numbers.";

        default:
            return "Provide specific items related to this category.";
    }
}

/**
 * Calls Gemini API
 */
async function callGeminiAPI(category, difficulty, count, existingWords = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment.");
  }

  const safeCount = Math.min(count, 50);
  // Switched to 1.5-flash for better stability with instructions
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const categoryRule = getCategoryInstruction(category);

  // STRICT System Prompt
  const systemPrompt = `You are a 'Heads Up' game word generator. 
  Respond ONLY with valid JSON.
  CATEGORY RULE: ${categoryRule}
  DIFFICULTY: ${difficulty}.
  Do NOT repeat any of these words: ${existingWords.slice(0, 50).join(", ")}.`;

  const userPrompt = `Generate ${safeCount} words for the category '${category}'. Respond ONLY as JSON like {"words": ["word1", "word2", ...]}.`;

  const payload = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };

  // Retry Logic
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      logger.info(`Calling Gemini (attempt ${attempt})`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      
      if (!response.ok) {
        logger.error(`Generative API returned non-2xx: ${response.status}`, text);
        throw new Error(`Generative API returned ${response.status}`);
      }

      const json = JSON.parse(text);
      const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("Invalid Gemini response format");

      // Clean JSON
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
      await new Promise(r => setTimeout(r, 1000 * attempt)); 
    }
  }
}