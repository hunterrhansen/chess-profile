# Cloudflare: tunnels, hostnames, backups

[OpenTofu](https://opentofu.org) makes Knightly's Cloudflare side, and keeps it as described:

- two tunnels, `knightly` (production) and `knightly-staging`, each carrying its hostname to
  the web container (`http://web:8000`), and anything else to a 404
- their DNS records: `knightlychess.app` and `staging.knightlychess.app`, proxied
- the `knightly-backups` R2 bucket, in western North America

The machine is [`../oracle`](../oracle); what runs on it is [`deploy/`](../../deploy).

## Once: the API token

Cloudflare dashboard › My Profile › API Tokens › **Create Token** › *Create Custom Token*:

| Permission | |
|---|---|
| Account · Cloudflare Tunnel · Edit | the tunnels and their tokens |
| Account · Workers R2 Storage · Edit | the bucket |
| Zone · DNS · Edit | the two records |
| Zone · Zone · Read | finding the zone |

Account resources: your account. Zone resources: *Specific zone* › `knightlychess.app`. Then
keep it in your Mac's Keychain, not in a file (it asks for the token twice):

```bash
security add-generic-password -a "$USER" -s knightly-cloudflare -w
```

Zero Trust (the Free plan) and R2 must be switched on in the dashboard first.

## Use

```bash
cd infra/cloudflare
export CLOUDFLARE_API_TOKEN=$(security find-generic-password -s knightly-cloudflare -w)
export TF_VAR_account_id=<your account id>
tofu init -backend-config=path=$HOME/.knightly/cloudflare.tfstate
tofu plan
tofu apply
./push-tokens.sh      # each tunnel's token into its .env on the machine, unseen
```

- **State** (`~/.knightly/cloudflare.tfstate`, outside the repo) holds the tunnels' tokens:
  keep it `chmod 600`. Lost? `tofu import`, or make new tunnels and push their tokens again.
- **The backup key** is made by hand: R2 › Manage API tokens › Create API token, *Object Read
  & Write* on `knightly-backups` only. Its access key id, secret and the S3 endpoint go in
  `/opt/knightly/backup.env` on the machine (docs/deploy.md §7). A token that could make it
  here would need to be able to make any token.
