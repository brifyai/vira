# Instrucciones de Ejecución - VIRA

## 🚀 Opción 1: Ejecutar con npm (Recomendado)

```bash
cd g:/virafinal
npm install
npm start
```

## 🔄 Opción 2: Reinstalar dependencias (si hay errores)

```bash
# Limpiar caché de npm
npm cache clean --force

# Eliminar node_modules
rmdir /s /q node_modules

# Reinstalar dependencias
npm install

# Ejecutar
npm start
```

## 🛠️ Opción 3: Usar npx (Alternativa)

```bash
cd g:/virafinal
npx -y @angular/cli@latest serve
```

## 📦 Opción 4: Usar yarn (si npm tiene problemas)

```bash
cd g:/virafinal
npm install -g yarn
yarn install
yarn start
```

## 🔧 Opción 5: Verificar y corregir dependencias

```bash
cd g:/virafinal
npm audit fix
npm install
npm start
```

## 📋 Opción 6: Ejecutar con Node.js directamente

```bash
cd g:/virafinal
node node_modules/@angular/cli/bin/ng serve
```

## 🌐 Opción 7: Usar VS Code

1. Abre el proyecto en VS Code
2. Presiona `F5` o ve a `Run > Start Debugging`
3. Selecciona "ng serve" en el dropdown

## ⚠️ Solución de Problemas Comunes

### Error: "Cannot find module '@angular/...'"
**Solución:**
```bash
npm install
# O
npm install @angular/common @angular/compiler @angular/core @angular/forms @angular/platform-browser @angular/router
```

### Error: "MODULE_NOT_FOUND"
**Solución:**
```bash
npm cache clean --force
rmdir /s /q node_modules
npm install
```

### Error: "Cannot find module 'semver'"
**Solución:**
```bash
npm install semver --save-dev
npm install
```

## ✅ Verificación de Instalación

Después de ejecutar `npm install`, verifica:

1. **node_modules existe:**
   ```bash
   dir node_modules
   ```

2. **Paquetes instalados:**
   ```bash
   npm list --depth=0
   ```

3. **Angular CLI disponible:**
   ```bash
   npx ng --version
   ```

## 📊 Estructura del Proyecto

```
virafinal/
├── src/
│   ├── app/
│   │   ├── pages/ (5 componentes principales)
│   │   ├── services/ (servicio de Supabase)
│   │   ├── app.component.ts/html/scss
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/
│   ├── styles.scss
│   └── index.html
├── supabase/
│   └── migrations/001_initial_schema.sql (aplicado en Supabase)
├── package.json (actualizado con dependencias)
├── angular.json
├── README.md
├── SETUP_GUIDE.md
└── INSTRUCCIONES_EJECUCION.md (este archivo)
```

## 🎯 Pasos Recomendados

1. **Primero:**
   ```bash
   npm cache clean --force
   rmdir /s /q node_modules
   npm install
   ```

2. **Segundo:**
   ```bash
   npm start
   ```

3. **Abrir navegador:**
   - Ve a: http://localhost:4200
   - O usa el puerto que indique Angular (generalmente 4200)

## 🔑 Información de Supabase

**Proyecto:** xetifamvebflkytbwmir
**URL:** https://xetifamvebflkytbwmir.supabase.co
**Región:** us-west-2

**Configuración en environment.ts:**
- ✅ supabaseUrl configurada
- ✅ supabaseAnonKey configurada
- ✅ Todas las API keys configuradas

## 📝 Notas Importantes

1. **Node.js versión:** Asegúrate de tener Node.js v18 o superior
   ```bash
   node --version
   ```

2. **npm versión:** Asegúrate de tener npm v8 o superior
   ```bash
   npm --version
   ```

3. **Puerto:** Angular generalmente usa el puerto 4200
   - Si el puerto está ocupado, Angular usará otro automáticamente
   - Verifica el puerto en la consola al ejecutar `npm start`

4. **Tiempo de compilación:** La primera compilación puede tomar 1-3 minutos
   - Las compilaciones siguientes serán más rápidas

5. **Errores de compilación:** Si hay errores de TypeScript:
   - Verifica los archivos `.ts` indicados
   - Corrige los errores de tipado
   - Vuelve a ejecutar `npm start`

## 🆘 Soporte

Si continúas teniendo problemas:

1. **Revisa la consola** del terminal para ver errores específicos
2. **Revisa el archivo** `angular-errors.log` si existe
3. **Intenta con otro navegador** (Chrome, Firefox, Edge)
4. **Limpia el caché del navegador** si la página no carga correctamente

## ✨ Características de la Aplicación

Una vez ejecutada, la aplicación tendrá:

- ✅ Interfaz moderna con tema oscuro
- ✅ 5 páginas principales funcionales
- ✅ Menú de navegación responsive
- ✅ Conexión configurada con Supabase
- ✅ Servicio de Supabase con métodos CRUD completos
- ✅ Datos de ejemplo en todos los componentes
- ✅ Diseño responsive para móvil, tablet y desktop

## 🎯 Próximos Pasos

Una vez que la aplicación esté ejecutándose:

1. **Configurar Google OAuth en Supabase:**
   - Ve a: https://supabase.com/dashboard/project/xetifamvebflkytbwmir/auth/providers
   - Habilita Google OAuth
   - Usa las credenciales proporcionadas

2. **Crear usuario admin:**
   - Inicia sesión con Google OAuth
   - Edita el usuario en la tabla `users`
   - Cambia el rol a 'admin'

3. **Implementar servicios backend:**
   - ScrapingBee para scrapeo de noticias
   - Gemini AI para humanización
   - Google Cloud TTS para texto a voz

¡La aplicación está lista para ser usada! 🚀
