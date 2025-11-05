export const enableMixWithOthers = () => {
  if (!import.meta.client) {
    return;
  }

  const win = window as unknown as {
    webkit?: {
      messageHandlers?: {
        audioSession?: {
          postMessage: (message: string) => void;
        };
      };
    };
  };

  try {
    win.webkit?.messageHandlers?.audioSession?.postMessage('mixWithOthers');
  } catch (error) {
    console.warn('Unable to configure iOS audio session:', error);
  }
};
