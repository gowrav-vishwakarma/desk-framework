import { inject, nextTick, onMounted, onUnmounted, provide, watch, type InjectionKey, type Ref } from 'vue';
import { focusLayerInitial } from '../focus/useDeskFocus';
import {
  addDeskFields,
  addDeskHandlers,
  createDeskLayer,
  popDeskLayer,
  pushDeskLayer,
  type DeskFocusField,
  type DeskHandlerInput,
  type DeskLayer,
} from './layers';

const DESK_LAYER: InjectionKey<DeskLayer> = Symbol('desk-layer');

export interface DeskLayerHost {
  root: Ref<HTMLElement | null>;
  modal?: boolean;
  /** Push only while true, as a dialog does. Omit for a layer that lives with its component. */
  active?: Ref<boolean>;
  handlers?: Record<string, DeskHandlerInput>;
  initialFocus?: () => string | undefined;
  disableInitialFocus?: () => boolean;
  disableSpatialMove?: () => boolean;
  onAccept?: () => void;
  onEscape?: () => void;
  refocusOnEnter?: () => boolean;
}

/** Own a layer: the shell, a page wrapper, or a dialog. Children join it with `useDeskLayer`. */
export function provideDeskLayer(host: DeskLayerHost): DeskLayer {
  const layer = createDeskLayer(host.modal ?? false);
  layer.onAccept = host.onAccept;
  layer.onEscape = host.onEscape;
  if (host.refocusOnEnter) layer.refocusOnEnter = host.refocusOnEnter();
  if (host.disableSpatialMove) layer.disableSpatialMove = host.disableSpatialMove();
  if (host.handlers) addDeskHandlers(layer, host.handlers);
  provide(DESK_LAYER, layer);

  function focusOnOpen(): void {
    void nextTick(() => {
      layer.root = host.root.value;
      if (host.initialFocus) layer.initialFocus = host.initialFocus();
      if (host.disableInitialFocus) layer.disableInitialFocus = host.disableInitialFocus();
      if (layer.disableInitialFocus) return;
      focusLayerInitial(layer);
    });
  }

  if (host.active) {
    const active = host.active;
    watch(
      active,
      (shown) => {
        if (!shown) {
          popDeskLayer(layer);
          return;
        }
        pushDeskLayer(layer);
        focusOnOpen();
      },
      { immediate: true },
    );
  } else {
    // Pushed during setup so a parent layer always sits below the layers of its children.
    pushDeskLayer(layer);
    onMounted(focusOnOpen);
  }
  onUnmounted(() => popDeskLayer(layer));
  return layer;
}

export interface DeskLayerConfig {
  fields?: DeskFocusField[];
  handlers?: Record<string, DeskHandlerInput>;
  initialFocus?: string;
  disableInitialFocus?: boolean;
  disableSpatialMove?: boolean;
  refocusOnEnter?: boolean;
}

/**
 * Keep a layer's field hooks in step with a changing list.
 * Replaces the previous list this call registered, and leaves other fields alone.
 */
export function useDeskFields(fields: () => DeskFocusField[]): void {
  const layer = inject(DESK_LAYER, null);
  if (!layer) return;
  let remove = (): void => {};
  watch(fields, (next) => {
    remove();
    remove = addDeskFields(layer, next);
  }, { immediate: true });
  onUnmounted(() => remove());
}

/** Add fields, key handlers and focus options to the nearest page or dialog layer. */
export function useDeskLayer(config: DeskLayerConfig = {}): DeskLayer | null {
  const layer = inject(DESK_LAYER, null);
  if (!layer) return null;
  const disposers: (() => void)[] = [];
  if (config.fields) disposers.push(addDeskFields(layer, config.fields));
  if (config.handlers) disposers.push(addDeskHandlers(layer, config.handlers));
  if (config.initialFocus !== undefined) layer.initialFocus = config.initialFocus;
  if (config.disableInitialFocus) layer.disableInitialFocus = true;
  if (config.disableSpatialMove) layer.disableSpatialMove = true;
  if (config.refocusOnEnter !== undefined) layer.refocusOnEnter = config.refocusOnEnter;
  onUnmounted(() => {
    for (const dispose of disposers) dispose();
  });
  return layer;
}
