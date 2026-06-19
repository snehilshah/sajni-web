import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Sparkles, CheckSquare, BookOpen, ArrowRight, Clock, Flame, Quote, Bell } from '@/components/ui/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { journal as journalApi } from '@/api';
import { useTasks, useToggleTaskStatus, useCreateTask } from '@/queries/tasks';
import { useHabits, useHabitRecentLogs, useToggleHabitLog } from '@/queries/habits';
import { useMemos, useCreateMemo } from '@/queries/memos';
import { useJournalList, useSaveJournal } from '@/queries/journal';
import { M3CookieLoader } from '@/components/ui/shapes';
import { Textarea } from '@/components/ui/textarea';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import MissedBanner from '@/components/tasks/MissedBanner';

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

	// Cached reads — refetch automatically when their roots are invalidated
	// (post-mutation here, or via the AI InvalidateBridge).
	const { data: dueToday = [] } = useTasks({ smart: 'my_day' });
	const { data: habitsList = [] } = useHabits();
	const { data: recentLogsMap = {} } = useHabitRecentLogs(14);
	const { data: memosData = [] } = useMemos();
	const { data: journalData = [] } = useJournalList();

	const recentMemos = (memosData as Memo[]).slice(0, 3);
	const recentJournal = (journalData as JournalMeta[]).slice(0, 4);

	// /habits already carries logged_today, so the day status is derived.
	const habitStatus: HabitDayStatus[] = habitsList.map((h) => ({
		id: h.id, name: h.name, color: h.color, logged: h.logged_today,
	}));

	const toggleTask = useToggleTaskStatus();
	const toggleHabit = useToggleHabitLog(today);
	const createMemo = useCreateMemo();
	const createTask = useCreateTask();
	const saveJournal = useSaveJournal();

	// Derive the per-habit completion for the current calendar week (Mon..Sun),
	// so today sits in its real weekday slot rather than always at the end.
	const habitWeek = useMemo(() => {
		const week: Record<number, boolean[]> = {};
		if (habitsList.length === 0) return week;
		const todayDate = new Date();
		const monday = new Date(todayDate);
		monday.setDate(monday.getDate() - ((todayDate.getDay() + 6) % 7));
		const dayKeys: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(monday);
			d.setDate(monday.getDate() + i);
			dayKeys.push(format(d, 'yyyy-MM-dd'));
		}
		for (const h of habitsList) {
			const set = new Set(recentLogsMap[String(h.id)] ?? []);
			week[h.id] = dayKeys.map((k) => set.has(k));
		}
		return week;
	}, [habitsList, recentLogsMap]);

	const greeting =
		hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Winding down';

	const habitsLeft = habitStatus.filter((h) => !h.logged).length;
	const habitsDone = habitStatus.filter((h) => h.logged).length;
	const totalHabitsToday = habitStatus.length;
	const dueOpen = dueToday.filter((t) => t.status !== 'done' && t.status !== 'scratched');

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
				await createMemo.mutateAsync({ content: text });
			} else if (captureKind === 'task') {
				await createTask.mutateAsync({ title: text, due_date: today });
			} else if (captureKind === 'journal') {
				// Append onto today's entry if present, else create.
				const existing = await journalApi.get(today).catch(() => null as any);
				const next = existing?.content ? `${existing.content}\n\n${text}` : text;
				await saveJournal.mutateAsync({ date: today, content: next, mood: existing?.mood ?? null });
			}
			setCapture('');
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
		<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
		<div className="page-fade-in max-w-6xl w-full mx-auto px-6 md:px-14 pt-10 md:pt-14 pb-20">
			{/* Hero */}
			<div className="sajni-stagger">
				<div className="mono text-xs tracking-[0.22em] uppercase text-muted-foreground mb-3">{dateLabel}</div>
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
					<div className="sajni-logo" style={{ width: 22, height: 22, borderRadius: 6 }} />
					<span className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Capture</span>
					<div className="flex-1" />
					<span className="text-xs text-muted-foreground hidden md:inline">I'll route to the right place</span>
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
						{saving ? <M3CookieLoader size="sm" tone="primary" className="!text-primary-foreground" /> : null}
						Save
						<kbd className="mono text-xs px-1 py-px rounded bg-primary-foreground/15 border border-primary-foreground/20 text-primary-foreground/85">
							⌘↵
						</kbd>
					</button>
				</div>
			</div>

			{/* Missed tasks — surfaced up top so yesterday's slips don't vanish.
			    Self-hides when nothing is overdue. */}
			<div className="mt-6">
				<MissedBanner />
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
											onClick={(e) => {
												e.stopPropagation();
												toggleTask.mutate({ id: t.id, status: 'done' });
											}}
											aria-label="Mark complete"
											className="size-4 rounded border-[1.5px] border-muted-foreground shrink-0 hover:border-primary hover:bg-primary/10 transition-colors"
										/>
										<div className="flex-1 min-w-0">
											<div className="text-[14px] text-foreground font-medium truncate">{t.title}</div>
											<div className="flex gap-2 mt-1 text-xs text-muted-foreground">
												{t.scheduled_at ? (
													<span
														className={`mono inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 leading-none ${
															t.remind
																? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
																: 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]'
														}`}
														title={t.remind ? 'Reminder set' : 'Scheduled'}
													>
														{t.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
														{format(parseISO(t.scheduled_at), 'h:mm a')}
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
										<div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/50 text-xs">
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
								<div className="mono text-xs tracking-[0.1em] uppercase text-muted-foreground">
									YOU · {formatDistanceToNow(parseISO(echo.created_at), { addSuffix: true })}
								</div>
							</div>
						</Section>
					)}

					{/* At a glance — kept on the left so the two columns end at
					    roughly the same height. */}
					<Section title="At a glance">
						<div className="rounded-xl p-5 grid grid-cols-2 gap-5 bg-[hsl(var(--surface-container))] border border-border">
							<Stat label="Memos this week" value={String(recentMemos.length === 0 ? 0 : '14')} />
							<Stat label="Tasks closed" value={String(dueToday.filter((t) => t.status === 'done').length)} />
							<Stat label="Journal streak" value={`${recentJournal.length}d`} />
							<Stat label="Habits today" value={`${habitsDone}/${totalHabitsToday}`} />
						</div>
					</Section>
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
									const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
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
												onClick={(e) => {
													e.stopPropagation();
													toggleHabit.mutate({ id: h.id, date: today });
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
														const isToday = idx === todayIdx;
														const isFuture = idx > todayIdx;
														return (
															<div
																key={idx}
																className="rounded-[2px]"
																style={{
																	width: 14,
																	height: isToday ? 6 : 4,
																	background: filled
																		? h.color
																		: isFuture
																			? 'hsl(var(--muted-foreground) / 0.08)'
																			: 'hsl(var(--muted-foreground) / 0.18)',
																	boxShadow: isToday ? '0 0 0 1.5px hsl(var(--primary))' : 'none',
																}}
															/>
														);
													})}
												</div>
											</div>
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
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
							<div className="mono text-xs tracking-[0.18em] uppercase text-primary mb-2.5">
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
				</div>
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
					{hint && <div className="mono text-xs text-muted-foreground mt-0.5">{hint}</div>}
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
			<div className="mono text-xs tracking-[0.12em] uppercase text-muted-foreground mb-1.5">{label}</div>
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
