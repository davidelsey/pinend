import { useState } from 'react'
import QRCode from 'qrcode'
import { Navigation, QrCode, Users } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { assignMember, inviteCrew } from '../services/boatSharing'
import { supabase } from '../services/auth'

export function BoatCrew() {
  const { boat, access, userId, canManage, refreshSharing } = useApp()
  const [invite, setInvite] = useState<{ code: string; url: string; image: string } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Please try again.') } finally { setBusy(false) }
  }
  return <section className="panel boat-crew"><div className="panel__heading"><div><Users size={18} /><h2>Crew & navigation</h2></div><span className="chip">{access?.role ?? 'Local owner'}</span></div>
    <p>One navigator selects the target and confirms roundings. Everyone else follows.</p>
    {!supabase && <p className="microcopy">You are navigating this local boat. Sign in on a configured deployment to invite crew and share navigation.</p>}
    {access?.members.map((member) => <div className="boat-member" key={member.userId}><div><strong>{member.name}{member.userId === userId ? ' (you)' : ''}</strong><small>{member.role}{member.userId === access.navigatorId ? ' · Navigator' : ''}</small></div>{canManage && member.userId !== access.navigatorId && <button disabled={busy} className="button button--secondary" onClick={() => void run(async () => { await assignMember(boat.id, member.userId, null, true); await refreshSharing() })}><Navigation size={14} /> Make navigator</button>}{access.role === 'owner' && member.role !== 'owner' && <button className="text-button" disabled={busy} onClick={() => void run(async () => { await assignMember(boat.id, member.userId, member.role === 'admin' ? 'crew' : 'admin'); await refreshSharing() })}>{member.role === 'admin' ? 'Remove admin access' : 'Make admin'}</button>}</div>)}
    {canManage && supabase && <button className="button button--primary" disabled={busy} onClick={() => void run(async () => { const code = await inviteCrew(boat.id); const url = `${window.location.origin}/?invite=${code}`; setInvite({ code, url, image: await QRCode.toDataURL(url, { width: 256, margin: 4 }) }); })}><QrCode size={18} />{invite ? 'Replace invitation' : 'Invite crew'}</button>}
    {invite && <div className="boat-invitation"><img src={invite.image} width={256} height={256} alt={`QR invitation to join ${boat.name}`} /><strong className="invitation-code">{invite.code}</strong><p>Share this code, scan the QR, or send the link. Expires in 7 days. A replacement invalidates the previous invitation.</p><label className="field"><span>Invitation link</span><input readOnly value={invite.url} onFocus={(event) => event.currentTarget.select()} /></label><button className="button button--secondary" onClick={() => void run(async () => { await navigator.clipboard.writeText(invite.url); setMessage('Invitation link copied.') })}>Copy invitation link</button></div>}
    {message && <p role="status">{message}</p>}
  </section>
}
