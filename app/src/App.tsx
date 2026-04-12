import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Cpu, TerminalSquare } from 'lucide-react';
import { ProofPayClient, EscrowAccount } from '@proofpay/sdk';
import { PublicKey, Keypair } from '@solana/web3.js';
import './index.css';

// Mock Provider for UI purposes since we don't have a wallet adapter setup yet
const dummyClient = new ProofPayClient({ network: 'devnet' });

export default function App() {
  const [escrows, setEscrows] = useState<EscrowAccount[]>([]);
  const [form, setForm] = useState({
    amount: '',
    payee: '',
    oracle: '',
    milestoneDesc: '',
  });

  // Dummy escrow data for the UI so we can see the designed states
  useEffect(() => {
    setEscrows([
      {
        escrowId: new Uint8Array(32),
        payer: Keypair.generate().publicKey,
        payee: Keypair.generate().publicKey,
        usdcMint: Keypair.generate().publicKey,
        totalAmount: 5000n,
        releasedAmount: 0n,
        milestones: [{ description: 'Frontend Layout', releaseBps: 10000 }],
        currentMilestone: 0,
        state: 'funded',
        createdAt: new Date(),
        timeoutAt: new Date(),
        bump: 255,
        disputedAt: null,
        disputedBy: null,
        disputeReason: ''
      },
      {
        escrowId: new Uint8Array(32),
        payer: Keypair.generate().publicKey,
        payee: Keypair.generate().publicKey,
        usdcMint: Keypair.generate().publicKey,
        totalAmount: 12000n,
        releasedAmount: 0n,
        milestones: [{ description: 'Smart Contract Audit', releaseBps: 10000 }],
        currentMilestone: 0,
        state: 'disputed',
        createdAt: new Date(),
        timeoutAt: new Date(),
        bump: 255,
        disputedAt: new Date(),
        disputedBy: Keypair.generate().publicKey,
        disputeReason: 'Payee failed to deliver audit report on time'
      }
    ]);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Creating escrow via ProofPayClient...", form);
    alert("SYS_MSG: Escrow Creation Triggered // " + form.amount + " USDC");
  };

  const handleDispute = (escrow: EscrowAccount) => {
    console.log("Triggering dispute via ProofPayClient...", escrow.escrowId);
    alert("SYS_MSG: Opening Dispute // ORACLE INTERVENTION REQUIRED");
  };

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={24} color="var(--term-accent)" />
          <strong style={{ fontSize: '1.2rem', letterSpacing: '2px' }}>PROOFPAY_INFRA</strong>
        </div>
        <div className="system-status">
          <span className="blink">●</span> NETWORK_CONNECTED [DEVNET]
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
              <label>Payee PublicKey</label>
              <input 
                type="text" 
                placeholder="Ex: 5rUL..." 
                value={form.payee} 
                onChange={e => setForm({...form, payee: e.target.value})} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Oracle Address</label>
              <input 
                type="text" 
                placeholder="Ex: AI_Oracle_ID" 
                value={form.oracle} 
                onChange={e => setForm({...form, oracle: e.target.value})} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Milestone 1 Description</label>
              <input 
                type="text" 
                placeholder="Ex: Delivery of phase 1" 
                value={form.milestoneDesc} 
                onChange={e => setForm({...form, milestoneDesc: e.target.value})} 
                required 
              />
            </div>

            <button type="submit" className="primary">Execute Transaction</button>
          </form>
        </div>

        <div className="panel" style={{ borderRight: 'none' }}>
          <h2>ACTIVE_CONTRACTS</h2>
          
          {escrows.map((escrow, i) => (
            <div key={i} className={`escrow-card ${escrow.state}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={16} color="var(--term-dim)" />
                  <span style={{ fontFamily: 'monospace', color: 'var(--term-dim)' }}>
                    ID: {Array.from(escrow.escrowId.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...
                  </span>
                </div>
                <span className={`badge ${escrow.state}`}>[{escrow.state}]</span>
              </div>

              <div className="data-row">
                <span>TOTAL_AMOUNT</span>
                <span>{escrow.totalAmount.toString()} USDC</span>
              </div>
              <div className="data-row">
                <span>PAYEE</span>
                <span>{escrow.payee.toBase58().substring(0, 8)}...</span>
              </div>
              <div className="data-row">
                <span>MILESTONE_1</span>
                <span>{escrow.milestones[0]?.description}</span>
              </div>

              {escrow.state === 'disputed' && (
                <div style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--term-alert)', color: 'var(--term-alert)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldAlert size={16} /> <strong>DISPUTE_ACTIVE</strong>
                  </div>
                  <div>REASON: {escrow.disputeReason}</div>
                </div>
              )}

              {escrow.state !== 'disputed' && escrow.state !== 'completed' && (
                <div style={{ marginTop: '16px' }}>
                  <button className="danger" onClick={() => handleDispute(escrow)}>
                    <TerminalSquare size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                    Command: Open Dispute
                  </button>
                </div>
              )}
            </div>
          ))}

          {escrows.length === 0 && (
            <div style={{ color: 'var(--term-dim)', textAlign: 'center', padding: '40px' }}>
              NO_ACTIVE_CONTRACTS_FOUND
            </div>
          )}
        </div>
      </div>
    </>
  );
}
