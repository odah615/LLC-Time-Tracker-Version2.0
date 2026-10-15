import React from 'react';
import { UserRole } from '../types';

interface UserAvatarProps {
  name: string;
  role?: UserRole | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showBorder?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  role,
  size = 'md',
  className = '',
  showBorder = true,
}) => {
  const getInitials = (fullName: string) => {
    if (!fullName) return 'U';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(name);

  const getRoleColors = (userRole?: string) => {
    switch (userRole) {
      case 'admin':
        return 'bg-blue-900/80 text-blue-200 border-blue-600/60 ring-blue-500/30';
      case 'va_admin':
        return 'bg-cyan-900/80 text-cyan-200 border-cyan-600/60 ring-cyan-500/30';
      case 'team_lead':
        return 'bg-amber-900/80 text-amber-200 border-amber-600/60 ring-amber-500/30';
      case 'trainer':
        return 'bg-indigo-900/80 text-indigo-200 border-indigo-600/60 ring-indigo-500/30';
      case 'hr':
        return 'bg-purple-900/80 text-purple-200 border-purple-600/60 ring-purple-500/30';
      case 'payroll':
        return 'bg-emerald-900/80 text-emerald-200 border-emerald-600/60 ring-emerald-500/30';
      case 'agent':
      default:
        return 'bg-slate-800 text-slate-200 border-slate-700 ring-slate-600/30';
    }
  };

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px] font-bold rounded-lg',
    sm: 'w-7 h-7 text-xs font-bold rounded-lg',
    md: 'w-8 h-8 text-xs font-bold rounded-xl',
    lg: 'w-10 h-10 text-sm font-extrabold rounded-xl',
    xl: 'w-14 h-14 text-lg font-black rounded-2xl',
  }[size];

  const colorClasses = getRoleColors(role);

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none font-mono ${sizeClasses} ${colorClasses} ${
        showBorder ? 'border' : ''
      } ${className}`}
      title={name}
      aria-label={name}
    >
      <span>{initials}</span>
    </div>
  );
};
