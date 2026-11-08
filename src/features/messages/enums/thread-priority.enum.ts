export enum ThreadPriority {
  BAJA = 'baja',
  MEDIA = 'media',
  ALTA = 'alta',
}

export const THREAD_PRIORITY_LABELS: Record<ThreadPriority, string> = {
  [ThreadPriority.BAJA]: 'Baja',
  [ThreadPriority.MEDIA]: 'Media',
  [ThreadPriority.ALTA]: 'Alta',
};
