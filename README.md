# Zero-Management Hub (ZMH) — Extraction Engine & Concentrador de Enlaces

Zero-Management Hub (ZMH) es una plataforma digital de comercio conversacional y concentrador de enlaces de alto rendimiento, optimizada para marcas y comercios que operan a través de WhatsApp.

## Características Principales

1. **Concentrador de Enlaces (`/[comercio]`):**
   - Página de aterrizaje ultrarrápida (Server-Side Rendered con ISR a 30s) para canales de WhatsApp, catálogo, redes sociales y contacto directo.
   - 100% Serverless, desacoplado de cualquier servidor fijo.
   - Sistema inteligente de avatares con caché Edge y fallback SVG geométrico en tiempo real (cero errores 500).

2. **Catálogo Digital y Tienda Web (`/[comercio]/catalogo` y `/[comercio]/producto/[id]`):**
   - Lectura directa desde el modelo CQRS en Firestore (`_system/catalog`).
   - Carrito de compras, selector de variaciones, cálculo de total y despacho de pedidos.

3. **Punto de Venta / Caja Express (`/[comercio]/caja/[token]`):**
   - Monitor de comandas y pedidos en tiempo real vía Firebase Firestore Snapshot Listener.
   - Impresión térmica instantánea de 80mm e histórico diario.

4. **Gestor de Inventario PIMS (`/[comercio]/inventory/[token]`):**
   - Control de stock, creación y edición de productos, gestión de variaciones, subida optimizada de imágenes a Firebase Storage.
   - Control de acceso por Token Maestro y Tokens de Área.

5. **Panel de Métricas y Estadísticas (`/[comercio]/analytics/[token]`):**
   - Análisis de ventas por asesor, canal, modalidad (Mayorista / Minorista) y productos más vendidos.
   - Protegido por Token Criptográfico de Métricas (`metricsToken`).

6. **Bot de WhatsApp y Generación de Facturas (Baileys):**
   - Despacho automático de tickets PDF en formato térmico de 80mm vía WhatsApp.
   - Diseñado para correr en Google Cloud Run con reconexión automática y tolerancia a fallos.

---

## Estructura del Proyecto

```
zmh-extraction-engine/
├── frontend/                     # Aplicación Next.js 14 Serverless
│   ├── app/
│   │   ├── [comercio]/           # Concentrador de enlaces, catálogo, caja, inventario, métricas
│   │   ├── actions/              # Server Actions protegidas (inventory, analytics, user)
│   │   ├── api/                  # Rutas API Serverless (avatar, catalog, dispatch, health)
│   │   ├── globals.css           # Estilos globales con Tailwind CSS
│   │   └── layout.tsx            # Layout raíz
│   ├── components/               # Componentes React de UI
│   ├── lib/                      # Singletons de Firebase Admin y Client SDK
│   └── package.json              # Dependencias de Next.js y PDFKit
├── services/                     # Servicios del Bot de WhatsApp
│   ├── firebase.js               # Firebase Admin Singleton
│   ├── metrics.js                # Rollups OLAP y deducción de stock
│   └── pdf.js                    # Generador de tickets PDF
├── server.js                     # Servidor del Bot de WhatsApp en Baileys
├── Dockerfile                    # Contenedor optimizado para Google Cloud Run
├── cloudbuild.yaml               # Pipeline automatizado de despliegue en GCP
├── firestore.rules               # Reglas de seguridad de Firestore
├── DEPLOYMENT.md                 # Manual completo de despliegue
└── package.json                  # Dependencias del Bot de WhatsApp
```

---

## Despliegue Rápido

Para desplegar la aplicación completa, consulta las instrucciones detalladas en [DEPLOYMENT.md](DEPLOYMENT.md).
