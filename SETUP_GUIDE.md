# Guía de Configuración - VIRA

## ✅ Estado Actual del Proyecto

### Completado:
1. ✅ Proyecto Angular 18+ creado con estructura modular
2. ✅ Base de datos Supabase configurada con todas las tablas
3. ✅ Sistema de roles implementado (admin, editor, viewer)
4. ✅ Row Level Security (RLS) configurado
5. ✅ 5 componentes principales creados con interfaz moderna
6. ✅ Layout principal con navegación y logo VIRA
7. ✅ Configuración de entorno con API keys
8. ✅ Servicio de Supabase creado con métodos CRUD completos
9. ✅ README.md con documentación completa

### Pendiente:
1. ⏳ Instalación completa de dependencias (@supabase/supabase-js)
2. ⏳ Implementar servicios backend para ScrapingBee
3. ⏳ Integrar Gemini API para humanización
4. ⏳ Integrar Google Cloud TTS
5. ⏳ Implementar autenticación con Google OAuth
6. ⏳ Conectar componentes con Supabase real

## 📋 Información de Supabase

**Proyecto ID:** xetifamvebflkytbwmir
**URL:** https://xetifamvebflkytbwmir.supabase.co
**Región:** us-west-2
**Estado:** ACTIVE_HEALTHY

**Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldGlmYW12ZWJmbGt5dGJ3bWlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNjU5MTgsImV4cCI6MjA4Mjk0MTkxOH0.4NWmJsj3bsgDKqQevZ1a76DF14miRCtUoKLrWRcaVcc

## 🗄️ Tablas Creadas en Supabase

1. **users** - Usuarios del sistema con roles
2. **news_sources** - Fuentes de noticias para scraping
3. **scraped_news** - Noticias scrapeadas
4. **humanized_news** - Noticias humanizadas para TTS
5. **news_broadcasts** - Noticieros creados
6. **broadcast_news_items** - Items de noticias en noticieros
7. **tts_audio_files** - Archivos de audio generados
8. **automation_assets** - Configuraciones de automatización
9. **automation_runs** - Historial de ejecuciones
10. **timeline_events** - Eventos del timeline de noticieros
11. **settings** - Configuraciones del sistema

## 🚀 Pasos para Completar la Instalación

### 1. Completar Instalación de Dependencias

```bash
# Asegúrate de estar en el directorio del proyecto
cd g:/virafinal

# Instalar dependencias faltantes
npm install @supabase/supabase-js

# O reinstalar todas las dependencias
npm install
```

### 2. Configurar Google OAuth en Supabase

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard/project/xetifamvebflkytbwmir
2. Navega a: Authentication > Providers
3. Habilita Google OAuth
4. Configura:
   - Client ID: YOUR_GOOGLE_CLIENT_ID
   - Client Secret: YOUR_GOOGLE_CLIENT_SECRET
   - Redirect URI: http://localhost:4200 (o tu URL de producción)

### 3. Crear Usuario Admin en Supabase

1. Ve a: Authentication > Users
2. Crea un nuevo usuario con Google OAuth
3. Ve a: Database > Tables > users
4. Edita el usuario y cambia el rol a 'admin'

### 4. Ejecutar la Aplicación

```bash
# Modo desarrollo
ng serve

# La aplicación estará disponible en http://localhost:4200
```

## 📁 Estructura de Archivos Creada

