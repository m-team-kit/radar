<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import * as echarts from 'echarts';
	import type { ECharts } from 'echarts';
	import { orderVersionCategories, isCanonicalVersion } from '$lib/versions';
	import { theme, type Theme } from '$lib/theme';
	import type { VersionKind } from '$lib/types';

	export interface HistoryPoint {
		t: string;
		v: string;
	}
	export interface ChartSeries {
		id: string;
		name: string;
		color?: string;
		kind?: VersionKind;
		/** Hide non-canonical (alias) versions, e.g. "latest". Defaults to true. */
		filterAliases?: boolean;
		points: HistoryPoint[];
	}

	let { series, height = 300 }: { series: ChartSeries[]; height?: number } = $props();

	let el: HTMLDivElement;
	let chart: ECharts | undefined;
	let cleanup: () => void = () => {};

	const PALETTE = ['#2563eb', '#d97706', '#16a34a', '#7c3aed', '#db2777', '#0d9488', '#ea580c', '#4f46e5'];
	const GRID_BOTTOM = 36;
	// Minimum vertical space per y-axis category so all labels fit without overlap.
	const CATEGORY_LABEL_HEIGHT = 20;

	function filterSeries(series: ChartSeries[]) {
		return series.map((s) => {
			const kind = s.kind ?? 'semver';
			const points = (s.filterAliases ?? true) ? s.points.filter((p) => isCanonicalVersion(p.v, kind)) : s.points;
			return { ...s, kind, points };
		});
	}

	const filtered = $derived(filterSeries(series));
	const categories = $derived(
		orderVersionCategories(filtered.flatMap((s) => s.points.map((p) => ({ v: p.v, kind: s.kind }))))
	);
	const gridTop = $derived(filtered.length > 1 ? 36 : 14);
	const chartHeight = $derived(
		Math.max(height, gridTop + GRID_BOTTOM + categories.length * CATEGORY_LABEL_HEIGHT)
	);

	function buildOption(mode: Theme) {
		const dark = mode === 'dark';
		const axisLabelColor = dark ? '#9aa4b1' : '#3f4a57';
		const lineColor = dark ? '#2c313a' : '#e3e6ea';
		const nameColor = dark ? '#9aa4b1' : '#6b7683';
		const textColor = dark ? '#e5e9f0' : '#1b2430';
		return {
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'axis',
				...(dark
					? { backgroundColor: '#1a1e24', borderColor: '#2c313a', textStyle: { color: '#e5e9f0' } }
					: {})
			},
			legend:
				filtered.length > 1
					? { show: true, top: 0, type: 'scroll', textStyle: { color: textColor } }
					: undefined,
			grid: { left: 8, right: 16, top: gridTop, bottom: GRID_BOTTOM, containLabel: true },
			xAxis: {
				type: 'time',
				axisLine: { lineStyle: { color: lineColor } },
				axisLabel: { color: axisLabelColor },
				splitLine: { lineStyle: { color: lineColor } }
			},
			yAxis: {
				type: 'category',
				data: categories,
				inverse: true,
				name: 'version',
				nameTextStyle: { color: nameColor },
				axisLabel: { interval: 0, color: axisLabelColor },
				axisLine: { lineStyle: { color: lineColor } },
				splitLine: { lineStyle: { color: lineColor } }
			},
			series: filtered.map((s, i) => ({
				name: s.name,
				type: 'line',
				connectNulls: true,
				showSymbol: true,
				showAllSymbol: true,
				symbolSize: 7,
				smooth: false,
				lineStyle: { width: 2, color: s.color ?? PALETTE[i % PALETTE.length] },
				itemStyle: { color: s.color ?? PALETTE[i % PALETTE.length] },
				data: s.points.map((p) => [new Date(p.t).getTime(), p.v])
			}))
		};
	}

	$effect(() => {
		if (chart) chart.setOption(buildOption($theme), true);
	});

	onMount(() => {
		chart = echarts.init(el);
		chart.setOption(buildOption(get(theme)), true);
		const ro = new ResizeObserver(() => chart?.resize());
		ro.observe(el);
		cleanup = () => ro.disconnect();
	});

	onDestroy(() => {
		cleanup();
		chart?.dispose();
		chart = undefined;
	});
</script>

<div class="chart" style="height: {chartHeight}px" bind:this={el}></div>

<style>
	.chart {
		width: 100%;
	}
</style>
