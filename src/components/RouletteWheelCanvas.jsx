import React from 'react';
import { Sparkles } from 'lucide-react';

const SEGMENT_COLORS = [
  '#1e3a8a', // Royal Blue
  '#dc2626', // Vibrant Red
  '#eab308', // Gold Yellow
  '#059669', // Emerald Green
  '#7c3aed', // Purple
  '#ea580c', // Orange
  '#0284c7', // Sky Blue
  '#be123c' // Rose Red
];

/**
 * Shared STL Roulette wheel with golden LED rim, top pointer pin, and ticket labels.
 */
export default function RouletteWheelCanvas({
  wheelRef,
  rotationAngle = 0,
  tickets = [],
  ticketFormat = 'last6'
}) {
  const sliceAngle = tickets.length > 0 ? 360 / tickets.length : 360;

  return (
    <div className="flex flex-col items-center justify-center relative">
      {/* Top Indicator Arrow Pin pointing down */}
      <div className="relative z-20 -mb-4 flex flex-col items-center">
        <div className="w-6 h-8 bg-gradient-to-b from-amber-300 to-red-600 clip-triangle shadow-xl drop-shadow-[0_4px_8px_rgba(239,68,68,0.8)] animate-pulse" />
      </div>

      {/* Golden Outer LED Rim */}
      <div className="relative p-4 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-300 to-amber-700 shadow-[0_0_50px_rgba(245,158,11,0.4)] border-4 border-amber-400">
        <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/40 pointer-events-none animate-spin-slow" />

        <div
          ref={wheelRef}
          style={{ transform: `rotate(${rotationAngle}deg)` }}
          className="relative w-72 h-72 sm:w-96 sm:h-96 rounded-full overflow-hidden shadow-2xl border-4 border-slate-950 will-change-transform"
        >
          <svg viewBox="0 0 400 400" className="w-full h-full">
            {tickets.length > 0 ? (
              tickets.map((ticket, index) => {
                const startAngle = index * sliceAngle;
                const endAngle = (index + 1) * sliceAngle;
                const x1 = 200 + 200 * Math.cos((startAngle * Math.PI) / 180);
                const y1 = 200 + 200 * Math.sin((startAngle * Math.PI) / 180);
                const x2 = 200 + 200 * Math.cos((endAngle * Math.PI) / 180);
                const y2 = 200 + 200 * Math.sin((endAngle * Math.PI) / 180);
                const pathData = tickets.length === 1
                  ? 'M 200, 200 m -200, 0 a 200,200 0 1,0 400,0 a 200,200 0 1,0 -400,0'
                  : `M200,200 L${x1},${y1} A200,200 0 0,1 ${x2},${y2} Z`;
                const midAngle = startAngle + sliceAngle / 2;
                const textX = 200 + 130 * Math.cos((midAngle * Math.PI) / 180);
                const textY = 200 + 130 * Math.sin((midAngle * Math.PI) / 180);
                const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
                const ticketText = ticketFormat === 'last6' ? ticket.slice(-6) : ticket;
                const fontSize = ticketFormat === 'last6'
                  ? (tickets.length > 10 ? '12' : '14')
                  : (tickets.length > 10 ? '8.5' : '10');

                return (
                  <g key={`${ticket}-${index}`}>
                    <path d={pathData} fill={color} stroke="#ffffff" strokeWidth="1.5" />
                    <text
                      x={textX}
                      y={textY}
                      fill="#ffffff"
                      fontSize={fontSize}
                      fontWeight="900"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${midAngle + 90}, ${textX}, ${textY})`}
                      className="drop-shadow-md select-none"
                    >
                      {ticketText}
                    </text>
                  </g>
                );
              })
            ) : (
              <circle cx="200" cy="200" r="200" fill="#1e293b" />
            )}
          </svg>

          {/* Center 3D Golden Spinner Hub */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-200 to-amber-700 border-4 border-white shadow-2xl flex flex-col items-center justify-center text-blue-950 font-black">
              <span className="text-[10px] tracking-widest uppercase text-blue-900 font-extrabold">STL</span>
              <span className="text-xs sm:text-sm font-black">RAFFLE</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
