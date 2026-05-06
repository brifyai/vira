require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function getEnvValue(name) {
    const direct = process.env[name];
    if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();

    for (const [k, v] of Object.entries(process.env)) {
        if (k.trim() === name && typeof v === 'string' && v.trim().length > 0) return v.trim();
    }

    return '';
}

// Initialize Express app
const app = express();
app.use(cors({
    origin: '*', // Allow all origins (including localhost and Vercel)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for voice cloning audio uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Supabase client
const supabaseUrl =
  getEnvValue('SUPABASE_URL') ||
  getEnvValue('supabaseUrl') ||
  'https://themdawboacvgyyaftus.supabase.co';

const supabaseKey =
  getEnvValue('SUPABASE_SERVICE_ROLE_KEY') ||
  getEnvValue('SUPABASE_KEY') ||
  getEnvValue('SUPABASE_ANON_KEY') ||
  getEnvValue('supabaseAnonKey') ||
  'YOUR_SUPABASE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

const scrapingBeeApiKey =
  process.env.scrapingBeeApiKey ||
  process.env.SCRAPINGBEE_API_KEY ||
  'YOUR_SCRAPING_BEE_API_KEY';
const googleCloudTtsApiKey =
  process.env.googleCloudTtsApiKey ||
  process.env.GOOGLE_CLOUD_TTS_API_KEY ||
  'YOUR_GOOGLE_CLOUD_TTS_API_KEY';
const AZURE_API_KEY = process.env.AZURE_API_KEY || 'TU_API_KEY_AZURE'; // Configurar en Vercel Environment Variables
const AZURE_REGION = process.env.AZURE_REGION || 'eastus'; // Configurar en Vercel Environment Variables
const RUNPOD_API_KEY = getEnvValue('RUNPOD') || getEnvValue('RUNPOD_API_KEY');
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'YOUR_QWEN_API_KEY';
const MINIMAX_API_KEY = getEnvValue('REACT_MINIMAX_API_KEY');
const GROQ_API_KEY = getEnvValue('REACT_GROQ_API_KEY');
const CHATTERBOX_DEBUG = ['1', 'true', 'yes', 'on'].includes(getEnvValue('CHATTERBOX_DEBUG').toLowerCase());
const CRON_SECRET = getEnvValue('CRON_SECRET');

// --- Debug Environment Variables (Safe Log) ---
console.log('[Server] Starting...');
console.log('[Server] Environment Check:');
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`- AZURE_API_KEY Present: ${!!process.env.AZURE_API_KEY && process.env.AZURE_API_KEY !== 'TU_API_KEY_AZURE'}`);
console.log(`- AZURE_REGION: ${AZURE_REGION}`);
console.log(`- REACT_MINIMAX_API_KEY Present: ${!!MINIMAX_API_KEY}`);
console.log(`- REACT_GROQ_API_KEY Present: ${!!GROQ_API_KEY}`);
console.log(`- RUNPOD_API_KEY Present: ${!!RUNPOD_API_KEY}`);
console.log(`- CRON_SECRET Present: ${!!CRON_SECRET}`);
// ----------------------------------------------

// Helper for escaping XML
function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const withTimeout = async (promise, timeoutMs, reason = 'timeout') => {
    const ms = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Number(timeoutMs)) : 1;
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(reason)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (t) clearTimeout(t);
    }
};

const fetchWithTimeout = async (url, options = {}, timeout = 60000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const externalSignal = options?.signal;
    let onAbort;
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason);
        } else {
            onAbort = () => controller.abort(externalSignal.reason);
            try {
                externalSignal.addEventListener('abort', onAbort, { once: true });
            } catch (e) {}
        }
    }

    try {
        const { signal: _ignored, ...rest } = options || {};
        const response = await fetch(url, { ...rest, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    } finally {
        if (externalSignal && onAbort) {
            try {
                externalSignal.removeEventListener('abort', onAbort);
            } catch (e) {}
        }
    }
};

function normalizeTerm(input) {
    return String(input || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function pickBestGeocodingResult(results, { city, region } = {}) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return null;

    const cityNorm = normalizeTerm(city || '');
    const regionNorm = normalizeTerm(region || '');

    let best = list[0];
    let bestScore = -1;

    for (const r of list) {
        const nameNorm = normalizeTerm(String(r?.name || ''));
        const admin1Norm = normalizeTerm(String(r?.admin1 || ''));

        let score = 0;
        if (cityNorm) {
            if (nameNorm === cityNorm) score += 8;
            else if (nameNorm.startsWith(cityNorm)) score += 6;
            else if (nameNorm.includes(cityNorm)) score += 4;
        }
        if (regionNorm) {
            if (admin1Norm === regionNorm) score += 6;
            else if (admin1Norm.includes(regionNorm) || regionNorm.includes(admin1Norm)) score += 3;
        }
        if (String(r?.country_code || '').toUpperCase() === 'CL') score += 2;

        if (score > bestScore) {
            best = r;
            bestScore = score;
        }
    }

    return best || null;
}

function getWeatherDescription(code) {
    const codes = {
        0: 'cielo despejado',
        1: 'mayormente despejado',
        2: 'parcialmente nublado',
        3: 'nublado',
        45: 'neblina',
        48: 'escarcha',
        51: 'llovizna ligera',
        53: 'llovizna moderada',
        55: 'llovizna densa',
        61: 'lluvia ligera',
        63: 'lluvia moderada',
        65: 'lluvia fuerte',
        71: 'nieve ligera',
        73: 'nieve moderada',
        75: 'nieve fuerte',
        95: 'tormenta',
        96: 'tormenta con granizo ligero',
        99: 'tormenta con granizo fuerte'
    };
    const n = Number(code);
    return codes[n] || 'condiciones variables';
}

app.get('/api/geocoding/search', async (req, res) => {
    try {
        const name = String(req?.query?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'missing_name' });

        const count = Math.min(25, Math.max(1, Number(req?.query?.count || 10)));
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=es&format=json&country_code=CL`;
        const resp = await fetchWithTimeout(url, {}, 15000);
        const raw = await resp.text().catch(() => '');
        const json = raw ? JSON.parse(raw) : {};
        if (!resp.ok) return res.status(resp.status).json({ error: json?.reason || raw || 'geocoding_failed' });

        const results = Array.isArray(json?.results) ? json.results : [];
        const trimmed = results.map((r) => ({
            name: r?.name,
            admin1: r?.admin1,
            admin2: r?.admin2,
            country: r?.country,
            country_code: r?.country_code,
            latitude: r?.latitude,
            longitude: r?.longitude
        }));
        res.json({ results: trimmed });
    } catch (e) {
        res.status(500).json({ error: String(e?.message || e || 'internal_error') });
    }
});

app.get('/api/weather-for-location', async (req, res) => {
    try {
        const location = String(req?.query?.location || '').trim();
        if (!location) return res.status(400).json({ error: 'missing_location' });

        const searchStrategies = [location];
        let city;
        let region;
        if (location.includes(',')) {
            const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
            city = parts[0] || undefined;
            region = parts.length >= 2 ? parts[1] : undefined;
            if (parts.length >= 3) {
                searchStrategies.push(`${parts[0]} ${parts[2]}`);
                searchStrategies.push(`${parts[0]} ${parts[1]} ${parts[2]}`);
                searchStrategies.push(`${parts[0]} ${parts[1]}`);
            } else if (parts.length === 2) {
                searchStrategies.push(`${parts[0]} ${parts[1]}`);
            }
            if (parts[0]) searchStrategies.push(parts[0]);
        }

        let latitude;
        let longitude;
        for (const term of searchStrategies) {
            const t = String(term || '').trim();
            if (!t) continue;
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=10&language=es&format=json&country_code=CL`;
            const geoResp = await fetchWithTimeout(geoUrl, {}, 15000);
            const geoRaw = await geoResp.text().catch(() => '');
            const geoJson = geoRaw ? JSON.parse(geoRaw) : {};
            const results = Array.isArray(geoJson?.results) ? geoJson.results : [];
            if (geoResp.ok && results.length > 0) {
                const best = pickBestGeocodingResult(results, { city, region }) || results[0];
                latitude = best?.latitude;
                longitude = best?.longitude;
                if (latitude && longitude) break;
            }
        }

        if (!latitude || !longitude) return res.json({ weatherInfo: 'clima desconocido' });

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code&timezone=auto`;
        const wResp = await fetchWithTimeout(weatherUrl, {}, 15000);
        const wRaw = await wResp.text().catch(() => '');
        const wJson = wRaw ? JSON.parse(wRaw) : {};
        if (!wResp.ok) return res.status(wResp.status).json({ error: wJson?.reason || wRaw || 'weather_failed' });

        const current = wJson?.current;
        if (!current) return res.json({ weatherInfo: 'clima desconocido' });

        const temp = Math.round(Number(current?.temperature_2m));
        const condition = getWeatherDescription(current?.weather_code);
        res.json({ weatherInfo: `${temp}°C y ${condition}` });
    } catch (e) {
        res.status(500).json({ error: String(e?.message || e || 'internal_error') });
    }
});

function safeUrlForLog(url) {
    if (!url || typeof url !== 'string') return null;
    const withoutQuery = url.split('?')[0];
    return withoutQuery.length > 160 ? `${withoutQuery.slice(0, 160)}...` : withoutQuery;
}

function createRequestTag(prefix = 'cb') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function shortSha256(value) {
    const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function summarizeChatterboxInput(input) {
    const text = typeof input?.text === 'string' ? input.text : '';
    const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
    const t = text || prompt;
    return {
        task: input?.task,
        action: input?.action,
        model_name: input?.model_name,
        voice: input?.voice,
        voice_id: input?.voice_id,
        voiceId: input?.voiceId,
        language: input?.language,
        language_code: input?.language_code,
        languageCode: input?.languageCode,
        lang: input?.lang,
        language_id: input?.language_id,
        audioUrl: safeUrlForLog(input?.audioUrl || input?.audio_url),
        audio_prompt_url: safeUrlForLog(input?.audio_prompt_url || input?.audioPromptUrl || input?.audio_prompt_path || input?.audio_prompt),
        text_len: t ? t.length : 0,
        text_sha: t ? shortSha256(t) : null,
        temperature: input?.temperature,
        exaggeration: input?.exaggeration,
        speed: input?.speed,
        cfg_weight: input?.cfg_weight,
        cfgWeight: input?.cfgWeight,
        repetition_penalty: input?.repetition_penalty,
        min_p: input?.min_p,
        top_p: input?.top_p,
        seed: input?.seed,
        use_cpu: input?.use_cpu,
        keep_model_loaded: input?.keep_model_loaded
    };
}

async function preflightPublicUrl(url) {
    if (!url || typeof url !== 'string') return { ok: false, reason: 'missing_url' };
    if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'not_http_url' };

    try {
        const head = await fetchWithTimeout(url, { method: 'HEAD' }, 12000).catch(() => null);
        if (head && head.ok) {
            const contentType = head.headers.get('content-type') || null;
            const contentLength = head.headers.get('content-length') || null;
            return { ok: true, contentType, contentLength };
        }
    } catch (e) {}

    try {
        const get = await fetchWithTimeout(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' }
        }, 15000);
        if (!get.ok) {
            return { ok: false, reason: `http_${get.status}` };
        }
        const contentType = get.headers.get('content-type') || null;
        const contentLength = get.headers.get('content-length') || null;
        return { ok: true, contentType, contentLength };
    } catch (e) {
        return { ok: false, reason: 'fetch_failed' };
    }
}

const RUNPOD_ENDPOINT_NAME = 'Chatterbox-Vira';
const RUNPOD_ENDPOINT_ID =
    getEnvValue('CHATTERBOX_RUNPOD_ENDPOINT_ID') ||
    getEnvValue('RUNPOD_ENDPOINT_ID') ||
    getEnvValue('RUNPOD_CHATTERBOX_ENDPOINT_ID') ||
    '';
const RUNPOD_TTS_ENDPOINT_ID =
    getEnvValue('CHATTERBOX_TTS_RUNPOD_ENDPOINT_ID') ||
    getEnvValue('RUNPOD_CHATTERBOX_TTS_ENDPOINT_ID') ||
    '';
const RUNPOD_VOICE_ENDPOINT_ID =
    getEnvValue('CHATTERBOX_VOICE_RUNPOD_ENDPOINT_ID') ||
    getEnvValue('RUNPOD_CHATTERBOX_VOICE_ENDPOINT_ID') ||
    '';

const runpodEndpointCache = new Map();

function getCachedEndpoint(cacheKey) {
    const cached = runpodEndpointCache.get(cacheKey);
    if (!cached) return null;
    if ((Date.now() - cached.fetchedAt) > 5 * 60 * 1000) return null;
    return cached.id || null;
}

function setCachedEndpoint(cacheKey, id) {
    runpodEndpointCache.set(cacheKey, { id, fetchedAt: Date.now() });
}

async function getRunpodEndpointIdByName(name, options = {}) {
    const { cacheKey = 'default', preferredId = '' } = options || {};
    const now = Date.now();

    const cachedId = getCachedEndpoint(cacheKey);
    if (cachedId) return cachedId;

    const directPreferred = String(preferredId || '').trim();
    if (directPreferred) {
        setCachedEndpoint(cacheKey, directPreferred);
        return directPreferred;
    }

    if (RUNPOD_ENDPOINT_ID) {
        setCachedEndpoint(cacheKey, RUNPOD_ENDPOINT_ID);
        return RUNPOD_ENDPOINT_ID;
    }

    if (!RUNPOD_API_KEY) {
        throw new Error('RUNPOD_API_KEY no configurada');
    }

    const resp = await fetchWithTimeout('https://rest.runpod.io/v1/endpoints', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`
        }
    }, 20000);

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Runpod endpoints list failed (${resp.status}): ${body}`);
    }

    const endpoints = await resp.json().catch(() => []);
    const match = Array.isArray(endpoints)
        ? endpoints.find(e => (e?.name || '').toLowerCase() === String(name).toLowerCase())
        : null;

    const id = match?.id || null;
    if (!id) {
        throw new Error(`No se encontró endpoint Runpod con nombre: ${name}. Configura CHATTERBOX_RUNPOD_ENDPOINT_ID (ej: 27ia91v5tb9k75) en producción.`);
    }

    setCachedEndpoint(cacheKey, id);
    return id;
}

async function runpodRunSync(endpointId, input, policy) {
    const resp = await fetchWithTimeout(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input,
            ...(policy ? { policy } : {})
        })
    }, 180000);

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
        const err = new Error(`Runpod runsync failed (${resp.status}): ${bodyText}`);
        err.statusCode = resp.status;
        err.bodyText = bodyText;
        throw err;
    }

    try {
        return JSON.parse(bodyText);
    } catch (e) {
        throw new Error('Respuesta inválida de Runpod (JSON parse error)');
    }
}

async function runpodRun(endpointId, input, policy) {
    const resp = await fetchWithTimeout(`https://api.runpod.ai/v2/${endpointId}/run`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input,
            ...(policy ? { policy } : {})
        })
    }, 30000);

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
        const err = new Error(`Runpod run failed (${resp.status}): ${bodyText}`);
        err.statusCode = resp.status;
        err.bodyText = bodyText;
        throw err;
    }

    try {
        return JSON.parse(bodyText);
    } catch (e) {
        throw new Error('Respuesta inválida de Runpod (JSON parse error)');
    }
}

async function runpodGetStatus(endpointId, requestId) {
    const resp = await fetchWithTimeout(`https://api.runpod.ai/v2/${endpointId}/status/${requestId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`
        }
    }, 20000);

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
        const err = new Error(`Runpod status failed (${resp.status}): ${bodyText}`);
        err.statusCode = resp.status;
        err.bodyText = bodyText;
        throw err;
    }

    try {
        return JSON.parse(bodyText);
    } catch (e) {
        throw new Error('Respuesta inválida de Runpod (JSON parse error)');
    }
}

function isRunpodTerminalStatus(status) {
    const s = String(status || '').toUpperCase();
    return s === 'COMPLETED' || s === 'COMPLETED_WITH_WARNINGS' || s === 'FAILED' || s === 'CANCELLED';
}

function isRunpodCompletedStatus(status) {
    const s = String(status || '').toUpperCase();
    return s === 'COMPLETED' || s === 'COMPLETED_WITH_WARNINGS';
}

