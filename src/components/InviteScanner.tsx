import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export function InviteScanner({ onScan, onClose }: { onScan(value: string): void; onClose(): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onScan)
  callback.current = onScan
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    let timer: number | undefined
    const canvas = document.createElement('canvas')
    const scan = () => {
      if (stopped) return
      const frame = video.current
      if (frame?.readyState === 4) {
        canvas.width = Math.min(frame.videoWidth, 640)
        canvas.height = Math.round(frame.videoHeight * canvas.width / frame.videoWidth)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context && canvas.height) {
          context.drawImage(frame, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(pixels.data, canvas.width, canvas.height)
          if (code) { callback.current(code.data); return }
        }
      }
      timer = window.setTimeout(scan, 200)
    }
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); scan() }
      } catch { if (!stopped) setError('Camera unavailable. Allow camera access or enter the invitation code instead.') }
    })()
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [])
  return <section className="scanner" aria-label="Scan boat invitation"><video ref={video} muted playsInline /><p>Point your camera at the QR code on the owner or admin’s screen.</p>{error && <p role="alert">{error}</p>}<button className="button button--secondary" onClick={onClose}>Use code instead</button></section>
}
