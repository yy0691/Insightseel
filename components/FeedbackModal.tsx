import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BaseModal } from './ui/BaseModal';

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
    <BaseModal open={true} onOpenChange={onClose} size="sm">
      <BaseModal.Header title={t('feedbackModalTitle')} />
      <BaseModal.Body className="text-center">
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
        <div className="flex justify-center space-x-6 mb-4">
          <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <input 
              type="radio" 
              name="feedback-detailed" 
              className="form-radio h-4 w-4 text-slate-800 border-slate-400 focus:ring-slate-700"
              checked={wantsDetailed === 'yes'}
              onChange={() => setWantsDetailed('yes')}
            />
            <span className="text-sm font-medium">{t('feedbackModalYes')}</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-slate-100 transition-colors">
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
      </BaseModal.Body>
      <BaseModal.Footer className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="h-9 px-4 text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={rating === 0}
          className="h-9 px-5 text-xs font-medium rounded-full bg-slate-900 text-white hover:bg-slate-800 shadow-sm disabled:opacity-50 transition-colors"
        >
          {t('feedbackModalSubmit')}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  );
};

export default FeedbackModal;