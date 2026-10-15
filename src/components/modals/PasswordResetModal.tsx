import React, { useState } from 'react';
import { User } from '../../types';
import { useApp } from '../../context/AppContext';
import { maskPassword } from '../../lib/googleSheetsSync';
import { KeyRound, Check, Copy, RefreshCw, Eye, EyeOff, Lock, Sparkles, X, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User | null;
  onResetPassword: (userId: string, newPass: string, requireChangeOnNextLogin?: boolean) => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  onResetPassword,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const { currentUser, addAuditLog } = useApp();

  if (!isOpen || !targetUser) return null;

  const currentPasswordDisplay = targetUser.password || 'Password123!';

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = 'LLC-';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setMustChangeOnNextLogin(false);
    setSuccessMsg('');
  };

  const handleSetDefaultPassword = () => {
    setNewPassword('Password123!');
    setMustChangeOnNextLogin(true);
    setSuccessMsg('');
  };

  const executeReset = () => {
    const finalPass = newPassword.trim();
    const isDefault = finalPass === 'Password123!';
    onResetPassword(targetUser.id, finalPass, mustChangeOnNextLogin || isDefault);
    addAuditLog({
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      category: 'Password Reset',
      targetEmployeeId: targetUser.id,
      targetEmployeeName: targetUser.name,
      fromValue: maskPassword(currentPasswordDisplay),
      toValue: maskPassword(finalPass),
      details: `Main Admin reset login credentials for ${targetUser.name} (${targetUser.employeeCode}) to ${isDefault ? 'default "Password123!" (Forced password change upon next login enabled)' : 'custom unique password'}.`,
    });
    setSuccessMsg(`Password successfully reset for ${targetUser.name}! ${isDefault ? 'They will be prompted to create their unique password upon logging in.' : ''}`);
    setShowConfirm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    setShowConfirm(true);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(newPassword || currentPasswordDisplay);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Reset Account Password</h3>
              <p className="text-xs text-slate-500">Main Admin Central Credential Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm truncate">{targetUser.name}</h4>
              <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                #{targetUser.employeeCode}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{targetUser.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                {targetUser.designation}
              </span>
              {targetUser.mustChangePassword && (
                <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                  Pending 1st Login Password Change
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Current Password</span>
            </div>
            <div className="font-mono font-bold text-slate-900 text-xs truncate">
              {currentPasswordDisplay}
            </div>
          </div>
          <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-medium">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Masked in Sheets</span>
            </div>
            <div className="font-mono font-bold text-emerald-900 text-xs truncate">
              {maskPassword(currentPasswordDisplay)}
            </div>
          </div>
        </div>

        <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900">Admin Quick Presets</span>
            <span className="text-[10px] text-blue-600 font-medium">Team Lead Reset Protocol</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSetDefaultPassword}
              className="flex-1 py-2 px-2.5 bg-white hover:bg-blue-100/70 border border-blue-300 rounded-lg text-blue-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>Reset to Default (Password123!)</span>
            </button>
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="py-2 px-2.5 bg-white hover:bg-amber-100/70 border border-amber-300 rounded-lg text-amber-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Random</span>
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs space-y-2 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-emerald-700">
              <Check className="w-4 h-4 text-emerald-600" /> {successMsg}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 font-mono font-bold text-slate-900">
              <span>Password: <span className="bg-white px-2 py-0.5 rounded border border-emerald-300">{newPassword}</span></span>
              <button
                type="button"
                onClick={handleCopyPassword}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-sans font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">New Password to Assign</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setSuccessMsg('');
                }}
                placeholder="Type or click a preset above..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pr-20 text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900"
                required
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title={showPass ? 'Hide Password' : 'Show Password'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={mustChangeOnNextLogin}
              onChange={(e) => setMustChangeOnNextLogin(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded"
            />
            <span className="text-slate-700 font-medium text-[11px]">
              Require employee to create their own unique password upon next login
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newPassword.trim()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Save & Update Password
            </button>
          </div>
        </form>

        <ConfirmationModal
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={executeReset}
          title="Confirm Password Reset"
          description={`Are you sure you want to reset the login credentials for ${targetUser.name}?`}
          employeeName={targetUser.name}
          employeeCode={targetUser.employeeCode}
          fromValue={maskPassword(currentPasswordDisplay)}
          toValue={maskPassword(newPassword)}
          confirmText="Yes, Reset Password"
          variant="warning"
        />
      </div>
    </div>
  );
};
