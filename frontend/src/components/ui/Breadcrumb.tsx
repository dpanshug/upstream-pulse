import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbSegment {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm mb-4">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            {segment.to && !isLast ? (
              <Link
                to={segment.to}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                {segment.label}
              </Link>
            ) : (
              <span className="text-gray-600 font-medium">{segment.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
