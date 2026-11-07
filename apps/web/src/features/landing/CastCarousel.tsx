"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { CHARACTER_IDS, getCharacter } from "@nether/party-core";
import type { CharacterId, Locale } from "@nether/contracts";

gsap.registerPlugin(useGSAP);

const AUTOPLAY_DELAY = 3.5;
const TRANSITION_DURATION = 0.8;
const count = CHARACTER_IDS.length;
const wrapIndex = gsap.utils.wrap(0, count);

type PauseReason = "hover" | "focus" | "touch" | "viewport" | "document" | "motion" | "manual";
type CarouselControls = {
  move: (direction: number) => void;
  select: (index: number) => void;
  pause: (reason: PauseReason, paused: boolean) => void;
  toggleAutoplay: () => void;
};

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={back ? "M20 12H5m6-6-6 6 6 6" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function CastCarousel({
  locale,
  href,
  onChoose,
}: {
  locale: Locale;
  href: (id: CharacterId) => string;
  onChoose: (id: CharacterId) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const controls = useRef<CarouselControls | null>(null);
  const reelId = useId();
  const [current, setCurrent] = useState(0);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const zh = locale === "zh";

  useGSAP(() => {
    const container = root.current;
    const element = reel.current;
    if (!container || !element) return;

    const cards = Array.from(element.children) as HTMLElement[];
    const setters = cards.map((card) => gsap.quickSetter(card, "x", "px"));
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paused = new Set<PauseReason>(["viewport"]);
    if (window.matchMedia("(hover: hover)").matches && container.matches(":hover")) paused.add("hover");
    if (container.contains(document.activeElement)) paused.add("focus");
    const position = { value: 0 };
    let target = 0;
    let step = 0;
    let active = 0;
    let automatic = false;
    let enabled = true;
    let delay: gsap.core.Tween | undefined;
    let tween: gsap.core.Tween | undefined;
    let resume: gsap.core.Tween | undefined;
    let pressedPointer: number | undefined;
    let gesture: { id: number; x: number; y: number; origin: number; dragging: boolean } | undefined;
    let suppressClick = false;

    // Recycle each original card only when it is fully outside the viewport.
    // There are seven links and seven images, with no cloned focus targets or end reset.
    gsap.set(cards, { x: 0 });
    const render = () => {
      cards.forEach((_, index) => {
        const slot = gsap.utils.wrap(-1, count - 1, index - position.value);
        setters[index]((slot - index) * step);
      });
      const nearest = wrapIndex(Math.round(position.value));
      if (nearest !== active) {
        active = nearest;
        setCurrent(nearest);
      }
    };

    const schedule = () => {
      delay?.kill();
      if (paused.size || tween || gesture) return;
      delay = gsap.delayedCall(AUTOPLAY_DELAY, () => animateTo(target + 1, true));
    };

    const animateTo = (destination: number, autoplay = false) => {
      delay?.kill();
      resume?.kill();
      tween?.kill();
      tween = undefined;
      target = destination;
      automatic = autoplay;
      const transferFocus = !autoplay && cards.includes(document.activeElement as HTMLElement);
      const finish = () => {
        // Keep the numerical position bounded without changing any card's visual position.
        position.value = target = wrapIndex(destination);
        tween = undefined;
        render();
        if (transferFocus && cards.includes(document.activeElement as HTMLElement)) {
          cards[wrapIndex(destination)].focus({ preventScroll: true });
        }
        schedule();
      };
      if (media.matches) {
        finish();
        return;
      }
      tween = gsap.to(position, {
        value: destination,
        duration: TRANSITION_DURATION,
        ease: "power3.inOut",
        onUpdate: render,
        onComplete: finish,
      });
    };

    const pause = (reason: PauseReason, value: boolean) => {
      if (paused.has(reason) === value) return;
      if (value) paused.add(reason);
      else paused.delete(reason);
      setPlaying(paused.size === 0);
      delay?.kill();
      if (tween && automatic) {
        resume?.kill();
        if (paused.size) tween.pause();
        else {
          tween.timeScale(0).resume();
          resume = gsap.to(tween, { timeScale: 1, duration: 0.25, ease: "power1.in" });
        }
      } else {
        schedule();
      }
    };

    const move = (direction: number) => animateTo(target + direction);
    const select = (index: number) => {
      const distance = gsap.utils.wrap(-count / 2, count / 2, index - wrapIndex(target));
      if (distance === 0 && position.value === target) return;
      animateTo(target + distance);
    };
    controls.current = {
      move,
      select,
      pause,
      toggleAutoplay: () => {
        enabled = !enabled;
        setAutoplayEnabled(enabled);
        pause("manual", !enabled);
      },
    };

    const measure = () => {
      step = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap);
      render();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    resizeObserver.observe(cards[0]);
    measure();

    const viewObserver = new IntersectionObserver(([entry]) => pause("viewport", !entry?.isIntersecting));
    viewObserver.observe(element);
    const onVisibility = () => pause("document", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    const onMotionChange = () => {
      setReducedMotion(media.matches);
      pause("motion", media.matches);
      // Finish at the selected card when the preference changes, preserving the selection.
      if (media.matches && tween) animateTo(target);
    };
    media.addEventListener("change", onMotionChange);
    onMotionChange();

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      pressedPointer = event.pointerId;
      pause("touch", true);
      if (!element.contains(event.target as Node)) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: position.value, dragging: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
        gesture.dragging = true;
        suppressClick = true;
        resume?.kill();
        tween?.kill();
        tween = undefined;
        element.setPointerCapture(event.pointerId);
      }
      position.value = gesture.origin - dx / step;
      render();
    };
    const endGesture = (event: PointerEvent) => {
      if (event.pointerId !== pressedPointer) return;
      pressedPointer = undefined;
      const { dragging = false, origin = position.value } = gesture ?? {};
      gesture = undefined;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (dragging) {
        const distance = position.value - origin;
        const destination = Math.abs(distance) > 0.15
          ? Math.round(origin) + (distance > 0 ? Math.ceil(distance) : Math.floor(distance))
          : Math.round(origin);
        animateTo(event.type === "pointercancel" ? Math.round(position.value) : destination);
      }
      pause("touch", false);
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    const onDragStart = (event: DragEvent) => event.preventDefault();
    let lastWheelAt = -Infinity;
    const onWheel = (event: WheelEvent) => {
      // Vertical wheel gestures still scroll the page; only horizontal intent selects a card.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 4) return;
      event.preventDefault();
      if (performance.now() - lastWheelAt < TRANSITION_DURATION * 1000) return;
      lastWheelAt = performance.now();
      move(event.deltaX > 0 ? 1 : -1);
    };
    container.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endGesture);
    window.addEventListener("pointercancel", endGesture);
    element.addEventListener("lostpointercapture", endGesture);
    element.addEventListener("click", onClick, true);
    element.addEventListener("dragstart", onDragStart);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      controls.current = null;
      delay?.kill();
      resume?.kill();
      tween?.kill();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotionChange);
      container.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
      element.removeEventListener("lostpointercapture", endGesture);
      element.removeEventListener("click", onClick, true);
      element.removeEventListener("dragstart", onDragStart);
      element.removeEventListener("wheel", onWheel);
    };
  }, { scope: root });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") controls.current?.select(0);
    else if (event.key === "End") controls.current?.select(count - 1);
    else controls.current?.move(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <div
      ref={root}
      className="cast-carousel"
      onKeyDown={handleKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") controls.current?.pause("hover", true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") controls.current?.pause("hover", false);
      }}
      onFocusCapture={() => controls.current?.pause("focus", true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          controls.current?.pause("focus", false);
        }
      }}
    >
      <div className="cast-gallery-tools">
        <p>{zh ? "七位来客，各有故事。选一位，开聊。" : "Seven guests. Seven stories. Choose your company."}</p>
        <div className="cast-gallery-controls">
          <div className="cast-pagination-dots" role="group" aria-label={zh ? "角色选择指示器" : "Character pagination"}>
            {CHARACTER_IDS.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={index === current}
                aria-controls={reelId}
                aria-label={`${getCharacter(id).name[locale]} (${index + 1}/${count})`}
                className={`cast-dot${index === current ? " is-active" : ""}`}
                onClick={() => controls.current?.select(index)}
              />
            ))}
          </div>
          <span
            className="cast-position"
            aria-live={playing ? "off" : "polite"}
            aria-atomic="true"
            aria-label={zh ? `当前第 ${current + 1} 位，共 ${count} 位角色` : `Character ${current + 1} of ${count}`}
          >
            {String(current + 1).padStart(2, "0")} <span>/ {String(count).padStart(2, "0")}</span>
          </span>
          <button
            className="cast-arrow"
            type="button"
            aria-controls={reelId}
            disabled={reducedMotion}
            aria-label={reducedMotion
              ? zh ? "已减少动态效果，自动播放关闭" : "Autoplay off for reduced motion"
              : autoplayEnabled ? zh ? "暂停自动播放" : "Pause autoplay" : zh ? "开启自动播放" : "Start autoplay"}
            onClick={() => controls.current?.toggleAutoplay()}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d={autoplayEnabled && !reducedMotion ? "M7 4v12M13 4v12" : "m7 4 9 6-9 6Z"} stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <button className="cast-arrow" type="button" aria-controls={reelId} onClick={() => controls.current?.move(-1)} aria-label={zh ? "上一位角色" : "Previous character"}>
            <Arrow back />
          </button>
          <button className="cast-arrow" type="button" aria-controls={reelId} onClick={() => controls.current?.move(1)} aria-label={zh ? "下一位角色" : "Next character"}>
            <Arrow />
          </button>
        </div>
      </div>
      <div
        ref={reel}
        id={reelId}
        className="cast-reel"
        tabIndex={0}
        role="region"
        aria-roledescription={zh ? "轮播图" : "carousel"}
        aria-label={zh ? "角色原画，左右滑动选择角色" : "Character artwork, scroll sideways to choose"}
      >
        {CHARACTER_IDS.map((id, index) => {
          const character = getCharacter(id);
          return (
            <Link
              key={id}
              href={href(id)}
              className={`cast-performer${index === current ? " is-active" : ""}`}
              aria-label={`${zh ? "与这位角色开聊" : "Talk to this character"}: ${character.name[locale]}`}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) controls.current?.select(index);
              }}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onChoose(id);
              }}
            >
              <div className="cast-effigy">
                <Image src={`/artworks/${id}.webp`} width={960} height={1200} alt="" unoptimized loading="lazy" draggable={false} />
              </div>
              <div className="cast-caption">
                <div className="cast-meta">
                  <span className="cast-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="cast-medium">
                    {id === "meng-po"
                      ? zh ? "3D 形象 · 实时语音" : "3D Avatar · Live voice"
                      : zh ? "角色原画 · 实时语音" : "Original artwork · Live voice"}
                  </span>
                </div>
                <span className="cast-name">{character.name[locale]}</span>
                <span className="cast-character-role">{character.role[locale]}</span>
                <span className="cast-invitation">
                  <span>{zh ? "与 TA 开聊" : "Start a conversation"}</span>
                  <Arrow />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
