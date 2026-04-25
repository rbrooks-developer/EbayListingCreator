import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/authService.js';
import styles from './ArticlesSection.module.css';

export default function ArticlesSection() {
  const [articles, setArticles] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from('articles')
      .select('id, title, slug, excerpt, image_url, published_at')
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[ArticlesSection]', error);
        setArticles(data ?? []);
        setLoaded(true);
      })
      .catch((e) => { console.error('[ArticlesSection]', e); setLoaded(true); });
  }, []);

  // Hidden until loaded and at least one article exists
  if (!loaded || articles.length === 0) return null;

  return (
    <section className={styles.section} id="articles">
      <div className={styles.inner}>
        <h2 className={styles.heading}>Featured Articles</h2>
        <div className={styles.grid}>
          {articles.map((article) => (
            <div key={article.id} className={styles.card}>
              {article.image_url && (
                <div className={styles.imageWrap}>
                  <img
                    src={article.image_url}
                    alt={article.title}
                    className={styles.image}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.closest(`.${styles.imageWrap}`).style.display = 'none'; }}
                  />
                </div>
              )}
              <div className={styles.body}>
                <h3 className={styles.title}>{article.title}</h3>
                {article.excerpt && (
                  <p className={styles.excerpt}>{article.excerpt}</p>
                )}
                {article.published_at && (
                  <div className={styles.meta}>
                    <span className={styles.date}>
                      {new Date(article.published_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {article.slug && (
                  <Link to={`/articles/${article.slug}`} className={styles.readMore}>
                    Read more →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
