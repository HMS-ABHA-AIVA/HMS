// Bills created from visits. Runs on demo data.
import { useState } from 'react';
import { useHospitalStore } from '@/store/useHospitalStore';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { Bill } from '@/types';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function BillingPage() {
  const { bills, patients, encounters, finalizeBill } = useHospitalStore();
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  const sorted = [...bills].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>Billing & Insurance</h1>
          <div className="sub">GST-compliant invoicing for OPD & IPD encounters</div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Bill ID</th>
              <th>Patient</th>
              <th>Encounter</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const patient = patients.find((p) => p.id === b.patientId);
              const encounter = encounters.find((e) => e.id === b.encounterId);
              const total = billTotal(b);
              return (
                <tr key={b.id}>
                  <td className="mono">{b.id.toUpperCase()}</td>
                  <td style={{ fontWeight: 500 }}>{patient?.name}</td>
                  <td><Badge tone="neutral">{encounter?.type}</Badge></td>
                  <td className="num mono">₹{total.toFixed(2)}</td>
                  <td>
                    {b.status === 'draft' && <Badge tone="warn">Draft</Badge>}
                    {b.status === 'finalized' && <Badge tone="ok">Finalized</Badge>}
                    {b.status === 'paid' && <Badge tone="ok">Paid</Badge>}
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setViewBill(b)}>View Invoice</button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={6} className="empty-state">No bills generated yet. Close an OPD consult or discharge an IPD patient to generate one.</td></tr>}
          </tbody>
        </table>
      </div>

      {viewBill && (
        <Modal title={`Invoice ${viewBill.id.toUpperCase()}`} onClose={() => setViewBill(null)} width={520}>
          <InvoiceDetail bill={viewBill} patientName={patients.find((p) => p.id === viewBill.patientId)?.name ?? ''} />
          {viewBill.status === 'draft' && (
            <div className="flex-between" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setViewBill(null)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={() => { finalizeBill(viewBill.id); setViewBill(null); }}
              >
                Finalize Invoice
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function billTotal(b: Bill) {
  return b.items.reduce((sum, item) => sum + item.qty * item.rate * (1 + item.gstPct / 100), 0);
}

function InvoiceDetail({ bill, patientName }: { bill: Bill; patientName: string }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Patient: <b>{patientName}</b></p>
      <table className="table">
        <thead>
          <tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          {bill.items.map((item, i) => (
            <tr key={i}>
              <td>{item.label}</td>
              <td className="num mono">{item.qty}</td>
              <td className="num mono">₹{item.rate.toFixed(2)}</td>
              <td className="num mono">{item.gstPct}%</td>
              <td className="num mono">₹{(item.qty * item.rate * (1 + item.gstPct / 100)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex-between" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <span style={{ fontWeight: 600 }}>Total</span>
        <span className="mono" style={{ fontWeight: 700, fontSize: 16 }}>₹{billTotal(bill).toFixed(2)}</span>
      </div>
    </div>
  );
}
