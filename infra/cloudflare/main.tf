# Knightly's front door on Cloudflare (docs/deploy.md §5, §7): one tunnel per environment,
# their hostnames on knightlychess.app, and the bucket nightly backups go to. The tunnels
# are the only way in: cloudflared on the Oracle machine connects out to Cloudflare, so the
# machine opens no ports.
#
#   tofu init && tofu plan && tofu apply      (README.md here: the API token, the tokens' trip
#                                              to the machine)

# A scoped API token (README.md), from the environment: CLOUDFLARE_API_TOKEN.
provider "cloudflare" {}

data "cloudflare_zone" "site" {
  filter = {
    name = var.domain
  }
}

locals {
  # environment => its public hostname
  environments = {
    production = var.domain
    staging    = "staging.${var.domain}"
  }
}

# Configured here, not in a file on the machine ("cloudflare"): the machine's cloudflared
# only needs the tunnel's token (TUNNEL_TOKEN in that environment's .env).
resource "cloudflare_zero_trust_tunnel_cloudflared" "env" {
  for_each   = local.environments
  account_id = var.account_id
  name       = each.key == "production" ? "knightly" : "knightly-${each.key}"
  config_src = "cloudflare"
}

# Each tunnel carries its hostname to the web container (deploy/compose.yml), and nothing else.
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "env" {
  for_each   = local.environments
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.env[each.key].id
  config = {
    ingress = [
      {
        hostname = each.value
        service  = "http://web:8000"
      },
      { service = "http_status:404" },
    ]
  }
}

resource "cloudflare_dns_record" "env" {
  for_each = local.environments
  zone_id  = data.cloudflare_zone.site.zone_id
  name     = each.value
  type     = "CNAME"
  content  = "${cloudflare_zero_trust_tunnel_cloudflared.env[each.key].id}.cfargotunnel.com"
  proxied  = true
  ttl      = 1 # automatic, as for every proxied record
  comment  = "Knightly ${each.key}: Cloudflare Tunnel (infra/cloudflare)"
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "env" {
  for_each   = local.environments
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.env[each.key].id
}

# Nightly backups (deploy/backup.sh). Its access key is made by hand (README.md): a token
# allowed to make tokens would be far more than this one needs.
resource "cloudflare_r2_bucket" "backups" {
  account_id = var.account_id
  name       = "knightly-backups"
  location   = "wnam" # western North America, beside the machine
}
