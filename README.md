# VIRA - Sistema de Gestión de Noticieros

Sistema completo para la creación, gestión y automatización de noticieros con scraping inteligente, humanización de contenido con IA y gestión de fuentes de noticias.

## 🚀 Características Principales

### 📰 Gestión de Noticias
- **Scraping Inteligente**: Extracción automática de noticias desde múltiples fuentes usando ScrapingBee
- **Contenido Completo**: El scraper entra a cada noticia individual para extraer el contenido completo
- **Humanización con IA**: Reescritura de noticias usando Google Gemini AI para un tono más natural y conversacional
- **Vista Previa Completa**: Modal para ver el contenido completo de cada noticia antes de seleccionarla

### 🎯 Crear Noticiario
- Selección de noticias desde múltiples fuentes
- Organización y ordenamiento de noticias
- Control de duración del noticiero
- Humanización masiva de noticias seleccionadas
- Resumen automático del noticiero

### 🔧 Gestión de Fuentes
- Administración de fuentes de noticias
- Configuración de categorías por fuente
- Activación/desactivación de fuentes
- Soporte para múltiples secciones de un mismo sitio

### ⚡ Automatización
- Scraping programado de fuentes
- Procesamiento automático de noticias
- Gestión de activos de automatización

## 🛠️ Stack Tecnológico

### Frontend
- **Angular 21**: Framework principal
- **Angular Material**: Componentes UI
- **TypeScript**: Lenguaje de programación
- **SCSS**: Estilos

### Backend
- **Node.js + Express**: Servidor API
- **Supabase**: Base de datos PostgreSQL y autenticación
- **ScrapingBee**: Servicio de web scraping con renderizado JavaScript
- **Google Gemini AI**: Humanización y reescritura de contenido

## 📦 Instalación

### Prerrequisitos
- Node.js 18+ y npm
- Cuenta de Supabase
- API Key de ScrapingBee
- API Key de Google Gemini

### 1. Clonar el repositorio
```bash
git clone https://github.com/brifyai/nuevavira.git
cd nuevavira
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno

Edita `src/environments/environment.ts` y `src/environments/environment.prod.ts`:

```typescript
export const environment = {
    production: false,
    apiUrl: 'http://localhost:8888',
    appUrl: 'http://localhost:4200',
    
    // Supabase
    supabaseUrl: 'TU_SUPABASE_URL',
    supabaseAnonKey: 'TU_SUPABASE_ANON_KEY',
    
    // ScrapingBee
    scrapingBeeApiKey: 'TU_SCRAPINGBEE_API_KEY',
    
    // Google Gemini
    geminiApiKey: 'TU_GEMINI_API_KEY',
    
    // Otros...
};
```

### 4. Configurar base de datos

Ejecuta las migraciones en Supabase (carpeta `supabase/migrations/`):
1. `001_initial_schema.sql`
2. `002_fix_rls_recursion.sql`
3. `003_fix_rls_users.sql`
4. `004_fix_all_rls_recursion.sql`
5. `005_fix_infinite_recursion_final.sql`

### 5. Iniciar el servidor API
```bash
node server.js
```

El servidor estará disponible en `http://localhost:8888`

### 6. Iniciar la aplicación Angular
```bash
npm start
```

La aplicación estará disponible en `http://localhost:4200`

## 🎮 Uso

### Agregar Fuentes de Noticias

1. Ve a **Fuentes** en el menú
2. Haz clic en "Agregar Fuente"
3. Completa:
   - Nombre (ej: "Soy Chile - Deportes")
   - URL (ej: "https://soychile.cl/deportes")
   - Categoría (ej: "deportes")
4. Guarda la fuente

### Scrapear Noticias

1. Ve a **Crear Noticiario**
2. Selecciona una fuente del dropdown
3. Haz clic en "Obtener Noticias"
4. Espera mientras el sistema:
   - Scrapea la página principal
   - Encuentra hasta 10 noticias
   - Entra a cada noticia para extraer el contenido completo
   - Guarda todo en la base de datos

### Crear un Noticiario

1. En **Crear Noticiario**, completa:
   - Título del noticiero
   - Descripción
   - Duración en minutos
2. Selecciona noticias de la lista disponible
3. Organiza el orden con las flechas
4. (Opcional) Haz clic en "Humanizar y Reescribir Noticias" para mejorar el contenido con IA
5. Haz clic en "Crear Noticiero"

### Ver Contenido Completo

- Haz clic en el ícono del ojo (👁️) en cualquier noticia seleccionada
- Se abrirá un modal con:
  - Título completo
  - Fuente y categoría
  - Contenido original completo
  - Contenido humanizado (si fue procesado)
  - Link a la noticia original

## 📁 Estructura del Proyecto

```
virafinal/
├── src/
│   ├── app/
│   │   ├── pages/
│   │   │   ├── crear-noticiario/      # Creación de noticieros
│   │   │   ├── dashboard/             # Panel principal
│   │   │   ├── fuentes/               # Gestión de fuentes
│   │   │   ├── ultimo-minuto/         # Noticias de último minuto
│   │   │   ├── timeline-noticiario/   # Timeline de noticieros
│   │   │   └── automatizacion-activos/ # Automatización
│   │   ├── services/
│   │   │   ├── supabase.service.ts    # Servicio de Supabase
│   │   │   └── auth.service.ts        # Autenticación
│   │   └── guards/                    # Guards de rutas
│   ├── environments/                  # Configuración de entornos
│   └── styles.scss                    # Estilos globales
├── supabase/
│   ├── migrations/                    # Migraciones de BD
│   └── functions/                     # Edge functions
├── server.js                          # Servidor API Express
├── package.json
└── angular.json
```

## 🔑 APIs y Servicios

### ScrapingBee
- Renderizado JavaScript completo
- Espera de 2-3 segundos para carga dinámica
- Ventana de 1920x1080 para mejor renderizado
- Extracción de contenido completo de artículos

### Google Gemini AI
- Modelo: gemini-pro
- Reescritura natural y conversacional
- Mantiene información factual
- Mejora legibilidad para audio/video

### Supabase
- PostgreSQL con Row Level Security
- Autenticación de usuarios
- Almacenamiento de noticias y configuración
- Vistas optimizadas para consultas

## 🚨 Solución de Problemas

### El scraping no encuentra noticias
- Verifica que la URL de la fuente sea correcta
- Asegúrate de que el servidor esté corriendo
- Revisa los logs del servidor para ver errores
- Algunas fuentes pueden requerir patrones específicos

### El contenido está incompleto
- El scraper intenta múltiples patrones de extracción
- Si falla, usa el botón "Humanizar" para generar contenido con IA
- Verifica que ScrapingBee tenga créditos disponibles

### Error de autenticación en Supabase
- Verifica las credenciales en `environment.ts`
- Asegúrate de que las políticas RLS estén configuradas
- Ejecuta todas las migraciones en orden

## 📝 Notas Importantes

- **Límite de noticias**: Máximo 10 noticias por fuente para optimizar uso de ScrapingBee
- **Tiempo de scraping**: Puede tomar 1-2 minutos por fuente (1 llamada para la página principal + hasta 10 para artículos individuales)
- **Humanización**: Procesa cada noticia individualmente, puede tomar tiempo con muchas noticias

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es privado y confidencial.

## 👥 Contacto

Para preguntas o soporte, contacta al equipo de desarrollo.
