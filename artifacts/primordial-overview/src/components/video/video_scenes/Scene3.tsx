import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';
import { C, EASE, Kicker } from './shared';

const ADD = '+ <img src="hero.jpg" alt="Volunteers sorting produce at the co-op">';
const STEPS = Array.from({ length: Math.ceil(ADD.length / 2) }, (_, i) => (i + 1) * 2);

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [n, setN] = useState(0);
  useSceneTimer([
    { time: 900, callback: () => setPhase(1) },
    { time: 1800, callback: () => setPhase(2) },
    ...STEPS.map((s, i) => ({ time: 2000 + i * 26, callback: () => setN(s) })),
  ]);
  return (
    <motion.section className="absolute inset-0 flex items-center"
      style={{ background: C.ink }}
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ x: '-30vw', opacity: 0, transition: { duration: 0.5, ease: EASE } }}
      transition={{ duration: 0.6, ease: EASE }}>
      <div className="absolute left-[7vw] top-[13vh] w-[34vw]">
        <Kicker color="#a7a2ff">03 · Fix</Kicker>
        <h2 className="pf-serif mt-[1.5vmin] text-[8vmin] leading-[0.95]" style={{ color: C.paper }}>
          One element.<br /><em style={{ color: '#a7a2ff' }}>One correction.</em>
        </h2>
        <p className="pf-sans mt-[3vmin] text-[2.4vmin] leading-snug" style={{ color: '#b9bed8' }}>
          A fix is generated only when you ask, for the element you pick. Only its HTML and rule context are sent.
        </p>
      </div>
      <motion.div className="absolute right-[6vw] top-[15vh] w-[50vw] rounded-[1.6vmin] overflow-hidden"
        style={{ background: C.card, boxShadow: '0 3vmin 8vmin -2vmin rgba(0,0,0,.5)' }}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, delay: 0.2, ease: EASE }}>
        <div className="flex items-center gap-[1.5vmin] px-[2.5vmin] py-[1.8vmin]" style={{ borderBottom: `0.2vmin solid ${C.line}` }}>
          <span className="pf-mono rounded-[0.5vmin] px-[1vmin] py-[0.3vmin] text-[1.6vmin]" style={{ background: C.critical, color: C.card }}>critical</span>
          <span className="pf-mono text-[2.2vmin] font-medium" style={{ color: C.ink }}>image-alt</span>
          <span className="pf-sans ml-auto text-[1.7vmin]" style={{ color: C.ink3 }}>Images must have alternative text</span>
        </div>
        <div className="p-[2.5vmin] space-y-[2vmin]">
          <div className="pf-mono rounded-[0.8vmin] px-[2vmin] py-[1.4vmin] text-[2vmin]" style={{ background: '#fbecee', color: '#8c1d27' }}>
            - &lt;img src="hero.jpg"&gt;
          </div>
          <motion.div className="flex items-center gap-[1.5vmin]" animate={{ opacity: phase >= 1 ? 1 : 0.35 }}>
            <motion.span className="pf-sans rounded-[1vmin] px-[2.4vmin] py-[1.2vmin] text-[2vmin] font-medium"
              style={{ background: C.brand, color: C.card }}
              animate={phase === 1 ? { scale: [1, 0.93, 1.04, 1] } : {}} transition={{ duration: 0.5 }}>
              {phase >= 2 ? 'Suggestion ready' : phase === 1 ? 'Generating…' : 'Generate fix'}
            </motion.span>
            <span className="pf-mono text-[1.6vmin]" style={{ color: C.ink3 }}>AI provider or rule-based fallback when none is configured</span>
          </motion.div>
          <div className="pf-mono rounded-[0.8vmin] px-[2vmin] py-[1.4vmin] text-[2vmin] min-h-[7vmin]" style={{ background: '#e6f5ee', color: '#0d5b40', opacity: phase >= 2 ? 1 : 0 }}>
            {ADD.slice(0, n)}
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}
