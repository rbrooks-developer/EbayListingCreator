import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '../../services/ebayApi.js';
import styles from './BulkImageModal.module.css';

/**
 * BulkImageModal
 * Props:
 *  listings   — full listings array
 *  onChange   — (updatedListings) => void  — called on Done
 *  accessToken — string | null
 *  sandbox    — bool
 *  maxImages  — number (from tier_limits)
 *  onClose    — () => void
 */
export default function BulkImageModal({ listings, onChange, accessToken, sandbox, maxImages = 24, onClose }) {
  const [imageUpdates, setImageUpdates] = useState(() => new Map());
  const [imagePool, setImagePool] = useState([]);
  const [dragOverId, setDragOverId] = useState(null);
  const [nextRowId, setNextRowId] = useState(null);
  const [thumbDragOverId, setThumbDragOverId] = useState(null); // `${listingId}:${imgId}`
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const rowRefs = useRef(new Map());
  const listingsContainerRef = useRef(null);

  // Derived — merges parent listings with in-session changes
  const localListings = listings.map((l) => ({
    ...l,
    images: imageUpdates.has(l.id) ? imageUpdates.get(l.id) : (l.images ?? []),
  }));

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') handleDone(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDone() {
    onChange(localListings);
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) handleDone();
  }

  // ── Functional updater ────────────────────────────────────────────────────
  function updateListingImages(listingId, updater) {
    setImageUpdates((prev) => {
      const next = new Map(prev);
      const current = next.has(listingId)
        ? next.get(listingId)
        : (listings.find((l) => l.id === listingId)?.images ?? []);
      next.set(listingId, updater(current));
      return next;
    });
  }

  // ── Remove an image from a listing ───────────────────────────────────────
  function handleRemoveImage(listingId, imgId) {
    updateListingImages(listingId, (imgs) => imgs.filter((img) => img.id !== imgId));
  }

  // ── Reorder thumbs via drag-and-drop ──────────────────────────────────────
  function handleThumbDrop(e, listingId, targetImgId) {
    e.preventDefault();
    e.stopPropagation();
    setThumbDragOverId(null);
    const raw = e.dataTransfer.getData('application/x-thumb-reorder');
    if (!raw) return;
    const { listingId: srcListingId, imgId: srcImgId } = JSON.parse(raw);
    if (srcListingId !== listingId || srcImgId === targetImgId) return;
    updateListingImages(listingId, (imgs) => {
      const srcIdx = imgs.findIndex((img) => img.id === srcImgId);
      const dstIdx = imgs.findIndex((img) => img.id === targetImgId);
      if (srcIdx === -1 || dstIdx === -1) return imgs;
      const next = [...imgs];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      return next;
    });
  }

  // ── Add images to the pool ────────────────────────────────────────────────
  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const toDataUrl = (file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    const dataUrls = await Promise.all(files.map(toDataUrl));

    const newItems = files.map((f, i) => ({
      id: crypto.randomUUID(),
      name: f.name,
      previewUrl: dataUrls[i],
      file: f,
    }));

    setImagePool((prev) => [...prev, ...newItems]);
  }

  // ── Drop pool image onto a listing row ────────────────────────────────────
  function handleDrop(e, listingId) {
    e.preventDefault();
    setDragOverId(null);

    // Ignore if this was a thumb-reorder drop (already handled by thumb)
    if (e.dataTransfer.types.includes('application/x-thumb-reorder')) return;

    const imageId = e.dataTransfer.getData('text/plain');
    const poolItem = imagePool.find((img) => img.id === imageId);
    if (!poolItem) return;

    const listing = localListings.find((l) => l.id === listingId);
    if (!listing) return;
    if (listing.images.length >= maxImages) return;

    setImagePool((prev) => prev.filter((img) => img.id !== imageId));

    const placeholder = {
      id: poolItem.id,
      name: poolItem.name,
      previewUrl: poolItem.previewUrl,
      ebayUrl: '',
      status: 'uploading',
      error: '',
    };
    updateListingImages(listingId, (imgs) => [...imgs, placeholder]);

    // Scroll to next row and briefly highlight it
    const currentIndex = localListings.findIndex((l) => l.id === listingId);
    const nextListing = localListings[currentIndex + 1];
    if (nextListing) {
      setNextRowId(nextListing.id);
      setTimeout(() => setNextRowId(null), 1200);
      const nextEl = rowRefs.current.get(nextListing.id);
      const container = listingsContainerRef.current;
      if (nextEl && container) {
        container.scrollTop = nextEl.offsetTop - container.offsetTop - 8;
      }
    }

    uploadImage(accessToken, poolItem.file, sandbox)
      .then((ebayUrl) => {
        updateListingImages(listingId, (imgs) =>
          imgs.map((img) =>
            img.id !== poolItem.id ? img : { ...img, ebayUrl, status: 'ready', previewUrl: '' }
          )
        );
      })
      .catch((err) => {
        const raw = err.message ?? 'Upload failed';
        const isTokenExpiry = /IAF|token.*(expired|invalid)|expired.*token/i.test(raw);
        updateListingImages(listingId, (imgs) =>
          imgs.map((img) =>
            img.id !== poolItem.id ? img : {
              ...img,
              status: 'error',
              error: isTokenExpiry
                ? 'SESSION_EXPIRED: Your eBay session has expired. Remove this image and re-add it, or refresh the page to reconnect.'
                : raw,
            }
          )
        );
      });
  }

  const allAssigned = imagePool.length === 0 && localListings.some((l) => l.images.length > 0);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk Attach Images"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Bulk Attach Images</h2>
            <p className={styles.subtitle}>
              Drag images from the right panel onto a listing · First image is the main photo · Drag thumbs to reorder
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnDone} onClick={handleDone} type="button">Done</button>
            <button className={styles.closeBtn} onClick={handleDone} aria-label="Close" type="button">
              &#x2715;
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>

          {/* Left — Listing rows */}
          <div className={styles.listingsPanel}>
            <div className={styles.panelHeader}>
              Listings <span className={styles.panelCount}>{localListings.length}</span>
            </div>
            <div className={styles.listingRows} ref={listingsContainerRef}>
              {localListings.map((listing, i) => {
                const isFull = listing.images.length >= maxImages;
                const isOver = dragOverId === listing.id && !isFull;
                return (
                  <div
                    key={listing.id}
                    className={`${styles.listingRow} ${isOver ? styles.listingRowOver : ''} ${isFull ? styles.listingRowFull : ''} ${nextRowId === listing.id ? styles.listingRowNext : ''}`}
                    ref={(el) => { if (el) rowRefs.current.set(listing.id, el); else rowRefs.current.delete(listing.id); }}
                    onDragOver={(e) => {
                      // Don't highlight row for thumb-reorder drags
                      if (e.dataTransfer.types.includes('application/x-thumb-reorder')) return;
                      e.preventDefault();
                      if (!isFull) setDragOverId(listing.id);
                    }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => handleDrop(e, listing.id)}
                  >
                    <div className={styles.listingMeta}>
                      <span className={styles.listingIndex}>{i + 1}</span>
                      <div className={styles.listingInfo}>
                        <span className={styles.listingTitle}>
                          {listing.title || `Listing #${i + 1}`}
                        </span>
                        <span className={`${styles.listingCount} ${isFull ? styles.listingCountFull : ''}`}>
                          {isFull
                            ? `Full — ${maxImages}/${maxImages} images`
                            : `${listing.images.length} / ${maxImages} images`}
                        </span>
                      </div>
                    </div>

                    {listing.images.length > 0 && (
                      <div className={styles.thumbStrip}>
                        {listing.images.map((img, idx) => {
                          const isDragTarget = thumbDragOverId === `${listing.id}:${img.id}`;
                          return (
                            <div
                              key={img.id}
                              className={`${styles.thumb} ${idx === 0 ? styles.thumbMain : ''} ${isDragTarget ? styles.thumbDragOver : ''}`}
                              title={idx === 0 ? `Main: ${img.name}` : img.name}
                              draggable={img.status !== 'uploading'}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData(
                                  'application/x-thumb-reorder',
                                  JSON.stringify({ listingId: listing.id, imgId: img.id })
                                );
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(e) => {
                                if (!e.dataTransfer.types.includes('application/x-thumb-reorder')) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setThumbDragOverId(`${listing.id}:${img.id}`);
                              }}
                              onDragLeave={(e) => {
                                e.stopPropagation();
                                setThumbDragOverId((prev) =>
                                  prev === `${listing.id}:${img.id}` ? null : prev
                                );
                              }}
                              onDrop={(e) => handleThumbDrop(e, listing.id, img.id)}
                            >
                              {img.status === 'uploading' ? (
                                <div className={styles.thumbSpinner} />
                              ) : img.status === 'error' ? (
                                <div className={styles.thumbError} title={img.error}>!</div>
                              ) : (
                                <img
                                  src={img.ebayUrl || img.previewUrl}
                                  alt={img.name}
                                  draggable={false}
                                />
                              )}
                              <button
                                className={styles.thumbRemove}
                                onClick={(e) => { e.stopPropagation(); handleRemoveImage(listing.id, img.id); }}
                                aria-label={`Remove ${img.name}`}
                                type="button"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isFull && (
                      <div className={styles.dropHint}>
                        {isOver ? '↓ Release to attach' : 'Drop images here'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className={styles.divider} />

          {/* Right — Image pool */}
          <div className={styles.poolPanel}>
            <div className={styles.panelHeader}>
              Image Pool <span className={styles.panelCount}>{imagePool.length}</span>
              <button
                className={styles.addBtn}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                + Add Images
              </button>
            </div>

            <div className={styles.poolList}>
              {imagePool.length === 0 ? (
                <div className={styles.poolEmpty}>
                  <div className={styles.poolEmptyIcon}>📁</div>
                  <p>
                    {allAssigned
                      ? 'All images have been assigned ✓'
                      : 'Click "+ Add Images" to load your photos, then drag them onto a listing.'}
                  </p>
                  {allAssigned && (
                    <button className={styles.addBtnLarge} onClick={() => fileInputRef.current?.click()} type="button">
                      + Add More Images
                    </button>
                  )}
                </div>
              ) : (
                imagePool.map((img) => (
                  <div
                    key={img.id}
                    className={styles.poolItem}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', img.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div className={styles.poolThumbWrap}>
                      <img src={img.previewUrl} alt={img.name} className={styles.poolThumb} draggable={false} />
                    </div>
                    <span className={styles.poolName}>{img.name}</span>
                    <div className={styles.poolDragHandle} aria-hidden="true">⠿</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
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
  );
}
