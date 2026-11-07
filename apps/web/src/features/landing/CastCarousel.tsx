"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Observer } from "gsap/Observer";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CHARACTER_IDS, getCharacter } from "@nether/party-core";
import type { CharacterId, Locale } from "@nether/contracts";

gsap.registerPlugin(useGSAP, ScrollTrigger, Observer);

const artwork = (id: CharacterId) => `/artworks/${id}.webp`;
const railIds = [...CHARACTER_IDS, ...CHARACTER_IDS, ...CHARACTER_IDS];

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
  const posters = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);

  const controlsHoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const manualPauseUntilRef = useRef(0);
  const posRef = useRef({ poster: 0, reel: 0, detail: 0 });

  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState({ first: 0, last: 0 });
  const zh = locale === "zh";

  const pauseAutoplay = useCallback((holdMs = 2800) => {
    manualPauseUntilRef.current = Math.max(manualPauseUntilRef.current, performance.now() + holdMs);
  }, []);

  const syncPosition = useCallback(() => {
    const element = reel.current;
    if (!element || element.children.length === 0) return;

    const firstCard = element.children[0] as HTMLElement;
    let nearest = 0;
    let nearestDist = Infinity;
    for (let index = 0; index < element.children.length; index++) {
      const card = element.children[index] as HTMLElement;
      const dist = Math.abs(card.offsetLeft - firstCard.offsetLeft - element.scrollLeft);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = index;
      }
    }
    setCurrent(nearest);

    const bounds = element.getBoundingClientRect();
    const shown = Array.from(element.children).flatMap((child, index) => {
      const card = child.getBoundingClientRect();
      const overlap = Math.min(card.right, bounds.right) - Math.max(card.left, bounds.left);
      return card.width > 0 && overlap >= card.width * 0.45 ? [index] : [];
    });
    const nextFirst = shown[0] ?? nearest;
    const nextLast = shown.at(-1) ?? nearest;
    setVisible((prev) =>
      prev.first === nextFirst && prev.last === nextLast ? prev : { first: nextFirst, last: nextLast }
    );
  }, []);

  useEffect(() => {
    const element = reel.current;
    if (!element) return;
    const observer = new ResizeObserver(syncPosition);
    observer.observe(element);
    syncPosition();
    return () => observer.disconnect();
  }, [syncPosition]);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const posterEl = posters.current;
        const reelEl = reel.current;
        const detailEl = details.current;
        if (!posterEl || !reelEl || !detailEl) return;

        const maxScroll = (el: HTMLElement) => Math.max(0, el.scrollWidth - el.clientWidth);

        const initPositions = () => {
          const maxD = maxScroll(detailEl);
          posRef.current.poster = posterEl.scrollLeft;
          posRef.current.reel = reelEl.scrollLeft;
          if (detailEl.scrollLeft <= 2 && maxD > 0) {
            detailEl.scrollLeft = maxD;
            posRef.current.detail = maxD;
          } else {
            posRef.current.detail = detailEl.scrollLeft;
          }
        };

        initPositions();
        const detailResize = new ResizeObserver(() => {
          if (posRef.current.detail <= 2 && maxScroll(detailEl) > 0) {
            const maxD = maxScroll(detailEl);
            detailEl.scrollLeft = maxD;
            posRef.current.detail = maxD;
          }
        });
        detailResize.observe(detailEl);

        const boostState = { target: 0, current: 0 };
        let lastBoostApplied = 0;
        let lastProgress = -1;
        let lastWheelAt = 0;

        const applyScrollBoost = (delta: number) => {
          boostState.target += delta;
          gsap.to(boostState, {
            current: boostState.target,
            duration: 0.42,
            ease: "power3.out",
            overwrite: "auto",
          });
        };

        // GSAP ScrollTrigger listens to page vertical scroll progress across the carousel section
        const scrollTrigger = ScrollTrigger.create({
          trigger: root.current,
          start: "clamp(top bottom)",
          end: "clamp(bottom top)",
          scrub: 0.65,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (lastProgress < 0) {
              lastProgress = self.progress;
              return;
            }
            const dProgress = self.progress - lastProgress;
            lastProgress = self.progress;
            // Ignore single-frame programmatic anchor jumps (> 0.35 progress)
            if (
              Math.abs(dProgress) > 0.0004 &&
              Math.abs(dProgress) <= 0.35 &&
              performance.now() - lastWheelAt > 48
            ) {
              const span = Math.max(720, maxScroll(reelEl));
              applyScrollBoost(dProgress * span * 1.15);
            }
          },
        });

        // GSAP Observer listens directly to mouse wheel and touch scroll gestures
        const wheelObserver = Observer.create({
          target: window,
          type: "wheel,touch",
          wheelSpeed: 1,
          onChange: (self) => {
            const container = root.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            if (rect.bottom < -120 || rect.top > window.innerHeight + 120) return;

            const deltaY = self.deltaY ?? 0;
            const deltaX = self.deltaX ?? 0;
            const primary = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
            if (Math.abs(primary) < 0.5) return;

            lastWheelAt = performance.now();
            lastProgress = scrollTrigger.progress;
            applyScrollBoost(primary * 1.25);
          },
        });

        let inView = false;
        const containerEl = root.current;
        const viewObserver = new IntersectionObserver(
          ([entry]) => {
            inView = Boolean(entry?.isIntersecting);
          },
          { rootMargin: "160px 0px" }
        );
        if (containerEl) viewObserver.observe(containerEl);

        // Continuous GSAP ticker for automatic scrolling + GSAP-tweened mouse wheel boost
        const tick = (_time: number, deltaTime: number) => {
          const boostStep = boostState.current - lastBoostApplied;
          lastBoostApplied = boostState.current;

          if (!inView && Math.abs(boostStep) <= 0.02) return;
          const elapsed = Math.min(64, Math.max(8, deltaTime || 16.67));
          const now = performance.now();
          const isPaused =
            !inView ||
            controlsHoveredRef.current ||
            focusedRef.current ||
            now < manualPauseUntilRef.current;

          const autoPoster = isPaused ? 0 : (52 * elapsed) / 1000;
          const autoReel = isPaused ? 0 : (58 * elapsed) / 1000;
          const autoDetail = isPaused ? 0 : (52 * elapsed) / 1000;

          const maxP = maxScroll(posterEl);
          if (maxP > 0) {
            posRef.current.poster += autoPoster + boostStep;
            if (posRef.current.poster >= maxP) posRef.current.poster -= maxP;
            else if (posRef.current.poster < 0) posRef.current.poster += maxP;
            posterEl.scrollLeft = posRef.current.poster;
          }

          const maxD = maxScroll(detailEl);
          if (maxD > 0) {
            posRef.current.detail -= autoDetail + boostStep;
            if (posRef.current.detail <= 0) posRef.current.detail += maxD;
            else if (posRef.current.detail > maxD) posRef.current.detail -= maxD;
            detailEl.scrollLeft = posRef.current.detail;
          }

          const maxR = maxScroll(reelEl);
          if (maxR > 0) {
            const reelDelta = autoReel + (focusedRef.current ? 0 : boostStep * 0.95);
            if (Math.abs(reelDelta) > 0.01) {
              posRef.current.reel += reelDelta;
              if (posRef.current.reel >= maxR) posRef.current.reel = 0;
              else if (posRef.current.reel < 0) posRef.current.reel = maxR;
              reelEl.scrollLeft = posRef.current.reel;
            }
          }
        };

        gsap.ticker.add(tick);

        return () => {
          gsap.ticker.remove(tick);
          wheelObserver.kill();
          scrollTrigger.kill();
          viewObserver.disconnect();
          detailResize.disconnect();
          gsap.killTweensOf(boostState);
          gsap.killTweensOf(reelEl);
          posterEl.scrollLeft = 0;
          reelEl.scrollLeft = 0;
          detailEl.scrollLeft = 0;
          posRef.current = { poster: 0, reel: 0, detail: 0 };
        };
      });

      return () => media.revert();
    },
    { scope: root }
  );

  const animateReelTo = useCallback(
    (targetLeft: number) => {
      const element = reel.current;
      if (!element) return;
      const distance = Math.max(0, element.scrollWidth - element.clientWidth);
      const clamped = Math.max(0, Math.min(distance, targetLeft));
      pauseAutoplay(3200);
      gsap.killTweensOf(element);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        element.scrollLeft = clamped;
        posRef.current.reel = clamped;
        syncPosition();
      } else {
        gsap.to(element, {
          scrollLeft: clamped,
          duration: 0.28,
          ease: "power3.out",
          overwrite: true,
          onUpdate: () => {
            posRef.current.reel = element.scrollLeft;
            syncPosition();
          },
          onComplete: () => {
            posRef.current.reel = element.scrollLeft;
            syncPosition();
          },
        });
      }
    },
    [pauseAutoplay, syncPosition]
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      const element = reel.current;
      if (!element || !element.children[index]) return;
      const first = element.children[0] as HTMLElement;
      const target = element.children[index] as HTMLElement;
      const distance = Math.max(0, element.scrollWidth - element.clientWidth);
      const targetOffset =
        index === 0
          ? 0
          : index === CHARACTER_IDS.length - 1
          ? distance
          : target.offsetLeft - first.offsetLeft;
      setCurrent(index);
      animateReelTo(targetOffset);
    },
    [animateReelTo]
  );

  const move = useCallback(
    (direction: number) => {
      const element = reel.current;
      if (!element || element.children.length < 2) return;
      const distance = Math.max(0, element.scrollWidth - element.clientWidth);
      const first = element.children[0] as HTMLElement;
      const second = element.children[1] as HTMLElement;
      const step = second.offsetLeft - first.offsetLeft;
      const atEnd = element.scrollLeft >= distance - 2;
      const atStart = element.scrollLeft <= 2;
      const nextLeft =
        direction > 0 && atEnd
          ? 0
          : direction < 0 && atStart
          ? distance
          : element.scrollLeft + direction * step;
      animateReelTo(nextLeft);
    },
    [animateReelTo]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const element = reel.current;
      if (!element) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        setCurrent(0);
        animateReelTo(0);
      } else if (event.key === "End") {
        setCurrent(CHARACTER_IDS.length - 1);
        animateReelTo(element.scrollWidth - element.clientWidth);
      } else {
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    },
    [animateReelTo, move]
  );

  const firstLabel = String(visible.first + 1).padStart(2, "0");
  const lastLabel = String(visible.last + 1).padStart(2, "0");

  return (
    <div
      ref={root}
      className="cast-carousel"
      onTouchStart={() => pauseAutoplay(3500)}
      onFocusCapture={() => {
        focusedRef.current = true;
        pauseAutoplay(3500);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          focusedRef.current = false;
          pauseAutoplay(1200);
        }
      }}
    >
      {/* Top Row: Character posters ribbon driven by GSAP auto-scroll & ScrollTrigger/wheel */}
      <div className="cast-ribbon cast-poster-ribbon" aria-hidden="true">
        <div ref={posters} className="cast-ribbon-reel">
          {railIds.map((id, index) => (
            <div className="cast-poster-print" key={`${id}-${index}`}>
              <Image
                src={getCharacter(id).posterUrl}
                width={500}
                height={500}
                alt=""
                unoptimized
                loading="lazy"
              />
              <span className="cast-poster-tag">{getCharacter(id).name[locale]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Control Bar: Lead copy + Pagination ticks + Range counter + Square Prev/Next */}
      <div className="cast-gallery-tools">
        <p>{zh ? "七位来客，各有故事。选一位，开聊。" : "Seven guests. Seven stories. Choose your company."}</p>
        <div
          className="cast-gallery-controls"
          onPointerEnter={() => {
            controlsHoveredRef.current = true;
          }}
          onPointerLeave={() => {
            controlsHoveredRef.current = false;
            pauseAutoplay(1200);
          }}
        >
          <div
            className="cast-pagination-dots"
            role="tablist"
            aria-label={zh ? "角色选择指示器" : "Character pagination"}
          >
            {CHARACTER_IDS.map((id, index) => {
              const isActive = index === current;
              const char = getCharacter(id);
              return (
                <button
                  key={`dot-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${char.name[locale]} (${index + 1}/7)`}
                  className={`cast-dot${isActive ? " is-active" : ""}`}
                  onClick={() => scrollToIndex(index)}
                />
              );
            })}
          </div>
          <span
            className="cast-position"
            aria-live="polite"
            aria-atomic="true"
            aria-label={
              zh
                ? `正在显示第 ${visible.first + 1} 至 ${visible.last + 1} 位，共七位角色`
                : `Showing characters ${visible.first + 1} to ${visible.last + 1} of seven`
            }
          >
            {firstLabel}
            {firstLabel !== lastLabel && `–${lastLabel}`} <span>/ 07</span>
          </span>
          <button
            className="cast-arrow"
            type="button"
            onClick={() => move(-1)}
            aria-label={zh ? "上一位角色" : "Previous character"}
          >
            <Arrow back />
          </button>
          <button
            className="cast-arrow"
            type="button"
            onClick={() => move(1)}
            aria-label={zh ? "下一位角色" : "Next character"}
          >
            <Arrow />
          </button>
        </div>
      </div>

      {/* Center Row: Seven full 4:5 character artboards */}
      <div
        ref={reel}
        className="cast-reel"
        tabIndex={0}
        role="region"
        aria-label={zh ? "角色原画，左右滑动选择角色" : "Character artwork, scroll sideways to choose"}
        onKeyDown={handleKeyDown}
        onScroll={() => {
          const element = reel.current;
          if (element && Math.abs(element.scrollLeft - posRef.current.reel) > 6) {
            posRef.current.reel = element.scrollLeft;
            pauseAutoplay(2400);
          }
          syncPosition();
        }}
      >
        {CHARACTER_IDS.map((id, index) => {
          const character = getCharacter(id);
          const isActive = index === current;
          return (
            <Link
              key={id}
              href={href(id)}
              className={`cast-performer${isActive ? " is-active" : ""}`}
              aria-label={`${zh ? "与这位角色开聊" : "Talk to this character"}: ${character.name[locale]}`}
              onFocus={() => {
                setCurrent(index);
                const element = reel.current;
                if (!element) return;
                const first = element.children[0] as HTMLElement;
                const card = element.children[index] as HTMLElement;
                if (!first || !card) return;
                const cardLeft = card.offsetLeft - first.offsetLeft;
                const cardRight = cardLeft + card.offsetWidth;
                if (cardLeft < element.scrollLeft || cardRight > element.scrollLeft + element.clientWidth) {
                  element.scrollLeft = Math.max(0, cardLeft);
                  posRef.current.reel = element.scrollLeft;
                  syncPosition();
                }
              }}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onChoose(id);
              }}
            >
              <div className="cast-effigy">
                <Image src={artwork(id)} width={960} height={1200} alt="" unoptimized loading="lazy" />
              </div>
              <div className="cast-caption">
                <div className="cast-meta">
                  <span className="cast-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="cast-medium">
                    {id === "meng-po"
                      ? zh
                        ? "3D 形象 · 实时语音"
                        : "3D Avatar · Live voice"
                      : zh
                      ? "角色原画 · 实时语音"
                      : "Original artwork · Live voice"}
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

      {/* Bottom Row: Reverse-flowing artwork detail ribbon */}
      <div className="cast-ribbon cast-detail-ribbon" aria-hidden="true">
        <div ref={details} className="cast-ribbon-reel">
          {railIds.map((id, index) => (
            <div className="cast-detail-print" key={`${id}-${index}`}>
              <Image src={artwork(id)} width={960} height={1200} alt="" unoptimized loading="lazy" />
              <span>{getCharacter(id).name[locale]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
