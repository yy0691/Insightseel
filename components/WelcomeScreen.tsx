import React, { useRef, useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { motion, useScroll, useTransform, useAnimation, useMotionValue, animate } from "framer-motion";
import {
  Folder,
  Sparkles,
  LineChart,
  Users,
  Layers,
  CheckCircle2,
  FileText,
  Brain,
  Subtitles,
  Mic,
  Scissors,
  User as UserIcon,
  MessageSquare,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

// 统一的视频图标组件
const VideoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || "h-5 w-5"}
  >
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
);

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
    icon: VideoIcon,
    duration: "12:47",
    initialX: -200,
    initialY: 120,
    startProgress: 0.2,
    endProgress: 0.6,
  },
  {
    id: 2,
    name: "webinar-snippet.mov",
    icon: VideoIcon,
    duration: "05:32",
    initialX: 220,
    initialY: 100,
    startProgress: 0.3,
    endProgress: 0.7,
  },
  {
    id: 3,
    name: "team-update.webm",
    icon: VideoIcon,
    duration: "08:15",
    initialX: -180,
    initialY: 180,
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
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Rotating words for title
  const rotatingWords = ["数据", "语音", "内容", "场景", "情绪", "洞察"];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
      <nav className="sticky top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex max-w-[1120px] justify-center">
          <div className="flex w-full max-w-[720px] items-center justify-between rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-md">
            {/* 左侧 logo */}
            <a href="#" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white">
                <VideoIcon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-slate-800">
                insightseel
              </span>
            </a>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-2 text-xs">
              {currentUser ? (
                <button
                  onClick={onOpenAccount}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {currentUser.email || t("account")}
                </button>
              ) : (
                <>
                  <button
                    onClick={onLogin}
                    className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:inline-flex"
                  >
                    {t("signIn")}
                  </button>
                  <button
                    onClick={onRegister}
                    className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    {t("signUp")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full px-4 py-14 md:py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-700">
                {t("welcomeBadge")}
              </span>
            </div>
            <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
              {t("welcomeHeroTitle")}
              <br />
              {t("welcomeHeroTitleLine2")}
              <span className="ml-2 inline-block">
                <motion.span
                  key={currentWordIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="rounded-md bg-emerald-50 px-2 py-0.5 text-sm text-emerald-700"
                >
                  {rotatingWords[currentWordIndex]}
                </motion.span>
              </span>
            </h1>
            <p className="mx-auto mb-7 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
              {t("welcomeHeroDescription")}
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                {t("welcomeTryButton")}
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t("welcomeImportFolderButton")}
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

        {/* Hero Preview Card */}
        <HeroPreviewCard />
      </section>

      {/* Scroll Drag Animation Section */}
      <section ref={containerRef} className="relative min-h-[200vh] w-full bg-gradient-to-b from-slate-50 via-slate-50 to-white py-24 overflow-hidden">
        {/* Background decorative elements with drift animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-100/20 rounded-full blur-3xl"
            animate={{
              x: [0, 30, 0],
              y: [0, -20, 0],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div 
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-100/20 rounded-full blur-3xl"
            animate={{
              x: [0, -40, 0],
              y: [0, 30, 0],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          {/* Semantic flow line */}
          <motion.div
            className="absolute top-0 right-0 w-full h-full"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <motion.path
                d="M 1000 0 Q 500 500 0 1000"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="2"
                fill="none"
                animate={{
                  pathLength: [0, 1],
                  opacity: [0.05, 0.15, 0.05],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </svg>
          </motion.div>
        </div>
        
        <div className="sticky top-20 mx-auto flex h-[70vh] max-w-[1120px] items-center justify-center px-4 relative z-10">
          <div className="relative h-full w-full">
            <ParallaxBackground scrollProgress={scrollYProgress} />
            <VideoWaveBackground progress={scrollYProgress} />
            <DynamicParticles />
            <SceneTransitionLine progress={scrollYProgress} />
            <AIScannerBeam progress={scrollYProgress} />
            <VideoScanParticles progress={scrollYProgress} />
            <FloatingAIHints progress={scrollYProgress} />
            <VideoTimeline progress={scrollYProgress} />
            <WaveformStrip progress={scrollYProgress} />
            <SceneCutFlash progress={scrollYProgress} />
            <FloatingStickers progress={scrollYProgress} />
            {fileCards.map((file) => (
              <FileCard key={file.id} file={file} scrollProgress={scrollYProgress} />
            ))}
            <CentralWorkspace scrollProgress={scrollYProgress} />
            <VideoFrameBand scrollProgress={scrollYProgress} />
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      <FeatureSectionOne />
      <FeatureSectionTwo />

      {/* Bottom CTA */}
      <BottomCTA />

      {/* Footer */}
      <Footer />

    </div>
  );
};

function CentralWorkspace({ scrollProgress }: { scrollProgress: any }) {
  const { t } = useLanguage();
  const scale = useTransform(scrollProgress, [0.3, 0.35, 0.4], [1, 1.02, 1]);
  const filesInQueue = useTransform(
    scrollProgress,
    [0, 0.6, 0.7, 0.8],
    [0, 0, 1, 3]
  );
  const dropZoneOpacity = useTransform(scrollProgress, [0.5, 0.65], [0.4, 1]);
  const dropZoneScale = useTransform(scrollProgress, [0.5, 0.65], [0.98, 1]);

  // Easter egg: show message after 3 seconds
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEasterEgg(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 应用特征标签
  const featureTags = [
    "自动识别关键片段",
    "多轨道语音解析",
    "说话人分离与聚类",
    "自动生成内容摘要",
    "支持长视频批量分析",
  ];

  return (
    <motion.div
      style={{ scale }}
      className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-slate-500" />
              <h3 className="text-xs font-medium text-slate-800">
                {t("welcomeWorkspaceTitle")}
              </h3>
            </div>
            <motion.span className="text-[11px] text-slate-500">
              {filesInQueue.get() > 0
                ? t("welcomeVideosInQueue", Math.round(filesInQueue.get()))
                : t("welcomeWaitingForVideos")}
            </motion.span>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* Drop zone */}
          <motion.div
            style={{
              opacity: dropZoneOpacity,
              scale: dropZoneScale,
            }}
            className="relative flex min-h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8"
          >
            <Folder className="mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">
              {t("welcomeDropVideosHere")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("welcomeVideosAnalyzedAuto")}
            </p>

            {/* 应用特征标签 */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {featureTags.map((tag, i) => (
                <motion.span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] text-slate-600 shadow-sm"
                  animate={{
                    y: [0, -2, 0],
                    opacity: [0.9, 1, 0.9],
                  }}
                  transition={{
                    duration: 3 + i * 0.3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Sparkles className="mr-1.5 h-3 w-3 text-emerald-500" />
                  {tag}
                </motion.span>
              ))}
            </div>

            {showEasterEgg && scrollProgress.get() < 0.3 && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0, 0.6, 0], y: [4, 0, 0] }}
                transition={{
                  duration: 4,
                  times: [0, 0.5, 1],
                  ease: "easeInOut",
                }}
                className="mt-3 text-xs italic text-emerald-600/70"
              >
                把视频给我，让我试试看？
              </motion.p>
            )}
          </motion.div>

          {/* Queue list – simplified */}
          <div className="mt-4 space-y-1.5">
            {filesInQueue.get() >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
              >
                <VideoIcon className="h-4 w-4 text-slate-500" />
                <span className="text-xs text-slate-700">product-demo.mp4</span>
                <span className="ml-auto text-xs text-slate-500">12:47</span>
              </motion.div>
            )}
            {filesInQueue.get() >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
              >
                <VideoIcon className="h-4 w-4 text-slate-500" />
                <span className="text-xs text-slate-700">
                  webinar-snippet.mov
                </span>
                <span className="ml-auto text-xs text-slate-500">05:32</span>
              </motion.div>
            )}
            {filesInQueue.get() >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
              >
                <VideoIcon className="h-4 w-4 text-slate-500" />
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

interface FileCardProps {
  file: {
    id: number;
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    duration: string;
    initialX: number;
    initialY: number;
    startProgress: number;
    endProgress: number;
  };
  scrollProgress: any;
}

const FileCard: React.FC<FileCardProps> = ({ file, scrollProgress }) => {
  const Icon = file.icon;
  const controls = useAnimation();

  // Continuous floating animation when idle (收敛一点即可)
  useEffect(() => {
    controls.start({
      y: [0, -6, 0],
      rotate: [-0.5, 0.5, -0.5],
      transition: {
        duration: 3 + file.id * 0.4,
        repeat: Infinity,
        ease: "easeInOut",
      },
    });
  }, [controls, file.id]);

  // 磁吸效果：使用 easeOutBack 实现弹性吸附
  const attract = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress],
    [0, 1]
  );

  const dragX = useTransform(
    attract,
    (a) => file.initialX * (1 - a) + 0 * a
  );
  const dragY = useTransform(
    attract,
    (a) => file.initialY * (1 - a) + 0 * a
  );
  const dragRotate = useTransform(
    attract,
    [0, 1],
    [-3, 0]
  );
  
  // 抵达瞬间的反馈动画
  const impact = useTransform(
    scrollProgress,
    [file.endProgress - 0.05, file.endProgress],
    [0, 1]
  );
  
  const dragScale = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress - 0.05, file.endProgress],
    [1, 0.96, 0.9]
  );
  
  const glow = useTransform(
    impact,
    [0, 1],
    [0, 0.35]
  );

  const queueScale = useTransform(
    scrollProgress,
    [file.endProgress, 1],
    [0.94, 0.96]
  );
  const opacity = useTransform(
    scrollProgress,
    [file.endProgress, file.endProgress + 0.1],
    [1, 0]
  );
  
  // 组合缩放效果：在拖拽阶段使用 dragScale，进入队列后使用 queueScale
  const [currentScale, setCurrentScale] = useState(1);
  const [currentGlow, setCurrentGlow] = useState(0);

  useEffect(() => {
    const unsubscribeScale = scrollProgress.on('change', (latest) => {
      if (latest < file.endProgress) {
        setCurrentScale(dragScale.get());
      } else {
        setCurrentScale(queueScale.get());
      }
    });
    
    const unsubscribeGlow = impact.on('change', (value) => {
      setCurrentGlow(value);
    });
    
    return () => {
      unsubscribeScale();
      unsubscribeGlow();
    };
  }, [scrollProgress, dragScale, queueScale, impact, file.endProgress]);

  return (
    <motion.div
      animate={scrollProgress.get() < file.startProgress ? controls : undefined}
      style={{
        x: dragX,
        y: dragY,
        rotate: scrollProgress.get() >= file.startProgress ? dragRotate : undefined,
        scale: currentScale,
        opacity,
        boxShadow: currentGlow > 0 
          ? `0 0 ${20 * currentGlow}px rgba(20,184,166,${currentGlow})`
          : undefined,
      }}
      transition={
        scrollProgress.get() >= file.startProgress && scrollProgress.get() < file.endProgress
          ? {
              type: "spring",
              stiffness: 180,
              damping: 15,
            }
          : undefined
      }
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="flex w-48 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-xs font-medium text-slate-800">
            {file.name}
          </p>
          <p className="text-[11px] text-slate-500">{file.duration}</p>
        </div>
      </div>
    </motion.div>
  );
};

