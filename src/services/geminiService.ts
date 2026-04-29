import { GoogleGenAI, GenerateContentParameters, ThinkingLevel, Type } from "@google/genai";

function parseRetryDelayMs(raw: string): number | null {
  const retryDelayMatch = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryDelayMatch) {
    return Number(retryDelayMatch[1]) * 1000;
  }

  const retryInMatch = raw.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (retryInMatch) {
    return Math.ceil(Number(retryInMatch[1]) * 1000);
  }

  return null;
}

function isRetryableQuotaError(error: any, normalizedErrorMsg: string): boolean {
  const rateLimitSignals = [
    'quota exceeded',
    'rate limit exceeded',
    'resource exhausted',
    'resource_exhausted',
    'too many requests',
    'daily limit reached'
  ];

  const statusCode = Number(error?.status ?? error?.code ?? error?.response?.status);
  const statusText = (error?.statusText ?? '').toString().toLowerCase();
  const reason = (error?.details?.reason || error?.reason || '').toString().toLowerCase();

  return (
    statusCode === 429 ||
    statusText.includes('resource_exhausted') ||
    reason.includes('rate_limit') ||
    reason.includes('quota') ||
    rateLimitSignals.some(signal => normalizedErrorMsg.includes(signal))
  );
}

function isPermissionOrBillingError(error: any, normalizedErrorMsg: string): boolean {
  const statusCode = Number(error?.status ?? error?.code ?? error?.response?.status);
  const statusText = (error?.statusText ?? '').toString().toLowerCase();
  const reason = (error?.details?.reason || error?.reason || '').toString().toLowerCase();

  return (
    statusCode === 401 ||
    statusCode === 403 ||
    statusText.includes('permission_denied') ||
    reason.includes('permission') ||
    normalizedErrorMsg.includes('permission denied') ||
    normalizedErrorMsg.includes('billing not enabled') ||
    normalizedErrorMsg.includes('api key not valid')
  );
}

/**
 * Robust wrapper for Gemini API calls with exponential backoff for rate limits.
 */
export async function callGemini(params: GenerateContentParameters, retries = 3, delay = 2000, apiKeyOverride?: string | null) {
  // Try to get API key from multiple possible sources
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key is not configured. Please set it in Settings.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent(params);

      if (!response.text) {
        throw new Error("Empty response from Gemini API");
      }
      return response;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const normalizedErrorMsg = errorMsg.toLowerCase();
      const isRateLimit = isRetryableQuotaError(error, normalizedErrorMsg);
      const isPermissionIssue = isPermissionOrBillingError(error, normalizedErrorMsg);
      
      if (isRateLimit && attempt < retries) {
        const suggestedDelay = parseRetryDelayMs(errorMsg);
        const backoffDelay = suggestedDelay ?? delay * Math.pow(2, attempt);
        console.warn(`Gemini quota/rate-limit issue detected. Retrying in ${backoffDelay}ms... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }

      if (isPermissionIssue) {
        throw new Error("Gemini API access denied. Check API key permissions and enable billing for your project in Google AI Studio.");
      }
      
      console.error("Gemini API Error details:", error);
      throw new Error(`Gemini API Error: ${errorMsg}`);
    }
  }
  throw new Error("Maximum retries reached for Gemini API.");
}

export async function generateGrammarLesson(content: string, apiKeyOverride?: string | null, customPrompt: string = "") {
  const systemInstruction = `Identity: You are the Lead Content Architect for "Grammar BD", the premier English learning platform for Bangladeshi students.
Task: Your primary objective is to analyze the provided text and transform it into a structured, high-quality grammar lesson.

PERMANENT TOPIC GENERATION RULES:
1. Language Consistency: 
   - Core definitions, explanations, and context MUST be in Bengali (বাংলা).
   - Use English for technical terminology, but always pair it with Bengali explanations.
2. Example-Parenthesis Pattern: 
   - Every English example sentence must be followed by a line starting with "(" and ending with ")".
   - Inside the parentheses, provide a Bengali breakdown of the grammatical function (e.g., "(এখানে 'is' হচ্ছে auxiliary verb)").
3. Subtopic Division (COMPREHENSIVENESS IS MANDATORY): 
   - DO NOT SUMMARIZE AND DO NOT LEAVE OUT ANY INFORMATION. 
   - Break down the text and extract EVERY SINGLE grammar rule, concept, and nuance into subtopics.
   - For long texts (e.g., 4-10 pages), you must generate a detailed list of subtopics. Generate as many subtopics as needed to cover 100% of the input text.
4. Clean Formatting: 
   - Use zero markdown asterisks (*). No bolding with asterisks.
   - Do NOT use HTML tags like <br>. Use newlines (\n) instead.
   - Use uppercase for main subtopic titles within the content block.
   - Double line breaks between paragraphs for readability.
5. Practice Integration: Each subtopic MUST have its own set of 3-5 multiple-choice practice questions.
6. Strict Adherence to Source Text: 
   - Extract and format ONLY the information provided in the input text.
   - DO NOT hallucinate, invent, or add extra grammar rules, examples, or concepts that are not present in the source text.
   - If the user provides a small amount of text, your output MUST be short and strictly based on that text. No extra generated content.

${customPrompt ? `[PRIORITY] USER'S CUSTOM INSTRUCTIONS: ${customPrompt}` : ""}

Return a STRICT JSON object only following the requested schema.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      subtopics: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            practice: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "answer", "explanation"]
              }
            }
          },
          required: ["title", "content", "practice"]
        }
      },
      quiz: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["question", "options", "answer", "explanation"]
        }
      }
    },
    required: ["title", "description", "subtopics", "quiz"]
  };

  try {
    const response = await callGemini({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: `Input text to analyze:\n${content}` }] }],
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema
      }
    }, 2, 1000, apiKeyOverride);

    const text = response.text || "{}";
    
    // Safety JSON parsing: handle optional markdown wrapping or stray text
    try {
      // 1. Try direct parse
      const sanitized = text.trim().replace(/,\s*([\]}])/g, '$1'); // Basic fix for trailing commas
      return JSON.parse(sanitized);
    } catch (e) {
      try {
        // 2. Try to extract JSON from code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        if (jsonMatch) {
          const extracted = jsonMatch[1].trim().replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(extracted);
        }
        
        // 3. Fallback: Find the first '{' and last '}'
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const possibleJson = text.substring(firstBrace, lastBrace + 1).replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(possibleJson.trim());
        }
      } catch (innerError) {
        console.error("JSON extraction failed. Raw text:", text);
      }
      throw new Error("Invalid format received from AI. Try again.");
    }
  } catch (error: any) {
    console.error("Grammar Lesson Generation failed:", error);
    throw error;
  }
}
