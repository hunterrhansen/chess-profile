# Deploying Knightly

Knightly runs as two environments, **staging** and **production**, on one free Oracle Cloud
ARM machine. Each environment is three containers from [`deploy/compose.yml`](../deploy/compose.yml):

- **web**: the API and the built web app
- **worker**: syncing and analysis, capped at `WORKER_CPUS`
- **cloudflared**: a Cloudflare Tunnel, the only way in; the machine opens no ports

The data lives outside the machine:

- **Supabase** holds the database.
- **Clerk** holds the accounts.
- **Cloudflare R2** holds the nightly backups.

So the machine can be thrown away and rebuilt from this page at any time.

```
push to main ──► GitHub Actions: build arm64 image ──► ghcr.io/hunterrhansen/knightly:sha-abc1234
                                                   └─► ssh knightly@VM: staging pulls it, restarts
Actions › Deploy › Run workflow (production, sha-abc1234) ──► production pulls the same image
```

The first deploy takes about an hour of clicking. Everything below is free.

## 1. Accounts and values

Collect these first. The **Where it goes** column says which file or setting gets each one.

| What | Where to get it | Where it goes |
|---|---|---|
| Oracle Cloud account | cloud.oracle.com (needs a card; Always Free resources aren't charged) | — |
| A domain on Cloudflare | Cloudflare › Add a site (or buy one through Cloudflare Registrar) | — |
| Two Supabase projects: `knightly-staging`, `knightly` | supabase.com › New project | `KNIGHTLY_DATABASE_URL` in each `.env` |
| Clerk: development instance for staging, production instance for production | dashboard.clerk.com | `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET` |
| Two Cloudflare Tunnels | Cloudflare › Zero Trust › Networks › Tunnels | `TUNNEL_TOKEN` |
| An R2 bucket and API token | Cloudflare › R2 | `/opt/knightly/backup.env` |
| A deploy SSH key | `ssh-keygen` (below) | GitHub secret `DEPLOY_SSH_KEY`, plus the VM |
| Sentry (optional) | sentry.io › a Python project | `SENTRY_DSN` |
| Better Stack (optional) | betterstack.com › Uptime › Heartbeats | `KNIGHTLY_HEARTBEAT_URL` |

## 2. The machine

1. In Oracle Cloud, go to **Compute › Instances › Create instance**:
   - Image: **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** (Ampere ARM), 4 OCPUs and 24 GB, which is the whole Always Free allowance.
   - Add your own SSH public key for logging in yourself.
   - Leave the default security list alone: it opens only SSH (22). The app never needs an open port.
   - "Out of capacity" is common. Try another availability domain, or try again later. Upgrading the account to Pay As You Go makes capacity much easier to get, and Always Free resources are still free.
2. Make a key for GitHub Actions to deploy with. It is used only for that:

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-actions -f knightly-deploy
   ```

3. Log in (`ssh ubuntu@<public ip>`) and run the bootstrap, pasting in the **public** half
   (`cat knightly-deploy.pub` on your Mac):

   ```bash
   curl -fsSL https://raw.githubusercontent.com/hunterrhansen/knightly/main/deploy/bootstrap.sh \
     | sudo DEPLOY_KEY="ssh-ed25519 AAAA... github-actions" bash
   ```

   The bootstrap is safe to run again. It sets up:
   - Docker, rclone, and automatic security updates (with a reboot at 04:00 when one needs it)
   - a `knightly` user that deploys log in as
   - `/opt/knightly/{staging,production}`, each with `compose.yml`, `.env` and `data/`
   - a nightly backup timer

## 3. The database (Supabase)

Do this once per environment.

1. Create the project. Pick the region nearest the VM, and keep the database password.
2. Go to **Connect › Session pooler** and copy that URI, with the password filled in. That's
   `KNIGHTLY_DATABASE_URL`. Use port **5432**, not the transaction pooler on 6543: each
   connection sets which user it acts for, and that has to stay with the connection. The
   direct connection (`db.<ref>.supabase.co`) is IPv6-only, and the Oracle VM's network is IPv4.
3. Nothing else is needed. The app creates its tables on its first start, as migrations.

To bring your existing Mac data into production, run this once, before anyone signs up:

```bash
pg_dump --format=custom --no-owner --no-acl -d knightly -f knightly.dump      # on the Mac
pg_restore --no-owner --no-acl -d "<production KNIGHTLY_DATABASE_URL>" knightly.dump
```

Then sign in to production with the same Clerk account. If it's a different Clerk instance,
run `knightly users link <old clerk id> <new clerk id>` against production (see the README), so
your user row matches the new Clerk id.

## 4. Sign-in (Clerk)

- **Staging** can use the development instance you already have (`pk_test_…`).
- **Production** needs a production instance. In the Clerk dashboard, go to **Configure ›
  Production**, set your domain, and add the DNS records it lists in Cloudflare. Its key
  starts `pk_live_`.
- For each instance, go to **Webhooks › Add endpoint**:
  - Endpoint: `https://<that environment's host>/api/webhooks/clerk`
  - Event: `user.deleted`
  - Copy its **Signing secret** (`whsec_…`) into `CLERK_WEBHOOK_SECRET`.
- Set `KNIGHTLY_ALLOWED_ORIGINS` to the environment's address (`https://knightly.example.com`).

The web app reads the publishable key from the server (`/api/config`), so one image serves
both environments. Nothing about Clerk is baked into the build.

## 5. The tunnels (Cloudflare)

Do this once per environment.

1. Go to **Zero Trust › Networks › Tunnels › Create a tunnel**, choose **Cloudflared**, and name it
   `knightly-staging` or `knightly`.
2. Copy the token from the install command (the long string after `--token`) into `TUNNEL_TOKEN`.
   Skip the install itself: the `cloudflared` container is the connector.
3. Add a **Public hostname**:
   - Hostname: `staging.<domain>` for staging, or `<domain>` for production
   - Service: `HTTP`, URL: `web:8000`

Cloudflare makes the DNS record and the HTTPS certificate.

## 6. Fill in the `.env` files

On the VM:

```bash
sudo -u knightly nano /opt/knightly/staging/.env
sudo -u knightly nano /opt/knightly/production/.env
```

Each comment in [`deploy/env.example`](../deploy/env.example) says what goes there.
`KNIGHTLY_CONTACT` is your email: Chess.com asks API clients to identify themselves. Leave
`KNIGHTLY_IMAGE_TAG` out, because deploys set it.

## 7. Backups (Cloudflare R2)

1. Go to **R2 › Create bucket** and name it `knightly-backups`.
2. Go to **R2 › Manage API tokens › Create**, with **Object Read & Write** on that bucket only.
3. On the VM, run `sudo nano /opt/knightly/backup.env` and fill in:
   - the access key id
   - the secret
   - the endpoint (`https://<account id>.r2.cloudflarestorage.com`)

Every night at 03:30 the backup timer runs [`deploy/backup.sh`](../deploy/backup.sh):

- It writes a `pg_dump` of production into `production/data/backups/`, keeping 7 there.
- It copies the dump to the bucket, which keeps 30 days.

To test it now, and to check that `pg_dump` works through the pooler:

```bash
sudo systemctl start knightly-backup.service && journalctl -u knightly-backup -n 20
```

Supabase's free tier keeps no backups of its own that you can download. This bucket is what
you'd restore from.

## 8. GitHub

Under **Settings** in the repository:

- **Secrets and variables › Actions**:
  - variable `DEPLOY_HOST` = the VM's public IP
  - secret `DEPLOY_SSH_KEY` = the **private** half (`cat knightly-deploy`)
- **Environments**: create `staging` and `production`. On `production`, add yourself as a
  **Required reviewer**, so a production deploy waits for your click.

Then make the image public, so the VM can pull it without logging in. This is fine: the
image holds no secrets. After the first build, go to your GitHub profile, then **Packages ›
knightly › Package settings › Change visibility › Public**. Keeping it private also works,
but then the VM needs `docker login ghcr.io` with a read-only token, as the `knightly` user.

Until `DEPLOY_HOST` is set, the Deploy workflow builds and pushes the image and skips deploying.

## 9. Deploying

- **Staging** deploys itself on every push to `main`. In GitHub's Actions tab, **Deploy** builds
  `sha-<commit>` and restarts staging on it. The run fails if the new web container doesn't
  come up healthy within about 2½ minutes.
- **Production**: once staging looks right, go to **Actions › Deploy › Run workflow** and pick
  `production`, with the `sha-<commit>` tag from the staging run. Production gets the exact
  image staging ran, with nothing rebuilt.
- **Rolling back** is the same thing with an older tag.

Migrations run as the web container starts, under an advisory lock. Keep them additive: a
column that new code stops using is dropped in a later release, so the old image still works
during a rollback.

To check on things from the VM:

```bash
cd /opt/knightly/production
docker compose ps
docker compose logs -f --tail 100 worker
curl -s https://<domain>/api/health
```

## 10. Monitoring (optional)

- **Sentry**: errors from the web and the worker, tagged with the environment. Set `SENTRY_DSN`
  to the DSN of a Python project. Both environments can share one project.
- **Better Stack**: tells you if the worker stops.
  1. Create a **Heartbeat** with a 1-hour period and a 30-minute grace.
  2. Put its URL in production's `KNIGHTLY_HEARTBEAT_URL`. The worker pings it every time it
     checks the schedule.
  3. Add an **Uptime monitor** on `https://<domain>/api/health`, to watch the site itself.

## Restoring from a backup

```bash
rclone ls offsite:knightly-backups/production          # with backup.env loaded, or from the R2 dashboard
rclone copy offsite:knightly-backups/production/knightly-2026-10-08.dump .
pg_restore --clean --if-exists --no-owner -d "$KNIGHTLY_DATABASE_URL" knightly-2026-10-08.dump
```

To restore into a new Supabase project, skip `--clean`, then point `KNIGHTLY_DATABASE_URL` at it.

## Rebuilding the machine

1. Make a new VM (§2) and run the bootstrap with the same `DEPLOY_KEY`.
2. Copy the three env files over from your password manager, or from the old VM if it still runs.
3. Set `DEPLOY_HOST` to the new IP.
4. Re-run the last deploy of each environment.

The tunnels reconnect from the new machine by themselves, and no DNS changes.

Keep a copy of `staging/.env`, `production/.env` and `backup.env` somewhere safe. They are
the only things on the machine that aren't in this repository.
