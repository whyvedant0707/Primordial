import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';
import { C, EASE, Kicker } from './shared';

const URL = 'https://harborlight-coop.org/visit';
const STEPS = Array.from({ length: URL.length }, (_, i) => i + 1);

export function Scene1() {
  const [n, setN] = useState(0);
  const [scan, setScan] = useState(false);
  useSceneTimer([
    ...STEPS.map((s) => ({ time: 500 + s * 32, callback: () => setN(s) })),
    { time: 1850, callback: () => setScan(true) },
  ]);
  return (
    <motion.section className="absolute inset-0 flex flex-col justify-center px-[9vw]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, delay: 0.25 } }} transition={{ duration: 0.5 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <Kicker>Primordial · Accessibility Copilot</Kicker>
      </motion.div>
      <h1 className="pf-serif mt-[2.5vmin] text-[11vmin] leading-[0.95]" style={{ color: C.ink }}>
        {['Every page has', 'barriers you', "can't see."].map((l, i) => (
          <span key={l} className="block overflow-hidden">
            <motion.span className="block" initial={{ y: '105%' }} animate={{ y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 + i * 0.12, ease: EASE }}>
              {i === 2 ? <em style={{ color: C.brand }}>{l}</em> : l}
            </motion.span>
          </span>
        ))}
      </h1>
      <motion.div className="relative mt-[5vmin] w-[62vw] flex items-center rounded-[1.4vmin] p-[0.9vmin] overflow-hidden"
        style={{ background: C.card, border: `0.25vmin solid ${C.line}`, boxShadow: '0 2vmin 5vmin -2vmin rgba(20,27,58,.18)' }}
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.35, ease: EASE }}>
        <span className="pf-mono flex-1 px-[2vmin] text-[2.6vmin]" style={{ color: C.ink }}>
          {URL.slice(0, n)}<motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} style={{ color: C.brand }}>|</motion.span>
        </span>
        <motion.span className="pf-sans rounded-[1vmin] px-[3vmin] py-[1.6vmin] text-[2.4vmin] font-medium"
          style={{ background: C.brand, color: C.card }}
          animate={scan ? { scale: [1, 0.94, 1] } : {}} transition={{ duration: 0.3 }}>
          {scan ? 'Scanning…' : 'Scan Website'}
        </motion.span>
        <motion.div className="absolute top-0 bottom-0 w-[8vw]"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(79,70,229,.28),transparent)' }}
          initial={{ x: '-10vw' }} animate={scan ? { x: ['-10vw', '70vw'] } : {}}
          transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.1 }} />
      </motion.div>
      <motion.p className="pf-mono mt-[2.5vmin] text-[1.9vmin]" style={{ color: C.ink3 }}
        initial={{ opacity: 0 }} animate={{ opacity: scan ? 1 : 0 }}>
        Validating URL → Launching browser → Loading website → Running checks
      </motion.p>
      <motion.div className="absolute inset-0 origin-left" style={{ background: C.brand }}
        initial={{ scaleX: 0 }} animate={{ scaleX: 0 }} exit={{ scaleX: 1, transition: { duration: 0.45, ease: EASE } }} />
    </motion.section>
  );
}
