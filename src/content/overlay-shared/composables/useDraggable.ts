import { inject, ref, type Ref } from 'vue';
import type { OverlayStateStore } from '../persistence';

export function useDraggable(panelRef: Ref<HTMLElement | null>) {
  const store = inject<OverlayStateStore>('overlayStore');
  const pos = ref<{ x: number; y: number } | null>(store?.initial.pos ?? null);

  function clampToViewport(panel: HTMLElement): void {
    if (!pos.value) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    pos.value = {
      x: Math.max(0, Math.min(window.innerWidth - w, pos.value.x)),
      y: Math.max(0, Math.min(window.innerHeight - h, pos.value.y)),
    };
  }

  function onGripDown(e: PointerEvent) {
    const panel = panelRef.value;
    if (!panel) return;

    e.preventDefault();

    const rect = panel.getBoundingClientRect();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPanelX = rect.left;
    const startPanelY = rect.top;

    pos.value = { x: startPanelX, y: startPanelY };

    const prevCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = 'grabbing';

    function onMove(me: PointerEvent) {
      const dx = me.clientX - startMouseX;
      const dy = me.clientY - startMouseY;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      pos.value = {
        x: Math.max(0, Math.min(window.innerWidth - w, startPanelX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - h, startPanelY + dy)),
      };
    }

    function onUp() {
      document.documentElement.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (pos.value) {
        store?.patch({ pos: pos.value });
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return { pos, onGripDown, clampToViewport };
}
