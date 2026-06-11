import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface Props {
  tag: string;
}

export default function TagPill({ tag }: Props) {
  return (
    <Link to={`/tags/${encodeURIComponent(tag)}`}>
      <Badge variant="secondary" className="cursor-pointer bg-[hsl(var(--secondary-container))] hover:bg-[hsl(var(--secondary-container)/0.8)] text-[hsl(var(--on-secondary-container))] text-xs">
        #{tag}
      </Badge>
    </Link>
  );
}
