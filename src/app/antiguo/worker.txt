var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker-azure.js
var worker_azure_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }
    try {
      const { text, voice, speed } = await request.json();
      if (!text || text.trim().length === 0) {
        return new Response(JSON.stringify({
          error: "El texto no puede estar vac\xEDo"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (text.length > 2500) {
        return new Response(JSON.stringify({
          error: "El texto no puede exceder 2500 caracteres"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const speechRate = speed && speed >= 0.5 && speed <= 1.5 ? speed : 1;
      const validVoices = [
        // Voces masculinas
        "es-MX-JorgeNeural",
        // Hombre formal/profesional
        "es-US-AlonsoNeural",
        // Hombre alegre/cálido
        "es-AR-TomasNeural",
        // Hombre juvenil/dinámico
        "es-CL-LorenzoNeural",
        // Hombre jovial/cercano
        // Voces femeninas
        "es-AR-ElenaNeural",
        // Mujer formal/profesional
        "es-MX-DaliaNeural",
        // Mujer alegre/expresiva
        "es-US-PalomaNeural",
        // Mujer juvenil/fresca
        "es-CL-CatalinaNeural"
        // Mujer jovial/amigable
      ];
      if (!voice || !validVoices.includes(voice)) {
        return new Response(JSON.stringify({
          error: "Voz no v\xE1lida"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const AZURE_API_KEY = env.AZURE_API_KEY;
      const AZURE_REGION = env.AZURE_REGION || "eastus";
      const AZURE_RESOURCE_NAME = env.AZURE_RESOURCE_NAME;
      if (!AZURE_API_KEY || AZURE_API_KEY === "TU_API_KEY_AQUI") {
        return new Response(JSON.stringify({
          error: "API Key de Azure no configurada",
          message: "Configura AZURE_API_KEY en las variables del Worker"
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      let lang = "es-CL";
      if (voice.startsWith("es-US")) lang = "es-US";
      else if (voice.startsWith("es-MX")) lang = "es-MX";
      else if (voice.startsWith("es-AR")) lang = "es-AR";
      let processedText = escapeXml(text).replace(/,/g, ',<break time="100ms"/>').replace(/\./g, '.<break time="140ms"/>').replace(/;/g, ';<break time="120ms"/>').replace(/:/g, ':<break time="100ms"/>').replace(/\?/g, '?<break time="250ms"/>').replace(/!/g, '!<break time="250ms"/>');
      const finalRate = 0.95 * speechRate;
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody rate="${finalRate}" pitch="0%" volume="+3%">${processedText}</prosody></voice></speak>`;
      console.log("=== DEBUG INFO ===");
      console.log("Voice:", voice);
      console.log("Language:", lang);
      console.log("User speed:", speechRate);
      console.log("Final rate:", finalRate);
      console.log("Text length:", text.length);
      console.log("SSML length:", ssml.length);
      console.log("Azure URL:", `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`);
      console.log("API Key length:", AZURE_API_KEY ? AZURE_API_KEY.length : 0);
      const azureUrl = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
      console.log("Intentando con endpoint:", azureUrl);
      const azureResponse = await fetch(azureUrl, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": AZURE_API_KEY,
          "Content-Type": "application/ssml+xml",
          // Usar formato de máxima calidad: 48kHz con codificación de alta fidelidad
          "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
          "User-Agent": "CloudflareWorker"
        },
        body: ssml
      });
      if (!azureResponse.ok) {
        let errorText = "";
        try {
          errorText = await azureResponse.text();
        } catch (e) {
          errorText = "No se pudo leer el error";
        }
        console.error("Azure API Error:", errorText);
        console.error("Azure Status:", azureResponse.status);
        console.error("SSML enviado:", ssml);
        let errorMessage = "Error al generar el audio con Azure";
        if (azureResponse.status === 401) {
          errorMessage = "API Key inv\xE1lida o expirada";
        } else if (azureResponse.status === 403) {
          errorMessage = "Acceso denegado - verifica tu suscripci\xF3n de Azure";
        } else if (azureResponse.status === 400) {
          errorMessage = "Solicitud inv\xE1lida";
        }
        return new Response(JSON.stringify({
          error: errorMessage,
          status: azureResponse.status,
          azureError: errorText,
          region: AZURE_REGION,
          voice,
          textLength: text.length
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const audioBuffer = await azureResponse.arrayBuffer();
      if (audioBuffer.byteLength === 0) {
        throw new Error("El audio generado est\xE1 vac\xEDo");
      }
      return new Response(audioBuffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg"
        }
      });
    } catch (error) {
      console.error("Error al generar audio:", error);
      return new Response(JSON.stringify({
        error: "Error al generar el audio",
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(escapeXml, "escapeXml");
export {
  worker_azure_default as default
};
//# sourceMappingURL=worker-azure.js.map
