import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty, GameMode } from "../types";

// Helper to safely get the API key from window.process (injected by env.js) or global process (build time)
// @ts-ignore
const apiKey = (typeof window !== 'undefined' && window.process && window.process.env) ? window.process.env.API_KEY : process.env.API_KEY;

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: apiKey });

interface PlayerContext {
  streak: number;
  recentAccuracy?: number; // 0 to 1
}

export const generateQuestions = async (
  topic: string, 
  difficulty: Difficulty, 
  count: number = 5,
  mode: GameMode = GameMode.CLASSIC,
  previousQuestionTexts: string[] = [], // History to avoid duplicates
  playerContext?: PlayerContext // Dynamic difficulty adjustment
): Promise<Question[]> => {
  try {
    const model = "gemini-3-flash-preview";
    
    // --- 1. Dynamic Difficulty Logic ---
    let difficultyContext = `O nível de dificuldade base desejado é: ${difficulty}.`;
    
    if (playerContext) {
      if (playerContext.streak > 4) {
        difficultyContext += ` O jogador está em uma sequência de vitórias (${playerContext.streak} acertos). Aumente significativamente a dificuldade. Pergunte sobre recordes específicos, anos exatos ou regras obscuras.`;
      } else if (playerContext.recentAccuracy !== undefined && playerContext.recentAccuracy < 0.4) {
        difficultyContext += ` O jogador está errando muito. Reduza ligeiramente a dificuldade focando em lendas muito famosas e regras básicas para recuperar a confiança.`;
      }
    }

    // --- 2. Mode Specific Instructions ---
    let modeInstruction = "";
    switch (mode) {
      case GameMode.SURVIVAL:
        modeInstruction = "MODO SOBREVIVÊNCIA: As perguntas devem ser progressivamente punitivas. Evite o óbvio. Foque em detalhes que eliminam jogadores casuais.";
        break;
      case GameMode.TIME_ATTACK:
        modeInstruction = "MODO CONTRA O TEMPO: As perguntas e opções devem ser CURTAS e de leitura rápida. O foco é velocidade de raciocínio.";
        break;
      default:
        modeInstruction = "MODO CLÁSSICO: Mantenha um equilíbrio entre curiosidades divertidas e estatísticas técnicas.";
    }

    // --- 3. Anti-Repetition Logic ---
    // We pass the last 15 questions to avoid blowing up token context too much
    const avoidanceList = previousQuestionTexts.slice(-15).map(t => `"${t}"`).join(", ");
    const avoidanceInstruction = avoidanceList.length > 0 
      ? `IMPORTANTE: NÃO repita nem gere variações muito próximas das seguintes perguntas já feitas: [${avoidanceList}].`
      : "";

    const prompt = `
    Você é um motor de jogo de Trivia Esportiva Competitiva (Sports Quiz Arena).
    
    Tópico: "${topic}"
    Quantidade: ${count} perguntas
    ${difficultyContext}
    ${modeInstruction}
    ${avoidanceInstruction}
    
    Regras Estritas de Conteúdo:
    1. Gere EXATAMENTE ${count} perguntas.
    2. 4 opções de resposta por pergunta.
    3. Responda EXCLUSIVAMENTE em Português do Brasil (PT-BR).
    4. O campo 'difficulty' deve ser preenchido com: 'Novato', 'Profissional', 'Craque' ou 'Lenda', baseado na sua avaliação da pergunta gerada.
    5. No campo 'explanation', dê um contexto educativo curto (máx 150 caracteres).
    6. As perguntas devem ser factuais e livres de ambiguidade.
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
              text: { type: Type.STRING, description: "O texto da pergunta em Português" },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array de 4 possíveis respostas em Português"
              },
              correctAnswerIndex: { type: Type.INTEGER, description: "Índice (0-3) da resposta correta" },
              category: { type: Type.STRING, description: "Esporte específico ou subcategoria" },
              explanation: { type: Type.STRING, description: "Fato curto e interessante explicando a resposta" },
              difficulty: { type: Type.STRING, description: "Nível estimado: Novato, Profissional, Craque, Lenda" }
            },
            required: ["text", "options", "correctAnswerIndex", "category", "explanation", "difficulty"]
          }
        }
      }
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    const parsedData = JSON.parse(rawJson);

    // Map to our internal ID structure and validate
    return parsedData.map((q: any, index: number) => ({
      ...q,
      id: `q-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
      // Ensure difficulty matches our enum, fallback to requested difficulty if AI hallucinates a new string
      difficulty: Object.values(Difficulty).includes(q.difficulty) ? q.difficulty : difficulty
    }));

  } catch (error) {
    console.error("Failed to generate questions:", error);
    // Minimal Fallback to keep game alive
    return [
      {
        id: `fallback-${Date.now()}`,
        text: "Quem é conhecido como 'O Rei do Futebol'?",
        options: ["Maradona", "Pelé", "Messi", "Zico"],
        correctAnswerIndex: 1,
        category: "Futebol",
        explanation: "Pelé venceu 3 Copas do Mundo.",
        difficulty: Difficulty.ROOKIE
      }
    ];
  }
};