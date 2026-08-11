"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

const BAR_SPACING = 4;
const BAR_WIDTH = 2;
const BAR_INTERVAL_MS = 60;
const AMPLITUDE_SCALE = 10;
const SILENCE_FLOOR = 0.0025;
const SILENCE_ALPHA = 0.35;

export type DictationStatus = "idle" | "recording" | "transcribing";

export type UseDictationOptions = {
	transcribe: (audio: Blob) => Promise<string> | string;
	onTranscript: (text: string) => void;
};

export type Dictation = {
	status: DictationStatus;
	seconds: number;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	start: () => Promise<void>;
	finish: () => Promise<void>;
};

export function useDictation({
	transcribe,
	onTranscript,
}: UseDictationOptions): Dictation {
	const [status, setStatus] = useState<DictationStatus>("idle");
	const [seconds, setSeconds] = useState(0);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sessionRef = useRef<{
		stream: MediaStream;
		recorder: MediaRecorder;
		audioContext: AudioContext;
		chunks: Blob[];
		frame: number;
	} | null>(null);
	const historyRef = useRef<number[]>([]);
	const bucketPeakRef = useRef(0);
	const nextBarAtRef = useRef(0);
	const startedAtRef = useRef(0);

	useEffect(() => {
		return () => {
			const session = sessionRef.current;
			if (!session) return;
			cancelAnimationFrame(session.frame);
			for (const track of session.stream.getTracks()) track.stop();
			session.audioContext.close().catch(() => {});
			sessionRef.current = null;
		};
	}, []);

	const draw = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const devicePixels = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (canvas.width !== width * devicePixels) {
			canvas.width = width * devicePixels;
			canvas.height = height * devicePixels;
		}
		const context = canvas.getContext("2d");
		if (!context) return;
		context.setTransform(devicePixels, 0, 0, devicePixels, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = getComputedStyle(canvas).color;
		const barCount = Math.max(1, Math.floor(width / BAR_SPACING));
		const bars = historyRef.current.slice(-barCount);
		const firstVoiced = bars.findIndex((value) => value > SILENCE_FLOOR);
		const midline = height / 2;
		bars.forEach((value, index) => {
			const radius = Math.max(
				0.75,
				Math.min(midline - 1, value * AMPLITUDE_SCALE * midline),
			);
			context.globalAlpha =
				firstVoiced === -1 || index < firstVoiced ? SILENCE_ALPHA : 1;
			context.fillRect(
				index * BAR_SPACING,
				midline - radius,
				BAR_WIDTH,
				radius * 2,
			);
		});
		context.globalAlpha = 1;
	};

	const start = async () => {
		if (sessionRef.current) return;
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const recorder = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.start();
		const audioContext = new AudioContext();
		const source = audioContext.createMediaStreamSource(stream);
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 2048;
		source.connect(analyser);
		const samples = new Float32Array(analyser.fftSize);
		historyRef.current = [];
		bucketPeakRef.current = 0;
		startedAtRef.current = performance.now();
		nextBarAtRef.current = startedAtRef.current + BAR_INTERVAL_MS;
		setSeconds(0);
		setStatus("recording");
		const tick = () => {
			analyser.getFloatTimeDomainData(samples);
			let sum = 0;
			for (const sample of samples) sum += sample * sample;
			const rms = Math.sqrt(sum / samples.length);
			bucketPeakRef.current = Math.max(bucketPeakRef.current, rms);
			const now = performance.now();
			while (now >= nextBarAtRef.current) {
				historyRef.current.push(Math.max(SILENCE_FLOOR, bucketPeakRef.current));
				if (historyRef.current.length > 4096) historyRef.current.shift();
				bucketPeakRef.current = 0;
				nextBarAtRef.current += BAR_INTERVAL_MS;
			}
			setSeconds(Math.floor((now - startedAtRef.current) / 1000));
			draw();
			const session = sessionRef.current;
			if (session) session.frame = requestAnimationFrame(tick);
		};
		sessionRef.current = {
			stream,
			recorder,
			audioContext,
			chunks,
			frame: requestAnimationFrame(tick),
		};
	};

	const finish = async () => {
		const session = sessionRef.current;
		if (!session) return;
		sessionRef.current = null;
		cancelAnimationFrame(session.frame);
		const audio = await new Promise<Blob>((resolve) => {
			session.recorder.onstop = () =>
				resolve(new Blob(session.chunks, { type: session.recorder.mimeType }));
			session.recorder.stop();
		});
		for (const track of session.stream.getTracks()) track.stop();
		session.audioContext.close().catch(() => {});
		setStatus("transcribing");
		try {
			const text = await Promise.resolve(transcribe(audio));
			if (text) onTranscript(text);
		} finally {
			setStatus("idle");
		}
	};

	return { status, seconds, canvasRef, start, finish };
}
