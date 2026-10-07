import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { bandFor } from '../bands';
import { formatNumber } from '../format';
import { tr, type Lang } from '../i18n';
import { BandColour, colours, fonts, withAlpha } from '../theme';
import type { ViewDef } from '../views';
import type { LabelFrame, LabelSpec, LabelVariant } from './labels';
import type { HoverInfo, SceneInput, SceneView, ViewData } from './types';

interface ViewSceneProps {
  view: ViewDef;
  /** The 3D labels are written once per scene, so a new language means a new scene. */
  lang: Lang;
  data: ViewData;
  /** Text alternative for the 3D view. */
  label: string;
  hint: string;
  reducedMotion: boolean;
  /** Of the 3D view itself, in dp; the hint goes below it. */
  height: number;
  style?: StyleProp<ViewStyle>;
}

interface Size {
  width: number;
  height: number;
}

export function ViewScene({ view, lang, data, label, hint, reducedMotion, height, style }: ViewSceneProps) {
  const [size, setSize] = useState<Size | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [labels, setLabels] = useState<LabelSpec[]>([]);
  const [failed, setFailed] = useState(false);
  // The scene on screen takes the gestures; each new one gets gestures of its own.
  const [input, setInput] = useState<SceneInput | null>(null);
  // Label positions change every frame, so they skip React and go straight to the UI thread.
  const frame = useSharedValue<LabelFrame>({});
  const sceneRef = useRef<SceneView | null>(null);
  const dataRef = useRef(data);

  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const width = Math.round(layout.width);
    const height = Math.round(layout.height);
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  };

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (!size) return;
      // Android can recreate a GL view's surface, which brings a new context and needs a new scene.
      sceneRef.current?.dispose();
      sceneRef.current = null;
      try {
        const scene = view.create({
          gl,
          width: size.width,
          height: size.height,
          reducedMotion,
          onHover: setHover,
          onLabels: setLabels,
          onLabelFrame: (next) => {
            frame.value = next;
          },
        });
        scene.setData(dataRef.current);
        sceneRef.current = scene;
        setInput(scene.input);
      } catch (error) {
        // A GPU that expo-gl or three can't drive fails here; the panels still work without it.
        console.warn('The 3D view failed to start', error);
        setFailed(true);
      }
    },
    [view, size, reducedMotion, frame],
  );

  // One scene per view, language and size: each GLView below is keyed on them. Disposing in a
  // layout effect frees the GPU memory before the old view unmounts and takes its context.
  useLayoutEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setInput(null);
      setHover(null);
      setLabels([]);
    };
  }, [view, lang, size]);

  useEffect(() => {
    dataRef.current = data;
    sceneRef.current?.setData(data);
  }, [data]);

  const gesture = useMemo(() => sceneGesture(input), [input]);

  return (
    <View style={style}>
      <GestureDetector gesture={gesture}>
        <View
          style={[styles.scene, { height }]}
          onLayout={onLayout}
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
        >
          {failed ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>{tr().views.noGl}</Text>
            </View>
          ) : (
            size && (
              <GLView
                key={`${view.id} ${lang} ${size.width}×${size.height}`}
                style={StyleSheet.absoluteFill}
                onContextCreate={onContextCreate}
              />
            )
          )}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {labels.map((spec) => (
              <SceneLabel key={spec.id} spec={spec} frame={frame} />
            ))}
          </View>
          {hover && size && <Tooltip hover={hover} size={size} />}
        </View>
      </GestureDetector>
      {/* Below the scene rather than over it, where it would cover the labels nearest the camera. */}
      {!failed && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/** A finger that moves orbits the view, two pinch it, and one that lifts where it landed reads a value. */
function sceneGesture(input: SceneInput | null) {
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => input?.dragStart())
    .onChange((event) => {
      // With two fingers down the pinch is in charge; their midpoint drifting shouldn't also turn the view.
      if (event.numberOfPointers === 1) input?.drag(event.changeX, event.changeY);
    })
    .onEnd(() => input?.dragEnd());
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => input?.dragStart())
    .onChange((event) => input?.pinch(event.scaleChange))
    .onEnd(() => input?.dragEnd());
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success) input?.tap(event.x, event.y);
    });
  return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
}

