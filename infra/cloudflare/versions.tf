terraform {
  required_version = ">= 1.6"
  backend "local" {}
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}