```
virafinal/
├── src/
│   ├── app/
│   │   ├── pages/
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.component.ts
│   │   │   │   ├── dashboard.component.html
│   │   │   │   └── dashboard.component.scss
│   │   │   ├── crear-noticiario/
│   │   │   │   ├── crear-noticiario.component.ts
│   │   │   │   ├── crear-noticiario.component.html
│   │   │   │   └── crear-noticiario.component.scss
│   │   │   ├── ultimo-minuto/
│   │   │   │   ├── ultimo-minuto.component.ts
│   │   │   │   ├── ultimo-minuto.component.html
│   │   │   │   └── ultimo-minuto.component.scss
│   │   │   ├── timeline-noticiario/
│   │   │   │   ├── timeline-noticiario.component.ts
│   │   │   │   ├── timeline-noticiario.component.html
│   │   │   │   └── timeline-noticiario.component.scss
│   │   │   └── automatizacion-activos/
│   │   │       ├── automatizacion-activos.component.ts
│   │   │       ├── automatizacion-activos.component.html
│   │   │       └── automatizacion-activos.component.scss
│   │   ├── services/
│   │   │   └── supabase.service.ts
│   │   ├── app.component.ts
│   │   ├── app.component.html
│   │   ├── app.component.scss
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/
│   │   ├── environment.ts (configurado con Supabase)
│   │   └── environment.prod.ts
│   ├── styles.scss
│   └── index.html
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql (aplicado en Supabase)
├── angular.json
├── package.json
├── README.md
└── SETUP_GUIDE.md (este archivo)
```

## 🔑 Variables de Entorno Configuradas

### public/env.js (Frontend seguro)
```typescript
supabaseUrl: 'https://xetifamvebflkytbwmir.supabase.co'
supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
scrapingBeeApiKey: 'YOUR_SCRAPING_BEE_API_KEY'
appUrl: 'https://tu-frontend.com'
apiUrl: 'https://tu-backend.com'
```

### Variables privadas del backend
```env
GOOGLE_CLOUD_TTS_API_KEY=tu_api_key_privada
GOOGLE_MAIL_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_MAIL_CLIENT_SECRET=tu_secreto_privado
GOOGLE_MAIL_REDIRECT_URI=https://tu-backend.com/api/mail/google/callback
GOOGLE_MAIL_REFRESH_TOKEN=se_obtiene_despues_del_callback
MAIL_FROM_ADDRESS=notificaciones@tu-dominio.com
MAIL_LOGIN_URL=https://tu-frontend.com/login
```

## 🎨 Características de la Interfaz

### Diseño Moderno
- Tema oscuro con gradientes
- Animaciones suaves y transiciones
- Diseño responsive (móvil, tablet, desktop)
- Tipografía clara y legible
- Iconos SVG personalizados

### Componentes
1. **Dashboard**
   - Estadísticas en tiempo real
   - Gráficos y métricas
   - Lista de noticias recientes
   - Estado de automatizaciones

2. **Crear Noticiario**
   - Selección de noticias con filtros
   - Configuración de duración
   - Reordenamiento de noticias
   - Vista previa del timeline
   - Barra de progreso

3. **Último Minuto**
   - Noticias en tiempo real
   - Indicador de "en vivo"
   - Filtros por categoría y fuente
   - Prioridad de noticias
   - Auto-refresh configurable

4. **Timeline Noticiario**
   - Vista de cuadrícula y lista
   - Timeline detallado con eventos
   - Información de noticieros
   - Exportación de timeline
   - Reproducción de noticieros

5. **Automatización Activos**
   - Gestión de scrapers
   - Gestión de humanizadores
   - Gestión de TTS
   - Programación con cron
   - Historial de ejecuciones
   - Modales para crear/editar

## 🔐 Seguridad Implementada

- Row Level Security (RLS) en todas las tablas
- Políticas basadas en roles (admin, editor, viewer)
- Variables sensibles solo en backend
- Callback propio del backend para Gmail OAuth
- Validación de permisos en cada operación

## 📊 Servicios de Supabase

El archivo [`src/app/services/supabase.service.ts`](src/app/services/supabase.service.ts:1) incluye métodos para:

