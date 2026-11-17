'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { dataAttrs, dataFlag, Icon, memberAttr, useAgentMember } from '@polymorph/react'
import { Button } from './Button'
import { Slider } from './Slider'
import {
  clampCenter,
  coverScale,
  exportGeometry,
  initialCenter,
  ZOOM_MAX,
  ZOOM_MIN,
  type Point,
  type Size,
} from './image-editor.geometry'
import styles from '@polymorph/recipes/controls/image-editor.module.css'

/**
 * Pans, zooms and rotates an image in a fixed crop (`design/components/image-editor.md`). It
 * exports the framed result. It supports pointer *and* keyboard, has a minimum zoom that never
 * lets the crop extend past the image, and exports from the natural image rather than the
 * screen's pixels.
 *
 * The geometry is in `image-editor.geometry.ts`, pure and unit-tested. This file only wires
 * gestures to that math.
 */

export interface ImageEditorMessages {
  /** The empty state's title. Default: `Add an image`. */
  title?: string
  /** The empty state's hint. Default: `Drop, paste, or browse`. */
  hint?: string
  /** The browse button. Default: `Browse files`. */
  browse?: string
  /** The rotate button's accessible name. Default: `Rotate 90 degrees`. */
  rotate?: string
  /** The mirror button's accessible name. Default: `Flip horizontally`. */
  flip?: string
  /** The reset button's accessible name. Default: `Reset framing`. */
  reset?: string
  /** The zoom slider's accessible name. Default: `Zoom`. */
  zoom?: string
  cancel?: string
  confirm?: string
  /** The stage image's alt. Default: `Image being framed`. */
  alt?: string
  /** The keyboard surface's accessible name. Default explains the keys. */
  stage?: string
  /** Announced when the selected bytes cannot be decoded as an image. */
  loadError?: string
}

const MESSAGES = {
  title: 'Add an image',
  hint: 'Drop, paste, or browse',
  browse: 'Browse files',
  rotate: 'Rotate 90 degrees',
  flip: 'Flip horizontally',
  reset: 'Reset framing',
  zoom: 'Zoom',
  cancel: 'Cancel',
  confirm: 'Save',
  alt: 'Image being framed',
  stage: 'Image position. Arrow keys pan, plus and minus zoom.',
  loadError: "That image couldn't be read. Choose another file.",
} satisfies Required<ImageEditorMessages>

export interface ImageEditorProps {
  /** The image to edit. When omitted, the editor shows its empty state. */
  src?: string
  /** The crop's width over its height. */
  aspectRatio?: number
  /** A preview-only mask over the crop. The exported rectangle is unchanged. */
  mask?: 'none' | 'circle' | 'rounded'
  /** Shows the mirror control, a command animated like rotate. */
  flip?: boolean
  /** Shows a reset to minimum zoom: cover, centred, unrotated, unmirrored. */
  reset?: boolean
  /** Rule-of-thirds lines while panning, to help composition rather than decorate. */
  grid?: boolean
  /** The maximum zoom as a multiple of cover, clamped to 2-8. */
  maxZoom?: number
  /** The exported rectangle's longest edge, px. */
  exportSize?: number
  exportType?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** The framed result. A returned promise holds the confirm button busy. */
  onConfirm: (image: Blob) => void | Promise<void>
  /** When omitted, no cancel button renders. */
  onCancel?: () => void
  disabled?: boolean
  /** The member's strings. See `ImageEditorMessages`. */
  messages?: ImageEditorMessages
  id?: string
}

/** Keyboard pan steps in px: one space step, or four with Shift. */
const PAN_STEP = 8
const PAN_STEP_LARGE = 32
/** The zoom slider uses percent of cover, so 100 is the minimum. */
const ZOOM_SLIDER_STEP = 5

