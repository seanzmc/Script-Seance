import React from 'react';
import { Button } from './Button';

interface PrimaryActionButtonProps {
  label: string;
  onClick: () => void;
  helperText?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const PrimaryActionButton: React.FC<PrimaryActionButtonProps> = ({
  label,
  onClick,
  helperText,
  disabled,
  loading
}) => {
  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        loading={loading}
        disabled={disabled}
        size="lg"
        className="w-full text-base font-semibold tracking-wide shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:shadow-[0_0_45px_rgba(79,70,229,0.6)]"
        title={label}
      >
        {label}
      </Button>
      {helperText && (
        <p className="text-[11px] text-gray-500 leading-relaxed">{helperText}</p>
      )}
    </div>
  );
};
