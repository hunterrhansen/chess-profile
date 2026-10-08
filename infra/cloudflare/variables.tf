variable "account_id" {
  description = "Your Cloudflare account id (dashboard: Account home › the account's menu › Copy account ID)."
  type        = string
}

variable "domain" {
  description = "Production's hostname; staging is staging.<domain>."
  type        = string
  default     = "knightlychess.app"
}
