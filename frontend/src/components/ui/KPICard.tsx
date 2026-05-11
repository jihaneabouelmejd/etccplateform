import { cn, formatCurrency } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  icon: LucideIcon;
  color: 'gold' | 'orange' | 'caramel' | 'green' | 'red' | 'blue';
}

const colorMap = {
  gold: { border: 'border-l-honey-gold', bg: 'bg-honey-gold/10', text: 'text-honey-gold' },
  orange: { border: 'border-l-honey-orange', bg: 'bg-honey-orange/10', text: 'text-honey-orange' },
  caramel: { border: 'border-l-honey-caramel', bg: 'bg-honey-caramel/10', text: 'text-honey-caramel' },
  green: { border: 'border-l-status-success', bg: 'bg-green-50', text: 'text-status-success' },
  red: { border: 'border-l-status-danger', bg: 'bg-red-50', text: 'text-status-danger' },
  blue: { border: 'border-l-status-info', bg: 'bg-blue-50', text: 'text-status-info' },
};

const trendColors = {
  up: 'text-status-success',
  down: 'text-status-danger',
  neutral: 'text-honey-caramel',
};

export default function KPICard({ label, value, unit, trend, icon: Icon, color }: KPICardProps) {
  const c = colorMap[color];
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;

  return (
    <div className={cn('kpi-card border-l-[3px]', c.border)}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] font-medium text-honey-caramel uppercase tracking-wide">
          {label}
        </p>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', c.bg)}>
          <Icon size={14} className={c.text} />
        </div>
      </div>

      <p className="text-2xl font-bold text-honey-dark font-mono tracking-tight">
        {value}
        {unit && <span className="text-sm text-honey-caramel font-normal ml-1">{unit}</span>}
      </p>

      {trend && (
        <div className={cn('flex items-center gap-1 mt-1 text-[11px]', trendColors[trend.direction])}>
          <TrendIcon size={10} />
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
}
