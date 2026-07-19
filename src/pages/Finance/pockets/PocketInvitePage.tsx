import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Mail, Clock } from '@/components/ui/icons';

import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { finance } from '@/api';
import { usePocketInvitePreview } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { msg } from '@/lib/errors';

// Landing page for a shared-pocket invite link (from email). Previews the
// pocket by token, then accepts — the server checks the session email
// matches the invited address, so a wrong-account login gets a clear no.

export default function PocketInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewQ = usePocketInvitePreview(token);
  const p = previewQ.data ?? null;
  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      const res = await finance.acceptPocketInvite({ token });
      qc.invalidateQueries({ queryKey: qk.finance.all });
      navigate(`/finance/pockets/${res.pocket_id}`, { replace: true });
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setAccepting(false);
    }
  };

  let body: React.ReactNode;
  if (previewQ.isLoading) {
    body = <p className="text-sm text-muted-foreground">Checking your invite…</p>;
  } else if (previewQ.isError || !p) {
    body = (
      <>
        <p className="text-sm font-medium">This invite link isn't valid</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been revoked, or the link is incomplete.</p>
      </>
    );
  } else if (p.already_member && p.pocket_id) {
    body = (
      <>
        <p className="text-sm font-medium">You're already in “{p.pocket_name}”</p>
        <Button className="mt-3" onClick={() => navigate(`/finance/pockets/${p.pocket_id}`, { replace: true })}>
          Open pocket
        </Button>
      </>
    );
  } else if (p.status !== 'pending') {
    body = (
      <>
        <p className="text-sm font-medium">
          {p.status === 'accepted' ? 'This invite was already used' : 'This invite was revoked'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask {p.inviter_name} to send a fresh one if you still need in.
        </p>
      </>
    );
  } else if (p.expired) {
    body = (
      <>
        <Clock className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">This invite expired</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Invites last 3 days. Ask {p.inviter_name} to send a new one.
        </p>
      </>
    );
  } else if (!p.email_matches) {
    body = (
      <>
        <Mail className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">This invite was sent to a different email</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with the address {p.inviter_name} invited, then open this link again.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <Users className="mx-auto size-6 text-[hsl(var(--primary))]" />
        <p className="mt-2 text-base font-medium">
          {p.inviter_name} invited you to “{p.pocket_name}”
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.member_count} {p.member_count === 1 ? 'person' : 'people'} splitting expenses.
          You'll see who paid and who owes whom — your own accounts stay private.
        </p>
        <Button className="mt-4" onClick={accept} disabled={accepting}>
          {accepting ? 'Joining…' : 'Accept invite'}
        </Button>
      </>
    );
  }

  return (
    <PageShell title="Pocket invite">
      <div className="mx-auto w-full max-w-md px-3 py-8">
        <div className="rounded-2xl bg-[hsl(var(--surface-container-low))] p-8 text-center">
          {body}
        </div>
      </div>
    </PageShell>
  );
}
