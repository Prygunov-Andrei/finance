'use client';

import { useState } from 'react';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import { Eyebrow, T } from './primitives';
import {
  parseRutubeId,
  parseVkVideo,
  parseYoutubeId,
} from './detailHelpers';

type Props = {
  detail: RatingModelDetail;
};

type VideoEmbed =
  | { platform: 'youtube'; url: string; embed: string }
  | { platform: 'rutube'; url: string; embed: string }
  | { platform: 'vk'; url: string; embed: string };

type VideoLink = {
  platform: 'youtube' | 'rutube' | 'vk';
  url: string;
};

export default function DetailMedia({ detail }: Props) {
  const photos = detail.photos ?? [];
  const videos = collectVideos(detail);
  const primary = videos[0];
  const extra = videos.slice(1);

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
        <PhotoBlock photos={photos} modelName={detail.inner_unit} />
        <VideoBlock primary={primary} extra={extra} />
      </div>

      <style>{`
        @media (min-width: 900px) {
          .rt-media-grid { grid-template-columns: 1.05fr 1fr !important; }
        }
        @media (max-width: 899px) {
          .rt-detail-media { padding: 20px 18px 24px !important; }
        }
      `}</style>
    </section>
  );
}

function PhotoBlock({
  photos,
  modelName,
}: {
  photos: RatingModelDetail['photos'];
  modelName: string;
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.image}
          alt={current.alt || modelName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 14,
            top: 14,
            padding: '5px 12px',
            background: 'rgba(255,255,255,0.92)',
            color: 'hsl(var(--rt-ink))',
            borderRadius: 3,
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Фото · галерея
        </span>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt={p.alt || `Фото ${i + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
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
      onClick={onClick}
      aria-label={position === 'left' ? 'Предыдущее фото' : 'Следующее фото'}
      style={{
        position: 'absolute',
        [position === 'left' ? 'left' : 'right']: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.92)',
        border: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'hsl(var(--rt-ink))',
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {position === 'left' ? <path d="M15 18 L9 12 L15 6" /> : <path d="M9 6 L15 12 L9 18" />}
      </svg>
    </button>
  );
}

function VideoBlock({
  primary,
  extra,
}: {
  primary: VideoEmbed | null;
  extra: VideoLink[];
}) {
  if (!primary) {
    return (
      <div>
        <Placeholder label="Видеообзор скоро" aspect="16 / 9" />
      </div>
    );
  }

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
          src={primary.embed}
          title={`Видео ${primary.platform}`}
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

      {extra.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Eyebrow style={{ display: 'block', marginBottom: 10 }}>
            Смотреть на платформах
          </Eyebrow>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 10,
            }}
            className="rt-video-extras"
          >
            {extra.map((v) => (
              <a
                key={v.url}
                href={v.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid hsl(var(--rt-border-subtle))',
                  borderRadius: 6,
                  background: 'hsl(var(--rt-paper))',
                  textDecoration: 'none',
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                <VideoMark platform={v.platform} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <T size={13} weight={600}>
                    {platformLabel(v.platform)}
                  </T>
                  <T
                    size={11}
                    color="hsl(var(--rt-ink-60))"
                    style={{ marginTop: 2, display: 'block' }}
                  >
                    открыть на платформе
                  </T>
                </div>
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="hsl(var(--rt-ink-40))"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 6 L15 12 L9 18" />
                </svg>
              </a>
            ))}
            <style>{`
              @media (min-width: 900px) {
                .rt-video-extras { grid-template-columns: 1fr 1fr !important; }
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoMark({ platform }: { platform: VideoLink['platform'] }) {
  const labels: Record<VideoLink['platform'], string> = {
    youtube: 'YT',
    rutube: 'RU',
    vk: 'ВК',
  };
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: 'hsl(var(--rt-chip))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 11,
        fontWeight: 700,
        color: 'hsl(var(--rt-ink-60))',
        flexShrink: 0,
      }}
      aria-hidden
    >
      {labels[platform]}
    </div>
  );
}

function platformLabel(platform: VideoLink['platform']): string {
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
