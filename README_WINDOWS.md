# LINU — Cómo descargar y compilar para Windows 10 y 11 (.EXE)

## Opción 1: Descargar el código y compilar el instalador `.EXE`

1. **Descarga el proyecto** en formato `.zip` desde el botón de descarga/exportación de Google AI Studio y descomprímelo en una carpeta de tu PC con Windows.
2. Asegúrate de tener instalado **Node.js 20 o superior**.
3. Crea un archivo `.env` en la raíz del proyecto (junto a `.env.example`) con tu clave de Gemini:
   ```env
   GEMINI_API_KEY="TU_CLAVE_DE_GEMINI"
   ```
4. Abre una terminal (PowerShell o CMD) dentro de la carpeta del proyecto e instala las dependencias:
   ```bash
   npm install
   npm install -D electron electron-builder
   ```
5. Compila el frontend y el servidor local:
   ```bash
   npm run build
   npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/server.mjs
   ```
6. Genera el instalador `.exe` para Windows:
   ```bash
   npx electron-builder --win --config electron-builder.yml
   ```

El archivo instalador `LINU-Setup-0.0.0.exe` (y una versión portable) se generarán dentro de la carpeta `release/`.

## Opción 2: Probarlo directamente en ventana flotante sin compilar el `.EXE`

Con las dependencias instaladas (pasos 1 a 4):

```bash
npm run dev
```

Y en otra terminal:

```bash
npx electron electron/main.cjs
```