// Visual Enhancement Components
function ParallaxBackground({ scrollProgress }: { scrollProgress: any }) {
  const backgroundShift = useTransform(scrollProgress, [0, 1], [0, 200]);

  return (
    <motion.div
      style={{
        y: backgroundShift,
      }}
      className="absolute inset-0 bg-teal-100/50 rounded-3xl"
    />
  );
}

function VideoWaveBackground({ progress }: { progress: any }) {
  const waveY = useTransform(progress, [0, 1], [0, 50]);
  const waveX = useTransform(progress, [0, 1], [0, 100]);
  
  return (
    <motion.div
      style={{ y: waveY, x: waveX }}
      className="absolute inset-0 bg-gradient-to-b from-teal-300 via-teal-100 to-slate-100 opacity-60 blur-3xl rounded-3xl"
    />
  );
}

function DynamicParticles() {
  const particleCount = 20;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {new Array(particleCount).fill(0).map((_, i) => {
        const startX = Math.random() * 100;
        const driftX = (Math.random() - 0.5) * 15;
        const duration = 8 + Math.random() * 6;
        const delay = Math.random() * 3;
        const size = Math.random() * 1.2 + 0.4;

        return (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              y: "100%", 
              x: `${startX}%`, 
            }}
            animate={{
              y: ["100%", "-40%"],
              x: [`${startX}%`, `${startX + driftX}%`],
              opacity: [0, 0.08, 0],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute rounded-full bg-white"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              filter: "blur(2px)",
            }}
          />
        );
      })}
    </div>
  );
}

