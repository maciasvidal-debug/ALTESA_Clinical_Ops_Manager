'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface DLPWrapperProps {
  children: React.ReactNode;
  onViolation: (action: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DLPWrapper = ({ children, onViolation, className = '', style = {} }: DLPWrapperProps) => {
  const handleProtectedAction = (e: React.ClipboardEvent | React.DragEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();
    onViolation(action);
  };

  return (
    <span 
      className={`dlp-protected ${className}`}
      style={{ ...style, userSelect: 'all' }} // Allow selection but block copy to trigger the educational toast
      onCopy={(e) => handleProtectedAction(e, 'copy')}
      onCut={(e) => handleProtectedAction(e, 'cut')}
      onDragStart={(e) => handleProtectedAction(e, 'drag')}
      title="Confidential Data - Protected by DLP"
    >
      {children}
    </span>
  );
};
