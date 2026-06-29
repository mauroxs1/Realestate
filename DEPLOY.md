# Deploy — Lorenzo Propiedades

## Stack
- Node.js + TypeScript (Vercel Serverless, maxDuration: 60s)
- Claude Sonnet 4.6 (Anthropic)
- Groq Whisper (transcripción audio, gratis)
- Upstash Redis (historial + visitas)
- Meta WhatsApp Cloud API
- Google Sheets (leads, visitas, catálogo propiedades)

---

## 1. Google Sheets

El catálogo de propiedades se carga **automáticamente desde Inmoup** (no requiere configuración manual).
Las propiedades que publicás en tu cuenta de Inmoup (usuario ID: 254044) aparecen solas en el bot.

Google Sheets solo se usa para el **CRM de leads y visitas**:

1. Crear un nuevo Google Sheets.
2. Ir a **Extensiones → Apps Script**.
3. Pegar el contenido de `google-apps-script.js`.
4. Guardar y desplegar: **Implementar → Nueva implementación → App web**
   - Ejecutar como: **Yo**
   - Acceso: **Cualquiera**
5. Copiar la URL del Web App → `SHEETS_WEBHOOK_URL` en el `.env`.
6. Las hojas **"Leads"** y **"Visitas"** se crean solas cuando llegue el primer registro.

---

## 2. Upstash Redis

1. Ir a https://upstash.com → crear cuenta gratuita.
2. Crear database → **Redis** → región más cercana.
3. Copiar `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

---

## 3. Groq (transcripción audio)

1. Ir a https://console.groq.com → crear cuenta.
2. API Keys → crear nueva → copiar como `GROQ_API_KEY`.

---

## 4. Anthropic

1. Ir a https://console.anthropic.com → API Keys → crear una.
2. Copiar como `ANTHROPIC_API_KEY`.
3. Cargar créditos en **Billing** (recomendado: $5 USD para empezar).

---

## 5. Meta WhatsApp Cloud API

1. Ir a https://developers.facebook.com → crear app → **Business**.
2. Agregar producto: **WhatsApp**.
3. En "Primeros pasos":
   - Anotar **Phone Number ID** → `PHONE_NUMBER_ID`
   - Anotar **WhatsApp Business Account ID** → `WABA_ID`
4. Crear **System User** con rol Admin en el WABA:
   - Business Settings → System Users → Agregar → asignar activo WhatsApp → generar token permanente.
   - Copiar como `META_ACCESS_TOKEN`.
5. El webhook se configura después de hacer el deploy en Vercel.

---

## 6. Vercel

```bash
cd /ruta/al/proyecto
npm install
npx vercel login
npx vercel --prod
```

Luego en el Dashboard de Vercel → **Environment Variables**, agregar todas las del `.env.example` con sus valores reales.

---

## 7. Configurar Webhook en Meta

1. En Meta for Developers → tu app → WhatsApp → Configuración.
2. **Webhook URL**: `https://tu-proyecto.vercel.app/api/webhook`
3. **Verify Token**: el valor que pusiste en `WEBHOOK_VERIFY_TOKEN`
4. Verificar → suscribir a `messages`.

---

## Variables de entorno requeridas

```
META_ACCESS_TOKEN
PHONE_NUMBER_ID
WABA_ID
WEBHOOK_VERIFY_TOKEN
ANTHROPIC_API_KEY
ANTHROPIC_BUDGET_USD=5
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
GROQ_API_KEY
SHEETS_WEBHOOK_URL
AGENT_PHONE          # ej: 5492614001234 (sin +)
OWNER_PHONE          # ej: 5492612001234 (sin +)
WEBSITE_URL          # ej: https://lorenzopropiedades.com.ar
CIUDAD               # ej: Mendoza
```

---

## Comandos del equipo (por WhatsApp a Lorenzo)

| Comando | Respuesta |
|---|---|
| `creditos` | Uso y saldo estimado de Anthropic |
| `historial 5492614XXXXXX` | Chat completo de ese contacto |

---

## Estructura de archivos

```
api/
  webhook.ts          ← Entry point Vercel
src/
  claude.ts           ← Llama a Claude, parsea actions
  systemPrompt.ts     ← Personalidad y reglas de Lorenzo
  whatsapp.ts         ← Enviar/recibir mensajes Meta API
  conversation.ts     ← Historial en Redis
  properties.ts       ← Catálogo desde Google Sheets
  visits.ts           ← Visitas agendadas en Redis
  sheets.ts           ← Leads y visitas en Google Sheets
  credits.ts          ← Tracking de tokens Anthropic
  transcribe.ts       ← Audio → texto con Groq
google-apps-script.js ← Pegar en Apps Script de Sheets
```
