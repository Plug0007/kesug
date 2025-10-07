import React, { useEffect, useState, useMemo } from 'react';

// CONFIG - update before deploy
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwjgCJOJu8Xac2n38491e1VvurZ2yHP_F7Z8oh6oRXhRs6dTFAmsdpdsyAJzNYhmtNBiA/exec'; // e.g. https://script.google.com/macros/s/AKfyc.../exec
const OAUTH_CLIENT_ID = ''; // Google OAuth client ID (optional for sign-in)

// --- Encryption utilities (AES-GCM via Web Crypto)
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
async function encryptString(plain, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + ct.byteLength);
  combined.set(salt,0); combined.set(iv,salt.byteLength); combined.set(new Uint8Array(ct), salt.byteLength+iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}
async function decryptString(b64, passphrase) {
  const raw = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
  const salt = raw.slice(0,16), iv = raw.slice(16,28), ct = raw.slice(28);
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function apiFetch(path, body=null) {
  if (!BACKEND_URL) throw new Error('Set BACKEND_URL in App config');
  const url = new URL(BACKEND_URL + path);
  const opts = body ? { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) } : { method: 'GET' };
  const res = await fetch(url.toString(), opts);
  if (!res.ok) throw new Error('Network error ' + res.status);
  return res.json();
}

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export default function App() {
  const [user,setUser] = useState(null);
  const [isEditor,setIsEditor] = useState(false);
  const [accounts,setAccounts] = useState([]);
  const [airdrops,setAirdrops] = useState([]);
  const [assignments,setAssignments] = useState([]);
  const [encPass,setEncPass] = useState('');
  const [loading,setLoading] = useState(false);

  useEffect(()=>{ loadGoogleScript().then(()=>{ if (!OAUTH_CLIENT_ID) return; window.google?.accounts?.id.initialize({ client_id: OAUTH_CLIENT_ID, callback: tr=>{ try{ const p = JSON.parse(atob(tr.credential.split('.')[1])); setUser({ id: p.sub, email: p.email, name: p.name }); fetchAll(); }catch(e){console.warn(e);} } }); }); },[]);

  async function fetchAll() {
    setLoading(true);
    try {
      const data = await apiFetch('/getAll');
      setAccounts(data.accounts || []);
      setAirdrops(data.airdrops || []);
      setAssignments(data.assignments || []);
    } catch(e){ console.error(e); alert('Fetch failed: '+e.message); } finally { setLoading(false); }
  }

  async function createAccount(newAcc) {
    setLoading(true);
    try {
      if (newAcc.secretPhrase && encPass) { newAcc.secretPhraseEncrypted = await encryptString(newAcc.secretPhrase, encPass); delete newAcc.secretPhrase; }
      if(!newAcc.id) newAcc.id = crypto.randomUUID();
      await apiFetch('/createAccount', { account: newAcc }); await fetchAll();
    } catch(e){ console.error(e); alert('Create account failed'); } finally { setLoading(false); }
  }
  async function updateAccount(id,patch) {
    setLoading(true);
    try {
      if (patch.secretPhrase && encPass) { patch.secretPhraseEncrypted = await encryptString(patch.secretPhrase, encPass); delete patch.secretPhrase; }
      await apiFetch('/updateAccount', { id, patch }); await fetchAll();
    } catch(e){ console.error(e); alert('Update failed'); } finally{ setLoading(false); }
  }
  async function deleteAccount(id) { if(!confirm('Delete?')) return; setLoading(true); try{ await apiFetch('/deleteAccount',{id}); await fetchAll(); }catch(e){console.error(e); alert('Delete failed')}finally{setLoading(false);} }

  async function createAirdrop(drop) { setLoading(true); try{ if(!drop.id) drop.id = crypto.randomUUID(); await apiFetch('/createAirdrop',{airdrop:drop}); await fetchAll(); }catch(e){console.error(e); alert('Create airdrop failed')}finally{setLoading(false);} }
  async function updateAirdrop(id,patch){ setLoading(true); try{ await apiFetch('/updateAirdrop',{id,patch}); await fetchAll(); }catch(e){console.error(e); alert('Update failed')}finally{setLoading(false);} }
  async function assignAccountsToAirdrop(airdropId, accountIds){ setLoading(true); try{ await apiFetch('/assignAccounts',{airdropId, accountIds}); await fetchAll(); }catch(e){console.error(e); alert('Assign failed')}finally{setLoading(false);} }
  async function updateAssignment(assignId,patch){ setLoading(true); try{ await apiFetch('/updateAssignment',{assignmentId:assignId, patch}); await fetchAll(); }catch(e){console.error(e); alert('Update assignment failed')}finally{setLoading(false);} }

  async function revealSecret(a){ if(!encPass) return alert('Enter passphrase'); if(!a.secretPhraseEncrypted) return alert('No secret'); try{ const dec = await decryptString(a.secretPhraseEncrypted, encPass); alert('Secret: '+dec); }catch(e){ console.error(e); alert('Decrypt failed'); } }

  const totals = useMemo(()=>{ let earned=0, invested=0; assignments.forEach(a=>{ earned += Number(a.rewardAmount||0); invested += Number(a.investmentAmount||0); }); return {earned,invested}; },[assignments]);

  if(!user) return (<div className='min-h-screen p-6'><div className='max-w-3xl mx-auto bg-gray-900 p-6 rounded'><h1 className='text-2xl font-bold'>Kesug — Airdrop Manager</h1><p className='mt-4'>Sign in with Google to continue.</p><div className='mt-4'><button onClick={()=>window.google?.accounts?.id.prompt()} className='px-4 py-2 rounded bg-indigo-600'>Sign in</button></div></div></div>);

  return (
    <div className='min-h-screen p-6'>
      <div className='max-w-6xl mx-auto'>
        <header className='flex justify-between items-center mb-6'>
          <div><h1 className='text-2xl font-bold'>Kesug</h1><div className='text-sm text-gray-400'>Signed in as {user.email}</div></div>
          <div className='flex items-center gap-3'>
            <input placeholder='encryption passphrase' value={encPass} onChange={e=>setEncPass(e.target.value)} className='px-3 py-1 rounded bg-gray-800' />
            <label className='flex items-center gap-2'><input type='checkbox' checked={isEditor} onChange={e=>setIsEditor(e.target.checked)} /> Editor</label>
            <button onClick={()=>{ setUser(null); location.reload(); }} className='px-3 py-1 bg-red-600 rounded'>Sign out</button>
          </div>
        </header>

        <main className='grid grid-cols-3 gap-6'>
          <section className='col-span-1 bg-gray-800 p-4 rounded'>
            <AccountsPanel accounts={accounts} onCreate={createAccount} onUpdate={updateAccount} onDelete={deleteAccount} onReveal={revealSecret} isEditor={isEditor} />
          </section>
          <section className='col-span-2 bg-gray-800 p-4 rounded'>
            <div className='flex justify-between items-center mb-4'><h2 className='font-semibold'>Airdrops</h2><div className='text-sm text-gray-400'>Earned: ${totals.earned} • Invested: ${totals.invested}</div></div>
            <AirdropsPanel airdrops={airdrops} assignments={assignments} accounts={accounts} onCreateAirdrop={createAirdrop} onAssign={assignAccountsToAirdrop} onUpdateAssignment={updateAssignment} isEditor={isEditor} onUpdateAirdrop={updateAirdrop} />
          </section>
        </main>
      </div>
    </div>
  );
}

