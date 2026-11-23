import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EMOTION_PROFILES, LINUX_BOOT_LINES } from '../data/emotions';
import type {
  AccessoryId,
  AppearanceSettings,
  LinuAnimation,
  LinuEmotion,
} from '../types/linu';

interface LinuFaceProps {
  emotion: LinuEmotion;
  intensity?: number;
  animation: LinuAnimation;
  isListening: boolean;
  isSpeaking: boolean;
  isResearching: boolean;
  isCameraActive: boolean;
  researchQuery?: string;
  speechLevel?: number; // 0..1 audio energy
  appearance: AppearanceSettings;
  showBoot: boolean;
  onBootComplete?: () => void;
  onFaceClick?: () => void;
}

interface InterpolatedEyeState {
  widthScale: number;
  heightScale: number;
  borderRadius: number;
  upperLid: number;
  lowerLid: number;
  innerTiltDeg: number;
  pupilScale: number;
  pupilOffsetY: number;
  asymmetry: number;
  blushOpacity: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const LinuFace: React.FC<LinuFaceProps> = ({
  emotion,
  intensity = 0.85,
  animation,
  isListening,
  isSpeaking,
  isResearching,
  isCameraActive,
  researchQuery,
  speechLevel = 0,
  appearance,
  showBoot,
  onBootComplete,
  onFaceClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetGazeRef = useRef({ x: 0, y: 0 });
  const currentGazeRef = useRef({ x: 0, y: 0 });
  const blinkRef = useRef({ amount: 0, nextBlinkAt: performance.now() + 2600, closing: false });
  const animTimeRef = useRef(0);

  const targetProfile = useMemo(() => {
    return isResearching ? EMOTION_PROFILES.concentration : EMOTION_PROFILES[emotion] ?? EMOTION_PROFILES.calm;
  }, [emotion, isResearching]);

  const currentStateRef = useRef<InterpolatedEyeState>({
    widthScale: targetProfile.widthScale,
    heightScale: targetProfile.heightScale,
    borderRadius: targetProfile.borderRadius,
    upperLid: targetProfile.upperLid,
    lowerLid: targetProfile.lowerLid,
    innerTiltDeg: targetProfile.innerTiltDeg,
    pupilScale: targetProfile.pupilScale,
    pupilOffsetY: targetProfile.pupilOffsetY,
    asymmetry: targetProfile.asymmetry,
    blushOpacity: targetProfile.blushOpacity,
  });

  const [renderFrame, setRenderFrame] = useState({
    ...currentStateRef.current,
    gazeX: 0,
    gazeY: 0,
    blink: 0,
    headX: 0,
    headY: 0,
    headRotate: 0,
    headScale: 1,
    mouthPulse: 0,
    scanPhase: 0,
  });

  // Boot sequence state
  const [bootLineIdx, setBootLineIdx] = useState(0);
  useEffect(() => {
    if (!showBoot) return;
    setBootLineIdx(0);
    const interval = window.setInterval(() => {
      setBootLineIdx((prev) => {
        if (prev >= LINUX_BOOT_LINES.length - 1) {
          window.clearInterval(interval);
          window.setTimeout(() => {
            onBootComplete?.();
          }, 550);
          return prev;
        }
        return prev + 1;
      });
    }, 340);
    return () => window.clearInterval(interval);
  }, [showBoot, onBootComplete]);

  // Pointer gaze tracking
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width * 0.6)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height * 0.6)));
      targetGazeRef.current = { x: nx, y: ny };
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // Main 60fps organic animation & emotional interpolation loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      animTimeRef.current += dt;
      const t = animTimeRef.current;

      // Smoothly interpolate all facial emotion geometry
      const s = currentStateRef.current;
      const lerpFactor = 1 - Math.exp(-7.5 * dt);

      const intensityScale = 0.65 + 0.35 * Math.max(0.3, Math.min(1, intensity));
      s.widthScale = lerp(s.widthScale, targetProfile.widthScale, lerpFactor);
      s.heightScale = lerp(s.heightScale, targetProfile.heightScale, lerpFactor);
      s.borderRadius = lerp(s.borderRadius, targetProfile.borderRadius, lerpFactor);
      s.upperLid = lerp(s.upperLid, targetProfile.upperLid * intensityScale, lerpFactor);
      s.lowerLid = lerp(s.lowerLid, targetProfile.lowerLid * intensityScale, lerpFactor);
      s.innerTiltDeg = lerp(s.innerTiltDeg, targetProfile.innerTiltDeg * intensityScale, lerpFactor);
      s.pupilScale = lerp(s.pupilScale, targetProfile.pupilScale, lerpFactor);
      s.pupilOffsetY = lerp(s.pupilOffsetY, targetProfile.pupilOffsetY, lerpFactor);
      s.asymmetry = lerp(s.asymmetry, targetProfile.asymmetry, lerpFactor);
      s.blushOpacity = lerp(s.blushOpacity, targetProfile.blushOpacity * intensityScale, lerpFactor);

      // Organic blinking
      const b = blinkRef.current;
      const blinkFreqMult = Math.max(0.4, appearance.blinkSpeed);
      if (now >= b.nextBlinkAt && !isResearching) {
        b.closing = true;
        b.nextBlinkAt = now + (2800 + Math.random() * 2800) / blinkFreqMult;
      }
      if (b.closing) {
        b.amount = Math.min(1, b.amount + dt * 13 * blinkFreqMult);
        if (b.amount >= 1) b.closing = false;
      } else if (b.amount > 0) {
        b.amount = Math.max(0, b.amount - dt * 10 * blinkFreqMult);
      }

      // Autonomous gaze drift + pointer tracking
      let desiredGazeX = targetGazeRef.current.x;
      let desiredGazeY = targetGazeRef.current.y;

      if (isResearching) {
        desiredGazeX = Math.sin(t * 2.8) * 0.48;
        desiredGazeY = 0.38;
      } else if (animation === 'look_around') {
        desiredGazeX = Math.sin(t * 1.6) * 0.65;
        desiredGazeY = Math.cos(t * 1.1) * 0.25;
      } else if (emotion === 'embarrassment') {
        desiredGazeX = -0.35 + Math.sin(t * 0.9) * 0.1;
        desiredGazeY = 0.28;
      } else if (emotion === 'doubt') {
        desiredGazeX = 0.45;
        desiredGazeY = -0.1;
      } else {
        // Subtle micro-saccade life
        desiredGazeX += Math.sin(t * 0.7) * 0.06;
        desiredGazeY += Math.cos(t * 0.53) * 0.04;
      }

      const gazeLerp = 1 - Math.exp(-8 * dt);
      currentGazeRef.current.x = lerp(currentGazeRef.current.x, desiredGazeX, gazeLerp);
      currentGazeRef.current.y = lerp(currentGazeRef.current.y, desiredGazeY, gazeLerp);

      // Head / face kinetic animations
      let headX = 0;
      let headY = Math.sin(t * 1.6) * 3.5; // gentle breathing float
      let headRotate = Math.sin(t * 0.8) * 0.8;
      let headScale = 1;

      if (isResearching) {
        headY = -18 + Math.sin(t * 2.2) * 1.8;
        headScale = 0.95;
      } else {
        switch (animation) {
          case 'celebrate_bounce':
            headY = -Math.abs(Math.sin(t * 5.2)) * 14;
            headRotate = Math.sin(t * 5.2) * 3.2;
            headScale = 1.03;
            break;
          case 'lean_in':
            headY = -4 + Math.sin(t * 1.8) * 2;
            headScale = 1.07;
            break;
          case 'head_tilt':
            headRotate = 6.5 + Math.sin(t * 1.5) * 1.5;
            break;
          case 'nod_yes':
            headY = Math.sin(t * 6.5) * 8;
            break;
          case 'shake_no':
            headX = Math.sin(t * 11) * 7;
            headRotate = Math.sin(t * 11) * 2;
            break;
          case 'shiver_worry':
            headX = Math.sin(t * 24) * 2.2;
            headY = Math.cos(t * 19) * 1.5;
            break;
          case 'giggle_jiggle':
            headY = Math.sin(t * 12) * 4.5;
            headRotate = Math.sin(t * 6) * 2.5;
            break;
          case 'sleep_drift':
            headY = Math.sin(t * 0.85) * 6 + 6;
            headRotate = Math.sin(t * 0.45) * 2.5;
            break;
          case 'sparkle_gaze':
            headY = Math.sin(t * 2.8) * 4;
            headScale = 1.03;
            break;
          default:
            break;
        }
      }

      if (isListening && !isSpeaking && !isResearching) {
        headScale = lerp(headScale, 1.025, 0.5);
      }

      const mouthPulse = isSpeaking
        ? Math.max(0.2, Math.min(1, speechLevel * 1.4 + Math.abs(Math.sin(t * 13)) * 0.45))
        : 0;

      setRenderFrame({
        ...s,
        gazeX: currentGazeRef.current.x,
        gazeY: currentGazeRef.current.y,
        blink: b.amount,
        headX,
        headY,
        headRotate,
        headScale,
        mouthPulse,
        scanPhase: (t * 0.6) % 1,
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    targetProfile,
    intensity,
    animation,
    emotion,
    isResearching,
    isListening,
    isSpeaking,
    speechLevel,
    appearance.blinkSpeed,
  ]);

  // Resolved colors
  const primaryEyeColor = targetProfile.colorShift
    ? targetProfile.colorShift
    : appearance.eyeColor;
  const glowStrength = appearance.glowIntensity;
  const eyeScale = appearance.eyeSize;
  const eyeSeparation = 96 * appearance.eyeSpacing;

  const bgClasses: Record<AppearanceSettings['backgroundStyle'], string> = {
    oled_deep: 'bg-[#030504]',
    emerald_mist: 'bg-gradient-to-b from-[#040B08] via-[#06150E] to-[#030605]',
    carbon_bezel: 'bg-gradient-to-b from-[#0D110F] via-[#060807] to-[#040605]',
    translucent: 'bg-[#050807]/80 backdrop-blur-2xl',
  };

  // Helper to render each eye cleanly inside SVG coordinates (viewBox 0 0 560 360, center 280,180)
  const renderEye = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    const cx = isRight ? 280 + eyeSeparation : 280 - eyeSeparation;
    const cy = isResearching ? 132 : 168;

    const asymBoost = isRight ? 1 - renderFrame.asymmetry * 0.35 : 1 + renderFrame.asymmetry * 0.15;
    const w = 94 * renderFrame.widthScale * eyeScale;
    const h = 114 * renderFrame.heightScale * eyeScale * asymBoost;
    const rx = Math.min(w / 2, h / 2) * renderFrame.borderRadius * 1.15;

    const effectiveUpperLid = Math.min(0.98, Math.max(renderFrame.upperLid, renderFrame.blink));
    const effectiveLowerLid = Math.min(0.92, Math.max(renderFrame.lowerLid, renderFrame.blink * 0.35));
    const tilt = isRight ? -renderFrame.innerTiltDeg : renderFrame.innerTiltDeg;

    const gx = renderFrame.gazeX * 14;
    const gy = renderFrame.gazeY * 11 + renderFrame.pupilOffsetY * 14;

    const arcMode = targetProfile.arcMode;
    const showHappyArc =
      (arcMode === 'happy_up' || arcMode === 'euphoric_up') && renderFrame.blink < 0.4;
    const showWinkArc = targetProfile.winkRight && isRight && renderFrame.blink < 0.4;
    const showSleepArc = arcMode === 'sleep_down';

    const clipId = `eye-clip-${side}`;

    if (showHappyArc || showWinkArc) {
      const arcWidth = w * 0.92;
      const arcDepth = arcMode === 'euphoric_up' ? h * 0.44 : h * 0.32;
      return (
        <g key={side} transform={`translate(${cx + gx * 0.4}, ${cy + gy * 0.3})`}>
          <path
            d={`M ${-arcWidth / 2} ${arcDepth * 0.35} Q 0 ${-arcDepth} ${arcWidth / 2} ${arcDepth * 0.35}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeWidth={14 * eyeScale}
            strokeLinecap="round"
            filter="url(#linu-eye-glow)"
          />
          <path
            d={`M ${-arcWidth / 2} ${arcDepth * 0.35} Q 0 ${-arcDepth} ${arcWidth / 2} ${arcDepth * 0.35}`}
            fill="none"
            stroke="#ECFDF5"
            strokeOpacity={0.55}
            strokeWidth={4 * eyeScale}
            strokeLinecap="round"
          />
        </g>
      );
    }

    if (showSleepArc) {
      const arcWidth = w * 0.85;
      return (
        <g key={side} transform={`translate(${cx}, ${cy + 12})`}>
          <path
            d={`M ${-arcWidth / 2} 0 Q 0 24 ${arcWidth / 2} 0`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.78}
            strokeWidth={9 * eyeScale}
            strokeLinecap="round"
            filter="url(#linu-eye-glow)"
          />
        </g>
      );
    }

    return (
      <g key={side} transform={`translate(${cx}, ${cy})`}>
        <defs>
          <clipPath id={clipId}>
            <rect
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              rx={rx}
              ry={rx}
            />
          </clipPath>
        </defs>

        {/* Soft outer aura */}
        <rect
          x={-w / 2 - 4}
          y={-h / 2 - 4}
          width={w + 8}
          height={h + 8}
          rx={rx + 4}
          ry={rx + 4}
          fill={primaryEyeColor}
          opacity={0.18 * glowStrength * (1 - renderFrame.blink * 0.7)}
          filter="url(#linu-soft-bloom)"
        />

        {/* Eye volume container */}
        <g clipPath={`url(#${clipId})`}>
          {/* Base luminous OLED gradient */}
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx={rx}
            ry={rx}
            fill={`url(#eye-grad-${side})`}
          />

          {/* Inner bright iris / pupil depth */}
          <g transform={`translate(${gx}, ${gy})`}>
            {arcMode === 'heart' ? (
              <path
                d="M 0 18 C -22 2 -32 -14 -16 -24 C -6 -30 0 -20 0 -14 C 0 -20 6 -30 16 -24 C 32 -14 22 2 0 18 Z"
                fill="#D1FAE5"
                opacity={0.85}
                transform={`scale(${0.95 * renderFrame.pupilScale})`}
              />
            ) : arcMode === 'star' ? (
              <path
                d="M 0 -24 L 6 -6 L 24 0 L 6 6 L 0 24 L -6 6 L -24 0 L -6 -6 Z"
                fill="#FFFFFF"
                opacity={0.85}
                transform={`scale(${0.85 * renderFrame.pupilScale})`}
              />
            ) : (
              <ellipse
                cx={0}
                cy={0}
                rx={w * 0.27 * renderFrame.pupilScale}
                ry={h * 0.28 * renderFrame.pupilScale}
                fill="#ECFDF5"
                opacity={0.28}
              />
            )}

            {/* Crisp specular highlight for volume */}
            <ellipse
              cx={-w * 0.16}
              cy={-h * 0.22}
              rx={w * 0.12}
              ry={h * 0.08}
              fill="#FFFFFF"
              opacity={0.65}
              transform="rotate(-18)"
            />
            <circle
              cx={w * 0.14}
              cy={h * 0.18}
              r={Math.max(2.5, w * 0.04)}
              fill="#FFFFFF"
              opacity={0.35}
            />
          </g>

          {/* Upper eyelid mask with emotional tilt */}
          {effectiveUpperLid > 0.01 && (
            <g transform={`rotate(${tilt})`}>
              <rect
                x={-w}
                y={-h * 1.1}
                width={w * 2}
                height={h * (0.6 + effectiveUpperLid * 0.95)}
                fill="#030504"
              />
            </g>
          )}

          {/* Lower eyelid mask */}
          {effectiveLowerLid > 0.01 && (
            <rect
              x={-w}
              y={h / 2 - h * effectiveLowerLid * 0.52}
              width={w * 2}
              height={h}
              fill="#030504"
            />
          )}
        </g>

        {/* Crisp inner rim */}
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={rx}
          ry={rx}
          fill="none"
          stroke={primaryEyeColor}
          strokeOpacity={0.45 * (1 - renderFrame.blink * 0.8)}
          strokeWidth={1.5}
        />
      </g>
    );
  };

  // Render accessory synced to head & eye coordinates
  const renderAccessory = (acc: AccessoryId) => {
    if (acc === 'none') return null;
    const eyeY = isResearching ? 132 : 168;
    const leftX = 280 - eyeSeparation;
    const rightX = 280 + eyeSeparation;

    switch (acc) {
      case 'classic_glasses':
        return (
          <g opacity={0.95} filter="url(#linu-soft-bloom)">
            <rect
              x={leftX - 58}
              y={eyeY - 48}
              width={116}
              height={96}
              rx={28}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={5}
            />
            <rect
              x={rightX - 58}
              y={eyeY - 48}
              width={116}
              height={96}
              rx={28}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={5}
            />
            <path
              d={`M ${leftX + 58} ${eyeY - 6} Q 280 ${eyeY - 16} ${rightX - 58} ${eyeY - 6}`}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={5}
              strokeLinecap="round"
            />
          </g>
        );
      case 'tech_visor':
        return (
          <g>
            <rect
              x={leftX - 72}
              y={eyeY - 54}
              width={eyeSeparation * 2 + 144}
              height={108}
              rx={32}
              fill={appearance.accentColor}
              fillOpacity={0.07}
              stroke={appearance.accentColor}
              strokeOpacity={0.75}
              strokeWidth={3}
            />
            <line
              x1={leftX - 56}
              y1={eyeY - 36}
              x2={leftX - 24}
              y2={eyeY - 36}
              stroke={appearance.accentColor}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={rightX + 46} cy={eyeY - 34} r={3.5} fill={appearance.accentColor} />
          </g>
        );
      case 'studio_headphones':
        return (
          <g>
            <path
              d="M 76 168 C 76 42, 484 42, 484 168"
              fill="none"
              stroke="#334155"
              strokeWidth={14}
              strokeLinecap="round"
            />
            <path
              d="M 82 162 C 82 52, 478 52, 478 162"
              fill="none"
              stroke={appearance.accentColor}
              strokeOpacity={0.45}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <rect x={54} y={124} width={28} height={86} rx={14} fill="#1E293B" stroke="#475569" strokeWidth={2} />
            <rect x={478} y={124} width={28} height={86} rx={14} fill="#1E293B" stroke="#475569" strokeWidth={2} />
            <rect x={58} y={144} width={6} height={46} rx={3} fill={primaryEyeColor} opacity={0.8} />
            <rect x={496} y={144} width={6} height={46} rx={3} fill={primaryEyeColor} opacity={0.8} />
          </g>
        );
      case 'linux_beanie':
        return (
          <g transform="translate(280, 56)">
            <path
              d="M -128 24 C -120 -46, 120 -46, 128 24 Z"
              fill="#14532D"
              stroke="#22C55E"
              strokeOpacity={0.5}
              strokeWidth={2.5}
            />
            <rect x={-136} y={14} width={272} height={24} rx={12} fill="#166534" stroke="#4ADE80" strokeOpacity={0.4} strokeWidth={2} />
            <circle cx={0} cy={-38} r={14} fill={appearance.accentColor} opacity={0.9} />
          </g>
        );
      case 'wifi_antenna':
        return (
          <g transform="translate(280, 56)">
            <line x1={0} y1={18} x2={0} y2={-28} stroke="#64748B" strokeWidth={5} strokeLinecap="round" />
            <circle cx={0} cy={-34} r={8} fill={primaryEyeColor} filter="url(#linu-eye-glow)" />
            <path
              d="M -18 -46 Q 0 -62 18 -46"
              fill="none"
              stroke={appearance.accentColor}
              strokeOpacity={0.65}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <path
              d="M -28 -58 Q 0 -80 28 -58"
              fill="none"
              stroke={appearance.accentColor}
              strokeOpacity={0.35}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        );
      case 'pixel_cap':
        return (
          <g transform="translate(280, 62)">
            <path
              d="M -118 16 C -110 -42, 110 -42, 118 16 Z"
              fill="#1E293B"
              stroke={primaryEyeColor}
              strokeOpacity={0.55}
              strokeWidth={2.5}
            />
            <path
              d="M -112 16 L 146 16 C 154 16, 154 28, 138 28 L -112 24 Z"
              fill="#0F172A"
              stroke={primaryEyeColor}
              strokeOpacity={0.5}
              strokeWidth={2}
            />
            <rect x={-16} y={-14} width={32} height={16} rx={4} fill={primaryEyeColor} opacity={0.85} />
          </g>
        );
      default:
        return null;
    }
  };

  // Render subtle expressive mouth / voice wave
  const renderMouth = () => {
    if (isResearching) return null;
    const my = 258;
    const mx = 280;

    if (isSpeaking) {
      const amp = 6 + renderFrame.mouthPulse * 14;
      return (
        <g transform={`translate(${mx}, ${my})`} opacity={0.9}>
          <path
            d={`M -34 0 Q -17 ${-amp} 0 0 T 34 0`}
            fill="none"
            stroke={primaryEyeColor}
            strokeWidth={4.5}
            strokeLinecap="round"
            filter="url(#linu-soft-bloom)"
          />
          <path
            d={`M -26 0 Q -13 ${amp * 0.65} 0 0 T 26 0`}
            fill="none"
            stroke={appearance.accentColor}
            strokeOpacity={0.6}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
      );
    }

    switch (targetProfile.mouthType) {
      case 'smile':
        return (
          <path
            d={`M ${mx - 22} ${my - 4} Q ${mx} ${my + 16} ${mx + 22} ${my - 4}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.72}
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      case 'big_grin':
        return (
          <path
            d={`M ${mx - 28} ${my - 6} Q ${mx} ${my + 22} ${mx + 28} ${my - 6} Z`}
            fill={primaryEyeColor}
            fillOpacity={0.28}
            stroke={primaryEyeColor}
            strokeOpacity={0.88}
            strokeWidth={3.5}
            strokeLinejoin="round"
          />
        );
      case 'o_surprise':
        return (
          <ellipse
            cx={mx}
            cy={my + 2}
            rx={9}
            ry={11}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.75}
            strokeWidth={3.5}
          />
        );
      case 'sad_frown':
        return (
          <path
            d={`M ${mx - 18} ${my + 8} Q ${mx} ${my - 8} ${mx + 18} ${my + 8}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.65}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      case 'wavy_uncertain':
        return (
          <path
            d={`M ${mx - 20} ${my} Q ${mx - 10} ${my - 6} ${mx} ${my} T ${mx + 20} ${my}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.7}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      case 'smirk':
        return (
          <path
            d={`M ${mx - 14} ${my + 2} Q ${mx + 6} ${my + 10} ${mx + 22} ${my - 4}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.78}
            strokeWidth={3.8}
            strokeLinecap="round"
          />
        );
      case 'flat_focus':
        return (
          <line
            x1={mx - 14}
            y1={my + 2}
            x2={mx + 14}
            y2={my + 2}
            stroke={primaryEyeColor}
            strokeOpacity={0.45}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      default:
        return (
          <path
            d={`M ${mx - 12} ${my} Q ${mx} ${my + 6} ${mx + 12} ${my}`}
            fill="none"
            stroke={primaryEyeColor}
            strokeOpacity={0.42}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        );
    }
  };

  // Exclusive Research Miniature Computer Overlay (shown ONLY during real internet research)
  const renderResearchComputer = () => {
    if (!isResearching) return null;
    const scanX = -62 + renderFrame.scanPhase * 124;

    return (
      <g transform="translate(280, 255)">
        {/* Ambient green workbench glow */}
        <ellipse cx={0} cy={38} rx={125} ry={22} fill={primaryEyeColor} opacity={0.14} filter="url(#linu-soft-bloom)" />

        {/* Floating document windows */}
        <g transform="translate(-112, -26)">
          <rect x={0} y={0} width={54} height={42} rx={7} fill="#06120C" stroke={primaryEyeColor} strokeOpacity={0.55} strokeWidth={1.6} />
          <line x1={8} y1={12} x2={42} y2={12} stroke={appearance.accentColor} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={8} y1={21} x2={34} y2={21} stroke={primaryEyeColor} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
          <line x1={8} y1={30} x2={44} y2={30} stroke={primaryEyeColor} strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />
        </g>

        <g transform="translate(58, -32)">
          <rect x={0} y={0} width={58} height={44} rx={7} fill="#06120C" stroke={primaryEyeColor} strokeOpacity={0.55} strokeWidth={1.6} />
          <circle cx={14} cy={14} r={5} fill="none" stroke={appearance.accentColor} strokeWidth={2} />
          <line x1={18} y1={18} x2={22} y2={22} stroke={appearance.accentColor} strokeWidth={2} strokeLinecap="round" />
          <line x1={26} y1={14} x2={48} y2={14} stroke={primaryEyeColor} strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
          <line x1={10} y1={28} x2={48} y2={28} stroke={primaryEyeColor} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
          <line x1={10} y1={35} x2={38} y2={35} stroke={primaryEyeColor} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
        </g>

        {/* Central miniature Linux laptop */}
        <rect x={-52} y={-18} width={104} height={64} rx={8} fill="#050D09" stroke={primaryEyeColor} strokeWidth={2.2} />
        <rect x={-44} y={-10} width={88} height={46} rx={4} fill="#030705" />

        {/* Screen terminal & scan lines */}
        <line x1={-36} y1={0} x2={12} y2={0} stroke={appearance.accentColor} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={-36} y1={10} x2={28} y2={10} stroke={primaryEyeColor} strokeOpacity={0.7} strokeWidth={2.2} strokeLinecap="round" />
        <line x1={-36} y1={20} x2={4} y2={20} stroke={primaryEyeColor} strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" />
        <line x1={-36} y1={30} x2={34} y2={30} stroke={appearance.accentColor} strokeOpacity={0.65} strokeWidth={2.2} strokeLinecap="round" />

        {/* Active sweeping scanner */}
        <line
          x1={Math.max(-42, Math.min(42, scanX))}
          y1={-8}
          x2={Math.max(-42, Math.min(42, scanX))}
          y2={34}
          stroke="#ECFDF5"
          strokeOpacity={0.45}
          strokeWidth={2}
        />

        {/* Laptop keyboard base */}
        <path d="M -64 46 L 64 46 L 74 58 L -74 58 Z" fill="#0B1912" stroke={primaryEyeColor} strokeOpacity={0.7} strokeWidth={2} />
        <line x1={-16} y1={52} x2={16} y2={52} stroke={appearance.accentColor} strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      onClick={onFaceClick}
      style={{ opacity: appearance.transparency }}
      className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden transition-colors duration-700 ${
        bgClasses[appearance.backgroundStyle]
      }`}
    >
      {/* Subtle ambient glow behind LINU's face */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at 50% 48%, ${primaryEyeColor}18 0%, transparent 62%)`,
          opacity: Math.min(1, 0.55 * glowStrength),
        }}
      />

      {/* Rounded OLED robotic housing */}
      <div
        className={`relative w-full h-full flex items-center justify-center ${
          appearance.windowMode === 'desktop_pet'
            ? 'rounded-[48px] border border-emerald-500/20 shadow-[0_24px_80px_rgba(0,0,0,0.85)]'
            : 'rounded-[36px]'
        } overflow-hidden`}
      >
        {appearance.scanlines && (
          <div className="pointer-events-none absolute inset-0 oled-scanlines opacity-55 z-10" />
        )}

        {/* Boot Sequence Screen */}
        {showBoot ? (
          <div className="relative z-20 flex flex-col items-start justify-center max-w-md px-8 py-6 font-mono text-xs sm:text-sm text-emerald-400/90 space-y-2">
            {LINUX_BOOT_LINES.slice(0, bootLineIdx + 1).map((line, i) => (
              <div
                key={line}
                className={`${
                  i === LINUX_BOOT_LINES.length - 1 ? 'text-lime-300 font-medium pt-1' : 'text-emerald-400/80'
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        ) : (
          <svg
            viewBox="0 0 560 360"
            className="w-full h-full max-w-[920px] max-h-[680px] overflow-visible"
            role="img"
            aria-label={`Rostro de LINU expresando ${targetProfile.labelEs}`}
          >
            <defs>
              <radialGradient id="eye-grad-left" cx="45%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#A7F3D0" stopOpacity="0.95" />
                <stop offset="45%" stopColor={primaryEyeColor} stopOpacity="1" />
                <stop offset="100%" stopColor="#047857" stopOpacity="0.95" />
              </radialGradient>
              <radialGradient id="eye-grad-right" cx="45%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#A7F3D0" stopOpacity="0.95" />
                <stop offset="45%" stopColor={primaryEyeColor} stopOpacity="1" />
                <stop offset="100%" stopColor="#047857" stopOpacity="0.95" />
              </radialGradient>

              <filter id="linu-eye-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={6 * glowStrength} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="linu-soft-bloom" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={12 * glowStrength} />
              </filter>
            </defs>

            {/* Head kinematic group */}
            <g
              transform={`translate(${renderFrame.headX}, ${renderFrame.headY}) rotate(${renderFrame.headRotate} 280 180) translate(280 180) scale(${renderFrame.headScale}) translate(-280 -180)`}
            >
              {/* Soft cheek blush */}
              {renderFrame.blushOpacity > 0.02 && (
                <g opacity={renderFrame.blushOpacity}>
                  <ellipse
                    cx={280 - eyeSeparation - 16}
                    cy={232}
                    rx={24}
                    ry={10}
                    fill="#FB7185"
                    filter="url(#linu-soft-bloom)"
                  />
                  <ellipse
                    cx={280 + eyeSeparation + 16}
                    cy={232}
                    rx={24}
                    ry={10}
                    fill="#FB7185"
                    filter="url(#linu-soft-bloom)"
                  />
                </g>
              )}

              {/* Eyes */}
              {renderEye('left')}
              {renderEye('right')}

              {/* Accessories */}
              {renderAccessory(appearance.accessory)}

              {/* Mouth / Speech wave */}
              {renderMouth()}

              {/* Exclusive Research Miniature Computer */}
              {renderResearchComputer()}
            </g>
          </svg>
        )}

        {/* Research query subtle caption */}
        {isResearching && researchQuery && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-20 text-xs font-mono text-emerald-300/80 tracking-wide whitespace-nowrap max-w-[85%] truncate">
            Investigando: {researchQuery}
          </div>
        )}

        {/* Hardware Live Indicators (Strictly functional, only when active) */}
        <div className="pointer-events-none absolute top-5 left-6 z-20 flex items-center gap-4 text-xs font-medium">
          {isListening && (
            <div className="flex items-center gap-2 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Micrófono activo</span>
            </div>
          )}
          {isCameraActive && (
            <div className="flex items-center gap-2 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Cámara activa</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
