import React, { useRef, useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import {
  motion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  Folder,
  Sparkles,
  FileText,
  Brain,
  Subtitles,
  Mic,
  Scissors,
  User as UserIcon,
  MessageSquare,
  LineChart,
  Layers,
  Users,
  Timer,
  BarChart3,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import Footer from "./Footer";

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

// 用于动效 Demo 的文件卡片配置
const demoFileCards = [
  {
    id: 1,
    name: "product-demo.mp4",
    duration: "12:47",
    initialX: -220,
    initialY: 60,
  },
  {
    id: 2,
    name: "webinar-snippet.mov",
    duration: "05:32",
    initialX: 220,
    initialY: 40,
  },
  {
    id: 3,
    name: "team-update.webm",
    duration: "08:15",
    initialX: -160,
    initialY: 140,
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImportFiles(event.target.files);
      event.target.value = "";
    }
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImportFolderSelection(event.target.files);
      event.target.value = "";
    }
  };

  const triggerFileUpload = () => fileInputRef.current?.click();
  const triggerFolderUpload = () => folderInputRef.current?.click();

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col">
      <Navbar
        currentUser={currentUser}
        onLogin={onLogin}
        onRegister={onRegister}
        onOpenAccount={onOpenAccount}
      />

      <main className="flex-1">
        <Hero
          onPrimaryClick={triggerFileUpload}
          onSecondaryClick={triggerFolderUpload}
        />

        <MagicDemo />

        <FeatureSectionOne />
        <FeatureSectionTwo />



        <FinalCTA onPrimaryClick={triggerFileUpload} />
      </main>

      {/* 隐藏的上传输入 */}
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
  );
};

/* ------------------------ Navbar ------------------------ */

interface NavbarProps {
  currentUser?: User | null;
  onLogin: () => void;
  onRegister: () => void;
  onOpenAccount?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogin,
  onRegister,
  onOpenAccount,
}) => {
  const { t } = useLanguage();
  return (
    <nav className="sticky top-0 z-40 px-4 pt-4">
      <div className="mx-auto flex max-w-[1120px] justify-center">
        <div className="flex w-full items-center justify-between rounded-full border border-white/60 bg-white/80 px-5 py-2 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <VideoIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Insightseel
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {currentUser ? (
              <button
                onClick={onOpenAccount}
                className="rounded-full bg-slate-900/5 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-900/10"
              >
                {currentUser.email || t("account")}
              </button>
            ) : (
              <>
                <button
                  onClick={onLogin}
                  className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-900/5 sm:inline-flex"
                >
                  {t("signIn")}
                </button>
                <button
                  onClick={onRegister}
                  className="inline-flex items-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {t("signUp")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

/* ------------------------ Hero ------------------------ */

interface HeroProps {
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onPrimaryClick, onSecondaryClick }) => {
  const { t } = useLanguage();
  const rotatingWords = ["数据", "语音", "内容", "场景", "情绪", "洞察"];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(
      () =>
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length),
      2000
    );
    return () => clearInterval(interval);
  }, [rotatingWords.length]);

  return (
    <section className="w-full px-4 pt-16 pb-20 md:pt-20 md:pb-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-700">
              {t("welcomeBadge")}
            </span>
          </div>

          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            {t("welcomeHeroTitle")}
            <br />
            {t("welcomeHeroTitleLine2")}
            <span className="ml-2 inline-block align-middle">
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
              onClick={onPrimaryClick}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              {t("welcomeTryButton")}
            </button>
            <button
              onClick={onSecondaryClick}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("welcomeImportFolderButton")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ------------------------ Magic Demo ------------------------ */

const MagicDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 80%", "end 20%"], // 进入视口时开始，离开前结束
  });

  // Workspace 缩放 + 亮度
  const workspaceScale = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0.94, 1, 1.03, 1.02]);
  const workspaceOpacity = useTransform(scrollYProgress, [0, 0.1, 0.2], [0, 0.6, 1]);
  const workspaceGlow = useTransform(scrollYProgress, [0.3, 0.7], [0, 1]);

  // 背景光晕
  const backgroundOpacity = useTransform(scrollYProgress, [0, 0.3, 1], [0, 0.5, 0.2]);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-gradient-to-b from-slate-50 via-slate-50 to-white py-20 md:py-28"
    >
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          style={{ opacity: backgroundOpacity }}
          className="h-[420px] w-[90%] max-w-[1040px] rounded-[36px] bg-teal-100/40 blur-3xl"
        />
      </div>

      <div className="relative mx-auto flex max-w-[1120px] items-center justify-center px-4">
        <motion.div
          style={{ scale: workspaceScale, opacity: workspaceOpacity }}
          className="relative w-full max-w-3xl rounded-[32px] bg-white shadow-[0_18px_80px_rgba(15,23,42,0.2)] border border-slate-100/80 overflow-hidden"
        >
          {/* Glow 边框 */}
          <motion.div
            style={{ opacity: workspaceGlow }}
            className="pointer-events-none absolute inset-0 rounded-[32px] ring-2 ring-emerald-400/40"
          />

          <DemoWorkspaceHeader />
          <DemoWorkspaceBody scrollProgress={scrollYProgress} />

          {/* 散落文件 → 自动拖拽 */}
          {demoFileCards.map((file, index) => (
            <DemoFileCard
              key={file.id}
              file={file}
              index={index}
              progress={scrollYProgress}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
};


const DemoWorkspaceHeader: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3.5">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-slate-500" />
        <h3 className="text-xs font-medium text-slate-800">
          {t("welcomeWorkspaceTitle")}
        </h3>
      </div>
      <span className="text-[11px] text-slate-500">
        {t("welcomeWaitingForVideos")}
      </span>
    </div>
  );
};