function AccountsPanel({accounts,onCreate,onUpdate,onDelete,onReveal,isEditor}){
  const [form,setForm]=useState({name:'',email:'',twitter:'',discord:'',telegram:'',secretPhrase:''});
  function reset(){ setForm({name:'',email:'',twitter:'',discord:'',telegram:'',secretPhrase:''}); }
  return (<div>
    {isEditor && <div className='mb-3 space-y-2'>
      <input placeholder='Name' value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <input placeholder='Email' value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <input placeholder='X / Twitter' value={form.twitter} onChange={e=>setForm({...form,twitter:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <input placeholder='Discord' value={form.discord} onChange={e=>setForm({...form,discord:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <input placeholder='Telegram' value={form.telegram} onChange={e=>setForm({...form,telegram:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <input placeholder='Secret phrase (encrypted)' value={form.secretPhrase} onChange={e=>setForm({...form,secretPhrase:e.target.value})} className='w-full p-2 rounded bg-gray-900' />
      <div className='flex gap-2'><button className='px-3 py-1 bg-indigo-600 rounded' onClick={()=>{ onCreate(form); reset(); }}>Create</button><button className='px-3 py-1 bg-gray-700 rounded' onClick={reset}>Reset</button></div>
    </div>}
    <div className='overflow-auto max-h-96'>
      {accounts.map(a=>(
        <div key={a.id} className='p-2 border-b border-gray-700 flex justify-between items-center'>
          <div><div className='font-medium'>{a.name||'(no name)'}</div><div className='text-xs text-gray-400'>{a.email} • {a.twitter}</div></div>
          <div className='flex gap-2'>
            <button onClick={()=>onReveal(a)} className='px-2 py-1 bg-yellow-600 rounded text-sm'>Reveal</button>
            {isEditor && <button onClick={()=>onDelete(a.id)} className='px-2 py-1 bg-red-600 rounded text-sm'>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  </div>);
}

function AirdropsPanel({airdrops,assignments,accounts,onCreateAirdrop,onAssign,onUpdateAssignment,isEditor,onUpdateAirdrop}){
  const [newDrop,setNewDrop]=useState({name:'',url:'',group:'',startDate:'',endDate:''});
  const [selected,setSelected]=useState(null);
  const [selection,setSelection]=useState([]);
  function open(d){ setSelected(d); }
  return (<div>
    {isEditor && <div className='mb-4'>
      <div className='grid grid-cols-3 gap-2'><input placeholder='Name' value={newDrop.name} onChange={e=>setNewDrop({...newDrop,name:e.target.value})} className='p-2 rounded bg-gray-900' /><input placeholder='URL' value={newDrop.url} onChange={e=>setNewDrop({...newDrop,url:e.target.value})} className='p-2 rounded bg-gray-900' /><input placeholder='Group' value={newDrop.group} onChange={e=>setNewDrop({...newDrop,group:e.target.value})} className='p-2 rounded bg-gray-900' /></div>
      <div className='flex gap-2 mt-2'><input type='date' value={newDrop.startDate} onChange={e=>setNewDrop({...newDrop,startDate:e.target.value})} className='p-2 rounded bg-gray-900' /><input type='date' value={newDrop.endDate} onChange={e=>setNewDrop({...newDrop,endDate:e.target.value})} className='p-2 rounded bg-gray-900' /><button className='px-3 py-1 bg-indigo-600 rounded' onClick={()=>{ onCreateAirdrop(newDrop); setNewDrop({name:'',url:'',group:'',startDate:'',endDate:''}); }}>Create Airdrop</button></div>
    </div>}
    <div className='grid grid-cols-2 gap-4'>
      <div><h3 className='font-medium mb-2'>Airdrops</h3><div className='space-y-2 max-h-96 overflow-auto'>{airdrops.map(d=>(
        <div key={d.id} className='p-2 border border-gray-700 rounded flex justify-between items-center'>
          <div>
            <div className='font-semibold'>{d.name} <span className='text-xs text-gray-400'>({d.group})</span></div>
            <div className='text-sm text-gray-400'>{d.url}</div>
            <div className='text-xs mt-1 text-gray-400'>
              {d.totalEarned !== undefined && (
                <>
                  Earned: ${Number(d.totalEarned).toFixed(2)} • Invested: ${Number(d.totalInvested||0).toFixed(2)} • Profit: ${Number(d.profit||0).toFixed(2)}
                  <br/>
                </>
              )}
              <span>{d.startDate || ''} {d.endDate ? '→ ' + d.endDate : ''}</span>
              {d.endedAt ? <><br/><span className='text-yellow-300'>Ended at: {new Date(d.endedAt).toLocaleString()}</span></> : null}
            </div>
          </div>
          <div className='flex gap-2'>
            <button className='px-2 py-1 bg-gray-700 rounded' onClick={()=>open(d)}>Open</button>
            {isEditor && (
              <button className='px-2 py-1 bg-gray-700 rounded' onClick={async ()=>{
                if (!confirm('Mark this airdrop as ENDED? This will compute totals from assignments.')) return;
                await onUpdateAirdrop(d.id, { ended: true });
              }}>
                Mark Ended
              </button>
            )}
          </div>
        </div>
      ))}</div></div>
      <div><h3 className='font-medium mb-2'>Selected Airdrop</h3>{!selected ? <div className='text-gray-400'>Open an airdrop to manage assignments.</div> : <div>
        <div className='mb-2'>Name: <strong>{selected.name}</strong></div>
        <div className='mb-2 text-sm text-gray-400'>Group: {selected.group} • {selected.startDate} → {selected.endDate}</div>

        {(selected.totalEarned !== undefined) ? (
          <div className='p-2 mb-3 rounded bg-gray-900 text-sm'>
            <div>Total Earned: <strong>${Number(selected.totalEarned).toFixed(2)}</strong></div>
            <div>Total Invested: <strong>${Number(selected.totalInvested||0).toFixed(2)}</strong></div>
            <div>Profit: <strong>${Number(selected.profit||0).toFixed(2)}</strong></div>
            {selected.endedAt && <div className='text-xs text-gray-400'>Ended at: {new Date(selected.endedAt).toLocaleString()}</div>}
          </div>
        ) : (
          <div className='text-xs text-gray-500 mb-2'>Totals will be computed and stored when the airdrop is marked ended.</div>
        )}

        <div className='mb-2'>
          <label className='block text-sm mb-1'>Add accounts to this airdrop</label>
          <select multiple value={selection} onChange={e=>setSelection(Array.from(e.target.selectedOptions, o=>o.value))} className='w-full p-2 bg-gray-900 rounded'>
            {accounts.map(a=> <option key={a.id} value={a.id}>{a.name||a.email}</option>)}
          </select>
          <div className='flex gap-2 mt-2'><button className='px-3 py-1 bg-indigo-600 rounded' onClick={()=>{ onAssign(selected.id, selection); setSelection([]); }}>Assign Selected</button></div>
        </div>

        <h4 className='font-semibold mt-3'>Assignments</h4>
        <div className='space-y-2 max-h-64 overflow-auto'>
          {assignments.filter(a=>a.airdropId===selected.id).map(a=> (
            <div key={a.id} className='p-2 border border-gray-700 rounded flex justify-between items-center'>
              <div>
                <div className='font-medium'>{(accounts.find(x=>x.id===a.accountId)||{}).name || a.accountId}</div>
                <div className='text-sm text-gray-400'>Status: {a.status || 'Assigned'}</div>
                <div className='text-xs text-gray-400'>Reward: ${a.rewardAmount || 0} • Invested: ${a.investmentAmount || 0}</div>
              </div>
              <div className='flex gap-2 items-center'>
                {isEditor ? (
                  <>
                    <input type='number' placeholder='reward' defaultValue={a.rewardAmount||0} onBlur={e=>onUpdateAssignment(a.id, { rewardAmount: Number(e.target.value) })} className='w-20 p-1 rounded bg-gray-900' />
                    <input type='number' placeholder='invest' defaultValue={a.investmentAmount||0} onBlur={e=>onUpdateAssignment(a.id, { investmentAmount: Number(e.target.value) })} className='w-20 p-1 rounded bg-gray-900' />
                    <select defaultValue={a.status||'Assigned'} onChange={e=>onUpdateAssignment(a.id,{status:e.target.value})} className='p-1 rounded bg-gray-900'>
                      <option>Assigned</option>
                      <option>Waiting for Rewards</option>
                      <option>Rewarded - Eligible</option>
                      <option>Rewarded - Not Eligible</option>
                    </select>
                  </>
                ) : <div className='text-sm text-gray-400'>View</div>}
              </div>
            </div>
          ))}
        </div>
      </div>}</div>
    </div>
  </div>);
}

