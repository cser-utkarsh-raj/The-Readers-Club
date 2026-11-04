import React from 'react';
import { AppPageRoute } from '../types/book';

type DotFooterProps = {
  appName: string;
  navItems: { id: AppPageRoute; label: string }[];
  onNavigate: (page: AppPageRoute) => void;
};

function DotLogo({ size = 22 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width={size} height={size * 1.1} fill="none" aria-hidden="true">
      <path d="M40 70 L160 70 L160 160 L100 190 L40 160 Z" fill="#E6E0F8" stroke="#1E1E24" strokeWidth="8" strokeLinejoin="round" />
      <path d="M55 85 L145 85 L145 150 L100 172 L55 150 Z" fill="#20B2AA" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M100 25 L108 50 L135 45 L120 65 L145 75 L115 85 L100 110 L85 85 L55 75 L80 65 L65 45 L92 50 Z" fill="#20B2AA" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M100 45 L105 60 L120 58 L110 70 L125 78 L105 85 L100 100 L95 85 L75 78 L90 70 L80 58 L95 60 Z" fill="#FFFFFF" />
      <path d="M140 100 Q160 80 170 90 L165 110 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M165 85 C175 75, 185 85, 175 95 C185 95, 185 105, 175 105 C180 115, 170 120, 160 110 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M60 110 Q40 130 45 150 L65 140 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M35 145 C25 155, 35 165, 45 165 C45 175, 55 175, 60 165 C70 170, 75 160, 65 150 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M80 165 L75 190 L95 190 L90 165 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M120 165 L125 190 L105 190 L110 165 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M70 190 L95 190 L95 200 L65 200 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <path d="M105 190 L130 190 L135 200 L105 200 Z" fill="#9F7FF7" stroke="#1E1E24" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="100" cy="115" r="45" fill="#20B2AA" stroke="#1E1E24" strokeWidth="8" />
      <circle cx="85" cy="110" r="5" fill="#1E1E24" /><circle cx="115" cy="110" r="5" fill="#1E1E24" />
      <circle cx="83" cy="108" r="1.5" fill="#FFFFFF" /><circle cx="113" cy="108" r="1.5" fill="#FFFFFF" />
      <path d="M95 118 Q100 125 105 118" fill="none" stroke="#1E1E24" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Shared .dot attribution footer used across the product family. */
export function DotFooter({ appName, navItems, onNavigate }: DotFooterProps) {
  return (
    <footer className="shrink-0 border-t border-slate-200/90 bg-white/95 backdrop-blur-sm px-4 sm:px-6 py-2.5 grid grid-cols-1 md:grid-cols-3 items-center justify-between gap-2.5 text-slate-500 text-xs shadow-2xs">
      <div className="flex items-center justify-center md:justify-start gap-2 order-2 md:order-1">
        <span className="font-semibold text-slate-700">{appName}</span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-500">© {new Date().getFullYear()} All rights reserved.</span>
      </div>
      <div className="flex items-center justify-center gap-2 order-1 md:order-2" aria-label="Presented by .dot">
        <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-slate-400">Presented by</span>
        <span className="flex items-center gap-1.5 text-[13px] font-black tracking-tight text-[#1E1E24]">
          <DotLogo size={22} /><span>.dot</span>
        </span>
      </div>
      <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center md:justify-end gap-x-4 gap-y-1 text-[11px] font-medium text-slate-600 order-3">
        {navItems.map((item) => (
          <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className="hover:text-indigo-600 transition-colors cursor-pointer">
            {item.label}
          </button>
        ))}
      </nav>
    </footer>
  );
}
