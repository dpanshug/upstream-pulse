import { AlertTriangle, RefreshCw } from 'lucide-react';

interface PageErrorProps {
  title?: string;
  message?: string;
  hint?: string;
  onRetry?: () => void;
}

export function PageError({
  title = 'Something went wrong',
  message = 'An unexpected error occurred.',
  hint,
  onRetry,
}: PageErrorProps) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="loader-entrance max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          {/* Icon */}
          <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-5">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>

          {/* Content */}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{message}</p>

          {hint && (
            <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-4 py-2.5 inline-block">
              {hint}
            </p>
          )}

          {/* Retry button */}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-sm shadow-blue-500/20 transition-all active:scale-[0.97]"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
