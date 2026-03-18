export const colors = {
  background: '#0A0A0F',
  surface: '#13131A',
  card: '#1C1C28',
  cardBorder: '#2D2D3D',
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  accent: '#8B5CF6',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  overlay: 'rgba(0,0,0,0.75)',
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
};

export const categoryGradients: Record<string, [string, string]> = {
  entrances: ['#1E3A5F', '#0F2040'],
  parking: ['#2D3748', '#1A2232'],
  indoor: ['#1A3A2A', '#0D2018'],
  outdoor: ['#3A2D1A', '#201808'],
  office: ['#1A1A3A', '#0D0D20'],
  warehouse: ['#3A1A1A', '#200808'],
};
