import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Sparkles, CheckSquare, BookOpen, ArrowRight, Clock, Flame, Quote, Bell } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { tasks as tasksApi, habits as habitsApi, memos as memosApi, journal as journalApi } from '@/api';
import { M3CookieLoader } from '@/components/ui/shapes';
import { Textarea } from '@/components/ui/textarea';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import type { Task, Habit } from '@/types';

interface Memo {
	id: number;
	content: string;
	pinned: boolean;
	tags: string[];
	created_at: string;
	updated_at: string;
}
interface JournalMeta {
	id: number;
	date: string;
	mood?: string | null;
	tags?: string[];
	updated_at: string;
}
interface HabitDayStatus {
	id: number;
	name: string;
	color: string;
	logged: boolean;
}

type CaptureKind = 'memo' | 'task' | 'journal';

// Today is the contextual home. It surfaces what's on deck, what you've
// been thinking, today's habits, and a journal prompt — instead of
// dropping into a search-driven feed.
export default function TodayPage() {
	const navigate = useNavigate();
	const { openTask } = useTaskDetail();

	const [dueToday, setDueToday] = useState<Task[]>([]);
	const [habitStatus, setHabitStatus] = useState<HabitDayStatus[]>([]);
	const [habitsList, setHabitsList] = useState<Habit[]>([]);
	const [habitWeek, setHabitWeek] = useState<Record<number, boolean[]>>({});
	const [recentMemos, setRecentMemos] = useState<Memo[]>([]);
	const [recentJournal, setRecentJournal] = useState<JournalMeta[]>([]);

	const [hour, setHour] = useState(new Date().getHours());
	const [capture, setCapture] = useState('');
	const [captureKind, setCaptureKind] = useState<CaptureKind>('memo');
	const [saving, setSaving] = useState(false);

	const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

	// Tick the hour so the greeting stays fresh.
	useEffect(() => {
		const t = setInterval(() => setHour(new Date().getHours()), 60_000);
		return () => clearInterval(t);
	}, []);

	const refreshTasks = async () => {
		const data = await tasksApi.list({ smart: 'my_day' }).catch(() => [] as Task[]);
		setDueToday(data);
	};
	const refreshHabits = async () => {
		const [status, list] = await Promise.all([
			habitsApi.statusForDate(today).catch(() => [] as HabitDayStatus[]),
			habitsApi.list().catch(() => [] as Habit[]),
		]);
		setHabitStatus(status);
		setHabitsList(list);
	};
	const refreshMemos = async () => {
		const data = await memosApi.list().catch(() => [] as Memo[]);
		setRecentMemos((data as Memo[]).slice(0, 3));
	};
	const refreshJournal = async () => {
		const data = await journalApi.list().catch(() => [] as JournalMeta[]);
		setRecentJournal((data as JournalMeta[]).slice(0, 4));
	};
	const refreshAll = async () => {
		await Promise.all([refreshTasks(), refreshHabits(), refreshMemos(), refreshJournal()]);
	};

	useEffect(() => {
		refreshAll();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Derive the per-habit last-7-days completion (Mon..Sun ending today).
	useEffect(() => {
		if (habitsList.length === 0) return;
		let cancel = false;
		(async () => {
			const week: Record<number, boolean[]> = {};
			const todayDate = new Date();
			const dayKeys: string[] = [];
			for (let i = 6; i >= 0; i--) {
				const d = new Date(todayDate);
				d.setDate(d.getDate() - i);
				dayKeys.push(format(d, 'yyyy-MM-dd'));
			}
			await Promise.all(
				habitsList.map(async (h) => {
					try {
						const logs = await habitsApi.getLogs(h.id, 14);
						const set = new Set(logs);
						week[h.id] = dayKeys.map((k) => set.has(k));
					} catch {
						week[h.id] = dayKeys.map(() => false);
					}
				}),
			);
			if (!cancel) setHabitWeek(week);
		})();
		return () => {
			cancel = true;
		};
	}, [habitsList]);

	// React to AI mutations — refresh only the relevant domain.
	useEffect(() => {
		const onInvalidate = (e: Event) => {
			const kind = (e as CustomEvent).detail?.kind as string | undefined;
			if (!kind) { refreshAll(); return; }
			if (kind.startsWith('task_')) refreshTasks();
			else if (kind.startsWith('habit_')) refreshHabits();
			else if (kind.startsWith('memo_')) refreshMemos();
			else if (kind.startsWith('journal_')) refreshJournal();
		};
		window.addEventListener('data:invalidate', onInvalidate);
		return () => window.removeEventListener('data:invalidate', onInvalidate);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const greeting =
		hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Winding down';

	const habitsLeft = habitStatus.filter((h) => !h.logged).length;
	const habitsDone = habitStatus.filter((h) => h.logged).length;
	const totalHabitsToday = habitStatus.length;
	const dueOpen = dueToday.filter((t) => t.status !== 'done');

	// Agenda order: timed tasks first in clock order, untimed after.
	const dueOpenSorted = useMemo(() => {
		return [...dueOpen].sort((a, b) => {
			const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
			const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
			return at - bt;
		});
	}, [dueOpen]);

	const openTasksCount = dueOpen.length;

	// The "echo" — a memo from 3+ days ago we surface.
	const echo = useMemo(() => {
		if (recentMemos.length === 0) return null;
		const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
		return [...recentMemos].reverse().find((m) => new Date(m.created_at).getTime() < cutoff) || null;
	}, [recentMemos]);

	// Journal prompt — we don't have an AI prompt service yet, so we
	// either show a continuation hint based on yesterday's entry or a
	// gentle default.
	const journalPrompt = useMemo(() => {
		const yesterday = recentJournal.find((j) => j.date < today);
		if (yesterday) {
			return `Yesterday you wrote on ${format(parseISO(yesterday.date), 'MMMM d')}. What's one paragraph you can put down now to keep the thread going?`;
		}
		return "What's one thing you noticed today that you want to remember in a year?";
	}, [recentJournal, today]);

	const handleCapture = async () => {
		const text = capture.trim();
		if (!text || saving) return;
		setSaving(true);
		try {
			if (captureKind === 'memo') {
				await memosApi.create(text);
			} else if (captureKind === 'task') {
				await tasksApi.create({ title: text, due_date: today });
			} else if (captureKind === 'journal') {
				// Append onto today's entry if present, else create.
				try {
					const existing = await journalApi.get(today).catch(() => null as any);
					const next = existing?.content ? `${existing.content}\n\n${text}` : text;
					await journalApi.save(today, next, existing?.mood ?? null);
				} catch {
					await journalApi.save(today, text, null);
				}
			}
			setCapture('');
			if (captureKind === 'memo') refreshMemos();
			else if (captureKind === 'task') refreshTasks();
			else if (captureKind === 'journal') refreshJournal();
		} finally {
			setSaving(false);
		}
	};

	const onCaptureKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			void handleCapture();
		}
	};

	const dateLabel = format(new Date(), 'EEEE, MMMM d');

	return (
		<div className="page-fade-in max-w-6xl w-full mx-auto px-6 md:px-14 pt-10 md:pt-14 pb-20">
			{/* Hero */}
			<div className="sajni-stagger">
				<div className="mono text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">{dateLabel}</div>
				<h1 className="serif text-4xl md:text-[56px] font-normal tracking-[-0.025em] leading-[1.05] text-foreground">
					{greeting}.
				</h1>
				<p className="serif italic text-lg md:text-[28px] font-light tracking-[-0.01em] leading-[1.25] text-muted-foreground mt-2 max-w-[720px]">
					You have{' '}
					<span className="text-foreground not-italic">
						{openTasksCount} {openTasksCount === 1 ? 'thing' : 'things'}
					</span>{' '}
					on deck and{' '}
					<span className="text-foreground not-italic">
						{habitsLeft} {habitsLeft === 1 ? 'habit' : 'habits'}
					</span>{' '}
					left to log.
				</p>
			</div>

			{/* Capture bar */}
			<div className="m3-expressive-panel rounded-xl p-5 mt-9 fade-in">
				<div className="flex items-center gap-2.5 mb-2.5">
					<div className="sajni-orb" style={{ width: 22, height: 22, borderRadius: 6 }} />
					<span className="mono text-[10.5px] tracking-[0.18em] uppercase text-muted-foreground">Capture</span>
					<div className="flex-1" />
					<span className="text-[11px] text-muted-foreground hidden md:inline">I'll route to the right place</span>
				</div>
				<Textarea
					value={capture}
					onChange={(e) => setCapture(e.target.value)}
					onKeyDown={onCaptureKey}
					placeholder="A thought, a task, a #tag… anything."
					rows={2}
					className="text-base leading-[1.55] min-h-[72px]"
				/>
				<div className="flex items-center justify-between mt-1.5 flex-wrap gap-2">
					<div className="flex gap-1.5">
						<CaptureChip
							kind="memo"
							current={captureKind}
							onPick={setCaptureKind}
							icon={<Sparkles className="size-3" />}
							label="Memo"
						/>
						<CaptureChip
							kind="task"
							current={captureKind}
							onPick={setCaptureKind}
							icon={<CheckSquare className="size-3" />}
							label="Task"
						/>
						<CaptureChip
							kind="journal"
							current={captureKind}
							onPick={setCaptureKind}
							icon={<BookOpen className="size-3" />}
							label="Journal"
						/>
					</div>
					<button
						onClick={handleCapture}
						disabled={!capture.trim() || saving}
						className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
					>
						{saving ? <M3CookieLoader size="sm" tone="primary" className="!bg-primary-foreground" /> : null}
						Save
						<kbd className="mono text-[10px] px-1 py-px rounded bg-primary-foreground/15 border border-primary-foreground/20 text-primary-foreground/85">
							⌘↵
						</kbd>
					</button>
				</div>
			</div>

			{/* Two-column grid */}
			<div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-8">
				<div className="sajni-stagger flex flex-col gap-6">
					{/* On deck */}
					<Section
						title="On deck"
						hint={`${dueOpen.length} due today`}
						action={
							<Link
								to="/tasks"
								className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
							>
								Open Tasks <ArrowRight className="size-3" />
							</Link>
						}
					>
						<div className="rounded-xl overflow-hidden bg-[hsl(var(--surface-container))] border border-border">
							{dueOpen.length === 0 ? (
								<div className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing scheduled for today.</div>
							) : (
								dueOpenSorted.map((t, i) => (
									<div
										key={t.id}
										onClick={() => openTask(t.id)}
										role="button"
										tabIndex={0}
										className={`flex items-center gap-3 w-full text-left px-4 md:px-5 py-3.5 hover:bg-[hsl(var(--surface-container-high))] transition-colors cursor-pointer
                    ${i === 0 ? '' : 'border-t border-border/50'}`}
									>
										<button
											type="button"
											onClick={async (e) => {
												e.stopPropagation();
												await tasksApi.update(t.id, { status: 'done' });
												refreshTasks();
											}}
											aria-label="Mark complete"
											className="size-4 rounded border-[1.5px] border-muted-foreground shrink-0 hover:border-primary hover:bg-primary/10 transition-colors"
										/>
										<div className="flex-1 min-w-0">
											<div className="text-[14px] text-foreground font-medium truncate">{t.title}</div>
											<div className="flex gap-2 mt-1 text-[11px] text-muted-foreground">
												{t.scheduled_at ? (
													<span className={`mono inline-flex items-center gap-1 ${t.remind ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--tertiary))]'}`}>
														<Clock className="size-3" /> {format(parseISO(t.scheduled_at), 'h:mm a')}
														{t.remind && <Bell className="size-2.5 fill-current" />}
													</span>
												) : t.due_date ? (
													<span className="mono inline-flex items-center gap-1">
														<Clock className="size-3" /> {format(parseISO(t.due_date), 'MMM d')}
													</span>
												) : null}
												{t.tags?.slice(0, 3).map((tag) => (
													<span key={tag} className="text-primary/80">
														#{tag}
													</span>
												))}
											</div>
										</div>
										<span
											className={`chip ${t.priority === 'high' ? 'chip-rose' : t.priority === 'medium' ? 'chip-amber' : ''}`}
										>
											{t.priority}
										</span>
									</div>
								))
							)}
						</div>
					</Section>

					{/* Recent thinking */}
					<Section
						title="Recent thinking"
						hint="last few captures"
						action={
							<Link
								to="/memos"
								className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
							>
								All memos <ArrowRight className="size-3" />
							</Link>
						}
					>
						<div className="flex flex-col gap-2.5">
							{recentMemos.length === 0 ? (
								<div className="rounded-xl px-5 py-6 text-center text-sm text-muted-foreground bg-[hsl(var(--surface-container))] border border-border">
									Nothing captured yet — try the bar above.
								</div>
							) : (
								recentMemos.map((m) => (
									<div key={m.id} className="rounded-xl p-4 bg-[hsl(var(--surface-container))] border border-border hover:border-border transition-colors">
										<div className="prose-sajni text-[14.5px] leading-[1.55] line-clamp-3">
											<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
										</div>
										<div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/50 text-[10.5px]">
											<span className="mono text-muted-foreground">
												{formatDistanceToNow(parseISO(m.created_at), { addSuffix: true })}
											</span>
											{m.tags?.map((t) => (
												<span key={t} className="chip chip-sage">
													#{t}
												</span>
											))}
										</div>
									</div>
								))
							)}
						</div>
					</Section>

					{/* Echo from earlier */}
					{echo && (
						<Section title="Echo from earlier" hint="surfaced from a few days ago">
							<div className="sajni-spot rounded-xl p-5 bg-[hsl(var(--surface-container))] border border-border">
								<Quote className="size-4 text-secondary mb-2.5" />
								<p className="serif italic text-[17px] leading-[1.55] text-foreground/85 mb-3">
									{echo.content
										.replace(/\*\*/g, '')
										.replace(/\[\[|\]\]/g, '')
										.slice(0, 220)}
								</p>
								<div className="mono text-[10.5px] tracking-[0.1em] uppercase text-muted-foreground">
									YOU · {formatDistanceToNow(parseISO(echo.created_at), { addSuffix: true })}
								</div>
							</div>
						</Section>
					)}
				</div>

				<div className="sajni-stagger flex flex-col gap-6">
					{/* Today's habits */}
					<Section title="Today's habits" hint={totalHabitsToday > 0 ? `${habitsDone}/${totalHabitsToday} done` : undefined}>
						<div className="rounded-xl p-4 bg-[hsl(var(--surface-container))] border border-border">
							{habitStatus.length === 0 ? (
								<div className="text-sm text-muted-foreground text-center py-2">No habits yet.</div>
							) : (
								habitStatus.map((h, i) => {
									const week = habitWeek[h.id] || [];
									const habit = habitsList.find((x) => x.id === h.id);
									const streak = habit?.current_streak ?? 0;
									return (
										<div
											key={h.id}
											onClick={() => navigate(`/habits?focus=${h.id}`)}
											role="button"
											tabIndex={0}
											className={`flex items-center gap-3 py-2.5 cursor-pointer hover:bg-[hsl(var(--surface-container-high))] -mx-2 px-2 rounded-md transition-colors ${i === 0 ? '' : 'border-t border-border/40'}`}
										>
											<button
												onClick={async (e) => {
													e.stopPropagation();
													await habitsApi.toggleLogForDate(h.id, today);
													refreshHabits();
												}}
												className="size-[26px] rounded-lg flex items-center justify-center transition-all"
												style={{
													background: h.logged ? h.color : 'transparent',
													border: `1.5px solid ${h.logged ? h.color : 'hsl(var(--muted-foreground))'}`,
													color: 'hsl(var(--primary-foreground))',
												}}
												title={h.logged ? 'Unmark' : 'Mark done'}
											>
												{h.logged && (
													<svg
														viewBox="0 0 12 12"
														className="size-3"
														fill="none"
														stroke="currentColor"
														strokeWidth="2.5"
													>
														<path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
													</svg>
												)}
											</button>
											<div className="flex-1 min-w-0">
												<div className="text-[13.5px] text-foreground font-medium truncate">{h.name}</div>
												<div className="flex items-center gap-1.5 mt-1">
													{Array.from({ length: 7 }).map((_, idx) => {
														const filled = week[idx];
														return (
															<div
																key={idx}
																className="rounded-[2px]"
																style={{
																	width: 14,
																	height: 4,
																	background: filled ? h.color : 'hsl(var(--muted-foreground) / 0.18)',
																}}
															/>
														);
													})}
												</div>
											</div>
											<div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
												<Flame className="size-3 text-secondary" />
												<span className="mono">{streak}</span>
											</div>
										</div>
									);
								})
							)}
						</div>
					</Section>

					{/* Journal prompt */}
					<Section title="Today's prompt">
						<div
							className="rounded-xl p-5 bg-[hsl(var(--surface-container))] border border-border"
							style={{ background: 'hsl(var(--surface-container))' }}
						>
							<div className="mono text-[9.5px] tracking-[0.18em] uppercase text-primary mb-2.5">
								continued from yesterday
							</div>
							<p className="serif italic text-[18px] leading-[1.45] text-foreground mb-3.5">{journalPrompt}</p>
							<button
								onClick={() => navigate('/journal')}
								className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-border bg-background/50 hover:bg-background text-[13px] text-foreground/85 transition-colors"
							>
								Write today's entry
								<ArrowRight className="size-3" />
							</button>
						</div>
					</Section>

					{/* At a glance */}
					<Section title="At a glance">
						<div className="rounded-xl p-5 grid grid-cols-2 gap-5 bg-[hsl(var(--surface-container))] border border-border">
							<Stat label="Memos this week" value={String(recentMemos.length === 0 ? 0 : '14')} />
							<Stat label="Tasks closed" value={String(dueToday.filter((t) => t.status === 'done').length)} />
							<Stat label="Journal streak" value={`${recentJournal.length}d`} />
							<Stat label="Habits today" value={`${habitsDone}/${totalHabitsToday}`} />
						</div>
					</Section>
				</div>
			</div>
		</div>
	);
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
	return (
		<section>
			<div className="flex items-baseline justify-between gap-3 mb-3.5">
				<div>
					<h2 className="serif text-[20px] font-semibold tracking-[-0.01em] leading-tight">{title}</h2>
					{hint && <div className="mono text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground mb-1.5">{label}</div>
			<div className="serif text-2xl font-medium tracking-[-0.01em] tabular-nums">{value}</div>
		</div>
	);
}

function CaptureChip({
	kind,
	current,
	onPick,
	icon,
	label,
}: {
	kind: CaptureKind;
	current: CaptureKind;
	onPick: (k: CaptureKind) => void;
	icon: React.ReactNode;
	label: string;
}) {
	const active = current === kind;
	return (
		<button onClick={() => onPick(kind)} className={`chip transition-colors ${active ? 'chip-sage' : ''}`}>
			{icon} {label}
		</button>
	);
}
