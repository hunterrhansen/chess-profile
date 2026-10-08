# Oracle Cloud: the machine

[OpenTofu](https://opentofu.org) (Terraform's open-source fork; `terraform` works on these
files too) makes Knightly's server in Oracle Cloud, and keeps it as described:

- a `knightly` compartment, network and public subnet whose only way in is SSH (22)
- one Always Free ARM VM: Ubuntu 24.04, 4 OCPUs, 24 GB, a 100 GB disk, your SSH key

What runs on the machine is [`deploy/bootstrap.sh`](../../deploy/bootstrap.sh)'s job
([docs/deploy.md](../../docs/deploy.md) §2). The variables stop at Always Free's limits.

## Use

```bash
brew install opentofu oci-cli
oci session authenticate --region us-phoenix-1 --profile-name knightly   # a browser sign-in, 1 hour
cd infra/oracle
tofu init -backend-config=path=$HOME/.knightly/oracle.tfstate
export TF_VAR_tenancy_ocid=$(sed -n '/^\[knightly\]/,/^\[/s/^tenancy=//p' ~/.oci/config)
tofu plan
./apply.sh          # tofu apply, across availability domains while ARM capacity is short
```

`oci session refresh --profile knightly` extends a session past its hour.

- **Out of capacity** is common for Always Free ARM: `apply.sh` tries all three availability
  domains for 20 minutes. Upgrading the account to Pay As You Go (Always Free stays free) makes
  capacity much easier to get.
- **State** is a local file, `~/.knightly/oracle.tfstate`, outside the repo: ids and the
  public IP, nothing secret. Lost? `tofu import` the resources back, or rebuild: the machine
  holds nothing that isn't elsewhere.
- **New Ubuntu images** don't replace the machine (it updates itself); `tofu apply
  -replace=oci_core_instance.knightly` rebuilds it on purpose. Then rerun the bootstrap and
  update DEPLOY_HOST.
