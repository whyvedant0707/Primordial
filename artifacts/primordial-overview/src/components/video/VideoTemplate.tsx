import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { VideoCanvas, VideoPausedContext, type VideoAspectRatio, useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS = {
  hook: 4800,
  locate: 4800,
  fix: 5450,
  verify: 5350,
  human: 4800,
  close: 4800,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  hook: Scene1, locate: Scene2, fix: Scene3, verify: Scene4, human: Scene5, close: Scene6,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let ms = 0;
  for (const [k, d] of Object.entries(SCENE_DURATIONS)) { out[k] = ms / 1000; ms += d; }
  return out;
})();
const AUDIO_SEEK_EPSILON_SEC = 0.18;
// persistent progress rail: fraction per scene index
const RAIL = [0.12, 0.3, 0.5, 0.7, 0.88, 1];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    if (paused) { audio.pause(); return; }
    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const target = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - target) > AUDIO_SEEK_EPSILON_SEC) audio.currentTime = target;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className="pf-grain" style={{ backgroundColor: 'var(--color-bg-light)' }}>
        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
        <div className="absolute left-0 right-0 top-0 h-[0.7vmin] z-40" style={{ background: 'rgba(79,70,229,.12)' }}>
          <motion.div className="h-full origin-left" style={{ background: '#4f46e5' }}
            initial={false} animate={{ scaleX: sceneIndex >= 0 ? RAIL[sceneIndex] : 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`} preload="auto" autoPlay muted={muted} />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
