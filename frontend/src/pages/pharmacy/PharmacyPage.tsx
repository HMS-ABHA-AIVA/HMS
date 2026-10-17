// Drug stock and dispensing of prescriptions. Runs on demo data.
import { useState } from 'react';
import { useHospitalStore } from '@/store/useHospitalStore';
import { Badge } from '@/components/ui/Badge';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function PharmacyPage() {
  const { drugs, encounters, patients, dispensePrescription } = useHospitalStore();
  const [tab, setTab] = useState<'queue' | 'inventory'>('queue');

  const pending = encounters
    .flatMap((e) => e.prescriptions.filter((rx) => !rx.dispensed).map((rx) => ({ e, rx })))
    .filter(({ e }) => e.status !== 'closed' || true);

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>Pharmacy & Inventory</h1>
          <div className="sub">Dispense queue and drug master</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab${tab === 'queue' ? ' active' : ''}`} onClick={() => setTab('queue')}>Dispense Queue</div>
        <div className={`tab${tab === 'inventory' ? ' active' : ''}`} onClick={() => setTab('inventory')}>Drug Master / Stock</div>
      </div>

      {tab === 'queue' && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Drug</th>
                <th>Dose</th>
                <th>Encounter</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map(({ e, rx }) => {
                const patient = patients.find((p) => p.id === e.patientId);
                return (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 500 }}>{patient?.name}</td>
                    <td>{rx.drugName}</td>
                    <td>{rx.dose} · {rx.frequency} · {rx.duration}</td>
                    <td><Badge tone="neutral">{e.type}</Badge></td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => dispensePrescription(e.id, rx.id)}>
                        Dispense
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pending.length === 0 && <tr><td colSpan={5} className="empty-state">No pending prescriptions.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="num">Stock</th>
                <th className="num">Reorder Level</th>
                <th className="num">MRP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {drugs.map((d) => {
                const low = d.stock <= d.reorderLevel;
                const nearExpiry = new Date(d.expiry) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td className="mono">{d.batch}</td>
                    <td className="mono">{d.expiry} {nearExpiry && <Badge tone="warn">Near expiry</Badge>}</td>
                    <td className="num mono">{d.stock} {d.unit}</td>
                    <td className="num mono">{d.reorderLevel}</td>
                    <td className="num mono">₹{d.mrp.toFixed(2)}</td>
                    <td>{low && <Badge tone="danger">Reorder</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
