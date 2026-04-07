# 📺 ANUNCIOS.TV

> Comunidad que avisa cuando acaba la publicidad en la televisión española

**PWA instalable · Backend comunitario real · Notificaciones push · Tiempo real**

---

## ¿Qué hace?

- Cualquier usuario puede reportar que un canal está en publicidad
- Opcionalmente indica cuántos minutos dura
- Todos los demás ven en tiempo real qué canales están en publicidad
- Al terminar el tiempo (o manualmente), se lanza una notificación push + vibración
- Funciona como app instalable en el móvil (PWA)

---

## 🚀 Despliegue en 10 minutos

### 1. Fork o clona este repositorio

```bash
git clone https://github.com/TU_USUARIO/anuncios-tv.git
cd anuncios-tv
```

### 2. Crea el proyecto Supabase (gratis)

1. Ve a [supabase.com](https://supabase.com) → "New project"
2. Crea el proyecto (tarda ~1 min)
3. Ve a **SQL Editor** → "New query" y ejecuta todo el contenido de [`supabase/schema.sql`](supabase/schema.sql)
4. Ve a **Database → Replication** y activa `ad_reports` en Realtime
5. Ve a **Project Settings → API** y copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key → `eyJhbGci...`

### 3. Añade los secrets en GitHub

En tu repositorio GitHub:  
**Settings → Secrets and variables → Actions → New repository secret**

| Secret name     | Valor                        |
|-----------------|------------------------------|
| `SUPABASE_URL`  | `https://xxxx.supabase.co`   |
| `SUPABASE_ANON` | `eyJhbGci...` (anon key)     |

### 4. Activa GitHub Pages

**Settings → Pages → Source → GitHub Actions**

### 5. Haz push a `main`

```bash
git push origin main
```

El workflow de GitHub Actions construirá e instalará la app automáticamente.  
En ~2 minutos estará disponible en:

```
https://TU_USUARIO.github.io/anuncios-tv/
```

---

## 📱 Instalar como app en el móvil

### Android (Chrome)
1. Abre la URL en Chrome
2. Aparecerá un banner "Instalar Anuncios.TV"
3. O bien: menú ⋮ → "Añadir a pantalla de inicio"

### iOS (Safari)
1. Abre la URL en Safari
2. Botón compartir → "Añadir a inicio"

---

## 🔧 Desarrollo local

No hace falta build step. Basta con un servidor HTTP simple:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Instala "Live Server" y haz clic en "Go Live"
```

Para modo local sin Supabase, deja `src/config.js` con las variables vacías — la app usa `localStorage`.

---

## 🏗️ Estructura del proyecto

```
anuncios-tv/
├── index.html              # App principal (PWA)
├── sw.js                   # Service Worker (offline + caché)
├── manifest.json           # Manifiesto PWA
├── src/
│   ├── config.js           # ⚙️  Credenciales Supabase (editar)
│   ├── channels.js         # Lista de canales españoles
│   ├── db.js               # Capa de datos (Supabase + fallback local)
│   ├── app.js              # Lógica de la app
│   ├── sw-register.js      # Registro del Service Worker
│   └── style.css           # Estilos
├── supabase/
│   └── schema.sql          # SQL para crear la tabla en Supabase
├── icons/                  # Iconos PWA (generados en CI si no existen)
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions → GitHub Pages
```

---

## ➕ Añadir canales

Edita `src/channels.js`:

```js
window.CHANNELS = [
  { id: 'mi_canal', name: 'Mi Canal', color: '#FF0000', logo: 'MC' },
  // ...
];
```

---

## 🔒 Seguridad

- Las credenciales de Supabase **nunca** se almacenan en el repositorio
- Se inyectan en tiempo de build vía GitHub Secrets
- Supabase usa Row Level Security (RLS) — solo lectura/escritura de reportes activos
- La `anon key` es pública por diseño (solo accede a datos permitidos por RLS)

---

## 📄 Licencia

MIT — libre para uso personal y comercial.
