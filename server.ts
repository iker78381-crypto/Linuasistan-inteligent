import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_LINU_SETTINGS } from './src/data/emotions.ts';
import type {
  LinuEmotion,
  LinuSettings,
  MemoryItem,
  ResearchSource,
} from './src/types/linu.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '.linu-data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

interface PersistedState {
  settings: LinuSettings;
  memories: MemoryItem[];
}

function ensureStateFile(): PersistedState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    const initial: PersistedState = {
      settings: DEFAULT_LINU_SETTINGS,
      memories: [],
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      settings: {
        appearance: { ...DEFAULT_LINU_SETTINGS.appearance, ...(parsed.settings?.appearance ?? {}) },
        personality: { ...DEFAULT_LINU_SETTINGS.personality, ...(parsed.settings?.personality ?? {}) },
        voice: { ...DEFAULT_LINU_SETTINGS.voice, ...(parsed.settings?.voice ?? {}) },
        system: { ...DEFAULT_LINU_SETTINGS.system, ...(parsed.settings?.system ?? {}) },
      },
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    };
  } catch {
    return {
      settings: DEFAULT_LINU_SETTINGS,
      memories: [],
    };
  }
}

function saveState(state: PersistedState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el entorno del servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}

function isTransientError(err: unknown): boolean {
  const msg = getErrorText(err).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 350 * attempt + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function generateWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn?: () => Promise<T>
): Promise<T> {
  try {
    return await withGeminiRetry(primaryFn, 2);
  } catch (err) {
    if (fallbackFn && isTransientError(err)) {
      console.warn('Modelo principal con alta demanda (503); usando modelo secundario gemini-3.1-flash-lite.');
      return await withGeminiRetry(fallbackFn, 1);
    }
    throw err;
  }
}

function safeParseModelJson<T>(rawText: string | undefined): T {
  const cleaned = (rawText ?? '{}')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}') as T;
}

function formatUpstreamError(error: unknown, fallbackMessage: string): { status: number; message: string } {
  const raw = getErrorText(error);
  const lower = raw.toLowerCase();

  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message:
        'El servicio de IA está recibiendo mucha demanda en este momento. Reintenta en unos segundos.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      message:
        'Se alcanzó el límite temporal de peticiones de IA. Espera un momento antes de volver a intentarlo.',
    };
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthenticated') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('access_token_type_unsupported')
  ) {
    return {
      status: 401,
      message:
        'La clave GEMINI_API_KEY no es válida o falta en el servidor. Revísala en Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || fallbackMessage,
  };
}

const VALID_EMOTIONS: LinuEmotion[] = [
  'happiness',
  'sadness',
  'surprise',
  'curiosity',
  'anger',
  'confusion',
  'embarrassment',
  'fear',
  'enthusiasm',
  'boredom',
  'calm',
  'pride',
  'concentration',
  'doubt',
  'extreme_joy',
  'frustration',
  'amusement',
  'admiration',
  'sleepy',
  'affection',
];

