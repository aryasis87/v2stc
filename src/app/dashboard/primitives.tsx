'use client';
// ═══════════════════════════════════════════
// primitives.tsx — potongan tampilan kecil yang dipakai lebih dari satu
// berkas dashboard. Semuanya MURNI: tak menyentuh palet atau nilai runtime,
// jadi tak perlu membaca `rt` dan aman diimpor di mana saja.
// ═══════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { rt } from './runtime';

export interface PickerOpt { value:string; label:string; sub?:string; icon?:string|null; }

export const Card: React.FC<{children:React.ReactNode;style?:React.CSSProperties;className?:string;flash?:'win'|'lose'|null;onClick?:()=>void}> =
({children,style,className='',flash,onClick}) => (
  <div className={`ds-card overflow-hidden ${className}`} onClick={onClick} style={{
    // Flash animation hanya berjalan pada .ds-card (box-shadow pulse)
    // Border rotation tetap berjalan pada ::before — tidak terpengaruh
    animation: flash==='win'
      ? 'win-flash 2s ease forwards'
      : flash==='lose'
      ? 'lose-flash 2s ease forwards'
      : undefined,
    // borderRadius & boxShadow TIDAK di-override inline — .ds-card (dashboardStyles)
    // adalah satu-satunya sumber kebenaran bentuk kartu.
    ...style,
  }}>{children}</div>
);

/**
 * Kerangka pemuatan (skeleton).
 *
 * TIDAK murni seperti Card: warnanya ikut tema, jadi ia membaca `rt.C` DI
 * DALAM badan komponen. Bentuk panah dengan return implisit sengaja diubah
 * jadi badan berkurung supaya pembacaan itu terjadi tiap render — versi
 * implisitnya akan membekukan warna pada nilai saat impor.
 */
export const Sk: React.FC<{w?:string|number;h?:number;style?:React.CSSProperties}> =
  ({ w = '100%', h = 20, style }) => {
    const C = rt.C;
    return <div style={{ width: w, height: h, background: C.faint, borderRadius: 4, ...style }} />;
  };

/** Lencana status kecil. MURNI — warnanya datang lewat prop `col`. */
export const StatusChip: React.FC<{col:string;label:string;pulse?:boolean}> = ({col,label,pulse}) => (
  <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',padding:'4px 10px',borderRadius:99,color:col,background:`${col}10`,border:`1px solid ${col}28`}}>
    <span style={{width:5,height:5,borderRadius:'50%',background:col,animation:pulse?'ping 1.6s ease-in-out infinite':undefined}}/>
    {label}
  </span>
);

export const AlwaysSignalBadge: React.FC<{
  isActive: boolean;
  step: number;
  maxSteps: number;
  totalLoss?: number;
  accent?: string;
}> = ({ isActive, step, maxSteps, totalLoss, accent = rt.C.amber }) => {
  // Dibaca DI SINI, tiap render — jangan dipindah ke tingkat modul.
  const C = rt.C;
  const T = rt.T;
  const FMT = rt.FMT;
  const CURR_UNIT = rt.CURR_UNIT;
  const MIN_AMOUNT = rt.MIN_AMOUNT;
  if (!isActive) return null;
  const lossDisplay = totalLoss ? `  −${FMT(Math.abs(totalLoss) / 100)}` : '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', borderRadius: 99,
      background: `${accent}12`, border: `1px solid ${accent}35`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, animation: 'ping 1.4s ease-in-out infinite' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Always Signal
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: accent }}>
        K{step}/{maxSteps}
      </span>
      {lossDisplay && (
        <span style={{ fontSize: 9, color: C.coral, fontFamily: 'monospace' }}>{lossDisplay}</span>
      )}
    </div>
  );
};

/** Sakelar. Warnanya ikut tema, jadi membaca rt di dalam badan. */
export const Toggle: React.FC<{checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean;accent?:string}> = ({checked,onChange,disabled,accent=rt.C.cyan}) => {
  const C = rt.C;
  return (
  <label style={{display:'inline-flex',alignItems:'center',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.4:1}}>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} disabled={disabled} style={{position:'absolute',opacity:0,width:0,height:0}}/>
    <div style={{width:44,height:22,borderRadius:22,position:'relative',transition:'all 0.2s',background:checked?`${accent}28`:C.bdr,border:`1px solid ${checked?`${accent}55`:C.bdr}`}}>
      <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',transition:'left 0.2s',left:checked?23:2,background:checked?accent:C.muted}}/>
    </div>
  </label>
);
};

