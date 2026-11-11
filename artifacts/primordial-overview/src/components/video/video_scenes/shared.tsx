export const EASE = [0.22, 1, 0.36, 1] as const;
export const C = {
  paper: '#f5f6fa',
  card: '#fdfdff',
  ink: '#141b3a',
  ink2: '#45507a',
  ink3: '#596386',
  line: '#e2e5ef',
  brand: '#4f46e5',
  brandSoft: '#eef0fd',
  critical: '#d92d3a',
  serious: '#e8751a',
  moderate: '#e3b11c',
  minor: '#2f7fe0',
  ok: '#13875f',
};

/** Stylised, non-interactive web page used as the audited subject. */
export function PageMock({ dim = 0 }: { dim?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[1.4vmin]" style={{ background: C.card, border: `0.2vmin solid ${C.line}` }}>
      <div className="flex items-center gap-[0.8vmin] px-[2vmin] h-[5vmin]" style={{ borderBottom: `0.2vmin solid ${C.line}` }}>
        {[0, 1, 2].map((i) => <span key={i} className="w-[1.1vmin] h-[1.1vmin] rounded-full" style={{ background: C.line }} />)}
        <span className="pf-mono ml-[2vmin] text-[1.6vmin]" style={{ color: C.ink3 }}>harborlight-coop.org/visit</span>
      </div>
      <div className="p-[3vmin] grid grid-cols-[1.2fr_1fr] gap-[3vmin]" style={{ opacity: 1 - dim }}>
        <div>
          <div className="h-[2vmin] w-[40%] rounded" style={{ background: '#c9cde0' }} />
          <div className="mt-[2vmin] h-[4.2vmin] w-[90%] rounded" style={{ background: C.ink }} />
          <div className="mt-[1.2vmin] h-[4.2vmin] w-[70%] rounded" style={{ background: C.ink }} />
          <div className="mt-[2.4vmin] space-y-[1vmin]">
            {[95, 88, 92, 60].map((w, i) => <div key={i} className="h-[1.2vmin] rounded" style={{ width: `${w}%`, background: '#dfe2ee' }} />)}
          </div>
          <div className="mt-[3vmin] flex gap-[1.5vmin]">
            <div className="h-[5vmin] w-[16vmin] rounded-[0.8vmin]" style={{ background: '#b8bcd6' }} />
            <div className="h-[5vmin] w-[12vmin] rounded-[0.8vmin]" style={{ border: `0.25vmin solid #d7dae8` }} />
          </div>
        </div>
        <div className="rounded-[1vmin] h-[24vmin]" style={{ background: 'linear-gradient(135deg,#c7c3f6,#f3d6c4)' }} />
        <div className="col-span-2 grid grid-cols-3 gap-[2vmin]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[0.8vmin] p-[1.5vmin]" style={{ background: C.paper }}>
              <div className="h-[1.4vmin] w-[60%] rounded" style={{ background: '#cfd3e4' }} />
              <div className="mt-[1vmin] h-[1vmin] w-[85%] rounded" style={{ background: '#e4e6f0' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Kicker({ children, color = C.brand }: { children: string; color?: string }) {
  return <p className="pf-mono uppercase tracking-[0.2em] text-[1.9vmin] font-medium" style={{ color }}>{children}</p>;
}
