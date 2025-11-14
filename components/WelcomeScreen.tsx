import React, { useRef, useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { motion, useScroll, useTransform, useAnimation, useMotionValue, animate } from "framer-motion";
import {
  Clapperboard,
  Film,
  Folder,
  Video,
  Sparkles,
  BrainCircuit,
  Radar,
  AudioLines,
  MessageSquare,
  Users,
  Timer,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

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

const AnimatedCounter: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
  const motionValue = useMotionValue(0);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const unsubscribe = motionValue.on('change', (latest) => {
      setDisplayValue(Math.round(latest));
    });

    const controls = animate(motionValue, value, {
      duration: 1.6,
      ease: 'easeOut',
    });

    return () => {
      unsubscribe();
      controls.stop();
    };
  }, [motionValue, value]);

  return (
    <span>
      {displayValue}
      {suffix}
    </span>
  );
};

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

  const pipelineSteps = [
    {
      id: 'detect',
      title: t('welcomePipelineStepDetect'),
      description: t('welcomePipelineStepDetectDesc'),
      icon: Radar,
      accent: 'from-emerald-400 to-emerald-600',
    },
    {
      id: 'speech',
      title: t('welcomePipelineStepSpeech'),
      description: t('welcomePipelineStepSpeechDesc'),
      icon: AudioLines,
      accent: 'from-cyan-400 to-emerald-500',
    },
    {
      id: 'reasoning',
      title: t('welcomePipelineStepUnderstand'),
      description: t('welcomePipelineStepUnderstandDesc'),
      icon: BrainCircuit,
      accent: 'from-blue-400 to-indigo-500',
    },
    {
      id: 'delivery',
      title: t('welcomePipelineStepDeliver'),
      description: t('welcomePipelineStepDeliverDesc'),
      icon: MessageSquare,
      accent: 'from-purple-400 to-emerald-400',
    },
  ];

  const insightStats = [
    {
      id: 'videos',
      icon: Video,
      target: 12,
      suffix: 'K+',
      label: t('welcomeStatsVideosDesc'),
    },
    {
      id: 'teams',
      icon: Users,
      target: 180,
      suffix: '+',
      label: t('welcomeStatsTeamsDesc'),
    },
    {
      id: 'latency',
      icon: Timer,
      target: 4,
      suffix: 's',
      label: t('welcomeStatsLatencyDesc'),
    },
  ];

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
      <nav className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
              <span className="text-sm font-semibold text-slate-900">I</span>
            </div>
            <span className="text-sm font-medium text-slate-800">
              insightseel
            </span>
          </div>

          <div className="flex items-center gap-2">
            {currentUser ? (
              <button
                onClick={onOpenAccount}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {currentUser.email || t("account")}
              </button>
            ) : (
              <>
                <button
                  onClick={onLogin}
                  className="hidden rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex"
                >
                  {t("signIn")}
                </button>
                <button
                  onClick={onRegister}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {t("signUp")}
                </button>
              </>
            )}
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
                d="M 100% 0 Q 50% 50% 0 100%"
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
            <CentralWorkspace scrollProgress={scrollYProgress} />
            {fileCards.map((file) => (
              <FileCard key={file.id} file={file} scrollProgress={scrollYProgress} />
            ))}
          </div>
        </div>
      </section>

      {/* AI Pipeline Section */}
      <section className="relative w-full bg-slate-950 text-white py-24 overflow-hidden">
        <motion.div
          className="absolute inset-0 opacity-40"
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%'],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.15), transparent 50%), radial-gradient(circle at 80% 30%, rgba(59,130,246,0.18), transparent 55%), radial-gradient(circle at 50% 80%, rgba(124,58,237,0.15), transparent 45%)',
            backgroundSize: '120% 120%'
          }}
        />

        <div className="relative mx-auto max-w-[1120px] px-4">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-200"
          >
            {t('welcomeBadge')}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 max-w-2xl text-3xl font-semibold leading-tight text-white md:text-4xl"
          >
            {t('welcomePipelineTitle')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200/80 md:text-base"
          >
            {t('welcomePipelineDescription')}
          </motion.p>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {pipelineSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: index * 0.12 }}
                    className="pointer-events-none absolute bottom-0 left-0 h-1 w-full origin-left bg-gradient-to-r from-emerald-400/60 via-white/40 to-transparent"
                  />
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${step.accent}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-200/80">{step.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">{t('welcomeStatsTitle')}</p>
                <p className="mt-3 max-w-xl text-sm text-slate-200/80">{t('welcomeStatsSubtitle')}</p>
              </div>
              <div className="flex gap-2">
                {[...Array(6)].map((_, i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-emerald-300/40"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {insightStats.map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.id}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.6, delay: idx * 0.15 }}
                    className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5"
                  >
                    <motion.div
                      className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/10"
                      animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }}
                      transition={{ duration: 4, repeat: Infinity, delay: idx * 0.4 }}
                    />
                    <div className="relative z-10 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/20">
                        <Icon className="h-4 w-4 text-emerald-200" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold text-white">
                          <AnimatedCounter value={stat.target} suffix={stat.suffix} />
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-200/70">{stat.label}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>

        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center"
          animate={{ opacity: [0.2, 0.5, 0.2], y: [0, -6, 0] }}
          transition={{ duration: 4.5, repeat: Infinity }}
        >
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-2 text-[11px] text-slate-200/90">
            <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
            <span>{t('welcomePipelineFooter')}</span>
          </div>
        </motion.div>
      </section>

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
  const isScanning = useTransform(scrollProgress, [0.5, 0.7], [0, 1]);

  // Easter egg: show message after 3 seconds
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEasterEgg(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // AI status tags
  const aiStatusMessages = [
    "正在分析中…",
    "智能识别中…",
    "耐心等待…",
    "正在读取音轨…",
    "正在解析场景…",
  ];

  return (
    <motion.div
      style={{ scale }}
      className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Notion-style AI analysis badges */}
        <motion.div
          style={{ opacity: useTransform(isScanning, [0, 0.3], [0, 1]) }}
          className="pointer-events-none absolute right-4 top-4 flex flex-col gap-2"
        >
          {aiStatusMessages.map((message, i) => (
            <motion.div
              key={`status-${i}`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm"
              animate={{
                y: [0, -2, 0],
                opacity: [0.9, 1, 0.9],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.25,
                ease: "easeInOut",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="max-w-[180px] truncate">{message}</span>
            </motion.div>
          ))}
        </motion.div>

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
                <Video className="h-4 w-4 text-slate-500" />
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
                <Clapperboard className="h-4 w-4 text-slate-500" />
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
                <Film className="h-4 w-4 text-slate-500" />
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

  const dragX = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress],
    [file.initialX, 0]
  );
  const dragY = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress],
    [file.initialY, 0]
  );
  const dragRotate = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress],
    [-3, 0]
  );
  const dragScale = useTransform(
    scrollProgress,
    [file.startProgress, file.endProgress],
    [1, 0.96]
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

  return (
    <motion.div
      animate={scrollProgress.get() < file.startProgress ? controls : undefined}
      style={{
        x: dragX,
        y: dragY,
        rotate: scrollProgress.get() >= file.startProgress ? dragRotate : undefined,
        scale: scrollProgress.get() < file.endProgress ? dragScale : queueScale,
        opacity,
      }}
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

export default WelcomeScreen;
