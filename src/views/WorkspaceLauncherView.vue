<script setup lang="ts">
import {
  Aim,
  ArrowRight,
  Connection,
  Position,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import WorkspaceNavigation from '@/components/layout/WorkspaceNavigation.vue'
import { workspaces, type WorkspaceId } from '@/data/workspaces'

const workspaceIcons: Record<WorkspaceId, Component> = {
  mission: Position,
  recognition: Aim,
  coordination: Connection,
}
</script>

<template>
  <main class="workspace-launcher" tabindex="-1" data-workspace-root>
    <WorkspaceNavigation />

    <section class="launcher-intro" aria-labelledby="launcher-title">
      <div class="launcher-copy">
        <p>接触网协同巡检软件原型</p>
        <h1 id="launcher-title" data-page-title>选择工作区</h1>
        <span>三个工作区共用一个入口。进入后，顶部切换条会一直保留。</span>
      </div>

      <aside class="launcher-rules" aria-label="切换规则">
        <strong>操作逻辑</strong>
        <ul>
          <li>点击 RailDrone 标识返回这里</li>
          <li>深色高亮表示当前工作区</li>
          <li>人工复核结果未导出时，离开前会提醒</li>
        </ul>
      </aside>
    </section>

    <div class="contact-line-datum" aria-hidden="true">
      <span />
      <span />
      <i />
      <i />
      <i />
    </div>

    <section class="workspace-directory" aria-label="可用工作区">
      <RouterLink
        v-for="workspace in workspaces"
        :key="workspace.id"
        :to="workspace.route"
        class="workspace-entry"
        :class="`is-${workspace.id}`"
      >
        <span class="entry-icon" aria-hidden="true">
          <component :is="workspaceIcons[workspace.id]" />
        </span>

        <span class="entry-heading">
          <span>{{ workspace.code }}</span>
          <strong>{{ workspace.title }}</strong>
        </span>

        <span class="entry-description">{{ workspace.description }}</span>

        <span class="entry-capabilities" aria-label="当前能力">
          <span v-for="capability in workspace.capabilities" :key="capability">
            {{ capability }}
          </span>
        </span>

        <span class="entry-action">
          {{ workspace.actionLabel }}
          <ArrowRight aria-hidden="true" />
        </span>
      </RouterLink>
    </section>

    <footer class="launcher-footer">
      <strong>软件验证边界</strong>
      <span>当前版本不连接真实无人机、巡检机器人或飞控；识别与协同输出不得直接用于真实飞行控制。</span>
    </footer>
  </main>
</template>

<style scoped>
/* Hallmark · genre: modern-minimal · macrostructure: Index-First · theme: Cobalt
 * design-system: design.md · designed-as-app · nav: application command bar
 * pre-emit critique: P5 H5 E5 S5 R5 V4 · slop: pass (1–58)
 * contrast: pass (40–41) · honest: pass (46) · chrome: pass (47) · tokens: pass (48)
 * responsive: pass (49) · icons: pass (30) · mobile: pass (34, 49, 50–57)
 */
.workspace-launcher {
  min-width: 0;
  min-height: 100dvh;
  color: var(--color-ink-2);
  background: var(--color-paper);
}

.launcher-intro {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.75fr);
  align-items: end;
  gap: var(--space-2xl);
  max-width: 92rem;
  margin-inline: auto;
  padding: var(--space-xl) clamp(var(--space-md), 4vw, var(--space-2xl)) var(--space-2xl);
}

.launcher-copy,
.launcher-copy h1,
.launcher-copy p,
.launcher-copy span,
.launcher-rules,
.launcher-rules ul,
.launcher-footer {
  margin: 0;
}

.launcher-copy {
  min-width: 0;
}

.launcher-copy p,
.launcher-rules strong,
.entry-heading > span,
.launcher-footer strong {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.launcher-copy p {
  color: var(--color-accent-hover);
}

.launcher-copy h1 {
  min-width: 0;
  margin-block-start: var(--space-xs);
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: clamp(var(--text-2xl), 5vw, var(--space-3xl));
  font-style: normal;
  letter-spacing: -0.04em;
  line-height: 1.02;
}

.launcher-copy > span {
  display: block;
  max-width: 56ch;
  margin-block-start: var(--space-md);
  color: var(--color-muted);
  font-size: var(--text-md);
}

.launcher-rules {
  padding-block-start: var(--space-sm);
  border-top: var(--rule-strong) solid var(--color-ink);
}

.launcher-rules strong {
  color: var(--color-ink);
}

.launcher-rules ul {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-sm) 0 0 var(--space-lg);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.contact-line-datum {
  position: relative;
  display: grid;
  max-width: 92rem;
  gap: var(--space-2xs);
  margin-inline: auto;
  padding-inline: clamp(var(--space-md), 4vw, var(--space-2xl));
}

.contact-line-datum span {
  display: block;
  height: var(--rule-thin);
  background: var(--color-rule-strong);
}

.contact-line-datum span:first-child {
  background: var(--color-accent);
}

.contact-line-datum i {
  position: absolute;
  top: calc(var(--space-2xs) * -1);
  width: var(--space-sm);
  height: var(--space-sm);
  background: var(--color-surface-raised);
  border: var(--rule-strong) solid var(--color-accent);
  border-radius: 50%;
}

.contact-line-datum i:nth-of-type(1) { left: 18%; }
.contact-line-datum i:nth-of-type(2) { left: 50%; }
.contact-line-datum i:nth-of-type(3) { right: 18%; }

.workspace-directory {
  display: grid;
  max-width: 92rem;
  margin-inline: auto;
  padding: var(--space-md) clamp(var(--space-md), 4vw, var(--space-2xl)) var(--space-2xl);
}

.workspace-entry {
  display: grid;
  min-width: 0;
  min-height: 7.5rem;
  grid-template-columns: 3rem minmax(10rem, 0.75fr) minmax(18rem, 1.25fr) minmax(14rem, 1fr) auto;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg) var(--space-md);
  color: var(--color-ink-2);
  background: var(--color-surface-raised);
  border-top: var(--rule-thin) solid var(--color-rule-strong);
  text-decoration: none;
  white-space: normal;
  transition:
    background-color var(--dur-short) var(--ease-out),
    color var(--dur-short) var(--ease-out),
    transform var(--dur-micro) var(--ease-out);
}