async function runpodRunSmart(endpointId, input, policy) {
    try {
        return await runpodRunSync(endpointId, input, policy);
    } catch (e) {
        const status = e?.statusCode;
        const bodyText = String(e?.bodyText || e?.message || '');
        const looksUnsupported = status === 404 || status === 405 || /runsync/i.test(bodyText);
        if (!looksUnsupported) throw e;
    }

    const started = await runpodRun(endpointId, input, policy);
    const requestId = started?.id || started?.requestId || started?.request_id;
    if (!requestId) {
        throw new Error('Respuesta inválida de Runpod /run: falta id');
    }

    const deadlineMs = Date.now() + 180000;
    while (Date.now() < deadlineMs) {
        const statusJson = await runpodGetStatus(endpointId, requestId);
        const s = String(statusJson?.status || '').toUpperCase();
        if (s === 'COMPLETED' || s === 'COMPLETED_WITH_WARNINGS') return statusJson;
        if (s === 'FAILED' || s === 'CANCELLED') {
            throw new Error(`Runpod job ${s}: ${JSON.stringify(statusJson?.error || statusJson?.output || statusJson)}`);
        }
        await new Promise(r => setTimeout(r, 1200));
    }

    throw new Error('Timeout esperando respuesta de Runpod');
}

function findFirstValue(obj, candidates) {
    for (const key of candidates) {
        const value = obj?.[key];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return null;
}

function extractRunpodOutput(json) {
    if (!json) return null;
    if (json.output) return json.output;
    if (json.data?.output) return json.data.output;
    if (json.result?.output) return json.result.output;
    return null;
}

function detectAudioContentType(buffer, audioBase64) {
    const header = buffer?.subarray?.(0, 16);
    if (header && header.length >= 12) {
        const ascii = header.toString('ascii', 0, 12);
        if (ascii.startsWith('RIFF') && ascii.includes('WAVE')) return 'audio/wav';
        if (ascii.startsWith('OggS')) return 'audio/ogg';
        if (ascii.startsWith('fLaC')) return 'audio/flac';
        if (ascii.startsWith('ID3')) return 'audio/mpeg';
    }
    const b64 = (audioBase64 || '').trim();
    if (b64.startsWith('UklGR')) return 'audio/wav';
    if (b64.startsWith('SUQz') || b64.startsWith('/+MY')) return 'audio/mpeg';
    return 'application/octet-stream';
}

function deepFindFirstString(obj, candidates, maxDepth = 6) {
    const visited = new Set();
    const queue = [{ value: obj, depth: 0 }];

    while (queue.length) {
        const { value, depth } = queue.shift();
        if (!value || typeof value !== 'object') continue;
        if (visited.has(value)) continue;
        visited.add(value);

        for (const key of candidates) {
            const v = value?.[key];
            if (typeof v === 'string' && v.length > 0) return v;
        }

        if (depth >= maxDepth) continue;
        if (Array.isArray(value)) {
            for (const item of value) queue.push({ value: item, depth: depth + 1 });
        } else {
            for (const v of Object.values(value)) queue.push({ value: v, depth: depth + 1 });
        }
    }

    return null;
}

function looksLikeAudioBase64(s) {
    if (!s || typeof s !== 'string') return false;
    const v = s.trim();
    if (v.startsWith('data:audio/')) return true;
    if (v.startsWith('UklGR')) return true;
    if (v.startsWith('SUQz') || v.startsWith('/+MY')) return true;
    if (v.length < 2000) return false;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(v)) return false;
    return true;
}

function deepFindAudioLikeBase64(obj, maxDepth = 6) {
    const visited = new Set();
    const queue = [{ value: obj, depth: 0 }];

    while (queue.length) {
        const { value, depth } = queue.shift();
        if (!value) continue;

        if (typeof value === 'string') {
            if (looksLikeAudioBase64(value)) return value;
            continue;
        }

        if (typeof value !== 'object') continue;
        if (visited.has(value)) continue;
        visited.add(value);

        if (depth >= maxDepth) continue;
        if (Array.isArray(value)) {
            for (const item of value) queue.push({ value: item, depth: depth + 1 });
        } else {
            for (const v of Object.values(value)) queue.push({ value: v, depth: depth + 1 });
        }
    }

    return null;
}

function deepFindHttpAudioUrl(obj, maxDepth = 6) {
    const visited = new Set();
    const queue = [{ value: obj, depth: 0 }];

    while (queue.length) {
        const { value, depth } = queue.shift();
        if (!value) continue;

        if (typeof value === 'string') {
            const v = value.trim();
            if (/^https?:\/\//i.test(v) && /\.(wav|mp3|ogg|flac)(\?|$)/i.test(v)) return v;
            continue;
        }

        if (typeof value !== 'object') continue;
        if (visited.has(value)) continue;
        visited.add(value);

        if (depth >= maxDepth) continue;
        if (Array.isArray(value)) {
            for (const item of value) queue.push({ value: item, depth: depth + 1 });
        } else {
            for (const v of Object.values(value)) queue.push({ value: v, depth: depth + 1 });
        }
    }

    return null;
}

function sanitizeForError(value, maxLen = 600) {
    if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(v => sanitizeForError(v, maxLen));

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'string') out[k] = sanitizeForError(v, maxLen);
        else if (v && typeof v === 'object') out[k] = '[object]';
        else out[k] = v;
    }
    return out;
}

function extractAudioFromOutput(output) {
    const audioBase64 =
        deepFindFirstString(output, ['audio_base64', 'audioBase64', 'wav_base64', 'mp3_base64', 'audio', 'wav', 'mp3']) ||
        deepFindAudioLikeBase64(output);
    const audioUrl =
        deepFindFirstString(output, ['audio_url', 'audioUrl', 'url', 'wav_url', 'mp3_url']) ||
        deepFindFirstString(output, ['audioURL', 'audioURI']) ||
        deepFindHttpAudioUrl(output);
    return { audioBase64, audioUrl };
}

