'use client';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: 'green' | 'red' | 'yellow' | 'blue' | 'default';
}

const colors = {
  green: 'text-green-400',
  red: 'text-red-400',
  yellow: 'text-yellow-400',
  blue: 'text-blue-400',
  default: 'text-white',
};

export default function StatCard({ label, value, sub, color = 'default' }: Props) {
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs text-white/40 font-medium uppercase tracking-widest">{label}</span>
      <span className={`text-3xl font-black ${colors[color]}`}>{value}</span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  );
}