export function ImageEditor({
  src,
  aspectRatio = 1,
  mask = 'none',
  flip = false,
  reset = false,
  grid = false,
  maxZoom = ZOOM_MAX,
  exportSize = 512,
  exportType = 'image/png',
  onConfirm,
  onCancel,
  disabled = false,
  messages,
  id,
}: ImageEditorProps) {
  const say = { ...MESSAGES, ...messages }
  /** The maximum, clamped to the spec's 2-8 range. The minimum is never a prop. */
  const zoomRoof = Math.min(8, Math.max(2, maxZoom))

  const generatedId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const dropzoneRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * An adopted file (drop, paste, browse) gets an object URL and replaces `src` until the caller
   * *changes* `src`, which then takes precedence. It is derived at render, so no effect syncs
   * state to a prop.
   */
  const [adopted, setAdopted] = useState<{ url: string; over: string | undefined } | null>(null)
  const source = adopted !== null && adopted.over === src ? adopted.url : src
  /** This component revokes the object URLs it creates, never a caller's `src`. */
  const owned = useRef<string | null>(null)
  const [dragover, setDragover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const focusStageOnLoad = useRef(false)
  /**
   * Set when an *adopted* file fails to decode, and cleared by the commit that shows the dropzone
   * again. A failing caller `src` is announced but never moves focus, because the user did nothing
   * to cause it.
   */
  const focusDropzoneOnError = useRef(false)

  const [natural, setNatural] = useState<Size | null>(null)
  const [viewport, setViewport] = useState<Size | null>(null)
  const [center, setCenter] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(ZOOM_MIN)
  const [turns, setTurns] = useState(0)
  const [mirrored, setMirrored] = useState(false)
  const [panning, setPanning] = useState(false)
  /** Set only while a command's transition settles. Gestures are never animated. */
  const [animate, setAnimate] = useState(false)

  useEffect(
    () => () => {
      if (owned.current !== null) URL.revokeObjectURL(owned.current)
    },
    [],
  )

  function adopt(file: File) {
    if (disabled || !file.type.startsWith('image/')) return
    if (owned.current !== null) URL.revokeObjectURL(owned.current)
    owned.current = URL.createObjectURL(file)
    focusStageOnLoad.current = true
    setLoadError(false)
    setNatural(null)
    setAdopted({ url: owned.current, over: src })
  }

  // A new `src` is a new attempt, so the previous image's failure no longer applies. This is
  // adjusted during render when `src` changes, which is React's pattern for state that follows a
  // prop. An effect would paint the stale error for one frame first.
  const [attempted, setAttempted] = useState(src)
  if (attempted !== src) {
    setAttempted(src)
    setLoadError(false)
  }

  /**
   * Paste is accepted only while focus is inside the editor, because capturing paste across the
   * whole document would be a bug (image-editor.md).
   */
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const root = rootRef.current
      if (root === null || !root.contains(document.activeElement)) return
      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) adopt(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  /**
   * Whether the current image has been framed against a real viewport yet. A gallery card can have
   * a zero-sized stage when the image loads, so the first *measured* box does the framing. Every
   * later resize only re-clamps, and never re-centres a frame the user has adjusted.
   */
  const framed = useRef(false)

  /** Tracks the stage's box. The first real size frames the image, and later sizes clamp it. */
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null || source === undefined) return
    const measure = () => {
      const view = { width: stage.clientWidth, height: stage.clientHeight }
      if (view.width <= 0 || view.height <= 0) return
      setViewport(view)
      if (natural === null) return
      if (!framed.current) {
        framed.current = true
        setCenter(initialCenter(view))
        return
      }
      setCenter((current) => clampCenter(current, natural, view, zoom, turns))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [source, natural, zoom, turns])

  function onImageLoad() {
    const image = imageRef.current
    if (image === null) return
    framed.current = false
    setNatural({ width: image.naturalWidth, height: image.naturalHeight })
    setZoom(ZOOM_MIN)
    setTurns(0)
    setMirrored(false)
    setLoadError(false)
    if (focusStageOnLoad.current) {
      focusStageOnLoad.current = false
      requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }))
    }
  }

  function onImageError() {
    setNatural(null)
    setLoadError(true)
    // The failure follows the load's intent. Only a file the user adopted was going to take focus,
    // so only that failure moves focus to the dropzone.
    focusDropzoneOnError.current = focusStageOnLoad.current
    focusStageOnLoad.current = false
  }

  /**
   * A failed decode moves focus to the dropzone from the commit that mounts it, not from the next
   * animation frame. The error's render is a scheduled task, and a frame can run before it. Under
   * a loaded test runner (measured), the frame's `dropzoneRef.current` is still null, the focus
   * call does nothing, and the user is left on `<body>` next to an alert they have not reached. An
   * effect keyed on the error runs only after that commit, when the ref is set. The stage's own
   * load focus (`onImageLoad`) can keep using a frame, because the stage already exists when the
   * image arrives.
   */
  useEffect(() => {
    if (!loadError || !focusDropzoneOnError.current) return
    focusDropzoneOnError.current = false
    dropzoneRef.current?.focus({ preventScroll: true })
  }, [loadError])

  const ready = source !== undefined && natural !== null && viewport !== null

  function reclamp(next: Partial<{ center: Point; zoom: number; turns: number }>) {
    if (natural === null || viewport === null) return
    const z = next.zoom ?? zoom
    const t = next.turns ?? turns
    const c = clampCenter(next.center ?? center, natural, viewport, z, t)
    setZoom(z)
    setTurns(t)
    setCenter(c)
  }

  /** Direct manipulation is never animated, so a gesture during a command's transition stops it. */
  function hands() {
    setAnimate(false)
  }

  // -- pointer pan ----------------------------------------------------------
  const grip = useRef<{ pointer: Point; center: Point } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !ready) return
    hands()
    // Capture keeps the drag going when the pointer leaves the stage. A pointer the browser is not
    // tracking (a test's synthetic event, a pen already lifted) cannot be captured, and the drag
    // still works while the pointer stays over the stage.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* uncaptured drags still pan */
    }
    grip.current = { pointer: { x: event.clientX, y: event.clientY }, center }
    setPanning(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (grip.current === null) return
    const { pointer, center: from } = grip.current
    reclamp({
      center: { x: from.x + event.clientX - pointer.x, y: from.y + event.clientY - pointer.y },
    })
  }

  function onPointerUp() {
    grip.current = null
    setPanning(false)
  }

  // -- wheel zoom -----------------------------------------------------------
  /**
   * A real, non-passive listener, because it must prevent page scrolling. React's root-delegated
   * wheel handlers are passive and cannot.
   */
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null || !ready || disabled) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      hands()
      const step = (ZOOM_SLIDER_STEP / 100) * (event.deltaY < 0 ? 1 : -1)
      reclamp({ zoom: Math.min(zoomRoof, Math.max(ZOOM_MIN, zoom + step)) })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  })

  // -- keyboard -------------------------------------------------------------
  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || !ready) return
    const step = event.shiftKey ? PAN_STEP_LARGE : PAN_STEP
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      hands()
      reclamp({ center: { x: center.x + move.x, y: center.y + move.y } })
      return
    }
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault()
      hands()
      const delta = (ZOOM_SLIDER_STEP / 100) * (event.key === '-' ? -1 : 1)
      reclamp({ zoom: Math.min(zoomRoof, Math.max(ZOOM_MIN, zoom + delta)) })
    }
  }

  // -- commands -------------------------------------------------------------
  function rotate() {
    if (!ready) return
    setAnimate(true)
    reclamp({ turns: (turns + 1) % 4 })
  }

  /** The mirror: negates x in image space and composes with turns. Sizes do not change. */
  function mirror() {
    if (!ready) return
    setAnimate(true)
    setMirrored((current) => !current)
  }

  /** Back to minimum zoom: cover, centred, unrotated, unmirrored. */
  function resetFraming() {
    if (!ready || viewport === null) return
    setAnimate(true)
    setMirrored(false)
    setZoom(ZOOM_MIN)
    setTurns(0)
    setCenter(initialCenter(viewport))
  }

  async function confirm() {
    const image = imageRef.current
    if (image === null || natural === null || viewport === null) return
    const geometry = exportGeometry(natural, viewport, center, zoom, turns, exportSize, mirrored)
    const canvas = document.createElement('canvas')
    canvas.width = geometry.canvasWidth
    canvas.height = geometry.canvasHeight
    const context = canvas.getContext('2d')
    if (context === null) return
    context.translate(geometry.translateX, geometry.translateY)
    context.rotate(geometry.rotationRadians)
    context.scale(geometry.scaleX, geometry.scaleY)
    context.drawImage(image, geometry.drawX, geometry.drawY)

    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, exportType))
      if (blob !== null) await onConfirm(blob)
    } finally {
      setBusy(false)
    }
  }

  // -- render ---------------------------------------------------------------
  const scale = ready ? coverScale(natural, viewport, turns) * zoom : 1
  const empty = source === undefined || loadError

  /*
   * An agent reads whether an image is loaded and whether the framed image is being handed to
   * the application, and runs nothing: a person frames the image with a pointer or the keys on
   * the stage and confirms what they framed, and a file comes from a person's disk. So the
   * editor withholds its Buttons and its zoom Slider. The stage names it once an image is loaded.
   */
  useAgentMember({
    member: 'ImageEditor',
    element: () => stageRef.current ?? rootRef.current,
    state: () => ({ empty, busy, disabled }),
    actions: {},
    withholds: () => rootRef.current,
  })

  return (
    <div
      ref={rootRef}
      id={id ?? generatedId}
      className={styles.root}
      {...dataAttrs({ disabled })}
      // A valued attribute that only this component uses. `dataAttrs` has a closed shared shape,
      // so the mask sets its own attribute (as `data-presentation` does).
      data-mask={mask === 'none' ? undefined : mask}
      {...dataFlag('empty', empty)}
      {...dataFlag('dragover', dragover)}
      {...dataFlag('busy', busy)}
      {...memberAttr('ImageEditor')}
    >
      {empty ? (
        <div
          ref={dropzoneRef}
          className={styles.dropzone}
          style={{ aspectRatio }}
          tabIndex={-1}
          onDragOver={(event: DragEvent) => {
            event.preventDefault()
            if (!disabled) setDragover(true)
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={(event: DragEvent) => {
            event.preventDefault()
            setDragover(false)
            const file = event.dataTransfer.files[0]
            if (file) adopt(file)
          }}
        >
          <Icon name="upload" size="lg" />
          <p className={styles.title}>{say.title}</p>
          <p className={styles.hint} role={loadError ? 'alert' : undefined}>
            {loadError ? say.loadError : say.hint}
          </p>
          <Button
            variant="outline"
            label={say.browse}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            className={styles.file}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0]
              if (file) adopt(file)
              event.target.value = ''
            }}
          />
        </div>
      ) : (
        <>
          <div
            ref={stageRef}
            className={styles.stage}
            style={{ aspectRatio }}
            // The part hook the conformance runner locates the stage by, so its
            // tab stop and name are checked rather than used to find it.
            data-image-editor-part="stage"
            role="application"
            aria-label={say.stage}
            tabIndex={disabled ? undefined : 0}
            {...dataFlag('panning', panning)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onStageKeyDown}
          >
            {/*
             * One transform, anchored at the centre: move the image's centre to the tracked point,
             * then rotate and scale around it. The export repeats this math at full resolution
             * (the geometry module).
             */}
            <img
              ref={imageRef}
              className={styles.image}
              src={source}
              alt={say.alt}
              draggable={false}
              crossOrigin={
                source.startsWith('data:') || source.startsWith('blob:') ? undefined : 'anonymous'
              }
              {...dataFlag('animate', animate)}
              {...dataFlag('mirrored', mirrored)}
              style={
                !ready
                  ? { visibility: 'hidden' }
                  : {
                      transform:
                        `translate(${center.x - natural.width / 2}px, ${center.y - natural.height / 2}px) ` +
                        `rotate(${turns * 90}deg) scale(${mirrored ? -scale : scale}, ${scale})`,
                    }
              }
              onLoad={onImageLoad}
              onError={onImageError}
              onTransitionEnd={() => setAnimate(false)}
            />
            {mask === 'none' ? null : (
              <div
                className={mask === 'circle' ? styles.maskCircle : styles.maskRounded}
                aria-hidden="true"
              />
            )}
            {grid ? <div className={styles.grid} aria-hidden="true" /> : null}
          </div>

          <div className={styles.tools}>
            <Button
              variant="ghost"
              icon="rotate"
              iconOnly
              label={say.rotate}
              disabled={disabled || busy}
              onClick={rotate}
            />
            {flip ? (
              <Button
                variant="ghost"
                icon="flip"
                iconOnly
                label={say.flip}
                disabled={disabled || busy}
                onClick={mirror}
              />
            ) : null}
            {reset ? (
              <Button
                variant="ghost"
                icon="undo"
                iconOnly
                label={say.reset}
                disabled={disabled || busy}
                onClick={resetFraming}
              />
            ) : null}
            <div className={styles.zoom}>
              <Slider
                min={ZOOM_MIN * 100}
                max={zoomRoof * 100}
                step={ZOOM_SLIDER_STEP}
                showValue
                value={Math.round(zoom * 100)}
                onChange={(value) => {
                  hands()
                  reclamp({ zoom: value / 100 })
                }}
                formatValue={(value) => `${value}%`}
                disabled={disabled || busy || !ready}
                aria-label={say.zoom}
              />
            </div>
          </div>

          <div className={styles.actions}>
            {onCancel === undefined ? null : (
              <Button
                variant="ghost"
                label={say.cancel}
                disabled={disabled || busy}
                onClick={onCancel}
              />
            )}
            <Button
              variant="solid"
              label={say.confirm}
              disabled={disabled || !ready}
              loading={busy}
              onClick={() => {
                void confirm()
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
