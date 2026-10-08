output "public_ip" {
  description = "The GitHub repository variable DEPLOY_HOST."
  value       = oci_core_instance.knightly.public_ip
}

output "ssh" {
  value = "ssh ubuntu@${oci_core_instance.knightly.public_ip}"
}

output "availability_domain" {
  value = oci_core_instance.knightly.availability_domain
}
