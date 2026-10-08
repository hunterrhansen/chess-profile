variable "tenancy_ocid" {
  description = "Your Oracle Cloud tenancy (the `tenancy=` line of ~/.oci/config)."
  type        = string
}

variable "oci_profile" {
  description = "The ~/.oci/config profile of a browser session (oci session authenticate)."
  type        = string
  default     = "knightly"
}

variable "region" {
  description = "Your home region: Always Free ARM machines only run there."
  type        = string
  default     = "us-phoenix-1"
}

variable "availability_domain" {
  description = "1, 2 or 3. When one is out of ARM capacity, try another (README.md)."
  type        = number
  default     = 1
  validation {
    condition     = contains([1, 2, 3], var.availability_domain)
    error_message = "availability_domain is 1, 2 or 3."
  }
}

# Always Free: 4 OCPUs, 24 GB of memory and 200 GB of disk in all. Past that is billed.
variable "shape" {
  type    = string
  default = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  type    = number
  default = 4
  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 4
    error_message = "Always Free allows up to 4 ARM OCPUs."
  }
}

variable "memory_gb" {
  type    = number
  default = 24
  validation {
    condition     = var.memory_gb >= 1 && var.memory_gb <= 24
    error_message = "Always Free allows up to 24 GB on ARM."
  }
}

variable "disk_gb" {
  type    = number
  default = 100
  validation {
    condition     = var.disk_gb >= 50 && var.disk_gb <= 200
    error_message = "Boot volumes start at 50 GB; Always Free covers 200 GB in all."
  }
}

variable "ssh_public_key" {
  description = "Your own login key (the machine's `ubuntu` user). The deploy key is added by bootstrap.sh."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
