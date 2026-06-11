import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/AuthContext';
import { bookmarks as bookmarksApi, finance, type FinAccount, type FinCategory } from '@/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { M3CookieLoader } from '@/components/ui/shapes';
import { formatMoney, txnAtToParts, partsToTxnAt } from './utils';

const SHARE_KEY = 'sajni:shareText';
const LAST_ACCT_KEY = 'sajni:lastTxnAccount';

/**
 * PWA share-target landing. Android Chrome routes a shared bank/UPI SMS here as
 * `?text=…`. We capture that text immediately (so it survives an auth bounce),
 * gate on auth ourselves (this route lives outside RequireAuth), then hand off
 * to a pre-filled confirm sheet. See the share_target entry in
 * public/favicon/site.webmanifest.
 */
export default function ShareCapturePage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();

  // Capture once on mount — runs even when logged out, before the redirect.
  const [text] = useState<string>(() => {
    const incoming = [params.get('text'), params.get('title'), params.get('url')]
      .filter(Boolean).join('\n').trim();
    if (incoming) {
      try { sessionStorage.setItem(SHARE_KEY, incoming); } catch { /* ignore */ }
      return incoming;
    }
    try { return sessionStorage.getItem(SHARE_KEY) || ''; } catch { return ''; }
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center text-muted-foreground">
        <M3CookieLoader size="xl" tone="primary" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }
  // A shared URL means "save this link", not a bank SMS — branch to the
  // bookmark sheet. Anything else stays on the transaction flow.
  const sharedUrl = extractUrl(text);
  if (sharedUrl) {
    return <BookmarkCapture text={text} url={sharedUrl} />;
  }
  return <Capture text={text} />;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

function extractUrl(text: string): string {
  const m = text.match(URL_RE);
  return m ? m[0] : '';
}

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'dailymotion.com'];

function guessKind(raw: string): 'video' | 'site' {
  try {
    const host = new URL(raw).hostname.replace(/^(www|m)\./, '');
    return VIDEO_HOSTS.includes(host) ? 'video' : 'site';
  } catch {
    return 'site';
  }
}

