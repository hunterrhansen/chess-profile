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

The first deploy takes about an hour of clicking. Everything below is free, except the domain.

## Where we are

The first deploy, step by step. Tick a line off when it's done, so whoever picks this up next
(you or an AI session) starts at the first open box. Secrets are never written here. They're in
the owner's password manager, under "Knightly deploy".

- [x] **Domain:** `knightlychess.app`, bought through Cloudflare Registrar (2026-10-08).
      Production is at `knightlychess.app`, staging at `staging.knightlychess.app`.
- [x] **Supabase** (§3): the current dashboard lists `knightly-staging`
      (`mwkkgxrkhhvvagouvtmo`, us-east-2) and `knightly-prod`
      (`duvdkqvszkmljwwrhhfk`, us-west-2). Staging's Data API is off.
      Both reset passwords connect successfully over TLS. Both environments have five
      migrations; `knightly_app` isolation was verified against the restored production data.
- [x] **Oracle machine** (§2): made with OpenTofu (`infra/oracle`, PHX-AD-1), bootstrapped,
      and the `knightly` deploy user logs in with `~/.ssh/knightly-deploy`. The IP:
      `tofu output public_ip` in `infra/oracle`, with state in `~/.knightly/oracle.tfstate` on
      the owner's Mac.
- [x] **Cloudflare** (§5, §7): Zero Trust (Free) and R2 are on. OpenTofu (`infra/cloudflare`,
      state in `~/.knightly/cloudflare.tfstate`, its API token in the owner's Keychain as
      `knightly-cloudflare`) made the tunnels `knightly` and `knightly-staging`, their proxied
      DNS records, and the `knightly-backups` bucket (2026-10-08). `push-tokens.sh` put each
      tunnel's `TUNNEL_TOKEN` in its `.env`, and both tunnels connected healthy from the
      machine. Both environments serve the app.
- [x] **Backup key** (§7): an R2 token with *Object Read & Write* on `knightly-backups`
      only. Its Access Key ID (32 characters) and Secret Access Key (64) are in
      `/opt/knightly/backup.env`. The token value isn't used. Tested from the machine: upload,
      `rclone check`, delete. Ubuntu's rclone needs `RCLONE_S3_NO_HEAD` for R2, which
      backup.sh sets. The production backup service completed successfully, and `rclone check`
      verified the first dump in R2. The nightly timer is enabled and active.
- [x] **Clerk** (§4): set up a production instance for `knightlychess.app` (its DNS records go
      in Cloudflare). Add a `user.deleted` webhook on both instances, and allow users to delete
      their own accounts.
      Production instance created (2026-10-08), all five DNS CNAMEs are managed in
      `infra/cloudflare/clerk.tf` and verified by Clerk. Both deletion webhooks exist;
      production allows self-service deletion. Email and Google sign-in are enabled. Google
      OAuth uses the dedicated `knightly-chess-prod` project, a web client restricted to
      `https://knightlychess.app` and the Clerk callback, with its credentials saved in Clerk.
      The owner accepted Google's policy and approved credential creation and activation.
      Publishing status is In production; the live flow reaches Google's account chooser
      with the correct client ID. Owner completion of sign-in remains to be verified.
      Both webhook signing secrets are saved in the
      matching server env files. Both deployments accept signed no-op webhook requests and
      reject invalid signatures. Real account deletion remains an end-to-end acceptance test.
- [x] **Fill in `.env` on the machine** (§6, §7): `/opt/knightly/{staging,production}/.env`
      and `/opt/knightly/backup.env` are configured. The owner authorized direct secret transfer.
      Both allowed origins are set to their real domains. Staging's existing development
      Clerk publishable key and owner admin ID are set (2026-10-08), as is production's
      publishable key and both webhook signing secrets. The owner's contact email is saved.
      Both session-pooler URLs are saved with `sslmode=require`. The new database passwords
      are saved in the Mac login Keychain as `knightly-db-staging` and
      `knightly-db-production`. The temporary phone password page and its files were removed.
- [x] **GitHub** (§8), last, because setting `DEPLOY_HOST` starts deploying on every push to
      `main`. Set the `DEPLOY_SSH_KEY` secret, the `DEPLOY_HOST` variable, and the `staging` and
      `production` environments. Make the GHCR package public.
      The deploy key is saved, both environments exist, production requires the owner's
      review, and GHCR is public (2026-10-08). `DEPLOY_HOST` is set to the VM's IP.
