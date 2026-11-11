import { motion } from 'framer-motion';
import { C, EASE, Kicker } from './shared';

const CHECKS = ['Is the alt text meaningful?', 'Is the focus order logical?', 'Is the content understandable?', 'What sits behind logins and interactions?'];

export function Scene5() {
  return (
    <motion.section className="absolute inset-0 flex items-center px-[7vw] gap-[6vw]" style={{ background: C.brandSoft }}
      initial={{ clipPath: 'inset(0 0 0 100%)' }} animate={{ clipPath: 'inset(0 0 0 0%)' }}
      exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.45, ease: EASE } }}
      transition={{ duration: 0.55, ease: EASE }}>
      <div className="w-[42vw]">
        <Kicker>05 · Human review</Kicker>
        <h2 className="pf-serif mt-[2vmin] text-[10vmin] leading-[0.92]" style={{ color: C.ink }}>
          {['Tools catch part.', 'People judge', 'the rest.'].map((l, i) => (
            <span key={l} className="block overflow-hidden">
              <motion.span className="block" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.7, delay: 0.3 + i * 0.15, ease: EASE }}>
                {i > 0 ? <em style={{ color: C.brand }}>{l}</em> : l}
              </motion.span>
            </span>
          ))}
        </h2>
      </div>
      <div className="flex-1 space-y-[1.6vmin]">
        {CHECKS.map((c, i) => (
          <motion.div key={c} className="flex items-center gap-[2vmin] rounded-[1.2vmin] px-[2.4vmin] py-[2vmin]"
            style={{ background: C.card, border: `0.2vmin solid ${C.line}` }}
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.6 + i * 0.6, ease: EASE }}>
            <motion.span className="grid place-items-center w-[3.4vmin] h-[3.4vmin] rounded-[0.7vmin] text-[2vmin]"
              style={{ border: `0.3vmin solid ${C.brand}`, color: C.card }}
              initial={{ background: 'rgba(79,70,229,0)' }} animate={{ background: 'rgba(79,70,229,1)' }}
              transition={{ duration: 0.2, delay: 1.0 + i * 0.6 }}>✓</motion.span>
            <span className="pf-sans text-[2.6vmin]" style={{ color: C.ink }}>{c}</span>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
