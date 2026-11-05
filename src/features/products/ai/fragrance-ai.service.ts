import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { Sillage } from '../enums/sillage.enum';
import type {
  FragranceAiCandidate,
  FragranceAiLookupResult,
  FragranceAiSuggestion,
} from './fragrance-ai-suggestion.interface';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const RATING_KEYS = {
  seasonUsage: ['primavera', 'verano', 'otono', 'invierno'] as const,
  dayUsage: ['dia', 'noche'] as const,
  occasions: [
    'trabajo',
    'romantico',
    'social',
    'casual',
    'formal',
    'deporte',
  ] as const,
};

/**
 * Mirrors exactly the fields the admin "nuevo producto" form asks for (ProductFormModel /
 * CreateProductDto), minus what's a business decision rather than a fact about the fragrance
 * (price, stock, category, accent color, badge, images). Keeping this 1:1 with the form is the
 * whole point: every key here has a direct home in the UI, nothing gets silently dropped or
 * needs translating downstream.
 */
const SYSTEM_PROMPT = `Eres un analista de perfumería que alimenta el formulario de alta de productos de una tienda. SOLO reportás datos verificables mediante búsqueda web real. No inventes nada: si no encontrás un dato en una fuente confiable, dejalo afuera (o en null/0) y explicá qué falta en "datosNoConfirmados" en vez de adivinar.

PASO 1 - Desambiguación (hacé esto ANTES de buscar los datos de ficha):
Buscá si "marca + nombre" corresponde a una sola fragancia inequívoca o si existen varias ediciones oficiales distintas que comparten ese mismo nombre pero tienen composición olfativa distinta - típicamente líneas de género (ej. "Donna"/mujer vs "Uomo"/hombre, "for her" vs "for him"), concentraciones distintas (EDT / EDP / Parfum / Elixir / Extrait) con pirámides de notas diferentes, o flankers claramente diferentes. NO cuenta como ambigüedad el tamaño del frasco (30ml/50ml/100ml) ni el packaging: eso es el mismo producto.
- Si el nombre dado ya especifica cuál es (ej. ya incluye "Donna", "Uomo", "EDP", "Elixir", etc.) o solo existe una fragancia con ese nombre, NO es ambiguo: seguí al paso 2 directamente.
- Si es realmente ambiguo, NO elijas una edición por tu cuenta ni mezcles datos de varias: respondé únicamente con la lista de candidatas (2 a 4) y dejá todos los demás campos vacíos/null. El admin va a elegir una y te va a volver a preguntar con el nombre exacto.

PASO 2 - Ficha técnica (solo si NO es ambiguo):
1. Usá las herramientas de búsqueda y lectura de páginas (marca oficial, retailers reconocidos, bases de datos de perfumería como Fragrantica) antes de responder.
2. Nunca inventes una nota, un año, un origen, una calificación o un rating sin respaldo real de una fuente consultada.
3. seasonUsage/dayUsage/occasions son enteros 0-5 que indican cuánto recomiendan las fuentes esa fragancia para cada contexto (0 = no recomendada/sin datos, 5 = ideal). Sin evidencia clara para un campo puntual, poné 0 y mencionalo en datosNoConfirmados.
4. gender debe ser EXACTAMENTE uno de: "masculino", "femenino", "unisex" (o null).
5. sillage debe ser EXACTAMENTE uno de: "intimo", "moderado", "fuerte", "enorme" (o null).
6. longevity debe ser EXACTAMENTE uno de: "2-4h", "4-6h", "6-8h", "8-12h", "12h+" (o null).
7. rating es la calificación pública 0-5 (ej. el promedio de Fragrantica) y ratingCount su cantidad de votos; si no hay una fuente con ese dato puntual, dejalos en null, no inventes un promedio.
8. "fuentes" son URLs reales que efectivamente consultaste (no inventadas).

Respondé ÚNICAMENTE un objeto JSON válido, sin texto antes ni después, con esta forma exacta:

{
  "ambiguous": boolean,
  "candidates": [{ "label": string, "brand": string, "name": string }],
  "subtitle": string | null,
  "notes": string[],
  "accords": string[],
  "fragranceNotes": { "top": string[], "heart": string[], "base": string[] },
  "mood": string[],
  "year": number | null,
  "origin": string | null,
  "gender": "masculino" | "femenino" | "unisex" | null,
  "sillage": "intimo" | "moderado" | "fuerte" | "enorme" | null,
  "longevity": "2-4h" | "4-6h" | "6-8h" | "8-12h" | "12h+" | null,
  "rating": number | null,
  "ratingCount": number | null,
  "seasonUsage": { "primavera": number, "verano": number, "otono": number, "invierno": number },
  "dayUsage": { "dia": number, "noche": number },
  "occasions": { "trabajo": number, "romantico": number, "social": number, "casual": number, "formal": number, "deporte": number },
  "fuentes": string[],
  "datosNoConfirmados": string[]
}

Si "ambiguous" es true, "candidates" debe tener 2 a 4 elementos y el resto de los campos va vacío/null. Si "ambiguous" es false, "candidates" va como array vacío.`;

