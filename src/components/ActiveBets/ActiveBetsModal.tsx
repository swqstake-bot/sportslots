import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '../../store/uiStore';
import { ActiveBetsPanel } from './ActiveBetsPanel';

interface ActiveBetsModalProps {
  onClose: () => void;
  initialPreviewBetId?: string | null;
}

export function ActiveBetsModal({ onClose, initialPreviewBetId = null }: ActiveBetsModalProps) {
  const currentView = useUiStore((s) => s.currentView);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 flex items-start justify-center pb-8 overflow-y-auto z-[9999] backdrop-blur-sm px-4 sm:px-6"
        data-app-mode={currentView}
        style={{ paddingTop: 120 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <motion.div
          className="w-full max-w-5xl min-h-[52vh] max-h-[calc(100vh-9rem)] flex flex-col shrink-0"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <ActiveBetsPanel
            onClose={onClose}
            initialPreviewBetId={initialPreviewBetId}
            embedded={false}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
