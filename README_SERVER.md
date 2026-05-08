# Servidor Backend para VIRA

Este servidor Node.js/Express proporciona los endpoints necesarios para la funcionalidad de scraping de noticias.

## Instalación

Las dependencias usadas por el backend incluyen:
- express
- cors
- @supabase/supabase-js
- nodemailer
- googleapis

## Ejecución

Para ejecutar el servidor backend:

```bash
# Opción 1: Ejecutar el servidor directamente
node server.js

# Opción 2: Ejecutar usando npm (recomendado)
npm run start:server
```

El servidor se iniciará en el puerto **8888**.

## Endpoints Disponibles

### 1. Health Check
- **URL:** `GET http://localhost:8888/api/health`
- **Descripción:** Verifica que el servidor esté funcionando correctamente
- **Respuesta:** JSON con `{ status: 'ok', timestamp: '...' }`

### 2. Scrape News
- **URL:** `POST http://localhost:8888/api/scrape`
- **Headers:**
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "sources": ["id1", "id2", "id3"]
  }
  ```
- **Descripción:** Obtiene noticias de las fuentes especificadas usando ScrapingBee y las guarda en Supabase
- **Respuesta:**
  ```json
  {
    "success": true,
    "count": 3,
    "message": "Successfully scraped 3 news items"
  }
  ```
- **Error:**
  ```json
  {
    "success": false,
    "error": "Error message"
  }
  ```

## Configuración

El servidor está configurado con:
- **Supabase URL:** https://xetifamvebflkytbwmir.supabase.co
- **ScrapingBee API Key:** Configurada en el código del servidor

### Correo de bienvenida con Gmail OAuth

Estas variables deben existir solo en el backend:

```env
BACKEND_PUBLIC_URL=https://tu-backend.com
APP_URL=https://tu-frontend.com
MAIL_LOGIN_URL=https://tu-frontend.com/login
MAIL_FROM_NAME=VIRA
MAIL_FROM_ADDRESS=notificaciones@tu-dominio.com
GOOGLE_MAIL_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_MAIL_CLIENT_SECRET=tu_secreto_privado
GOOGLE_MAIL_REDIRECT_URI=https://tu-backend.com/api/mail/google/callback
GOOGLE_MAIL_REFRESH_TOKEN=se_obtiene_despues_del_callback
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
```

Flujo recomendado:

1. Configura en Google Cloud Console un OAuth Client de tipo `Web application`.
2. En `Authorized redirect URIs` agrega `https://tu-backend.com/api/mail/google/callback`.
3. Levanta el backend y abre `GET /api/mail/google/auth-url`.
4. Autoriza la cuenta Gmail que enviará correos.
5. Copia el `refresh token` mostrado por el callback y guárdalo como `GOOGLE_MAIL_REFRESH_TOKEN`.
6. Verifica el estado con `GET /api/mail/status`.

El frontend ya no expone `googleClientSecret`, `googleClientId`, `googleRedirectUri` ni `googleCloudTtsApiKey` en `public/env.js`.

### Recuperación de contraseña

Flujo implementado:

1. `POST /api/auth/forgot-password`
2. El backend genera un token temporal, lo guarda hasheado en `public.password_reset_tokens`
3. Se envía un correo con enlace a `/reset-password?token=...`
4. `POST /api/auth/reset-password` actualiza la clave en `auth.users`

Antes de usarlo, aplica la migración:

```sql
-- Ejecuta el contenido de supabase/migrations/032_password_reset_tokens.sql
```

## Integración con la Aplicación Angular

La aplicación Angular en [`src/environments/environment.ts`](src/environments/environment.ts:5) ya está configurada para usar este servidor:

```typescript
apiUrl: 'http://localhost:8888'
```

Los componentes que usan este endpoint:
- [`src/app/pages/crear-noticiario/crear-noticiario.component.ts`](src/app/pages/crear-noticiario/crear-noticiario.component.ts:249) - Botón "Obtener Noticias"
- [`src/app/pages/fuentes/fuentes.component.ts`](src/app/pages/fuentes/fuentes.component.ts:259) - Botón "Obtener Noticias" en header

## Flujo de Funcionamiento

1. El usuario hace clic en el botón "Obtener Noticias"
2. Angular envía una solicitud POST a `http://localhost:8888/api/scrape` con los IDs de las fuentes
3. El servidor backend:
   - Obtiene las fuentes activas de Supabase
   - Para cada fuente, hace una solicitud a ScrapingBee para obtener el contenido HTML
   - Extrae información básica de la noticia (título, contenido, resumen)
   - Inserta las noticias en la tabla `scraped_news` de Supabase
4. El servidor responde con el número de noticias scrapeadas
5. Angular muestra un mensaje de éxito al usuario
6. Angular recarga la lista de noticias disponibles

## Notas

- El servidor debe estar ejecutándose para que la funcionalidad funcione
- Asegúrate de tener fuentes activas configuradas en Supabase antes de hacer scraping
- Las noticias scrapeadas se guardan en Supabase y pueden ser usadas en la página /crear-noticiario
