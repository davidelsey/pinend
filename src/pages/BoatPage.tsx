import { useState } from 'react'
import { Check, Plus, Sailboat, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { useApp } from '../app/AppContext'
import type { Sail } from '../domain/types'

export function BoatPage() {
  const { boat, sails, saveBoat, saveSail } = useApp()
  const [draft, setDraft] = useState(boat)
  const [showAddSail, setShowAddSail] = useState(false)
  const [newSail, setNewSail] = useState<Pick<Sail, 'name' | 'type' | 'condition' | 'location'>>({
    name: '', type: 'headsail', condition: 'good', location: 'wardrobe',
  })

  return (
    <div className="page standard-page">
      <section className="page-title">
        <span className="eyebrow"><Sailboat size={14} /> Your boat</span>
        <h1>{boat.name}</h1>
        <p>Particulars and sail wardrobe stay available on this device.</p>
      </section>
      <div className="content-grid">
        <div className="content-stack">
          <section className="panel">
            <div className="panel__heading"><div><Settings2 size={18} /><h2>Boat particulars</h2></div><span className="chip chip--verified"><ShieldCheck size={13} /> Personal</span></div>
            <div className="form-grid">
              <label className="field"><span>Boat name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="field"><span>Sail number</span><input value={draft.sailNumber} onChange={(e) => setDraft({ ...draft, sailNumber: e.target.value })} /></label>
              <label className="field"><span>Design / class</span><input value={draft.design} onChange={(e) => setDraft({ ...draft, design: e.target.value })} /></label>
              <label className="field"><span>Length overall (m)</span><input type="number" step="0.01" value={draft.lengthMetres} onChange={(e) => setDraft({ ...draft, lengthMetres: Number(e.target.value) })} /></label>
              <label className="field"><span>Draft (m)</span><input type="number" step="0.01" value={draft.draftMetres} onChange={(e) => setDraft({ ...draft, draftMetres: Number(e.target.value) })} /></label>
            </div>
            <button className="button button--primary" onClick={() => void saveBoat(draft)}><Check size={16} /> Save particulars</button>
          </section>

          <section className="panel">
            <div className="panel__heading"><div><Sailboat size={18} /><h2>Sail wardrobe</h2></div><button className="button button--small button--secondary" onClick={() => setShowAddSail(true)}><Plus size={15} /> Add sail</button></div>
            <div className="wardrobe-grid">
              {sails.map((sail) => (
                <article className="sail-card" key={sail.id}>
                  <div className="sail-card__visual"><span>{sail.type === 'mainsail' ? 'MAIN' : sail.type === 'headsail' ? 'JIB' : sail.type === 'spinnaker' ? 'SPIN' : 'SAIL'}</span></div>
                  <div className="sail-card__body">
                    <strong>{sail.name}</strong><small>{sail.type} · {sail.condition}</small>
                    <select value={sail.location} onChange={(e) => void saveSail({ ...sail, location: e.target.value as Sail['location'] })}>
                      <option value="rigged">Rigged</option><option value="wardrobe">Wardrobe</option><option value="locker">Locker</option>
                    </select>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <aside className="sidebar-stack">
          <section className="panel boat-summary">
            <div className="boat-silhouette"><Sailboat size={94} strokeWidth={1} /></div>
            <h2>{boat.design}</h2><p>{boat.sailNumber}</p>
            <div><span>LOA</span><strong>{boat.lengthMetres} m</strong></div>
            <div><span>Draft</span><strong>{boat.draftMetres} m</strong></div>
            <div><span>Sails</span><strong>{sails.length}</strong></div>
          </section>
        </aside>
      </div>

      {showAddSail && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="form-modal" onSubmit={(event) => {
            event.preventDefault()
            if (!newSail.name.trim()) return
            void saveSail({ ...newSail, id: crypto.randomUUID() })
            setShowAddSail(false)
          }}>
            <div className="panel__heading"><h2>Add a sail</h2><button type="button" className="icon-button" onClick={() => setShowAddSail(false)}><Trash2 size={17} /></button></div>
            <label className="field"><span>Name</span><input autoFocus value={newSail.name} onChange={(e) => setNewSail({ ...newSail, name: e.target.value })} /></label>
            <label className="field"><span>Type</span><select value={newSail.type} onChange={(e) => setNewSail({ ...newSail, type: e.target.value as Sail['type'] })}><option value="mainsail">Mainsail</option><option value="headsail">Headsail</option><option value="spinnaker">Spinnaker</option><option value="staysail">Staysail</option><option value="other">Other</option></select></label>
            <label className="field"><span>Condition</span><select value={newSail.condition} onChange={(e) => setNewSail({ ...newSail, condition: e.target.value as Sail['condition'] })}><option value="excellent">Excellent</option><option value="good">Good</option><option value="serviceable">Serviceable</option><option value="repair">Needs repair</option></select></label>
            <button className="button button--primary button--wide" type="submit"><Plus size={16} /> Add to wardrobe</button>
          </form>
        </div>
      )}
    </div>
  )
}
