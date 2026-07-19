import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, MoreVertical, Pencil, Trash2, Mail, X, Check } from '@/components/ui/icons';

import { finance, type PocketDetail, type PocketMember } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// Who's in the pocket. Anyone can add a text-only person and rename
// themselves; the owner can rename anyone, remove people, and send/revoke
// email invites. Emails are owner-only — members see display names.

interface Props {
  open: boolean;
  pocket: PocketDetail;
  onClose: () => void;
  onChanged: () => void;
  /** Called after the current user leaves the pocket. */
  onLeft: () => void;
}

export default function MembersSheet({ open, pocket, onClose, onChanged, onLeft }: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PocketMember | null>(null);
  const [renameTo, setRenameTo] = useState('');
  // Invite form: memberId null = invite creates a fresh member; a number
  // links the invite to an existing text-only person.
  const [inviteFor, setInviteFor] = useState<number | null | 'new'>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);

  const members = (pocket.members ?? []).filter((m) => !m.left);
  const invites = pocket.invites ?? [];
  const pendingByMember = new Set(invites.map((i) => i.member_id));

  const addPerson = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await finance.addPocketMember(pocket.id, name);
      setNewName('');
      onChanged();
    } catch (e) { toast.error(msg(e)); } finally { setAdding(false); }
  };

  const saveRename = async () => {
    if (!renaming) return;
    const name = renameTo.trim();
    if (!name) return;
    try {
      await finance.renamePocketMember(pocket.id, renaming.id, name);
      setRenaming(null);
      onChanged();
    } catch (e) { toast.error(msg(e)); }
  };

  const remove = async (m: PocketMember) => {
    if (!(await confirmDialog(`Remove ${m.display_name} from "${pocket.name}"? Their past splits stay on record.`))) return;
    try {
      await finance.removePocketMember(pocket.id, m.id);
      onChanged();
    } catch (e) { toast.error(msg(e)); }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || sending) return;
    setSending(true);
    try {
      await finance.createPocketInvite(pocket.id, {
        email,
        ...(typeof inviteFor === 'number' ? { member_id: inviteFor } : {}),
      });
      toast.success(`Invite sent to ${email}`);
      setInviteFor(null);
      setInviteEmail('');
      onChanged();
    } catch (e) { toast.error(msg(e)); } finally { setSending(false); }
  };

  const revoke = async (iid: number) => {
    try {
      await finance.revokePocketInvite(pocket.id, iid);
      onChanged();
    } catch (e) { toast.error(msg(e)); }
  };

  const leave = async () => {
    if (!(await confirmDialog(`Leave "${pocket.name}"? You'll lose access to its expenses. You must be settled up first.`))) return;
    try {
      await finance.leavePocket(pocket.id);
      onLeft();
    } catch (e) { toast.error(msg(e)); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>People</SheetTitle>
          <SheetDescription>
            Everyone here sees the pocket's expenses and balances. Accounts and
            personal ledgers stay private to each person.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 px-4">
          {members.map((m) => {
            const pending = !m.is_registered && pendingByMember.has(m.id);
            const canRename = pocket.is_owner || m.is_me;
            const canRemove = pocket.is_owner && !m.is_me && m.role !== 'owner';
            const canInvite = pocket.is_owner && !m.is_registered && !pending;
            return (
              <div key={m.id} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary-container))] text-sm font-medium text-[hsl(var(--on-secondary-container))]"
                >
                  {(m.display_name[0] || '?').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  {renaming?.id === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        className="h-9"
                        maxLength={60}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                      />
                      <Button size="sm" variant="ghost" className="size-9 shrink-0 p-0" aria-label="Save name" onClick={saveRename}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="size-9 shrink-0 p-0" aria-label="Cancel rename" onClick={() => setRenaming(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{m.display_name}</span>
                        {m.is_me && <span className="text-muted-foreground">(you)</span>}
                        {m.role === 'owner' && (
                          <span className="shrink-0 rounded-full bg-[hsl(var(--primary-container))] px-2 py-0.5 font-mono text-xs text-[hsl(var(--on-primary-container))]">owner</span>
                        )}
                        {pending && (
                          <span className="shrink-0 rounded-full bg-[hsl(var(--surface-container-high))] px-2 py-0.5 font-mono text-xs text-muted-foreground">invited</span>
                        )}
                        {!m.is_registered && !pending && (
                          <span className="shrink-0 rounded-full bg-[hsl(var(--surface-container-high))] px-2 py-0.5 font-mono text-xs text-muted-foreground">no account</span>
                        )}
                      </div>
                      {m.email && (
                        <div className="truncate font-mono text-xs text-muted-foreground">{m.email}</div>
                      )}
                    </>
                  )}
                </div>
                {(canRename || canRemove || canInvite) && renaming?.id !== m.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Options for ${m.display_name}`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canRename && (
                        <DropdownMenuItem onClick={() => { setRenaming(m); setRenameTo(m.display_name); }}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                      )}
                      {canInvite && (
                        <DropdownMenuItem onClick={() => { setInviteFor(m.id); setInviteEmail(''); }}>
                          <Mail /> Invite by email…
                        </DropdownMenuItem>
                      )}
                      {canRemove && (
                        <DropdownMenuItem variant="destructive" onClick={() => remove(m)}>
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}

          {/* Add a text-only person — splittable right away, invitable later. */}
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Add a person by name"
              maxLength={60}
              onKeyDown={(e) => { if (e.key === 'Enter') addPerson(); }}
            />
            <Button variant="outline" onClick={addPerson} disabled={!newName.trim() || adding} aria-label="Add person">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {pocket.is_owner && (
          <div className="mt-4 flex flex-col gap-2 border-t border-border px-4 pt-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Invites</h3>
            {invites.map((inv) => (
              <div key={inv.id} className="flex min-h-11 items-center gap-2 text-sm">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{inv.email}</span>
                {inv.expired ? (
                  <span className="shrink-0 rounded-full bg-[hsl(var(--surface-container-high))] px-2 py-0.5 font-mono text-xs text-muted-foreground">expired</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-[hsl(var(--tertiary-container))] px-2 py-0.5 font-mono text-xs text-[hsl(var(--on-tertiary-container))]">pending</span>
                )}
                <Button size="sm" variant="ghost" className="size-9 shrink-0 p-0" aria-label={`Revoke invite to ${inv.email}`} onClick={() => revoke(inv.id)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {inviteFor !== null ? (
              <div className="flex flex-col gap-1.5">
                {typeof inviteFor === 'number' && (
                  <p className="text-xs text-muted-foreground">
                    Linking to {members.find((m) => m.id === inviteFor)?.display_name} — accepting joins them to this pocket.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }}
                  />
                  <Button onClick={sendInvite} disabled={!inviteEmail.trim() || sending}>
                    {sending ? 'Sending…' : 'Send'}
                  </Button>
                  <Button variant="ghost" className="size-10 p-0" aria-label="Cancel invite" onClick={() => setInviteFor(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  They get a link that expires in 3 days; accepting needs a Sajni login with that exact email.
                </p>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={() => { setInviteFor('new'); setInviteEmail(''); }}>
                <Mail className="size-4 mr-1" /> Invite by email
              </Button>
            )}
          </div>
        )}

        {!pocket.is_owner && (
          <div className="mt-4 border-t border-border px-4 pt-4 pb-4">
            <Button variant="ghost" className="text-destructive" onClick={leave}>
              Leave pocket
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">You can leave once your balance is settled.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