function SceneTransitionLine({ progress }: { progress: any }) {
  const opacity = useTransform(progress, [0.4, 0.6], [0, 1]);

  return (
    <motion.div
      style={{ opacity }}
      animate={{
        y: ["-10%", "120%"],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="pointer-events-none absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-transparent via-teal-400/40 to-transparent"
    />
  );
}

function AIScannerBeam({ progress }: { progress: any }) {
  const opacity = useTransform(progress, [0.5, 0.7], [0, 0.35]);
  const scanY = useMotionValue(0);
  
  useEffect(() => {
    const controls = animate(scanY, 120, {
      duration: 4,
      repeat: Infinity,
      repeatDelay: 1,
      ease: "linear",
    });
    return () => controls.stop();
  }, [scanY]);
  
  return (
    <motion.div
      style={{ 
        opacity,
        y: scanY,
      }}
      className="pointer-events-none absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent blur-xl"
    />
  );
}

function VideoScanParticles({ progress }: { progress: any }) {
  const scanOpacity = useTransform(progress, [0.45, 0.75], [0, 0.35]);
  const particleCount = 32;

  return (
    <motion.div
      style={{ opacity: scanOpacity }}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {new Array(particleCount).fill(0).map((_, i) => {
        const startX = Math.random() * 100;
        const driftX = (Math.random() - 0.5) * 12;
        const duration = 3 + Math.random() * 3;
        const delay = Math.random() * 2;
        const size = Math.random() * 1.4 + 0.4;

        return (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              y: "60%", 
              x: `${startX}%`, 
              scale: 1 
            }}
            animate={{
              y: ["60%", "-30%"],
              x: [`${startX}%`, `${startX + driftX}%`],
              opacity: [0, 0.15, 0],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute rounded-full bg-white"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              filter: "blur(2px)",
            }}
          />
        );
      })}
    </motion.div>
  );
}

