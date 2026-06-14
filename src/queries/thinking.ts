import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { thinking as thinkingApi } from '@/api';
import { qk } from './keys';

export function useThinkingProjects() {
  return useQuery({ queryKey: qk.thinking.projects(), queryFn: () => thinkingApi.listProjects() });
}

export function useThinkingProject(id: number, enabled = true) {
  return useQuery({
    queryKey: qk.thinking.project(id),
    queryFn: () => thinkingApi.getProject(id),
    enabled,
  });
}

export function useCreateThinkingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description?: string }) => thinkingApi.createProject(data),
    onError: () => toast.error('Could not create project'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.thinking.projects() }),
  });
}

export function useDeleteThinkingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => thinkingApi.deleteProject(id),
    onError: () => toast.error('Could not delete project'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.thinking.all }),
  });
}
