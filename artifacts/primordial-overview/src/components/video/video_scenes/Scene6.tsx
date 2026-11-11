import { motion } from 'framer-motion';
import { C, EASE } from './shared';

const RAIL = ['Scan', 'Locate', 'Fix', 'Verify', 'Review'];

export function Scene6() {
  return (
    <motion.section className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ background: C.paper }}
      initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }} transition={{ duration: 0.8, ease: EASE }}>
      <motion.div className="grid place-items-center w-[11vmin] h-[11vmin] rounded-[2.4vmin]" style={{ background: C.brand }}
        initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: EASE }}>
        <svg viewBox="0 0 24 24" className="w-[6vmin] h-[6vmin]" fill="none" stroke={C.card} strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="6" /><path d="M20 20l-4.3-4.3" /><path d="M8.5 11h5M11 8.5v5" />
        </svg>
      </motion.div>
      <motion.h1 className="pf-serif mt-[3vmin] text-[16vmin] leading-none" style={{ color: C.ink }}
        initial={{ opacity: 0, y: 30, letterSpacing: '0.08em' }} animate={{ opacity: 1, y: 0, letterSpacing: '-0.01em' }}
        transition={{ duration: 1, delay: 0.35, ease: EASE }}>Primordial</motion.h1>
      <motion.p className="pf-sans mt-[1vmin] text-[3.4vmin] font-medium" style={{ color: C.brand }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>Accessibility Copilot</motion.p>
      <div className="mt-[4.5vmin] flex items-center gap-[1.5vmin]">
        {RAIL.map((r, i) => (
          <motion.span key={r} className="flex items-center gap-[1.5vmin]"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.15, duration: 0.4, ease: EASE }}>
            <span className="pf-mono text-[2.2vmin] rounded-full px-[2vmin] py-[0.8vmin]" style={{ background: C.brandSoft, color: C.ink }}>{r}</span>
            {i < RAIL.length - 1 && <span className="w-[3vmin] h-[0.25vmin]" style={{ background: C.line }} />}
          </motion.span>
        ))}
      </div>
      <motion.p className="pf-sans mt-[5vmin] text-[2.2vmin]" style={{ color: C.ink2 }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 0.6 }}>
        Guidance for engineers — not a guarantee of accessibility compliance.
      </motion.p>
    </motion.section>
  );
}
