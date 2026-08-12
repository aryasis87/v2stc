'use client';
// ═══════════════════════════════════════════
// primitives.tsx — potongan tampilan kecil yang dipakai lebih dari satu
// berkas dashboard. Semuanya MURNI: tak menyentuh palet atau nilai runtime,
// jadi tak perlu membaca `rt` dan aman diimpor di mana saja.
// ═══════════════════════════════════════════

import React from 'react';

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
