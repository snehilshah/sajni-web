import { useQuery } from '@tanstack/react-query';
import { tags as tagsApi } from '@/api';
import { qk } from './keys';

export function useTags() {
  return useQuery({ queryKey: qk.tags.list(), queryFn: () => tagsApi.list() });
}

export function useTagEntities(tag?: string) {
  return useQuery({
    queryKey: qk.tags.detail(tag ?? ''),
    queryFn: () => tagsApi.get(tag!),
    enabled: !!tag,
  });
}
