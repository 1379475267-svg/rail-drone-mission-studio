import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { validateMissionProject } from '@/services/missionValidator'
import type { MissionProject } from '@/types/project'
import type { MissionStatistics, ValidationIssue } from '@/types/simulation'

export const useMissionStore = defineStore('mission', () => {
  const validationIssues = ref<ValidationIssue[]>([])
  const statistics = ref<MissionStatistics | null>(null)

  const warnings = computed(() =>
    validationIssues.value.filter((issue) => issue.level === 'WARNING'),
  )
  const errors = computed(() =>
    validationIssues.value.filter((issue) => issue.level === 'ERROR'),
  )
  const warningCount = computed(() => warnings.value.length)
  const errorCount = computed(() => errors.value.length)
  const hasErrors = computed(() => errorCount.value > 0)

  function validateProject(project: MissionProject): ValidationIssue[] {
    const issues = validateMissionProject(project)
    validationIssues.value = issues
    return issues
  }

  function setValidationIssues(issues: readonly ValidationIssue[]): void {
    validationIssues.value = [...issues]
  }

  function clearValidation(): void {
    validationIssues.value = []
  }

  function setStatistics(nextStatistics: MissionStatistics | null): void {
    statistics.value = nextStatistics
  }

  function clearStatistics(): void {
    statistics.value = null
  }

  return {
    validationIssues,
    issues: validationIssues,
    statistics,
    warnings,
    errors,
    warningCount,
    errorCount,
    hasErrors,
    validateProject,
    runValidation: validateProject,
    setValidationIssues,
    clearValidation,
    setStatistics,
    clearStatistics,
  }
})