const scrapeHandler = async (req, res) => {
    // console.log('Scrape request received:', req.body);
    const startTime = Date.now();

    const sendUpdate = typeof req?.onScrapeUpdate === 'function' ? req.onScrapeUpdate : () => {};
    const signal = req?.abortSignal || req?.signal;
    const ensureNotAborted = () => {
        if (signal?.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            throw err;
        }
    };

    try {
        ensureNotAborted();
        const { sources, runId, concurrency, articlesPerSource, articles_per_source, dedupGlobalLimit, dedup_global_limit } = req.body || {};

        if (!sources || !Array.isArray(sources) || sources.length === 0) {
            return res.status(400).json({ error: 'No sources provided' });
        }

        // Get active sources from Supabase
        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('*')
            .in('id', sources)
            .eq('is_active', true);

        if (sourcesError) {
            console.error('Error fetching sources:', sourcesError);
            return res.status(500).json({ error: sourcesError.message });
        }

        if (!sourcesData || sourcesData.length === 0) {
            return res.status(404).json({ error: 'No active sources found' });
        }

        // console.log(`Processing ${sourcesData.length} sources`);
        sendUpdate({ type: 'start', total: sourcesData.length, message: `Iniciando análisis de ${sourcesData.length} fuentes...` });

        // Scrape sources with concurrency limit
        const CONCURRENT_SOURCES = Number.isFinite(Number(concurrency)) ? Math.max(1, Math.min(10, Number(concurrency))) : 6;
        const rawAps = articlesPerSource ?? articles_per_source;
        const ARTICLES_PER_SOURCE = Number.isFinite(Number(rawAps)) ? Math.max(1, Math.min(10, Number(rawAps))) : 3;
        const scrapedNews = [];
        const perSource = [];
        let processedCount = 0;
        let savedCount = 0;
        let creditsUsed = null;
        let creditsRemaining = null;
        let creditsDepleted = false;
        const globalSeenUrls = new Set();
        const globalExistingUrls = new Set();
        const parseCreditNumber = (value) => {
            if (value === null || value === undefined) return null;
            const n = Number(String(value).trim());
            return Number.isFinite(n) ? n : null;
        };
        const updateCreditsFromResponse = (resp) => {
            try {
                if (!resp || !resp.headers) return;
                const used = parseCreditNumber(resp.headers.get('Spb-Used-Credits'));
                const remaining = parseCreditNumber(resp.headers.get('Spb-Remaining-Credits'));
                if (used !== null) creditsUsed = used;
                if (remaining !== null) creditsRemaining = remaining;
                if (creditsRemaining !== null && creditsRemaining <= 0) creditsDepleted = true;
            } catch (e) {}
        };
        const markCreditsDepleted = (reason) => {
            if (creditsDepleted) return;
            creditsDepleted = true;
            sendUpdate({ type: 'warning', message: `Scraping finaliza por falta de créditos (${reason || 'sin_detalle'}).` });
        };
        const safeInsertScrapedNews = async (items) => {
            const rows = Array.isArray(items) ? items.filter(Boolean) : [];
            if (!rows.length) return 0;
            ensureNotAborted();
            try {
                const { error } = await supabase.from('scraped_news').insert(rows);
                if (error) throw error;
                return rows.length;
            } catch (e) {
                let ok = 0;
                for (const row of rows) {
                    ensureNotAborted();
                    try {
                        const { error } = await supabase.from('scraped_news').insert(row);
                        if (error) throw error;
                        ok += 1;
                    } catch (inner) {
                        sendUpdate({ type: 'warning', message: 'No se pudo guardar una noticia. Se omite.' });
                    }
                }
                return ok;
            }
        };

        try {
            ensureNotAborted();
            const rawLimit = dedupGlobalLimit ?? dedup_global_limit;
            const globalLimit = Number.isFinite(Number(rawLimit)) ? Math.max(200, Math.min(20000, Number(rawLimit))) : 5000;
            const { data: recentGlobal } = await supabase
                .from('scraped_news')
                .select('original_url')
                .order('created_at', { ascending: false })
                .limit(globalLimit);
            for (const row of recentGlobal || []) {
                if (row?.original_url) globalExistingUrls.add(row.original_url);
            }
        } catch (e) {
            console.warn('[WARN] Could not preload global existing URLs for dedup:', e?.message || e);
        }

        // Helper function to process a single source
        const processSource = async (source) => {
            // ... (existing scraping logic)
            // console.log(`[START] Scraping source: ${source.name} (${source.url})`);
            if (creditsDepleted) {
                const report = {
                    source_id: source.id,
                    name: source.name,
                    url: source.url,
                    status: 'skipped_no_credits',
                    error: 'out_of_credits',
                    links_found: 0,
                    articles_extracted: 0,
                    duration_ms: 0
                };
                perSource.push(report);
                return { items: [], report };
            }
            sendUpdate({ type: 'progress', message: `Contactando ScrapingBee para: ${source.name}...` });
            const report = {
                source_id: source.id,
                name: source.name,
                url: source.url,
                status: 'success',
                error: null,
                links_found: 0,
                articles_extracted: 0,
                duration_ms: 0
            };
            const startedAt = Date.now();
            
            try {
                ensureNotAborted();
                // Get HTML with render_js enabled and block unnecessary resources for speed
                const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(source.url)}&render_js=true&block_ads=true&block_resources=false&wait=1500&window_width=1920&window_height=1080`;
                
                const response = await fetchWithTimeout(sbUrl, { signal }, 45000);

                updateCreditsFromResponse(response);
                if (creditsRemaining !== null && creditsRemaining <= 0) {
                    markCreditsDepleted('remaining_0');
                    report.status = 'skipped_no_credits';
                    report.error = 'out_of_credits';
                    return { items: [], report };
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[ERROR] Failed to scrape ${source.name}: ${response.status} ${response.statusText} - Body: ${errorText}`);
                    if (response.status === 402) {
                        markCreditsDepleted('http_402');
                        report.status = 'skipped_no_credits';
                        report.error = 'out_of_credits';
                        return { items: [], report };
                    }
                    sendUpdate({ type: 'warning', message: `Error ScrapingBee (${response.status}) en ${source.name}. Se omite la fuente.` });
                    report.status = 'failed';
                    report.error = `scrapingbee_http_${response.status}`;
                    return { items: [], report };
                }

                const html = await response.text();
                // console.log(`[INFO] HTML content length for ${source.name}: ${html.length}`);
                
                if (html.length < 1000) {
                     console.warn(`[WARN] HTML content too short for ${source.name}. Possible bot detection or empty page.`);
                     sendUpdate({ type: 'warning', message: `Contenido vacío/corto para ${source.name}. Se omite la fuente.` });
                     report.status = 'failed';
                     report.error = 'html_too_short';
                }

                sendUpdate({ type: 'progress', message: `Analizando enlaces de: ${source.name}...` });

                
                // Step 1: Extract news articles with their links
                const newsArticles = [];
                const seenUrls = new Set();
                
                // Fetch existing URLs for this source from Supabase to avoid duplicates
                ensureNotAborted();
                const { data: existingNews } = await supabase
                    .from('scraped_news')
                    .select('original_url')
                    .eq('source_id', source.id)
                    .order('created_at', { ascending: false })
                    .limit(100);
                    
                const existingUrls = new Set(existingNews ? existingNews.map(n => n.original_url) : []);

                // Improved Regex to handle newlines and various attribute orders
                // Focus link extraction on specific containers if possible
                let searchHtml = html;
                
                // Prioritize "destacadas-wrapper" for SoyChile/Emol if present
                // Strategy: Extract high-priority URLs first based on specific structure
                const highPriorityUrls = new Set();
                
                // Dynamic Selector Support (High Priority)
                if (source.selector_list_container) {
                    // console.log(`[DEBUG] Using dynamic selector_list_container: ${source.selector_list_container}`);
                    
                    // Split by comma to support multiple selectors
                    const selectors = source.selector_list_container.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    
                    for (const selector of selectors) {
                        let regexPattern;
                        
                        if (selector.startsWith('.')) {
                            const className = selector.substring(1);
                            regexPattern = new RegExp(`<div[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                        } else if (selector.startsWith('#')) {
                            const idName = selector.substring(1);
                            regexPattern = new RegExp(`<div[^>]*id=["']${idName}["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                        } else {
                             regexPattern = new RegExp(`<div[^>]*(?:id|class)=["']${selector}["'][^>]*>([\\s\\S]*?)<\/div>`, 'gi');
                        }
    
                        let containerMatch;
                        while ((containerMatch = regexPattern.exec(html)) !== null) {
                            const content = containerMatch[1];
                            
                    const extracted = extractLinksFromContainerHtml(content, source.url, source.selector_link);
                    for (const url of extracted) highPriorityUrls.add(url);
                        }
                    }
                } else {
                    // Legacy/Fallback Logic
                    if (source.url.includes('soychile.cl')) {
                        // console.log(`[DEBUG] Scanning SoyChile specific structure: destacadas-wrapper -> media-desc -> a`);
                        const wrapperRegex = /<div[^>]*class=["'][^"']*destacadas-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
                        let wrapperMatch;
                        while ((wrapperMatch = wrapperRegex.exec(html)) !== null) {
                            const wrapperContent = wrapperMatch[1];
                            // content inside wrapper might contain media-desc
                            // Note: regex on partial HTML is safer
                            const mediaDescMatch = wrapperContent.match(/class=["'][^"']*media-desc[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
                            if (mediaDescMatch) {
                                let url = mediaDescMatch[1];
                                if (url.startsWith('/')) {
                                    try {
                                        const urlObj = new URL(source.url);
                                        url = `${urlObj.protocol}//${urlObj.host}${url}`;
                                    } catch (e) {}
                                }
                                highPriorityUrls.add(url);
                                // console.log(`[DEBUG] Found High Priority SoyChile URL: ${url}`);
                            }
                        }
                    }

                    if (source.url.includes('emol.com')) {
                        // console.log(`[DEBUG] Scanning Emol specific structure: ucHomePage_cuNoticiasCentral`);
                        // Patterns: 
                        // 1. ucHomePage_cuNoticiasCentral_contTitular (Main)
                        // 2. ucHomePage_cuNoticiasCentral_repNoticiasCetral_cajaSec_X (Secondary)
                        // Both contain h1 or h3 with link
                        
                        const emolContainerRegex = /<div[^>]*id=["'](?:ucHomePage_cuNoticiasCentral_contTitular|ucHomePage_cuNoticiasCentral_repNoticiasCetral_cajaSec_\d+)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
                        let containerMatch;
                        while ((containerMatch = emolContainerRegex.exec(html)) !== null) {
                            const content = containerMatch[1];
                            // Look for <a href="..."> inside h1 or h3
                            // Simplify: just look for the first link in this container, it's usually the title
                            const linkMatch = content.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
                            if (linkMatch) {
                                let url = linkMatch[1];
                                if (url.startsWith('/')) {
                                    try {
                                        const urlObj = new URL(source.url);
                                        url = `${urlObj.protocol}//${urlObj.host}${url}`;
                                    } catch (e) {}
                                }
                                highPriorityUrls.add(url);
                                // console.log(`[DEBUG] Found High Priority Emol URL: ${url}`);
                            }
                        }
                    }
                }

                const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let linkMatch;
                let foundLinksCount = 0;
                let validLinksCount = 0;
                
                const candidates = [];
                
                while ((linkMatch = linkRegex.exec(html)) !== null) {
                    foundLinksCount++;
                    const href = linkMatch[1];
                    // Clean link text: remove tags, replace newlines/tabs with spaces, trim
                    const linkText = linkMatch[2]
                        .replace(/<[^>]*>/g, '')
                        .replace(/[\n\r\t]+/g, ' ')
                        .trim();
                    
                    let fullUrl = href;
                    
                    if (href.startsWith('/')) {
                        try {
                            const urlObj = new URL(source.url);
                            fullUrl = `${urlObj.protocol}//${urlObj.host}${href}`;
                        } catch (e) {
                            console.warn(`[WARN] Invalid base URL for relative link: ${source.url}`);
                            continue;
                        }
                    } else if (!href.startsWith('http')) {
                        continue;
                    }

                    // Special handling for Emol
                    const isEmol = source.url.includes('emol.com');
                    const isSoyChile = source.url.includes('soychile.cl');

                    const isEmolNews = isEmol && href.includes('/noticias/');
                    const isSoyChileNews = isSoyChile && href.includes('.html') && (href.match(/\/202[0-9]\//) || href.match(/\/\d+\//)); // Requires .html and year or ID


                    // Debug log for first few links to verify patterns
                    if (foundLinksCount <= 5) {
                        // console.log(`[DEBUG] Analyzing link: ${fullUrl} | Text: "${linkText}"`);
                    }
                    
                    if (linkText.length > 10 && // Reduced to 10 to catch very short titles
                        !globalSeenUrls.has(fullUrl) &&
                        !seenUrls.has(fullUrl) &&
                        !globalExistingUrls.has(fullUrl) &&
                        !existingUrls.has(fullUrl) && // Check against DB
                        !linkText.toLowerCase().includes('más') &&
                        !linkText.toLowerCase().includes('ver todo') &&
                        !linkText.toLowerCase().includes('menú') &&
                        !linkText.toLowerCase().includes('login') &&
                        !linkText.toLowerCase().includes('registrarse') &&
                        !linkText.toLowerCase().includes('suscríbete') &&
                        !linkText.toLowerCase().includes('términos') &&
                        !linkText.toLowerCase().includes('política de privacidad') &&
                        !linkText.toLowerCase().includes('&nbsp;') &&
                        !href.includes('#') &&
                        !href.includes('javascript') &&
                        (
                         isEmolNews || // Always accept Emol news links
                         isSoyChileNews || // Always accept SoyChile news links
                         (!isEmol && !isSoyChile && ( // Only apply generic rules if NOT special source
                            href.includes('/tv/') || 
                            href.includes('/noticia') || 
                            href.includes('/articulo') || 
                            href.includes('.html') || 
                            href.includes('.aspx') || // Added for sites like SoyChile
                            href.includes('/2024/') || 
                            href.includes('/2025/') || 
                            href.includes('/2026/') ||
                            href.match(/\/\d{4}\/\d{2}\/\d{2}\//) || 
                            href.match(/\/[a-z-]+\/\d+/) || 
                            (href.startsWith('/') && href.split('/').length > 2)
                         ))
                        )) { 
                        
                        seenUrls.add(fullUrl);
                        
                        // Calculate score
                        let score = 0;
                        if (href.match(/\/\d{4}\/\d{2}\/\d{2}\//)) score += 20; // High priority for dates
                        if (href.includes('/noticia') || href.includes('/articulo')) score += 10;
                        if (linkText.length > 40) score += 5; // Prefer longer titles
                        if (isEmolNews) score += 15;
                        if (isSoyChileNews) score += 15;
                        
                        // Boost score if link was found inside "destacadas-wrapper" (Legacy check)
                        // New High Priority check based on specific structure
                        if (highPriorityUrls.has(fullUrl)) {
                            score += 50; // Massive boost for structurally verified links
                            // console.log(`[DEBUG] Boosted score for structural match: ${fullUrl}`);
                        }

                        candidates.push({
                            title: linkText,
                            url: fullUrl,
                            score: score
                        });
                        globalSeenUrls.add(fullUrl);
                        validLinksCount++;
                    }
                }
                
                // Sort by score and take top N
                candidates.sort((a, b) => b.score - a.score);
                const topCandidates = candidates.slice(0, ARTICLES_PER_SOURCE);
                newsArticles.push(...topCandidates);
                
                // console.log(`[INFO] Found ${foundLinksCount} total links. Valid candidates: ${validLinksCount}. Selected top ${newsArticles.length} to process.`);
                sendUpdate({ type: 'progress', message: `Encontrados ${newsArticles.length} artículos nuevos en ${source.name}. Procesando...` });

                if (newsArticles.length === 0) {
                    console.warn(`[WARN] No new articles found for ${source.name}. Check link patterns or HTML structure.`);
                    sendUpdate({ type: 'progress', message: `No se encontraron artículos nuevos en ${source.name}` });
                    return [];
                }

                // Step 2: Visit each article in parallel
                const articlePromises = newsArticles.map(async (article, idx) => {
                    sendUpdate({ type: 'progress', message: `Extrayendo (${idx+1}/${newsArticles.length}): ${article.title.substring(0, 30)}...` });
                    try {
                        if (creditsDepleted) return null;
                        ensureNotAborted();
                        // Use block_resources=false to ensure images are present for extraction
                        const articleResponse = await fetchWithTimeout(
                            `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(article.url)}&render_js=true&block_ads=true&block_resources=false&wait=1000`,
                            { signal },
                            20000
                        );
                        updateCreditsFromResponse(articleResponse);

                        if (!articleResponse.ok) {
                            if (articleResponse.status === 402) {
                                markCreditsDepleted('http_402');
                                return null;
                            }
                            console.warn(`Skipping ${article.url} due to connection error`);
                            return null;
                        }

                        const articleHtml = await articleResponse.text();
                        const { text: fullContentText, imageUrl: targetedImageUrl } = extractContent(articleHtml, article.title, article.url, source);
                        let fullContent = fullContentText;
                        
                        // console.log(`[DEBUG] Extracted content length for ${article.url}: ${fullContent.length}`);

                        if (isCssNoiseContent(fullContent)) {
                            console.warn(`Skipping ${article.url} due to CSS noise content`);
                            sendUpdate({ type: 'progress', message: `Omitido por CSS/estilos: ${article.title.substring(0, 20)}...` });
                            return null;
                        }
                        
                        // Validation: Check for invalid content phrases
                        const invalidPhrases = [
                            'Error de conexión', 
                            'timeout', 
                            'Ver términos y condiciones', 
                            'Suscríbete para leer',
                            'Contenido exclusivo',
                            'Inicia sesión',
                            '404 Not Found',
                            'Página no encontrada',
                            'No se pudo extraer el contenido completo',
                            'Debes estar registrado',
                            'Acceso restringido',
                            'Puertos y Logística Radio Temporada II' // Specific exclusion for the recurring boilerplate
                        ];
                        
                        const invalidPhrase = invalidPhrases.find(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));
                        
                        if (invalidPhrase) {
                            console.warn(`Skipping ${article.url} due to invalid phrase: "${invalidPhrase}"`);
                            sendUpdate({ type: 'progress', message: `Omitido por contenido inválido: ${article.title.substring(0, 20)}...` });
                            return null;
                        }

                        if (fullContent.length < 100) {
                             // Try to extract content from image if text is too short
                             // Prioritize targeted image from selector if available, otherwise use extractImage fallback
                             const imageUrl = targetedImageUrl || extractImage(articleHtml, article.url);
                             
                             if (imageUrl) {
                                 console.log(`[INFO] Content short for ${article.url}, attempting to extract from image: ${imageUrl}`);
                                 sendUpdate({ type: 'progress', message: `Intentando extraer texto de imagen para: ${article.title.substring(0, 20)}...` });
                                 
                                 try {
                                     const imageText = await withTimeout(processImageWithGroq(imageUrl, { signal }), 25000, 'image_ocr_timeout');
                                     if (imageText && imageText.length > 100) {
                                         fullContent = imageText + "\n\n[Nota: Contenido extraído automáticamente de la imagen principal]";
                                         console.log(`[SUCCESS] Extracted ${fullContent.length} chars from image for ${article.url}`);
                                     } else {
                                         console.warn(`[WARN] Groq could not extract sufficient text from image for ${article.url}`);
                                     }
                                 } catch (imgError) {
                                     console.error(`[ERROR] Failed to extract text from image for ${article.url}:`, imgError);
                                 }
                             }
                             
                             if (fullContent.length < 100) {
                                 console.warn(`Skipping ${article.url} due to short content (${fullContent.length} chars)`);
                                 sendUpdate({ type: 'progress', message: `Omitido por contenido corto: ${article.title.substring(0, 20)}...` });
                                 return null;
                             }
                        }

                        // Final image extraction for the news record (thumbnail)
                        const finalImageUrl = targetedImageUrl || extractImage(articleHtml, article.url);
                        const detectedCategory = extractArticleCategory(articleHtml);
                        const finalCategory = detectedCategory || source.category || null;

                        return {
                            title: article.title,
                            content: fullContent,
                            summary: fullContent.substring(0, 200) + (fullContent.length > 200 ? '...' : ''),
                            original_url: article.url,
                            image_url: finalImageUrl,
                            published_at: new Date().toISOString(),
                            scraped_at: new Date().toISOString(),
                            is_processed: false,
                            is_selected: false,
                            source_id: source.id,
                            category: finalCategory,
                            metadata: runId
                                ? {
                                    scrape_run_id: runId,
                                    source_name: source.name,
                                    source_category: source.category || null,
                                    detected_category: detectedCategory
                                }
                                : {
                                    source_name: source.name,
                                    source_category: source.category || null,
                                    detected_category: detectedCategory
                                }
                        };
                    } catch (error) {
                        if (error && (error.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted'))) {
                            return null;
                        }
                        console.warn(`Skipping ${article.url} due to exception:`, error);
                        return null;
                    }
                });

                const results = await Promise.all(articlePromises);
                
                // Filter out nulls and duplicates within the batch
                const uniqueContent = new Set();
                const filteredResults = [];
                
                for (const r of results) {
                    if (r && !uniqueContent.has(r.content)) {
                        uniqueContent.add(r.content);
                        filteredResults.push(r);
                    } else if (r) {
                        console.warn(`Skipping duplicate content for url: ${r.original_url}`);
                    }
                }
                report.links_found = validLinksCount;
                report.articles_extracted = filteredResults.length;
                if (filteredResults.length === 0) {
                    report.status = validLinksCount > 0 ? 'no_content' : 'no_links';
                }
                return { items: filteredResults, report };

            } catch (error) {
                console.error(`[ERROR] Critical error scraping source ${source.name}:`, error);
                report.status = 'failed';
                report.error = error instanceof Error ? error.message : String(error);
                return { items: [], report };
            } finally {
                report.duration_ms = Date.now() - startedAt;
                perSource.push(report);
            }
        };

        // Process sources in chunks
        for (let i = 0; i < sourcesData.length; i += CONCURRENT_SOURCES) {
            ensureNotAborted();
            if (creditsDepleted) break;
            const chunk = sourcesData.slice(i, i + CONCURRENT_SOURCES);
            
            const chunkPromises = chunk.map(source => processSource(source));
            const chunkResults = await Promise.all(chunkPromises);
            
            const chunkItems = [];
            chunkResults.forEach(r => {
                const items = r?.items || [];
                if (items.length > 0) {
                    scrapedNews.push(...items);
                    chunkItems.push(...items);
                }
            });

            if (chunkItems.length > 0) {
                sendUpdate({ type: 'saving', message: `Guardando ${chunkItems.length} noticias...` });
                const savedNow = await safeInsertScrapedNews(chunkItems);
                savedCount += savedNow;
                sendUpdate({ type: 'saving', message: `Guardadas ${savedCount} noticias (acumulado)` });
            }

            processedCount += chunk.length;
            const percent = Math.round((processedCount / sourcesData.length) * 100);
            sendUpdate({ 
                type: 'progress', 
                percent: percent, 
                message: `Procesado ${processedCount}/${sourcesData.length} fuentes (${percent}%)` 
            });
        }

        const duration = (Date.now() - startTime) / 1000;
        // console.log(`[COMPLETE] Scraped ${scrapedNews.length} news in ${duration}s`);
        const failed = perSource.filter(s => s.status === 'failed');
        const withNews = perSource.filter(s => (s.articles_extracted || 0) > 0);
        const skippedNoCredits = perSource.filter(s => s.status === 'skipped_no_credits');
        const terminatedEarly = creditsDepleted;
        const terminateReason = creditsDepleted ? 'out_of_credits' : null;
        
        res.json({
            success: true,
            count: savedCount,
            message: terminatedEarly
                ? `Proceso finalizado por falta de créditos: ${savedCount} noticias guardadas en ${duration}s`
                : `Actualización completada: ${savedCount} noticias nuevas en ${duration}s`,
            report: {
                sourcesTotal: sourcesData.length,
                sourcesProcessed: processedCount,
                sourcesUnprocessed: Math.max(0, sourcesData.length - processedCount),
                sourcesWithNews: withNews.length,
                sourcesFailed: failed.length,
                sourcesNoNews: Math.max(0, processedCount - withNews.length - failed.length - skippedNoCredits.length),
                sourcesSkippedNoCredits: skippedNoCredits.length,
                terminatedEarly,
                terminateReason,
                credits: {
                    used: creditsUsed,
                    remaining: creditsRemaining
                },
                perSource
            },
            data: scrapedNews
        });

    } catch (error) {
        if (error && (error.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted'))) {
            return res.status(499).json({ error: 'aborted' });
        }
        console.error('Error in scrape endpoint:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
    }
};
// Scrape endpoint
app.post('/api/scrape', scrapeHandler);

const sourceAnalysisCache = new Map();

function normalizeHttpUrl(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
}

function stripHtmlNoise(html, maxLen = 120000) {
    const s = String(html || '');
    const withoutScripts = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    const withoutStyles = withoutScripts.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    const withoutSvg = withoutStyles.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
    const compact = withoutSvg.replace(/\s+/g, ' ').trim();
    return compact.length > maxLen ? compact.slice(0, maxLen) : compact;
}

function safeParseFirstJsonObject(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(s.slice(start, end + 1));
    } catch (e) {
        return null;
    }
}

function isGenericClassToken(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return true;
    if (t.length <= 2) return true;
    if (/^\d+$/.test(t)) return true;
    const generic = new Set([
        'container', 'wrapper', 'wrap', 'row', 'col', 'column', 'columns', 'grid', 'flex',
        'header', 'footer', 'nav', 'navbar', 'menu', 'breadcrumb', 'breadcrumbs',
        'content', 'main', 'page', 'section', 'article', 'post',
        'clearfix', 'hidden', 'visible',
        'btn', 'button', 'icon',
        'title', 'subtitle', 'text', 'label',
        'ads', 'ad', 'advert', 'publicidad', 'banner',
        'modal', 'overlay',
        'sidebar'
    ]);
    if (generic.has(t)) return true;
    if (t.startsWith('col-') || t.startsWith('row-')) return true;
    return false;
}

function getBaseHost(url) {
    try {
        return new URL(url).host;
    } catch (e) {
        return '';
    }
}

function toAbsoluteUrl(href, baseUrl) {
    try {
        const u = new URL(href, baseUrl);
        return u.toString();
    } catch (e) {
        return '';
    }
}

function extractLinksFromContainerHtml(containerHtml, baseUrl, selectorLink) {
    const urls = new Set();
    const selectorRaw = String(selectorLink || '').trim();
    const selectors = selectorRaw
        ? selectorRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const anchorClassNames = new Set();
    for (const sel of selectors) {
        const m1 = sel.match(/a\.([A-Za-z0-9_-]+)/);
        if (m1?.[1]) anchorClassNames.add(m1[1]);

        const m2 = sel.match(/\.([A-Za-z0-9_-]+)/);
        if (m2?.[1]) anchorClassNames.add(m2[1]);
    }

    if (anchorClassNames.size > 0) {
        for (const className of anchorClassNames) {
            const re = new RegExp(`<a\\b[^>]*class=["'][^"']*${className}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`, 'gi');
            let m;
            while ((m = re.exec(containerHtml)) !== null) {
                const fullUrl = toAbsoluteUrl(m[1], baseUrl);
                if (fullUrl) urls.add(fullUrl);
            }
        }
        return Array.from(urls);
    }

    const linkMatches = containerHtml.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>/gi);
    for (const lm of linkMatches) {
        const fullUrl = toAbsoluteUrl(lm[1], baseUrl);
        if (fullUrl) urls.add(fullUrl);
    }
    return Array.from(urls);
}

function extractAnchorCandidates(html, baseUrl) {
    const out = [];
    const baseHost = getBaseHost(baseUrl);
    const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
        const rawHref = match[1];
        if (!rawHref) continue;
        if (rawHref.includes('javascript:') || rawHref.startsWith('#')) continue;
        const fullUrl = toAbsoluteUrl(rawHref, baseUrl);
        if (!fullUrl) continue;
        if (!/^https?:\/\//i.test(fullUrl)) continue;
        if (baseHost) {
            try {
                const u = new URL(fullUrl);
                if (u.host !== baseHost) continue;
            } catch (e) {}
        }
        const text = String(match[2] || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (text.length < 12) continue;
        out.push({ url: fullUrl, text, index: match.index });
        if (out.length >= 600) break;
    }
    return out;
}

function guessListContainerCandidates(html, baseUrl) {
    const anchors = extractAnchorCandidates(html, baseUrl);
    const counts = new Map();
    const samples = new Map();

    for (const a of anchors) {
        const start = Math.max(0, a.index - 5000);
        const chunk = html.slice(start, a.index);
        const tagRe = /<(article|div|section|main|ul|ol)\b[^>]*(?:id|class)=["']([^"']+)["'][^>]*>/gi;
        let m;
        let last = null;
        while ((m = tagRe.exec(chunk)) !== null) last = m;
        if (!last) continue;

        const rawAttr = String(last[2] || '').trim();
        const isId = /id=["']/.test(last[0]);
        let selector = '';
        if (isId) {
            const id = rawAttr.split(/\s+/)[0].replace(/[^\w-]/g, '').trim();
            if (id) selector = `#${id}`;
        } else {
            const classTokens = rawAttr
                .split(/\s+/)
                .map(t => t.trim())
                .filter(Boolean);
            const best = classTokens.find(t => !isGenericClassToken(t)) || classTokens[0];
            const clean = String(best || '').replace(/[^\w-]/g, '').trim();
            if (clean) selector = `.${clean}`;
        }

        if (!selector) continue;
        counts.set(selector, (counts.get(selector) || 0) + 1);

        const list = samples.get(selector) || [];
        if (list.length < 3) list.push(a.text.slice(0, 90));
        samples.set(selector, list);
    }

    return Array.from(counts.entries())
        .map(([selector, count]) => ({ selector, count, samples: samples.get(selector) || [] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
}

async function runGeminiForJson(prompt) {
    if (!MINIMAX_API_KEY) return null;
    const text = await callMiniMaxText({
        apiKey: MINIMAX_API_KEY,
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 900,
        temperature: 0
    });
    return safeParseFirstJsonObject(text);
}

app.post('/api/sources/analyze', async (req, res) => {
    const startedAt = Date.now();
    try {
        const rawUrl = req?.body?.url;
        const url = normalizeHttpUrl(rawUrl);
        if (!url) return res.status(400).json({ success: false, error: 'missing_url' });

        const preflight = await preflightPublicUrl(url);
        if (!preflight.ok) return res.status(400).json({ success: false, error: preflight.reason });

        const cacheKey = url.toLowerCase().trim();
        const cached = sourceAnalysisCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return res.json({ success: true, cached: true, ...cached.value });
        }

        if (!scrapingBeeApiKey || scrapingBeeApiKey === 'YOUR_SCRAPING_BEE_API_KEY') {
            return res.status(500).json({ success: false, error: 'scrapingbee_not_configured' });
        }

        const listResp = await fetchWithTimeout(
            `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(url)}&render_js=true&block_ads=true&block_resources=true&wait=1200`,
            {},
            45000
        );
        const listHtmlRaw = await listResp.text().catch(() => '');
        if (!listResp.ok || listHtmlRaw.length < 800) {
            return res.status(502).json({
                success: false,
                error: 'scrapingbee_failed',
                status: listResp.status,
                bodyPreview: listHtmlRaw.slice(0, 400)
            });
        }

        const listCandidates = guessListContainerCandidates(listHtmlRaw, url);
        const anchors = extractAnchorCandidates(listHtmlRaw, url);
        const sampleArticleUrl = anchors[0]?.url || '';

        let articleHtmlRaw = '';
        if (sampleArticleUrl) {
            const articleResp = await fetchWithTimeout(
                `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(sampleArticleUrl)}&render_js=true&block_ads=true&block_resources=true&wait=900`,
                {},
                30000
            );
            articleHtmlRaw = await articleResp.text().catch(() => '');
        }

        let suggested = {
            selector_list_container: listCandidates[0]?.selector || '',
            selector_link: '',
            selector_content: '',
            selector_ignore: ''
        };

        const listHtml = stripHtmlNoise(listHtmlRaw, 90000);
        const articleHtml = stripHtmlNoise(articleHtmlRaw, 90000);

        const ai = await runGeminiForJson(
            JSON.stringify({
                task: 'source_selectors',
                rules: {
                    output: 'JSON only',
                    fields: ['selector_list_container', 'selector_link', 'selector_content', 'selector_ignore'],
                    selector_notes: [
                        'Prefer robust selectors; avoid too generic containers like .container/.row/.col',
                        'selector_list_container can contain multiple selectors separated by comma',
                        'selector_link can be empty if not needed',
                        'selector_ignore can be empty'
                    ]
                },
                input: {
                    source_url: url,
                    list_container_candidates: listCandidates,
                    list_html_snippet: listHtml,
                    sample_article_url: sampleArticleUrl,
                    article_html_snippet: articleHtml
                }
            })
        );

        if (ai && typeof ai === 'object') {
            suggested = {
                selector_list_container: String(ai.selector_list_container || suggested.selector_list_container || '').trim(),
                selector_link: String(ai.selector_link || '').trim(),
                selector_content: String(ai.selector_content || '').trim(),
                selector_ignore: String(ai.selector_ignore || '').trim()
            };
        } else {
            if (articleHtmlRaw && /<article\b/i.test(articleHtmlRaw)) suggested.selector_content = 'article';
            else if (articleHtmlRaw && /<main\b/i.test(articleHtmlRaw)) suggested.selector_content = 'main';
            else suggested.selector_content = '';
        }

        const value = {
            url,
            listCandidates,
            sampleArticleUrl,
            suggested,
            metrics: {
                anchorsFound: anchors.length,
                durationMs: Date.now() - startedAt
            }
        };

        sourceAnalysisCache.set(cacheKey, { expiresAt: Date.now() + 1000 * 60 * 30, value });
        res.json({ success: true, cached: false, ...value });
    } catch (error) {
        console.error('Error in /api/sources/analyze:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'unknown_error' });
    }
});

function extractBearerToken(req) {
    const auth = req?.headers?.authorization || req?.headers?.Authorization || '';
    if (typeof auth !== 'string') return null;
    if (!auth.toLowerCase().startsWith('bearer ')) return null;
    return auth.slice(7).trim();
}

async function requireSuperAdmin(req, res) {
    const token = extractBearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'No autorizado' });
        return null;
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
        res.status(401).json({ error: 'No autorizado' });
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, role, email, full_name')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !profile) {
        res.status(403).json({ error: 'Acceso denegado' });
        return null;
    }
    if (profile.role !== 'super_admin') {
        res.status(403).json({ error: 'Acceso denegado' });
        return null;
    }
    return profile;
}

async function requireSuperAdminFromToken(token, res) {
    if (!token || typeof token !== 'string') {
        res.status(401).json({ error: 'No autorizado' });
        return null;
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
        res.status(401).json({ error: 'No autorizado' });
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, role, email, full_name')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !profile) {
        res.status(403).json({ error: 'Acceso denegado' });
        return null;
    }
    if (profile.role !== 'super_admin') {
        res.status(403).json({ error: 'Acceso denegado' });
        return null;
    }
    return profile;
}

function getChileTimeParts(date = new Date()) {
    const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute)
    };
}

function buildChileSlotKey({ year, month, day, hour }) {
    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:00`;
}

async function ensureScrapingAsset() {
    const { data: existing } = await supabase
        .from('automation_assets')
        .select('*')
        .eq('type', 'scraping')
        .eq('name', 'daily_scraping')
        .limit(1);

    if (existing && existing.length > 0) return existing[0];

    const defaultConfig = {
        enabled: true,
        articlesPerSource: 4,
        concurrency: 4,
        dedupGlobalLimit: 5000,
        timezone: 'America/Santiago',
        hours: [9, 16]
    };

    const { data: created, error } = await supabase
        .from('automation_assets')
        .insert({
            type: 'scraping',
            name: 'daily_scraping',
            config: defaultConfig,
            is_active: true,
            schedule: { type: 'vercel_cron', cron: '*/15 * * * *', timezone: 'America/Santiago', hours: [9, 16] }
        })
        .select()
        .single();

    if (error) throw error;
    return created;
}

async function getSetting(key) {
    const { data, error } = await supabase
        .from('settings')
        .select('key,value')
        .eq('key', key)
        .single();
    if (error) return null;
    return data?.value ?? null;
}

async function setSetting(key, value) {
    const { error } = await supabase
        .from('settings')
        .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
}

async function runScrapeWithHandler(sourceIds, { runId, concurrency, articlesPerSource, dedupGlobalLimit, onUpdate, signal } = {}) {
    const fakeReq = {
        body: {
            sources: sourceIds,
            runId,
            concurrency,
            articlesPerSource,
            dedupGlobalLimit
        },
        headers: {},
        onScrapeUpdate: typeof onUpdate === 'function' ? onUpdate : undefined,
        abortSignal: signal
    };
    return await new Promise((resolve) => {
        const fakeRes = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                resolve({ statusCode: this.statusCode, payload });
            }
        };
        scrapeHandler(fakeReq, fakeRes);
    });
}

const cronScrapingHandler = async (req, res) => {
    const headerSecret = req.headers['x-cron-secret'] || req.headers['X-Cron-Secret'];
    const auth = req.headers.authorization || req.headers.Authorization;
    const authOk = typeof auth === 'string' && (auth === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`);
    if (!CRON_SECRET || (headerSecret !== CRON_SECRET && !authOk)) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const asset = await ensureScrapingAsset();
        const cfg = asset?.config || {};
        if (cfg.enabled === false || asset?.is_active === false) {
            return res.json({ success: true, skipped: true, reason: 'disabled' });
        }

        const now = getChileTimeParts(new Date());
        const hours = Array.isArray(cfg.hours) && cfg.hours.length ? cfg.hours : [9, 16];
        const isScheduledHour = hours.includes(now.hour);
        // Si no es la hora programada, solo saltar si no se está forzando desde n8n
        // (n8n ya se encarga de disparar a la hora correcta, así que podemos ser más flexibles aquí)
        if (!isScheduledHour) {
            console.log(`[SCRAPING] Not a scheduled hour (${now.hour}), but continuing as it was triggered manually or via n8n.`);
        }

        const slotKey = buildChileSlotKey(now);
        const lastSlot = await getSetting('scraping_last_slot_key');
        if (lastSlot && lastSlot === slotKey) {
            return res.json({ success: true, skipped: true, reason: 'already_ran', slotKey });
        }

        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('id')
            .eq('is_active', true);

        if (sourcesError) {
            return res.status(500).json({ error: sourcesError.message });
        }

        const ids = (sourcesData || []).map(s => s.id).filter(Boolean);
        if (ids.length === 0) {
            await setSetting('scraping_last_slot_key', slotKey);
            return res.json({ success: true, skipped: true, reason: 'no_sources' });
        }

        const { data: run, error: runError } = await supabase
            .from('automation_runs')
            .insert({
                asset_id: asset.id,
                status: 'running'
            })
            .select()
            .single();
        if (runError) throw runError;

        const result = await runScrapeWithHandler(ids, {
            runId: run.id,
            concurrency: cfg.concurrency ?? 4,
            articlesPerSource: cfg.articlesPerSource ?? 4,
            dedupGlobalLimit: cfg.dedupGlobalLimit ?? 5000
        });

        if (result.statusCode >= 400) {
            await supabase.from('automation_runs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: typeof result.payload?.error === 'string' ? result.payload.error : JSON.stringify(result.payload)
            }).eq('id', run.id);
            return res.status(500).json({ error: 'Scraping falló', details: result.payload });
        }

        await supabase.from('automation_runs').update({
            status: 'success',
            completed_at: new Date().toISOString(),
            result: {
                count: result.payload?.count ?? 0,
                message: result.payload?.message,
                slotKey,
                sourcesCount: ids.length,
                report: result.payload?.report ?? null
            }
        }).eq('id', run.id);

        await supabase.from('automation_assets').update({
            last_run_at: new Date().toISOString()
        }).eq('id', asset.id);

        await setSetting('scraping_last_slot_key', slotKey);

        res.json({ success: true, runId: run.id, slotKey, result: result.payload });
    } catch (error) {
        console.error('Cron scraping error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
};

app.get('/api/cron/scraping', cronScrapingHandler);
app.post('/api/cron/scraping', cronScrapingHandler);

app.get('/api/admin/scraping/run', async (req, res) => {
    const token = req.query?.token;
    const profile = await requireSuperAdminFromToken(token, res);
    if (!profile) return;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let closed = false;
    let currentRunId = null;
    let heartbeat = null;
    req.on('close', () => {
        closed = true;
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
    });

    const send = (data) => {
        if (closed) return;
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        heartbeat = setInterval(() => {
            if (closed) return;
            res.write(`: heartbeat\n\n`);
        }, 15000);

        const asset = await ensureScrapingAsset();
        const cfg = asset?.config || {};

        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('id')
            .eq('is_active', true);

        if (sourcesError) {
            send({ type: 'error', message: sourcesError.message });
            if (heartbeat) clearInterval(heartbeat);
            res.end();
            return;
        }

        const ids = (sourcesData || []).map(s => s.id).filter(Boolean);
        if (ids.length === 0) {
            send({ type: 'error', message: 'No hay fuentes activas' });
            if (heartbeat) clearInterval(heartbeat);
            res.end();
            return;
        }

        const { data: run, error: runError } = await supabase
            .from('automation_runs')
            .insert({
                asset_id: asset.id,
                status: 'running',
                created_by: profile.id
            })
            .select()
            .single();
        if (runError) throw runError;
        currentRunId = run.id;

        send({ type: 'progress', percent: 0, message: 'Iniciando...' });

        let lastProgressWriteAt = 0;
        const persistProgress = async (u) => {
            if (!currentRunId) return;
            const now = Date.now();
            if (now - lastProgressWriteAt < 2000) return;
            lastProgressWriteAt = now;
            try {
                await supabase.from('automation_runs').update({
                    result: {
                        progress: {
                            type: u?.type || 'progress',
                            percent: u?.percent ?? null,
                            message: u?.message ?? null,
                            at: new Date().toISOString()
                        }
                    }
                }).eq('id', currentRunId).eq('status', 'running');
            } catch (e) {}
        };

        const result = await runScrapeWithHandler(ids, {
            runId: run.id,
            concurrency: cfg.concurrency ?? 4,
            articlesPerSource: cfg.articlesPerSource ?? 4,
            dedupGlobalLimit: cfg.dedupGlobalLimit ?? 5000,
            onUpdate: (u) => {
                send(u);
                if (u && (u.type === 'progress' || u.type === 'saving')) persistProgress(u);
            }
        });

        if (result.statusCode >= 400) {
            await supabase.from('automation_runs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: typeof result.payload?.error === 'string' ? result.payload.error : JSON.stringify(result.payload),
                created_by: profile.id
            }).eq('id', run.id);
            send({ type: 'error', message: result.payload?.error || 'Scraping falló', runId: run.id });
            if (heartbeat) clearInterval(heartbeat);
            res.end();
            return;
        }

        await supabase.from('automation_runs').update({
            status: 'success',
            completed_at: new Date().toISOString(),
            result: {
                count: result.payload?.count ?? 0,
                message: result.payload?.message,
                sourcesCount: ids.length,
                report: result.payload?.report ?? null
            },
            created_by: profile.id
        }).eq('id', run.id);

        await supabase.from('automation_assets').update({
            last_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', asset.id);

        send({
            type: 'complete',
            success: true,
            runId: run.id,
            result: {
                count: result.payload?.count ?? 0,
                message: result.payload?.message,
                sourcesCount: ids.length,
                report: result.payload?.report ?? null
            }
        });
        if (heartbeat) clearInterval(heartbeat);
        res.end();
    } catch (error) {
        console.error('Admin scraping run (SSE) error:', error);
        send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
        if (heartbeat) clearInterval(heartbeat);
        res.end();
    }
});

app.get('/api/admin/scraping/status', async (req, res) => {
    const profile = await requireSuperAdmin(req, res);
    if (!profile) return;
    try {
        const asset = await ensureScrapingAsset();
        const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
        await supabase.from('automation_runs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: 'timeout_or_interrupted'
        }).eq('asset_id', asset.id).eq('status', 'running').lt('started_at', cutoff);

        const { data: runs } = await supabase
            .from('automation_runs')
            .select('*')
            .eq('asset_id', asset.id)
            .order('started_at', { ascending: false })
            .limit(30);

        res.json({
            success: true,
            asset,
            runs: runs || []
        });
    } catch (error) {
        console.error('Admin scraping status error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.post('/api/admin/scraping/runs/:id/fail', async (req, res) => {
    const profile = await requireSuperAdmin(req, res);
    if (!profile) return;
    try {
        const id = req.params?.id;
        if (!id) return res.status(400).json({ error: 'run_id_required' });
        const { data, error } = await supabase
            .from('automation_runs')
            .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: 'marked_failed_by_admin'
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, run: data });
    } catch (error) {
        console.error('Admin scraping run fail error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.post('/api/admin/scraping/run', async (req, res) => {
    const profile = await requireSuperAdmin(req, res);
    if (!profile) return;
    try {
        const asset = await ensureScrapingAsset();
        const cfg = asset?.config || {};

        const { data: sourcesData, error: sourcesError } = await supabase
            .from('news_sources')
            .select('id')
            .eq('is_active', true);

        if (sourcesError) {
            return res.status(500).json({ error: sourcesError.message });
        }
        const ids = (sourcesData || []).map(s => s.id).filter(Boolean);
        if (ids.length === 0) return res.status(400).json({ error: 'No hay fuentes activas' });

        const { data: run, error: runError } = await supabase
            .from('automation_runs')
            .insert({
                asset_id: asset.id,
                status: 'running',
                created_by: profile.id
            })
            .select()
            .single();
        if (runError) throw runError;

        const result = await runScrapeWithHandler(ids, {
            runId: run.id,
            concurrency: cfg.concurrency ?? 4,
            articlesPerSource: cfg.articlesPerSource ?? 4,
            dedupGlobalLimit: cfg.dedupGlobalLimit ?? 5000
        });

        if (result.statusCode >= 400) {
            await supabase.from('automation_runs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: typeof result.payload?.error === 'string' ? result.payload.error : JSON.stringify(result.payload),
                created_by: profile.id
            }).eq('id', run.id);
            return res.status(500).json({ error: 'Scraping falló', details: result.payload, runId: run.id });
        }

        await supabase.from('automation_runs').update({
            status: 'success',
            completed_at: new Date().toISOString(),
            result: {
                count: result.payload?.count ?? 0,
                message: result.payload?.message,
                sourcesCount: ids.length,
                report: result.payload?.report ?? null
            },
            created_by: profile.id
        }).eq('id', run.id);

        await supabase.from('automation_assets').update({
            last_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', asset.id);

        res.json({ success: true, runId: run.id, result: result.payload });
    } catch (error) {
        console.error('Admin scraping run error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.post('/api/admin/scraping/config', async (req, res) => {
    const profile = await requireSuperAdmin(req, res);
    if (!profile) return;
    try {
        const asset = await ensureScrapingAsset();
        const next = req.body || {};
        const cfg = {
            enabled: next.enabled !== false,
            articlesPerSource: Number.isFinite(Number(next.articlesPerSource)) ? Math.max(1, Math.min(10, Number(next.articlesPerSource))) : (asset?.config?.articlesPerSource ?? 4),
            concurrency: Number.isFinite(Number(next.concurrency)) ? Math.max(1, Math.min(10, Number(next.concurrency))) : (asset?.config?.concurrency ?? 4),
            dedupGlobalLimit: Number.isFinite(Number(next.dedupGlobalLimit)) ? Math.max(200, Math.min(20000, Number(next.dedupGlobalLimit))) : (asset?.config?.dedupGlobalLimit ?? 5000),
            timezone: 'America/Santiago',
            hours: [9, 16]
        };

        const { data: updated, error } = await supabase
            .from('automation_assets')
            .update({
                config: cfg,
                is_active: cfg.enabled,
                updated_at: new Date().toISOString()
            })
            .eq('id', asset.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, asset: updated });
    } catch (error) {
        console.error('Admin scraping config error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// Helpers
function fallbackArticle(article, sourceId, errorMsg) {
    return {
        title: article.title,
        content: `${article.title}\n\n${errorMsg}`,
        summary: article.title.substring(0, 200),
        original_url: article.url,
        image_url: null,
        published_at: new Date().toISOString(),
        scraped_at: new Date().toISOString(),
        is_processed: false,
        is_selected: false,
        source_id: sourceId
    };
}

function isCssNoiseContent(text) {
    const t = (text || '').trim();
    if (t.length < 80) return false;

    if (/(^|\s)[.#][a-z0-9_-]+\s*\{[^}]*\}/i.test(t)) return true;
    if (t.startsWith('#') && t.includes('{') && t.includes('}') && t.includes(':')) return true;

    const braces = (t.match(/[{}]/g) || []).length;
    const semicolons = (t.match(/;/g) || []).length;
    const colons = (t.match(/:/g) || []).length;
    const ratio = (braces + semicolons + colons) / Math.max(t.length, 1);

    return (braces >= 4 && semicolons >= 6 && colons >= 6) || ratio > 0.08;
}

function normalizeNewsCategory(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return null;

    const direct = {
        'deportes': 'deportes',
        'deporte': 'deportes',
        'sport': 'deportes',
        'sports': 'deportes',
        'economia': 'economía',
        'economía': 'economía',
        'negocios': 'economía',
        'business': 'economía',
        'politica': 'política',
        'política': 'política',
        'politics': 'política',
        'tecnologia': 'tecnología',
        'tecnología': 'tecnología',
        'tech': 'tecnología',
        'tecnica': 'tecnología',
        'entretenimiento': 'entretenimiento',
        'espectaculos': 'entretenimiento',
        'espectáculos': 'entretenimiento',
        'cultura': 'entretenimiento',
        'general': 'general',
        'nacional': 'general',
        'internacional': 'general',
        'mundo': 'general',
        'actualidad': 'general',
        'noticias': 'general'
    };
    if (direct[t]) return direct[t];

    if (t.includes('deport')) return 'deportes';
    if (t.includes('econom')) return 'economía';
    if (t.includes('pol')) return 'política';
    if (t.includes('tecno') || t.includes('digit')) return 'tecnología';
    if (t.includes('entreten') || t.includes('espect') || t.includes('cultura')) return 'entretenimiento';
    return null;
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function extractArticleCategory(html) {
    if (!html || typeof html !== 'string') return null;
    const metaRegexes = [
        /<meta[^>]+property=["']article:section["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+property=["']og:section["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']section["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']category["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ];
    for (const re of metaRegexes) {
        const m = html.match(re);
        if (m?.[1]) {
            const normalized = normalizeNewsCategory(decodeHtmlEntities(m[1]));
            if (normalized) return normalized;
        }
    }

    // Try to infer from breadcrumbs/nav links if meta tags do not exist
    const anchorRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
        const text = decodeHtmlEntities(m[1]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 35) continue;
        const normalized = normalizeNewsCategory(text);
        if (normalized) return normalized;
    }
    return null;
}

function extractBalancedTagChunk(html, startIndex, tagName, maxScan = 250000) {
    if (!html || startIndex < 0 || startIndex >= html.length) return null;
    if (!tagName) return null;
    const tn = String(tagName).toLowerCase();
    const openTagRe = new RegExp(`^<${tn}\\b[^>]*>`, 'i');
    const slice = html.slice(startIndex);
    const openMatch = slice.match(openTagRe);
    if (!openMatch) return null;
    const openTag = openMatch[0];
    if (openTag.endsWith('/>')) return openTag;

    const openEnd = startIndex + openTag.length;
    const limit = Math.min(html.length, startIndex + Math.max(10000, maxScan));
    const scan = html.slice(startIndex, limit);

    const tagRe = new RegExp(`<\\/?${tn}\\b[^>]*>`, 'ig');
    tagRe.lastIndex = openTag.length;
    let depth = 1;
    let m;
    while ((m = tagRe.exec(scan)) !== null) {
        const t = m[0];
        const isClose = t.startsWith('</');
        const isSelfClose = t.endsWith('/>');
        if (!isClose && isSelfClose) continue;
        if (isClose) depth -= 1;
        else depth += 1;
        if (depth === 0) {
            return scan.slice(0, tagRe.lastIndex);
        }
    }
    return scan;
}

function extractContent(html, title, url, source) {
    let fullContent = '';
    let targetedImageUrl = null;
    
    // Pattern 0: Dynamic Selector (High Priority)
    if (source && source.selector_content) {
        // console.log(`[DEBUG] Using dynamic selector_content: ${source.selector_content} for ${url}`);
        let selector = source.selector_content;
        let regexPattern;

        // Basic selector to regex conversion
        if (selector.startsWith('.')) {
            const className = selector.substring(1);
            // Match generic tag with this class
            regexPattern = new RegExp(`<[a-z0-9]+[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>`, 'gi');
        } else if (selector.startsWith('#')) {
            const idName = selector.substring(1);
            // Match generic tag with this id
            regexPattern = new RegExp(`<[a-z0-9]+[^>]*id=["']${idName}["'][^>]*>`, 'gi');
        } else {
             // Fallback: try to match as class or id if no prefix
             regexPattern = new RegExp(`<[a-z0-9]+[^>]*(?:id|class)=["']${selector}["'][^>]*>`, 'gi');
        }
        
        // Find match
        const match = regexPattern.exec(html);
        if (match) {
             const tagOpen = match[0];
             const tagName = tagOpen.match(/^<([a-z0-9]+)/i)[1].toLowerCase();
             
             // Check if it's an IMG tag
             if (tagName === 'img') {
                 const srcMatch = tagOpen.match(/src=["']([^"']+)["']/i);
                 if (srcMatch) {
                     targetedImageUrl = srcMatch[1];
                     if (targetedImageUrl.startsWith('/')) {
                        try {
                            const urlObj = new URL(url);
                            targetedImageUrl = `${urlObj.protocol}//${urlObj.host}${targetedImageUrl}`;
                        } catch (e) {}
                     }
                     // console.log(`[DEBUG] Found targeted image URL: ${targetedImageUrl}`);
                 }
             } else {
                 const startIndex = match.index;
                 const chunk = extractBalancedTagChunk(html, startIndex, tagName, 300000) || html.substring(startIndex, startIndex + 50000);
                 fullContent = extractParagraphs(chunk);

                 if (fullContent.length < 200) {
                     const imgInContainer = chunk.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
                     if (imgInContainer) {
                         targetedImageUrl = imgInContainer[1];
                         if (targetedImageUrl.startsWith('/')) {
                             try {
                                 const urlObj = new URL(url);
                                 targetedImageUrl = `${urlObj.protocol}//${urlObj.host}${targetedImageUrl}`;
                             } catch (e) {}
                         }
                     }

                     const cleanChunk = chunk.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
                     const textNodeRegex = />([^<]{30,})</g;
                     let textNodeMatch;
                     while ((textNodeMatch = textNodeRegex.exec(cleanChunk)) !== null) {
                         const text = textNodeMatch[1].replace(/\s+/g, ' ').trim();
                         if (text.length > 30 && !fullContent.includes(text)) {
                             fullContent += (fullContent ? '\n\n' : '') + text;
                         }
                     }
                 }
             }
        }
    }

    // Pattern 1: Site Specific (Hardcoded Fallback)
    
    // SoyChile: id="textoDetalle" OR class="textoDetalle"
    const soyMatch = html.match(/<div[^>]*(?:id|class)=["']textoDetalle["'][^>]*>/i);
    if (soyMatch && !fullContent && !targetedImageUrl) {
        // console.log(`[DEBUG] Found SoyChile content container for ${url}`);
        const soyIndex = soyMatch.index;
        const tagLength = soyMatch[0].length;
        
        // Take a chunk, but try to stop before comments or footer
        // Look for the comments section start to truncate the chunk
        let endIndex = html.indexOf('id="comentarios"', soyIndex);
        if (endIndex === -1) endIndex = html.indexOf('class="note-footer"', soyIndex);
        if (endIndex === -1) endIndex = soyIndex + 25000; // Fallback to large chunk
        
        const chunk = html.substring(soyIndex + tagLength, endIndex);
        
        // 1. Get text immediately after the opening tag (before first tag)
        const firstTagIndex = chunk.indexOf('<');
        if (firstTagIndex > 0) {
            const initialText = chunk.substring(0, firstTagIndex).trim();
            if (initialText.length > 20) {
                // console.log(`[DEBUG] Found initial text in SoyChile: "${initialText.substring(0, 50)}..."`);
                fullContent += initialText + '\n\n';
            }
        }
        
        // 2. Get paragraphs from the chunk (Standard P tags)
        fullContent += extractParagraphs(chunk);

        // 3. Get text from divs with text-align: justify (Common in SoyChile)
        // This handles cases where they use <div style="text-align: justify;">Content</div> instead of <p>
        const justifiedDivRegex = /<div[^>]*style=["'][^"']*text-align:\s*justify[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
        let divMatch;
        while ((divMatch = justifiedDivRegex.exec(chunk)) !== null) {
            const text = divMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            // Avoid adding duplicates if extractParagraphs already caught it (unlikely if they are divs)
            if (text.length > 20 && !fullContent.includes(text)) {
                 fullContent += text + '\n\n';
            }
        }
        
        // 5. Special Case: Loose Text Nodes mixed with empty P tags (Found in SoyChile)
        // Match text that exists between a closing tag > and an opening tag < (e.g., </p> TEXT <p>)
        const textNodeRegex = />([^<]{30,})</g;
        let textNodeMatch;
        // Reset lastIndex just in case, though exec handles it on new string? No, regex is stateful if global.
        // We'll create a new regex instance or just rely on loop.
        
        // We need to be careful not to capture script content.
        // Let's remove script and style tags from chunk first for this specific check
        const cleanChunk = chunk.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
        
        while ((textNodeMatch = textNodeRegex.exec(cleanChunk)) !== null) {
            const text = textNodeMatch[1].trim();
            // Filter out common garbage
            if (text.length > 30 && 
                !fullContent.includes(text) && 
                !text.includes('function(') &&
                !text.includes('var ') &&
                !text.includes('window.') &&
                !text.includes('googletag')
               ) {
                 // console.log(`[DEBUG] Found loose text node: "${text.substring(0, 30)}..."`);
                 fullContent += text + '\n\n';
            }
        }
    }

    // Emol: class="EmolText" (Specific per user request) or id="cuDetalle_cuTexto_textoNoticia"
    if (!fullContent && !targetedImageUrl) {
        // Try specific class first as requested
        let emolMatch = html.match(/<[a-z0-9]+[^>]*class=["'][^"']*EmolText[^"']*["'][^>]*>/i);
        if (!emolMatch) {
            emolMatch = html.match(/<[a-z0-9]+[^>]*id=["']cuDetalle_cuTexto_textoNoticia["'][^>]*>/i);
        }

        if (emolMatch && typeof emolMatch.index === 'number') {
             const tagOpen = emolMatch[0];
             const tagName = tagOpen.match(/^<([a-z0-9]+)/i)[1].toLowerCase();
             const chunk = extractBalancedTagChunk(html, emolMatch.index, tagName, 350000) || html.substring(emolMatch.index, emolMatch.index + 25000);
             
             // Emol uses <div> for paragraphs often, not just <p>
             // Capture text inside <div>...</div> that are not just <br>
             // IMPORTANT: Avoid divs with id starting with "contRelacionadas" or class "flo_left"
             
             const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
             let divMatch;
             while ((divMatch = divRegex.exec(chunk)) !== null) {
                 const fullDiv = divMatch[0]; // The whole tag <div...>...</div>
                 const innerContent = divMatch[1];
                 
                 // Check attributes of the div itself (not just content)
                 // Regex stateful loop makes accessing the tag attributes tricky without re-parsing
                 // Let's use a simpler approach: check if the match includes forbidden attributes
                 // Actually, let's extract attributes from the opening tag
                 const openTag = fullDiv.match(/<div[^>]*>/i)[0];
                 
                 if (openTag.includes('contRelacionadas') || 
                     openTag.includes('flo_left') || 
                     openTag.includes('cont_items_detalle') ||
                     openTag.includes('relacionadas')) {
                     continue; // Skip related news and floaters
                 }

                 if (innerContent.includes('<div')) continue;

                 const text = innerContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                 
                 // Avoid capturing empty divs or just date/author info if possible
                 // Also avoid "Noticias relacionadas" text if it leaks
                 if (text.length > 20 && !text.includes('Noticias relacionadas')) {
                     fullContent += text + '\n\n';
                 }
                 
                 // Stop if we hit the "send correction" or footer area
                 if (innerContent.includes('id="contRelacionadas"') || innerContent.includes('class="error_txt"')) {
                     break;
                 }
             }
             
             // Fallback: if no divs found (maybe different structure), try p tags
             if (fullContent.length < 50) {
                 fullContent = extractParagraphs(chunk);
             }
        }
    }

    // Pattern 1: Article tag
    if (!fullContent && !targetedImageUrl) {
        const articleTagMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleTagMatch) {
            fullContent = extractParagraphs(articleTagMatch[1]);
        }
    }

    // Pattern 2: Main content divs
    if ((!fullContent || fullContent.length < 100) && !targetedImageUrl) {
        const contentPatterns = [
            /<div[^>]*class=["'][^"']*(?:article-content|post-content|entry-content|story-content|news-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*id=["'][^"']*(?:article|content|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
            /<main[^>]*>([\s\S]*?)<\/main>/i
        ];
        for (const pattern of contentPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const content = extractParagraphs(match[1]);
                if (content.length > 50) {
                    fullContent = content;
                    break;
                }
            }
        }
    }

    // Pattern 3: Loose paragraphs (Improved)
    if ((!fullContent || fullContent.length < 100) && !targetedImageUrl) {
        // Match all p tags, non-greedy content
        const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const paragraphs = [];
        let pMatch;
        while ((pMatch = paragraphRegex.exec(html)) !== null) {
            // Strip tags from the captured content
            const text = pMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            // Lower threshold to 40 chars to catch shorter paragraphs
            if (text.length > 40) paragraphs.push(text);
        }
        // Take top paragraphs, but limit to avoid huge dumps
        fullContent = paragraphs.slice(0, 20).join('\n\n');
    }

    if (!fullContent || fullContent.length < 50) {
        return { text: `${title}\n\nNo se pudo extraer el contenido completo.`, imageUrl: targetedImageUrl };
    }

    // CLEANING: Remove header menu garbage and modal text
    // 1. Remove SoyChile/SoyTV Header Menu if captured
    // Expanded list of cities to catch the start of the menu more reliably
    const menuStartMarkers = [
        'SOYTV Actualidad Entretención Economía',
        'piapó soyvalparaíso',
        'arica soyiquique',
        'soycalama soyan',
        'soyosorno soypuertomontt',
        'soychiloé'
    ];
    
    for (const marker of menuStartMarkers) {
        if (fullContent.includes(marker)) {
             // console.log(`[DEBUG] Removing SoyChile header menu (marker: ${marker})`);
             // Try to find the end of the menu (usually 'soychiloé' is the last one, or 'soyosorno' etc)
             const lastCityIndex = fullContent.lastIndexOf('soychiloé');
             if (lastCityIndex !== -1) {
                  fullContent = fullContent.substring(lastCityIndex + 'soychiloé'.length).trim();
             } else {
                  // If we can't find the end, just remove the marker and hopefully what follows is content
                  fullContent = fullContent.replace(marker, '').trim();
             }
             // Break after first match to avoid over-cleaning
             break;
        }
    }

    // 2. Remove Modal/Dialog text
    const modalPhrases = [
        "This is a modal window",
        "Beginning of dialog window",
        "Escape will cancel and close the window"
    ];
    for (const phrase of modalPhrases) {
        const idx = fullContent.indexOf(phrase);
        if (idx !== -1) {
             // console.log(`[DEBUG] Truncating content at modal phrase: "${phrase}"`);
             fullContent = fullContent.substring(0, idx).trim();
        }
    }

    return { text: fullContent, imageUrl: targetedImageUrl };
}

function extractParagraphs(html) {
    // Improved regex to capture content including nested tags (b, i, a, strong, span)
    const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let pMatch;
    while ((pMatch = paragraphRegex.exec(html)) !== null) {
        // Strip all tags to check text length
        const text = pMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length > 20) paragraphs.push(text);
    }
    return paragraphs.join('\n\n');
}

function extractImage(html, url) {
    // 1. Try Open Graph Image (Standard)
    const ogImgRegex = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i;
    const ogMatch = html.match(ogImgRegex);
    if (ogMatch) {
        let imageUrl = ogMatch[1];
        // Ensure absolute URL
        if (imageUrl.startsWith('/')) {
            try {
                const urlObj = new URL(url);
                imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
            } catch (e) {}
        }
        return imageUrl;
    }

    // 2. Try Twitter Image
    const twitterImgRegex = /<meta\s+(?:name|property)=["']twitter:image["']\s+content=["']([^"']+)["'][^>]*>/i;
    const twitterMatch = html.match(twitterImgRegex);
    if (twitterMatch) {
        let imageUrl = twitterMatch[1];
        if (imageUrl.startsWith('/')) {
             try {
                const urlObj = new URL(url);
                imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
             } catch (e) {}
        }
        return imageUrl;
    }

    // 3. Fallback to first image tag (Original logic)
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/i;
    const imgMatch = html.match(imgRegex);
    if (imgMatch) {
        let imageUrl = imgMatch[1];
        if (imageUrl.startsWith('/')) {
            const urlObj = new URL(url);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
        }
        return imageUrl;
    }
    return null;
}

function safeJoinAnthropicText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((p) => {
            if (!p) return '';
            if (typeof p === 'string') return p;
            if (typeof p?.text === 'string') return p.text;
            return '';
        })
        .join('');
}

function countWords(input) {
    const s = String(input || '').trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
}

function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
}

async function callMiniMaxRaw({ apiKey, body, signal, timeoutMs = 45000 }) {
    const resp = await fetchWithTimeout(
        'https://api.minimax.io/anthropic/v1/messages',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal
        },
        timeoutMs
    );

    const raw = await resp.text().catch(() => '');
    let json;
    try {
        json = raw ? JSON.parse(raw) : null;
    } catch (e) {
        json = null;
    }

    if (!resp.ok) {
        const msg =
            (json && (json.error?.message || json.message)) ||
            raw ||
            `MiniMax error (${resp.status})`;
        const err = new Error(String(msg));
        err.status = resp.status;
        err.details = json || raw;
        throw err;
    }

    return json || {};
}

async function callMiniMaxText({ apiKey, model, messages, maxTokens, temperature, signal }) {
    const json = await callMiniMaxRaw({
        apiKey,
        body: {
            model,
            max_tokens: maxTokens,
            temperature,
            messages
        },
        signal
    });
    return safeJoinAnthropicText(json?.content);
}

async function generateMiniMaxWithContinuation({ apiKey, model, prompt, maxTokens, temperature, signal }) {
    const baseMessages = [{ role: 'user', content: prompt }];
    let out = '';
    let messages = baseMessages.slice();

    for (let attempt = 0; attempt < 4; attempt++) {
        const json = await callMiniMaxRaw({
            apiKey,
            body: {
                model,
                max_tokens: maxTokens,
                temperature,
                messages
            },
            signal
        });

        const chunk = safeJoinAnthropicText(json?.content);
        out += chunk || '';

        const stopReason = String(json?.stop_reason || json?.stopReason || '').toLowerCase();
        const stoppedByMaxTokens =
            stopReason.includes('max') ||
            stopReason.includes('length') ||
            stopReason === 'max_tokens' ||
            stopReason === 'length';
        if (!stoppedByMaxTokens) break;

        messages = [
            ...baseMessages,
            { role: 'assistant', content: out },
            {
                role: 'user',
                content:
                    'Continúa exactamente desde donde te quedaste. No repitas nada. No agregues introducciones. Solo continúa el texto.'
            }
        ];
    }

    return out.trim();
}

// Helper to process image with Groq Vision (OCR)
async function processImageWithGroq(imageUrl, { signal } = {}) {
    if (!GROQ_API_KEY) {
        console.warn('[WARN] REACT_GROQ_API_KEY missing for image processing');
        return null;
    }

    try {
        const imgResponse = await fetchWithTimeout(imageUrl, { signal }, 15000);
        if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.statusText}`);

        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const mimeType = imgResponse.headers.get('content-type') || 'image/jpeg';

        const prompt =
            'Analiza esta imagen que corresponde a una noticia. Extrae el texto principal, titulares y cualquier información textual relevante. ' +
            'Si es una infografía o un comunicado, transcribe el contenido completo. ' +
            'Si es solo una foto decorativa, describe brevemente el contexto visual relevante para una noticia de radio. ' +
            'Devuelve un texto coherente en español.';

        const body = {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            temperature: 0.2,
            max_completion_tokens: 1200,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ]
        };

        const resp = await withTimeout(
            fetchWithTimeout(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body),
                    signal
                },
                20000
            ),
            22000,
            'groq_vision_timeout'
        );

        const raw = await resp.text().catch(() => '');
        const json = raw ? JSON.parse(raw) : null;
        if (!resp.ok) {
            const msg = json?.error?.message || json?.message || raw || `Groq error (${resp.status})`;
            throw new Error(String(msg));
        }

        const text = String(json?.choices?.[0]?.message?.content || '').trim();
        return text || null;
    } catch (error) {
        console.error('[ERROR] processImageWithGroq failed:', error);
        return null;
    }
}

// TTS Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice, audioConfig } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleCloudTtsApiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: { text },
                voice: voice || { languageCode: 'es-ES', name: 'es-ES-Standard-A' },
                audioConfig: audioConfig || { audioEncoding: 'MP3' }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('TTS API Error:', errorData);
            return res.status(response.status).json({ error: errorData.error?.message || 'TTS API Error' });
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('TTS Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Azure TTS Endpoint
app.post('/api/azure-tts', async (req, res) => {
    try {
        const { text, voice, speed, pitch } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        }
        if (text.length > 2500) {
            return res.status(400).json({ error: "El texto no puede exceder 2500 caracteres" });
        }

        const speechRate = speed && speed >= 0.1 && speed <= 10.0 ? speed : 1;
        // Pitch mapping: 1.0 is base. range 0.2 to 10.0.
        // Convert to percentage: (pitch - 1) * 100
        // E.g. 1.5 -> +50%, 0.8 -> -20%
        let pitchValue = pitch !== undefined ? parseFloat(pitch) : 1.0;
        if (isNaN(pitchValue)) pitchValue = 1.0;
        
        // Clamp reasonable limits if needed, but SSML is flexible.
        // Ensure it has a sign if not 0
        let pitchPercent = Math.round((pitchValue - 1.0) * 100);
        let pitchStr = pitchPercent === 0 ? "0%" : (pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`);

        const validVoices = [
            "es-MX-JorgeNeural", "es-US-AlonsoNeural", "es-AR-TomasNeural", "es-CL-LorenzoNeural",
            "es-AR-ElenaNeural", "es-MX-DaliaNeural", "es-US-PalomaNeural", "es-CL-CatalinaNeural"
        ];

        if (!voice || !validVoices.includes(voice)) {
            return res.status(400).json({ error: "Voz no válida" });
        }

        if (!AZURE_API_KEY || AZURE_API_KEY === "TU_API_KEY_AZURE") {
            return res.status(500).json({ 
                error: "API Key de Azure no configurada",
                message: "Configura AZURE_API_KEY en server.js"
            });
        }

        let lang = "es-CL";
        if (voice.startsWith("es-US")) lang = "es-US";
        else if (voice.startsWith("es-MX")) lang = "es-MX";
        else if (voice.startsWith("es-AR")) lang = "es-AR";

        let processedText = text.replace(/;/g, '___SEMICOLON___');
        processedText = escapeXml(processedText)
            .replace(/___SEMICOLON___/g, ';<break time="120ms"/>')
            .replace(/,/g, ',<break time="100ms"/>')
            .replace(/\./g, '.<break time="200ms"/>')
            .replace(/:/g, ':<break time="100ms"/>')
            .replace(/\?/g, '?<break time="250ms"/>')
            .replace(/!/g, '!<break time="250ms"/>');

        const finalRate = speechRate;
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody rate="${finalRate}" pitch="${pitchStr}" volume="+3%">${processedText}</prosody></voice></speak>`;

        const azureUrl = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        // console.log(`Sending request to Azure TTS: ${azureUrl}`);

        const azureResponse = await fetch(azureUrl, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": AZURE_API_KEY,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
                "User-Agent": "NodeServer"
            },
            body: ssml
        });

        if (!azureResponse.ok) {
            let errorText = await azureResponse.text().catch(() => "No se pudo leer el error");
            console.error("Azure API Error:", errorText);
            return res.status(azureResponse.status).json({
                error: "Error al generar el audio con Azure",
                azureError: errorText
            });
        }

        const audioBuffer = await azureResponse.arrayBuffer();
        if (audioBuffer.byteLength === 0) {
            return res.status(500).json({ error: "El audio generado está vacío" });
        }

        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error("Error al generar audio Azure:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
});

app.post('/api/chatterbox-voice-create', async (req, res) => {
    try {
        const requestTag = createRequestTag('cb_voice');
        const { audioUrl, audio_url, language, language_code, languageCode, lang, temperature, exaggeration, speed, cfg_weight, cfgWeight, repetition_penalty, repetitionPenalty, min_p, minP, top_p, topP, seed, use_cpu, useCpu, keep_model_loaded, keepModelLoaded } = req.body || {};

        const refUrl = audioUrl || audio_url;
        if (!refUrl) {
            return res.status(400).json({ error: 'Parámetros inválidos: audioUrl es requerido' });
        }

        const preflight = await preflightPublicUrl(refUrl);
        if (!preflight.ok) {
            if (CHATTERBOX_DEBUG) {
                console.log('[CHATTERBOX] voice-create preflight failed', { requestTag, reason: preflight.reason, url: safeUrlForLog(refUrl) });
            }
            return res.status(400).json({
                error: 'audioUrl no es accesible públicamente para Runpod',
                details: { reason: preflight.reason, url: safeUrlForLog(refUrl) }
            });
        }

        const endpointId = await getRunpodEndpointIdByName(RUNPOD_ENDPOINT_NAME, {
            cacheKey: 'voice',
            preferredId: RUNPOD_VOICE_ENDPOINT_ID
        });
        if (CHATTERBOX_DEBUG) {
            console.log('[CHATTERBOX] voice-create recv', {
                requestTag,
                endpointId,
                audioUrl: safeUrlForLog(refUrl),
                preflight,
                language,
                language_code,
                languageCode,
                lang,
                temperature,
                exaggeration,
                speed,
                cfg_weight: cfg_weight ?? cfgWeight,
                repetition_penalty: repetition_penalty ?? repetitionPenalty,
                min_p: min_p ?? minP,
                top_p: top_p ?? topP,
                seed,
                use_cpu: use_cpu ?? useCpu,
                keep_model_loaded: keep_model_loaded ?? keepModelLoaded
            });
        }
        const languageId = (language_code ?? languageCode ?? lang) || undefined;
        const input = {
            task: 'clone_voice',
            action: 'clone_voice',
            audioUrl: refUrl,
            audio_url: refUrl,
            audio_prompt_url: refUrl,
            audioPromptUrl: refUrl,
            audio_prompt_path: refUrl,
            audio_prompt: refUrl,
            language,
            language_code: language_code ?? languageCode ?? lang,
            languageCode: languageCode ?? language_code ?? lang,
            lang: lang ?? languageCode ?? language_code,
            language_id: languageId,
            model_name: 'multilingual',
            temperature,
            exaggeration,
            speed,
            cfg_weight: cfg_weight ?? cfgWeight,
            cfgWeight: cfgWeight ?? cfg_weight,
            repetition_penalty: repetition_penalty ?? repetitionPenalty,
            repetitionPenalty: repetitionPenalty ?? repetition_penalty,
            min_p: min_p ?? minP,
            minP: minP ?? min_p,
            top_p: top_p ?? topP,
            topP: topP ?? top_p,
            seed,
            use_cpu: use_cpu ?? useCpu,
            useCpu: useCpu ?? use_cpu,
            keep_model_loaded: keep_model_loaded ?? keepModelLoaded,
            keepModelLoaded: keepModelLoaded ?? keep_model_loaded
        };

        const altInput = {
            prompt: 'clone_voice',
            action: 'clone_voice',
            task: 'clone_voice',
            audioUrl: refUrl,
            audio_url: refUrl,
            audio_prompt_url: refUrl,
            audioPromptUrl: refUrl,
            audio_prompt_path: refUrl,
            audio_prompt: refUrl,
            language,
            language_id: languageId,
            language_code: languageId,
            cfg_weight: cfg_weight ?? cfgWeight,
            temperature,
            exaggeration,
            repetition_penalty: repetition_penalty ?? repetitionPenalty,
            min_p: min_p ?? minP,
            top_p: top_p ?? topP,
            seed,
            use_cpu: use_cpu ?? useCpu,
            keep_model_loaded: keep_model_loaded ?? keepModelLoaded,
            model_name: 'multilingual'
        };

        if (CHATTERBOX_DEBUG) {
            console.log('[CHATTERBOX] voice-create input', {
                endpointId,
                audioUrl: safeUrlForLog(refUrl),
                language,
                language_id: languageId,
                cfg_weight: input.cfg_weight,
                temperature,
                exaggeration,
                repetition_penalty: input.repetition_penalty,
                min_p: input.min_p,
                top_p: input.top_p,
                seed,
                use_cpu: input.use_cpu,
                keep_model_loaded: input.keep_model_loaded
            });
        }

        let result;
        try {
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] voice-create runpod input', { requestTag, endpointId, input: summarizeChatterboxInput(input) });
            result = await runpodRunSmart(endpointId, input, { executionTimeout: 900000 });
        } catch (e) {
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] voice-create primary failed, trying alt prompt schema');
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] voice-create runpod altInput', { requestTag, endpointId, input: summarizeChatterboxInput(altInput) });
            result = await runpodRunSmart(endpointId, altInput, { executionTimeout: 900000 });
        }
        const output = extractRunpodOutput(result) || result;

        const voiceId =
            findFirstValue(output, ['voice_id', 'voiceId', 'voice', 'id']) ||
            findFirstValue(result, ['voice_id', 'voiceId', 'voice', 'id']);

        if (!voiceId) {
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] voice-create missing voiceId', { requestTag, endpointId, outputKeys: output && typeof output === 'object' ? Object.keys(output).slice(0, 80) : null });
            return res.status(500).json({ error: 'Respuesta inválida: no se recibió voiceId', details: output });
        }

        if (CHATTERBOX_DEBUG) {
            const outKeys = output && typeof output === 'object' ? Object.keys(output).slice(0, 60) : [];
            console.log('[CHATTERBOX] voice-create ok', { requestTag, endpointId, voiceId, outputKeys: outKeys });
        }

        res.json({ voiceId });
    } catch (error) {
        console.error('Chatterbox Voice Create Error:', error);
        res.status(500).json({ error: 'Error al crear voz', details: error.message });
    }
});

app.post('/api/chatterbox-tts', async (req, res) => {
    try {
        const requestTag = createRequestTag('cb_tts');
        const { text, voice, language, language_code, languageCode, lang, audio_prompt_url, audioPromptUrl, audio_url, audioUrl, speed, exaggeration, temperature, cfg_weight, cfgWeight, repetition_penalty, repetitionPenalty, min_p, minP, top_p, topP, seed } = req.body || {};

        if (!text || String(text).trim().length === 0) {
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        }

        const endpointId = await getRunpodEndpointIdByName(RUNPOD_ENDPOINT_NAME, {
            cacheKey: 'tts',
            preferredId: RUNPOD_TTS_ENDPOINT_ID
        });
        const cleanVoice = typeof voice === 'string' ? voice.replace(/^chatterbox:/, '') : voice;
        const promptUrl = audio_prompt_url || audioPromptUrl || audio_url || audioUrl;
        if (promptUrl) {
            const preflight = await preflightPublicUrl(promptUrl);
            if (!preflight.ok) {
                if (CHATTERBOX_DEBUG) {
                    console.log('[CHATTERBOX] tts preflight failed', { requestTag, endpointId, reason: preflight.reason, url: safeUrlForLog(promptUrl) });
                }
                return res.status(400).json({
                    error: 'audio_prompt_url no es accesible públicamente para Runpod',
                    details: { reason: preflight.reason, url: safeUrlForLog(promptUrl) }
                });
            }
            if (CHATTERBOX_DEBUG) {
                console.log('[CHATTERBOX] tts preflight ok', { requestTag, endpointId, url: safeUrlForLog(promptUrl), preflight });
            }
        }

        const languageId = (language_code ?? languageCode ?? lang) || undefined;
        const input = {
            task: 'tts',
            action: 'tts',
            text,
            voice: cleanVoice,
            voice_id: cleanVoice,
            voiceId: cleanVoice,
            language,
            language_code: language_code ?? languageCode ?? lang,
            languageCode: languageCode ?? language_code ?? lang,
            lang: lang ?? languageCode ?? language_code,
            language_id: languageId,
            audio_prompt_url: promptUrl,
            audioPromptUrl: promptUrl,
            audio_url: promptUrl,
            audioUrl: promptUrl,
            audio_prompt_path: promptUrl,
            audio_prompt: promptUrl,
            model_name: 'multilingual',
            speed,
            exaggeration,
            temperature,
            cfg_weight: cfg_weight ?? cfgWeight,
            cfgWeight: cfgWeight ?? cfg_weight,
            repetition_penalty: repetition_penalty ?? repetitionPenalty,
            repetitionPenalty: repetitionPenalty ?? repetition_penalty,
            min_p: min_p ?? minP,
            minP: minP ?? min_p,
            top_p: top_p ?? topP,
            topP: topP ?? top_p,
            seed
        };

        const altInput = {
            prompt: text,
            text,
            input: text,
            voice: cleanVoice,
            voice_id: cleanVoice,
            language,
            language_id: languageId,
            language_code: languageId,
            audio_prompt_url: promptUrl,
            audio_prompt_path: promptUrl,
            audio_url: promptUrl,
            cfg_weight: cfg_weight ?? cfgWeight,
            temperature,
            exaggeration,
            repetition_penalty: repetition_penalty ?? repetitionPenalty,
            min_p: min_p ?? minP,
            top_p: top_p ?? topP,
            seed,
            model_name: 'multilingual'
        };

        if (CHATTERBOX_DEBUG) {
            console.log('[CHATTERBOX] tts recv', {
                requestTag,
                endpointId,
                voice: typeof voice === 'string' ? voice : null,
                cleanVoice: typeof cleanVoice === 'string' ? cleanVoice : null,
                input: summarizeChatterboxInput(input)
            });
        }

        let started;
        try {
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts runpod /run', { requestTag, endpointId });
            started = await runpodRun(endpointId, input, { executionTimeout: 900000 });
        } catch (e) {
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts primary /run failed, trying alt prompt schema');
            if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts runpod altInput', { requestTag, endpointId, input: summarizeChatterboxInput(altInput) });
            started = await runpodRun(endpointId, altInput, { executionTimeout: 900000 });
        }

        const requestId = started?.id || started?.requestId || started?.request_id;
        if (!requestId) {
            return res.status(500).json({ error: 'Respuesta inválida de Runpod /run: falta id', details: sanitizeForError(started) });
        }
        if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts job started', { requestTag, endpointId, requestId });

        const shortWaitDeadline = Date.now() + 25000;
        let lastStatusJson = null;
        let lastStatus = null;
        while (Date.now() < shortWaitDeadline) {
            const statusJson = await runpodGetStatus(endpointId, requestId);
            lastStatusJson = statusJson;
            const statusStr = String(statusJson?.status || '').toUpperCase();
            if (CHATTERBOX_DEBUG && statusStr && statusStr !== lastStatus) {
                lastStatus = statusStr;
                console.log('[CHATTERBOX] tts job status', { requestTag, endpointId, requestId, status: statusStr });
            }
            if (isRunpodCompletedStatus(statusJson?.status)) {
                const output = extractRunpodOutput(statusJson) || statusJson;
                const extracted = extractAudioFromOutput(output);
                const audioBase64 = extracted.audioBase64;
                const audioRemoteUrl = extracted.audioUrl;

                if (CHATTERBOX_DEBUG) {
                    const outKeys = output && typeof output === 'object' ? Object.keys(output).slice(0, 60) : [];
                    console.log('[CHATTERBOX] tts completed', { requestTag, endpointId, requestId, outputKeys: outKeys, hasAudioBase64: !!audioBase64, hasAudioUrl: !!extracted.audioUrl });
                }

                if (audioBase64) {
                    const b64 = audioBase64.includes(',') ? audioBase64.split(',').pop() : audioBase64;
                    const buffer = Buffer.from(b64, 'base64');
                    if (!buffer || buffer.length === 0) {
                        return res.status(500).json({ error: 'El audio generado está vacío' });
                    }
                    const contentType = detectAudioContentType(buffer, b64);
                    res.set('Content-Type', contentType);
                    return res.send(buffer);
                }

                if (audioRemoteUrl && /^https?:\/\//i.test(audioRemoteUrl)) {
                    const fetched = await fetchWithTimeout(audioRemoteUrl, { method: 'GET' }, 60000);
                    if (!fetched.ok) {
                        const body = await fetched.text().catch(() => '');
                        return res.status(502).json({ error: 'Error al descargar audio remoto', details: body });
                    }
                    const contentType = fetched.headers.get('content-type') || 'audio/mpeg';
                    const buf = Buffer.from(await fetched.arrayBuffer());
                    if (!buf || buf.length === 0) {
                        return res.status(500).json({ error: 'El audio generado está vacío' });
                    }
                    res.set('Content-Type', contentType);
                    return res.send(buf);
                }

                return res.status(500).json({ error: 'Respuesta inválida: no se recibió audio', details: sanitizeForError(output) });
            }

            if (isRunpodTerminalStatus(statusJson?.status) && !isRunpodCompletedStatus(statusJson?.status)) {
                if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts terminal without completion', { requestTag, endpointId, requestId, status: statusJson?.status });
                return res.status(500).json({ error: 'Runpod job falló', details: sanitizeForError(statusJson) });
            }

            await new Promise(r => setTimeout(r, 1200));
        }

        if (CHATTERBOX_DEBUG) console.log('[CHATTERBOX] tts still running', { requestTag, endpointId, requestId, lastStatus: lastStatusJson?.status || 'IN_QUEUE' });
        return res.status(202).json({ id: requestId, status: lastStatusJson?.status || 'IN_QUEUE' });
    } catch (error) {
        console.error('Chatterbox TTS Error:', error);
        res.status(500).json({ error: 'Error al generar audio', details: error.message });
    }
});

app.get('/api/chatterbox-tts-job/:id', async (req, res) => {
    try {
        const requestTag = createRequestTag('cb_job');
        const requestId = String(req.params.id || '').trim();
        if (!requestId) return res.status(400).json({ error: 'id requerido' });

        const endpointId = await getRunpodEndpointIdByName(RUNPOD_ENDPOINT_NAME, {
            cacheKey: 'tts',
            preferredId: RUNPOD_TTS_ENDPOINT_ID
        });

        const statusJson = await runpodGetStatus(endpointId, requestId);
        if (CHATTERBOX_DEBUG) {
            console.log('[CHATTERBOX] tts-job status', { requestTag, endpointId, requestId, status: statusJson?.status });
        }
        if (!isRunpodCompletedStatus(statusJson?.status)) {
            if (isRunpodTerminalStatus(statusJson?.status) && !isRunpodCompletedStatus(statusJson?.status)) {
                return res.status(500).json({ error: 'Runpod job falló', details: sanitizeForError(statusJson) });
            }
            return res.status(202).json({ id: requestId, status: statusJson?.status || 'IN_QUEUE' });
        }

        const output = extractRunpodOutput(statusJson) || statusJson;
        const { audioBase64, audioUrl: audioRemoteUrl } = extractAudioFromOutput(output);

        if (audioBase64) {
            const b64 = audioBase64.includes(',') ? audioBase64.split(',').pop() : audioBase64;
            const buffer = Buffer.from(b64, 'base64');
            if (!buffer || buffer.length === 0) {
                return res.status(500).json({ error: 'El audio generado está vacío' });
            }
            const contentType = detectAudioContentType(buffer, b64);
            res.set('Content-Type', contentType);
            return res.send(buffer);
        }

        if (audioRemoteUrl && /^https?:\/\//i.test(audioRemoteUrl)) {
            const fetched = await fetchWithTimeout(audioRemoteUrl, { method: 'GET' }, 60000);
            if (!fetched.ok) {
                const body = await fetched.text().catch(() => '');
                return res.status(502).json({ error: 'Error al descargar audio remoto', details: body });
            }
            const contentType = fetched.headers.get('content-type') || 'audio/mpeg';
            const buf = Buffer.from(await fetched.arrayBuffer());
            if (!buf || buf.length === 0) {
                return res.status(500).json({ error: 'El audio generado está vacío' });
            }
            res.set('Content-Type', contentType);
            return res.send(buf);
        }

        return res.status(500).json({ error: 'Respuesta inválida: no se recibió audio', details: sanitizeForError(output) });
    } catch (error) {
        console.error('Chatterbox TTS Job Error:', error);
        res.status(500).json({ error: 'Error al consultar job', details: error.message });
    }
});

// Qwen Voice Enrollment (Clone) Endpoint
app.post('/api/qwen-voice-create', async (req, res) => {
    try {
        const { audioUrl, audio_data, preferred_name, target_model } = req.body;

        console.log('[QWEN] /api/qwen-voice-create called', { preferred_name, target_model, hasAudioData: !!audio_data, hasAudioUrl: !!audioUrl });

        if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_QWEN_API_KEY') {
            console.error('[QWEN] API Key missing for voice creation');
            return res.status(500).json({
                error: 'API Key de DashScope no configurada',
                message: 'Configura DASHSCOPE_API_KEY en variables de entorno'
            });
        }

        if ((!audioUrl && !audio_data) || !preferred_name || !target_model) {
            return res.status(400).json({ error: 'Parámetros inválidos: audio_data (o audioUrl), preferred_name y target_model son requeridos' });
        }

        // Validación estricta de preferred_name para evitar errores de DashScope
        const normalized = String(preferred_name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '') // Elimina todo lo que no sea a-z o 0-9
            .trim();
            
        // Asegurar que empiece con letra y tenga longitud válida
        let fixed = normalized;
        if (!fixed) fixed = `voz${Date.now()}`;
        if (!/^[a-z]/.test(fixed)) fixed = `v${fixed}`;
        
        // Longitud entre 3 y 20 caracteres (para estar seguros)
        fixed = fixed.slice(0, 20);
        if (fixed.length < 3) fixed = fixed.padEnd(3, 'x');

        const validPattern = /^[a-z][a-z0-9]{2,31}$/;
        if (!validPattern.test(fixed)) {
            // Fallback final si algo falla
            fixed = `voz${Date.now()}`;
        }

        let dataUri;
        if (audio_data && typeof audio_data === 'string' && audio_data.startsWith('data:')) {
            dataUri = audio_data;
        } else if (audioUrl) {
            // Download audio from URL to convert to base64
            // Note: DashScope enrollment usually requires base64 or OSS URL. Public URL support varies.
            // Safest approach is base64 for small files (< 10MB).
            console.log('[QWEN] Downloading audio from URL:', audioUrl);
            const audioResp = await fetchWithTimeout(audioUrl, {}, 45000); // Increased timeout
            if (!audioResp.ok) {
                const errText = await audioResp.text().catch(() => '');
                console.error('[QWEN] Failed to download audio from URL:', errText);
                return res.status(400).json({ error: 'No se pudo obtener el audio de referencia', details: errText });
            }
            const contentType = audioResp.headers.get('content-type') || 'audio/mpeg';
            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            const base64Str = audioBuffer.toString('base64');
            dataUri = `data:${contentType};base64,${base64Str}`;
        } else {
            return res.status(400).json({ error: 'Se requiere audio_data (data URI) o audioUrl válido' });
        }

        const url = 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization';
        const payload = {
            model: 'qwen-voice-enrollment',
            input: {
                action: 'create',
                target_model,
                preferred_name: fixed,
                audio: { data: dataUri }
            }
        };
        const headers = {
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
        };

        console.log('[QWEN] Sending enrollment request to DashScope...');
        const resp = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
        const textBody = await resp.text();
        
        if (!resp.ok) {
            console.error('[QWEN] DashScope Enrollment Error:', textBody);
            let details = textBody;
            try {
                const parsed = JSON.parse(textBody);
                details = parsed; // Send full object
            } catch (_) {}
            return res.status(resp.status).json({ error: 'Error al crear voz clonada en DashScope', details });
        }

        let json;
        try {
            json = JSON.parse(textBody);
        } catch (e) {
            console.error('[QWEN] Invalid JSON response:', textBody);
            return res.status(500).json({ error: 'Respuesta inválida de DashScope (JSON parse error)' });
        }

        // Check for specific DashScope error codes in success 200 response (if any)
        if (json.code && json.code !== 'Success') {
             console.error('[QWEN] DashScope Logical Error:', json);
             return res.status(500).json({ error: 'Error lógico de DashScope', details: json });
        }

        console.log('[QWEN] Voice created successfully:', json);
        const voice = json?.output?.voice;
        if (!voice) {
            console.error('[QWEN] No voice ID in response:', json);
            return res.status(500).json({ error: 'No se recibió parámetro de voz en la respuesta de DashScope', response: json });
        }
        
        res.json({ voice, target_model, preferred_name });

    } catch (error) {
        console.error('[QWEN] Voice Create Endpoint Error:', error);
        res.status(500).json({ error: 'Error interno al crear voz clonada', details: error.message });
    }
});

// Qwen TTS Endpoint (Voice Cloned Usage)
app.post('/api/qwen-tts', async (req, res) => {
    try {
        const { text, voice, speed, rate, pitch } = req.body;

        console.log('[QWEN] /api/qwen-tts called', { voice, textLength: text?.length });

        if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_QWEN_API_KEY') {
            console.error('[QWEN] API Key missing');
            return res.status(500).json({
                error: 'API Key de DashScope no configurada',
                message: 'Configura DASHSCOPE_API_KEY en variables de entorno'
            });
        }

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'El texto no puede estar vacío' });
        }
        if (!voice || (typeof voice !== 'string')) {
            return res.status(400).json({ error: 'Parámetro de voz inválido' });
        }

        // Qwen Speed: Accept 'rate' (preferred) or 'speed' (legacy/UI)
        // Range 0.5 to 2.0. Default 1.0.
        // Note: Qwen might support wider range, but keeping it safe.
        let parsedRate = 1.0;
        if (rate !== undefined) {
            parsedRate = parseFloat(rate);
        } else if (speed !== undefined) {
            parsedRate = parseFloat(speed);
        }
        
        if (isNaN(parsedRate)) parsedRate = 1.0;
        const speechRate = Math.max(0.5, Math.min(parsedRate, 2.0));
            
        // Qwen Pitch: Range 0.5 to 2.0? Documentation varies.
        // Let's stick to safe range.
        let parsedPitch = parseFloat(pitch);
        if (isNaN(parsedPitch)) parsedPitch = 1.0;
        const speechPitch = Math.max(0.5, Math.min(parsedPitch, 2.0));

        const voiceId = voice.startsWith('qwen:') ? voice.substring(5) : voice;

        // Generate natural language instructions for style control
        let styleInstruction = "";
        if (speechRate >= 1.5) {
            styleInstruction += "Speak fast. ";
        } else if (speechRate <= 0.8) {
            styleInstruction += "Speak slowly. ";
        }

        // Use the unified multimodal generation HTTP API
        // NOTE: We use qwen3-tts-vc-2026-01-22 as it matches the enrollment target model.
        const url = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
        
        // Construct payload compatible with Qwen3-TTS
        const payload = {
            model: 'qwen3-tts-vc-2026-01-22',
            input: {
                text,
                voice: voiceId,
                prompt: styleInstruction.trim() || undefined
            },
            parameters: {
                rate: speechRate,
                pitch: speechPitch
                // Removed style_instruction from parameters to avoid potential conflicts
            }
        };

        // console.log('[QWEN] Payload:', JSON.stringify(payload));

        const headers = {
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
            // 'X-DashScope-Async': 'enable' // Disabled: User API key does not support async calls
        };
        
        const resp = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
        const bodyText = await resp.text();
        
        if (!resp.ok) {
            console.error('[QWEN] DashScope TTS Error:', bodyText);
            return res.status(resp.status).json({ error: 'Error al generar audio con Qwen', dashscopeError: bodyText });
        }

        let json;
        try {
            json = JSON.parse(bodyText);
        } catch {
            return res.status(500).json({ error: 'Respuesta inválida de DashScope TTS (JSON parse error)' });
        }

        // Handle Async Response
        if (json.output && json.output.task_id) {
            console.log('[QWEN] Async task started:', json.output.task_id);
            // Poll for result
            const taskId = json.output.task_id;
            const taskUrl = `https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`;
            
            // Poll loop (max 55 seconds to stay within Vercel 60s limit)
            const startTime = Date.now();
            while (Date.now() - startTime < 55000) {
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s between polls
                
                const taskResp = await fetchWithTimeout(taskUrl, { headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` } }, 10000);
                if (!taskResp.ok) {
                    console.warn('[QWEN] Task poll failed, retrying...', taskResp.status);
                    continue;
                }
                
                const taskJson = await taskResp.json();
                const status = taskJson.output?.task_status;

                if (status === 'SUCCEEDED') {
                    console.log('[QWEN] Async task succeeded');
                    // Try multiple paths for audio URL
                    const audioUrl = taskJson.output.results?.[0]?.url || 
                                     taskJson.output.audio_url || 
                                     taskJson.output.audio?.url ||
                                     taskJson.output.result?.audio_url;

                     if (audioUrl) {
                        return await downloadAndSendAudio(audioUrl, res);
                     }
                     
                     console.error('[QWEN] Audio URL not found in SUCCEEDED task:', JSON.stringify(taskJson));
                     return res.status(500).json({ error: 'Audio URL no encontrada en respuesta exitosa', details: taskJson });

                } else if (status === 'FAILED' || status === 'CANCELED') {
                     console.error('[QWEN] Async task failed:', taskJson);
                     return res.status(500).json({ error: 'Qwen TTS Async Task Failed', details: taskJson });
                } else {
                    // RUNNING, PENDING, etc. -> Continue polling
                    // console.log('[QWEN] Task status:', status);
                }
            }
            return res.status(504).json({ error: 'Timeout waiting for Qwen TTS generation (Async)' });
        }

        // Handle Sync Response (if supported)
        const audioUrl = json?.output?.url || json?.output?.audio_url || json?.output?.audio?.url;
        if (!audioUrl) {
            console.error('[QWEN] No audio URL in response:', json);
            return res.status(500).json({ error: 'URL de audio no encontrada en respuesta de DashScope', response: json });
        }
        
        await downloadAndSendAudio(audioUrl, res);

    } catch (error) {
        console.error('[QWEN] TTS Endpoint Error:', error);
        res.status(500).json({ error: 'Error interno al generar audio con Qwen', details: error.message });
    }
});

async function downloadAndSendAudio(url, res) {
    try {
        const audioResp = await fetchWithTimeout(url, {}, 60000);
        if (!audioResp.ok) {
            const errText = await audioResp.text().catch(() => '');
            console.error('[QWEN] Fetch audio URL error:', errText);
            return res.status(502).json({ error: 'No se pudo descargar el audio generado', details: errText });
        }
        const buf = Buffer.from(await audioResp.arrayBuffer());
        const mime = audioResp.headers.get('content-type') || 'audio/mpeg';
        res.set('Content-Type', mime);
        res.send(buf);
    } catch (e) {
        console.error('[QWEN] Download error:', e);
        res.status(500).json({ error: 'Error downloading audio file' });
    }
}
// Gemini Endpoint
app.post('/api/gemini', async (req, res) => {
    try {
        const { action, text, targetSeconds, targetWords } = req.body;
        const minimaxApiKey = MINIMAX_API_KEY;

        if (!minimaxApiKey) {
            return res.status(500).json({ error: 'REACT_MINIMAX_API_KEY not configured on server' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        let prompt = '';
        let desiredWords = countWords(text);

        switch (action) {
            case 'humanize':
                prompt = `Actúa como un redactor de noticias de radio de élite.
      
      Tu misión es reescribir el siguiente texto para ser LEÍDO EN VOZ ALTA por una IA avanzada de clonación de voz.
      
      OBJETIVO: Lograr una prosodia humana perfecta, natural y respirada.
      
      Reglas de ORO para la Humanización:
      1. PUNTUACIÓN RESPIRADA: La IA usa la puntuación para respirar.
         - Usa COMAS (,) para pausas breves y naturales dentro de la frase.
         - Usa PUNTOS (.) para pausas completas y cambios de idea.
         - EVITA frases interminables sin pausas.
      2. RITMO VARIADO: Alterna frases cortas de impacto con frases de longitud media. Evita la monotonía.
      3. LENGUAJE HABLADO: Usa un tono conversacional pero profesional. Evita construcciones pasivas complejas.
      4. NÚMEROS Y SIGLAS: 
         - Escribe TODOS los números en letras (ej: "veinte mil" en vez de "20.000").
         - Expande las siglas o sepáralas con guiones si se deletrean (ej: "O-N-U").
      5. LIMPIEZA TOTAL: 
         - ELIMINA cualquier rastro de texto web (leér más, click aquí, fuentes, fechas irrelevantes).
         - NO uses paréntesis, corchetes, asteriscos ni guiones bajos.
         - NO uses formato Markdown.
      6. SOLO LA NOTICIA: Entrega el texto limpio listo para locutar, sin saludos ni introducciones ("Aquí tienes el texto...").
      
      Texto original:
      ${text}`;
                break;

            case 'clean':
                prompt = `Actúa como un editor de corrección de estilo (proofreader) para guiones de radio.
      
      Tu tarea es REVISAR y LIMPIAR el siguiente texto que ya fue procesado por una IA.
      
      OBJETIVOS:
      1. ELIMINAR cualquier frase introductoria o de cierre que no sea parte de la noticia (ej: 'Aquí tienes la noticia', 'Claro, aquí está', 'Texto reescrito:', 'Espero que te guste', etc.).
      2. CORREGIR errores ortográficos y tipográficos (ej: 'jotel' -> 'hotel', 'policia' -> 'policía').
      3. VERIFICAR formato de radio:
         - Números deben estar en letras (ej: 'veinte' no '20').
         - Sin símbolos especiales ni markdown (*, #, [], ()).
      4. MANTENER el contenido y estilo original si es correcto. Solo limpia y corrige.
      5. RESPUESTA: ÚNICAMENTE el texto corregido. Nada más.
      
      Texto a revisar:
      ${text}`;
                break;

            case 'adjustTime':
                if (!targetSeconds) return res.status(400).json({ error: 'targetSeconds required for adjustTime' });
                const targetWordsTime = Math.round((targetSeconds * 150) / 60); // 150 words per minute
                desiredWords = targetWordsTime;
        
                prompt = `Actúa como un editor de noticias experto.
        
        Reescribe y ajusta la longitud del siguiente texto para que pueda ser leído en voz alta en aproximadamente ${targetSeconds} segundos (alrededor de ${targetWordsTime} palabras).

        Instrucciones:
        1. Si el texto es muy largo, RESUME manteniendo los puntos clave.
        2. Si el texto es muy corto, EXPANDE agregando detalles de contexto o conectores naturales, sin inventar hechos.
        3. Mantén un tono periodístico, formal pero accesible.
        4. PUNTUACIÓN RESPIRADA (CRUCIAL):
           - Usa COMAS para marcar pausas breves de respiración.
           - Usa PUNTOS para separar ideas claramente.
        5. NÚMEROS: Escríbelos en letras.
        6. NO uses formato Markdown.
        7. Objetivo de longitud: ~${targetWordsTime} palabras.
        8. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.

        Texto original:
        ${text}`;
                break;

            case 'adjustWords':
                if (!targetWords) return res.status(400).json({ error: 'targetWords required for adjustWords' });
                const currentWords = text.split(/\s+/).length;
                const minWords = Math.floor(targetWords * 0.95); // 5% margin down
                const maxWords = Math.ceil(targetWords * 1.05);  // 5% margin up
                desiredWords = targetWords;

                prompt = `Actúa como un editor de noticias experto.

        OBJETIVO: Reescribir el siguiente texto para que tenga EXACTAMENTE alrededor de ${targetWords} palabras.
        
        Estado actual: ${currentWords} palabras.
        Meta: ${targetWords} palabras.

        Instrucciones:
        1. Si necesitas reducir: Resume, fusiona ideas, elimina redundancias.
        2. Si necesitas expandir: Agrega contexto, explicaciones o conectores (sin inventar datos).
        3. MANTÉN EL ESTILO DE NOTICIERO DE RADIO (fluido, hablado).
        4. PUNTUACIÓN RESPIRADA (CRUCIAL):
           - Usa COMAS para marcar pausas breves de respiración.
           - Usa PUNTOS para separar ideas claramente.
        5. NÚMEROS: Escríbelos en letras.
        6. Longitud permitida: entre ${minWords} y ${maxWords} palabras.
        7. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.

        Texto original:
        ${text}`;
                break;

            case 'humanizeAndAdjust':
                 if (!targetSeconds) return res.status(400).json({ error: 'targetSeconds required for humanizeAndAdjust' });
                 const currentWords2 = text.split(/\s+/).length;
                 const targetWords2 = Math.round((targetSeconds * 150) / 60); // 150 words per minute
                 desiredWords = targetWords2;
                 
                 // Stricter limits to avoid overshooting (User feedback: prefers under than over)
                 const minWords2 = Math.floor(targetWords2 * 0.90); // -10%
                 const maxWords2 = targetWords2; // Hard cap at target (0% margin upwards)
         
                 const ratio = targetWords2 / currentWords2;
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
         
                 prompt = `Actúa como un editor de noticias de radio experto con un CRONÓMETRO ESTRICTO.
         
                 METAS NUMÉRICAS (INVIOLABLES):
                 - Palabras actuales: ${currentWords2}
                 - OBJETIVO EXACTO: ${targetWords2} palabras.
                 - Rango permitido: ${minWords2} a ${maxWords2} palabras.
                 - TIEMPO AL AIRE: ${targetSeconds} segundos.
         
                 ESTRATEGIA REQUERIDA:
                 ${strategyInstruction}
         
                 REGLAS DE FORMATO Y PROSODIA:
                 1. LENGUAJE HABLADO: Tono natural de radio/TV.
                 2. PUNTUACIÓN RESPIRADA (CRUCIAL):
                    - Usa COMAS para marcar pausas breves de respiración.
                    - Usa PUNTOS para separar ideas claramente.
                    - Evita frases largas sin aire.
                 3. NÚMEROS: Escríbelos en letras ("veinte mil").
                 4. LIMPIEZA: Texto plano sin markdown, sin introducciones.
                 5. JAMÁS excedas de ${maxWords2} palabras. Es mejor quedarse corto que pasarse.
                 6. CRUCIAL: Solo el texto de la noticia. NUNCA incluyas frases como "Aquí está la noticia", "Reescrito:", etc. Directo al contenido.
         
                 Texto original:
                 ${text}`;
                break;

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        const modelName = 'MiniMax-M2.7';
        const maxTokens = clamp(Math.ceil(desiredWords * 2.2), 700, 2600);
        const temperature =
            action === 'clean' ? 0.2 : action === 'adjustWords' || action === 'adjustTime' ? 0.35 : 0.45;

        const generatedText = await generateMiniMaxWithContinuation({
            apiKey: minimaxApiKey,
            model: modelName,
            prompt,
            maxTokens,
            temperature
        });

        res.json({
            result: generatedText,
            model: modelName,
            usage: {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0
            }
        });

    } catch (error) {
        console.error('MiniMax API Error:', error);

        const status = Number(error?.status);
        const msg = String(error?.message || 'Internal Server Error');
        if (/429|too many requests|resource exhausted/i.test(msg)) {
            res.setHeader('Retry-After', '10');
            return res.status(429).json({ error: msg, retryAfterSeconds: 10 });
        }
        if (/403|permission_denied|unregistered callers/i.test(msg)) {
            return res.status(403).json({ error: msg });
        }

        if (Number.isFinite(status) && status >= 400 && status <= 599) {
            return res.status(status).json({ error: msg });
        }
        
        res.status(500).json({ error: msg });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8888;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
        console.log(`Scrape endpoint: http://localhost:${PORT}/api/scrape`);
    });
}

module.exports = app;
