import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface BetGraphProps {
  currentValue: number;
  maxValue?: number;
  label?: string;
  color?: string;
  height?: number;
}

interface DataPoint {
  time: number;
  value: number;
}

export const BetGraph: React.FC<BetGraphProps> = ({ 
  currentValue, 
  maxValue, 
  label = 'Value', 
  color = '#00e701', // Stake Green
  height = 60
}) => {
  const [data, setData] = useState<DataPoint[]>(() => [{ time: Date.now(), value: currentValue }]);
  const maxDataPoints = 50; // Keep last 50 points for smooth rendering
  const lastValueRef = useRef(currentValue);

  // Update data when currentValue changes or periodically
  useEffect(() => {
    // Only add point if value changed or it's been a while (to keep graph moving)
    // For now, let's just add points on interval to show "live" feel even if static
    const interval = setInterval(() => {
        setData(prev => {
         const newPoint = { time: Date.now(), value: currentValue };
         const newData = [...prev, newPoint];
         if (newData.length > maxDataPoints) {
           return newData.slice(newData.length - maxDataPoints);
         }
         return newData;
       });
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [currentValue]);

  // Also update immediately if value changes significantly
  useEffect(() => {
    if (currentValue !== lastValueRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(prev => {
        const newPoint = { time: Date.now(), value: currentValue };
        const newData = [...prev, newPoint];
        if (newData.length > maxDataPoints) {
          return newData.slice(newData.length - maxDataPoints);
        }
        return newData;
      });
      lastValueRef.current = currentValue;
    }
  }, [currentValue]);

  if (data.length < 2) return <div className="h-full w-full bg-[#0f212e] animate-pulse rounded" />;

  const minVal = Math.min(...data.map(d => d.value)) * 0.95;
  const maxVal = maxValue || Math.max(...data.map(d => d.value)) * 1.05;

  return (
    <div style={{ height }} className="w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="time" 
            hide 
            domain={['dataMin', 'dataMax']} 
          />
          <YAxis 
            hide 
            domain={[minVal, maxVal]} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a2c38', borderColor: '#2f4553', fontSize: '10px', color: '#b1bad3' }}
            itemStyle={{ color: '#white' }}
            labelFormatter={() => ''}
            formatter={(value: any) => [value.toFixed(2), label]}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            fillOpacity={1} 
            fill={`url(#gradient-${label})`} 
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
