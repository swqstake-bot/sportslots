import React, { useState, useEffect, useRef } from 'react';
import { SvgNetAreaChart } from '../charts/SvgCumulativeCharts';

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
  maxValue: _maxValue, 
  label = 'Value', 
  color = 'var(--app-accent)',
  height = 60
}) => {
  const [data, setData] = useState<DataPoint[]>(() => [{ time: Date.now(), value: currentValue }]);
  const maxDataPoints = 50;
  const lastValueRef = useRef(currentValue);

  useEffect(() => {
    const interval = setInterval(() => {
        setData(prev => {
         const newPoint = { time: Date.now(), value: currentValue };
         const newData = [...prev, newPoint];
         if (newData.length > maxDataPoints) {
           return newData.slice(newData.length - maxDataPoints);
         }
         return newData;
       });
    }, 2000);

    return () => clearInterval(interval);
  }, [currentValue]);

  useEffect(() => {
    if (currentValue !== lastValueRef.current) {
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

  if (data.length < 2) {
    return (
      <div
        className="h-full w-full animate-pulse rounded"
        style={{ background: 'color-mix(in srgb, var(--app-bg-deep) 85%, transparent)' }}
      />
    );
  }

  const values = data.map(d => d.value);
  const last = values[values.length - 1] ?? currentValue;

  return (
    <div style={{ height }} className="w-full select-none" title={`${label}: ${last.toFixed(2)}`}>
      <SvgNetAreaChart
        values={values}
        height={height}
        strokeColor={color}
        lastSignFrom={last}
        maxPathPoints={80}
        title={label}
      />
    </div>
  );
};
