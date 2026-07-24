<script setup lang="ts">
import { computed, useId } from 'vue'
import type { GuidanceCommand, NormalizedPoint, WireTrackFrame } from '@/types/tracking'

const props = defineProps<{
  track: WireTrackFrame | null
  missionState: string
  guidance: GuidanceCommand | null
  faultLineLost: boolean
  mode: 'VIRTUAL_CLOSED_LOOP' | 'VIDEO_SHADOW'
}>()

const VIEW_WIDTH = 960
const VIEW_HEIGHT = 540
const REFERENCE_X = VIEW_WIDTH / 2
const NEAR_BAND_Y = VIEW_HEIGHT * 0.7
const FAR_BAND_Y = VIEW_HEIGHT * 0.4

const titleId = useId()
const descriptionId = useId()

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : 0

function toViewPoint(point: NormalizedPoint | null): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  return {
    x: clamp01(point.x) * VIEW_WIDTH,
    y: clamp01(point.y) * VIEW_HEIGHT,
  }
}

const linePoints = computed(() => props.track?.polyline
  .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  .map((point) => `${clamp01(point.x) * VIEW_WIDTH},${clamp01(point.y) * VIEW_HEIGHT}`)
  .join(' ') ?? '')

const nearPoint = computed(() => toViewPoint(props.track?.near ?? null))
const farPoint = computed(() => toViewPoint(props.track?.far ?? null))

const isHolding = computed(() => {
  if (props.faultLineLost || !props.track || !props.guidance || props.guidance.hold) return true
  return ['AMBIGUOUS', 'LOST'].includes(props.track.status)
    || ['ACQUIRING', 'HOLD', 'REACQUIRING', 'FAULT'].includes(props.track.phase)
})

const modeLabel = computed(() => props.mode === 'VIRTUAL_CLOSED_LOOP'
  ? '虚拟闭环画面'
  : '视频影子模式')

const modeCode = computed(() => props.mode === 'VIRTUAL_CLOSED_LOOP' ? 'SIM' : 'VIDEO')

const phaseLabels: Record<WireTrackFrame['phase'], string> = {
  ACQUIRING: '正在捕获',
  TRACKING: '稳定跟踪',
  DEGRADED: '降级跟踪',
  HOLD: '安全悬停',
  REACQUIRING: '重新捕获',
  FAULT: '感知故障',
}

const trackingLabel = computed(() => {
  if (props.faultLineLost) return '接触线丢失'
  if (!props.track) return '等待跟踪结果'
  if (!props.guidance) return '等待控制指令'
  return phaseLabels[props.track.phase]
})

const confidenceLabel = computed(() => props.track
  ? `${Math.round(clamp01(props.track.combinedConfidence) * 100)}%`
  : '—')

