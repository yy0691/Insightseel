import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Clapperboard, Film, Folder, Video } from "lucide-react";

const fileCards = [
  {
    id: 1,
    name: "product-demo.mp4",
    icon: Video,
    duration: "12:47",
    initialX: -200,
    initialY: -100,
    startProgress: 0.2,
    endProgress: 0.6,
  },
  {
    id: 2,
    name: "webinar-snippet.mov",
    icon: Clapperboard,
    duration: "05:32",
    initialX: 220,
    initialY: -80,
    startProgress: 0.3,
    endProgress: 0.7,
  },
  {
    id: 3,
    name: "team-update.webm",
    icon: Film,
    duration: "08:15",
    initialX: -180,
    initialY: 120,
    startProgress: 0.4,
    endProgress: 0.8,
  },
];

export default function ScrollDragSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  return (
    <section ref={containerRef} className="relative min-h-[200vh] w-full bg-slate-50 py-24">
      {/* Sticky Scene Container */}
      <div className="sticky top-20 mx-auto flex h-[70vh] max-w-[1120px] items-center justify-center px-4">
        <div className="relative h-full w-full">
          {/* Central Workspace/Folder */}
          <CentralWorkspace scrollProgress={scrollYProgress} />

          {/* Floating File Cards */}
          {fileCards.map((file) => (
            <FileCard key={file.id} file={file} scrollProgress={scrollYProgress} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CentralWorkspace({ scrollProgress }: { scrollProgress: any }) {
  const scale = useTransform(scrollProgress, [0.3, 0.35, 0.4], [1, 1.03, 1]);
  const filesInQueue = useTransform(scrollProgress, [0, 0.6, 0.7, 0.8], [0, 0, 1, 3]);

  return (
    <motion.div
      style={{ scale }}
      className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
    >
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        {/* Header */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-medium text-slate-800">Insightseel Workspace</h3>
            </div>
            <motion.span className="text-xs text-slate-600">
              {filesInQueue.get() > 0 ? `${Math.round(filesInQueue.get())} videos in queue` : "Waiting for videos..."}
            </motion.span>
          </div>
        </div>

        {/* Drop Zone */}
        <div className="p-8">
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8">
            <Folder className="mb-3 h-12 w-12 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Drop videos here</p>
            <p className="mt-1 text-xs text-slate-500">Videos will be analyzed automatically</p>
          </div>

          {/* Queue List */}
          <div className="mt-4 space-y-2">
            {filesInQueue.get() >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <Video className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-slate-700">product-demo.mp4</span>
                <span className="ml-auto text-xs text-slate-500">12:47</span>
              </motion.div>
            )}
            {filesInQueue.get() >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <Clapperboard className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-slate-700">webinar-snippet.mov</span>
                <span className="ml-auto text-xs text-slate-500">05:32</span>
              </motion.div>
            )}
            {filesInQueue.get() >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <Film className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-slate-700">team-update.webm</span>
                <span className="ml-auto text-xs text-slate-500">08:15</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FileCard({ file, scrollProgress }: { file: any; scrollProgress: any }) {
  const Icon = file.icon;

  // Phase A: Floating (0 - startProgress)
  const floatY = useTransform(
    scrollProgress,
    [0, file.startProgress],
    [0, Math.sin(Date.now() / 1000) * 10]
  );
  const floatRotate = useTransform(scrollProgress, [0, file.startProgress], [-4, 4]);

  // Phase B: Dragging (startProgress - endProgress)
  const dragX = useTransform(scrollProgress, [file.startProgress, file.endProgress], [file.initialX, 0]);
  const dragY = useTransform(scrollProgress, [file.startProgress, file.endProgress], [file.initialY, 0]);
  const dragRotate = useTransform(scrollProgress, [file.startProgress, file.endProgress], [floatRotate.get(), 0]);
  const dragScale = useTransform(scrollProgress, [file.startProgress, file.endProgress], [1, 0.9]);

  // Phase C: In Queue (endProgress - 1)
  const queueScale = useTransform(scrollProgress, [file.endProgress, 1], [0.9, 0.92]);
  const opacity = useTransform(scrollProgress, [file.endProgress, file.endProgress + 0.1], [1, 0]);

  return (
    <motion.div
      style={{
        x: dragX,
        y: dragY,
        rotate: scrollProgress.get() < file.startProgress ? floatRotate : dragRotate,
        scale: scrollProgress.get() < file.endProgress ? dragScale : queueScale,
        opacity,
      }}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="flex w-48 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.1)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
          <Icon className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-xs font-medium text-slate-800">{file.name}</p>
          <p className="text-[11px] text-slate-500">{file.duration}</p>
        </div>
      </div>
    </motion.div>
  );
}