function BookmarkCapture({ text, url }: { text: string; url: string }) {
  const navigate = useNavigate();
  // Whatever surrounds the URL in the share payload is usually the page
  // title (YouTube shares "Title\nhttps://…"). Server-side fetch fills the
  // rest when this is blank.
  const [title, setTitle] = useState(() =>
    text.replace(URL_RE, '').replace(/\s+/g, ' ').trim().slice(0, 200),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  const done = (route?: string) => {
    try { sessionStorage.removeItem(SHARE_KEY); } catch { /* ignore */ }
    if (route) navigate(route, { replace: true });
  };

  const save = async () => {
    setSaving(true);
    try {
      const b = await bookmarksApi.create({ url, title: title.trim(), note: note.trim() });
      toast.success('Bookmark saved');
      done(`/media?tab=${b.kind === 'video' ? 'videos' : 'sites'}`);
    } catch (e) {
      toast.error('Could not save: ' + (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background grid place-items-start sm:place-items-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => done(`/media?tab=${guessKind(url) === 'video' ? 'videos' : 'sites'}`)}
            className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="serif text-lg font-semibold leading-tight">Save bookmark</h1>
            <p className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3" /> review &amp; save
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-muted/40 p-3 min-w-0">
          <img
            src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
            alt=""
            className="size-8 rounded-md shrink-0 bg-background object-contain"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
          <div className="min-w-0">
            <p className="mono text-xs uppercase tracking-wider text-muted-foreground">{host || 'link'}</p>
            <p className="text-xs text-muted-foreground truncate">{url}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Title" className="col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fetched from the page when left blank"
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="Note" className="col-span-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why save this? Use #tags."
              rows={2}
              maxLength={1000}
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => done('/')} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Capture({ text }: { text: string }) {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [parsing, setParsing] = useState(true);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(() => txnAtToParts(new Date().toISOString()).time);
  const [accountHint, setAccountHint] = useState('');
  const [matched, setMatched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [accP, catP] = await Promise.allSettled([finance.listAccounts(), finance.listCategories()]);
      if (!alive) return;
      const accs = accP.status === 'fulfilled' ? accP.value : [];
      const cats = catP.status === 'fulfilled' ? catP.value : [];
      setAccounts(accs);
      setCategories(cats);

      // Default account: last-used, else first.
      let last = '';
      try { last = localStorage.getItem(LAST_ACCT_KEY) || ''; } catch { /* ignore */ }
      const def = accs.find((a) => String(a.id) === last) || accs[0];
      if (def) setAccountId(String(def.id));

      if (text) {
        try {
          const p = await finance.parseMessage(text);
          if (!alive) return;
          if (p.amount > 0) setAmount(String(p.amount));
          if (p.type === 'income' || p.type === 'expense') setType(p.type);
          if (p.description) setDescription(p.description);
          if (p.note) setNote(p.note);
          // Pre-fill the inferred / learned category (editable).
          if (p.category_id != null) setCategoryId(String(p.category_id));
          // txn_at = parsed date + parsed/fallback time (IST); split for the pickers.
          if (p.txn_at) { const parts = txnAtToParts(p.txn_at); setDate(parts.date); setTime(parts.time); }
          if (p.account_hint) setAccountHint(p.account_hint);
          // Account match now resolved server-side (one source of truth for
          // web + android); pre-select the returned account.
          if (p.account_id != null) {
            setAccountId(String(p.account_id));
            setMatched(true);
          }
        } catch {
          // Parse failed/quota — seed the description so manual entry is easy.
          if (alive) setDescription((d) => d || text.slice(0, 120));
        }
      }
      if (alive) setParsing(false);
    })();
    return () => { alive = false; };
  }, [text]);

  const filteredCats = categories.filter((c) => c.kind === type);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!accountId) { toast.error('Pick an account'); return; }
    if (!(amt > 0)) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await finance.createTransaction({
        account_id: parseInt(accountId),
        type,
        amount: amt,
        description: description.trim(),
        note: note.trim(),
        txn_at: partsToTxnAt(date, time),
        category_id: categoryId ? parseInt(categoryId) : null,
      });
      try { localStorage.setItem(LAST_ACCT_KEY, accountId); } catch { /* ignore */ }
      try { sessionStorage.removeItem(SHARE_KEY); } catch { /* ignore */ }
      toast.success('Transaction added');
      navigate('/finance/transactions', { replace: true });
    } catch (e) {
      toast.error('Could not save: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    try { sessionStorage.removeItem(SHARE_KEY); } catch { /* ignore */ }
    navigate('/finance', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-background grid place-items-start sm:place-items-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={cancel} className="size-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="serif text-lg font-semibold leading-tight">Add from shared message</h1>
            <p className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3" /> {parsing ? 'Sajni reading…' : 'review & save'}
            </p>
          </div>
        </div>

        {text ? (
          <p className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-md p-2 line-clamp-3 whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No message text — fill in the transaction manually.</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* Type */}
          <div className="col-span-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setCategoryId(''); }}
                className={`py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                  type === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <Field label="Amount" className="col-span-2">
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>

          <Field label="Account" className="col-span-2" hint={accountHint ? `${matched ? 'matched' : 'detected'} · ${accountHint}` : undefined}>
            <Select
              value={accountId || null}
              onValueChange={(v) => setAccountId(v ?? '')}
              items={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Category" className="col-span-2">
            <Select
              value={categoryId || 'none'}
              onValueChange={(v) => setCategoryId(!v || v === 'none' ? '' : v)}
              items={[{ value: 'none', label: '— category —' }, ...filteredCats.map((c) => ({ value: String(c.id), label: c.name }))]}
            >
              <SelectTrigger><SelectValue placeholder="— category —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— category —</SelectItem>
                {filteredCats.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Name" className="col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Merchant / who it was with" maxLength={120} />
          </Field>

          <Field label="Note" className="col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Extra context — ref no., purpose. Use #tags." maxLength={1000} />
          </Field>

          <Field label="Date">
            <DatePicker value={date} onChange={setDate} />
          </Field>

          <Field label="Time">
            <TimePicker value={time} onChange={setTime} />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || parsing} className="gap-1.5">
            {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
            Save {amount && parseFloat(amount) > 0 ? formatMoney(parseFloat(amount)) : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, className = '', children, hint }: {
  label: string;
  className?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        {hint && <span className="font-mono text-xs uppercase tracking-wider text-primary">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