const HINTS = [
  "自动字幕生成",
  "关键时刻提取",
  "语音识别",
  "画面分析",
  "AI 内容摘要",
];

function FloatingAIHints({ progress }: { progress: any }) {
  const baseOpacity = useTransform(progress, [0.4, 0.6], [0, 0.7]);
  
  return (
    <div className="pointer-events-none absolute inset-0">
      {HINTS.map((hint, i) => (
        <motion.div
          key={i}
          style={{ 
            opacity: baseOpacity,
            translateX: `${-50 + (i - 2) * 60}px`,
            translateY: `${-120 + (i % 3) * 40}px`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: 6 + i,
            repeat: Infinity,
            delay: i * 0.4,
            ease: "easeInOut",
          }}
          className="absolute left-1/2 top-1/2 rounded-full border border-teal-300/40 bg-white/60 px-3 py-1 text-[10px] text-teal-700 shadow-sm backdrop-blur"
        >
          {hint}
        </motion.div>
      ))}
    </div>
  );
}

function VideoFrameBand({ scrollProgress }: { scrollProgress: any }) {
  const trigger = useTransform(scrollProgress, [0.55, 0.6], [0, 1]);
  const opacity = useTransform(trigger, [0, 1], [0, 1]);
  const y = useTransform(trigger, [0, 1], [10, 0]);
  
  return (
    <motion.div
      style={{ opacity, y }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="absolute left-1/2 top-[60%] flex -translate-x-1/2 gap-1 rounded-xl bg-white/80 p-2 shadow-md backdrop-blur"
    >
      {new Array(8).fill(0).map((_, i) => (
        <div
          key={i}
          className="h-10 w-14 rounded-md bg-slate-200/70"
        />
      ))}
    </motion.div>
  );
}

function VideoTimeline({ progress }: { progress: any }) {
  const x = useTransform(progress, [0, 1], ["0%", "-40%"]);

  return (
    <motion.div
      style={{ x }}
      className="pointer-events-none absolute bottom-[14%] left-1/2 w-[140%] -translate-x-1/2 opacity-40"
    >
      <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300 rounded-full" />

      {/* 小刻度 */}
      <div className="mt-1 flex justify-between text-[8px] text-slate-400">
        <span>0:00</span>
        <span>0:10</span>
        <span>0:20</span>
        <span>0:30</span>
      </div>
    </motion.div>
  );
}

function WaveformStrip({ progress }: { progress: any }) {
  const opacity = useTransform(progress, [0.4, 0.6], [0, 0.6]);

  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none absolute top-[18%] left-1/2 flex -translate-x-1/2 gap-[2px]"
    >
      {new Array(80).fill(0).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            height: [6, 12, 6],
          }}
          transition={{
            duration: 1.4 + i * 0.01,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-[2px] rounded-full bg-teal-400/40"
        />
      ))}
    </motion.div>
  );
}

