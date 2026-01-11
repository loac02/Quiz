import React, { useEffect, useState, useRef } from 'react';

interface TimerProps {
  duration: number; // in seconds
  onTimeUp: () => void;
  isRunning: boolean;
  isGlobal?: boolean; // If true, timer doesn't reset on re-render unless explicitly told
}

export const Timer: React.FC<TimerProps> = React.memo(({ duration, onTimeUp, isRunning, isGlobal = false }) => {
  const [timeLeftDisplay, setTimeLeftDisplay] = useState(duration);
  
  // Logic Refs
  const startTimeRef = useRef<number | null>(null);
  const remainingAtPauseRef = useRef<number>(duration);
  const requestRef = useRef<number | null>(null);
  const lastSecondRef = useRef<number>(duration);
  const colorPhaseRef = useRef<'green' | 'yellow' | 'red'>('green');

  // DOM Refs
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset Logic
  useEffect(() => {
    if (!isGlobal) {
      setTimeLeftDisplay(duration);
      remainingAtPauseRef.current = duration;
      lastSecondRef.current = duration;
      startTimeRef.current = null;
      colorPhaseRef.current = 'green';
      
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(1)`;
        progressRef.current.className = "h-full origin-left bg-green-500 will-change-transform";
      }
      if (containerRef.current) {
        containerRef.current.classList.remove('animate-pulse');
      }
    }
  }, [duration, isGlobal]);

  useEffect(() => {
    if (!isRunning) {
      // Pause Logic: Save state
      if (startTimeRef.current !== null) {
         const elapsedSinceStart = (performance.now() - startTimeRef.current) / 1000;
         remainingAtPauseRef.current = Math.max(0, remainingAtPauseRef.current - elapsedSinceStart);
         startTimeRef.current = null;
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }

    const animate = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      
      const elapsed = (time - startTimeRef.current) / 1000;
      const remaining = Math.max(0, remainingAtPauseRef.current - elapsed);
      // Clamp progress between 0 and 1
      const progress = Math.min(1, Math.max(0, remaining / duration));

      // 1. Efficient DOM Transform (Runs every frame)
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${progress})`;

        // 2. Optimized Color Updates (Runs only on threshold cross)
        // Prevents thrashing the DOM classList every frame
        if (progress <= 0.2 && colorPhaseRef.current !== 'red') {
             colorPhaseRef.current = 'red';
             progressRef.current.className = "h-full origin-left bg-red-600 transition-colors duration-300";
             containerRef.current?.classList.add('animate-pulse');
        } else if (progress <= 0.5 && progress > 0.2 && colorPhaseRef.current !== 'yellow') {
             colorPhaseRef.current = 'yellow';
             progressRef.current.className = "h-full origin-left bg-yellow-500 transition-colors duration-300";
             containerRef.current?.classList.remove('animate-pulse');
        } else if (progress > 0.5 && colorPhaseRef.current !== 'green') {
             colorPhaseRef.current = 'green';
             progressRef.current.className = "h-full origin-left bg-green-500 transition-colors duration-300";
             containerRef.current?.classList.remove('animate-pulse');
        }
      }

      // 3. Optimized React State Update (Runs only once per second)
      const currentSecond = Math.ceil(remaining);
      if (currentSecond !== lastSecondRef.current) {
        lastSecondRef.current = currentSecond;
        setTimeLeftDisplay(currentSecond);
      }

      // 4. End Condition
      if (remaining <= 0) {
        if (progressRef.current) progressRef.current.style.transform = `scaleX(0)`;
        if (containerRef.current) containerRef.current.classList.remove('animate-pulse');
        setTimeLeftDisplay(0);
        onTimeUp();
      } else {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, duration, onTimeUp]);

  return (
    <div ref={containerRef} className="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative shadow-inner">
      <div 
        ref={progressRef}
        className="h-full origin-left bg-green-500 will-change-transform"
        style={{ transform: 'scaleX(1)', width: '100%' }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <span className="text-xs font-bold text-white drop-shadow-md font-mono z-10">{timeLeftDisplay}s</span>
      </div>
    </div>
  );
});