import { isValidRrule, type Weekday } from "@superset/shared/rrule";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { LuClock } from "react-icons/lu";
import {
	DAY_OPTIONS,
	formatTimeInputValue,
	PRESET_OPTIONS,
	type PresetKind,
	parseTimeInputValue,
	rruleFromState,
	type SchedulePickerState,
	stateFromRrule,
} from "../SchedulePicker/scheduleState";
import { TimezonePicker } from "../TimezonePicker";
import { CHIP, SelectChip } from "../TriggerSentence/chips";

interface ScheduleSentenceProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	timezone: string;
	onTimezoneChange: (timezone: string) => void;
	/** Trailing "Next run ..." text, shown inline at the end of the sentence. */
	nextRun?: ReactNode;
	className?: string;
	disabled?: boolean;
}

/**
 * Sentence-chip schedule editor:
 * "[Daily ▾] at [8:00 AM] · Los Angeles (PDT)", decomposed into inline
 * controls instead of one opaque popover chip.
 */
export function ScheduleSentence({
	rrule,
	onRruleChange,
	timezone,
	onTimezoneChange,
	nextRun,
	className,
	disabled,
}: ScheduleSentenceProps) {
	const [state, setState] = useState<SchedulePickerState>(() =>
		stateFromRrule(rrule),
	);
	// Resync when the rrule changes underneath us (remote edit, version
	// restore) — but not when our own emission echoes back through the row,
	// which would collapse an in-progress Custom edit into a preset.
	const lastEmittedRef = useRef(rrule);
	const [prevRrule, setPrevRrule] = useState(rrule);
	if (rrule !== prevRrule) {
		setPrevRrule(rrule);
		if (rrule !== lastEmittedRef.current) {
			lastEmittedRef.current = rrule;
			setState(stateFromRrule(rrule));
		}
	}

	const emit = (serialized: string) => {
		lastEmittedRef.current = serialized;
		onRruleChange(serialized);
	};

	const update = (patch: Partial<SchedulePickerState>) => {
		const next = { ...state, ...patch };
		if (patch.kind === "custom" && state.kind !== "custom") {
			// Entering Custom mode: seed from the current saved rule (a stale
			// draft from a prior visit would silently mismatch what's persisted).
			next.customRrule = rrule;
		}
		setState(next);
		// Custom text commits on blur/Enter once it validates; presets are
		// always complete rules.
		if (next.kind !== "custom") emit(rruleFromState(next));
	};

	const customDraft = state.customRrule.trim();
	const customValid = useMemo(() => isValidRrule(customDraft), [customDraft]);

	const commitCustom = () => {
		if (!customDraft || customDraft === rrule || !customValid) return;
		emit(customDraft);
	};

	const showsDay = state.kind === "weekly";
	const showsTime =
		state.kind === "daily" ||
		state.kind === "weekdays" ||
		state.kind === "weekly";

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
				<LuClock className="mr-0.5 size-4 shrink-0 text-muted-foreground" />

				<SelectChip
					value={state.kind}
					disabled={disabled}
					options={PRESET_OPTIONS}
					onChange={(value) => update({ kind: value as PresetKind })}
				/>

				{showsDay && (
					<>
						<span className="text-muted-foreground">on</span>
						<SelectChip
							value={state.day}
							disabled={disabled}
							options={DAY_OPTIONS}
							onChange={(value) => update({ day: value as Weekday })}
						/>
					</>
				)}

				{showsTime && (
					<>
						<span className="text-muted-foreground">at</span>
						<input
							type="time"
							disabled={disabled}
							className={cn(
								CHIP,
								"px-2 disabled:opacity-50 dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden",
							)}
							value={formatTimeInputValue(state.hour, state.minute)}
							onChange={(event) => {
								const parsed = parseTimeInputValue(event.target.value);
								if (parsed) update(parsed);
							}}
						/>
					</>
				)}

				<TimezonePicker
					value={timezone}
					disabled={disabled}
					onChange={onTimezoneChange}
				/>

				{nextRun && (
					<span className="ml-1 truncate text-muted-foreground">{nextRun}</span>
				)}
			</div>

			{state.kind === "custom" && (
				<div className="ml-[26px] flex flex-col gap-1">
					<Input
						autoFocus
						disabled={disabled}
						placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
						className="h-8 w-full max-w-md font-mono text-xs"
						value={state.customRrule}
						onChange={(event) => update({ customRrule: event.target.value })}
						onBlur={commitCustom}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitCustom();
						}}
					/>
					{customDraft && !customValid && (
						<span className="select-text cursor-text text-xs text-destructive">
							Invalid recurrence rule — changes aren't saved
						</span>
					)}
				</div>
			)}
		</div>
	);
}