function SceneLabel({ spec, frame }: { spec: LabelSpec; frame: SharedValue<LabelFrame> }) {
  const band = useContext(BandColour);
  const { id, variant } = spec;
  const position = useAnimatedStyle(() => {
    const at = frame.value[id];
    if (!at) return { opacity: 0 };
    return { opacity: at[2], transform: [{ translateX: at[0] }, { translateY: at[1] }] };
  });

  return (
    <Animated.View style={[styles.anchor, position]}>
      <View style={styles.labelBox}>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            VARIANTS[variant],
            variant === 'now' && { color: band, textShadowColor: withAlpha(band, 0.7) },
          ]}
        >
          {spec.text}
        </Text>
      </View>
    </Animated.View>
  );
}

function Tooltip({ hover, size }: { hover: HoverInfo; size: Size }) {
  const [box, setBox] = useState<Size | null>(null);
  const { pm25, x, y } = hover;
  const band = pm25 === null ? null : bandFor(pm25);

  // Above the finger, which would hide anything below it, and never past the scene's edges.
  let left = 0;
  let top = 0;
  if (box) {
    left = clamp(x - box.width / 2, 8, size.width - box.width - 8);
    top = clamp(y - 28 - box.height >= 8 ? y - 28 - box.height : y + 28, 8, size.height - box.height - 8);
  }

  return (
    <View
      pointerEvents="none"
      onLayout={({ nativeEvent: { layout } }) => setBox({ width: layout.width, height: layout.height })}
      style={[styles.tooltip, { borderLeftColor: band?.color ?? '#5b6a7f', left, top, opacity: box ? 1 : 0 }]}
    >
      <Text style={styles.tooltipTime}>{hover.heading}</Text>
      {pm25 !== null && band ? (
        <>
          <Text style={[styles.tooltipValue, { color: band.color }]}>
            {Number.isInteger(pm25) ? pm25 : formatNumber(pm25, 1)}
            <Text style={styles.tooltipCaption}> {hover.caption}</Text>
          </Text>
          {hover.details.map((line) => (
            <Text key={line} style={styles.tooltipMinor}>{line}</Text>
          ))}
          <View style={styles.tooltipBand}>
            <View style={[styles.dot, { backgroundColor: band.color }]} />
            <Text style={styles.tooltipBandName}>{tr().bands[band.key].name}</Text>
          </View>
        </>
      ) : (
        hover.details.map((line) => (
          <Text key={line} style={styles.tooltipMinor}>{line}</Text>
        ))
      )}
    </View>
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// The web's .scene-label modifiers.
const VARIANTS: Record<LabelVariant, TextStyle> = {
  plain: {},
  strong: { color: colours.fg },
  who: { fontSize: 10, color: colours.guide },
  // Shifted clear of the ring it sits on, as the web's margin-left does.
  guide: { fontSize: 10, color: 'rgba(214, 230, 255, 0.72)', transform: [{ translateX: 78 }] },
  now: { letterSpacing: 1.98, textTransform: 'uppercase', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  callout: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 5,
    backgroundColor: 'rgba(5, 7, 11, 0.8)',
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    letterSpacing: 0,
    color: colours.fg,
  },
};

const styles = StyleSheet.create({
  scene: {
    overflow: 'hidden',
    backgroundColor: colours.bg,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colours.line,
  },
  fallbackText: {
    maxWidth: 320,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colours.muted,
    textAlign: 'center',
  },
  // A point with no size, moved to each label's position every frame.
  anchor: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  // A wide box centred on the anchor, so text of any width centres on its point as CSS2D labels do.
  labelBox: {
    position: 'absolute',
    left: -200,
    top: -20,
    width: 400,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.88,
    color: 'rgba(170, 192, 220, 0.55)',
  },
  hint: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 16,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.66,
    textAlign: 'center',
    color: colours.faint,
  },
  tooltip: {
    position: 'absolute',
    minWidth: 184,
    maxWidth: 300,
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderLeftWidth: 2,
    borderColor: colours.line,
    borderRadius: 6,
    backgroundColor: colours.surface,
  },
  tooltipTime: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.32,
    textTransform: 'uppercase',
    color: colours.muted,
  },
  tooltipValue: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  tooltipCaption: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colours.muted,
  },
  tooltipMinor: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colours.muted,
  },
  tooltipBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tooltipBandName: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colours.fg,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
