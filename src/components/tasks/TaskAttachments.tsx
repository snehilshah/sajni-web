import { Image as ImageIcon, Loader2, X } from '@/components/ui/icons';
import { Label } from '@/components/ui/label';

export interface AttachmentTile {
  key: string;
  src: string;
  onRemove: () => void;
}

/** The images pasted, dropped or picked into a task. Hidden until there is one. */
export function TaskAttachments({ tiles, uploading }: { tiles: AttachmentTile[]; uploading: number }) {
  if (tiles.length === 0 && uploading === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-mono label-kicker text-muted-foreground inline-flex items-center gap-1.5">
        <ImageIcon className="size-3" /> Images
      </Label>
      <div className="flex flex-wrap gap-2">
        {tiles.map((t) => (
          <div key={t.key} className="relative size-24 overflow-hidden rounded-xl bg-[hsl(var(--surface-container-high))]">
            <a href={t.src} target="_blank" rel="noreferrer" title="Open image">
              <img src={t.src} alt="" className="size-full object-cover" />
            </a>
            <button
              type="button"
              aria-label="Remove image"
              title="Remove image"
              onClick={t.onRemove}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {uploading > 0 && (
          <div className="flex size-24 items-center justify-center rounded-xl bg-[hsl(var(--surface-container-high))] text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Opens the file picker for images. */
export function pickImages(onPick: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length) onPick(files);
  };
  input.click();
}

/** The image files in a paste or drop. */
export function imageFiles(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'));
}
