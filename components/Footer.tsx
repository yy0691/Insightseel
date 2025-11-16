import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

// Video Icon Component
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

const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-slate-200 py-16 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 text-center">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg">
            <VideoIcon className="h-5 w-5 text-slate-800" />
          </div>
          <span className="text-sm font-medium text-slate-700">
            insightseel
          </span>
        </div>

        {/* Links */}
        <div className="flex gap-6 text-xs text-slate-500">
          <a className="hover:text-slate-700" href="https://github.com/SamuelZ12/TLDW" target="_blank" rel="noopener noreferrer">
            {t('footerInspiredBy')}
          </a>
          <a className="hover:text-slate-700" href="https://luoyuanai.cn/about" target="_blank" rel="noopener noreferrer">
            {t('footerAbout')}
          </a>
          <a className="hover:text-slate-700" href="https://n1ddxc0sfaq.feishu.cn/share/base/form/shrcnf7gC1S58t8Av4x4eNxWSlh" target="_blank" rel="noopener noreferrer">
            {t('footerFeedback')}
          </a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-slate-400">© 2025 insightseel. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
