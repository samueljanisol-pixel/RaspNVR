# Central RaspNVR sur Vercel

Serveur central sans Raspberry Pi : gestion multi-magasins, live distant via tunnel, relecture des enregistrements.

## Prérequis

- Compte [Vercel](https://vercel.com)
- Projet [Supabase](https://supabase.com) (Postgres + Storage)
- (Optionnel) Cloudflare Zero Trust pour tunnel + Access

## Déploiement Vercel

1. Créez un projet Supabase et exécutez la migration [`supabase/migrations/001_raspnvr.sql`](../supabase/migrations/001_raspnvr.sql)
2. Créez un bucket Storage `raspnvr-recordings` (privé)
3. Déployez le dossier `central/` sur Vercel
4. Variables d'environnement (voir [`central/.env.example`](../central/.env.example)) :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RASPNVR_ADMIN_KEY`
   - `RASPNVR_STORAGE_BUCKET`
   - `CRON_SECRET` (cron offline-check)
   - `CF_ACCESS_AUD` (optionnel, Phase sécurité)

```bash
cd central
npm install
npm run dev    # http://localhost:3000
```

## API agent (Pi edge → central)

| Route | Description |
|-------|-------------|
| `POST /api/raspnvr/agent/register` | Token magasin → api_key |
| `POST /api/raspnvr/agent/heartbeat` | Statut Pi + caméras |
| `GET /api/raspnvr/agent/commands` | Commandes pending |
| `POST /api/raspnvr/agent/commands/:id/ack` | Accusé |
| `POST /api/raspnvr/agent/tunnel` | URL tunnel Cloudflare |
| `POST /api/raspnvr/agent/recordings` | Préparer upload segment |

Auth agent : `Authorization: Bearer {api_key}`

## Admin

- UI : `/login` puis `/dashboard`
- API : `Authorization: Bearer {RASPNVR_ADMIN_KEY}`

## Pi edge — enregistrement

1. Admin central → générer token pour le magasin
2. Sur le Pi : **Paramètres** → URL centrale + code magasin + token  
   Ou CLI :
   ```bash
   python -m src.agent.register --store-code mag01 --token XXX --url https://votre-central.vercel.app
   ```
3. Variables `/opt/raspnvr/data/raspnvr.env` :
   ```
   RASPNVR_CENTRAL_URL=https://votre-central.vercel.app
   RASPNVR_CENTRAL_MOCK=false
   RASPNVR_STORAGE_UPLOAD_ENABLED=true
   ```

## Cloudflare Tunnel (live distant)

1. Créez un tunnel Zero Trust pointant vers `http://127.0.0.1:8080`
2. `/opt/raspnvr/data/cloudflared.env` :
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```
3. `/opt/raspnvr/data/tunnel_url` (une ligne) :
   ```
   https://mag01.votredomaine.fr
   ```
4. `sudo systemctl enable --now cloudflared`

Le dashboard central charge le HLS **directement** depuis l'URL tunnel (pas via Vercel).

## Sécurité (Cloudflare Access)

1. Protégez l'URL tunnel avec une application Access
2. Définissez `CF_ACCESS_AUD` sur Vercel
3. Les requêtes admin exigent le JWT Cloudflare + clé admin

## Mock local (dev sans Vercel)

Sur le Pi ou en local :

```
RASPNVR_CENTRAL_MOCK=true
```

- API agent + admin : même port que l'edge (`8080`)
- Admin mock : http://localhost:8080/admin
- Clé admin mock : `dev-admin-key` (`RASPNVR_ADMIN_KEY`)

## Flux

```
[Admin Vercel] → Supabase ← [Agent Pi edge]
                              ↓ tunnel HTTPS
                         [Live HLS / API locale]
                              ↓ upload
                         [Supabase Storage]
```
