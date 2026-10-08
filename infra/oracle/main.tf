# The Oracle Cloud machine Knightly runs on (docs/deploy.md §2): one Always Free ARM VM in
# its own compartment and network, reachable only over SSH. What runs on it is
# deploy/bootstrap.sh's job; this file only makes the machine exist.
#
#   tofu init && tofu plan && tofu apply      (README.md here: signing in, capacity)

terraform {
  required_version = ">= 1.6"
  # Local state, kept out of the repo: `tofu init -backend-config=path=$HOME/.knightly/oracle.tfstate`
  # (README.md). It holds ids and the public IP, no secrets.
  backend "local" {}
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 7.0"
    }
  }
}

# A browser session (`oci session authenticate --profile-name knightly`): nothing long-lived
# on disk. Sessions last an hour; `oci session refresh --profile knightly` extends one.
provider "oci" {
  auth                = "SecurityToken"
  config_file_profile = var.oci_profile
  region              = var.region
}

resource "oci_identity_compartment" "knightly" {
  compartment_id = var.tenancy_ocid
  name           = "knightly"
  description    = "Knightly: the app server and its network"
  enable_delete  = true # `tofu destroy` removes it too
}

locals {
  compartment = oci_identity_compartment.knightly.id
}

# --- Network: a public subnet whose only way in is SSH ------------------------------------

resource "oci_core_vcn" "knightly" {
  compartment_id = local.compartment
  display_name   = "knightly-vcn"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "knightly"
}

resource "oci_core_internet_gateway" "knightly" {
  compartment_id = local.compartment
  vcn_id         = oci_core_vcn.knightly.id
  display_name   = "knightly-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = local.compartment
  vcn_id         = oci_core_vcn.knightly.id
  display_name   = "knightly-public"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.knightly.id
  }
}

# The web app needs no open port: Cloudflare Tunnel connects out from the machine. SSH stays
# open to everyone because GitHub's runners deploy from changing addresses; keys only.
resource "oci_core_security_list" "public" {
  compartment_id = local.compartment
  vcn_id         = oci_core_vcn.knightly.id
  display_name   = "knightly-ssh-only"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    description = "SSH"
    source      = "0.0.0.0/0"
    protocol    = "6" # TCP
    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    description = "Path MTU discovery"
    source      = "0.0.0.0/0"
    protocol    = "1" # ICMP
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = local.compartment
  vcn_id                     = oci_core_vcn.knightly.id
  display_name               = "knightly-public"
  cidr_block                 = "10.0.0.0/24"
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.public.id]
  prohibit_public_ip_on_vnic = false
}

# --- The machine ---------------------------------------------------------------------------

data "oci_identity_availability_domains" "all" {
  compartment_id = var.tenancy_ocid
}

# The newest Ubuntu 24.04 for ARM, when the machine is first made. Later releases don't
# replace it (lifecycle below): the machine updates itself, and a rebuild is deliberate.
data "oci_core_images" "ubuntu" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "knightly" {
  compartment_id      = local.compartment
  display_name        = "knightly"
  availability_domain = data.oci_identity_availability_domains.all.availability_domains[var.availability_domain - 1].name
  shape               = var.shape

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.disk_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    hostname_label   = "knightly"
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key))
  }

  lifecycle {
    ignore_changes = [source_details[0].source_id, availability_domain]
  }
}