function SceneCutFlash({ progress }: { progress: any }) {
  const opacity = useTransform(progress, [0.3, 0.5], [0, 0.28]);

  return (
    <motion.div
      style={{ opacity }}
      animate={{
        x: ["-40%", "140%"],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="pointer-events-none absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-xl"
    />
  );
}

function FloatingStickers({ progress }: { progress: any }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[Subtitles, Mic, UserIcon, Scissors].map((Icon, i) => (
        <motion.div
          key={i}
          className="absolute text-slate-400/40"
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: 5 + i,
            repeat: Infinity,
            delay: i * 0.4,
          }}
          style={{
            left: `${20 + i * 20}%`,
            top: `${35 + (i % 2) * 20}%`,
          }}
        >
          <Icon className="h-6 w-6" />
        </motion.div>
      ))}
    </div>
  );
}

// Content Components
function HeroPreviewCard() {
  return (
    <div className="mx-auto mt-10 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Dashboard Overview</span>
        <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
          Last 7 days ▾
        </button>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-teal-50 p-4">
          <div className="flex items-center justify-between">
            <Users className="h-5 w-5 text-teal-600" />
            <span className="text-[11px] text-teal-600">Active</span>
          </div>
          <div className="mt-3 text-xl font-semibold text-slate-800">8,432</div>
          <p className="mt-1 text-xs text-slate-500">+4.3% vs last week</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <Layers className="h-5 w-5 text-emerald-600" />
            <span className="text-[11px] text-emerald-600">Insights</span>
          </div>
          <div className="mt-3 text-xl font-semibold text-slate-800">1,247</div>
          <p className="mt-1 text-xs text-slate-500">+12% vs last week</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-lime-50 p-4">
          <div className="flex items-center justify-between">
            <LineChart className="h-5 w-5 text-lime-600" />
            <span className="text-[11px] text-lime-600">Speed</span>
          </div>
          <div className="mt-3 text-xl font-semibold text-slate-800">2.3s</div>
          <p className="mt-1 text-xs text-slate-500">p95 under 4s</p>
        </div>
      </div>
    </div>
  );
}

