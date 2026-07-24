<script setup lang="ts">
import { Delete, LocationInformation } from '@element-plus/icons-vue'
import type { MissionActionType } from '@/types/mission'
import type { DroneWaypoint } from '@/types/scene'

const props = defineProps<{
  waypoint: DroneWaypoint
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'update', patch: Partial<DroneWaypoint>): void
  (event: 'delete'): void
}>()

const actionOptions: Array<{ label: string; value: MissionActionType }> = [
  { label: '起飞', value: 'TAKEOFF' },
  { label: '飞向航点', value: 'FLY_TO' },
  { label: '悬停', value: 'HOVER' },
  { label: '投放机器人', value: 'DEPLOY_ROBOT' },
  { label: '等待机器人', value: 'WAIT_ROBOT' },
  { label: '跟随机器人', value: 'FOLLOW_ROBOT' },
  { label: '抓取机器人', value: 'PICKUP_ROBOT' },
  { label: '跨越障碍', value: 'CROSS_OBSTACLE' },
  { label: '释放机器人', value: 'RELEASE_ROBOT' },
  { label: '检查点停留', value: 'INSPECT_POINT' },
  { label: '返航', value: 'RETURN_HOME' },
  { label: '降落', value: 'LAND' },
]

const updateName = (name: string) => emit('update', { name })
const updateAction = (action: MissionActionType) => emit('update', { action })

const updatePosition = (axis: 'x' | 'y', value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  emit('update', {
    position: {
      ...props.waypoint.position,
      [axis]: value,
    },
  })
}

const updateNumber = (
  key: 'altitude' | 'speed' | 'yaw' | 'stayDuration',
  value: number | undefined,
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  emit('update', { [key]: value })
}
</script>

<template>
  <section class="waypoint-properties" aria-labelledby="waypoint-properties-title">
    <div class="object-banner">
      <span class="object-icon"><LocationInformation /></span>
      <h3 id="waypoint-properties-title">{{ props.waypoint.name }}</h3>
      <span class="coordinate-code">{{ props.waypoint.id.slice(-6) }}</span>
    </div>

    <el-form label-position="top" :disabled="props.disabled" class="property-form">
      <el-form-item label="名称">
        <el-input
          :model-value="props.waypoint.name"
          maxlength="32"
          @update:model-value="updateName"
        />
      </el-form-item>

      <fieldset>
        <legend>平面坐标</legend>
        <div class="form-grid">
          <el-form-item label="X / px">
            <el-input-number
              :model-value="props.waypoint.position.x"
              :min="0"
              :max="1200"
              :precision="1"
              :step="10"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updatePosition('x', value)"
            />
          </el-form-item>
          <el-form-item label="Y / px">
            <el-input-number
              :model-value="props.waypoint.position.y"
              :min="0"
              :max="720"
              :precision="1"
              :step="10"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updatePosition('y', value)"
            />
          </el-form-item>
        </div>
      </fieldset>

      <fieldset>
        <legend>飞行参数</legend>
        <div class="form-grid">
          <el-form-item label="高度 / m">
            <el-input-number
              :model-value="props.waypoint.altitude"
              :min="0"
              :max="120"
              :precision="1"
              :step="0.5"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updateNumber('altitude', value)"
            />
          </el-form-item>
          <el-form-item label="速度 / m·s⁻¹">
            <el-input-number
              :model-value="props.waypoint.speed"
              :min="0.1"
              :max="20"
              :precision="1"
              :step="0.5"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updateNumber('speed', value)"
            />
          </el-form-item>
          <el-form-item label="偏航角 / °">
            <el-input-number
              :model-value="props.waypoint.yaw"
              :min="-180"
              :max="180"
              :precision="0"
              :step="5"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updateNumber('yaw', value)"
            />
          </el-form-item>
          <el-form-item label="停留 / s">
            <el-input-number
              :model-value="props.waypoint.stayDuration"
              :min="0"
              :max="600"
              :precision="1"
              :step="1"
              controls-position="right"
              @update:model-value="(value: number | undefined) => updateNumber('stayDuration', value)"
            />
          </el-form-item>
        </div>
      </fieldset>

      <el-form-item label="到达动作">
        <el-select
          :model-value="props.waypoint.action"
          class="full-width"
          @update:model-value="updateAction"
        >
          <el-option
            v-for="option in actionOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <div class="critical-row">
        <div>
          <strong>关键航点</strong>
          <span>仿真日志中重点标记</span>
        </div>
        <el-switch
          :model-value="props.waypoint.critical"
          aria-label="关键航点"
          @update:model-value="(value: boolean) => emit('update', { critical: value })"
        />
      </div>
    </el-form>

    <el-button
      class="delete-object"
      type="danger"
      plain
      :icon="Delete"
      :disabled="props.disabled"
      @click="emit('delete')"
    >
      删除这个航点
    </el-button>
  </section>
</template>

<style scoped>
.waypoint-properties {
  display: grid;
  gap: var(--space-md);
}

.object-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--color-accent-soft);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.object-icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  color: var(--color-accent-ink);
  background: var(--color-accent);
  border-radius: var(--radius-sm);
}

.object-icon svg {
  width: 1.15rem;
}

.object-banner h3 {
  margin: 0;
}

.object-banner h3 {
  overflow: hidden;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coordinate-code {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.property-form {
  display: grid;
  gap: var(--space-sm);
}

.property-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.property-form :deep(.el-form-item__label) {
  padding-bottom: var(--space-2xs);
  color: var(--color-neutral);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.35;
}

.property-form :deep(.el-input-number) {
  width: 100%;
}

fieldset {
  padding: var(--space-sm);
  margin: 0;
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-sm);
}

legend {
  padding: 0 var(--space-xs);
  color: var(--color-ink-2);
  font-size: var(--text-xs);
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.full-width {
  width: 100%;
}

.critical-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--color-paper-2);
  border-radius: var(--radius-sm);
}

.critical-row div {
  display: flex;
  flex-direction: column;
}

.critical-row strong {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.critical-row span {
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.delete-object {
  width: 100%;
}
</style>
