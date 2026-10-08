output "hostnames" {
  value = local.environments
}

output "tunnel_ids" {
  value = { for env, t in cloudflare_zero_trust_tunnel_cloudflared.env : env => t.id }
}

# What cloudflared on the machine runs with (TUNNEL_TOKEN). Sensitive: push-tokens.sh sends
# each straight to its .env; `tofu output -json tunnel_tokens` would show them.
output "tunnel_tokens" {
  value     = { for env, t in data.cloudflare_zero_trust_tunnel_cloudflared_token.env : env => t.token }
  sensitive = true
}

output "backup_bucket" {
  value = cloudflare_r2_bucket.backups.name
}