// StatusChip dipindah ke ./primitives (murni, dipakai banyak berkas).

/** Tampilkan status Always Signal Martingale yang sedang aktif */
// AlwaysSignalBadge dipindah ke ./ControlCard (satu-satunya pemakainya).

/** Dialog pemilih (aset, timeframe, dsb). */
export const PickerModal: React.FC<{open:boolean;onClose:()=>void;title:string;options:PickerOpt[];value:string;onSelect:(v:string)=>void;searchable?:boolean;isDark?:boolean}> =
({open,onClose,title,options,value,onSelect,searchable,isDark=true}) => {
  const C = rt.C;
  const T = rt.T;
  const [q,setQ] = useState('');
  useEffect(()=>{if(open)setQ('');},[open]);

  if(!open) return null;
  const filtered = q.trim() ? options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())||o.value.toLowerCase().includes(q.toLowerCase())) : options;
  
  /*
   * Look baru popup picker: kartu radius 20 tanpa border-header,
   * baris opsi bersih dengan inset padding (tanpa garis kiri/kotak radio) —
   * terpilih = bg tint + ikon Check accent; hover = faint (kelas dsh-row).
   */
  const modalBg = isDark ? '#24262B' : '#ffffff';
  const iconBg  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(2,6,23,0.045)';
  const iconColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)';

  return (
    <div style={{position:'fixed',inset:0,zIndex:80,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',padding:'16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px) 16px',animation:'fade-in 0.15s ease'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:480,maxHeight:'80%',display:'flex',flexDirection:'column',background:modalBg,borderRadius:20,border:`1px solid ${C.bdr}`,boxShadow:isDark?'0 24px 80px rgba(0,0,0,0.6)':'0 24px 80px rgba(15,23,42,0.25)',overflow:'hidden',animation:'slide-up 0.25s cubic-bezier(0.32,0.72,0,1)'}}>
        {/* Header tanpa garis — title mengambang, tombol tutup polos */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 18px 8px',flexShrink:0}}>
          <span style={{fontSize:15,fontWeight:650,letterSpacing:'-0.01em',color:C.text}}>{title}</span>
          <button onClick={onClose} style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:99,border:'none',background:C.faint,color:C.muted,cursor:'pointer'}}>
            <X style={{width:14,height:14}}/>
          </button>
        </div>
        {searchable&&(
          <div style={{padding:'6px 14px 10px',flexShrink:0}}>
            <input className="ds-input" style={{fontSize:13,borderRadius:10}} placeholder={T('dashboard.searchAsset')} value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        )}
        <div style={{overflowY:'auto',flex:1,padding:'4px 8px 10px'}}>
          {filtered.map(opt=>{
            const isSel = opt.value===value;
            return (
              <button key={opt.value} className={isSel?undefined:'dsh-row'} onClick={()=>{onSelect(opt.value);onClose();}} style={{
                width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'10px 10px',
                background:isSel?`${C.cyan}12`:'transparent',
                border:'none',borderRadius:12,cursor:'pointer',marginBottom:2,
              }}>
                {opt.icon!==undefined&&(
                  <div style={{width:32,height:32,borderRadius:9,flexShrink:0,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:iconBg}}>
                    {opt.icon?(
                      <img src={opt.icon} alt="" style={{width:'100%',height:'100%',objectFit:'contain',padding:4}} onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none'}}/>
                    ):(
                      <span style={{fontSize:10,fontWeight:700,color:isSel?C.cyan:iconColor}}>{opt.value.slice(0,3)}</span>
                    )}
                  </div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <span style={{display:'block',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text,fontWeight:isSel?600:500}}>{opt.label}</span>
                  {opt.sub&&<span style={{display:'block',fontSize:11,marginTop:2,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{opt.sub}</span>}
                </div>
                {isSel&&<Check style={{width:16,height:16,color:C.cyan,flexShrink:0}}/>}
              </button>
            );
          })}
          {filtered.length===0&&<div style={{padding:'40px 20px',textAlign:'center',color:C.muted,fontSize:12}}>{T("common.notFound")}</div>}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// ENHANCED PICKER BUTTON WITH ICON & COLORED BACKGROUND
// ═══════════════════════════════════════════

/** Label kecil di atas kolom isian. MURNI. */
export const FL: React.FC<{children:React.ReactNode}> = ({children}) => {
  const C = rt.C;
  return (
  <label style={{display:'block',fontSize:10,fontWeight:600,marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase',color:C.muted}}>{children}</label>
);
};