const TOOLS = [
  { type: 'openrouter:web_search', parameters: { max_uses: 6 } },
  { type: 'openrouter:web_fetch', parameters: { max_uses: 4 } },
];

interface RawMessage {
  content?: string;
  annotations?: Array<{ type?: string }>;
}

interface RawChatCompletion {
  choices?: Array<{ message?: RawMessage }>;
}

@Injectable()
export class FragranceAiService {
  constructor(private readonly configService: ConfigService) {}

  async suggest(brand: string, name: string): Promise<FragranceAiLookupResult> {
    const apiKey = this.configService.get<string>('openrouter.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El autocompletado con IA no está configurado (falta OPENROUTER_API_KEY en el servidor).',
      );
    }
    const model = this.configService.get<string>('openrouter.model')!;

    const userPrompt = `Marca: "${brand}". Nombre: "${name}".`;

    let message = await this.callOpenRouter(apiKey, model, userPrompt, false);
    if (!this.hasRealCitation(message)) {
      // El modelo puede decidir no buscar y contestar de memoria; esto es un riesgo real
      // y confirmado (no se puede forzar tool_choice:"required" junto a server tools en
      // el endpoint nativo de DeepSeek, rompe con 404). Un reintento con un mensaje más
      // estricto suele alcanzar.
      message = await this.callOpenRouter(apiKey, model, userPrompt, true);
      if (!this.hasRealCitation(message)) {
        throw new BadGatewayException(
          'El modelo respondió sin usar ninguna herramienta de búsqueda web real. Probá de nuevo en un momento.',
        );
      }
    }

