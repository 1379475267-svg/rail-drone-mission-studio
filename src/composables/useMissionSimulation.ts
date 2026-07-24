import { getCurrentScope, onScopeDispose } from 'vue'

import { createSimulationEngine, type SimulationEngine } from '@/services/simulationEngine'
import { useMissionStore } from '@/stores/missionStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSimulationStore } from '@/stores/simulationStore'
import type { SimulationSpeed } from '@/types/simulation'

let sharedEngine: SimulationEngine | null = null
let consumerCount = 0

export function useMissionSimulation() {
  const projectStore = useProjectStore()
  const missionStore = useMissionStore()
  const simulationStore = useSimulationStore()

  if (!sharedEngine) {
    sharedEngine = createSimulationEngine(projectStore, missionStore, simulationStore)
  }
  const engine = sharedEngine
  consumerCount += 1
  let disposed = false

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    consumerCount = Math.max(0, consumerCount - 1)
    if (consumerCount === 0) {
      engine.dispose()
      if (sharedEngine === engine) {
        sharedEngine = null
      }
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return {
    start: (): boolean => engine.start(),
    pause: (): boolean => engine.pause(),
    resume: (): boolean => engine.resume(),
    reset: (): void => engine.reset(),
    setSpeed: (speed: SimulationSpeed): boolean => engine.setSpeed(speed),
    dispose,
  }
}
