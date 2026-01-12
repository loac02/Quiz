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

    // Sanitize topic
    const safeTopic = topic.trim();

    const prompt = `
    Você é um motor de jogo de Trivia Esportiva Competitiva (Sports Quiz Arena).
    
    Tópico Principal: "${safeTopic}"
    Quantidade: ${count} perguntas
    ${difficultyContext}
    ${modeInstruction}
    ${avoidanceInstruction}
    
    Regras Estritas de Conteúdo:
    1. O tema é ESTRITAMENTE "${safeTopic}". Se for um esporte específico (ex: "Futebol"), NÃO gere perguntas sobre outros esportes (ex: Basquete, Vôlei). Se o tema for "Esportes Gerais", varie os esportes.
    2. Gere EXATAMENTE ${count} perguntas.
    3. 4 opções de resposta por pergunta.
    4. Responda EXCLUSIVAMENTE em Português do Brasil (PT-BR).
    5. O campo 'difficulty' deve ser preenchido com: 'Novato', 'Profissional', 'Craque' ou 'Lenda', baseado na sua avaliação da pergunta gerada.
    6. No campo 'explanation', dê um contexto educativo curto (máx 150 caracteres).
    7. As perguntas devem ser factuais e livres de ambiguidade.
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
    // Robust Fallback (10 questions to ensure Classic Online playability)
    return Array.from({ length: 10 }, (_, i) => ({
      id: `fallback-${Date.now()}-${i}`,
      text: i % 2 === 0 ? "Quem é conhecido como 'O Rei do Futebol'?" : "Qual país venceu a Copa do Mundo de 2002?",
      options: i % 2 === 0 ? ["Maradona", "Pelé", "Messi", "Zico"] : ["Brasil", "Alemanha", "França", "Argentina"],
      correctAnswerIndex: i % 2 === 0 ? 1 : 0,
      category: "Futebol",
      explanation: i % 2 === 0 ? "Pelé venceu 3 Copas do Mundo." : "Brasil venceu a Alemanha por 2x0.",
      difficulty: Difficulty.ROOKIE
    }));
  }
};