import { apiJson } from './client'

// Content-addressed asset store (orchestrator/src/orchestrator/assets/), kept
// distinct from the generation-history blob store so history GC can never
// touch a project-referenced asset. Raw-body upload, not multipart: the
// server reads Content-Type + the body directly (no client dependency needed).
export function uploadAsset(file: File | Blob): Promise<{ digest: string }> {
  const contentType = file.type || 'application/octet-stream'
  return apiJson('/api/assets', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: file,
  })
}

export function assetUrl(digest: string): string {
  return `/api/assets/${digest}`
}
