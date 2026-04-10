import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '../../services/ebayApi.js';
import styles from './ImageManagerModal.module.css';

const MAX_IMAGES = 24;

/**
 * ImageManagerModal
 * Props:
 *  images        — [{ id, name, previewUrl, ebayUrl, status, error }]
 *  onChange      — (images) => void
 *  accessToken   — string | null
 *  sandbox       — bool
 *  onClose       — () => void
 */
export default function ImageManagerModal({ images, onChange, accessToken, sandbox, onClose }) {
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const dragIndexRef = useRef(null); // index being dragged
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── File picking ────────────────────────────────────────────────────────

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const remaining = MAX_IMAGES - images.length;
    const selected = files.slice(0, remaining);

    const placeholders = selected.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      ebayUrl: '',
      status: 'uploading',
      error: '',
    }));

    onChange([...images, ...placeholders]);

    await Promise.all(
      placeholders.map(async (ph, i) => {
        try {
          const ebayUrl = await uploadImage(accessToken, selected[i], sandbox);
          onChange((prev) =>
            prev.map((img) =>
              img.id !== ph.id ? img : { ...img, ebayUrl, status: 'ready' }
            )
          );
        } catch (err) {
          onChange((prev) =>
            prev.map((img) =>
              img.id !== ph.id ? img : { ...img, status: 'error', error: err.message }
            )
          );
        }
      })
    );
  }

  function removeImage(id) {
    onChange(images.filter((img) => img.id !== id));
  }

  // ── Drag and drop reorder ───────────────────────────────────────────────

  function handleDragStart(e, index) {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    onChange(next);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  const atMax = images.length >= MAX_IMAGES;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Image Manager"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Images</h2>
            <p className={styles.subtitle}>
              {images.length} / {MAX_IMAGES} · Drag to reorder · First image is the main image
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        {/* Grid */}
        <div className={styles.body}>
          <div className={styles.grid}>
            {images.map((img, index) => (
              <div
                key={img.id}
                className={`${styles.tile} ${index === 0 ? styles.tileMain : ''} ${dragOverIndex === index ? styles.tileDragOver : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                {img.status === 'uploading' ? (
                  <div className={styles.tileSpinner} aria-label="Uploading…" />
                ) : img.status === 'error' ? (
                  <div className={styles.tileError} title={img.error}>
                    <span className={styles.tileErrorIcon}>!</span>
                    <span className={styles.tileErrorMsg}>{img.error}</span>
                  </div>
                ) : (
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className={styles.tileImg}
                    draggable={false}
                  />
                )}

                {index === 0 && <span className={styles.mainBadge}>Main</span>}

                <button
                  className={styles.removeBtn}
                  onClick={() => removeImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                  type="button"
                >
                  &#x2715;
                </button>

                <div className={styles.dragHandle} aria-hidden="true">⠿</div>
              </div>
            ))}

            {/* Add tile */}
            {!atMax && (
              <button
                className={styles.addTile}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                title="Add images"
              >
                <span className={styles.addIcon}>+</span>
                <span className={styles.addLabel}>Add Images</span>
              </button>
            )}
          </div>

          {atMax && (
            <p className={styles.maxNote}>Maximum of {MAX_IMAGES} images reached.</p>
          )}

          {images.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>&#128247;</div>
              <p>No images yet. Click "Add Images" to get started.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {!atMax && (
            <button
              className={styles.btnAdd}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              + Add Images
            </button>
          )}
          <button className={styles.btnDone} onClick={onClose} type="button">
            Done
          </button>
        </div>

        {/* Hidden file input — persists so browser remembers last directory */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
