import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  employeeName?: string;
  employeeCode?: string;
  fromValue?: string;
  toValue?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'warning' | 'danger' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  description = 'Are you sure you want to proceed with this change?',
  employeeName,
  employeeCode,
  fromValue,
  toValue,
  confirmText = 'Yes, Proceed',
  cancelText = 'Cancel',
  variant = 'warning',
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-rose-500/10 border-rose-500/20 text-rose-600',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20',
          badgeFrom: 'bg-slate-100 text-slate-700 border-slate-200',
          badgeTo: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      case 'info':
        return {
          iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
          confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20',
          badgeFrom: 'bg-slate-100 text-slate-700 border-slate-200',
          badgeTo: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      default:
        return {
          iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20',
          badgeFrom: 'bg-slate-100 text-slate-700 border-slate-200',
          badgeTo: 'bg-amber-50 text-amber-800 border-amber-200',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold ${styles.iconBg}`}>
              {variant === 'danger' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : variant === 'info' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500">System Confirmation Required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Employee details if provided */}
        {employeeName && (
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">{employeeName}</span>
            {employeeCode && (
              <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                #{employeeCode}
              </span>
            )}
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-slate-600 leading-relaxed">{description}</p>

        {/* Value change preview box */}
        {(fromValue !== undefined || toValue !== undefined) && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Current State</span>
              <span className={`px-2.5 py-1 rounded border inline-block ${styles.badgeFrom}`}>
                {fromValue || 'None'}
              </span>
            </div>
            <span className="text-slate-400 font-bold text-sm">→</span>
            <div className="space-y-1 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">New Proposed State</span>
              <span className={`px-2.5 py-1 rounded border font-bold inline-block ${styles.badgeTo}`}>
                {toValue || 'None'}
              </span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${styles.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
