import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty, GameMode } from "../types";

// Declaração para evitar erro TS2580
declare const process: any;

// Helper to safely get the API key
const getApiKey = () => {
  const win = window as any;
  if (typeof window !== 'undefined' && win.process && win.process.env && win.process.env.API_KEY) {
    return win.process.env.API_KEY;
  }
  return typeof process !== 'undefined' ? process.env.API_KEY : undefined;
};

// Singleton para a instância do Gemini
let aiInstance: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) {
      console.error("API Key is missing!");
      throw new Error("API Key não encontrada. Verifique as configurações.");
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

interface PlayerContext {
  streak: number;
  recentAccuracy?: number; // 0 to 1
}

// Backup questions in case AI fails partially or completely
const BACKUP_QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
    id: `backup-${i}`,
    text: i % 2 === 0 ? "Qual país sediou a Copa do Mundo de 2014?" : "Quem é o maior artilheiro da NBA?",
    options: i % 2 === 0 ? ["Brasil", "Alemanha", "África do Sul", "Rússia"] : ["LeBron James", "Kareem Abdul-Jabbar", "Michael Jordan", "Kobe Bryant"],
    correctAnswerIndex: 0,
    category: i % 2 === 0 ? "Futebol" : "Basquete",
    explanation: "Resposta gerada por backup.",
    difficulty: Difficulty.PRO
}));

export const generateQuestions = async (
  topic: string, 
  difficulty: Difficulty, 
  count: number = 5,
  mode: GameMode = GameMode.CLASSIC,
  previousQuestionTexts: string[] = [], // History to avoid duplicates
  playerContext?: PlayerContext // Dynamic difficulty adjustment
): Promise<Question[]> => {
  try {
    const ai = getAiClient();
    const model = "gemini-3-flash-preview";
    
    const safeTopic = topic.trim();

    // Simplified Prompt to reduce token usage and JSON errors
    const prompt = `
    Gere um quiz sobre: "${safeTopic}".
    Quantidade: ${count} perguntas.
    Dificuldade: ${difficulty}.
    Modo: ${mode}.
    
    Regras:
    1. Gere EXATAMENTE ${count} perguntas.
    2. 4 opções por pergunta.
    3. Responda em JSON estrito.
    4. Português do Brasil.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING }
              },
              correctAnswerIndex: { type: Type.INTEGER },
              category: { type: Type.STRING },
            },
            required: ["text", "options", "correctAnswerIndex", "category"]
          }
        }
      }
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error("Empty response");

    const parsedData = JSON.parse(rawJson);
    
    let questions: Question[] = parsedData.map((q: any, index: number) => ({
      ...q,
      id: `q-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
      explanation: q.explanation || "Sem explicação disponível.",
      difficulty: difficulty // Force requested difficulty to keep TS happy
    }));

    // FILLER LOGIC: If AI returned fewer questions than requested, fill with backup
    if (questions.length < count) {
        const missing = count - questions.length;
        const fillers = BACKUP_QUESTIONS.slice(0, missing).map(bq => ({
            ...bq,
            id: `filler-${Date.now()}-${Math.random()}`
        }));
        questions = [...questions, ...fillers];
    }

    return questions;

  } catch (error) {
    console.error("AI Generation Failed:", error);
    // Return full backup set to ensure game works
    return BACKUP_QUESTIONS.map(q => ({ ...q, id: `err-backup-${Math.random()}` }));
  }
};