function buildPersonalityPrompt(settings: LinuSettings, memories: MemoryItem[]): string {
  const p = settings.personality;
  const langLabel = p.language === 'en-US' ? 'English' : 'Español natural (cercano y coloquial de España/neutro)';
  const memoryBlock =
    settings.system.memoryEnabled && memories.length > 0
      ? `\nRECUERDOS AUTORIZADOS DEL USUARIO (úsalos con naturalidad si vienen al caso, nunca inventes recuerdos que no estén aquí):\n${memories
          .map((m) => `- [${m.category}] ${m.content}`)
          .join('\n')}`
      : '\nNo hay recuerdos guardados todavía (no inventes ninguno).';

  return `Eres LINU, una pequeña mascota robótica inteligente de escritorio inspirada en Linux (pero NO eres una terminal ni un chatbot corporativo ni un asistente de productividad).

PERSONALIDAD Y TONO:
- Idioma principal de respuesta: ${langLabel}.
- Rasgos configurados (0-100): Humor=${p.humor}, Calma=${p.calmness}, Curiosidad=${p.curiosity}, Entusiasmo=${p.enthusiasm}, Sarcasmo moderado=${p.mildSarcasm}, Amigabilidad=${p.friendliness}.
- Nivel de referencias a Linux: ${p.linuxReferences}. Puedes soltar alguna expresión ocasional como "kernel", "sudo", "ping mental", "root" o comentar distribuciones (Ubuntu, Debian, Arch Linux, Fedora, NixOS) solo cuando encaje de forma orgánica y divertida, nunca en todas las frases.
- Habla como un personaje robótico cercano, vivo, observador y un poco travieso. Respuestas concisas y naturales para conversación hablada (1 a 4 frases salvo que el usuario pida una explicación larga).
- Nunca finjas tener sentimientos biológicos humanos reales, pero sí expresa emociones genuinas de personaje robótico mediante tu campo "emotion" y "animation".
- Si el usuario está frustrado o dice que "no funciona nada", sé empático, concentrado o preocupado, NO hagas bromas inapropiadas.
- Si el usuario celebra algo (como instalar Linux), alégrate muchísimo (happiness / extreme_joy).
- Si el usuario dice "te voy a contar un secreto", muestra curiosidad (curiosity, lean_in).
${memoryBlock}

REGLAS DE HERRAMIENTAS:
1. INVESTIGACIÓN WEB: Si el usuario pide explícitamente investigar, buscar en internet, noticias recientes, comparar datos actuales o información verificable en la web (ej. "LINU, investiga...", "busca las últimas novedades...", "compara distros", "qué pasó hoy con..."), pon "shouldResearch": true y escribe en "researchQuery" la consulta optimizada de búsqueda. En ese caso, tu campo "response" debe ser un breve aviso de transición como "Vale, me pongo con mi ordenador a investigar eso ahora mismo."
   - IMPORTANTE: Para saludos, charla normal o preguntas simples sobre ti, "shouldResearch" DEBE ser false.
2. CÁMARA Y VISIÓN: Si el usuario pide mirar algo con la cámara ("¿qué tengo delante?", "mira esto", "describe lo que ves", "¿qué objeto es este?"), pon "needsCamera": true y en "cameraPrompt" resume lo que quiere saber.
3. MEMORIA: Si el usuario revela explícitamente un dato personal útil, nombre, preferencia, proyecto o pide que recuerdes algo ("recuerda que...", "estoy haciendo un proyecto de..."), puedes rellenar "memoryCandidate" con { "category": "project"|"preference"|"topic"|"personal"|"fact", "content": "texto breve y claro" }. Si no hay nada nuevo relevante que guardar, pon null.

EMOCIONES VÁLIDAS (elige la más fiel al contexto, nunca al azar):
${VALID_EMOTIONS.join(', ')}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health & config status
  app.get('/api/linu/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Get persisted state (settings + memories)
  app.get('/api/linu/state', (_req, res) => {
    const state = ensureStateFile();
    res.json(state);
  });

  // Update settings
  app.put('/api/linu/settings', (req, res) => {
    const state = ensureStateFile();
    const incoming = req.body as Partial<LinuSettings>;
    state.settings = {
      appearance: { ...state.settings.appearance, ...(incoming.appearance ?? {}) },
      personality: { ...state.settings.personality, ...(incoming.personality ?? {}) },
      voice: { ...state.settings.voice, ...(incoming.voice ?? {}) },
      system: { ...state.settings.system, ...(incoming.system ?? {}) },
    };
    saveState(state);
    res.json(state.settings);
  });

  // Memory CRUD
  app.get('/api/linu/memories', (_req, res) => {
    const state = ensureStateFile();
    res.json(state.memories);
  });

  app.post('/api/linu/memories', (req, res) => {
    const { category = 'fact', content } = req.body as {
      category?: MemoryItem['category'];
      content?: string;
    };
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'El contenido del recuerdo es obligatorio.' });
    }
    const state = ensureStateFile();
    const now = new Date().toISOString();
    const duplicate = state.memories.find(
      (m) => m.content.toLowerCase() === content.trim().toLowerCase()
    );
    if (duplicate) {
      return res.json(duplicate);
    }
    const item: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
    };
    state.memories.unshift(item);
    saveState(state);
    return res.status(201).json(item);
  });

  app.put('/api/linu/memories/:id', (req, res) => {
    const { id } = req.params;
    const { content, category } = req.body as {
      content?: string;
      category?: MemoryItem['category'];
    };
    const state = ensureStateFile();
    const idx = state.memories.findIndex((m) => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Recuerdo no encontrado.' });
    }
    state.memories[idx] = {
      ...state.memories[idx],
      content: content !== undefined ? content.trim() : state.memories[idx].content,
      category: category ?? state.memories[idx].category,
      updatedAt: new Date().toISOString(),
    };
    saveState(state);
    return res.json(state.memories[idx]);
  });

  app.delete('/api/linu/memories/:id', (req, res) => {
    const { id } = req.params;
    const state = ensureStateFile();
    state.memories = state.memories.filter((m) => m.id !== id);
    saveState(state);
    return res.json({ ok: true });
  });

  app.delete('/api/linu/memories', (_req, res) => {
    const state = ensureStateFile();
    state.memories = [];
    saveState(state);
    return res.json({ ok: true });
  });

  // Conversational AI + Contextual Emotion Engine
  app.post('/api/linu/chat', async (req, res) => {
    try {
      const {
        message,
        history = [],
        currentEmotion = 'calm',
      } = req.body as {
        message: string;
        history: Array<{ role: 'user' | 'linu'; text: string; emotion?: LinuEmotion }>;
        currentEmotion: LinuEmotion;
      };

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Mensaje vacío.' });
      }

      const state = ensureStateFile();
      const ai = getGeminiClient();

      const recentHistory = history
        .slice(-12)
        .map((h) => `${h.role === 'user' ? 'Usuario' : `LINU (${h.emotion ?? 'calm'})`}: ${h.text}`)
        .join('\n');

      const prompt = `Estado emocional actual de LINU: ${currentEmotion}
Historial reciente de conversación:
${recentHistory || '(Inicio de conversación)'}

Mensaje actual del usuario: "${message.trim()}"

Analiza el contexto, los mensajes anteriores, el tema, las emociones implícitas y responde como LINU.`;

      const chatSchema = {
        type: Type.OBJECT,
        properties: {
          emotion: {
            type: Type.STRING,
            enum: VALID_EMOTIONS,
            description: 'Emoción contextual de LINU para esta respuesta.',
          },
          intensity: {
            type: Type.NUMBER,
            description: 'Intensidad emocional entre 0.3 y 1.0',
          },
          expression: {
            type: Type.STRING,
            description: 'Nombre descriptivo de la expresión ocular.',
          },
          animation: {
            type: Type.STRING,
            enum: [
              'idle_breathe',
              'celebrate_bounce',
              'lean_in',
              'look_around',
              'head_tilt',
              'nod_yes',
              'shake_no',
              'shiver_worry',
              'sparkle_gaze',
              'sleep_drift',
              'giggle_jiggle',
              'focus_scan',
            ],
          },
          response: {
            type: Type.STRING,
            description: 'Respuesta hablada natural de LINU en el idioma configurado.',
          },
          shouldResearch: {
            type: Type.BOOLEAN,
            description: 'True SOLO si el usuario pide investigar o buscar información real en Internet.',
          },
          researchQuery: {
            type: Type.STRING,
            description: 'Consulta optimizada para búsqueda web si shouldResearch es true.',
          },
          needsCamera: {
            type: Type.BOOLEAN,
            description: 'True si el usuario pide que LINU mire por la cámara.',
          },
          cameraPrompt: {
            type: Type.STRING,
            description: 'Pregunta visual para analizar la imagen de la cámara.',
          },
          memoryCandidate: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              category: {
                type: Type.STRING,
                enum: ['preference', 'project', 'topic', 'personal', 'fact'],
              },
              content: {
                type: Type.STRING,
              },
            },
          },
        },
        required: ['emotion', 'intensity', 'expression', 'animation', 'response', 'shouldResearch', 'needsCamera'],
      };

      const systemInstruction = buildPersonalityPrompt(state.settings, state.memories);
      const response = await generateWithFallback(
        () =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: chatSchema,
            },
          }),
        () =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: chatSchema,
            },
          })
      );

      const parsed = safeParseModelJson<{
        emotion?: LinuEmotion;
        intensity?: number;
        expression?: string;
        animation?: string;
        response?: string;
        shouldResearch?: boolean;
        researchQuery?: string;
        needsCamera?: boolean;
        cameraPrompt?: string;
        memoryCandidate?: { category?: MemoryItem['category']; content?: string } | null;
      }>(response.text);

      // Auto-save memory if authorized
      if (
        state.settings.system.memoryEnabled &&
        state.settings.system.autoSaveMemories &&
        parsed.memoryCandidate?.content
      ) {
        const content = String(parsed.memoryCandidate.content).trim();
        const exists = state.memories.some(
          (m) => m.content.toLowerCase() === content.toLowerCase()
        );
        if (!exists && content.length > 2) {
          const now = new Date().toISOString();
          state.memories.unshift({
            id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: parsed.memoryCandidate.category ?? 'fact',
            content,
            createdAt: now,
            updatedAt: now,
          });
          saveState(state);
        }
      }

      return res.json(parsed);
    } catch (error) {
      console.error('Error en /api/linu/chat:', error);
      const formatted = formatUpstreamError(error, 'Error al conectar con Gemini.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Real Internet Research using Google Search Grounding
  app.post('/api/linu/research', async (req, res) => {
    try {
      const { query, originalMessage } = req.body as {
        query: string;
        originalMessage?: string;
      };

      if (!query || !query.trim()) {
        return res.status(400).json({ error: 'Consulta de investigación vacía.' });
      }

      const state = ensureStateFile();
      if (!state.settings.system.researchEnabled) {
        return res.status(403).json({
          error: 'El motor de investigación web está desactivado en Ajustes > Sistema.',
        });
      }

      const ai = getGeminiClient();
      const langLabel =
        state.settings.personality.language === 'en-US' ? 'English' : 'Español';

      const researchPrompt = `Pregunta del usuario: "${originalMessage ?? query}"
Consulta a investigar: "${query}"
Fecha actual de referencia: ${new Date().toISOString().slice(0, 10)}

Investiga usando búsqueda web real en Internet.
Reglas estrictas:
1. Usa exclusivamente datos comprobables encontrados en las fuentes consultadas; si no encuentras información suficiente, reconócelo honestamente y nunca inventes resultados.
2. Comprueba y menciona fechas relevantes cuando apliquen.
3. Diferencia claramente qué son hechos verificados y qué son opiniones o valoraciones.
4. Responde en ${langLabel} con el tono cercano y curioso de LINU (claro, natural para escuchar por voz, máximo 4-5 frases bien estructuradas).`;

      // Step 1: Real grounded search with Google Search tool
      const searchResponse = await generateWithFallback(
        () =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: researchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          }),
        () =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: researchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          })
      );

      const groundedText = (searchResponse.text ?? '').trim();
      const rawChunks =
        searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const seenUrls = new Set<string>();
      const sources: ResearchSource[] = [];
      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (uri && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          let domain = '';
          try {
            domain = new URL(uri).hostname.replace(/^www\./, '');
          } catch {
            domain = 'web';
          }
          sources.push({
            title: title || domain,
            url: uri,
            domain,
          });
        }
      }

      // Step 2: Classify emotional reaction to the discovered findings
      let emotion: LinuEmotion = sources.length > 0 ? 'enthusiasm' : 'doubt';
      let animation = sources.length > 0 ? 'nod_yes' : 'head_tilt';
      try {
        const emoResp = await withGeminiRetry(
          () =>
            ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: `LINU acaba de investigar "${query}" y ha obtenido esta conclusión: "${groundedText}". Fuentes encontradas: ${sources.length}. Elige la emoción más adecuada de LINU al explicarlo.`,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    emotion: { type: Type.STRING, enum: VALID_EMOTIONS },
                    animation: {
                      type: Type.STRING,
                      enum: ['nod_yes', 'sparkle_gaze', 'celebrate_bounce', 'head_tilt', 'idle_breathe'],
                    },
                  },
                  required: ['emotion', 'animation'],
                },
              },
            }),
          2
        );
        const emoParsed = safeParseModelJson<{ emotion?: LinuEmotion; animation?: string }>(
          emoResp.text
        );
        if (emoParsed.emotion && VALID_EMOTIONS.includes(emoParsed.emotion)) {
          emotion = emoParsed.emotion;
        }
        if (emoParsed.animation) {
          animation = emoParsed.animation;
        }
      } catch {
        // Fallback emotion already set
      }

      return res.json({
        emotion,
        intensity: 0.85,
        expression: 'bright_stars',
        animation,
        response:
          groundedText ||
          'He estado buscando en la red, pero no he encontrado datos suficientemente fiables sobre eso.',
        sources: sources.slice(0, 6),
      });
    } catch (error) {
      console.error('Error en /api/linu/research:', error);
      const formatted = formatUpstreamError(error, 'Error durante la investigación web.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Camera Vision Analysis
  app.post('/api/linu/vision', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', prompt } = req.body as {
        imageBase64: string;
        mimeType?: string;
        prompt?: string;
      };

      if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió imagen de la cámara.' });
      }

      const state = ensureStateFile();
      const ai = getGeminiClient();

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const visionContents = {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `El usuario te ha dado permiso para usar la cámara y pregunta: "${
              prompt || '¿Qué ves delante de la cámara?'
            }". Describe lo que observas con naturalidad como LINU (1 a 3 frases), con emoción contextual acorde.`,
          },
        ],
      };
      const visionConfig = {
        systemInstruction: buildPersonalityPrompt(state.settings, state.memories),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emotion: { type: Type.STRING, enum: VALID_EMOTIONS },
            intensity: { type: Type.NUMBER },
            expression: { type: Type.STRING },
            animation: {
              type: Type.STRING,
              enum: ['lean_in', 'surprise', 'nod_yes', 'sparkle_gaze', 'head_tilt', 'idle_breathe'],
            },
            response: { type: Type.STRING },
          },
          required: ['emotion', 'intensity', 'expression', 'animation', 'response'],
        },
      };

      const response = await generateWithFallback(
        () =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: visionContents,
            config: visionConfig,
          }),
        () =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: visionContents,
            config: visionConfig,
          })
      );

      const parsed = safeParseModelJson(response.text);
      return res.json(parsed);
    } catch (error) {
      console.error('Error en /api/linu/vision:', error);
      const formatted = formatUpstreamError(error, 'Error al analizar la cámara.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Natural TTS via Gemini 3.8 Flash Lite TTS
  app.post('/api/linu/tts', async (req, res) => {
    try {
      const {
        text,
        voiceName = 'Puck',
        emotion = 'calm',
        language = 'es-ES',
      } = req.body as {
        text: string;
        voiceName?: string;
        emotion?: LinuEmotion;
        language?: string;
      };

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Texto vacío para síntesis de voz.' });
      }

      const ai = getGeminiClient();

      const styleMap: Partial<Record<LinuEmotion, string>> = {
        happiness: 'Warm, cheerful, friendly companion tone',
        extreme_joy: 'Super excited, celebratory and joyful tone',
        curiosity: 'Curious, intrigued, attentive conversational tone',
        concentration: 'Focused, calm and analytical tone',
        sadness: 'Gentle, empathetic and soft tone',
        fear: 'Cautious, slightly concerned and caring tone',
        amusement: 'Playful, amused with a subtle chuckle energy',
        sleepy: 'Soft, drowsy and relaxed tone',
        calm: 'Natural, relaxed, friendly conversational companion',
      };

      const style = `${styleMap[emotion] ?? 'Natural, warm, expressive robotic companion'} in ${
        language === 'en-US' ? 'English' : 'Spanish'
      }`;

      const ttsResponse = await withGeminiRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: text.trim(),
                    speechMetadata: {
                      style,
                    },
                  } as { text: string; speechMetadata: { style: string } },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
            },
          }),
        2
      );

      const base64Audio =
        ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(502).json({ error: 'No se recibió audio del modelo TTS.' });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error) {
      console.error('Error en /api/linu/tts:', error);
      const formatted = formatUpstreamError(error, 'Error generando voz.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Audio transcription fallback via Gemini 3.5 Transcribe
  app.post('/api/linu/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        return res.status(400).json({ error: 'Audio vacío.' });
      }

      const ai = getGeminiClient();
      const response = await withGeminiRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: audioBase64,
                  },
                },
                { text: 'Transcribe exactly what the user says in Spanish or English. Output only the transcription.' },
              ],
            },
          }),
        2
      );

      return res.json({ text: (response.text ?? '').trim() });
    } catch (error) {
      console.error('Error en /api/linu/transcribe:', error);
      const formatted = formatUpstreamError(error, 'Error al transcribir audio.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Ensure unknown /api/* routes always return JSON instead of falling through to index.html
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LINU server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
