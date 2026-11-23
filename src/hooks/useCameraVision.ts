import { useCallback, useState } from 'react';

export function useCameraVision() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const captureSnapshot = useCallback(async (): Promise<string | null> => {
    setCameraError(null);
    let stream: MediaStream | null = null;
    try {
      setIsCameraActive(true);
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(() => resolve()).catch(reject);
        };
        video.onerror = () => reject(new Error('No se pudo inicializar el vídeo de la cámara.'));
      });

      // Brief warm-up for auto-exposure
      await new Promise((r) => setTimeout(r, 380));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contexto 2D no disponible.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
      return dataUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara.';
      setCameraError(msg);
      return null;
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setIsCameraActive(false);
    }
  }, []);

  return {
    isCameraActive,
    cameraError,
    captureSnapshot,
  };
}
