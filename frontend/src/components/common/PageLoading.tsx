import { useId } from 'react';

interface PageLoadingProps {
  message?: string;
}

export function PageLoading({ message = 'Loading…' }: PageLoadingProps) {
  const id = useId();
  const g1 = `${id}-g1`;
  const g2 = `${id}-g2`;

  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-8 loader-entrance">
        {/* Animated spinner */}
        <div className="relative w-20 h-20">
          {/* Soft ambient glow */}
          <div className="absolute -inset-6 rounded-full bg-blue-400/15 blur-2xl loader-glow" />

          {/* Track ring */}
          <div className="absolute inset-0 rounded-full border-2 border-gray-200/60" />

          {/* Primary gradient arc */}
          <svg
            className="absolute inset-0 w-full h-full loader-spin"
            viewBox="0 0 80 80"
          >
            <defs>
              <linearGradient id={g1} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0" />
                <stop offset="50%" stopColor="#2563eb" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <circle
              cx="40"
              cy="40"
              r="38"
              fill="none"
              stroke={`url(#${g1})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="160 80"
            />
          </svg>

          {/* Secondary arc — counter-rotating */}
          <svg
            className="absolute inset-2.5 w-[calc(100%-20px)] h-[calc(100%-20px)] loader-spin-reverse"
            viewBox="0 0 60 60"
          >
            <defs>
              <linearGradient id={g2} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#93c5fd" stopOpacity="0" />
                <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <circle
              cx="30"
              cy="30"
              r="28"
              fill="none"
              stroke={`url(#${g2})`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="90 90"
            />
          </svg>

          {/* Center orb */}
          <div className="absolute inset-[28%] rounded-full bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25 loader-center-pulse" />
        </div>

        {/* Message + bouncing dots */}
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-gray-500">
            {message}
          </p>
          <div className="flex gap-1.5 justify-center" aria-hidden>
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-300 loader-dot"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-500 loader-dot"
              style={{ animationDelay: '160ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-600 loader-dot"
              style={{ animationDelay: '320ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
