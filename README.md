# PIETRA Fray Rossi · App del equipo

App web para el celular: cada empleado entra con su nombre y un PIN, ve sus tareas del día, revisa cómo recibe su sector, carga stock y manda avisos. Pato ve el panel del día y el stock de la mañana con el pedido sugerido.

**Stack:** React + Vite + TypeScript · Supabase (login, base de datos, fotos) · Vercel · GitHub.

## Qué incluye la etapa 1

| Persona | Pestañas |
| --- | --- |
| Todos | **Hoy** (checklist del día con cantidades; los martes suma la limpieza profunda), **Al llegar** (cómo recibe su sector: bien / quedó algo con foto), **Stock** (su lista: pesar, contar o hay / poco / no), **Avisos** |
| Gamaliel | **Producción** |
| Pablo | **Recepción** de mercadería |
| Yimi | **Cierre**: pizzas y empanadas vendidas, fugazzetas desarmadas (no tiene "Al llegar") |
| Pato | **Panel del día** (avance por persona, fotos, revisiones, avisos, producción, recepción, cierre) y **Stock y pedido** (conteo de Ludmila y pedido sugerido los martes, jueves y sábados, listo para copiar a WhatsApp) |

Cada empleado ve solo lo suyo: la seguridad está en la base (Row Level Security), no solo en la app.

La **fecha operativa** cambia a las 5:00, así el cierre de la noche cuenta para el día del servicio.

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Crear un proyecto nuevo en supabase.com (región São Paulo).
2. **SQL Editor** → pegar y correr `supabase/migrations/001_esquema.sql`.
3. **SQL Editor** → pegar y correr `supabase/migrations/002_carga_inicial.sql` (personas, tareas, sectores, 82 productos con objetivos por envío y cantidades del día).
4. **Authentication → Sign In / Providers → Email**:
   - desactivar **Confirm email**;
   - desactivar **Allow new users to sign up** (los usuarios los crea solo el script).
5. **Project Settings → API**: copiar `Project URL`, `anon public key` y `service_role key`.

### 2. Usuarios con PIN

En la carpeta del proyecto, en tu compu:

```bash
cp .env.example .env.local          # completar URL, anon key y service role key
cp scripts/pines.ejemplo.json scripts/pines.json   # poner el PIN de cada uno (4 números)
node --env-file=.env.local scripts/crear-usuarios.mjs
```

Para cambiar un PIN, se edita `pines.json` y se vuelve a correr. `pines.json` y `.env.local` no se suben a GitHub.

### 3. GitHub y Vercel

1. Subir esta carpeta al repositorio.
2. En Vercel: **Add New → Project** → elegir el repo. Framework: Vite (lo detecta solo).
3. **Environment Variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la service role key **no** va en Vercel).
4. Deploy. Cada cambio que se sube a GitHub se publica solo.

### 4. En el celular de cada uno

Abrir el link de Vercel → **Agregar a pantalla de inicio** (Android: menú ⋮; iPhone: compartir → "Agregar a inicio"). Queda con el ícono de PIETRA.

## Cómo se cambia la configuración (sin tocar código)

Por ahora desde Supabase → **Table Editor** (en la etapa 2 va a haber pantallas para esto):

| Quiero cambiar… | Tabla |
| --- | --- |
| Una tarea, su texto, días o si pide foto | `tareas` (`dias`: 0 = domingo … 6 = sábado; `frecuencia`: diaria, semanal o mensual) |
| Qué sectores revisa cada uno al llegar | `sectores` |
| Productos, proveedores y objetivos de cada envío | `productos` (`obj_martes`, `obj_jueves`, `obj_sabado`) |
| Qué cuenta cada uno y cómo | `conteo_listas` (`momento`: apertura, inicio, cierre · `modo`: pesa, cuenta, estado) |
| Kilos de morrón, prepizzas, panadería a sacar | `cantidades_dia` (las de panadería de Pablo están en blanco: completar) |
| Dar de baja a alguien | `personas.activo = false` |

## Desarrollo local

```bash
npm install
npm run dev
```

## Lo que viene

- **Etapa 2:** pedido guardado y recepción contra el pedido, pantallas de configuración para Pato.
- **Etapa 3:** importar el Excel de Fudo, liquidación de premios y tablero de cruces (consumo real contra receta, control de fuga).
