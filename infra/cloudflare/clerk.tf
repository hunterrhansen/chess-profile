# Clerk's production instance for knightlychess.app. These values come from its
# Domains page and are public DNS records, not credentials. Keep them DNS-only:
# Clerk terminates HTTPS and issues the authentication certificates itself.
locals {
  clerk_dns = {
    "clerk"           = "frontend-api.clerk.services"
    "accounts"        = "accounts.clerk.services"
    "clkmail"         = "mail.ic8gajyvwrjh.clerk.services"
    "clk._domainkey"  = "dkim1.ic8gajyvwrjh.clerk.services"
    "clk2._domainkey" = "dkim2.ic8gajyvwrjh.clerk.services"
  }
}

resource "cloudflare_dns_record" "clerk" {
  for_each = local.clerk_dns
  zone_id  = data.cloudflare_zone.site.zone_id
  name     = "${each.key}.${var.domain}"
  type     = "CNAME"
  content  = each.value
  proxied  = false
  ttl      = 1
  comment  = "Knightly production: Clerk (infra/cloudflare)"
}
