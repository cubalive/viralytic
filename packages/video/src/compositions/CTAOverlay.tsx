import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export const CTAOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 120 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      left: 32, right: 32, bottom: 200,
      padding: '28px 40px',
      borderRadius: 24,
      background: 'linear-gradient(135deg, #FF0050, #00F2EA)',
      transform: `scale(${scale})`,
      opacity,
      boxShadow: '0 10px 40px rgba(255,0,80,0.5)',
      textAlign: 'center',
      fontFamily: 'Inter, system-ui',
      fontWeight: 900, fontSize: 56,
      color: '#fff',
      textTransform: 'uppercase',
      letterSpacing: 1,
      WebkitTextStroke: '2px rgba(0,0,0,0.3)',
    }}>{text}</div>
  );
};
