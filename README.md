# POS Grupo SAJI Bogotá SAS

Punto de venta para el negocio real **Grupo SAJI Bogotá SAS** (embalaje y desechables): sistema transaccional con control de inventario, roles, IVA colombiano y tirillas de 50 mm. **Desplegado en producción en Render.com.**

## Funcionalidades

- **Ventas transaccionales** — `BEGIN/COMMIT/ROLLBACK` con `SELECT … FOR UPDATE` para stock concurrente, validación de efectivo/cambio y tickets con numerador.
- **IVA 19 % incluido en precio** con desglose de base gravable según normativa colombiana.
- **Inventario** — CRUD de productos (solo admin) y resumen de existencias.
- **Roles** — admin/vendedor, gestión de usuarios con regla de "mínimo un admin", cambio de contraseña.
- **Historial de ventas** con filtros por fecha.
- **Zona horaria `America/Bogota` explícita** (`Intl.DateTimeFormat`) — sin sorpresas con la hora del servidor en la nube.
- **Tirilla/ticket 50 mm** con formato de impresora térmica.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express + `pg` (PostgreSQL externo con SSL) |
| Frontend | Vanilla JS (SPA en un solo `index.html`) |
| BD | PostgreSQL gestionado (Neon/Render) vía `DATABASE_URL` |
| Deploy | Render (`render.yaml`) · arranque local con `iniciar-pos.bat` |

## Ejecución

```bash
# Variables de entorno requeridas
# DATABASE_URL=postgres://...
# IVA_RATE=0.19
# TZ=America/Bogota

npm install
npm start
```

En Windows: doble clic a `iniciar-pos.bat`.

## Notas de seguridad

- Las credenciales de ejemplo (`admin123` / `vendedor123`) viven solo en los *seeds* de demo: **cámbialas en producción**.
- La autenticación usa headers de administrador sobre la API; el sistema está diseñado para red local/limitada, no para exposición pública directa.

## Contexto

Sistema construido y mantenido para un negocio real en operación (26+ productos con códigos de barras). Evolucionó por iteraciones semanales con feedback directo de los usuarios de caja — un pequeño ejemplo de desarrollo de producto end-to-end: requisitos, implementación, despliegue y soporte.

---
**Jonny Alejandro Monroy Chavez** · [GitHub](https://github.com/Jonny-Monroy) · [LinkedIn](https://linkedin.com/in/jonny-alejandro-monroy-chavez)
