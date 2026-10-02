export const buildPhotoFilename = (
  whenIso: string,
  lat?: number,
  lon?: number,
) => {
  const d = new Date(whenIso)
  const pad = (v: number) => String(v).padStart(2, '0')
  const base = `GeoTagCamera_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `${base}_${lat!.toFixed(6)}_${lon!.toFixed(6)}.jpg`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
  }

  return `${base}.jpg`
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
