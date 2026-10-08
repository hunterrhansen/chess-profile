export { cn } from "cn"

/** About this many megabytes, for sizes people read at a glance. */
export function megabytes(bytes: number) {
  const mb = bytes / 1024 / 1024
  return mb < 1 ? '<1 MB' : `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
