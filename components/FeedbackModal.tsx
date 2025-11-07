import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface FeedbackModalProps {
  onClose: () => void;
  feedbackUrl: string;
}

const StarIcon: React.FC<{ filled: boolean; onHover: () => void; onLeave: () => void; onClick: () => void; }> = ({ filled, onHover, onLeave, onClick }) => (
    <svg 
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onClick={onClick}
        className={`w-8 h-8 cursor-pointer transition-colors ${filled ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
        fill="currentColor" 
        viewBox="0 0 20 20"
    >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose, feedbackUrl }) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [wantsDetailed, setWantsDetailed] = useState<'yes' | 'no'>('no');

  const handleSubmit = () => {
    if (wantsDetailed === 'yes') {
      window.open(feedbackUrl, '_blank', 'noopener,noreferrer');
    }
    // In a real app, you might send the rating to an analytics service here.
    // e.g., analytics.track('feedback_submitted', { rating, wantsDetailed });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-50 to-slate-200 rounded-2xl shadow-2xl w-full max-w-sm border border-white/30 text-slate-800">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold mb-4">{t('feedbackModalTitle')}</h2>
          <div className="flex justify-center items-center mb-6 space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <StarIcon
                key={star}
                filled={(hoverRating || rating) >= star}
                onHover={() => setHoverRating(star)}
                onLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              />
            ))}
          </div>

          <h3 className="text-md font-medium mb-3">{t('feedbackModalQuestion')}</h3>
          <div className="flex justify-center space-x-6 mb-8">
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-slate-200/50 transition-colors">
              <input 
                type="radio" 
                name="feedback-detailed" 
                className="form-radio h-4 w-4 text-slate-800 border-slate-400 focus:ring-slate-700"
                checked={wantsDetailed === 'yes'}
                onChange={() => setWantsDetailed('yes')}
              />
              <span className="text-sm font-medium">{t('feedbackModalYes')}</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-slate-200/50 transition-colors">
              <input 
                type="radio" 
                name="feedback-detailed" 
                className="form-radio h-4 w-4 text-slate-800 border-slate-400 focus:ring-slate-700"
                checked={wantsDetailed === 'no'}
                onChange={() => setWantsDetailed('no')}
              />
              <span className="text-sm font-medium">{t('feedbackModalNo')}</span>
            </label>
          </div>
        </div>
        <div className="p-4 bg-slate-200/50 flex justify-end space-x-3 rounded-b-2xl">
            <button
                onClick={onClose}
                className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-transparent text-slate-700 hover:bg-slate-900/10"
            >
                {t('cancel')}
            </button>
            <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm disabled:opacity-50"
            >
                {t('feedbackModalSubmit')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;