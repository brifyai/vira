# Servidor Backend para VIRA

Este servidor Node.js/Express proporciona los endpoints necesarios para la funcionalidad de scraping de noticias.

## Instalación

Las dependencias ya están instaladas en el proyecto:
- express
- cors
- @supabase/supabase-js

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
