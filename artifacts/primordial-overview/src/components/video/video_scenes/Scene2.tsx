import { motion } from 'framer-motion';
import { C, EASE, Kicker, PageMock } from './shared';

const BOXES = [
  { l: '56%', t: '22%', w: '38%', h: '45%', c: C.critical, tag: 'critical' },
  { l: '5%', t: '24%', w: '50%', h: '24%', c: C.moderate, tag: 'moderate' },
  { l: '4%', t: '60%', w: '20%', h: '11%', c: C.serious, tag: 'serious' },
  { l: '4%', t: '78%', w: '92%', h: '16%', c: C.minor, tag: 'minor' },
];
const RULES = [
  ['image-alt', 'critical', C.critical, '1 node'],
  ['color-contrast', 'serious', C.serious, '6 nodes'],
  ['heading-order', 'moderate', C.moderate, '2 nodes'],
  ['region', 'minor', C.minor, '3 nodes'],
];

export function Scene2() {
  return (
    <motion.section className="absolute inset-0"
      initial={{ clipPath: 'inset(0 0 0 100%)' }} animate={{ clipPath: 'inset(0 0 0 0%)' }}
      exit={{ scale: 1.6, opacity: 0, transition: { duration: 0.5, ease: EASE } }}
      transition={{ duration: 0.55, ease: EASE }} style={{ background: C.paper, transformOrigin: '42% 40%' }}>
      <div className="absolute left-[6vw] top-[14vh] w-[52vw] h-[72vh]">
        <PageMock />
        {BOXES.map((b, i) => (
          <motion.div key={b.tag} className="absolute rounded-[0.6vmin]"
            style={{ left: b.l, top: b.t, width: b.w, height: b.h, border: `0.45vmin solid ${b.c}`, background: `${b.c}14` }}
            initial={{ opacity: 0, scale: 1.25 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.6, ease: EASE }}>
            <span className="pf-mono absolute -top-[3.2vmin] left-0 px-[0.8vmin] py-[0.2vmin] text-[1.5vmin] rounded-[0.4vmin]"
              style={{ background: b.c, color: C.card }}>{b.tag}</span>
          </motion.div>
        ))}
        <motion.div className="absolute left-0 right-0 h-[0.5vmin]" style={{ background: C.brand, boxShadow: `0 0 0 0.3vmin ${C.brandSoft}` }}
          initial={{ top: '0%', opacity: 1 }} animate={{ top: '100%', opacity: [1, 1, 0] }} transition={{ duration: 2.6, ease: 'linear' }} />
      </div>
      <div className="absolute right-[6vw] top-[14vh] w-[30vw]">
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2, ease: EASE }}>
          <Kicker>02 · Locate</Kicker>
          <h2 className="pf-serif mt-[1.5vmin] text-[7.5vmin] leading-[0.95]" style={{ color: C.ink }}>See exactly <em style={{ color: C.brand }}>which element</em> fails.</h2>
          <p className="pf-mono mt-[1.5vmin] text-[1.7vmin]" style={{ color: C.ink3 }}>Axe-core · WCAG 2.0 / 2.1 A + AA</p>
        </motion.div>
        <div className="mt-[3vmin] space-y-[1.2vmin]">
          {RULES.map(([id, imp, c, n], i) => (
            <motion.div key={id} className="flex items-center gap-[1.5vmin] rounded-[1vmin] px-[1.8vmin] py-[1.3vmin]"
              style={{ background: C.card, border: `0.2vmin solid ${C.line}` }}
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.65 + i * 0.6, ease: EASE }}>
              <span className="w-[1.4vmin] h-[1.4vmin] rounded-full" style={{ background: c }} />
              <span className="pf-mono flex-1 text-[2.1vmin] font-medium" style={{ color: C.ink }}>{id}</span>
              <span className="pf-sans text-[1.7vmin]" style={{ color: C.ink2 }}>{imp} · {n}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