const DemoWorkspaceBody: React.FC<{ scrollProgress: any }> = ({ scrollProgress }) => {
  const { t } = useLanguage();

  const featureTags = [
    "自动识别关键时刻",
    "多轨道语音解析",
    "说话人分离与聚类",
    "自动生成内容摘要",
    "支持长视频批量分析",
  ];

  // 浮动标签显示区间：0.55 之后才出现
  const tagsOpacity = useTransform(scrollProgress, [0.5, 0.6], [0, 1]);

  return (
    <div className="relative px-6 pb-7 pt-6 md:px-8">
      <div className="flex flex-col gap-5 md:flex-row">
        {/* 左：拖拽目标区 */}
        <div className="relative flex-1">
          <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8">
            <Folder className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-800">
              将视频拖放到此处
            </p>
            <p className="mt-1 text-xs text-slate-500 text-center">
              视频将自动分析，提取字幕、关键片段、说话人和摘要。
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {featureTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 shadow-sm"
                >
                  <Sparkles className="mr-1.5 h-3 w-3 text-emerald-500" />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 悬浮分析标签：拖拽完成后的“炫酷层” */}
          <motion.div
            style={{ opacity: tagsOpacity }}
            className="pointer-events-none absolute inset-0"
          >
            <FloatingTag
              className="left-[10%] top-3"
              label="字幕生成中…"
              icon={Subtitles}
              delay={0}
            />
            <FloatingTag
              className="right-[5%] top-[45%]"
              label="关键片段定位"
              icon={Scissors}
              delay={0.15}
            />
            <FloatingTag
              className="left-[18%] bottom-2"
              label="说话人聚类完成"
              icon={UserIcon}
              delay={0.3}
            />
            <FloatingTag
              className="right-[20%] bottom-5"
              label="内容摘要写入"
              icon={FileText}
              delay={0.45}
            />
          </motion.div>
        </div>

        {/* 右：队列列表，轻微呼吸动画 */}
        <div className="flex-1 space-y-2.5">
          <DemoQueueRow name="product-demo.mp4" duration="12:47" delay={0} />
          <DemoQueueRow name="webinar-snippet.mov" duration="05:32" delay={0.05} />
          <DemoQueueRow name="team-update.webm" duration="08:15" delay={0.1} />
        </div>
      </div>
    </div>
  );
};

