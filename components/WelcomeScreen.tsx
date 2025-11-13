import React, { useRef } from "react";
import { User } from "@supabase/supabase-js";
import { motion, useScroll, useTransform } from "framer-motion";
import { Clapperboard, Film, Folder, Video } from "lucide-react";

interface WelcomeScreenProps {
  onImportFiles: (files: FileList) => void;
  onImportFolderSelection: (files: FileList) => void;
  onLogin: () => void;
  onRegister: () => void;
  onOpenAccount?: () => void;
  currentUser?: User | null;
}

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

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onImportFiles,
  onImportFolderSelection,
  onLogin,
  onRegister,
  onOpenAccount,
  currentUser,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImportFiles(event.target.files);
    }
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImportFolderSelection(event.target.files);
      event.target.value = "";
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full px-4 py-4">
        <div className="mx-auto max-w-[1120px]">
          <div className="flex items-center justify-between rounded-full border border-slate-200/50 bg-white/80 px-6 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                <span className="text-sm font-semibold text-white">I</span>
              </div>
              <span className="text-sm font-medium text-slate-800">insightseel</span>
            </div>

            <div className="flex items-center gap-3">
              {currentUser ? (
                <button
                  onClick={onOpenAccount}
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-lg transition hover:bg-white"
                >
                  {currentUser.email || "Account"}
                </button>
              ) : (
                <>
                  <button
                    onClick={onLogin}
                    className="hidden rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-xl transition hover:bg-white sm:block"
                  >
                    登录
                  </button>
                  <button
                    onClick={onRegister}
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:bg-emerald-700"
                  >
                    注册
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full px-4 py-16 md:py-24">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5">
              <span className="text-xs font-medium text-emerald-700">AI-powered analytics</span>
            </div>
            <h1 className="mb-4 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
              Transform Your Data Into
              <br />
              Actionable Insights
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              Insightseel helps teams make data-driven decisions with AI-powered analytics.
              Upload your data, get instant insights, and watch your business grow.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:bg-emerald-700"
              >
                Try insightseel
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
              >
                Import Folder
              </button>
            </div>
          </div>

          {/* Hidden file inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,.srt,.vtt"
            multiple
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderChange}
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            multiple
          />
        </div>
      </section>

      {/* Scroll Drag Animation Section */}
      <section ref={containerRef} className="relative min-h-[200vh] w-full bg-slate-50 py-24">
        <div className="sticky top-20 mx-auto flex h-[70vh] max-w-[1120px] items-center justify-center px-4">
          <div className="relative h-full w-full">
            <CentralWorkspace scrollProgress={scrollYProgress} />
            {fileCards.map((file) => (
              <FileCard key={file.id} file={file} scrollProgress={scrollYProgress} />
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative w-full px-4 py-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-8">
                <p className="text-xs uppercase tracking-[0.36em] text-slate-500">多引擎</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  智能路由驱动的字幕、分析与翻译能力
                </p>
              </div>
              <div className="p-8">
                <p className="text-xs uppercase tracking-[0.36em] text-slate-500">批量</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  文件夹导入、多任务并发与进度可视化
                </p>
              </div>
              <div className="p-8">
                <p className="text-xs uppercase tracking-[0.36em] text-slate-500">云同步</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  自动同步字幕、分析与聊天记录至云端
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

function CentralWorkspace({ scrollProgress }: { scrollProgress: any }) {
  const scale = useTransform(scrollProgress, [0.3, 0.35, 0.4], [1, 1.03, 1]);
  const filesInQueue = useTransform(scrollProgress, [0, 0.6, 0.7, 0.8], [0, 0, 1, 3]);

  return (
    <motion.div
      style={{ scale }}
      className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
    >
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
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

        <div className="p-8">
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8">
            <Folder className="mb-3 h-12 w-12 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Drop videos here</p>
            <p className="mt-1 text-xs text-slate-500">Videos will be analyzed automatically</p>
          </div>

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

  const floatY = useTransform(
    scrollProgress,
    [0, file.startProgress],
    [0, Math.sin(Date.now() / 1000) * 10]
  );
  const floatRotate = useTransform(scrollProgress, [0, file.startProgress], [-4, 4]);

  const dragX = useTransform(scrollProgress, [file.startProgress, file.endProgress], [file.initialX, 0]);
  const dragY = useTransform(scrollProgress, [file.startProgress, file.endProgress], [file.initialY, 0]);
  const dragRotate = useTransform(scrollProgress, [file.startProgress, file.endProgress], [floatRotate.get(), 0]);
  const dragScale = useTransform(scrollProgress, [file.startProgress, file.endProgress], [1, 0.9]);

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

export default WelcomeScreen;