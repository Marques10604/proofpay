import React, { useState } from 'react';
import { Shield, ShieldAlert, Cpu, TerminalSquare } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import './index.css';

// --- MOCK INTERFACES (Pure React, no Node/Solana dependencies) ---

type EscrowState = 'funded' | 'disputed' | 'completed';

interface MockEscrow {
  id: string;
  payer: string;
  payee: string;
  amount: string;
  milestone: string;
  state: EscrowState;
  disputeReason?: string;
}

export default function App() {
  const [escrows, setEscrows] = useState<MockEscrow[]>([
    {
      id: 'e82a91f0',
      payer: 'Payer_Wallet_01',
      payee: 'Dev_Studio_X',
      amount: '5000',
      milestone: 'Protocol Architecture',
      state: 'funded'
    },
    {
      id: 'fa91c83d',
      payer: 'Payer_Wallet_02',
      payee: 'Audit_Firm_Alpha',
      amount: '12000',
      milestone: 'Smart Contract Security Audit',
      state: 'disputed',
      disputeReason: 'Payee failed to deliver audit report on time'
    }
  ]);

  const [form, setForm] = useState({
    amount: '',
    payee: '',
    oracle: '',
    milestoneDesc: '',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const newEscrow: MockEscrow = {
      id: Math.random().toString(16).slice(2, 10),
      payer: 'Current_User_Wallet',
      payee: form.payee,
      amount: form.amount,
      milestone: form.milestoneDesc,
      state: 'funded'
    };
    setEscrows([newEscrow, ...escrows]);
    setForm({ amount: '', payee: '', oracle: '', milestoneDesc: '' });
    alert(`SYS_MSG: Escrow ${newEscrow.id} Created Successfully`);
  };

  const handleDispute = (id: string) => {
    setEscrows(escrows.map(esc => 
      esc.id === id 
        ? { ...esc, state: 'disputed', disputeReason: 'Manual dispute opened by user intervention' } 
        : esc
    ));
    alert("SYS_MSG: DISPUTE_ID_" + id + "__INITIALIZED");
  };

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={24} color="var(--term-accent)" />
          <strong style={{ fontSize: '1.2rem', letterSpacing: '2px' }}>PROOFPAY_INFRA</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="system-status">
            <span className="blink">●</span> SIMULATED_ENVIRONMENT [MOCK_MODE]
          </div>
          <WalletMultiButton />
        </div>
      </div>

      <div className="dashboard">
        <div className="panel">
          <h2>INIT_ESCROW</h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Amount (USDC)</label>
              <input 
                type="number" 
                placeholder="0.00" 
                value={form.amount} 
                onChange={e => setForm({...form, amount: e.target.value})} 
                required 
              />
            </div>
            
            <div className="form-group">
              <label>Payee PublicKey / Identifier</label>
              <input 
                type="text" 
                placeholder="Ex: 0x... or WalletID" 
                value={form.payee} 
                onChange={e => setForm({...form, payee: e.target.value})} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Oracle Agent ID</label>
              <input 
                type="text" 
                placeholder="Ex: PROOF_ORACLE_01" 
                value={form.oracle} 
                onChange={e => setForm({...form, oracle: e.target.value})} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Milestone Definition</label>
              <input 
                type="text" 
                placeholder="Ex: API Implementation" 
                value={form.milestoneDesc} 
                onChange={e => setForm({...form, milestoneDesc: e.target.value})} 
                required 
              />
            </div>

            <button type="submit" className="primary">Initialize Contract</button>
          </form>
        </div>

        <div className="panel" style={{ borderRight: 'none' }}>
          <h2>MONITOR_VIRTUAL_LEDGER</h2>
          
          {escrows.map((escrow) => (
            <div key={escrow.id} className={`escrow-card ${escrow.state}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={16} color="var(--term-dim)" />
                  <span style={{ fontFamily: 'monospace', color: 'var(--term-dim)' }}>
                    REF_ID: {escrow.id}
                  </span>
                </div>
                <span className={`badge ${escrow.state}`}>[{escrow.state}]</span>
              </div>

              <div className="data-row">
                <span>LIQUIDITY</span>
                <span>{escrow.amount} USDC</span>
              </div>
              <div className="data-row">
                <span>RECIPIENT</span>
                <span>{escrow.payee}</span>
              </div>
              <div className="data-row">
                <span>CURRENT_GOAL</span>
                <span>{escrow.milestone}</span>
              </div>

              {escrow.state === 'disputed' && (
                <div style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--term-alert)', color: 'var(--term-alert)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldAlert size={16} /> <strong>ASSERTION_FAILURE</strong>
                  </div>
                  <div style={{ opacity: 0.8 }}>TRACELOG: {escrow.disputeReason}</div>
                </div>
              )}

              {escrow.state === 'funded' && (
                <div style={{ marginTop: '16px' }}>
                  <button className="danger" onClick={() => handleDispute(escrow.id)}>
                    <TerminalSquare size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                    Command: Signal Dispute
                  </button>
                </div>
              )}
            </div>
          ))}

          {escrows.length === 0 && (
            <div style={{ color: 'var(--term-dim)', textAlign: 'center', padding: '40px' }}>
              EMPTY_LEDGER
            </div>
          )}
        </div>
      </div>
    </>
  );
}
