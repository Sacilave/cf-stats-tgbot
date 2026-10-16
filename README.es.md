# CF-Stats-TGBot ⚡ (Documentación en Español)

<p align="center">
  <strong>Telemetría Serverless Multisitio y Consola Telegram Bajo Demanda</strong>
</p>

<p align="center">
  <a href="#prompt-de-instalación-rápida">Instalación Rápida</a> •
  <a href="#arquitectura">Arquitectura</a> •
  <a href="#defensa-antigas-y-seguridad">Seguridad</a> •
  <a href="#comandos-de-telegram">Comandos</a> •
  <a href="./README.md">English</a>
</p>

---

## ⚡ Prompt de Instalación Rápida (Un Solo Clic)

Copia y pega este prompt directamente en tu asistente de IA (Antigravity / Claude / Cursor) dentro de tu proyecto objetivo:

```markdown
Por favor, utiliza la habilidad `cf-stats-tgbot` para integrar la telemetría serverless y la consola de reportes de Telegram en este proyecto:

1. Lee la configuración global desde `D:\TECH\_Projects\_Skills\cf-stats-tgbot\config.json`.
2. Inspecciona el dominio del proyecto, determina el nombre de la tabla (`stats_<site_slug>`) y ejecuta la creación remota de la tabla en Cloudflare D1.
3. Copia `functions/_shared/telemetry/`, `functions/api/vitals.ts` y `src/utils/telemetry.ts` desde las plantillas.
4. Actualiza `wrangler.toml` con el enlace a la base de datos D1 y las variables de entorno necesarias.
5. Identifica las acciones clave de conversión (análisis/cálculo -> descarga/exportación) e implementa `trackParse` y `trackDownload`.
6. Verifica con `npm run build` para asegurar cero errores de compilación.
```

---

## 🏗️ Arquitectura y Principios

1. **Base de Datos D1 Unificada**: Todos los sitios comparten la misma base de datos D1 (`stats`) para mantenerse dentro del límite gratuito de 10 bases de datos de Cloudflare.
2. **Aislamiento Físico por Tabla**: Cada sitio solo escribe en su propia tabla (`stats_<site_slug>`). Cero bloqueos de escritura entre sitios e indexación independiente.
3. **Consola Centralizada de Webhook**: El sitio maestro aloja el enrutador del Webhook de Telegram. Los nuevos sitios se incluyen automáticamente en `/today` sin tocar el código maestro.
4. **Recopilación Invisible (Stealth)**: El cliente envía eventos a `/api/vitals` vía `navigator.sendBeacon`. Devuelve `204 No Content` de inmediato sin bloquear hilos. Las IPs se extraen en el servidor mediante `CF-Connecting-IP`.

---

## 🛡️ Defensa Antigasto y Seguridad (Zero-Overcharge Defense)

1. **Eliminación Total de Cron Automáticos**:
   - Sin tareas programadas ni llamadas periódicas de curl externas.
   - Elimina bucles de reintento descontrolados que puedan agotar las cuotas de Workers y generar facturas inesperadas.
2. **100% Pasivo y Bajo Demanda**:
   - Los Workers y D1 consumen recursos **únicamente** cuando el administrador autorizado envía un comando interactivo en Telegram.
3. **Respuesta Rápida No Bloqueante (`context.waitUntil`)**:
   - El Webhook responde HTTP `200` a Telegram en `<50ms` y ejecuta las consultas SQL en segundo plano.
   - Evita tormentas de reintentos por superar el tiempo límite de 5 segundos de Telegram.
4. **Doble Barrera de Autenticación**:
   - Valida la cabecera `X-Telegram-Bot-Api-Secret-Token`.
   - Restringe la ejecución estrictamente al `admin_chat_id` numérico autorizado. Mensajes de extraños son descartados silenciosamente.
5. **Debounce en Memoria**:
   - Ventana de enfriamiento de 5 segundos por comando para evitar gastos duplicados de cuota por doble clic accidental.

---

## 📱 Comandos de Telegram

| Comando | Ámbito | Contenido del Reporte |
| :--- | :--- | :--- |
| **`/today`** o **`/all`** | 🌐 Matriz Completa | Resumen global acumulado de 7 días de todos los sitios registrados en D1 con desglose individual. |
| **`/<site_slug>`** (ej. `/pinteresthd`) | 📌 Auditoría por Sitio | Comparativa de conversión: Hoy (24h) / Últimos 7 Días / Últimos 30 Días + Formatos + Top 15 IPs. |
| **`/help`** o **`/menu`** | 📖 Ayuda | Guía interactiva que detecta y lista dinámicamente las tablas de sitios activos en D1. |

---

## 📄 Licencia

Licencia MIT © 2026 Sacilave. Diseñado para aplicaciones web serverless modernas.
