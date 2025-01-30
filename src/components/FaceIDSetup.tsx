import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { registerBiometrics, isBiometricsAvailable } from '@/lib/biometrics';
import Toast, { ToastType } from './Toast';

interface FaceIDSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FaceIDSetup({ isOpen, onClose, onSuccess }: FaceIDSetupProps) {
  const [status, setStatus] = useState<'initial' | 'registering' | 'success' | 'error'>('initial');
  const [toast, setToast] = useState<{ show: boolean; type: ToastType; message: string }>({
    show: false,
    type: 'success',
    message: '',
  });

  const showToast = (type: ToastType, message: string) => {
    setToast({ show: true, type, message });
  };

  const handleSetup = async () => {
    try {
      setStatus('registering');

      if (!isBiometricsAvailable()) {
        throw new Error('Face ID is not available on this device');
      }

      const success = await registerBiometrics();
      if (success) {
        setStatus('success');
        showToast('success', 'Face ID registration successful!');
        onSuccess?.();
      } else {
        throw new Error('Failed to register Face ID');
      }
    } catch (err) {
      setStatus('error');
      showToast('error', err instanceof Error ? err.message : 'Failed to set up Face ID');
    }
  };

  const handleClose = () => {
    setStatus('initial');
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-4">
              Set Up Face ID
            </Dialog.Title>

            <div className="space-y-4">
              {status === 'initial' && (
                <>
                  <p className="text-gray-500">
                    Use Face ID to quickly and securely sign in to Meetini. Your face data stays on your device and is never sent to our servers.
                  </p>
                  <button
                    onClick={handleSetup}
                    className="w-full rounded-md bg-teal-500 px-4 py-2 text-white hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Set Up Face ID
                  </button>
                </>
              )}

              {status === 'registering' && (
                <div className="text-center">
                  <p className="text-gray-500">Follow your device&apos;s prompts to set up Face ID...</p>
                  <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto" />
                </div>
              )}

              {status === 'success' && (
                <>
                  <p className="text-green-600">Face ID has been successfully set up!</p>
                  <button
                    onClick={handleClose}
                    className="w-full rounded-md bg-teal-500 px-4 py-2 text-white hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Done
                  </button>
                </>
              )}

              {status === 'error' && (
                <>
                  <p className="text-red-600">An error occurred during Face ID setup</p>
                  <button
                    onClick={() => setStatus('initial')}
                    className="w-full rounded-md bg-teal-500 px-4 py-2 text-white hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Try Again
                  </button>
                </>
              )}

              {status !== 'success' && (
                <button
                  onClick={handleClose}
                  className="w-full mt-2 rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Toast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </>
  );
} 