import React, { useState, useEffect } from 'react';
import { LeaveRequest } from '../../types';
import { CheckCircle, XCircle, RefreshCw, Slash, AlertTriangle, X } from 'lucide-react';

export type LeaveActionType = 'approved' | 'rejected' | 'resubmit' | 'cancelled';

interface LeaveActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaveRequest: LeaveRequest | null;
  actionType: LeaveActionType | null;
  onConfirm: (leaveId: string, action: LeaveActionType, reviewerNotes: string) => void;
  isAgentCancelling?: boolean;
}

export const LeaveActionModal: React.FC<LeaveActionModalProps> = ({
  isOpen,
  onClose,
  leaveRequest,
  actionType,
  onConfirm,
  isAgentCancelling = false,
}) => {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setError('');
    }
  }, [isOpen, actionType, leaveRequest]);

  if (!isOpen || !leaveRequest || !actionType) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((actionType === 'rejected' || actionType === 'resubmit') && !notes.trim()) {
      setError('Please provide a reason or note for this decision.');
      return;
    }
    if (isAgentCancelling && actionType === 'cancelled' && !notes.trim()) {
      setError('Please provide a brief reason for cancelling your request.');
      return;
    }
    onConfirm(leaveRequest.id, actionType, notes.trim());
    onClose();
  };

  const getModalHeaderConfig = () => {
    if (isAgentCancelling || actionType === 'cancelled') {
      return {
        title: 'Cancel Leave Application',
        subtitle: 'Are you sure you want to cancel this leave application?',
        icon: <Slash className="w-5 h-5 text-slate-500" />,
        badgeBg: 'bg-slate-100 text-slate-700',
        btnBg: 'bg-slate-700 hover:bg-slate-800 text-white',
        btnLabel: 'Confirm Cancellation',
        textareaPlaceholder: 'Reason for cancellation (e.g., Plans changed, no longer taking time off...)',
      };
    }
    switch (actionType) {
      case 'approved':
        return {
          title: 'Approve Leave Request',
          subtitle: 'Approve this leave application and update leave credits on the portal.',
          icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
          badgeBg: 'bg-emerald-100 text-emerald-800',
          btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          btnLabel: 'Approve Application',
          textareaPlaceholder: 'Approval notes or supervisor comments (optional)...',
        };
      case 'rejected':
        return {
          title: 'Decline Leave Request',
          subtitle: 'Decline this leave application.',
          icon: <XCircle className="w-5 h-5 text-rose-600" />,
          badgeBg: 'bg-rose-100 text-rose-800',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white',
          btnLabel: 'Decline Application',
          textareaPlaceholder: 'Reason for decline (e.g., Unavailability during peak shift, insufficient manpower)...',
        };
      case 'resubmit':
        return {
          title: 'Request Re-Submission',
          subtitle: 'Send back for clarification or date adjustments.',
          icon: <RefreshCw className="w-5 h-5 text-amber-600" />,
          badgeBg: 'bg-amber-100 text-amber-800',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
          btnLabel: 'Request Re-Submit',
          textareaPlaceholder: 'Notes for re-submission (e.g., Please adjust start date to Monday)...',
        };
      default:
        return {
          title: 'Confirm Action',
          subtitle: 'Please confirm your decision.',
          icon: <AlertTriangle className="w-5 h-5 text-indigo-600" />,
          badgeBg: 'bg-indigo-100 text-indigo-800',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          btnLabel: 'Confirm Action',
          textareaPlaceholder: 'Notes or reasons...',
        };
    }
  };

  const cfg = getModalHeaderConfig();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${cfg.badgeBg}`}>{cfg.icon}</div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{cfg.title}</h3>
              <p className="text-xs text-slate-500">{cfg.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Applicant:</span>
              <span className="font-bold text-slate-900">{leaveRequest.userName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Leave Type:</span>
              <span className="font-bold text-indigo-600">{leaveRequest.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Dates Covered:</span>
              <span className="font-medium text-slate-800">
                {leaveRequest.startDate} to {leaveRequest.endDate} ({leaveRequest.totalDays} day{leaveRequest.totalDays > 1 ? 's' : ''})
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 pt-1 border-t border-slate-200/60">
              <span className="font-semibold text-slate-500 shrink-0">Applicant's Reason:</span>
              <span className="text-slate-700 italic text-right break-words">{leaveRequest.reason || 'None provided'}</span>
            </div>
          </div>

          {/* Reason / Notes Textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Reason / Reviewer Notes{' '}
              {(actionType === 'rejected' || actionType === 'resubmit' || isAgentCancelling) && (
                <span className="text-rose-500 font-bold">*</span>
              )}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError('');
              }}
              placeholder={cfg.textareaPlaceholder}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
            />
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all ${cfg.btnBg}`}
            >
              {cfg.btnLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