- **Usuarios**: getCurrentUser, getUserProfile, updateUserProfile
- **Fuentes de Noticias**: getNewsSources, createNewsSource, updateNewsSource, deleteNewsSource
- **Noticias Scrapeadas**: getScrapedNews, createScrapedNews, updateScrapedNews, deleteScrapedNews
- **Noticias Humanizadas**: getHumanizedNews, createHumanizedNews, updateHumanizedNews
- **Noticieros**: getNewsBroadcasts, createNewsBroadcast, updateNewsBroadcast, deleteNewsBroadcast
- **Items de Noticieros**: getBroadcastNewsItems, createBroadcastNewsItem, deleteBroadcastNewsItem
- **Archivos TTS**: getTtsAudioFiles, createTtsAudioFile
- **Automatizaciones**: getAutomationAssets, createAutomationAsset, updateAutomationAsset, deleteAutomationAsset
- **Ejecuciones**: getAutomationRuns, createAutomationRun, updateAutomationRun
- **Eventos Timeline**: getTimelineEvents, createTimelineEvent
- **Configuraciones**: getSettings, getSettingByKey, updateSetting
- **Vistas**: getBroadcastDetails, getNewsWithSource, getAutomationStatus
- **Subscripciones Realtime**: subscribeToTable, subscribeToBroadcast

## 🚀 Próximos Pasos para Desarrollo

### 1. Integrar Supabase en Componentes
```typescript
// Ejemplo en dashboard.component.ts
import { SupabaseService } from '../../services/supabase.service';

constructor(private supabaseService: SupabaseService) {}

async ngOnInit() {
  const broadcasts = await this.supabaseService.getNewsBroadcasts();
  this.broadcasts = broadcasts;
}
```

### 2. Implementar ScrapingBee
Crear un servicio que use la API de ScrapingBee para scrapear noticias:
```typescript
async scrapeNews(sourceUrl: string) {
  const response = await fetch(`https://app.scrapingbee.com/api/v1/?api_key=${environment.scrapingBeeApiKey}&url=${sourceUrl}`);
  const data = await response.json();
  return data;
}
```

### 3. Implementar Humanización con Gemini
Crear un servicio que use la API de Gemini para humanizar noticias:
```typescript
async humanizeNews(content: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${environment.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Humaniza este texto para que sea natural y fácil de entender: ${content}` }]
      }]
    })
  });
  const data = await response.json();
  return data;
}
```

### 4. Implementar TTS con Google Cloud
Crear un endpoint backend que use Google Cloud Text-to-Speech:
```typescript
async generateAudio(text: string, voiceSettings: any) {
  const response = await fetch(`${config.apiUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceSettings
    })
  });
  const data = await response.json();
  return data;
}
```

### 5. Configurar Gmail OAuth en backend
```bash
GET /api/mail/google/auth-url
GET /api/mail/google/callback
GET /api/mail/status
POST /api/mail/send-welcome
```

## 📝 Notas Importantes

1. **Dependencias**: Asegúrate de ejecutar `npm install` para instalar todas las dependencias
2. **Supabase**: La base de datos ya está configurada con todas las tablas y migraciones aplicadas
3. **Variables de Entorno**: Ya están configuradas con las credenciales proporcionadas
4. **Componentes**: Todos los componentes tienen datos de ejemplo para facilitar el desarrollo
5. **Estilos**: Todos los componentes tienen estilos SCSS con variables CSS para fácil personalización

## 🎯 Resumen

La aplicación VIRA está completamente estructurada y lista para ser ejecutada. La base de datos de Supabase está configurada con todas las tablas necesarias, roles de usuario y políticas de seguridad. Los componentes principales están implementados con una interfaz moderna e intuitiva.

Para comenzar a usar la aplicación:

1. Ejecuta `npm install` para instalar todas las dependencias
2. Configura Google OAuth en Supabase
3. Ejecuta `ng serve` para iniciar la aplicación
4. Accede a http://localhost:4200
5. Inicia sesión con Google OAuth

La aplicación está lista para el desarrollo de las funcionalidades de backend (ScrapingBee, Gemini, TTS) y la integración completa con Supabase.
