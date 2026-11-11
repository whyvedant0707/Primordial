import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';
import { C, EASE, Kicker, PageMock } from './shared';

const RUN = ['Clone element in memory', 'Apply patch to copy', 'Re-run Axe-core rule', 'Compare result'];

export function Scene4() {
  const [step, setStep] = useState(0);
  useSceneTimer([
    ...RUN.map((_, i) => ({ time: 700 + i * 600, callback: () => setStep(i + 1) })),
    { time: 3300, callback: () => setStep(5) },
  ]);
  const verified = step >= 5;
  return (
    <motion.section className="absolute inset-0" style={{ background: C.paper }}
      initial={{ x: '40vw', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ clipPath: 'inset(0 100% 0 0)', transition: { duration: 0.5, ease: EASE } }}
      transition={{ duration: 0.6, ease: EASE }}>
      <div className="absolute left-[6vw] top-[12vh]">
        <Kicker>04 · Verify</Kicker>
        <h2 className="pf-serif mt-[1.2vmin] text-[7.5vmin] leading-none" style={{ color: C.ink }}>
          Tested in a copy. <em style={{ color: C.brand }}>Never on your site.</em>
        </h2>
      </div>
      {/* live site — untouched */}
      <div className="absolute left-[6vw] top-[34vh] w-[30vw] h-[48vh]">
        <div className="absolute inset-0 scale-[0.9] origin-top-left opacity-60"><PageMock /></div>
        <span className="pf-mono absolute -bottom-[1vmin] left-0 text-[1.8vmin]" style={{ color: C.ink2 }}>
          Live site · <b style={{ color: C.ink }}>untouched</b>
        </span>
      </div>
      {/* sandbox */}
      <motion.div className="absolute right-[6vw] top-[32vh] w-[52vw] h-[54vh] rounded-[1.6vmin] p-[3vmin]"
        style={{ border: `0.35vmin dashed ${C.brand}`, background: C.brandSoft }}
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, delay: 0.3, ease: EASE }}>
        <p className="pf-mono text-[1.7vmin] uppercase tracking-[0.15em]" style={{ color: C.brand }}>Isolated in-memory copy</p>
        <div className="mt-[2.5vmin] space-y-[1.6vmin]">
          {RUN.map((r, i) => (
            <motion.div key={r} className="flex items-center gap-[1.6vmin]" animate={{ opacity: step > i ? 1 : 0.3 }}>
              <motion.span className="grid place-items-center w-[3vmin] h-[3vmin] rounded-full text-[1.7vmin] pf-mono"
                animate={{ background: step > i ? C.brand : '#d9dcf5', scale: step === i + 1 ? [1, 1.25, 1] : 1 }}
                style={{ color: C.card }} transition={{ duration: 0.35 }}>{step > i ? '✓' : i + 1}</motion.span>
              <span className="pf-sans text-[2.4vmin]" style={{ color: C.ink }}>{r}</span>
            </motion.div>
          ))}
        </div>
        <motion.div className="absolute left-[3vmin] right-[3vmin] bottom-[3vmin] flex items-center justify-between rounded-[1.2vmin] px-[2.5vmin] py-[2vmin]"
          style={{ background: C.card, border: `0.25vmin solid ${verified ? C.ok : C.line}` }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 20 }} transition={{ duration: 0.4, ease: EASE }}>
          <span className="pf-mono text-[2vmin]" style={{ color: C.ink2 }}>image-alt</span>
          <motion.span className="pf-sans text-[2.8vmin] font-semibold" style={{ color: verified ? C.ok : C.ink3 }}
            animate={verified ? { scale: [0.8, 1.08, 1] } : {}} transition={{ duration: 0.45, ease: EASE }}>
            {verified ? 'Verified in simulation' : 'Checking…'}
          </motion.span>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
