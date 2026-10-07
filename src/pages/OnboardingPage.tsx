import { useState } from 'react'
import { ArrowRight, QrCode, Sailboat, Users } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { InviteScanner } from '../components/InviteScanner'
import { invitationCode, joinBoat, previewInvitation } from '../services/boatSharing'
import { supabase } from '../services/auth'

export function OnboardingPage({ onDone, onCancel }: { onDone(): void; onCancel?(): void }) {
  const { saveBoat, refreshSharing, selectBoat } = useApp()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>(localStorage.getItem('pin-end-invite') ? 'join' : 'choose')
  const [name, setName] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [code, setCode] = useState(localStorage.getItem('pin-end-invite') ?? '')
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)
  const [scan, setScan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.') } finally { setBusy(false) }
  }
  const inspect = async (value: string) => {
    const normalized = invitationCode(value)
    if (!/^[A-F0-9]{12}$/.test(normalized)) throw new Error('Enter the 12-character code from your boat’s owner or admin.')
    setCode(normalized)
    const found = await previewInvitation(normalized)
    if (!found) throw new Error('This invitation has expired or is invalid. Ask for a new code.')
    setPreview(found)
  }
  return <main className="page onboarding-page">
    <div className="onboarding-heading"><span className="brand-mark"><Sailboat /></span><span className="eyebrow">Welcome aboard</span><h1>Your boat. Your crew.<br />Your next race.</h1><p>Create your boat or join the people you sail with.</p></div>
    <section className="panel onboarding-card">
      {mode === 'choose' && <div className="onboarding-options"><button onClick={() => setMode('create')}><Sailboat /><strong>Create a boat</strong><span>Set up your boat as its owner.</span><ArrowRight /></button><button onClick={() => setMode('join')}><Users /><strong>Join a boat</strong><span>Use an invitation, code, or QR.</span><ArrowRight /></button></div>}
      {mode === 'create' && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await saveBoat({ id: crypto.randomUUID(), name: name.trim(), sailNumber: sailNumber.trim(), design: '', lengthMetres: 0, draftMetres: 0 }); onDone() }) }}><h2>Create your boat</h2><p>You’ll be the owner and initial navigator. Invite crew after setup.</p><label className="field"><span>Boat name</span><input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>Sail number (optional)</span><input value={sailNumber} onChange={(event) => setSailNumber(event.target.value)} /></label><button className="button button--primary button--wide" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create boat'}</button></form>}
      {mode === 'join' && <><h2>{preview ? `Join ${preview.name}?` : 'Join your crew'}</h2>{!supabase ? <p>Shared boats need a signed-in account. This local workspace supports creating boats and racing offline.</p> : preview ? <><p>You’ll join as crew and follow the navigator’s target during races.</p><button className="button button--primary button--wide" disabled={busy} onClick={() => void run(async () => { const id = await joinBoat(code); localStorage.setItem('pin-end-selected-boat', id); localStorage.removeItem('pin-end-invite'); await refreshSharing(); selectBoat(id); onDone() })}>{busy ? 'Joining…' : 'Join as crew'}</button><button className="text-button" onClick={() => setPreview(null)}>Use another invitation</button></> : <><form onSubmit={(event) => { event.preventDefault(); void run(() => inspect(code)) }}><label className="field"><span>Invitation code or link</span><input autoFocus required value={code} onChange={(event) => setCode(event.target.value)} placeholder="12-character code" /></label><button className="button button--primary button--wide" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Find boat'}</button></form><button className="button button--secondary button--wide" onClick={() => setScan(true)}><QrCode size={18} /> Scan QR code</button>{scan && <InviteScanner onClose={() => setScan(false)} onScan={(value) => { setScan(false); void run(() => inspect(value)) }} />}</>}</>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {mode !== 'choose' && <button className="text-button" disabled={busy} onClick={() => { setMode('choose'); setPreview(null); setScan(false); setError('') }}>Back to options</button>}
      {onCancel && <button className="text-button" disabled={busy} onClick={onCancel}>Back to my boats</button>}
    </section>
  </main>
}
