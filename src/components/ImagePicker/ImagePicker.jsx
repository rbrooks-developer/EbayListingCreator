import styles from './ImagePicker.module.css';

/**
 * ImagePicker
 * Props:
 *  images      — [{ id, name, previewUrl, ebayUrl, status:'uploading'|'ready'|'error', error }]
 *  onAddClick  — () => void   — trigger the shared file input
 *  onRemove    — (id) => void
 *  onSetMain   — (id) => void — moves image to front
 */
export default function ImagePicker({ images = [], onAddClick, onRemove, onSetMain }) {
  return (
    <div className={styles.picker}>
      {images.map((img, idx) => (
        <div
          key={img.id}
          className={`${styles.thumb} ${idx === 0 ? styles.thumbMain : ''}`}
          title={idx === 0 ? 'Main image' : 'Click to set as main'}
        >
          {img.status === 'uploading' ? (
            <div className={styles.thumbSpinner} aria-label="Uploading…" />
          ) : img.status === 'error' ? (
            <div className={styles.thumbErrorIcon} title={img.error}>!</div>
          ) : (
            <img
              src={img.previewUrl}
              alt={img.name}
              className={styles.thumbImg}
              onClick={() => idx !== 0 && onSetMain(img.id)}
            />
          )}

          {idx === 0 && img.status === 'ready' && (
            <span className={styles.mainBadge}>Main</span>
          )}

          <button
            className={styles.removeBtn}
            onClick={() => onRemove(img.id)}
            aria-label={`Remove ${img.name}`}
            title="Remove"
            type="button"
          >
            &#x2715;
          </button>
        </div>
      ))}

      <button
        className={styles.addBtn}
        onClick={onAddClick}
        title="Add images"
        type="button"
      >
        {images.length === 0 ? '+ Images' : '+'}
      </button>
    </div>
  );
}
