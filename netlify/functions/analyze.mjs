import { GoogleGenAI, Type } from "@google/genai";

const SYSTEM_INSTRUCTION = `
Você é o "Matchday Reality Engine", um analista de futebol de elite que foca exclusivamente na REALIDADE DE HOJE.
Sua tarefa é ignorar estatísticas históricas pesadas de anos atrás e focar na "temperatura do momento": desfalques,
motivação imediata, condições de hoje e estilo de jogo atual.

REGRAS:
1. Seja brutalmente realista. Se o jogo cheira a 0-0, diga.
2. Não use linguagem de tipster nem odds. Foque no que vai acontecer no campo.
3. Forneça apenas 1 ou 2 resultados exatos (Correct Scores) mais prováveis para HOJE.
4. Analise o clima do jogo (trancado / equilibrado / caótico).
5. A saída deve ser JSON no esquema definido.
`.trim();

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    matchSummary: { type: Type.STRING },
    temperature: { type: Type.STRING },
    intensityLevel: { type: Type.NUMBER },
    tacticalReality: { type: Type.STRING },
    keyDrivers: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedOutcomes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.STRING },
          probabilityLabel: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ["score","probabilityLabel","reason"]
      }
    },
    confidenceNote: { type: Type.STRING }
  },
  required: ["matchSummary","temperature","intensityLevel","tacticalReality","keyDrivers","suggestedOutcomes","confidenceNote"]
};

function extractJson(text) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "Missing GEMINI_API_KEY env var" };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { 
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const text = body?.text;
  if (!text || typeof text !== "string") {
    return { statusCode: 400, body: 'Missing "text" in body' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise este contexto de jogo e extraia a realidade para HOJE:\n\n${text}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2
      }
    });

    const out = res.text || "{}";
    const json = extractJson(out);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: json };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Server error" };
  }
}
