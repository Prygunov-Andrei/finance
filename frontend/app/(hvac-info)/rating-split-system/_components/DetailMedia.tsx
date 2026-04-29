'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import { T } from './primitives';
import {
  parseRutubeId,
  parseVkVideo,
  parseYoutubeId,
} from './detailHelpers';

type Props = {
  detail: RatingModelDetail;
};

type VideoPlatform = 'youtube' | 'rutube' | 'vk';

type VideoEmbed = {
  platform: VideoPlatform;
  url: string;
  embed: string;
};

export default function DetailMedia({ detail }: Props) {
  const photos = detail.photos ?? [];
  const videos = collectVideos(detail);

  return (
    <section
      className="rt-detail-media"
      style={{
        padding: '28px 40px 36px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        className="rt-media-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 24,
        }}
      >
        <PhotoBlock
          photos={photos}
          modelName={detail.inner_unit}
          brandName={detail.brand.name}
        />
        <VideoBlock videos={videos} />
      </div>

      <style>{`
        @media (min-width: 900px) {
          .rt-media-grid { grid-template-columns: 1.05fr 1fr !important; }
        }
        @media (max-width: 899px) {
          .rt-detail-media { padding: 20px 18px 24px !important; }
        }
        .rt-photo-navbtn {
          background: rgba(255,255,255,0.92);
          color: hsl(var(--rt-ink));
        }
        .dark .rt-photo-navbtn {
          background: rgba(0,0,0,0.7);
          color: #fff;
        }
      `}</style>
    </section>
  );
}

