import React from 'react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'success' | 'warning';
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning'
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          button: 'bg-red-500 hover:bg-red-600',
          border: 'border-red-500',
          text: 'text-red-500'
        };
      case 'success':
        return {
          button: 'bg-green-500 hover:bg-green-600',
          border: 'border-green-500',
          text: 'text-green-500'
        };
      default:
        return {
          button: 'bg-yellow-500 hover:bg-yellow-600',
          border: 'border-yellow-500',
          text: 'text-yellow-500'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        
        {/* Dialog */}
        <div className="relative bg-gray-900 rounded-lg p-6 max-w-md w-full border border-gray-800">
          <h3 className={`text-lg font-semibold mb-2 ${styles.text}`}>{title}</h3>
          <p className="text-gray-300 mb-6">{message}</p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 rounded text-sm font-medium text-white transition-colors ${styles.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 