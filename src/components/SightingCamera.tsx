import { useEffect, useRef, useState } from 'react'
import { Camera, Crosshair, LocateFixed, RotateCcw, ShieldAlert, X } from 'lucide-react'
import type { LineObservation, SensorReading } from '../domain/types'

type Endpoint = LineObservation['endpoint']

type Props = {
  endpoint: Endpoint
  label?: string
  reading: SensorReading | null
  simulated: boolean
  onCapture(): void | Promise<void>
  onClose(): void
}

export function SightingCamera({ endpoint, label, reading, simulated, onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'blocked'>(simulated ? 'ready' : 'starting')
  const [portrait, setPortrait] = useState(window.innerHeight >= window.innerWidth)

  const startCamera = async () => {
    if (simulated) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('blocked')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (video.current) {
        video.current.srcObject = stream.current
        await video.current.play()
      }
      setCameraState('ready')
    } catch {
      setCameraState('blocked')
    }
  }

  useEffect(() => {
    void startCamera()
    const onResize = () => setPortrait(window.innerHeight >= window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      stream.current?.getTracks().forEach((track) => track.stop())
    }
    // Camera starts once when this user-opened viewfinder mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endpointLabel = label ?? (endpoint === 'pin' ? 'pin' : endpoint === 'committee' ? 'committee boat' : 'movable mark')
  const canCapture = cameraState === 'ready' && Boolean(reading)

  return (
    <div className="viewfinder" role="dialog" aria-modal="true" aria-label={`Sight the ${endpointLabel}`}>
      <video ref={video} className="viewfinder__video" muted playsInline />
      {simulated && <div className="viewfinder__simulated"><span>SIMULATED CAMERA</span></div>}
      <div className="viewfinder__shade" />
      <header className="viewfinder__header">
        <button className="viewfinder__close" onClick={onClose} aria-label="Close camera"><X size={22} /></button>
        <div><span>SIGHTING</span><strong>{endpointLabel}</strong></div>
        <span className={`viewfinder__camera-state viewfinder__camera-state--${cameraState}`}><Camera size={15} /> {cameraState}</span>
      </header>

      <div className="viewfinder__instruction">
        {!portrait && <div className="orientation-warning"><RotateCcw size={16} /> Hold the phone vertically</div>}
        <p>Align the crosshair precisely with the {endpointLabel}.</p>
      </div>

      <div className="viewfinder__crosshair" data-testid="viewfinder-crosshair">
        <span className="viewfinder__line viewfinder__line--horizontal" />
        <span className="viewfinder__line viewfinder__line--vertical" />
        <Crosshair size={58} strokeWidth={1.1} />
        <i />
      </div>

      {cameraState === 'blocked' && (
        <div className="viewfinder__blocked">
          <ShieldAlert size={25} /><strong>Camera unavailable</strong>
          <p>Allow rear-camera access, then try again. No image is recorded or uploaded.</p>
          <button className="button button--secondary" onClick={() => { setCameraState('starting'); void startCamera() }}><Camera size={16} /> Retry camera</button>
        </div>
      )}

      <footer className="viewfinder__footer">
        <div className="viewfinder__reading">
          <span><strong>{reading ? `${Math.round(reading.heading).toString().padStart(3, '0')}° T` : '—° T'}</strong>True bearing</span>
          <span><strong>{reading ? `±${Math.round(reading.accuracy)} m` : '—'}</strong>GPS accuracy</span>
          <span><strong>{reading ? reading.source : 'waiting'}</strong>Sensor</span>
        </div>
        <button className="capture-button" disabled={!canCapture} onClick={() => void onCapture()} aria-label={`Capture ${endpointLabel} sighting`}>
          <span><LocateFixed size={25} /></span>
        </button>
        <p>No photo is saved—only position, bearing, accuracy, and time.</p>
      </footer>
    </div>
  )
}
