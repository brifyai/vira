import { Injectable } from '@angular/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(environment.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async humanizeText(text: string): Promise<string> {
    if (!text) return '';

    try {
      const prompt = `Actúa como un redactor de noticias de radio/TV profesional. 
      
      Reescribe el siguiente texto para ser LEÍDO EN VOZ ALTA en un noticiero.
      
      Reglas CRÍTICAS para AUDIO NATURAL:
      1. Usa un lenguaje natural, fluido y directo.
      2. PUNTUACIÓN ESTRATÉGICA: Usa comas (,) para pausas breves y puntos (.) para pausas completas.
      3. ESTRUCTURA FLUIDA: Combina oraciones cortas o fragmentadas en párrafos coherentes. Ignora los saltos de línea del texto original si rompen el flujo natural de la frase.
      4. FRASES CORTAS: Evita oraciones interminables, pero mantén la cohesión. Sujeto + Verbo + Predicado.
      5. NÚMEROS EN TEXTO: Escribe "veinte mil" en lugar de "20.000". Escribe "por ciento" en lugar de "%".
      6. SIGLAS: La primera vez que aparezca una sigla, escribe su significado completo o escríbela separada por guiones si se deletrea (O-N-U).
      7. NO uses formato Markdown (nada de negritas, cursivas, encabezados).
      8. NO incluyas saludos ni frases introductorias ("Aquí tienes...", "Claro..."). Solo el texto de la noticia.
      9. EVITA URLs y correos electrónicos complejos.
      
      Texto original:
      ${text}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini Error:', error);
      throw error;
    }
  }

  async adjustContentToTime(text: string, targetSeconds: number): Promise<string> {
    if (!text) return '';

    try {
        const targetWords = Math.round((targetSeconds * 150) / 60); // 150 words per minute
        
        const prompt = `Actúa como un editor de noticias experto.
        
        Reescribe y ajusta la longitud del siguiente texto para que pueda ser leído en voz alta en aproximadamente ${targetSeconds} segundos (alrededor de ${targetWords} palabras).

        Instrucciones:
        1. Si el texto es muy largo, RESUME manteniendo los puntos clave.
        2. Si el texto es muy corto, EXPANDE agregando detalles de contexto o conectores naturales, sin inventar hechos.
        3. Mantén un tono periodístico, formal pero accesible.
        4. NO uses formato Markdown.
        5. El texto debe fluir naturalmente para ser leído (radio/TV).
        6. Objetivo de longitud: ~${targetWords} palabras.

        Texto original:
        ${text}`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error adjusting time:', error);
        throw error;
    }
  }

    async adjustToWordCount(text: string, targetWords: number): Promise<string> {
    if (!text) return '';

    try {
        const currentWords = text.split(/\s+/).length;
        const minWords = Math.floor(targetWords * 0.95); // 5% margin down
        const maxWords = Math.ceil(targetWords * 1.05);  // 5% margin up

        const prompt = `Actúa como un editor de noticias experto.

        OBJETIVO: Reescribir el siguiente texto para que tenga EXACTAMENTE alrededor de ${targetWords} palabras.
        
        Estado actual: ${currentWords} palabras.
        Meta: ${targetWords} palabras.

        Instrucciones:
        1. Si necesitas reducir: Resume, fusiona ideas, elimina redundancias.
        2. Si necesitas expandir: Agrega contexto, explicaciones o conectores (sin inventar datos).
        3. MANTÉN EL ESTILO DE NOTICIERO DE RADIO (fluido, hablado).
        4. Longitud permitida: entre ${minWords} y ${maxWords} palabras.

        Texto original:
        ${text}`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error adjusting word count:', error);
        throw error;
    }
  }

  async humanizeAndAdjustContent(text: string, targetSeconds: number): Promise<string> {
    if (!text) return '';

    try {
        const currentWords = text.split(/\s+/).length;
        const targetWords = Math.round((targetSeconds * 150) / 60); // 150 words per minute
        
        // Stricter limits to avoid overshooting (User feedback: prefers under than over)
        const minWords = Math.floor(targetWords * 0.90); // -10%
        const maxWords = targetWords; // Hard cap at target (0% margin upwards)

        const ratio = targetWords / currentWords;
        let strategyInstruction = "";

        if (ratio < 0.8) {
            strategyInstruction = `⚠️ ALERTA: DEBES REDUCIR EL TEXTO UN ${Math.round((1-ratio)*100)}%.
            - Elimina oraciones secundarias, citas no esenciales y detalles de fondo.
            - Fusiona párrafos.
            - Ve directo al grano.`;
        } else if (ratio > 1.2) {
            strategyInstruction = `⚠️ ALERTA: DEBES EXPANDIR EL TEXTO UN ${Math.round((ratio-1)*100)}%.
            - Agrega contexto explicativo (sin inventar noticias).
            - Usa conectores más elaborados.
            - Explica las implicancias de la noticia.`;
        } else {
            strategyInstruction = `AJUSTE FINO: El texto está cerca de la longitud deseada. Solo ajusta el estilo y fluidez.`;
        }

        const prompt = `Actúa como un editor de noticias de radio experto con un CRONÓMETRO ESTRICTO.

        METAS NUMÉRICAS (INVIOLABLES):
        - Palabras actuales: ${currentWords}
        - OBJETIVO EXACTO: ${targetWords} palabras.
        - Rango permitido: ${minWords} a ${maxWords} palabras.
        - TIEMPO AL AIRE: ${targetSeconds} segundos.

        ESTRATEGIA REQUERIDA:
        ${strategyInstruction}

        REGLAS DE FORMATO:
        1. Lenguaje hablado natural (Radio/TV).
        2. Puntuación estratégica para pausas de lectura.
        3. Números en letras ("veinte mil").
        4. TEXTO PLANO (Sin markdown, sin negritas).
        5. JAMÁS excedas de ${maxWords} palabras. Es mejor quedarse corto que pasarse.

        Texto original:
        ${text}`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error humanizing and adjusting:', error);
        throw error;
    }
  }
}
