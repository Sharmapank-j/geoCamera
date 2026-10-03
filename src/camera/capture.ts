export const captureVideoFrame = async (video: HTMLVideoElement, zoom = 1): Promise<Blob> => {
  const width = video.videoWidth
  const height = video.videoHeight

  if (!width || !height) {
    throw new Error('Camera frame unavailable')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  if (zoom > 1) {
    const cropWidth = width / zoom
    const cropHeight = height / zoom
    const cropX = (width - cropWidth) / 2
    const cropY = (height - cropHeight) / 2
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height)
  } else {
    ctx.drawImage(video, 0, 0, width, height)
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Capture failed'))
        return
      }
      resolve(blob)
    }, 'image/jpeg', 0.95)
  })
}

export const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop())
}