function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const normalized = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`
}

const lateralErrorLabel = computed(() => formatSigned(props.track?.lateralError))
const headingErrorLabel = computed(() => formatSigned(props.track?.headingError, 3))
const forwardCommandLabel = computed(() => props.guidance
  ? `${props.guidance.forward.toFixed(2)} m/s`
  : '—')

const hasDeviation = computed(() => {
  const point = nearPoint.value
  return Boolean(point && Math.abs(point.x - REFERENCE_X) > 3)
})

const deviationHeadPoints = computed(() => {
  const point = nearPoint.value
  if (!point) return ''
  const direction = point.x >= REFERENCE_X ? 1 : -1
  return [
    `${point.x},${point.y}`,
    `${point.x - direction * 15},${point.y - 9}`,
    `${point.x - direction * 15},${point.y + 9}`,
  ].join(' ')
})

const stageDescription = computed(() => {
  const state = isHolding.value ? 'HOLD，前进指令被抑制' : 'TRACK，允许生成跟线建议'
  return `${modeLabel.value}。${trackingLabel.value}。${state}。`
})
</script>

<template>
  <section class="perception-stage" :class="{ 'is-holding': isHolding }">
    <header class="perception-heading">
      <div class="heading-copy">
        <span class="mode-code" aria-hidden="true">{{ modeCode }}</span>
        <div>
          <h2>前视接触线感知</h2>
          <p>{{ modeLabel }} · {{ missionState }}</p>
        </div>
      </div>
      <div class="tracking-state" :class="{ 'is-track': !isHolding }" role="status" aria-live="polite">
        <span class="state-symbol" aria-hidden="true">{{ isHolding ? '‖' : '◆' }}</span>
        <span>
          <strong>{{ isHolding ? 'HOLD' : 'TRACK' }}</strong>
          <small>{{ trackingLabel }}</small>
        </span>
      </div>
    </header>

    <div class="camera-viewport">
      <svg
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-labelledby="`${titleId} ${descriptionId}`"
      >
        <title :id="titleId">接触线前视跟踪画面</title>
        <desc :id="descriptionId">{{ stageDescription }}</desc>

        <rect class="camera-ground" width="960" height="540" />

        <g class="perspective-grid" aria-hidden="true">
          <line x1="480" y1="196" x2="54" y2="540" />
          <line x1="480" y1="196" x2="260" y2="540" />
          <line x1="480" y1="196" x2="700" y2="540" />
          <line x1="480" y1="196" x2="906" y2="540" />
          <line x1="0" y1="196" x2="960" y2="196" />
          <line x1="82" y1="430" x2="878" y2="430" />
        </g>

        <rect class="reference-corridor" x="448" y="72" width="64" height="436" rx="8" />
        <line class="reference-center" x1="480" y1="62" x2="480" y2="512" />
        <g class="reference-reticle" aria-hidden="true">
          <line x1="448" y1="270" x2="468" y2="270" />
          <line x1="492" y1="270" x2="512" y2="270" />
          <line x1="480" y1="238" x2="480" y2="258" />
          <line x1="480" y1="282" x2="480" y2="302" />
        </g>

        <g class="observation-band far-band" aria-hidden="true">
          <rect x="36" :y="FAR_BAND_Y - 18" width="888" height="36" rx="6" />
          <line x1="36" :y1="FAR_BAND_Y" x2="924" :y2="FAR_BAND_Y" />
          <text x="52" :y="FAR_BAND_Y - 28">远端观察带 · 40%</text>
        </g>
        <g class="observation-band near-band" aria-hidden="true">
          <rect x="36" :y="NEAR_BAND_Y - 18" width="888" height="36" rx="6" />
          <line x1="36" :y1="NEAR_BAND_Y" x2="924" :y2="NEAR_BAND_Y" />
          <text x="52" :y="NEAR_BAND_Y + 48">近端观察带 · 70%</text>
        </g>

        <g v-if="linePoints" class="tracked-wire" :class="`is-${track?.status.toLowerCase()}`">
          <polyline class="wire-mask" :points="linePoints" />
          <polyline class="wire-core" :points="linePoints" />
        </g>

        <g v-if="farPoint" class="lookahead-point" :transform="`translate(${farPoint.x} ${farPoint.y})`">
          <path d="M 0 -13 L 13 0 L 0 13 L -13 0 Z" />
          <line x1="-21" y1="0" x2="21" y2="0" />
          <line x1="0" y1="-21" x2="0" y2="21" />
          <text x="19" y="-18">前视点</text>
        </g>

        <g v-if="nearPoint" class="near-point" :transform="`translate(${nearPoint.x} ${nearPoint.y})`">
          <circle r="12" />
          <circle r="4" />
        </g>

        <g v-if="nearPoint && hasDeviation" class="deviation-arrow" aria-hidden="true">
          <line :x1="REFERENCE_X" :y1="nearPoint.y" :x2="nearPoint.x" :y2="nearPoint.y" />
          <polyline :points="deviationHeadPoints" />
          <text :x="(REFERENCE_X + nearPoint.x) / 2" :y="nearPoint.y - 18" text-anchor="middle">
            横向偏差
          </text>
        </g>

        <g class="frame-corners" aria-hidden="true">
          <path d="M 24 66 V 24 H 66" />
          <path d="M 894 24 H 936 V 66" />
          <path d="M 24 474 V 516 H 66" />
          <path d="M 894 516 H 936 V 474" />
        </g>

        <g class="frame-labels" aria-hidden="true">
          <text x="36" y="52">{{ modeLabel }}</text>
          <text x="924" y="52" text-anchor="end">SEQ {{ track?.sequence ?? '—' }}</text>
          <text x="36" y="508">REF CENTER 0.00</text>
          <text x="924" y="508" text-anchor="end">AGE {{ track?.ageMs?.toFixed(0) ?? '—' }} ms</text>
        </g>
      </svg>

      <div v-if="isHolding" class="hold-banner" role="status">
        <span aria-hidden="true">‖</span>
        <div>
          <strong>前进指令已抑制</strong>
          <small>{{ faultLineLost ? '接触线丢失，保持悬停' : trackingLabel }}</small>
        </div>
      </div>
    </div>

    <dl class="perception-readouts">
      <div>
        <dt>综合置信度</dt>
        <dd>{{ confidenceLabel }}</dd>
      </div>
      <div>
        <dt>横向偏差</dt>
        <dd>{{ lateralErrorLabel }}</dd>
      </div>
      <div>
        <dt>方向偏差</dt>
        <dd>{{ headingErrorLabel }} <span>rad</span></dd>
      </div>
      <div>
        <dt>建议前向速度</dt>
        <dd>{{ isHolding ? '0.00 m/s' : forwardCommandLabel }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
/* Hallmark · component: perception stage · genre: modern-minimal · theme: Cobalt
 * states: display-only · track · hold · degraded · lost · empty
 * contrast: token-locked · pre-emit critique: P5 H5 E5 S5 R5 V4
 */
.perception-stage {
  display: grid;
  min-width: 0;
  overflow: clip;
  background: var(--color-surface);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.perception-heading {
  display: flex;
  min-width: 0;
  align-items: stretch;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.heading-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-sm);
}

.heading-copy > div {
  min-width: 0;
}

.heading-copy h2,
.heading-copy p {
  margin: 0;
}

.heading-copy h2 {
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-style: normal;
  letter-spacing: -0.01em;
}

.heading-copy p {
  margin-top: var(--space-2xs);
  overflow: hidden;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-code {
  display: inline-grid;
  min-width: 3.35rem;
  min-height: 2rem;
  place-items: center;
  flex: 0 0 auto;
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border: var(--rule-thin) solid var(--color-accent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tracking-state {
  display: flex;
  min-width: 8.5rem;
  min-height: var(--control-height);
  align-items: center;
  gap: var(--space-xs);
  justify-content: flex-start;
  padding-inline: var(--space-sm);
  flex: 0 0 auto;
  width: 100%;
  color: var(--color-warning);
  background: var(--color-warning-soft);
  border: var(--rule-thin) solid var(--color-warning);
  border-radius: var(--radius-sm);
}

.tracking-state.is-track {
  color: var(--color-success);
  background: var(--color-success-soft);
  border-color: var(--color-success);
}

.state-symbol {
  font-family: var(--font-mono);
  font-size: var(--text-md);
  font-weight: 700;
}

.tracking-state > span:last-child {
  display: grid;
  gap: var(--space-3xs);
}

.tracking-state strong,
.tracking-state small {
  line-height: 1;
}

.tracking-state strong {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
}

.tracking-state small {
  color: var(--color-ink-2);
  font-size: var(--text-xs);
}

.camera-viewport {
  position: relative;
  min-width: 0;
  overflow: clip;
  aspect-ratio: 16 / 9;
  background: var(--color-media-stage);
}

.camera-viewport svg {
  display: block;
  width: 100%;
  height: 100%;
}

.camera-ground {
  fill: var(--color-media-stage);
}

.perspective-grid line,
.reference-center,
.reference-reticle line,
.observation-band line,
.frame-corners path {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.perspective-grid line {
  stroke: var(--color-media-rule);
  stroke-width: var(--rule-thin);
  opacity: 0.28;
}

.reference-corridor {
  fill: var(--color-accent-soft);
  opacity: 0.08;
}

.reference-center {
  stroke: var(--color-log-muted);
  stroke-width: var(--rule-thin);
  stroke-dasharray: 8 8;
  opacity: 0.72;
}

.reference-reticle line {
  stroke: var(--color-log-ink);
  stroke-width: var(--rule-strong);
}

.observation-band rect {
  fill: var(--color-log-paper-2);
  opacity: 0.34;
}

.observation-band line {
  stroke: var(--color-log-muted);
  stroke-width: var(--rule-thin);
  stroke-dasharray: 6 8;
  opacity: 0.58;
}

.observation-band text,
.frame-labels text,
.lookahead-point text,
.deviation-arrow text {
  fill: var(--color-log-muted);
  font-family: var(--font-mono);
  font-size: 24px;
  letter-spacing: 0.04em;
}

.wire-mask,
.wire-core {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.wire-mask {
  stroke: var(--color-accent);
  stroke-width: 18;
  opacity: 0.2;
}

.wire-core {
  stroke: var(--color-accent-line);
  stroke-width: 4;
}

.tracked-wire.is-predicted .wire-core,
.tracked-wire.is-ambiguous .wire-core {
  stroke-dasharray: 10 8;
}

.tracked-wire.is-ambiguous .wire-core,
.tracked-wire.is-lost .wire-core {
  stroke: var(--color-warning);
}

.lookahead-point path,
.lookahead-point line {
  fill: var(--color-media-stage);
  stroke: var(--color-accent-line);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.lookahead-point text {
  fill: var(--color-accent-line);
  font-weight: 700;
}

.near-point circle:first-child {
  fill: var(--color-media-stage);
  stroke: var(--color-log-ink);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.near-point circle:last-child {
  fill: var(--color-log-ink);
}

.deviation-arrow line,
.deviation-arrow polyline {
  fill: var(--color-warning);
  stroke: var(--color-warning);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.deviation-arrow text {
  fill: var(--color-warning-soft);
  font-weight: 700;
}

.frame-corners path {
  stroke: var(--color-log-muted);
  stroke-width: var(--rule-strong);
}

.frame-labels text {
  font-variant-numeric: tabular-nums;
}

.is-holding .reference-corridor {
  fill: var(--color-warning-soft);
}

.is-holding .reference-center,
.is-holding .reference-reticle line {
  stroke: var(--color-warning);
}

.hold-banner {
  position: absolute;
  inset-inline: var(--space-xs);
  inset-block-end: var(--space-xs);
  display: flex;
  min-height: var(--control-height);
  max-width: none;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-warning-soft);
  background: var(--color-media-overlay);
  border: var(--rule-thin) solid var(--color-warning);
  border-radius: var(--radius-sm);
}

.hold-banner > span {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 700;
}

.hold-banner > div {
  display: grid;
  min-width: 0;
  gap: var(--space-3xs);
}

.hold-banner strong,
.hold-banner small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hold-banner strong {
  font-size: var(--text-sm);
}

.hold-banner small {
  color: var(--color-log-ink);
  font-size: var(--text-xs);
}

.perception-readouts {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: var(--rule-thin) solid var(--color-rule);
}

.perception-readouts > div {
  display: grid;
  min-width: 0;
  gap: var(--space-2xs);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.perception-readouts > div:nth-child(odd) {
  border-inline-end: var(--rule-thin) solid var(--color-rule);
}

.perception-readouts dt {
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perception-readouts dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perception-readouts dd span {
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 400;
}

@media (min-width: 30rem) {
  .perception-heading {
    align-items: center;
    flex-direction: row;
  }

  .tracking-state {
    width: auto;
  }

  .hold-banner {
    inset-inline-start: var(--space-md);
    inset-inline-end: auto;
    inset-block-end: var(--space-md);
    max-width: calc(100% - var(--space-xl));
  }
}

@media (min-width: 40rem) {
  .perception-readouts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .perception-readouts > div {
    border-bottom: 0;
    border-inline-end: var(--rule-thin) solid var(--color-rule);
  }

  .perception-readouts > div:last-child {
    border-inline-end: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .perception-stage *,
  .perception-stage *::before,
  .perception-stage *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
