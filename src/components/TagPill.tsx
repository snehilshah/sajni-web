import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface Props {
  tag: string;
}

export default function TagPill({ tag }: Props) {
  return (
    <Link to={`/tags/${encodeURIComponent(tag)}`}>
      <Badge variant="secondary" className="cursor-pointer bg-secondary/40 hover:bg-secondary/70 text-secondary-foreground font-mono text-[10px]">
        #{tag}
      </Badge>
    </Link>
  );
}