const FloatingTag: React.FC<{
  className?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  delay?: number;
}> = ({ className = "", label, icon: Icon, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: "easeOut" }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [-4, 4, -4] }}
        transition={{ duration: 4, repeat: Infinity, delay, ease: "easeInOut" }}
        className="rounded-2xl bg-slate-900 text-slate-50 px-3 py-1.5 text-[11px] shadow-[0_12px_30px_rgba(15,23,42,0.45)] flex items-center gap-1.5"
      >
        <Icon className="h-3.5 w-3.5 text-emerald-300" />
        <span>{label}</span>
        <span className="ml-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </motion.div>
    </motion.div>
  );
};


const DemoQueueRow: React.FC<{
  name: string;
  duration: string;
  delay?: number;
}> = ({ name, duration, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5"
  >
    <VideoIcon className="h-4 w-4 text-slate-500" />
    <span className="truncate text-xs text-slate-700">{name}</span>
    <span className="ml-auto text-xs text-slate-500">{duration}</span>
  </motion.div>
);

const DemoFileCard: React.FC<{
  file: { name: string; duration: string; initialX: number; initialY: number };
  index: number;
  progress: any;
}> = ({ file, index, progress }) => {
  // 每张卡片有错峰的动效时间窗口
  const start = 0.1 + index * 0.08;
  const mid = start + 0.25;      // 正在飞入
  const end = mid + 0.2;         // 已经基本进入

  const x = useTransform(progress, [0, start, mid, end], [file.initialX, file.initialX, 0, 0]);
  const y = useTransform(progress, [0, start, mid, end], [file.initialY, file.initialY, 0, 0]);
  const scale = useTransform(progress, [start, mid, end, 1], [1, 1.03, 0.94, 0.9]);
  const opacity = useTransform(progress, [0, start * 0.7, start, mid, end, 1], [0, 0, 0.9, 1, 0.2, 0]);

  const blur = useTransform(progress, [start, mid], [0, 1.5]); // 飞行中稍微模糊

  return (
    <motion.div
      style={{
        x,
        y,
        scale,
        opacity,
        filter: blur && typeof blur.get === "function" ? `blur(${blur.get()}px)` : undefined,
      }}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <div className="flex w-52 items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900/5">
          <VideoIcon className="h-4 w-4 text-slate-700" />
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



/* ------------------------ Feature Sections ------------------------ */

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
      <div className="grid items-start gap-10 md:grid-cols-2">
        {/* 左侧：大标题 + 描述 + 功能网格 */}
        <div>
          <h2 className="text-[28px] font-semibold leading-tight text-slate-900">
            视频内容全自动解析
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Insightseel 自动识别视频中的关键信息，包括字幕、场景、人物、情绪等，
            将视频内容转化为结构化分析化数据。
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {features.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <Icon className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-slate-800">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：解析示例卡片 */}
        <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-semibold text-slate-500">
            解析示例
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Subtitles className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-800">
                  字幕提取
                </span>
              </div>
              <p className="text-xs text-slate-600">
                “今天我们讨论的是产品的最新功能…”
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Scissors className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-800">
                  关键片段
                </span>
              </div>
              <p className="text-xs text-slate-600">
                0:12 – 0:45 ｜ 产品演示
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-800">
                  说话人识别
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Speaker A：85% ｜ Speaker B：15%
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureSectionTwo() {
  const features = [
    {
      icon: FileText,
      label: "分段摘要",
      desc: "自动为每个视频片段生成简洁摘要，快速了解内容要点。",
    },
    {
      icon: Brain,
      label: "场景语义理解",
      desc: "理解场景语义，识别关键动作、对象和上下文关系。",
    },
    {
      icon: MessageSquare,
      label: "QA 问答",
      desc: "基于视频内容智能问答，快速找到你需要的信息。",
    },
    {
      icon: VideoIcon,
      label: "时间轴导出",
      desc: "导出完整时间轴数据，包含所有标注和元信息。",
    },
    {
      icon: Folder,
      label: "JSON result 下载",
      desc: "下载结构化 JSON 数据，方便接入你的工作流。",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-24">
      <div className="grid items-start gap-10 md:grid-cols-2">
        {/* 左侧：功能列表卡片 */}
        <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {features.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    {label}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：标题 + 描述 */}
        <div className="md:pl-4">
          <h2 className="text-[28px] font-semibold leading-tight text-slate-900">
            视频变成结构化知识
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            将视频内容转化为可搜索、可引用、可计算的结构化知识。
            支持分段摘要、语义理解、智能问答，并可导出时间轴和 JSON 数据，
            方便接入你的分析与工作流。
          </p>
        </div>
      </div>
    </section>
  );
}


/* ------------------------ 三栏特点介绍 ------------------------ */

// function FeatureGroups() {
//   return (
//     <section className="mx-auto w-full max-w-5xl px-6 py-24">
//       <div className="grid gap-6 md:gap-8 md:grid-cols-3">
//         <FeatureGroupCard
//           title="视频内容全自动解析"
//           description="把原始视频拆成可搜索的结构化片段。"
//           items={[
//             { icon: Subtitles, label: "自动生成字幕" },
//             { icon: Scissors, label: "自动切分关键片段" },
//             { icon: VideoIcon, label: "关键时刻标注" },
//             { icon: FileText, label: "OCR 文本提取" },
//           ]}
//         />
//         <FeatureGroupCard
//           title="理解语义与情绪"
//           description="不仅看见画面，更理解语气、人物与场景关系。"
//           items={[
//             { icon: Brain, label: "场景语义理解" },
//             { icon: Mic, label: "多轨道语音解析" },
//             { icon: UserIcon, label: "说话人分离与聚类" },
//             { icon: Sparkles, label: "情绪 / 语气识别" },
//           ]}
//         />
//         <FeatureGroupCard
//           title="让视频接入你的工作流"
//           description="把洞察同步到现有系统里，而不是困在播放器里。"
//           items={[
//             { icon: FileText, label: "分段摘要输出" },
//             { icon: MessageSquare, label: "基于内容的 QA 问答" },
//             { icon: VideoIcon, label: "时间轴与标注导出" },
//             { icon: Folder, label: "结构化 JSON 结果下载" },
//           ]}
//         />
//       </div>
//     </section>
//   );
// }

// interface FeatureGroupItem {
//   icon: React.ComponentType<{ className?: string }>;
//   label: string;
// }

// interface FeatureGroupCardProps {
//   title: string;
//   description: string;
//   items: FeatureGroupItem[];
// }

// const FeatureGroupCard: React.FC<FeatureGroupCardProps> = ({
//   title,
//   description,
//   items,
// }) => {
//   return (
//     <div className="flex h-full flex-col rounded-[32px] border border-slate-100 bg-white px-6 py-6 shadow-sm">
//       <h3 className="text-[17px] font-semibold text-slate-900">{title}</h3>
//       <p className="mt-2 text-xs leading-relaxed text-slate-600">
//         {description}
//       </p>

//       <div className="mt-5 space-y-2.5">
//         {items.map(({ icon: Icon, label }) => (
//           <div
//             key={label}
//             className="flex items-center gap-2.5 rounded-[20px] bg-slate-50 px-3.5 py-2.5"
//           >
//             <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white">
//               <Icon className="h-4 w-4 text-slate-600" />
//             </div>
//             <span className="text-[13px] font-medium text-slate-800">
//               {label}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };


/* ------------------------ Final CTA ------------------------ */

interface FinalCTAProps {
  onPrimaryClick: () => void;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ onPrimaryClick }) => {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:py-24">
      <h2 className="text-2xl font-semibold text-slate-900 md:text-3xl">
        把一个视频拖给 Insightseel
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        即刻生成字幕、关键时刻与摘要
      </p>
      <button
        onClick={onPrimaryClick}
        className="mt-8 inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        上传视频试试看
      </button>
    </section>
  );
};

export default WelcomeScreen;