.workspace-entry:last-child {
  border-bottom: var(--rule-thin) solid var(--color-rule-strong);
}

.entry-icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  place-items: center;
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border: var(--rule-thin) solid var(--color-rule-strong);
  border-radius: var(--radius-md);
}

.entry-icon :deep(svg) {
  width: 1.4rem;
}

.entry-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--space-2xs);
}

.entry-heading > span {
  color: var(--color-muted);
}

.entry-heading strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  letter-spacing: -0.025em;
}

.entry-description {
  min-width: 0;
  max-width: 48ch;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.entry-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.entry-capabilities > span {
  padding: var(--space-2xs) var(--space-xs);
  color: var(--color-ink-2);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-xs);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.entry-action {
  display: inline-flex;
  min-height: var(--control-height);
  align-items: center;
  gap: var(--space-xs);
  justify-self: end;
  color: var(--color-accent-hover);
  font-weight: 700;
  white-space: nowrap;
}

.entry-action :deep(svg) {
  width: 1rem;
  transition: transform var(--dur-short) var(--ease-out);
}

.launcher-footer {
  display: flex;
  gap: var(--space-md);
  max-width: 92rem;
  margin-inline: auto;
  padding: var(--space-lg) clamp(var(--space-md), 4vw, var(--space-2xl)) var(--space-2xl);
  color: var(--color-muted);
  border-top: var(--rule-thin) solid var(--color-rule);
  font-size: var(--text-sm);
}

.launcher-footer strong {
  flex: 0 0 auto;
  color: var(--color-danger);
}

@media (hover: hover) and (pointer: fine) {
  .workspace-entry:hover {
    color: var(--color-ink);
    background: var(--color-accent-soft);
    transform: translateX(var(--space-2xs));
  }

  .workspace-entry:hover .entry-action :deep(svg) {
    transform: translateX(var(--space-2xs));
  }
}

.workspace-entry:active {
  transform: translateX(var(--rule-thin));
}

@media (max-width: 72rem) {
  .launcher-intro {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.7fr);
    gap: var(--space-xl);
  }

  .workspace-entry {
    grid-template-columns: 3rem minmax(9rem, 0.7fr) minmax(0, 1.3fr) auto;
    grid-template-areas:
      'icon heading description action'
      'icon heading capabilities action';
    gap: var(--space-sm) var(--space-lg);
  }

  .entry-icon { grid-area: icon; }
  .entry-heading { grid-area: heading; }
  .entry-description { grid-area: description; }
  .entry-capabilities { grid-area: capabilities; }
  .entry-action { grid-area: action; }
}

@media (max-width: 52rem) {
  .launcher-intro {
    grid-template-columns: minmax(0, 1fr);
    padding-block-start: var(--space-xl);
  }

  .workspace-entry {
    grid-template-columns: 3rem minmax(0, 1fr) auto;
    grid-template-areas:
      'icon heading action'
      'description description description'
      'capabilities capabilities capabilities';
  }

  .entry-description {
    max-width: none;
  }
}

@media (max-width: 40rem) {
  .launcher-copy h1 {
    font-size: var(--text-2xl);
  }

  .launcher-copy > span {
    font-size: var(--text-base);
  }

  .contact-line-datum i {
    width: var(--space-xs);
    height: var(--space-xs);
  }

  .workspace-entry {
    min-height: 0;
    grid-template-columns: 2.75rem minmax(0, 1fr);
    grid-template-areas:
      'icon heading'
      'description description'
      'capabilities capabilities'
      'action action';
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-sm);
  }

  .entry-icon {
    width: 2.75rem;
    height: 2.75rem;
  }

  .entry-heading strong {
    font-size: var(--text-md);
  }

  .entry-action {
    width: 100%;
    justify-content: space-between;
    justify-self: stretch;
    padding-block-start: var(--space-xs);
    border-top: var(--rule-thin) solid var(--color-rule);
  }

  .launcher-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-entry,
  .entry-action :deep(svg) {
    transition-duration: 1ms;
  }

  .workspace-entry:hover,
  .workspace-entry:active,
  .workspace-entry:hover .entry-action :deep(svg) {
    transform: none;
  }
}
</style>