function FeatureSectionOne() {
  const features = [
    { icon: Subtitles, label: "自动生成字幕" },
    { icon: Scissors, label: "自动提取关键画面" },
    { icon: VideoIcon, label: "关键时刻标注" },
    { icon: FileText, label: "OCR 文本提取" },
    { icon: UserIcon, label: "说话人分离" },
    { icon: Sparkles, label: "情绪识别" },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <div className="grid items-center gap-12 md:grid-cols-2">
        {/* Left Text */}
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">
            视频内容全自动解析
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            Insightseel 自动识别视频中的关键信息，包括字幕、场景、人物、情绪等，将视频内容转化为结构化数据。
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                    <Icon className="h-4 w-4 text-teal-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-700">{feature.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium text-slate-500 mb-4">解析示例</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Subtitles className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-medium text-slate-700">字幕提取</span>
              </div>
              <p className="text-xs text-slate-600">"今天我们讨论的是产品的最新功能..."</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-medium text-slate-700">关键片段</span>
              </div>
              <p className="text-xs text-slate-600">0:12 - 0:45 | 产品演示</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserIcon className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-medium text-slate-700">说话人识别</span>
              </div>
              <p className="text-xs text-slate-600">Speaker A: 85% | Speaker B: 15%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureSectionTwo() {
  const features = [
    { icon: FileText, label: "分段摘要" },
    { icon: Brain, label: "场景语义理解" },
    { icon: MessageSquare, label: "QA 问答" },
    { icon: VideoIcon, label: "时间轴导出" },
    { icon: Folder, label: "JSON result 下载" },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <div className="grid items-center gap-12 md:grid-cols-2">
        
        {/* Right image first on desktop */}
        <div className="order-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:order-1">
          <div className="space-y-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-teal-600" />
                    <span className="text-xs font-medium text-slate-700">{feature.label}</span>
                  </div>
                  {i === 0 && (
                    <p className="text-xs text-slate-600">
                      自动为每个视频片段生成简洁摘要，快速了解内容要点。
                    </p>
                  )}
                  {i === 1 && (
                    <p className="text-xs text-slate-600">
                      理解场景语义，识别关键动作、对象和上下文关系。
                    </p>
                  )}
                  {i === 2 && (
                    <p className="text-xs text-slate-600">
                      基于视频内容智能问答，快速找到你需要的信息。
                    </p>
                  )}
                  {i === 3 && (
                    <p className="text-xs text-slate-600">
                      导出完整的时间轴数据，包含所有标注和元信息。
                    </p>
                  )}
                  {i === 4 && (
                    <p className="text-xs text-slate-600">
                      下载结构化 JSON 数据，方便集成到你的工作流。
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Left text */}
        <div className="order-1 md:order-2">
          <h2 className="text-2xl font-semibold text-slate-800">
            视频变成结构化知识
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            将视频内容转化为可搜索、可引用、可计算的结构化知识。支持分段摘要、语义理解、智能问答，并可导出时间轴和 JSON 数据。
          </p>
        </div>

      </div>
    </section>
  );
}

function BottomCTA() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold text-slate-800">
        把一个视频拖给 insightseel
      </h2>
      <p className="mt-4 text-sm text-slate-600">
        即刻生成字幕、关键时刻与摘要
      </p>

      <button className="mt-8 rounded-full bg-teal-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700">
        上传视频试试看
      </button>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white/90 py-16 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 text-center">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
            <VideoIcon className="h-5 w-5 text-slate-800" />
          </div>
          <span className="text-sm font-medium text-slate-700">
            insightseel
          </span>
        </div>

        {/* Links */}
        <div className="flex gap-6 text-xs text-slate-500">
          <a className="hover:text-slate-700" href="#">Privacy</a>
          <a className="hover:text-slate-700" href="#">Terms</a>
          <a className="hover:text-slate-700" href="#">Contact</a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-slate-400">© 2025 insightseel. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default WelcomeScreen;
