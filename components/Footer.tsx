import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="w-full border-t border-slate-200 bg-white/70 backdrop-blur-sm py-4 px-6 mt-8">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t('footerInspiredBy')}:</span>
            <a 
              href="https://github.com/SamuelZ12/TLDW" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              TLDW
            </a>
          </div>
          
          <span className="hidden sm:inline text-slate-300">|</span>
          
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t('footerAuthor')}:</span>
            <a 
              href="https://luoyuanai.cn" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              luoyuanai.cn
            </a>
          </div>
          
          <span className="hidden sm:inline text-slate-300">|</span>
          
          <div className="flex items-center gap-2">
            <a 
              href="https://n1ddxc0sfaq.feishu.cn/share/base/form/shrcnf7gC1S58t8Av4x4eNxWSlh" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {t('footerFeedback')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
