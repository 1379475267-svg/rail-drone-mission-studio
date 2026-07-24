<script setup lang="ts">
import {
  Aim,
  Connection,
  DataLine,
  Position,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import { workspaces, type WorkspaceId } from '@/data/workspaces'

const workspaceIcons: Record<WorkspaceId, Component> = {
  mission: Position,
  recognition: Aim,
  coordination: Connection,
}
</script>

<template>
  <header class="workspace-navigation">
    <RouterLink class="studio-brand" to="/" aria-label="返回工作区选择">
      <span class="studio-mark" aria-hidden="true"><DataLine /></span>
      <span class="studio-name">
        <strong>RailDrone</strong>
        <span>Mission Studio</span>
      </span>
    </RouterLink>

    <div class="navigation-context" aria-hidden="true">
      <strong>工作区</strong>
      <span>选择或切换</span>
    </div>

    <nav class="workspace-links" aria-label="全局工作区切换">
      <RouterLink
        v-for="workspace in workspaces"
        :key="workspace.id"
        :to="workspace.route"
        class="workspace-link"
      >
        <span class="workspace-link__icon" aria-hidden="true">
          <component :is="workspaceIcons[workspace.id]" />
        </span>
        <span class="workspace-link__copy">
          <strong>{{ workspace.shortTitle }}</strong>
          <span>{{ workspace.code }}</span>
        </span>
      </RouterLink>
    </nav>

    <div class="prototype-status" role="status" aria-label="软件原型，未连接真实设备">
      <i aria-hidden="true" />
      <span>DEMO · 未连接实机</span>
    </div>
  </header>
</template>

<style scoped>
/* Hallmark · component: application workspace navigation · genre: modern-minimal · theme: Cobalt
 * states: default · hover · focus · active · current · contrast: verified in browser
 */
.workspace-navigation {
  position: relative;
  z-index: var(--z-sticky);
  display: grid;
  grid-template-columns: auto auto minmax(28rem, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
  min-height: 5rem;
  padding: var(--space-xs) var(--space-md);
  color: var(--color-ink-2);
  background: var(--color-surface-raised);
  border-bottom: var(--rule-strong) solid var(--color-ink);
}

.studio-brand,
.studio-name,
.navigation-context,
.workspace-link,
.workspace-link__copy,
.prototype-status {
  display: flex;
  align-items: center;
}

.studio-brand {
  min-height: var(--control-height);
  gap: var(--space-sm);
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
}

.studio-mark {
  display: grid;
  width: var(--control-height);
  height: var(--control-height);
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-accent-ink);
  background: var(--color-accent);
  border-radius: var(--radius-md);
}

.studio-mark :deep(svg) {
  width: 1.35rem;
}

.studio-name,
.navigation-context,
.workspace-link__copy {
  align-items: flex-start;
  flex-direction: column;
}

.studio-name {
  line-height: 1.05;
}

.studio-name strong {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  letter-spacing: -0.035em;
}

.studio-name span,
.navigation-context span,
.workspace-link__copy span,
.prototype-status {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
}

.studio-name span,
.navigation-context span {
  color: var(--color-muted);
}

.navigation-context {
  padding-inline-start: var(--space-md);
  border-inline-start: var(--rule-thin) solid var(--color-rule-strong);
  line-height: 1.2;
  white-space: nowrap;
}

.navigation-context strong {
  color: var(--color-ink);
  font-size: var(--text-sm);
}

.workspace-links {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2xs);
  padding: var(--space-2xs);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule-strong);
  border-radius: var(--radius-md);
}

.workspace-link {
  min-width: 0;
  min-height: var(--control-height);
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-ink-2);
  background: var(--color-surface-raised);
  border: var(--rule-thin) solid transparent;
  border-radius: var(--radius-sm);
  text-decoration: none;
  transition:
    color var(--dur-short) var(--ease-out),
    background-color var(--dur-short) var(--ease-out),
    transform var(--dur-micro) var(--ease-out);
}

.workspace-link__icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border-radius: var(--radius-xs);
}

.workspace-link__icon :deep(svg) {
  width: 1rem;
}

.workspace-link__copy {
  min-width: 0;
  line-height: 1.1;
}

.workspace-link__copy strong,
.workspace-link__copy span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-link__copy strong {
  font-size: var(--text-sm);
}

.workspace-link__copy span {
  color: var(--color-muted);
}

.workspace-link.router-link-active {
  color: var(--color-surface-raised);
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.workspace-link.router-link-active .workspace-link__icon {
  color: var(--color-accent-ink);
  background: var(--color-accent);
}

.workspace-link.router-link-active .workspace-link__copy span {
  color: var(--color-paper-3);
}

.prototype-status {
  min-height: var(--control-height);
  gap: var(--space-xs);
  justify-content: center;
  padding-inline: var(--space-sm);
  color: var(--color-ink-2);
  background: var(--color-warning-soft);
  border: var(--rule-thin) solid var(--color-warning);
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.prototype-status i {
  width: var(--space-xs);
  height: var(--space-xs);
  flex: 0 0 auto;
  background: var(--color-warning);
  border-radius: 50%;
}

@media (hover: hover) and (pointer: fine) {
  .studio-brand:hover .studio-name strong {
    color: var(--color-accent-hover);
  }

  .workspace-link:not(.router-link-active):hover {
    color: var(--color-accent-hover);
    background: var(--color-accent-soft);
    transform: translateY(-1px);
  }
}

.workspace-link:active {
  transform: translateY(var(--rule-thin));
}

@media (max-width: 76rem) {
  .workspace-navigation {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .navigation-context {
    display: none;
  }
}

@media (max-width: 58rem) {
  .workspace-navigation {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-xs) var(--space-sm);
  }

  .workspace-links {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 40rem) {
  .workspace-navigation {
    padding: var(--space-xs);
  }

  .studio-name span,
  .prototype-status span,
  .workspace-link__copy span {
    display: none;
  }

  .studio-name strong {
    font-size: var(--text-base);
  }

  .prototype-status {
    min-height: 2.25rem;
    padding-inline: var(--space-xs);
  }

  .prototype-status::after {
    content: 'DEMO';
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: 0.06em;
  }

  .workspace-link {
    min-height: 3rem;
    justify-content: center;
    gap: var(--space-2xs);
    padding-inline: var(--space-2xs);
  }

  .workspace-link__icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .workspace-link__copy strong {
    font-size: var(--text-xs);
  }
}

@media (max-width: 22rem) {
  .workspace-link__icon {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-link {
    transition-duration: 1ms;
  }

  .workspace-link:hover,
  .workspace-link:active {
    transform: none;
  }
}
</style>
