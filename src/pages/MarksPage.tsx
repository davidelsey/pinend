import { useMemo, useState } from 'react'
import { Compass, Crosshair, MapPin, Plus, Radio, Ruler, ShieldCheck } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { MapPointPicker } from '../components/MapPointPicker'
import { bearingToTrue, resolveMarkPosition } from '../domain/geo'
import type { BearingReference, Mark } from '../domain/types'

export function MarksPage() {
  const { marks, race, saveMark } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<Mark['position']['kind']>('fixed')
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState(-33.86)
  const [longitude, setLongitude] = useState(151.24)
  const [distance, setDistance] = useState(1)
  const [bearing, setBearing] = useState(0)
  const [reference, setReference] = useState<BearingReference>('true')
  const [declination, setDeclination] = useState(12.8)

  const resolvedCount = useMemo(() => marks.filter((mark) => resolveMarkPosition(mark.position)).length, [marks])

  const addMark = async () => {
    if (!name.trim()) return
    const base = { id: crypto.randomUUID(), name, shortName: name.slice(0, 7).toUpperCase(), provenance: 'personal' as const }
    const position: Mark['position'] = kind === 'fixed'
      ? { kind: 'fixed', coordinate: { latitude, longitude } }
      : kind === 'variable'
        ? { kind: 'variable' }
        : { kind: 'constructed', origin: { latitude, longitude }, distanceNm: distance, bearing: { degrees: bearing, reference, declination: reference === 'magnetic' ? declination : undefined } }
    await saveMark({ ...base, position })
    setName('')
    setShowForm(false)
  }

  return (
    <div className="page standard-page">
      <section className="page-title page-title--row">
        <div><span className="eyebrow"><MapPin size={14} /> Mark library</span><h1>Sydney Harbour marks</h1><p>{resolvedCount} resolved · {marks.length - resolvedCount} awaiting a position</p></div>
        <button className="button button--primary" onClick={() => setShowForm(true)}><Plus size={17} /> Add mark</button>
      </section>
      <div className="marks-layout">
        <CoursePlot marks={marks} race={{ ...race, course: marks.map((mark) => ({ id: mark.id, markId: mark.id, rounding: 'either' })) }} />
        <div className="mark-list">
          {marks.map((mark) => {
            const coordinate = resolveMarkPosition(mark.position)
            const constructed = mark.position.kind === 'constructed' ? mark.position : null
            const trueBearing = constructed ? bearingToTrue(constructed.bearing) : null
            return (
              <article className="mark-card" key={mark.id}>
                <div className={`mark-card__icon mark-card__icon--${mark.position.kind}`}>
                  {mark.position.kind === 'fixed' ? <MapPin size={20} /> : mark.position.kind === 'variable' ? <Radio size={20} /> : <Compass size={20} />}
                </div>
                <div className="mark-card__main"><strong>{mark.name}</strong><span>{mark.position.kind} mark</span><small>{coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : 'Position required for this race'}</small></div>
                {trueBearing != null && constructed && <div className="mark-card__bearing"><strong>{trueBearing.toFixed(1)}° T</strong><small>{constructed.bearing.degrees}° {constructed.bearing.reference === 'magnetic' ? 'M' : 'T'} · {constructed.distanceNm} NM</small></div>}
                <span className="chip"><ShieldCheck size={12} /> {mark.provenance}</span>
              </article>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="form-modal">
            <div className="panel__heading"><div><Crosshair size={18} /><h2>Add a mark</h2></div><button className="text-button" onClick={() => setShowForm(false)}>Cancel</button></div>
            <label className="field"><span>Name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="segment-control">
              {(['fixed', 'variable', 'constructed'] as const).map((option) => <button className={kind === option ? 'active' : ''} key={option} onClick={() => setKind(option)}>{option}</button>)}
            </div>
            {kind !== 'variable' && <><MapPointPicker value={{ latitude, longitude }} onChange={(coordinate) => { setLatitude(coordinate.latitude); setLongitude(coordinate.longitude) }} /><div className="form-grid"><label className="field"><span>{kind === 'fixed' ? 'Latitude' : 'Origin latitude'}</span><input type="number" step="0.00001" value={latitude} onChange={(e) => setLatitude(Number(e.target.value))} /></label><label className="field"><span>{kind === 'fixed' ? 'Longitude' : 'Origin longitude'}</span><input type="number" step="0.00001" value={longitude} onChange={(e) => setLongitude(Number(e.target.value))} /></label></div></>}
            {kind === 'constructed' && <><div className="form-grid"><label className="field"><span>Distance (NM)</span><input type="number" step="0.1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label><label className="field"><span>Bearing</span><input type="number" value={bearing} onChange={(e) => setBearing(Number(e.target.value))} /></label></div><div className="segment-control"><button className={reference === 'true' ? 'active' : ''} onClick={() => setReference('true')}>True</button><button className={reference === 'magnetic' ? 'active' : ''} onClick={() => setReference('magnetic')}>Magnetic</button></div>{reference === 'magnetic' && <label className="field"><span>Magnetic declination (east positive)</span><input type="number" step="0.1" value={declination} onChange={(e) => setDeclination(Number(e.target.value))} /></label>}<p className="microcopy"><Ruler size={13} /> The original bearing and declination are retained with the calculated true bearing.</p></>}
            <button className="button button--primary button--wide" onClick={() => void addMark()}><Plus size={16} /> Add mark</button>
          </div>
        </div>
      )}
    </div>
  )
}