- [x] **Staging:** push to `main`, then check `https://staging.knightlychess.app` and
      `/api/health`, and sign up with a test account.
      GitHub Actions run `37882431397` deployed `sha-0ba6ab5` successfully. The public health
      check passes, the worker runs, runtime config matches staging, protected routes return
      401 without sign-in, and the browser displays Clerk sign-in. A signed no-op webhook
      is accepted and an invalid signature rejected. The owner signed in and confirmed that
      Chess.com onboarding imports games successfully. A throwaway deletion test remains.
- [ ] **Production:** move the Mac data in (§3: migrate, then a data-only restore), deploy the
      staging tag (§9), and sign in as the owner. Run the backup by hand once (§7).
      GitHub Actions run `37883614272` deployed `sha-0ba6ab5` with the owner's approval.
      A fresh consistent snapshot was restored once; all 16 table counts matched, including
      687 games and one user. The import archive is
      `backups/production-import-2026-10-08-10c15118.dump`, with a matching JSON manifest.
      Health, runtime config and unauthenticated-route checks pass; web is healthy and the
      worker and tunnel run. The first backup, `knightly-2026-10-09.dump` (UTC filename),
      is verified in R2. Remaining: owner production sign-in, history linking and admin ID.
- [ ] **Done when** (architecture doc, Phases 4 and 5): a push to `main` reaches staging with
      no manual steps, and a friend can sign up, use Knightly and delete their account. Test
      the deletion in Safari with a throwaway account, since Clerk's captcha blocks automated
      browsers.

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

1. Make an Oracle Cloud account with **US West (Phoenix)** as its home region. The home
   region can't change later, and Always Free ARM machines only run there.
2. Make your own SSH key (`~/.ssh/id_ed25519`), if you don't have one, and a key for GitHub
   Actions to deploy with. The deploy key is used only for that:

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-actions -f ~/.ssh/knightly-deploy
   ```

3. Make the machine with OpenTofu ([`infra/oracle/README.md`](../infra/oracle/README.md)). It
   creates a `knightly` compartment, a network whose only way in is SSH (22), and the Always
   Free ARM VM (Ubuntu 24.04, 4 OCPUs, 24 GB, 100 GB). Its `apply.sh` retries across
   availability domains while Oracle is out of ARM capacity. Running it again changes nothing.
4. Run the bootstrap with the deploy key's **public** half:

   ```bash
   ssh ubuntu@$(cd infra/oracle && tofu output -raw public_ip) \
     "curl -fsSL https://raw.githubusercontent.com/hunterrhansen/knightly/main/deploy/bootstrap.sh | sudo DEPLOY_KEY='$(cat ~/.ssh/knightly-deploy.pub)' bash"
   ```

   The bootstrap is safe to run again. It sets up:
   - Docker, rclone, and automatic security updates (with a reboot at 04:00 when one needs it)
   - a `knightly` user that deploys log in as
   - `/opt/knightly/{staging,production}`, each with `compose.yml`, `.env` and `data/`
   - a nightly backup timer

## 3. The database (Supabase)

Do this once per environment.

1. Create the project. Pick the region nearest the VM (West US (North California) for
   Phoenix), and keep the database password.
2. Turn off **Project Settings › Data API**. Only the server talks to the database, and the
   Data API would expose tables that have no row-level security (`users`, `jobs`) to anyone with
   the project's anon key.
3. Go to **Connect › Session pooler** and copy that URI, with the password filled in. That's
   `KNIGHTLY_DATABASE_URL`. Use port **5432**, not the transaction pooler on 6543: each
   connection sets which user it acts for, and that has to stay with the connection. The
   direct connection (`db.<ref>.supabase.co`) is IPv6-only, and the Oracle VM's network is IPv4.
4. Nothing else is needed. The app creates its tables on its first start, as migrations. To
   check a new project from your Mac: `KNIGHTLY_DATABASE_URL=... uv run knightly migrate`,
   then `psql "$URL" -c "set role knightly_app"`.

To bring your existing Mac data into production, run this once, before anyone signs up. Run
the migrations first, so the tables, the `knightly_app` role and its grants exist. A dump can't
carry a role, and restoring with `--no-acl` drops the grants. Then restore your rows alone:

```bash
KNIGHTLY_DATABASE_URL="<production KNIGHTLY_DATABASE_URL>" uv run knightly migrate
pg_dump --format=custom --data-only --exclude-table=schema_migrations -d knightly -f knightly-data.dump
pg_restore --data-only --no-owner -d "<production KNIGHTLY_DATABASE_URL>" knightly-data.dump
```

Rehearsed on a local copy: every table matched, new ids carried on from the old ones, and
`knightly_app` could read the rows.

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

These are OpenTofu ([`infra/cloudflare/README.md`](../infra/cloudflare/README.md)): the
tunnels, their DNS records and the backup bucket, with `push-tokens.sh` to put each tunnel's
token on the machine. By hand in the dashboard, it's this:

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
