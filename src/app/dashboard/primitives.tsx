'use client';
// ═══════════════════════════════════════════
// primitives.tsx — potongan tampilan kecil yang dipakai lebih dari satu
// berkas dashboard. Semuanya MURNI: tak menyentuh palet atau nilai runtime,
// jadi tak perlu membaca `rt` dan aman diimpor di mana saja.
// ═══════════════════════════════════════════

import React from 'react';
import { rt } from './runtime';

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