function PhotoBlock({
  photos,
  modelName,
  brandName,
}: {
  photos: RatingModelDetail['photos'];
  modelName: string;
  brandName: string;
}) {
  const [idx, setIdx] = useState(0);
  if (photos.length === 0) {
    return (
      <div>
        <Placeholder label="Фото скоро появятся" aspect="3 / 2" />
      </div>
    );
  }
  const current = photos[Math.min(idx, photos.length - 1)];
  const prev = () => setIdx((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setIdx((i) => (i + 1) % photos.length);
  const thumbs = photos.slice(0, 12);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          aspectRatio: '3 / 2',
          background: 'hsl(var(--rt-chip))',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <PhotoZoom
          src={current.image_url}
          alt={current.alt || `Кондиционер ${brandName} ${modelName} — фото ${idx + 1}`}
          priority={idx === 0}
          // key — чтобы при переключении фото state hover/modal сбрасывался
          key={current.id}
        />
        <span
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            padding: '5px 10px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            borderRadius: 3,
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          {idx + 1} / {photos.length}
        </span>
        {photos.length > 1 && (
          <>
            <NavButton position="left" onClick={prev} />
            <NavButton position="right" onClick={next} />
          </>
        )}
      </div>

      {thumbs.length > 1 && (
        <div
          className="rt-thumbs"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
            marginTop: 10,
          }}
        >
          {thumbs.map((p, i) => {
            const active = i === idx;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Фото ${i + 1}`}
                style={{
                  padding: 0,
                  border: active
                    ? '1.5px solid hsl(var(--rt-accent))'
                    : '1px solid hsl(var(--rt-border-subtle))',
                  borderRadius: 4,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  aspectRatio: '3 / 2',
                  background: 'hsl(var(--rt-chip))',
                }}
              >
                <span
                  style={{
                    position: 'relative',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={
                      p.alt ||
                      `Кондиционер ${brandName} ${modelName} — фото ${i + 1}`
                    }
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Inline hover-zoom для фото детальной страницы.
 *
 * Desktop (`@media (hover: hover)`): при наведении курсора показывает
 * увеличенный фрагмент через background-image с background-position по
 * курсору. На устройствах без hover (`@media (hover: none)`) лупа не
 * рендерится через CSS-гейт — на мобильных тап открывает modal с
 * полноразмерным фото.
 *
 * Клик по фото на любом устройстве открывает modal — это полезный
 * fallback и для desktop (full-size без обрезки).
 */
function PhotoZoom({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [modalOpen, setModalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const onMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      {hover ? (
        <div
          aria-hidden
          className="rt-photo-zoom-lens"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: '200% 200%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `${pos.x}% ${pos.y}%`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      ) : null}
      <button
        type="button"
        ref={triggerRef}
        data-testid="photo-zoom"
        aria-label="Увеличить фото"
        className="rt-photo-zoom-trigger"
        onMouseMove={onMouseMove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setModalOpen(true)}
        style={{
          position: 'absolute',
          inset: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          border: 0,
          cursor: 'zoom-in',
          zIndex: 2,
        }}
      />
      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото"
          data-testid="photo-modal"
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
              cursor: 'default',
            }}
          />
          <button
            type="button"
            aria-label="Закрыть"
            data-testid="photo-modal-close"
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(false);
            }}
            style={{
              position: 'absolute',
              top: 16,
              right: 20,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)',
              border: 0,
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              color: 'hsl(var(--rt-ink))',
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <style>{`
        @media (hover: none) {
          .rt-photo-zoom-trigger { cursor: pointer !important; }
          .rt-photo-zoom-lens { display: none !important; }
        }
      `}</style>
    </>
  );
}

function NavButton({
  position,
  onClick,
}: {
  position: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={position === 'left' ? 'Предыдущее фото' : 'Следующее фото'}
      onClick={(e) => {
        // Останавливаем bubbling, чтобы клик по навигации не открывал
        // photo-modal (PhotoZoom-trigger лежит под navbuttons).
        e.stopPropagation();
        onClick();
      }}
      className="rt-photo-navbtn"
      style={{
        position: 'absolute',
        [position === 'left' ? 'left' : 'right']: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 3,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {position === 'left' ? <path d="M15 18 L9 12 L15 6" /> : <path d="M9 6 L15 12 L9 18" />}
      </svg>
    </button>
  );
}

function VideoBlock({ videos }: { videos: VideoEmbed[] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (videos.length === 0) {
    return (
      <div>
        <Placeholder label="Видеообзор скоро" aspect="16 / 9" />
      </div>
    );
  }

  const safeIdx = Math.min(activeIdx, videos.length - 1);
  const active = videos[safeIdx];

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#111',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <iframe
          key={active.url}
          src={active.embed}
          title={`Видео ${active.platform}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      </div>

      {videos.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <T
            size={10}
            color="hsl(var(--rt-ink-60))"
            mono
            style={{
              display: 'block',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
            }}
          >
            Смотреть на:
          </T>
          <div
            role="tablist"
            aria-label="Платформа видео"
            style={{
              display: 'inline-flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {videos.map((v, i) => {
              const isActive = i === safeIdx;
              return (
                <button
                  key={v.url}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-platform={v.platform}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    border: '1px solid '
                      + (isActive
                        ? 'hsl(var(--rt-accent))'
                        : 'hsl(var(--rt-border-subtle))'),
                    borderRadius: 6,
                    background: isActive
                      ? 'hsl(var(--rt-accent-bg))'
                      : 'hsl(var(--rt-paper))',
                    color: isActive
                      ? 'hsl(var(--rt-accent))'
                      : 'hsl(var(--rt-ink))',
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: 'var(--rt-font-sans)',
                    cursor: 'pointer',
                  }}
                >
                  <VideoMark platform={v.platform} active={isActive} />
                  <span>{platformLabel(v.platform)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoMark({
  platform,
  active,
}: {
  platform: VideoPlatform;
  active: boolean;
}) {
  const labels: Record<VideoPlatform, string> = {
    youtube: 'YT',
    rutube: 'RU',
    vk: 'ВК',
  };
  return (
    <span
      style={{
        width: 22,
        height: 18,
        borderRadius: 3,
        background: active
          ? 'hsl(var(--rt-accent))'
          : 'hsl(var(--rt-chip))',
        color: active ? 'hsl(var(--rt-paper))' : 'hsl(var(--rt-ink-60))',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {labels[platform]}
    </span>
  );
}

function platformLabel(platform: VideoPlatform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'rutube':
      return 'RUTUBE';
    case 'vk':
      return 'ВКонтакте';
  }
}

function Placeholder({
  label,
  aspect,
}: {
  label: string;
  aspect: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspect,
        background: 'hsl(var(--rt-chip))',
        border: '1px dashed hsl(var(--rt-border))',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T
        size={12}
        color="hsl(var(--rt-ink-40))"
        mono
        style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}
      >
        {label}
      </T>
    </div>
  );
}

function collectVideos(detail: RatingModelDetail): VideoEmbed[] {
  const out: VideoEmbed[] = [];
  const ytId = parseYoutubeId(detail.youtube_url || '');
  if (detail.youtube_url && ytId) {
    out.push({
      platform: 'youtube',
      url: detail.youtube_url,
      embed: `https://www.youtube.com/embed/${ytId}`,
    });
  }
  const rtId = parseRutubeId(detail.rutube_url || '');
  if (detail.rutube_url && rtId) {
    out.push({
      platform: 'rutube',
      url: detail.rutube_url,
      embed: `https://rutube.ru/play/embed/${rtId}`,
    });
  }
  const vk = parseVkVideo(detail.vk_url || '');
  if (detail.vk_url && vk) {
    out.push({
      platform: 'vk',
      url: detail.vk_url,
      embed: `https://vk.com/video_ext.php?oid=${vk.oid}&id=${vk.id}&hd=2`,
    });
  }
  return out;
}
