import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell } from '@telegram-apps/telegram-ui';
import { getMedia, type MediaItem } from '@/api/client';
import { showBackButton, hideBackButton } from '@/lib/telegram';

/** Полноэкранный просмотр медиа */
const MediaViewer = ({
  item,
  items,
  onClose,
  onPrev,
  onNext,
}: {
  item: MediaItem;
  items: MediaItem[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) => {
  const { t } = useTranslation();
  const currentIndex = items.indexOf(item);
  const isVisual = item.media_type === 'photo' || item.media_type === 'video';

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') onPrev();
    if (e.key === 'ArrowRight') onNext();
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      role="dialog"
      aria-label={t('media.fullscreen')}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.95)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
      tabIndex={0}
    >
      {/* Кнопка закрытия */}
      <button
        onClick={onClose}
        aria-label={t('common.close')}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderRadius: '50%',
          width: 40,
          height: 40,
          fontSize: 20,
          color: '#fff',
          cursor: 'pointer',
          zIndex: 10000,
        }}
      >
        ✕
      </button>

      {/* Навигация */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label={t('media.prev')}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: 44,
            height: 44,
            fontSize: 22,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          ◀
        </button>
      )}

      {currentIndex < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label={t('media.next')}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: 44,
            height: 44,
            fontSize: 22,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          ▶
        </button>
      )}

      {/* Контент */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        {isVisual && item.file_url ? (
          item.media_type === 'video' ? (
            <video
              src={item.file_url}
              controls
              autoPlay
              style={{ maxWidth: '90vw', maxHeight: '70vh', borderRadius: 8 }}
            />
          ) : (
            <img
              src={item.file_url || item.thumbnail_url}
              alt={item.text_content || 'media'}
              style={{ maxWidth: '90vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
            />
          )
        ) : (
          <div style={{
            padding: 24,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#fff',
            textAlign: 'center',
            minWidth: 200,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {item.media_type === 'voice' ? '🎤' : item.media_type === 'audio' ? '🎵' : item.media_type === 'document' ? '📄' : '💬'}
            </div>
            {item.file_url && (
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4FC3F7', textDecoration: 'underline' }}
              >
                {t('media.openFile')}
              </a>
            )}
          </div>
        )}

        {/* Подпись */}
        <div style={{ color: '#fff', marginTop: 12, textAlign: 'center', fontSize: 14 }}>
          <div style={{ fontWeight: 600 }}>{item.author_name}</div>
          {item.text_content && <div style={{ marginTop: 4, opacity: 0.8 }}>{item.text_content}</div>}
          <div style={{ marginTop: 4, opacity: 0.5, fontSize: 12 }}>
            {new Date(item.created_at).toLocaleString()} • {currentIndex + 1}/{items.length}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TeamMediaPage = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    const loadMedia = async () => {
      try {
        const resp = await getMedia({ team: id });
        setMediaItems(resp.results);
      } catch (error) {
        console.error('Failed to load media:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadMedia();
  }, [id]);

  const handleOpenViewer = (index: number) => {
    setViewerIndex(index);
  };

  const handleCloseViewer = () => {
    setViewerIndex(null);
  };

  const handlePrev = () => {
    if (viewerIndex !== null && viewerIndex > 0) {
      setViewerIndex(viewerIndex - 1);
    }
  };

  const handleNext = () => {
    if (viewerIndex !== null && viewerIndex < mediaItems.length - 1) {
      setViewerIndex(viewerIndex + 1);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (mediaItems.length === 0) {
    return (
      <Placeholder
        header={t('brigadier.viewMedia')}
        description={t('brigadier.noMedia')}
      >
        <div style={{ fontSize: '64px' }}>📷</div>
      </Placeholder>
    );
  }

  const mediaTypeIcon: Record<string, string> = {
    photo: '📷',
    video: '🎬',
    voice: '🎤',
    audio: '🎵',
    document: '📄',
    text: '💬',
  };

  return (
    <div>
      <Section header={`${t('brigadier.viewMedia')} (${mediaItems.length})`}>
        {mediaItems.map((item, index) => (
          <Cell
            key={item.id}
            before={<span style={{ fontSize: '24px' }}>{mediaTypeIcon[item.media_type] || '📎'}</span>}
            subtitle={`${item.author_name} • ${new Date(item.created_at).toLocaleTimeString()}`}
            after={item.tag !== 'none' ? (
              <span style={{ fontSize: '12px', color: item.tag === 'problem' ? 'red' : 'orange' }}>
                {item.tag === 'problem' ? '🔴' : '🟡'}
              </span>
            ) : undefined}
            onClick={() => handleOpenViewer(index)}
          >
            {item.text_content || item.media_type}
          </Cell>
        ))}
      </Section>

      {viewerIndex !== null && mediaItems[viewerIndex] && (
        <MediaViewer
          item={mediaItems[viewerIndex]}
          items={mediaItems}
          onClose={handleCloseViewer}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  );
};