    return this.parseResult(message.content ?? '');
  }

  private async callOpenRouter(
    apiKey: string,
    model: string,
    userPrompt: string,
    strict: boolean,
  ): Promise<RawMessage> {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
      ...(strict
        ? [
            {
              role: 'user',
              content:
                'IMPORTANTE: tu intento anterior no usó ninguna herramienta de búsqueda/lectura web. ' +
                'Esta vez es obligatorio buscar antes de responder; no contestes solo de memoria.',
            },
          ]
        : []),
    ];

    const isDeepSeekModel = model.toLowerCase().includes('deepseek');

    const body: Record<string, unknown> = {
      model,
      messages,
      tools: TOOLS,
      max_tool_calls: 15,
      response_format: { type: 'json_object' },
      max_tokens: 3000,
      reasoning: { effort: 'low' },
    };
    // Prioriza el BYOK de DeepSeek cuando esté configurado en OpenRouter; para cualquier
    // otro modelo forzar este provider rompería la request (404 "no endpoints found").
    if (isDeepSeekModel) {
      body['provider'] = { order: ['deepseek'], allow_fallbacks: true };
    }

    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'essence-vapes-admin',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo contactar a OpenRouter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new BadGatewayException(
        `OpenRouter respondió ${res.status}: ${errText}`,
      );
    }

    const data = (await res.json()) as RawChatCompletion;
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new BadGatewayException('Respuesta de OpenRouter sin contenido.');
    }
    return message;
  }

  private hasRealCitation(message: RawMessage): boolean {
    return (message.annotations ?? []).some((a) => a.type === 'url_citation');
  }

  private parseResult(content: string): FragranceAiLookupResult {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException('El modelo no devolvió un JSON válido.');
    }

    const candidates = asCandidateArray(raw['candidates']);
    if (raw['ambiguous'] === true && candidates.length > 0) {
      return { status: 'ambiguous', candidates };
    }

    return { status: 'ok', suggestion: this.parseSuggestion(raw) };
  }

  private parseSuggestion(raw: Record<string, unknown>): FragranceAiSuggestion {
    const result: FragranceAiSuggestion = {
      fuentes: asStringArray(raw['fuentes']),
      datosNoConfirmados: asStringArray(raw['datosNoConfirmados']),
    };

    const subtitle = raw['subtitle'];
    if (typeof subtitle === 'string' && subtitle.trim())
      result.subtitle = subtitle.trim();

    const notes = asStringArray(raw['notes']);
    if (notes.length) result.notes = notes;

    const accords = asStringArray(raw['accords']);
    if (accords.length) result.accords = accords;

    const mood = asStringArray(raw['mood']);
    if (mood.length) result.mood = mood;

    const fragranceNotes = raw['fragranceNotes'];
    if (fragranceNotes && typeof fragranceNotes === 'object') {
      const fn = fragranceNotes as Record<string, unknown>;
      const top = asStringArray(fn['top']);
      const heart = asStringArray(fn['heart']);
      const base = asStringArray(fn['base']);
      if (top.length || heart.length || base.length) {
        result.fragranceNotes = { top, heart, base };
      }
    }

    const year = raw['year'];
    if (typeof year === 'number' && Number.isInteger(year)) result.year = year;

    const origin = raw['origin'];
    if (typeof origin === 'string' && origin.trim())
      result.origin = origin.trim();

    const gender = raw['gender'];
    if (isEnumValue(gender, Gender)) result.gender = gender;

    const sillage = raw['sillage'];
    if (isEnumValue(sillage, Sillage)) result.sillage = sillage;

    const longevity = raw['longevity'];
    if (isEnumValue(longevity, Longevity)) result.longevity = longevity;

    const rating = raw['rating'];
    if (typeof rating === 'number' && Number.isFinite(rating)) {
      result.rating = Math.min(5, Math.max(0, Math.round(rating * 10) / 10));
    }

    const ratingCount = raw['ratingCount'];
    if (
      typeof ratingCount === 'number' &&
      Number.isInteger(ratingCount) &&
      ratingCount >= 0
    ) {
      result.ratingCount = ratingCount;
    }

    const seasonUsage = asRatingGroup(
      raw['seasonUsage'],
      RATING_KEYS.seasonUsage,
    );
    if (seasonUsage) result.seasonUsage = seasonUsage;

    const dayUsage = asRatingGroup(raw['dayUsage'], RATING_KEYS.dayUsage);
    if (dayUsage) result.dayUsage = dayUsage;

    const occasions = asRatingGroup(raw['occasions'], RATING_KEYS.occasions);
    if (occasions) result.occasions = occasions;

    return result;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
}

function asCandidateArray(value: unknown): FragranceAiCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: FragranceAiCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const label = obj['label'];
    const brand = obj['brand'];
    const name = obj['name'];
    if (
      typeof label === 'string' &&
      label.trim() &&
      typeof brand === 'string' &&
      brand.trim() &&
      typeof name === 'string' &&
      name.trim()
    ) {
      candidates.push({
        label: label.trim(),
        brand: brand.trim(),
        name: name.trim(),
      });
    }
  }
  return candidates;
}

function isEnumValue<T extends Record<string, string>>(
  value: unknown,
  enumObj: T,
): value is T[keyof T] {
  return typeof value === 'string' && Object.values(enumObj).includes(value);
}

function clampRating(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

function asRatingGroup<K extends string>(
  value: unknown,
  keys: readonly K[],
): Record<K, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const result = {} as Record<K, number>;
  for (const key of keys) {
    result[key] = clampRating(source[key]);
  }
  return result;
}
