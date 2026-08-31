# Guía de Despliegue Serverless — ZMH Hub & Bot de WhatsApp

Esta guía describe cómo desplegar toda la arquitectura de **Zero-Management Hub (ZMH)** sin depender de Render, garantizando alta disponibilidad, seguridad estricta y velocidad instantánea (<50ms).

---

## 1. Arquitectura General

- **Frontend (Concentrador de Enlaces, Catálogo, POS/Caja, Inventario PIMS, Métricas):**
  - Desplegado 100% **Serverless** en **Vercel** o **Firebase App Hosting / Hosting**.
  - No depende de que ningún servidor esté encendido para mostrar el concentrador de enlaces o cargar datos.
  - Genera tickets PDF de 80mm de forma serverless en Next.js.
  - Incluye fallback SVG automático para fotos de perfil y avatares de WhatsApp.

- **Bot de WhatsApp (Baileys):**
  - Desplegado en **Google Cloud Run** (en el mismo proyecto de Firebase `zmh-extraction-engine`).
  - Corre con `--min-instances 1` para mantener la conexión WebSocket 24/7 sin hibernación.
  - Auto-reconexión con backoff exponencial y protección contra errores 404 de fotos de perfil.

- **Base de Datos y Almacenamiento:**
  - **Firebase Firestore & Storage** (proyecto `zmh-extraction-engine`).
  - Protegido con `firestore.rules` que bloquean el acceso no autorizado a sesiones, tokens y reportes.

---

## 2. Despliegue del Frontend en Vercel (Recomendado - 2 minutos)

1. En tu cuenta de [Vercel](https://vercel.com), haz clic en **Add New Project** e importa el repositorio.
2. Selecciona como **Root Directory**: `frontend`.
3. Configura las siguientes Variables de Entorno en Vercel:
   ```env
   # Firebase Admin Credentials (JSON de cuenta de servicio)
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"zmh-extraction-engine",...}

   # Firebase Client SDK
   NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=zmh-extraction-engine.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=zmh-extraction-engine
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=zmh-extraction-engine.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=tu_app_id

   # URL de tu Bot en Cloud Run (Opcional, para envío de WhatsApp)
   BOT_SERVER_URL=https://zmh-whatsapp-bot-xxxxxx.a.run.app
   ```
4. Haz clic en **Deploy**. El Concentrador de Enlaces y todas las rutas estarán activas de inmediato en tu dominio `.vercel.app` o tu dominio personalizado.

---

## 3. Despliegue del Bot de WhatsApp en Google Cloud Run (Reemplazo de Render)

El bot corre como contenedor Docker ligero en Google Cloud Run (mismo proyecto de Firebase).

### Opción A: Despliegue con un solo comando usando Google Cloud CLI (`gcloud`)

1. Autentícate en Google Cloud:
   ```bash
   gcloud auth login
   gcloud config set project zmh-extraction-engine
   ```
2. Habilita los servicios requeridos:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```
3. Despliega el contenedor:
   ```bash
   gcloud run deploy zmh-whatsapp-bot \
     --source . \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --min-instances 1 \
     --memory 512Mi \
     --cpu 1 \
     --timeout 300 \
     --set-env-vars "CRON_KEY=tu_clave_secreta_super_segura,FIREBASE_SERVICE_ACCOUNT={\"type\":\"service_account\"...}"
   ```

### Opción B: Despliegue Automatizado con Cloud Build
Ejecuta:
```bash
gcloud builds submit --config=cloudbuild.yaml .
```

---

## 4. Despliegue de Reglas de Seguridad en Firebase Firestore

Aplica las reglas seguras para sellar la base de datos contra accesos no autorizados:
```bash
firebase deploy --only firestore:rules
```

---

## 5. Endpoints Disponibles y Verificación

| Endpoint | Tipo | Descripción |
| :--- | :--- | :--- |
| `GET /api/health` | Serverless / Bot | Estado de salud y conectividad de la base de datos |
| `GET /api/avatar/:jid` | Serverless (Next.js) | Proxy de foto de perfil con fallback SVG instantáneo (nunca falla con 500) |
| `POST /api/dispatch` | Serverless (Next.js) | Valida orden, deduce inventario, guarda métricas y genera ticket térmico de 80mm |
| `GET /api/catalog/:jid` | Serverless (Next.js) | Lee catálogo compilado directamente de Firestore en <50ms |
| `GET /api/report/daily?key=...` | Bot en Cloud Run | Dispara el reporte diario por CSV (requiere `CRON_KEY` estricto) |
