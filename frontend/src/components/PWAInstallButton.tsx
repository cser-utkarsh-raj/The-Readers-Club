import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await install();
          } else {
            setShowModal(true);
          }
        }}
        className="px-3 py-2 text-xs font-display-brutal uppercase bg-white text-[#111] border-2 border-[#111] hover:bg-[#F6C90E] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install The Readers Club App"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md bg-white text-[#111] border-[3px] border-[#111] shadow-brutal-lg p-6">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#111]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#E50914]" />
                <h3 className="font-display-brutal text-base uppercase">
                  Install The Readers Club PWA
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close install dialog"
                onClick={() => setShowModal(false)}
                className="p-1 border-2 border-[#111] hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#222]">
              {isIOS ? (
                <p>
                  To install on iPhone or iPad: tap the{' '}
                  <strong>Share</strong> icon in Safari’s toolbar, scroll down,
                  and select <strong>Add to Home Screen</strong>.
                </p>
              ) : (
                <p>
                  The Readers Club is a Progressive Web App with offline
                  reading support. Open this app in a standalone browser tab
                  and select <strong>Install The Readers Club</strong> from the
                  address bar icon (or browser menu &rarr;{' '}
                  <strong>Install App</strong>) to add it to your desktop or
                  home screen.
                </p>
              )}
              <div className="p-3 bg-[#F3EFE6] border-2 border-[#111] font-mono-tech text-xs">
                ✓ Offline Edition Cache · ✓ Standalone Reader Window · ✓ Audio Studio
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="mt-5 w-full py-2.5 bg-[#111] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-[#111] text-[#F6C90E] border-2 border-white px-3.5 py-2 text-xs font-mono-tech font-bold shadow-brutal"
    >
      <WifiOff className="w-4 h-4 text-[#E50914]" />
      <span>Offline Archive Mode — Reading from local cache</span>
    </div>
  );
};
