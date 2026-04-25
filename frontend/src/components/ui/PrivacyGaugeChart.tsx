import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface PrivacyGaugeChartProps {
  percentage: number;
  size?: number;
  showLabels?: boolean;
}

const PrivacyGaugeChart: React.FC<PrivacyGaugeChartProps> = ({ 
  percentage, 
  size = 200,
  showLabels = true 
}) => {
  // Color based on percentage
  const getColor = (pct: number) => {
    if (pct >= 90) return '#ef4444'; // Red
    if (pct >= 70) return '#f59e0b'; // Yellow/Amber
    return '#10b981'; // Green
  };

  const remaining = 100 - percentage;
  
  const data = [
    { name: 'Used', value: percentage, color: getColor(percentage) },
    { name: 'Remaining', value: remaining, color: '#e5e7eb' }
  ];

  // Calculate the angles for the gauge
  const startAngle = 180;
  const endAngle = 0;
  const innerRadius = size * 0.3;
  const outerRadius = size * 0.4;

  return (
    <div className="relative" style={{ width: size, height: size * 0.6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="70%"
            startAngle={startAngle}
            endAngle={endAngle}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center text */}
      <div 
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ top: '40%' }}
      >
        <div 
          className="text-2xl font-bold"
          style={{ 
            color: getColor(percentage),
            fontSize: size * 0.12
          }}
        >
          {remaining.toFixed(1)}%
        </div>
        {showLabels && (
          <div 
            className="text-xs text-gray-600 mt-1"
            style={{ fontSize: size * 0.04 }}
          >
            Remaining
          </div>
        )}
      </div>
      
      {/* Scale markers */}
      <div className="absolute inset-0">
        <svg width={size} height={size * 0.6} className="overflow-visible">
          {/* Scale lines */}
          {[0, 25, 50, 75, 100].map((value) => {
            const angle = startAngle + (endAngle - startAngle) * (value / 100);
            const angleRad = (angle * Math.PI) / 180;
            const x1 = size * 0.5 + Math.cos(angleRad) * (outerRadius + 5);
            const y1 = size * 0.7 + Math.sin(angleRad) * (outerRadius + 5);
            const x2 = size * 0.5 + Math.cos(angleRad) * (outerRadius + 10);
            const y2 = size * 0.7 + Math.sin(angleRad) * (outerRadius + 10);
            
            return (
              <line
                key={value}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#9ca3af"
                strokeWidth="1"
              />
            );
          })}
          
          {/* Scale labels */}
          {[0, 25, 50, 75, 100].map((value) => {
            const angle = startAngle + (endAngle - startAngle) * (value / 100);
            const angleRad = (angle * Math.PI) / 180;
            const x = size * 0.5 + Math.cos(angleRad) * (outerRadius + 20);
            const y = size * 0.7 + Math.sin(angleRad) * (outerRadius + 20);
            
            return (
              <text
                key={value}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#6b7280"
                fontSize={size * 0.03}
              >
                {value}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default PrivacyGaugeChart;
